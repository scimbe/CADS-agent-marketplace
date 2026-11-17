import Foundation
import UIKit
import WebKit

/// When the person last tapped the page (native recognizer, cannot be faked by page script).
final class UserGesture: NSObject, UIGestureRecognizerDelegate {
    private(set) var last: TimeInterval = -.infinity
    func attach(to view: UIView) {
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped))
        tap.cancelsTouchesInView = false
        tap.delaysTouchesEnded = false
        tap.delegate = self
        view.addGestureRecognizer(tap)
    }
    @objc private func tapped() { last = ProcessInfo.processInfo.systemUptime }
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
    /// A tap within the last `seconds`.
    func recent(_ seconds: TimeInterval = 5) -> Bool { ProcessInfo.processInfo.systemUptime - last <= seconds }
}

/// Account bridge v1 (`DuellHost.account(req)` -> Promise), contract in apps/mdi/src/broker/native.js:
///   {v:1, op:"state"}                  -> {v:1, ok, available, signedIn}
///   {v:1, op:"login"|"logout"}         -> {v:1, ok, signedIn}      (OIDC + PKCE via ASWebAuthenticationSession / revoke)
///   {v:1, op:"api", method, path, body} -> {v:1, ok, status, body} (the shell calls the server with the bearer)
/// The page never sees a token. Only the main frame of the bundled page may ask; paths and host are fixed (AccountRoute);
/// no cookies, no redirects followed, answers capped at 1 MiB while reading. `login` only right after a tap on the page
/// (native gesture) and never twice at once or within 3 s, so a page script cannot pop the sign-in sheet on its own.
final class AccountBridge: NSObject, WKScriptMessageHandlerWithReply {
    private weak var auth: AuthService?
    private let gesture: UserGesture
    private let session = URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)
    private var loginRunning = false
    private var lastLogin: TimeInterval = -.infinity
    static let maxAnswer = 1_048_576

    init(auth: AuthService, gesture: UserGesture) { self.auth = auth; self.gesture = gesture }

    /// Reads at most `maxAnswer` bytes; nil when the answer is larger (the rest is never read).
    static func capped(_ bytes: URLSession.AsyncBytes, expected: Int64) async throws -> Data? {
        if expected > Int64(maxAnswer) { return nil }
        var out = Data()
        for try await b in bytes {
            if out.count >= maxAnswer { return nil }
            out.append(b)
        }
        return out
    }

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
                let now = ProcessInfo.processInfo.systemUptime
                guard !self.loginRunning, now - self.lastLogin >= 3, self.gesture.recent() else { replyHandler(refused, nil); return }
                self.loginRunning = true; self.lastLogin = now
                defer { self.loginRunning = false }
                // already signed in: signIn() returns at once (the device key the refresh token is bound to stays)
                if auth.isConfigured { _ = try? await auth.signIn() }   // cancel or failure: still signed out
                replyHandler(["v": 1, "ok": auth.isConfigured, "signedIn": auth.isSignedIn], nil)
            case "logout":
                auth.signOut()
                replyHandler(["v": 1, "ok": true, "signedIn": false], nil)
            case "api":
                guard let method = d["method"] as? String, let path = d["path"] as? String, AccountRoute.allowed(method: method, path: path) else { replyHandler(refused, nil); return }
                let token = auth.isSignedIn ? await auth.freshAccessToken() : nil
                guard let req = AccountRoute.request(method: method, path: path, body: d["body"] as? String, bearer: token) else { replyHandler(refused, nil); return }
                do {
                    let (bytes, resp) = try await self.session.bytes(for: req)
                    guard let http = resp as? HTTPURLResponse, let data = try await Self.capped(bytes, expected: resp.expectedContentLength) else {
                        replyHandler(["v": 1, "ok": false, "error": "netz"], nil); return
                    }
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
