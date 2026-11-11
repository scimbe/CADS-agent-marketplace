package org.bunsenbrenner.cads.duell

import android.net.Uri
import android.os.Handler
import android.os.Looper
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
 * the answer goes back through the reply proxy with the same id. The page never sees a token.
 */
class AccountBridge(private val scope: CoroutineScope, private val account: AccountPort, private val apiBase: String) : WebViewCompat.WebMessageListener {
    private val main = Handler(Looper.getMainLooper())

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
                    if (account.available && !account.signedIn()) account.login()
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
