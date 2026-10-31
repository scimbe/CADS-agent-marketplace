import Foundation

/// Binds `PeerPort` to mobile-core. Nil without the production front door and edge CA: the page then says so.
final class PeerCoreAdapter: PeerPort, @unchecked Sendable {
    private let config: PeerConfig
    private init(_ c: PeerConfig) { config = c }

    static func fromBuild() -> PeerCoreAdapter? {
        guard !AppConfig.peerFrontDoor.isEmpty, let ca = Data(base64Encoded: AppConfig.peerEdgeCaBase64), !ca.isEmpty else { return nil }
        return PeerCoreAdapter(PeerConfig(controlPlaneUrl: AppConfig.apiBase, frontDoor: AppConfig.peerFrontDoor, edgeCaDer: ca, sni: AppConfig.peerSni))
    }

    func invite(token: String) throws -> (link: String, contact: String) {
        try guarded { let i = try peerCreateInvite(config: config, accessToken: token); return (i.link, i.contactJson) }
    }
    func accept(coreLink: String) throws -> String { try guarded { try peerAcceptInvite(config: config, link: coreLink) } }
    func revoke(contact: String) throws { try guarded { try peerDisconnect(config: config, contactJson: contact) } }
    func connect(contact: String, waitSecs: UInt64) throws -> PeerConnection {
        try guarded {
            Session(try PeerSession.connect(config: config, contactJson: contact, capabilities: [], namespaces: [PeerBridge.ns], waitSecs: waitSecs))
        }
    }

    private final class Session: PeerConnection, @unchecked Sendable {
        private let s: PeerSession
        let code: String
        let contact: String
        init(_ s: PeerSession) { self.s = s; code = s.verificationCode(); contact = s.contactJson() }
        func send(ns: String, body: String) throws { try guarded { try s.sendApp(ns: ns, bodyJson: body) } }
        func leave() throws { try guarded { try s.leave() } }
        func decline(id: UInt64) throws { try guarded { try s.decline(id: id) } }
        func next(waitMs: UInt64) -> PeerIn? {
            switch s.nextEvent(waitMs: waitMs) {
            case .none: return nil
            case .app(let ns, let body): return .app(ns: ns, body: body)
            case .approvalNeeded(let id, _): return .approval(id)
            case .peerLeft: return .peerLeft
            case .closed: return .closed
            default: return .ignored     // free text and capability results have no place in this feature
            }
        }
    }
}

private func guarded<T>(_ f: () throws -> T) throws -> T {
    do { return try f() } catch let e as PeerError {
        switch e {
        case .Unauthorized: throw PeerFailure(code: "login")
        case .LinkUsed: throw PeerFailure(code: "used")
        case .LinkExpired: throw PeerFailure(code: "expired")
        case .LinkInvalid: throw PeerFailure(code: "invalid")
        case .PeerOffline: throw PeerFailure(code: "offline")
        case .Network: throw PeerFailure(code: "network")
        default: throw PeerFailure(code: "failed")
        }
    }
}
