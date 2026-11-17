import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

struct StoredTokens: Codable {
    var accessToken: String
    var refreshToken: String?
    var expiresAt: Date
}

enum AuthError: Error { case cancelled, stateMismatch, tokenEndpoint(Int, String?), invalidResponse, storageFailed }

/// One access token per resource server (RFC 9700 §2.3): Keycloak narrows the access token to the scope asked for on a
/// refresh (optional client scopes `ct-api` / `mdi-api`, each with its own audience mapper), the refresh token keeps
/// the full grant. A token for the My Daily Idea wrapper is therefore useless at the control plane and the other way round.
enum Resource: String {
    case controlPlane = "ct-api"     // /me/installations, peer channels (Rust core)
    case myDailyIdea = "mdi-api"     // demos-34a13a96…/api/duell/* via the account bridge
    var scope: String { "openid " + rawValue }
}

/// OIDC Authorization Code + PKCE (RFC 7636/8252) with the system browser
/// (ASWebAuthenticationSession), public client, no client secret. Tokens live in the Keychain.
/// Every request to the token and revocation endpoints carries a DPoP proof (RFC 9449) from a device key made for this
/// sign-in (Secure Enclave where available): Keycloak binds the refresh token to that key (client policy, runbook
/// 2026-11-11-oidc-apps), so a copied refresh token is worthless. The access token stays a bearer token.
@MainActor
final class AuthService: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published private(set) var isSignedIn: Bool
    private var session: ASWebAuthenticationSession?
    private static let account = "tokens"

    private var refreshTasks: [Resource: Task<Void, Never>] = [:]
    /// The wrapper's token lives only in memory (5 min); the control plane's is in the Keychain for the Rust core.
    private var mdiToken: (token: String, expiresAt: Date)?

    override init() {
        // Keychain items survive an app delete/reinstall. Treat the first launch after an install
        // as signed out and drop whatever a previous installation left behind.
        let defaults = UserDefaults.standard
        if !defaults.bool(forKey: "cads.launchedBefore") {
            Keychain.delete(account: Self.account)
            DPoPKeyStore.delete()
            defaults.set(true, forKey: "cads.launchedBefore")
        }
        isSignedIn = Keychain.load(account: Self.account) != nil
        super.init()
    }

    private var authEndpoint: URL { URL(string: AppConfig.issuer + "/protocol/openid-connect/auth")! }
    private var tokenEndpoint: URL { URL(string: AppConfig.issuer + "/protocol/openid-connect/token")! }
    private var revokeEndpoint: URL { URL(string: AppConfig.issuer + "/protocol/openid-connect/revoke")! }

    /// Issuer and client are set (Info.plist); without them there is no sign-in to offer.
    var isConfigured: Bool { AppConfig.issuer.hasPrefix("https://") && !AppConfig.clientId.isEmpty }

    // MARK: Sign in

    func signIn() async throws {
        guard !isSignedIn else { return }   // a second sign-in would replace the device key the refresh token is bound to
        // A new device key for each sign-in; the old one (and anything bound to it) is gone.
        guard DPoPKeyStore.fresh() != nil else { throw AuthError.storageFailed }
        let verifier = Self.randomURLSafe(bytes: 64)
        let challenge = Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
        let state = Self.randomURLSafe(bytes: 24)

        var c = URLComponents(url: authEndpoint, resolvingAgainstBaseURL: false)!
        c.queryItems = [
            .init(name: "client_id", value: AppConfig.clientId),
            .init(name: "response_type", value: "code"),
            .init(name: "redirect_uri", value: AppConfig.redirectURI),
            .init(name: "scope", value: "openid email profile offline_access \(Resource.controlPlane.rawValue) \(Resource.myDailyIdea.rawValue)"),
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
        // The code exchange's access token names both services: keep only the refresh token, then fetch the narrowed one.
        try await tokenRequest([
            "grant_type": "authorization_code", "code": code,
            "redirect_uri": AppConfig.redirectURI, "client_id": AppConfig.clientId,
            "code_verifier": verifier,
        ], for: nil)
        await ensureFresh()
    }

    /// Clears all local token state at once, then revokes the refresh token at Keycloak
    /// (RFC 7009) in the background; a revocation failure never keeps the user signed in locally.
    func signOut() {
        let old = Keychain.load(account: Self.account).flatMap { try? JSONDecoder().decode(StoredTokens.self, from: $0) }
        refreshTasks.values.forEach { $0.cancel() }
        refreshTasks = [:]
        mdiToken = nil
        // The revocation must prove the key the refresh token is bound to: sign before the key is deleted.
        let url = revokeEndpoint
        let proof = DPoPKeyStore.current().flatMap { try? DPoP.proof(key: $0, method: "POST", url: url) }
        Keychain.delete(account: Self.account)
        DPoPKeyStore.delete()
        isSignedIn = false
        guard let refresh = old?.refreshToken else { return }
        Task.detached {
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.timeoutInterval = 15
            req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            if let proof { req.setValue(proof, forHTTPHeaderField: "DPoP") }
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

    /// For the account bridge: a fresh token for the My Daily Idea wrapper only (aud mydailyidea-api), or nil.
    func freshAccessToken() async -> String? {
        await refresh(.myDailyIdea)
        guard isSignedIn, let t = mdiToken, t.expiresAt.timeIntervalSinceNow > 0 else { return nil }
        return t.token
    }

    /// Refreshes the control plane's access token when it expires within 60 s. Call before each API request.
    func ensureFresh() async { await refresh(.controlPlane) }

    /// One refresh per resource at a time: concurrent callers wait for the running one.
    private func refresh(_ r: Resource) async {
        if let running = refreshTasks[r] { await running.value; return }
        let task = Task { await self.refreshIfNeeded(r) }
        refreshTasks[r] = task
        await task.value
        refreshTasks[r] = nil
    }

    private func refreshIfNeeded(_ r: Resource) async {
        guard let d = Keychain.load(account: Self.account), let t = try? JSONDecoder().decode(StoredTokens.self, from: d) else { return }
        let expires = r == .controlPlane ? t.expiresAt : (mdiToken?.expiresAt ?? .distantPast)
        guard expires.timeIntervalSinceNow < 60 else { return }
        guard let refresh = t.refreshToken else { signOut(); return }
        do {
            try await tokenRequest(["grant_type": "refresh_token", "refresh_token": refresh, "client_id": AppConfig.clientId, "scope": r.scope], for: r)
        } catch AuthError.tokenEndpoint(_, let error) where Self.keepsTokens(error) {
            // DPoP proof refused (device clock off, nonce asked): not a revoked grant, keep the tokens and retry later
        } catch AuthError.tokenEndpoint(let status, _) where status == 400 || status == 401 {
            signOut() // invalid_grant: refresh token revoked or expired
        } catch AuthError.storageFailed {
            signOut() // no device key (e.g. signed in before DPoP): the bound refresh token cannot be used
        } catch {
            // transient (offline): keep the tokens, the API call will report the error
        }
    }

    /// Token endpoint errors that do not mean the grant is gone (RFC 9449 §8: `use_dpop_nonce`; `invalid_dpop_proof`
    /// mostly from a device clock outside the server's window).
    nonisolated static func keepsTokens(_ error: String?) -> Bool {
        error == "invalid_dpop_proof" || error == "use_dpop_nonce"
    }

    /// `for`: which resource the narrowed access token is for; nil for the code exchange (its token is not kept).
    private func tokenRequest(_ form: [String: String], for resource: Resource?) async throws {
        var req = URLRequest(url: tokenEndpoint)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        guard let key = DPoPKeyStore.current() else { throw AuthError.storageFailed }
        req.setValue(try DPoP.proof(key: key, method: "POST", url: tokenEndpoint), forHTTPHeaderField: "DPoP")
        var body = URLComponents()
        body.queryItems = form.map { URLQueryItem(name: $0.key, value: $0.value) }
        req.httpBody = body.percentEncodedQuery?.data(using: .utf8)
        let (data, resp) = try await URLSession.shared.data(for: req) // ATS enforces TLS
        guard let http = resp as? HTTPURLResponse else { throw AuthError.invalidResponse }
        guard http.statusCode == 200 else {
            struct E: Decodable { let error: String? }
            throw AuthError.tokenEndpoint(http.statusCode, (try? JSONDecoder().decode(E.self, from: data))?.error)
        }
        struct R: Decodable { let access_token: String; let refresh_token: String?; let expires_in: Double? }
        let r = try JSONDecoder().decode(R.self, from: data)
        let old = Keychain.load(account: Self.account).flatMap { try? JSONDecoder().decode(StoredTokens.self, from: $0) }
        let expiry = Date().addingTimeInterval(r.expires_in ?? 300)
        if resource == .myDailyIdea { mdiToken = (r.access_token, expiry) }
        let stored = StoredTokens(accessToken: resource == .controlPlane ? r.access_token : (old?.accessToken ?? ""),
                                  refreshToken: r.refresh_token ?? old?.refreshToken,
                                  expiresAt: resource == .controlPlane ? expiry : (old?.expiresAt ?? .distantPast))
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
