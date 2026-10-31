import Foundation
import WebKit

/// The page runs from a file with all network blocked (content rule "duell-no-network"). The one exception it needs,
/// the AI actions, goes through here: fixed host, three fixed paths, small JSON, no cookies. The page never gets network.
enum DuellAi {
    static let base = "https://demos-34a13a96.bunsenbrenner.org/api/duell/ai"
    static let paths: Set<String> = ["", "/status", "/interest", "/weather"]
    static let maxBody = 2048

    /// The request for a call from the page, or nil when the page asks for anything else.
    static func request(path: String, body: String) -> URLRequest? {
        guard paths.contains(path), !body.isEmpty, body.utf8.count <= maxBody,
              let data = body.data(using: .utf8), (try? JSONSerialization.jsonObject(with: data)) is [String: Any],
              let url = URL(string: base + path) else { return nil }
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
