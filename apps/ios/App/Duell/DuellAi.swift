import Foundation
import WebKit

/// The page runs from a file with all network blocked (content rule "duell-no-network"). The exceptions it needs, the AI
/// actions, the queue and the report, go through here: fixed host, a fixed list of the page's path names, each mapped to one
/// server path (the server protocol of CADS-DEMO-wrapper), small JSON, no cookies. The page never gets network.
enum DuellAi {
    static let base = "https://demos-34a13a96.bunsenbrenner.org/api/duell"
    /// The page's name -> the server path. "/queue" and "/report" sit next to the AI, the rest below it.
    static let routes: [String: String] = [
        "": "/ai", "/status": "/ai/status", "/interest": "/ai/interest", "/weather": "/ai/weather",
        "/accept": "/ai/accept", "/discard": "/ai/discard", "/queue": "/queue", "/report": "/report",
    ]
    static let maxBody = 2048

    /// The request for a call from the page, or nil when the page asks for anything else.
    static func request(path: String, body: String) -> URLRequest? {
        guard let route = routes[path], !body.isEmpty, body.utf8.count <= maxBody,
              let data = body.data(using: .utf8), (try? JSONSerialization.jsonObject(with: data)) is [String: Any],
              let url = URL(string: base + route) else { return nil }
        var r = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 25)
        r.httpMethod = "POST"
        r.httpBody = data
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpShouldHandleCookies = false
        return r
    }
}

/// `DuellHost.ai(path, body)`: answers the page's promise with { status, body }. Only the main frame of our page may ask.
final class DuellAiBridge: NSObject, WKScriptMessageHandlerWithReply {
    private let session = URLSession(configuration: .ephemeral)

    func userContentController(_ u: WKUserContentController, didReceive m: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard m.frameInfo.isMainFrame, m.frameInfo.request.url?.isFileURL == true,
              let d = m.body as? [String: Any], let path = d["path"] as? String, let body = d["body"] as? String,
              let req = DuellAi.request(path: path, body: body) else { replyHandler(nil, "refused"); return }
        session.dataTask(with: req) { data, resp, err in
            DispatchQueue.main.async {
                guard err == nil, let http = resp as? HTTPURLResponse, let data, let text = String(data: data, encoding: .utf8) else { replyHandler(nil, "network"); return }
                replyHandler(["status": http.statusCode, "body": text], nil)
            }
        }.resume()
    }
}

/// The file tool's relay grant (CADS-DEMO-wrapper `POST /api/duell/relay-grant`): the relay is for paying accounts only, so
/// this one call carries the app's login as `Authorization: Bearer` (the page never sees the token). Fixed host and path,
/// body `{}` or `{"channel":"<64 hex>"}` and nothing else, no cookies, no redirects.
enum DuellRelay {
    static let url = URL(string: DuellAi.base + "/relay-grant")!
    static let maxBody = 512

    static func request(body: String, token: String?) -> URLRequest? {
        guard !body.isEmpty, body.utf8.count <= maxBody, let data = body.data(using: .utf8),
              let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              Set(obj.keys).isSubset(of: ["channel"]) else { return nil }
        if let ch = obj["channel"] {
            guard let s = ch as? String, s.range(of: "^[0-9a-fA-F]{64}$", options: .regularExpression) != nil else { return nil }
        }
        var r = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        r.httpMethod = "POST"
        r.httpBody = data
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpShouldHandleCookies = false
        if let token, !token.isEmpty { r.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        return r
    }
}

/// `DuellHost.relay(id, body)`: the shell asks with a fresh access token (nil when signed out: the server then answers 401,
/// the page goes direct only). Only the main frame of our page may ask; a redirect is never followed (the token stays here).
final class DuellRelayBridge: NSObject, WKScriptMessageHandlerWithReply, URLSessionTaskDelegate {
    private lazy var session = URLSession(configuration: .ephemeral, delegate: self, delegateQueue: nil)
    private let token: () async -> String?

    init(token: @escaping () async -> String?) { self.token = token }

    func userContentController(_ u: WKUserContentController, didReceive m: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard m.frameInfo.isMainFrame, m.frameInfo.request.url?.isFileURL == true,
              let d = m.body as? [String: Any], let body = d["body"] as? String else { replyHandler(nil, "refused"); return }
        Task {
            let t = await token()
            guard let req = DuellRelay.request(body: body, token: t) else { await MainActor.run { replyHandler(nil, "refused") }; return }
            session.dataTask(with: req) { data, resp, err in
                DispatchQueue.main.async {
                    guard err == nil, let http = resp as? HTTPURLResponse, let data, let text = String(data: data, encoding: .utf8) else { replyHandler(nil, "network"); return }
                    replyHandler(["status": http.statusCode, "body": text], nil)
                }
            }.resume()
        }
    }

    func urlSession(_ s: URLSession, task: URLSessionTask, willPerformHTTPRedirection r: HTTPURLResponse, newRequest: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
