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

final class DuellRelayTests: XCTestCase {
    private let ch = String(repeating: "ab", count: 32)

    func testFixedPathBearerNoCookies() {
        let r = DuellRelay.request(body: #"{"channel":"\#(ch)"}"#, token: "tok")
        XCTAssertEqual(r?.url?.absoluteString, "https://demos-34a13a96.bunsenbrenner.org/api/duell/relay-grant")
        XCTAssertEqual(r?.httpMethod, "POST")
        XCTAssertEqual(r?.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
        XCTAssertEqual(r?.httpShouldHandleCookies, false)
        XCTAssertNotNil(DuellRelay.request(body: "{}", token: "tok"))
    }

    func testSignedOutSendsNoAuthorization() {
        XCTAssertNil(DuellRelay.request(body: "{}", token: nil)?.value(forHTTPHeaderField: "Authorization"))
        XCTAssertNil(DuellRelay.request(body: "{}", token: "")?.value(forHTTPHeaderField: "Authorization"))
    }

    func testOnlyChannelAllowed() {
        for b in ["", "[]", "kein json", #"{"channel":"xyz"}"#, #"{"channel":1}"#, #"{"name":"urlaub.jpg"}"#, #"{"channel":"\#(ch)","x":1}"#,
                  "{\"channel\":\"" + String(repeating: "a", count: 600) + "\"}"] {
            XCTAssertNil(DuellRelay.request(body: b, token: "tok"), b)
        }
    }
}
