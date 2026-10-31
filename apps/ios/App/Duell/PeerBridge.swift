import Foundation

/// What the shared channel core can do, narrowed to "Zusammen bauen". `PeerCoreAdapter` binds it to mobile-core.
protocol PeerPort: Sendable {
    func invite(token: String) throws -> (link: String, contact: String)
    func accept(coreLink: String) throws -> String
    func connect(contact: String, waitSecs: UInt64) throws -> PeerConnection
    func revoke(contact: String) throws
}

protocol PeerConnection: AnyObject, Sendable {
    var code: String { get }
    var contact: String { get }
    func send(ns: String, body: String) throws
    func leave() throws
    func decline(id: UInt64) throws
    func next(waitMs: UInt64) -> PeerIn?
}

enum PeerIn: Equatable { case app(ns: String, body: String), approval(UInt64), peerLeft, closed, ignored }

/// `code` is the closed set the page understands: login, used, expired, invalid, offline, failed. `network` stays here.
struct PeerFailure: Error, Equatable { let code: String }

/// The session behind `DuellHost.peer*`. Only structured frames of one namespace pass; free text and capability
/// requests stop here. The contact stays in memory, nothing is logged. Blocking calls run on `spawn`.
final class PeerBridge: @unchecked Sendable {
    static let ns = "mdi.collab.v1"
    static let maxFrame = 16 * 1024
    static let joinSecs: UInt64 = 15
    static let pollMs: UInt64 = 300
    static let waitInvite: TimeInterval = 600, waitAccept: TimeInterval = 60, waitReconnect: TimeInterval = 120

    private let port: PeerPort?
    private let token: () -> String?
    private let emit: (String) -> Void
    private let spawn: (@escaping @Sendable () -> Void) -> Void
    private let now: () -> TimeInterval
    private let lock = NSLock()
    private var generation = 0
    private var live: PeerConnection?
    private var contact: String?
    private var inviter = false

    init(port: PeerPort?, token: @escaping () -> String?, emit: @escaping (String) -> Void,
         spawn: @escaping (@escaping @Sendable () -> Void) -> Void, now: @escaping () -> TimeInterval = { Date().timeIntervalSince1970 }) {
        self.port = port; self.token = token; self.emit = emit; self.spawn = spawn; self.now = now
    }

    var ready: Bool { port != nil }

    private func locked<T>(_ f: () -> T) -> T { lock.lock(); defer { lock.unlock() }; return f() }
    private func stale(_ gen: Int) -> Bool { locked { gen != generation } }

    func invite() {
        guard let core = port else { return }
        let gen = begin()
        spawn { [self] in
            do {
                guard let bearer = token() else { throw PeerFailure(code: "login") }
                let made = try core.invite(token: bearer)
                guard let shared = DuellLink.shareLink(made.link) else { throw PeerFailure(code: "failed") }
                let fresh = locked { () -> Bool in guard gen == generation else { return false }; contact = made.contact; inviter = true; return true }
                guard fresh else { return }
                emit(PeerJson.invite(shared))
                run(core, gen, made.contact, Self.waitInvite)
            } catch { failed(gen, (error as? PeerFailure)?.code ?? "failed") }
        }
    }

    func accept(_ link: String?) {
        guard let core = port else { return }
        guard let coreLink = DuellLink.coreLink(link) else { emit(PeerJson.error("invalid")); return }
        let gen = begin()
        spawn { [self] in
            do {
                let secret = try core.accept(coreLink: coreLink)
                let fresh = locked { () -> Bool in guard gen == generation else { return false }; contact = secret; inviter = false; return true }
                guard fresh else { return }
                run(core, gen, secret, Self.waitAccept)
            } catch { failed(gen, (error as? PeerFailure)?.code ?? "failed") }
        }
    }

    func send(_ frame: String?) {
        guard let frame, !frame.isEmpty, frame.utf8.count <= Self.maxFrame, let c = locked({ live }) else { return }
        spawn { try? c.send(ns: Self.ns, body: frame) }
    }

    /// "Verlassen": tells the peer while connected. The inviter also revokes the grant, which needs no login.
    func leave() {
        let (c, secret, revoke) = locked { () -> (PeerConnection?, String?, Bool) in
            generation += 1
            defer { live = nil; contact = nil; inviter = false }
            return (live, contact, inviter)
        }
        guard let core = port, c != nil || secret != nil else { return }
        spawn {
            try? c?.leave()
            if revoke, let secret { try? core.revoke(contact: secret) }
        }
    }

    private func begin() -> Int { leave(); return locked { generation } }
    private func failed(_ gen: Int, _ code: String) {
        guard !stale(gen) else { return }
        locked { contact = nil }
        emit(PeerJson.error(code))
    }

    private func run(_ core: PeerPort, _ gen: Int, _ first: String, _ firstWait: TimeInterval) {
        var secret = first
        var deadline = now() + firstWait
        while !stale(gen) {
            let c: PeerConnection
            do {
                c = try core.connect(contact: secret, waitSecs: Self.joinSecs)
            } catch {
                let code = (error as? PeerFailure)?.code ?? "failed"
                if code != "offline" && code != "network" { failed(gen, code); return }
                if now() >= deadline { failed(gen, "offline"); return }
                continue
            }
            let current = locked { () -> Bool in guard gen == generation else { return false }; live = c; contact = c.contact; return true }
            guard current else { return }
            secret = c.contact
            emit(PeerJson.connected(c.code))
            let again = pump(c, gen)
            locked { if live === c { live = nil } }
            guard again else { return }
            emit(PeerJson.reconnecting)
            deadline = now() + Self.waitReconnect
        }
    }

    /// True when the link broke and is worth another try.
    private func pump(_ c: PeerConnection, _ gen: Int) -> Bool {
        while !stale(gen) {
            switch c.next(waitMs: Self.pollMs) {
            case .app(let ns, let body): if ns == Self.ns { emit(PeerJson.message(body)) }
            case .approval(let id): try? c.decline(id: id)
            case .peerLeft: emit(PeerJson.peerLeft); locked { contact = nil }; return false
            case .closed: return true
            case .ignored, .none: break
            }
        }
        return false
    }
}

/// Events for `window.DuellPeer.onPeerMessage`.
enum PeerJson {
    static let reconnecting = #"{"t":"reconnecting"}"#
    static let peerLeft = #"{"t":"peer-left"}"#
    static func invite(_ link: String) -> String { #"{"t":"invite","link":"# + quote(link) + "}" }
    static func connected(_ code: String) -> String { #"{"t":"connected","code":"# + quote(code) + "}" }
    static func message(_ body: String) -> String { #"{"t":"msg","body":"# + quote(body) + "}" }
    static func error(_ code: String) -> String { #"{"t":"error","e":"# + quote(code) + "}" }
    /// The call into the page. The argument is a JSON string, which is also a safe JavaScript literal.
    static func call(_ json: String) -> String { "window.DuellPeer&&window.DuellPeer.onPeerMessage(" + quote(json) + ")" }

    static func quote(_ s: String) -> String {
        var o = "\""
        for u in s.unicodeScalars {
            switch u {
            case "\"": o += "\\\""
            case "\\": o += "\\\\"
            case _ where u.value < 0x20 || u.value == 0x2028 || u.value == 0x2029: o += String(format: "\\u%04x", u.value)
            default: o.unicodeScalars.append(u)
            }
        }
        return o + "\""
    }
}
