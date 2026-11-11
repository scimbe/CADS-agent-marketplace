import Foundation
import WebKit

/// Account bridge v1 (`DuellHost.account(req)` -> Promise), contract in apps/mdi/src/broker/native.js:
///   {v:1, op:"state"}                  -> {v:1, ok, available, signedIn}
///   {v:1, op:"login"|"logout"}         -> {v:1, ok, signedIn}      (OIDC + PKCE via ASWebAuthenticationSession / revoke)
///   {v:1, op:"api", method, path, body} -> {v:1, ok, status, body} (the shell calls the server with the bearer)
/// The page never sees a token. Only the main frame of the bundled page may ask; paths and host are fixed (AccountRoute);
/// no cookies, no redirects followed, answers capped at 1 MiB.
final class AccountBridge: NSObject, WKScriptMessageHandlerWithReply {
    private weak var auth: AuthService?
    private let session = URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)
    static let maxAnswer = 1_048_576

    init(auth: AuthService) { self.auth = auth }

    func userContentController(_ u: WKUserContentController, didReceive m: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        let refused: [String: Any] = ["v": 1, "ok": false, "error": "refused"]
        guard m.frameInfo.isMainFrame, m.frameInfo.request.url?.isFileURL == true,
              let d = m.body as? [String: Any], (d["v"] as? Int) == 1, let op = d["op"] as? String else { replyHandler(refused, nil); return }
        Task { @MainActor [weak self] in
            guard let self, let auth = self.auth else { replyHandler(refused, nil); return }
            switch op {
            case "state":
                replyHandler(["v": 1, "ok": true, "available": auth.isConfigured, "signedIn": auth.isSignedIn], nil)
            case "login":
                if auth.isConfigured { _ = try? await auth.signIn() }   // cancel or failure: still signed out, the page re-checks
                replyHandler(["v": 1, "ok": auth.isConfigured, "signedIn": auth.isSignedIn], nil)
            case "logout":
                auth.signOut()
                replyHandler(["v": 1, "ok": true, "signedIn": false], nil)
            case "api":
                guard let method = d["method"] as? String, let path = d["path"] as? String, AccountRoute.allowed(method: method, path: path) else { replyHandler(refused, nil); return }
                let token = auth.isSignedIn ? await auth.freshAccessToken() : nil
                guard let req = AccountRoute.request(method: method, path: path, body: d["body"] as? String, bearer: token) else { replyHandler(refused, nil); return }
                do {
                    let (data, resp) = try await self.session.data(for: req)
                    guard let http = resp as? HTTPURLResponse, data.count <= Self.maxAnswer else { replyHandler(["v": 1, "ok": false, "error": "netz"], nil); return }
                    replyHandler(["v": 1, "ok": true, "status": http.statusCode, "body": String(data: data, encoding: .utf8) ?? ""], nil)
                } catch {
                    replyHandler(["v": 1, "ok": false, "error": "netz"], nil)
                }
            default:
                replyHandler(refused, nil)
            }
        }
    }
}

/// A redirect would carry the bearer elsewhere: never follow one (the 3xx reaches the page as a status).
final class NoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest) async -> URLRequest? { nil }
}
