import Foundation

/// Which server calls the page may ask the shell to make with the account (bridge v1, `DuellHost.account({op:"api"})`).
/// Same rule on Android (`AccountRoute.kt`) and in the shared cases `apps/android/app/src/test/resources/bridge-account-v1.json`.
/// The page names a path; the host is fixed here; the bearer is added by the shell and never shown to the page.
enum AccountRoute {
    static let base = "https://demos-34a13a96.bunsenbrenner.org"
    static let maxBody = 262_144
    private static let post = try! NSRegularExpression(pattern: #"^/api/duell/(ai|profile|credit|deck|mod|bild|stat)(/[a-z0-9-]{1,32}){0,2}$"#)
    private static let adminSegment = try! NSRegularExpression(pattern: #"/(review|admin)(/|$)"#)

    static func allowed(method: String, path: String) -> Bool {
        let r = NSRange(path.startIndex..., in: path)
        switch method {
        case "GET": return path == "/auth/me"
        case "POST": return post.firstMatch(in: path, range: r) != nil && adminSegment.firstMatch(in: path, range: r) == nil
        default: return false
        }
    }

    /// The request for a call from the page, or nil when the page asks for anything else. No cookies; the bearer only when
    /// the person is signed in.
    static func request(method: String, path: String, body: String?, bearer: String?) -> URLRequest? {
        guard allowed(method: method, path: path), let url = URL(string: base + path) else { return nil }
        var r = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 25)
        r.httpMethod = method
        r.httpShouldHandleCookies = false
        if method == "POST" {
            guard let body, body.utf8.count <= maxBody, let data = body.data(using: .utf8),
                  (try? JSONSerialization.jsonObject(with: data)) is [String: Any] else { return nil }
            r.httpBody = data
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        } else if body != nil { return nil }
        if let bearer { r.setValue("Bearer " + bearer, forHTTPHeaderField: "Authorization") }
        return r
    }
}
