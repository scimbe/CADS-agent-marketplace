import XCTest

final class PeerBridgeTests: XCTestCase {
    private let frag = String(repeating: "abcDEF012-_", count: 10)
    private var core: String { "https://bunsenbrenner.org/p#\(frag)" }
    private var shared: String { "https://bunsenbrenner.org/duell#p=\(frag)" }

    private final class Conn: PeerConnection, @unchecked Sendable {
        var queue: [PeerIn?]; var left = 0; var declined: [UInt64] = []; var sent: [String] = []; var onNext: (() -> Void)?
        let code = "1234 5678"; let contact = "pinned"
        init(_ q: [PeerIn?]) { queue = q }
        func send(ns: String, body: String) { sent.append(body) }
        func leave() { left += 1 }
        func decline(id: UInt64) { declined.append(id) }
        func next(waitMs: UInt64) -> PeerIn? { if let f = onNext { f(); return nil }; return queue.isEmpty ? .closed : queue.removeFirst() }
    }
    private final class Port: PeerPort, @unchecked Sendable {
        var conns: [Any]; var failAccept: String?; var accepted: [String] = []; var revoked: [String] = []
        init(_ c: [Any], failAccept: String? = nil) { conns = c; self.failAccept = failAccept }
        func invite(token: String) throws -> (link: String, contact: String) { ("https://bunsenbrenner.org/p#" + String(repeating: "abcDEF012-_", count: 10), "secret") }
        func accept(coreLink: String) throws -> String { if let f = failAccept { throw PeerFailure(code: f) }; accepted.append(coreLink); return "secret" }
        func connect(contact: String, waitSecs: UInt64) throws -> PeerConnection {
            guard !conns.isEmpty else { throw PeerFailure(code: "failed") }
            let c = conns.removeFirst(); if let f = c as? PeerFailure { throw f }; return c as! PeerConnection
        }
        func revoke(contact: String) { revoked.append(contact) }
    }
    private final class Sink: @unchecked Sendable { var out: [String] = [] }
    private func bridge(_ p: PeerPort?, _ s: Sink, token: String? = "tok", now: @escaping () -> TimeInterval = { 0 }) -> PeerBridge {
        PeerBridge(port: p, token: { token }, emit: { s.out.append($0) }, spawn: { $0() }, now: now)
    }

    func testInviteShowsTheDuellLinkAndConnects() {
        let s = Sink(); bridge(Port([Conn([.peerLeft])]), s).invite()
        XCTAssertEqual(s.out, [PeerJson.invite(shared), PeerJson.connected("1234 5678"), PeerJson.peerLeft])
    }
    func testNoAccountMeansLogin() {
        let s = Sink(); bridge(Port([]), s, token: nil).invite()
        XCTAssertEqual(s.out, [PeerJson.error("login")])
    }
    func testAcceptPassesTheCoreFormAndReportsAUsedLink() {
        let s = Sink(); bridge(Port([], failAccept: "used"), s).accept(shared)
        XCTAssertEqual(s.out, [PeerJson.error("used")])
        let p = Port([Conn([.peerLeft])]); bridge(p, Sink()).accept(shared)
        XCTAssertEqual(p.accepted, [core])
    }
    func testForeignLinksNeverReachTheCore() {
        let p = Port([]), s = Sink(), b = bridge(p, s)
        for l in [nil, "https://evil.example/duell#p=\(frag)", "https://bunsenbrenner.org/duell#c=abc", "https://bunsenbrenner.org/duell#p=short", "http://bunsenbrenner.org/duell#p=\(frag)"] { b.accept(l) }
        XCTAssertTrue(p.accepted.isEmpty); XCTAssertTrue(s.out.allSatisfy { $0 == PeerJson.error("invalid") })
    }
    func testOnlyOurNamespaceReachesThePage() {
        let c = Conn([.ignored, .app(ns: "other", body: "{}"), .app(ns: PeerBridge.ns, body: "{\"v\":1}"), .approval(7), nil, .peerLeft]), s = Sink()
        bridge(Port([c]), s).accept(shared)
        XCTAssertEqual(s.out, [PeerJson.connected("1234 5678"), PeerJson.message("{\"v\":1}"), PeerJson.peerLeft])
        XCTAssertEqual(c.declined, [7])
    }
    func testALostLinkReconnects() {
        let s = Sink()
        bridge(Port([Conn([.closed]), PeerFailure(code: "network"), Conn([.peerLeft])]), s).accept(shared)
        XCTAssertEqual(s.out, [PeerJson.connected("1234 5678"), PeerJson.reconnecting, PeerJson.connected("1234 5678"), PeerJson.peerLeft])
    }
    func testNobodyComesEndsOffline() {
        var t: TimeInterval = 0; let s = Sink()
        bridge(Port([PeerFailure(code: "offline"), PeerFailure(code: "offline"), PeerFailure(code: "offline")]), s, now: { defer { t += PeerBridge.waitAccept }; return t }).accept(shared)
        XCTAssertEqual(s.out.last, PeerJson.error("offline"))
    }
    func testLeavingAsInviterRevokesAsInviteeOnlySaysBye() {
        for inviter in [true, false] {
            let c = Conn([]), p = Port([c]), s = Sink(); var b: PeerBridge!
            c.onNext = { b.leave() }
            b = bridge(p, s)
            if inviter { b.invite() } else { b.accept(shared) }
            XCTAssertEqual(c.left, 1); XCTAssertEqual(p.revoked, inviter ? ["pinned"] : [])
        }
    }
    func testWithoutProductionValuesNothingIsReady() {
        XCTAssertFalse(bridge(nil, Sink()).ready)
    }
    func testTheCallIntoThePageIsAClosedLiteral() {
        let s = PeerJson.call("\"});alert(1)//\u{2028}\n")
        XCTAssertFalse(s.contains("\u{2028}")); XCTAssertFalse(s.contains("\n"))
        XCTAssertTrue(s.contains(#"\"});alert(1)//\u2028\u000a"#))
    }
    func testLinkFormsMapBothWays() {
        XCTAssertEqual(DuellLink.shareLink(core), shared); XCTAssertEqual(DuellLink.coreLink(shared), core)
        XCTAssertNil(DuellLink.shareLink("https://evil.example/p#\(frag)")); XCTAssertNil(DuellLink.coreLink(core))
        XCTAssertTrue(DuellLink.isShareable(shared))
    }
}
