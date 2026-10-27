import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

struct StoredTokens: Codable {
    var accessToken: String
    var refreshToken: String?
    var expiresAt: Date
}

enum AuthError: Error { case cancelled, stateMismatch, tokenEndpoint(Int), invalidResponse }

/// OIDC Authorization Code + PKCE (RFC 7636/8252) with the system browser
/// (ASWebAuthenticationSession), public client, no client secret. Tokens live in the Keychain.
@MainActor
final class AuthService: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published private(set) var isSignedIn: Bool
    private var session: ASWebAuthenticationSession?
    private static let account = "tokens"

    override init() {
        isSignedIn = Keychain.load(account: Self.account) != nil
        super.init()
    }

    private var authEndpoint: URL { URL(string: AppConfig.issuer + "/protocol/openid-connect/auth")! }
    private var tokenEndpoint: URL { URL(string: AppConfig.issuer + "/protocol/openid-connect/token")! }

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
            s.prefersEphemeralWebBrowserSession = false
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

    func signOut() {
        Keychain.delete(account: Self.account)
        isSignedIn = false
    }

    // MARK: Tokens

    /// Synchronous read for the Rust client's token callback (called on a background thread).
    nonisolated static func currentAccessToken() -> String? {
        guard let d = Keychain.load(account: account), let t = try? JSONDecoder().decode(StoredTokens.self, from: d) else { return nil }
        return t.accessToken
    }

    /// Refreshes the access token when it expires within 60 s. Call before each API request.
    func ensureFresh() async {
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
        Keychain.save(try JSONEncoder().encode(stored), account: Self.account)
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
