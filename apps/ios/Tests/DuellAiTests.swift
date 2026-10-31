import XCTest

final class DuellAiTests: XCTestCase {
    func testOnlyFixedPathsOnTheFixedHost() {
        let r = DuellAi.request(path: "/status", body: #"{"device":"x"}"#)
        XCTAssertEqual(r?.url?.absoluteString, "https://demos-34a13a96.bunsenbrenner.org/api/duell/ai/status")
        XCTAssertEqual(r?.httpMethod, "POST")
        XCTAssertEqual(r?.httpShouldHandleCookies, false)
        XCTAssertNotNil(DuellAi.request(path: "", body: "{}"))
        for p in ["/config", "/../config", "//evil.example", "https://evil.example", "/status?x=1"] {
            XCTAssertNil(DuellAi.request(path: p, body: "{}"), p)
        }
    }

    func testBodyMustBeSmallJsonObject() {
        XCTAssertNil(DuellAi.request(path: "", body: ""))
        XCTAssertNil(DuellAi.request(path: "", body: "kein json"))
        XCTAssertNil(DuellAi.request(path: "", body: "[1]"))
        XCTAssertNil(DuellAi.request(path: "", body: "{\"a\":\"" + String(repeating: "x", count: 3000) + "\"}"))
    }
}
