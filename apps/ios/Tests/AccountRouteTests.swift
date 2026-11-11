import XCTest

/// Same cases as apps/android/app/src/test/resources/bridge-account-v1.json (Android reads the file in AccountRouteTest).
final class AccountRouteTests: XCTestCase {
    static let cases: [(String, String, Bool)] = [
        ("GET", "/auth/me", true),
        ("POST", "/api/duell/ai/status", true),
        ("POST", "/api/duell/ai", true),
        ("POST", "/api/duell/profile/get", true),
        ("POST", "/api/duell/profile/put", true),
        ("POST", "/api/duell/profile/delete", true),
        ("POST", "/api/duell/credit/redeem", true),
        ("POST", "/api/duell/mod/me", true),
        ("POST", "/api/duell/mod/appeal", true),
        ("POST", "/api/duell/deck/use", true),
        ("POST", "/api/duell/bild/new", true),
        ("POST", "/api/duell/stat", true),
        ("POST", "/auth/me", false),
        ("GET", "/api/duell/ai/status", false),
        ("GET", "/auth/login", false),
        ("GET", "/auth/me?return=/x", false),
        ("POST", "/api/duell/report", false),
        ("POST", "/api/duell/metrics", false),
        ("POST", "/api/duell/deck/review", false),
        ("POST", "/api/duell/deck/review/abc", false),
        ("POST", "/api/duell/admin/stat", false),
        ("POST", "/api/duell/config", false),
        ("POST", "/api/start", false),
        ("POST", "/api/duell/ai/../../start", false),
        ("POST", "/api/duell/ai/status?x=1", false),
        ("POST", "//evil.example/api/duell/ai", false),
        ("POST", "https://evil.example/api/duell/ai", false),
        ("POST", "/api/duell/AI/status", false),
        ("POST", "/api/duell/ai/a/b/c", false),
        ("DELETE", "/api/duell/profile/delete", false),
        ("PUT", "/api/duell/profile/put", false)
    ]

    func testSharedRouteCases() {
        for (m, p, ok) in Self.cases { XCTAssertEqual(AccountRoute.allowed(method: m, path: p), ok, m + " " + p) }
    }

    func testRequestFixedHostNoCookiesBearerOnlyWhenSignedIn() {
        let r = AccountRoute.request(method: "POST", path: "/api/duell/ai/status", body: #"{"device":"x"}"#, bearer: "tok")
        XCTAssertEqual(r?.url?.absoluteString, "https://demos-34a13a96.bunsenbrenner.org/api/duell/ai/status")
        XCTAssertEqual(r?.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
        XCTAssertEqual(r?.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertEqual(r?.httpShouldHandleCookies, false)
        let anon = AccountRoute.request(method: "POST", path: "/api/duell/ai/status", body: "{}", bearer: nil)
        XCTAssertNil(anon?.value(forHTTPHeaderField: "Authorization"))
        let me = AccountRoute.request(method: "GET", path: "/auth/me", body: nil, bearer: "tok")
        XCTAssertNil(me?.httpBody)
    }

    func testBodyRules() {
        XCTAssertNil(AccountRoute.request(method: "POST", path: "/api/duell/ai/status", body: nil, bearer: nil))
        XCTAssertNil(AccountRoute.request(method: "POST", path: "/api/duell/ai/status", body: "[1]", bearer: nil))
        XCTAssertNil(AccountRoute.request(method: "POST", path: "/api/duell/ai/status", body: "kein json", bearer: nil))
        XCTAssertNil(AccountRoute.request(method: "GET", path: "/auth/me", body: "{}", bearer: nil))
        let big = "{\"a\":\"" + String(repeating: "x", count: AccountRoute.maxBody) + "\"}"
        XCTAssertNil(AccountRoute.request(method: "POST", path: "/api/duell/profile/put", body: big, bearer: nil))
    }
}
