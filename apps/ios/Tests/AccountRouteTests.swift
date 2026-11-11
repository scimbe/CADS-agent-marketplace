import XCTest

/// Cases generated from apps/android/app/src/test/resources/bridge-account-v1.json (AccountRouteCases.generated.swift).
final class AccountRouteTests: XCTestCase {
    func testSharedRouteCases() {
        for (m, p, ok) in AccountRouteCases.all { XCTAssertEqual(AccountRoute.allowed(method: m, path: p), ok, m + " " + p) }
    }

    func testExactListOfTwelve() {
        XCTAssertEqual(AccountRoutes.allowed.count, 12)
        XCTAssertEqual(Set(AccountRouteCases.all.filter { $0.2 }.map { $0.0 + " " + $0.1 }), AccountRoutes.allowed)
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
