package org.bunsenbrenner.cads.duell

import java.net.URI

/** Pure link and navigation rules of the Duell tab (no Android types, unit-tested). */
object DuellLink {
    const val SHARE_HOST = "bunsenbrenner.org"
    const val SHARE_PATH = "/duell"

    /** Virtual origin the WebViewAssetLoader serves the bundled assets from. */
    const val ASSET_HOST = "appassets.androidplatform.net"
    const val ASSET_PAGE = "https://$ASSET_HOST/assets/duell/index.html"

    private const val MAX_FRAGMENT = 8 * 1024
    private val FRAGMENT = Regex("^c=[A-Za-z0-9_\\-=]+$")

    private fun isDuellUri(uri: URI) =
        uri.scheme == "https" && uri.host == SHARE_HOST && uri.port == -1 && uri.rawPath?.trimEnd('/') == SHARE_PATH

    /**
     * The `c=<base64url>` fragment of a shared Duell link, or null when [link] is not a Duell link
     * of this app (other host or path, no fragment, characters outside the base64url alphabet,
     * oversize). Only this validated fragment is ever handed to the page.
     */
    fun fragmentOf(link: String?): String? {
        val uri = parse(link)?.takeIf { isDuellUri(it) } ?: return null
        return uri.rawFragment?.takeIf { it.length <= MAX_FRAGMENT && FRAGMENT.matches(it) }
    }

    /**
     * URL the WebView loads: the local page plus the validated fragment. [reload] > 0 adds a query
     * so that a second challenge link loads the page afresh instead of only changing the hash.
     */
    fun pageUrl(fragment: String?, reload: Int = 0): String =
        ASSET_PAGE + (if (reload > 0) "?r=$reload" else "") + (if (fragment == null) "" else "#$fragment")

    /** Links the page may pass to the share sheet: only the public Duell link, with a valid fragment if any. */
    fun isShareable(url: String?): Boolean {
        val uri = parse(url)?.takeIf { isDuellUri(it) } ?: return false
        return uri.rawFragment == null || fragmentOf(url) != null
    }

    /** True for requests that stay inside the WebView: the bundled page itself. */
    fun isInternal(url: String?): Boolean {
        val uri = parse(url) ?: return false
        return uri.scheme == "https" && uri.host == ASSET_HOST && uri.port == -1
    }

    /** True for requests the WebView may perform at all: the bundled assets and the config API. */
    fun mayLoad(url: String?, apiHost: String): Boolean {
        val uri = parse(url) ?: return false
        if (uri.scheme != "https" || uri.port != -1) return false
        return uri.host == ASSET_HOST || uri.host == apiHost
    }

    /** Navigations that go to the system browser (everything web-like that is not internal). */
    fun opensExternally(url: String?): Boolean {
        val s = parse(url)?.scheme ?: return false
        return !isInternal(url) && (s == "https" || s == "http")
    }

    private fun parse(s: String?): URI? = try {
        if (s == null) null else URI(s)
    } catch (_: Exception) {
        null
    }
}
