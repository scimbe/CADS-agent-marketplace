package org.bunsenbrenner.cads

import org.bunsenbrenner.cads.auth.DPoP
import org.bunsenbrenner.cads.auth.DPoPSigner
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigInteger
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPublicKeySpec
import java.util.Base64

/** DPoP proofs (RFC 9449 §4.2) with a software key (the Keystore key behaves the same through [DPoPSigner]). */
class DPoPTest {
    private val kp = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
    private val signer = object : DPoPSigner {
        override val publicKey = kp.public as ECPublicKey
        override fun signDer(data: ByteArray): ByteArray = Signature.getInstance("SHA256withECDSA").run { initSign(kp.private); update(data); sign() }
    }
    private fun dec(s: String) = Base64.getUrlDecoder().decode(s)

    @Test fun proofShapeAndSignatureVerifiableFromTheHeaderKey() {
        val jwt = DPoP.proof(signer, "post", "https://auth.example.org/realms/ct-demo/protocol/openid-connect/token?x=1#f", 1_800_000_000, "j-1")
        val p = jwt.split(".")
        assertEquals(3, p.size)
        val h = JSONObject(String(dec(p[0]))); val c = JSONObject(String(dec(p[1])))
        assertEquals("dpop+jwt", h.getString("typ")); assertEquals("ES256", h.getString("alg"))
        val jwk = h.getJSONObject("jwk")
        assertEquals("EC", jwk.getString("kty")); assertEquals("P-256", jwk.getString("crv")); assertFalse(jwk.has("d"))
        assertEquals("POST", c.getString("htm"))
        assertEquals("https://auth.example.org/realms/ct-demo/protocol/openid-connect/token", c.getString("htu"))
        assertEquals(1_800_000_000L, c.getLong("iat")); assertEquals("j-1", c.getString("jti")); assertFalse(c.has("nonce"))
        // rebuild the public key from the JWK alone and verify the raw r||s signature
        val params = (kp.public as ECPublicKey).params
        val pub = KeyFactory.getInstance("EC").generatePublic(ECPublicKeySpec(ECPoint(BigInteger(1, dec(jwk.getString("x"))), BigInteger(1, dec(jwk.getString("y")))), params))
        val sig = dec(p[2]); assertEquals(64, sig.size)
        val v = Signature.getInstance("SHA256withECDSAinP1363Format").apply { initVerify(pub); update((p[0] + "." + p[1]).toByteArray()) }
        assertTrue(v.verify(sig))
    }

    @Test fun freshJtiAndOptionalNonce() {
        val a = JSONObject(String(dec(DPoP.proof(signer, "POST", "https://a.example/t").split(".")[1])))
        val b = JSONObject(String(dec(DPoP.proof(signer, "POST", "https://a.example/t").split(".")[1])))
        assertNotEquals(a.getString("jti"), b.getString("jti"))
        assertEquals("n1", JSONObject(String(dec(DPoP.proof(signer, "POST", "https://a.example/t", nonce = "n1").split(".")[1]))).getString("nonce"))
    }

    @Test fun derToRawHandlesLeadingZerosAndShortIntegers() {
        // r with a sign byte (33 bytes), s short (31 bytes)
        val r = ByteArray(33).also { it[1] = 0x80.toByte(); it[32] = 1 }
        val s = ByteArray(31) { 7 }
        val der = byteArrayOf(0x30, (4 + r.size + s.size).toByte(), 0x02, r.size.toByte()) + r + byteArrayOf(0x02, s.size.toByte()) + s
        val raw = DPoP.derToP1363(der)
        assertEquals(64, raw.size)
        assertArrayEquals(r.copyOfRange(1, 33), raw.copyOfRange(0, 32))
        assertArrayEquals(ByteArray(1) + s, raw.copyOfRange(32, 64))
    }

    @Test fun aRefusedDPoPProofKeepsTheTokensAnInvalidGrantDoesNot() {
        assertTrue(org.bunsenbrenner.cads.auth.keepsTokens("invalid_dpop_proof"))
        assertTrue(org.bunsenbrenner.cads.auth.keepsTokens("use_dpop_nonce"))
        assertFalse(org.bunsenbrenner.cads.auth.keepsTokens("invalid_grant"))
        assertFalse(org.bunsenbrenner.cads.auth.keepsTokens(null))
        assertEquals("openid mdi-api", org.bunsenbrenner.cads.auth.Resource.MyDailyIdea.scope)
        assertEquals("openid ct-api", org.bunsenbrenner.cads.auth.Resource.ControlPlane.scope)
    }
}
