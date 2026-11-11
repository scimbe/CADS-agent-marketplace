import Foundation

/// Which server calls the page may ask the shell to make with the account (bridge v1, `DuellHost.account({op:"api"})`):
/// exactly the entries of `AccountRoutes.allowed`, generated with Android's `AccountRoutes.ALLOWED` from
/// `apps/android/app/src/test/resources/bridge-account-v1.json` by `apps/gen-account-routes.py`. No prefixes, no patterns.
/// The page names a path; the host is fixed here; the bearer is added by the shell and never shown to the page.
enum AccountRoute {
    static let base = "https://demos-34a13a96.bunsenbrenner.org"
    static let maxBody = 262_144
    static func allowed(method: String, path: String) -> Bool {
        AccountRoutes.allowed.contains(method + " " + path)
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
