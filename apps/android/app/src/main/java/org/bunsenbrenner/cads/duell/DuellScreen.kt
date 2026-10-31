package org.bunsenbrenner.cads.duell

import android.annotation.SuppressLint
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.HapticFeedbackConstants
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewAssetLoader
import org.bunsenbrenner.cads.BuildConfig
import java.io.ByteArrayInputStream
import java.net.URI

/** The only bridge the page sees (`window.DuellHost`): share sheet and a light tick. */
class DuellHost(private val context: Context, private val view: View) {
    private val main = Handler(Looper.getMainLooper())

    /** Opens the Android share sheet for a Duell link; anything else is dropped. */
    @JavascriptInterface
    fun share(url: String?, text: String?) {
        if (!DuellLink.isShareable(url)) return
        val body = listOfNotNull(text?.take(500)?.takeIf { it.isNotBlank() }, url).joinToString("\n")
        main.post {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, body)
            val chooser = Intent.createChooser(send, null)
            val activity = context.findActivity()
            if (activity != null) activity.startActivity(chooser) else context.startActivity(chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    /** Short haptic tick. Needs no permission. */
    @JavascriptInterface
    fun haptic() {
        main.post { view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP) }
    }
}

private tailrec fun Context.findActivity(): android.app.Activity? = when (this) {
    is android.app.Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

private fun blocked() = WebResourceResponse("text/plain", "utf-8", 403, "Blocked", emptyMap(), ByteArrayInputStream(ByteArray(0)))

/**
 * Hosts the offline Duell page. The page comes only from the app's assets through
 * [WebViewAssetLoader] (https://appassets.androidplatform.net/...), never from file:// and never
 * from the network. Sub-requests are limited to those assets and the configuration API host;
 * every other navigation opens in the system browser.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun DuellScreen(
    fragment: String?,
    linkSeq: Int,
    visible: Boolean,
    apiBase: String,
    modifier: Modifier = Modifier,
) {
    val apiHost = remember(apiBase) { URI(apiBase).host ?: "" }
    val holder = remember { arrayOfNulls<WebView>(1) }
    val loaded = remember { intArrayOf(-1) }

    BackHandler(enabled = visible) {
        val web = holder[0]
        if (web != null && web.canGoBack()) web.goBack() else (web?.context?.findActivity())?.finish()
    }
    DisposableEffect(Unit) {
        onDispose { holder[0]?.let { it.stopLoading(); it.removeJavascriptInterface("DuellHost"); it.destroy() }; holder[0] = null }
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            val loader = WebViewAssetLoader.Builder()
                .setDomain(DuellLink.ASSET_HOST)
                .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(ctx))
                .build()
            WebView(ctx).also { web ->
                holder[0] = web
                web.settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    allowFileAccess = false
                    allowContentAccess = false
                    @Suppress("DEPRECATION") allowFileAccessFromFileURLs = false
                    @Suppress("DEPRECATION") allowUniversalAccessFromFileURLs = false
                    mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    javaScriptCanOpenWindowsAutomatically = false
                    setSupportMultipleWindows(false)
                    setGeolocationEnabled(false)
                    @Suppress("DEPRECATION") saveFormData = false
                    safeBrowsingEnabled = true
                    mediaPlaybackRequiresUserGesture = true
                }
                WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
                web.overScrollMode = View.OVER_SCROLL_NEVER
                web.addJavascriptInterface(DuellHost(ctx, web), "DuellHost")
                web.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                        val url = request.url.toString()
                        if (DuellLink.isInternal(url)) return false
                        if (DuellLink.opensExternally(url)) {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)
                            try { view.context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) { /* no browser */ }
                        }
                        return true // never navigate the WebView away from the bundled page
                    }

                    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                        val url = request.url.toString()
                        if (!DuellLink.mayLoad(url, apiHost)) return blocked()
                        return loader.shouldInterceptRequest(request.url) // null for the API host: normal network
                    }
                }
            }
        },
        update = { web ->
            web.visibility = if (visible) View.VISIBLE else View.GONE
            if (visible) web.onResume() else web.onPause()
            if (loaded[0] != linkSeq) { // first load, or a new challenge link arrived
                web.loadUrl(DuellLink.pageUrl(fragment, reload = linkSeq))
                loaded[0] = linkSeq
            }
        },
        onRelease = { /* destroyed in DisposableEffect */ },
    )
}
