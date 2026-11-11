package org.bunsenbrenner.cads.duell

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Which server calls the page may ask the shell to make with the account (account bridge v1, `op:"api"`). Same rule on
 * iOS (`AccountRoute.swift`), shared cases in src/test/resources/bridge-account-v1.json. The host is fixed by the build
 * (`DUELL_API_BASE`); the bearer is added here and never shown to the page.
 */
object AccountRoute {
    const val MAX_BODY = 262_144
    const val MAX_ANSWER = 1_048_576
    private val POST = Regex("^/api/duell/(ai|profile|credit|deck|mod|bild|stat)(/[a-z0-9-]{1,32}){0,2}$")
    private val ADMIN = Regex("/(review|admin)(/|$)")

    fun allowed(method: String, path: String): Boolean = when (method) {
        "GET" -> path == "/auth/me"
        "POST" -> POST.matches(path) && !ADMIN.containsMatchIn(path)
        else -> false
    }

    /** A JSON object of at most [MAX_BODY] bytes for POST, nothing for GET; null otherwise. */
    fun body(method: String, body: String?): ByteArray? {
        if (method == "GET") return if (body == null) ByteArray(0) else null
        if (body == null) return null
        val b = body.toByteArray()
        if (b.size > MAX_BODY) return null
        return try { JSONObject(body); b } catch (_: Exception) { null }
    }

    /** Blocking call (background thread). No cookies, no redirects; -> (status, text) or null when the network failed. */
    fun call(base: String, method: String, path: String, body: ByteArray, bearer: String?): Pair<Int, String>? = try {
        require(base.startsWith("https://"))
        val c = URL(base + path).openConnection() as HttpURLConnection
        c.requestMethod = method
        c.instanceFollowRedirects = false
        c.useCaches = false
        c.connectTimeout = 15_000
        c.readTimeout = 25_000
        c.setRequestProperty("Accept", "application/json")
        if (bearer != null) c.setRequestProperty("Authorization", "Bearer $bearer")
        if (method == "POST") {
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.outputStream.use { it.write(body) }
        }
        val status = c.responseCode
        val stream = if (status >= 400) c.errorStream else c.inputStream
        val bytes = stream?.use { s -> s.readNBytesCompat(MAX_ANSWER + 1) } ?: ByteArray(0)
        c.disconnect()
        if (bytes.size > MAX_ANSWER) null else status to String(bytes)
    } catch (_: Exception) { null }

    private fun java.io.InputStream.readNBytesCompat(n: Int): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val buf = ByteArray(8192)
        while (out.size() < n) { val r = read(buf, 0, minOf(buf.size, n - out.size())); if (r < 0) break; out.write(buf, 0, r) }
        return out.toByteArray()
    }
}
