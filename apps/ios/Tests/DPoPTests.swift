import CryptoKit
import XCTest

/// DPoP proofs (RFC 9449 §4.2): header with the public JWK, claims jti/htm/htu/iat, ES256 over header.claims, verifiable
/// with nothing but the key in the header.
final class DPoPTests: XCTestCase {
    private func part(_ s: Substring) -> [String: Any] {
        var b = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b.count % 4 != 0 { b += "=" }
        return (try? JSONSerialization.jsonObject(with: Data(base64Encoded: b)!)) as? [String: Any] ?? [:]
    }
    private func raw(_ s: Substring) -> Data {
        var b = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b.count % 4 != 0 { b += "=" }
        return Data(base64Encoded: b)!
    }

    func testProofShapeAndSignature() throws {
        let key = SoftwareDPoPKey(key: P256.Signing.PrivateKey())
        let url = URL(string: "https://auth.example.org/realms/ct-demo/protocol/openid-connect/token?x=1#f")!
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let jwt = try DPoP.proof(key: key, method: "post", url: url, now: now, jti: "j-1")
        let p = jwt.split(separator: ".")
        XCTAssertEqual(p.count, 3)
        let h = part(p[0]), c = part(p[1])
        XCTAssertEqual(h["typ"] as? String, "dpop+jwt")
        XCTAssertEqual(h["alg"] as? String, "ES256")
        let jwk = h["jwk"] as? [String: String]
        XCTAssertEqual(jwk?["kty"], "EC"); XCTAssertEqual(jwk?["crv"], "P-256")
        XCTAssertNil(jwk?["d"], "never the private part")
        XCTAssertEqual(c["htm"] as? String, "POST")
        XCTAssertEqual(c["htu"] as? String, "https://auth.example.org/realms/ct-demo/protocol/openid-connect/token")
        XCTAssertEqual(c["iat"] as? Int, 1_800_000_000)
        XCTAssertEqual(c["jti"] as? String, "j-1")
        XCTAssertNil(c["nonce"])
        // verify with the JWK from the header only
        let pub = try P256.Signing.PublicKey(rawRepresentation: raw(Substring(jwk!["x"]!)) + raw(Substring(jwk!["y"]!)))
        let sig = try P256.Signing.ECDSASignature(rawRepresentation: raw(p[2]))
        XCTAssertTrue(pub.isValidSignature(sig, for: Data((p[0] + "." + p[1]).utf8)))
        XCTAssertFalse(pub.isValidSignature(sig, for: Data((p[0] + "." + p[0]).utf8)))
    }

    func testFreshJtiAndNonce() throws {
        let key = SoftwareDPoPKey(key: P256.Signing.PrivateKey())
        let url = URL(string: "https://a.example/t")!
        let a = try DPoP.proof(key: key, method: "POST", url: url), b = try DPoP.proof(key: key, method: "POST", url: url)
        XCTAssertNotEqual(part(a.split(separator: ".")[1])["jti"] as? String, part(b.split(separator: ".")[1])["jti"] as? String)
        XCTAssertEqual(part(try DPoP.proof(key: key, method: "POST", url: url, nonce: "n1").split(separator: ".")[1])["nonce"] as? String, "n1")
    }
}
