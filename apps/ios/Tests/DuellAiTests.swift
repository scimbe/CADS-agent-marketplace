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

    func testQueueSettleAndReportUseTheServerPaths() {
        let host = "https://demos-34a13a96.bunsenbrenner.org/api/duell"
        let want = ["": "/ai", "/queue": "/queue", "/accept": "/ai/accept", "/discard": "/ai/discard", "/report": "/report"]
        for (page, server) in want {
            XCTAssertEqual(DuellAi.request(path: page, body: "{}")?.url?.absoluteString, host + server, page)
        }
        for p in ["/wait", "/confirm", "/cancel", "/ai", "/seal", "/queue/x"] {
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
