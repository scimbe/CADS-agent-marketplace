package org.bunsenbrenner.cads.duell

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * The file tool's relay grant (CADS-DEMO-wrapper `POST /api/duell/relay-grant`). The relay is for paying accounts only, so
 * this one call carries the app's login as `Authorization: Bearer`; the page never sees the token. Fixed host and path,
 * body `{}` or `{"channel":"<64 hex>"}` and nothing else, no cookies, no redirects. The page gets the answer through
 * `window.DuellHostReply(id, status, body)`.
 */
object DuellRelay {
    const val PATH = "/api/duell/relay-grant"
    const val MAX_BODY = 512
    private const val MAX_ANSWER = 4096
    private val ID = Regex("^r[0-9]{1,9}$")
    private val CHANNEL = Regex("^[0-9a-fA-F]{64}$")

    fun url(apiBase: String): String = apiBase.trimEnd('/') + PATH

    fun validId(id: String?): Boolean = id != null && ID.matches(id)

    /** The body as it may leave the device, or null. */
    fun body(text: String?): String? {
        if (text == null || text.isEmpty() || text.toByteArray(Charsets.UTF_8).size > MAX_BODY) return null
        val o = try { JSONObject(text) } catch (_: Exception) { return null }
        val keys = o.keys().asSequence().toList()
        if (keys.any { it != "channel" }) return null
        if (o.has("channel")) { val c = o.opt("channel"); if (c !is String || !CHANNEL.matches(c)) return null }
        return text
    }

    fun headers(token: String?): Map<String, String> =
        mapOf("Content-Type" to "application/json") + (if (!token.isNullOrEmpty()) mapOf("Authorization" to "Bearer $token") else emptyMap())

    /** The script that hands the answer to the page. Every value is quoted as a JSON string, so nothing the server says runs. */
    fun reply(id: String, status: Int, body: String): String =
        "window.DuellHostReply&&window.DuellHostReply(${JSONObject.quote(id)},$status,${JSONObject.quote(body.take(MAX_ANSWER))})"

    /** Blocking: call off the main thread. -> status and body; 0 and "" when nothing came back. */
    fun call(apiBase: String, body: String, token: String?): Pair<Int, String> = try {
        val c = URL(url(apiBase)).openConnection() as HttpURLConnection
        c.instanceFollowRedirects = false
        c.useCaches = false
        c.connectTimeout = 10_000
        c.readTimeout = 15_000
        c.requestMethod = "POST"
        c.doOutput = true
        headers(token).forEach { (k, v) -> c.setRequestProperty(k, v) }
        c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        val st = c.responseCode
        val stream = if (st >= 400) c.errorStream else c.inputStream
        val text = stream?.use { s ->
            val buf = java.io.ByteArrayOutputStream(); val chunk = ByteArray(1024)
            while (buf.size() < MAX_ANSWER) { val n = s.read(chunk, 0, minOf(chunk.size, MAX_ANSWER - buf.size())); if (n < 0) break; buf.write(chunk, 0, n) }
            String(buf.toByteArray(), Charsets.UTF_8)
        } ?: ""
        c.disconnect()
        st to text
    } catch (_: Exception) { 0 to "" }
}
