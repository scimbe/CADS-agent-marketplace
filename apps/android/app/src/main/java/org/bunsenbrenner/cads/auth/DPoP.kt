package org.bunsenbrenner.cads.auth

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import org.json.JSONObject
import java.math.BigInteger
import java.net.URI
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.util.Base64
import java.util.UUID

/** Signs with a P-256 key; [signDer] returns the DER signature the JCA produces. */
interface DPoPSigner {
    val publicKey: ECPublicKey
    fun signDer(data: ByteArray): ByteArray
}

/**
 * DPoP proofs (RFC 9449 §4.2). Keycloak binds the refresh token of our public client to the device key (client policy,
 * runbook 2026-11-11-oidc-apps), so a copied refresh token is worthless without it; the access token stays a bearer token.
 */
object DPoP {
    /** `htu`: the request URL without query and fragment. */
    fun htu(url: String): String {
        val u = URI(url)
        return URI(u.scheme, u.rawAuthority, u.rawPath, null, null).toString()
    }

    fun proof(signer: DPoPSigner, method: String, url: String, iatSec: Long = System.currentTimeMillis() / 1000, jti: String = UUID.randomUUID().toString(), nonce: String? = null): String {
        val w = signer.publicKey.w
        val jwk = JSONObject().put("kty", "EC").put("crv", "P-256").put("x", b64(fixed(w.affineX))).put("y", b64(fixed(w.affineY)))
        val header = JSONObject().put("typ", "dpop+jwt").put("alg", "ES256").put("jwk", jwk)
        val claims = JSONObject().put("jti", jti).put("htm", method.uppercase()).put("htu", htu(url)).put("iat", iatSec)
        if (nonce != null) claims.put("nonce", nonce)
        val input = b64(header.toString().toByteArray()) + "." + b64(claims.toString().toByteArray())
        return input + "." + b64(derToP1363(signer.signDer(input.toByteArray())))
    }

    /** ASN.1 DER ECDSA signature (SEQUENCE { INTEGER r, INTEGER s }) -> JWS form r || s, 32 bytes each. */
    fun derToP1363(der: ByteArray, size: Int = 32): ByteArray {
        require(der.size >= 8 && der[0] == 0x30.toByte()) { "not a DER sequence" }
        var i = 2
        if (der[1].toInt() and 0x80 != 0) i = 2 + (der[1].toInt() and 0x7f)
        fun int(): ByteArray {
            require(der[i] == 0x02.toByte()) { "not a DER integer" }
            val len = der[i + 1].toInt() and 0xff
            val v = der.copyOfRange(i + 2, i + 2 + len)
            i += 2 + len
            return v
        }
        val r = int(); val s = int()
        return pad(r, size) + pad(s, size)
    }

    private fun pad(v: ByteArray, size: Int): ByteArray {
        val t = v.dropWhile { it == 0.toByte() }.toByteArray()
        require(t.size <= size) { "integer too long" }
        return ByteArray(size - t.size) + t
    }

    private fun fixed(n: BigInteger): ByteArray = pad(n.toByteArray(), 32)

    // java.util.Base64 (API 26 = minSdk), so the same code runs in JVM unit tests
    fun b64(b: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(b)
}

/**
 * The device key in the Android Keystore: generated inside it, not exportable, StrongBox where the device has one.
 * A new key per sign-in; signing out deletes it (and with it every refresh token bound to it).
 */
class KeystoreDPoPSigner private constructor(private val key: PrivateKey, override val publicKey: ECPublicKey) : DPoPSigner {
    override fun signDer(data: ByteArray): ByteArray = Signature.getInstance("SHA256withECDSA").run { initSign(key); update(data); sign() }

    companion object {
        private const val ALIAS = "mdi-dpop"
        private fun store() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

        fun current(): KeystoreDPoPSigner? = try {
            val ks = store()
            val k = ks.getKey(ALIAS, null) as? PrivateKey
            val pub = ks.getCertificate(ALIAS)?.publicKey as? ECPublicKey
            if (k != null && pub != null) KeystoreDPoPSigner(k, pub) else null
        } catch (_: Exception) { null }

        fun fresh(): KeystoreDPoPSigner? {
            delete()
            for (strongBox in listOf(true, false)) {
                try {
                    val spec = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
                        .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                        .setDigests(KeyProperties.DIGEST_SHA256)
                        .apply { if (strongBox && android.os.Build.VERSION.SDK_INT >= 28) setIsStrongBoxBacked(true) }
                        .build()
                    if (strongBox && android.os.Build.VERSION.SDK_INT < 28) continue
                    val kp = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore").apply { initialize(spec) }.generateKeyPair()
                    return KeystoreDPoPSigner(kp.private, kp.public as ECPublicKey)
                } catch (_: Exception) { /* no StrongBox: try the TEE-backed keystore */ }
            }
            return null
        }

        fun delete() { try { store().deleteEntry(ALIAS) } catch (_: Exception) { } }
    }
}
