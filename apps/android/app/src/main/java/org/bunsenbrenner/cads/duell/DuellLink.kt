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
    // `c=<base64url>` (challenge, shared work), `i=<id>` (invite to a day's idea; ids are [a-z0-9-], at most 32)
    // or `p=<base64url>` (invite to build together; a secret, it never reaches a server), optionally with `&k=<card>`.
    private val FRAGMENT = Regex("^(?:c=[A-Za-z0-9_\\-=]+|i=[a-z0-9-]{1,32}|p=[A-Za-z0-9_\\-]{40,1024}(?:&k=[A-Za-z0-9_\\-]{1,1500})?)$")
    private val PEER_VALUE = Regex("^[A-Za-z0-9_\\-]{40,1024}$")
    private const val CORE_LINK = "https://$SHARE_HOST/p#"

    private fun isDuellUri(uri: URI) =
        uri.scheme == "https" && uri.host == SHARE_HOST && uri.port == -1 && uri.rawPath?.trimEnd('/') == SHARE_PATH

    /**
     * The `c=<base64url>` or `i=<id>` fragment of a shared link, or null when [link] is not a Duell link
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

    /** The core's invite link as the App Link people share. `/p` has neither a page nor an App Link entry. */
    fun shareLink(coreLink: String?): String? {
        val v = coreLink?.takeIf { it.startsWith(CORE_LINK) }?.removePrefix(CORE_LINK) ?: return null
        return if (PEER_VALUE.matches(v)) "https://$SHARE_HOST$SHARE_PATH#p=$v" else null
    }

    /** The other way, for `peer_accept_invite`. Only a valid `#p=` link of this app. */
    fun coreLink(link: String?): String? {
        val f = fragmentOf(link)?.takeIf { it.startsWith("p=") } ?: return null
        return CORE_LINK + f.removePrefix("p=").substringBefore("&k=")
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

    /** Microphone only for the bundled page's own origin and only as the sole requested resource (no camera). */
    fun micAllowed(origin: String?, resources: Array<String>): Boolean =
        isInternal(origin) && resources.size == 1 && resources[0] == AUDIO_CAPTURE

    const val AUDIO_CAPTURE = "android.webkit.resource.AUDIO_CAPTURE"

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
