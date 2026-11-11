package org.bunsenbrenner.cads.duell

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.bunsenbrenner.cads.auth.AccountPort
import org.json.JSONObject

/**
 * Account bridge v1 for the page (contract in apps/mdi/src/broker/native.js): `window.MdiAccount` exists only for the
 * bundled page's own origin (https://appassets.androidplatform.net) and only in the main frame. Requests carry an `id`;
 * the answer goes back through the reply proxy with the same id. The page never sees a token. `login` only right after
 * a touch on the page (native touch listener, [lastTouch]) and never twice at once or within 3 s, so a page script
 * cannot open the sign-in on its own.
 */
class AccountBridge(
    private val scope: CoroutineScope,
    private val account: AccountPort,
    private val apiBase: String,
    private val lastTouch: () -> Long,   // SystemClock.uptimeMillis() of the last touch on the WebView
) : WebViewCompat.WebMessageListener {
    private val main = Handler(Looper.getMainLooper())
    private var loginRunning = false
    private var lastLogin = Long.MIN_VALUE / 2

    override fun onPostMessage(view: WebView, message: WebMessageCompat, sourceOrigin: Uri, isMainFrame: Boolean, reply: JavaScriptReplyProxy) {
        val req = try { JSONObject(message.data ?: "") } catch (_: Exception) { null }
        val id = req?.optInt("id", -1) ?: -1
        fun answer(o: JSONObject) { val s = o.put("v", 1).put("id", id).toString(); main.post { try { reply.postMessage(s) } catch (_: Exception) { } } }
        val refused = { answer(JSONObject().put("ok", false).put("error", "refused")) }
        if (!isMainFrame || sourceOrigin.toString() != ORIGIN || req == null || req.optInt("v") != 1 || id < 0) { refused(); return }
        scope.launch {
            when (req.optString("op")) {
                "state" -> answer(JSONObject().put("ok", true).put("available", account.available).put("signedIn", account.signedIn()))
                "login" -> {
                    val now = SystemClock.uptimeMillis()
                    if (!loginAllowed(now, lastLogin, lastTouch(), loginRunning)) { refused(); return@launch }
                    loginRunning = true; lastLogin = now
                    try {
                        if (account.available && !account.signedIn()) account.login()
                    } finally { loginRunning = false }
                    answer(JSONObject().put("ok", account.available).put("signedIn", account.signedIn()))
                }
                "logout" -> { account.logout(); answer(JSONObject().put("ok", true).put("signedIn", false)) }
                "api" -> {
                    val method = req.optString("method"); val path = req.optString("path")
                    val body = AccountRoute.body(method, if (req.has("body")) req.optString("body") else null)
                    if (!AccountRoute.allowed(method, path) || body == null) { refused(); return@launch }
                    val token = if (account.signedIn()) account.accessToken() else null
                    val r = withContext(Dispatchers.IO) { AccountRoute.call(apiBase, method, path, body, token) }
                    if (r == null) answer(JSONObject().put("ok", false).put("error", "netz"))
                    else answer(JSONObject().put("ok", true).put("status", r.first).put("body", r.second))
                }
                else -> refused()
            }
        }
    }

    companion object {
        const val NAME = "MdiAccount"
        const val GESTURE_MS = 5_000L
        const val DEBOUNCE_MS = 3_000L

        /** A sign-in may start: none running, the last one at least 3 s ago, a touch on the page within 5 s. */
        fun loginAllowed(now: Long, lastLogin: Long, lastTouch: Long, running: Boolean): Boolean =
            !running && now - lastLogin >= DEBOUNCE_MS && lastTouch > 0 && now - lastTouch in 0..GESTURE_MS
        const val ORIGIN = "https://" + DuellLink.ASSET_HOST

        /** Registers the bridge when the WebView supports it; old WebViews keep the page's web behaviour (no account). */
        fun attach(web: WebView, bridge: AccountBridge): Boolean {
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return false
            WebViewCompat.addWebMessageListener(web, NAME, setOf(ORIGIN), bridge)
            return true
        }

        fun detach(web: WebView) {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) try { WebViewCompat.removeWebMessageListener(web, NAME) } catch (_: Exception) { }
        }
    }
}
