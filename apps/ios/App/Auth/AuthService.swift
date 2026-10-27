import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

struct StoredTokens: Codable {
    var accessToken: String
    var refreshToken: String?
    var expiresAt: Date
}

enum AuthError: Error { case cancelled, stateMismatch, tokenEndpoint(Int), invalidResponse, storageFailed }

/// OIDC Authorization Code + PKCE (RFC 7636/8252) with the system browser
/// (ASWebAuthenticationSession), public client, no client secret. Tokens live in the Keychain.
@MainActor
final class AuthService: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published private(set) var isSignedIn: Bool
    private var session: ASWebAuthenticationSession?
    private static let account = "tokens"

    private var refreshTask: Task<Void, Never>?

    override init() {
        // Keychain items survive an app delete/reinstall. Treat the first launch after an install
        // as signed out and drop whatever a previous installation left behind.
        let defaults = UserDefaults.standard
        if !defaults.bool(forKey: "cads.launchedBefore") {
            Keychain.delete(account: Self.account)
            defaults.set(true, forKey: "cads.launchedBefore")
        }
        isSignedIn = Keychain.load(account: Self.account) != nil
        super.init()
    }

    private var authEndpoint: URL { URL(string: AppConfig.issuer + "/protocol/openid-connect/auth")! }
    private var tokenEndpoint: URL { URL(string: AppConfig.issuer + "/protocol/openid-connect/token")! }
    private var revokeEndpoint: URL { URL(string: AppConfig.issuer + "/protocol/openid-connect/revoke")! }

    // MARK: Sign in

    func signIn() async throws {
        let verifier = Self.randomURLSafe(bytes: 64)
        let challenge = Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
        let state = Self.randomURLSafe(bytes: 24)

        var c = URLComponents(url: authEndpoint, resolvingAgainstBaseURL: false)!
        c.queryItems = [
            .init(name: "client_id", value: AppConfig.clientId),
            .init(name: "response_type", value: "code"),
            .init(name: "redirect_uri", value: AppConfig.redirectURI),
            .init(name: "scope", value: "openid email profile offline_access"),
            .init(name: "state", value: state),
            .init(name: "code_challenge", value: challenge),
            .init(name: "code_challenge_method", value: "S256"),
        ]
        let callback: URL = try await withCheckedThrowingContinuation { cont in
            let s = ASWebAuthenticationSession(url: c.url!, callbackURLScheme: AppConfig.redirectScheme) { url, error in
                if let url { cont.resume(returning: url) } else { cont.resume(throwing: error ?? AuthError.cancelled) }
            }
            s.presentationContextProvider = self
            // Ephemeral: no Keycloak SSO cookie is left in Safari, so signing out here really ends the
            // browser session as well (no end_session round trip needed).
            s.prefersEphemeralWebBrowserSession = true
            self.session = s
            if !s.start() { cont.resume(throwing: AuthError.cancelled) }
        }
        session = nil
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard items.first(where: { $0.name == "state" })?.value == state else { throw AuthError.stateMismatch }
        guard let code = items.first(where: { $0.name == "code" })?.value else { throw AuthError.cancelled }
        try await tokenRequest([
            "grant_type": "authorization_code", "code": code,
            "redirect_uri": AppConfig.redirectURI, "client_id": AppConfig.clientId,
            "code_verifier": verifier,
        ])
    }

    /// Clears all local token state at once, then revokes the refresh token at Keycloak
    /// (RFC 7009) in the background; a revocation failure never keeps the user signed in locally.
    func signOut() {
        let old = Keychain.load(account: Self.account).flatMap { try? JSONDecoder().decode(StoredTokens.self, from: $0) }
        refreshTask?.cancel()
        refreshTask = nil
        Keychain.delete(account: Self.account)
        isSignedIn = false
        guard let refresh = old?.refreshToken else { return }
        let url = revokeEndpoint
        Task.detached {
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.timeoutInterval = 15
            req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            var body = URLComponents()
            body.queryItems = [.init(name: "token", value: refresh), .init(name: "token_type_hint", value: "refresh_token"),
                               .init(name: "client_id", value: AppConfig.clientId)]
            req.httpBody = body.percentEncodedQuery?.data(using: .utf8)
            _ = try? await URLSession.shared.data(for: req)
        }
    }

    // MARK: Tokens

    /// Synchronous read for the Rust client's token callback (called on a background thread).
    nonisolated static func currentAccessToken() -> String? {
        guard let d = Keychain.load(account: account), let t = try? JSONDecoder().decode(StoredTokens.self, from: d) else { return nil }
        return t.accessToken
    }

    /// Refreshes the access token when it expires within 60 s. Call before each API request.
    func ensureFresh() async {
        // One refresh at a time: concurrent callers wait for the running one. With refresh-token
        // rotation a second parallel refresh would present an already-used token and sign the user out.
        if let running = refreshTask { await running.value; return }
        let task = Task { await self.refreshIfNeeded() }
        refreshTask = task
        await task.value
        refreshTask = nil
    }

    private func refreshIfNeeded() async {
        guard let d = Keychain.load(account: Self.account), let t = try? JSONDecoder().decode(StoredTokens.self, from: d) else { return }
        guard t.expiresAt.timeIntervalSinceNow < 60 else { return }
        guard let refresh = t.refreshToken else { signOut(); return }
        do {
            try await tokenRequest(["grant_type": "refresh_token", "refresh_token": refresh, "client_id": AppConfig.clientId])
        } catch AuthError.tokenEndpoint(let status) where status == 400 || status == 401 {
            signOut() // refresh token revoked or expired
        } catch {
            // transient (offline): keep the tokens, the API call will report the error
        }
    }

    private func tokenRequest(_ form: [String: String]) async throws {
        var req = URLRequest(url: tokenEndpoint)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var body = URLComponents()
        body.queryItems = form.map { URLQueryItem(name: $0.key, value: $0.value) }
        req.httpBody = body.percentEncodedQuery?.data(using: .utf8)
        let (data, resp) = try await URLSession.shared.data(for: req) // ATS enforces TLS
        guard let http = resp as? HTTPURLResponse else { throw AuthError.invalidResponse }
        guard http.statusCode == 200 else { throw AuthError.tokenEndpoint(http.statusCode) }
        struct R: Decodable { let access_token: String; let refresh_token: String?; let expires_in: Double? }
        let r = try JSONDecoder().decode(R.self, from: data)
        let old = Keychain.load(account: Self.account).flatMap { try? JSONDecoder().decode(StoredTokens.self, from: $0) }
        let stored = StoredTokens(accessToken: r.access_token,
                                  refreshToken: r.refresh_token ?? old?.refreshToken,
                                  expiresAt: Date().addingTimeInterval(r.expires_in ?? 300))
        guard Keychain.save(try JSONEncoder().encode(stored), account: Self.account) else {
            Keychain.delete(account: Self.account)
            isSignedIn = false
            throw AuthError.storageFailed
        }
        isSignedIn = true
    }

    // MARK: Helpers

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
        }
    }

    private static func randomURLSafe(bytes n: Int) -> String {
        var b = [UInt8](repeating: 0, count: n)
        _ = SecRandomCopyBytes(kSecRandomDefault, n, &b)
        return base64URL(Data(b))
    }

    private static func base64URL(_ d: Data) -> String {
        d.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}
