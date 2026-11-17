import CryptoKit
import Foundation

/// A P-256 signing key for DPoP proofs (RFC 9449). The public half goes into each proof as a JWK; the private half never
/// leaves the device (Secure Enclave where there is one, otherwise a Keychain item `WhenUnlockedThisDeviceOnly`).
protocol DPoPKey {
    /// x and y of the public key, 32 bytes each, uncompressed point without the 0x04 prefix.
    var publicXY: (x: Data, y: Data) { get }
    /// ES256 signature as raw r || s (64 bytes), which is what JWS wants.
    func sign(_ data: Data) throws -> Data
}

struct SoftwareDPoPKey: DPoPKey {
    let key: P256.Signing.PrivateKey
    var publicXY: (x: Data, y: Data) { let r = key.publicKey.rawRepresentation; return (r.prefix(32), r.suffix(32)) }
    func sign(_ data: Data) throws -> Data { try key.signature(for: data).rawRepresentation }
}

struct EnclaveDPoPKey: DPoPKey {
    let key: SecureEnclave.P256.Signing.PrivateKey
    var publicXY: (x: Data, y: Data) { let r = key.publicKey.rawRepresentation; return (r.prefix(32), r.suffix(32)) }
    func sign(_ data: Data) throws -> Data { try key.signature(for: data).rawRepresentation }
}

/// DPoP proofs. Keycloak binds the refresh token of our public client to this key (client policy, see the runbook), so a
/// copied refresh token is useless without the device key. The access token stays a plain bearer token for the wrapper.
enum DPoP {
    /// `htu`: the request URL without query and fragment (RFC 9449 §4.2).
    static func htu(_ url: URL) -> String {
        var c = URLComponents(url: url, resolvingAgainstBaseURL: false)
        c?.query = nil
        c?.fragment = nil
        return c?.url?.absoluteString ?? url.absoluteString
    }

    static func proof(key: DPoPKey, method: String, url: URL, now: Date = Date(), jti: String = UUID().uuidString, nonce: String? = nil) throws -> String {
        let (x, y) = key.publicXY
        let header: [String: Any] = ["typ": "dpop+jwt", "alg": "ES256",
                                     "jwk": ["kty": "EC", "crv": "P-256", "x": b64url(x), "y": b64url(y)]]
        var claims: [String: Any] = ["jti": jti, "htm": method.uppercased(), "htu": htu(url), "iat": Int(now.timeIntervalSince1970)]
        if let nonce { claims["nonce"] = nonce }
        let h = b64url(try JSONSerialization.data(withJSONObject: header, options: [.sortedKeys, .withoutEscapingSlashes]))
        let c = b64url(try JSONSerialization.data(withJSONObject: claims, options: [.sortedKeys, .withoutEscapingSlashes]))
        let input = h + "." + c
        return input + "." + b64url(try key.sign(Data(input.utf8)))
    }

    static func b64url(_ d: Data) -> String {
        d.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}

/// The one DPoP key of this installation. A new key for every sign-in; signing out deletes it (and with it every
/// refresh token bound to it).
enum DPoPKeyStore {
    private static let account = "dpop-key"
    private static let kindAccount = "dpop-key-kind"

    static func current() -> DPoPKey? {
        guard let blob = Keychain.load(account: account), let kind = Keychain.load(account: kindAccount) else { return nil }
        if kind == Data("se".utf8), let k = try? SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: blob) { return EnclaveDPoPKey(key: k) }
        if kind == Data("sw".utf8), let k = try? P256.Signing.PrivateKey(rawRepresentation: blob) { return SoftwareDPoPKey(key: k) }
        return nil
    }

    /// Creates and stores a fresh key; nil when it could not be stored (the caller then does not sign in).
    static func fresh() -> DPoPKey? {
        delete()
        // In the Secure Enclave the blob is an encrypted handle only this device's enclave can use.
        if SecureEnclave.isAvailable, let k = try? SecureEnclave.P256.Signing.PrivateKey() {
            guard Keychain.save(k.dataRepresentation, account: account), Keychain.save(Data("se".utf8), account: kindAccount) else { delete(); return nil }
            return EnclaveDPoPKey(key: k)
        }
        let k = P256.Signing.PrivateKey()
        guard Keychain.save(k.rawRepresentation, account: account), Keychain.save(Data("sw".utf8), account: kindAccount) else { delete(); return nil }
        return SoftwareDPoPKey(key: k)
    }

    static func delete() {
        Keychain.delete(account: account)
        Keychain.delete(account: kindAccount)
    }
}
