package org.bunsenbrenner.cads.auth

import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** RFC 7009 token revocation against Keycloak's `/protocol/openid-connect/revoke`. */
object Revocation {
    /** `application/x-www-form-urlencoded` body for a refresh-token revocation. */
    fun formBody(token: String, clientId: String): String =
        listOf("token" to token, "token_type_hint" to "refresh_token", "client_id" to clientId)
            .joinToString("&") { (k, v) -> "$k=" + URLEncoder.encode(v, "UTF-8") }

    /**
     * Best effort and blocking: call from a background thread. Never logs the token. [dpop] is the proof for the key the
     * refresh token is bound to (Keycloak checks it on revocation when the client policy binds refresh tokens).
     */
    fun revoke(endpoint: String, token: String, clientId: String, dpop: String? = null): Boolean = try {
        require(endpoint.startsWith("https://"))
        val c = URL(endpoint).openConnection() as HttpURLConnection
        c.requestMethod = "POST"
        c.connectTimeout = 10_000
        c.readTimeout = 10_000
        c.doOutput = true
        c.instanceFollowRedirects = false
        c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
        if (dpop != null) c.setRequestProperty("DPoP", dpop)
        c.outputStream.use { it.write(formBody(token, clientId).toByteArray()) }
        c.responseCode in 200..299
    } catch (_: Exception) {
        false
    }
}
