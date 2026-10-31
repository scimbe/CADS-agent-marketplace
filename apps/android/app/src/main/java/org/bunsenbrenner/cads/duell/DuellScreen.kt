package org.bunsenbrenner.cads.duell

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.view.HapticFeedbackConstants
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import org.bunsenbrenner.cads.BuildConfig
import org.bunsenbrenner.cads.R
import java.io.ByteArrayInputStream
import java.io.File
import java.net.URI

/**
 * The only bridge the page sees (`window.DuellHost`): share sheet (link, or a file with link), save a
 * file, a light tick and the quiet "more" that opens the native extras. Everything the page passes is
 * validated here ([DuellLink], [DuellFiles]); the page is the app's own bundled asset, not a trusted caller.
 */
class DuellHost(private val context: Context, private val view: View, private val peer: PeerBridge, private val onMore: () -> Unit) {
    private val main = Handler(Looper.getMainLooper())
    private val shareDir = File(context.cacheDir, "share")

    init { DuellFiles.sweep(shareDir, System.currentTimeMillis(), STALE_MS) }

    /** Opens the Android share sheet for a Duell link; anything else is dropped. */
    @JavascriptInterface
    fun share(url: String?, text: String?) {
        if (!DuellLink.isShareable(url)) return
        val body = listOfNotNull(text?.take(500)?.takeIf { it.isNotBlank() }, url).joinToString("\n")
        main.post {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, body)
            startChooser(Intent.createChooser(send, null))
        }
    }

    /**
     * Shares a picture or sound with the share sheet. The file lives in the cache folder, is handed out
     * through the FileProvider (read grant only for the chosen target) and removed later by [sweepLater].
     * Wrong type, wrong content, too big: dropped. A link that is not a Duell link is left out.
     */
    @JavascriptInterface
    fun shareFile(b64: String?, typ: String?, name: String?, url: String?, text: String?) {
        val kind = DuellFiles.kindOf(typ) ?: return
        val bytes = DuellFiles.decode(b64, kind) ?: return
        val link = url?.takeIf { DuellLink.isShareable(it) }
        val body = listOfNotNull(text?.take(500)?.takeIf { it.isNotBlank() }, link).joinToString("\n")
        val file = try {
            DuellFiles.sweep(shareDir, System.currentTimeMillis(), STALE_MS)
            File(File(shareDir, java.lang.Long.toString(System.nanoTime(), 36)).apply { mkdirs() }, DuellFiles.safeName(name, kind)).apply { writeBytes(bytes) }
        } catch (_: Exception) { toast(R.string.file_failed); return }
        val uri = FileProvider.getUriForFile(context, "${BuildConfig.APPLICATION_ID}.fileprovider", file)
        main.post {
            val send = Intent(Intent.ACTION_SEND).setType(kind.mime).putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            if (body.isNotEmpty()) send.putExtra(Intent.EXTRA_TEXT, body)
            send.clipData = ClipData.newRawUri(null, uri)
            startChooser(Intent.createChooser(send, null).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
            sweepLater()
        }
    }

    /**
     * Saves a picture to Pictures/My Daily Idea or a sound to Music/My Daily Idea through MediaStore
     * (no storage permission). Before Android 10 there is no such permission-free way, so the share
     * sheet takes over (it offers "save to files" targets).
     */
    @JavascriptInterface
    fun saveFile(b64: String?, typ: String?, name: String?) {
        val kind = DuellFiles.kindOf(typ) ?: return
        val bytes = DuellFiles.decode(b64, kind) ?: return
        val safe = DuellFiles.safeName(name, kind)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) { shareFile(b64, typ, safe, null, null); return }
        val resolver = context.contentResolver
        val folder = (if (kind.isImage) Environment.DIRECTORY_PICTURES else Environment.DIRECTORY_MUSIC) + "/" + SAVE_FOLDER
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, safe)
            put(MediaStore.MediaColumns.MIME_TYPE, kind.mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, folder)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val collection = if (kind.isImage) MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        else MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        var uri: Uri? = null
        try {
            uri = resolver.insert(collection, values) ?: throw IllegalStateException("insert failed")
            resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: throw IllegalStateException("no stream")
            resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
            toast(if (kind.isImage) R.string.saved_image else R.string.saved_audio)
        } catch (_: Exception) {
            uri?.let { try { resolver.delete(it, null, null) } catch (_: Exception) { /* nothing left to clean */ } }
            toast(R.string.file_failed)
        }
    }

    /** Short haptic tick. Needs no permission. */
    @JavascriptInterface
    fun haptic() {
        main.post { view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP) }
    }

    /** The page's quiet "more": opens the native list (templates, installations). */
    @JavascriptInterface
    fun more() {
        main.post { onMore() }
    }

    /** Whether this build has the channel's production values; the page says so honestly when not. */
    @JavascriptInterface
    fun peerReady(): Boolean = peer.ready

    /** "Einladen". The answer arrives through `window.DuellPeer.onPeerMessage`. */
    @JavascriptInterface
    fun peerInvite() = peer.invite()

    /** "Annehmen", with the `/duell#p=` link the page got. */
    @JavascriptInterface
    fun peerAccept(link: String?) = peer.accept(link)

    /** One sync frame. Only the namespace of [PeerBridge] and only up to its size. */
    @JavascriptInterface
    fun peerSend(frame: String?) = peer.send(frame)

    /** "Verlassen". */
    @JavascriptInterface
    fun peerLeave() = peer.leave()

    private fun startChooser(chooser: Intent) {
        val activity = context.findActivity()
        try {
            if (activity != null) activity.startActivity(chooser) else context.startActivity(chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) { toast(R.string.file_failed) }
    }

    private fun toast(res: Int) { main.post { Toast.makeText(context, res, Toast.LENGTH_SHORT).show() } }

    // The receiving app may still read after the sheet closed: clean up a while later, and at the next start.
    private fun sweepLater() { main.postDelayed({ DuellFiles.sweep(shareDir, System.currentTimeMillis(), STALE_MS) }, STALE_MS + 1_000) }

    companion object {
        const val STALE_MS = 10 * 60 * 1000L
        const val SAVE_FOLDER = "My Daily Idea"
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
    peerToken: () -> String?,
    onMore: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val apiHost = remember(apiBase) { URI(apiBase).host ?: "" }
    val holder = remember { arrayOfNulls<WebView>(1) }
    val loaded = remember { intArrayOf(-1) }
    val more by rememberUpdatedState(onMore)
    val token by rememberUpdatedState(peerToken)
    // One worker per session step, so a blocking call of the channel never holds the UI or the JS thread.
    val peerBridge = remember {
        val main = Handler(Looper.getMainLooper())
        PeerBridge(
            PeerCoreAdapter.fromBuild(),
            { token() },
            { json -> main.post { holder[0]?.evaluateJavascript(PeerJson.call(json), null) } },
            { work -> Thread(work, "peer").apply { isDaemon = true }.start() },
        )
    }

    // Photo: the system chooser (gallery/files; the camera only appears as one of its entries and runs
    // only when the person picks it after tapping the page's photo button). Always answer the callback.
    val chooserCallback = remember { arrayOfNulls<ValueCallback<Array<Uri>>>(1) }
    val cameraTarget = remember { arrayOfNulls<Uri>(1) }
    val chooserLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val cb = chooserCallback[0]; chooserCallback[0] = null
        var picked: Array<Uri>? = if (result.resultCode == Activity.RESULT_OK) WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data) else null
        if (picked == null && result.resultCode == Activity.RESULT_OK && cameraTarget[0] != null) picked = arrayOf(cameraTarget[0]!!)
        cameraTarget[0] = null
        cb?.onReceiveValue(picked) // null = cancelled
    }

    // Microphone: asked only when the page calls getUserMedia (after the person tapped record).
    val micPending = remember { arrayOfNulls<PermissionRequest>(1) }
    val micLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val r = micPending[0]; micPending[0] = null
        if (r != null) { if (granted) r.grant(arrayOf(DuellLink.AUDIO_CAPTURE)) else r.deny() }
    }

    BackHandler(enabled = visible) {
        val web = holder[0]
        if (web != null && web.canGoBack()) web.goBack() else (web?.context?.findActivity())?.finish()
    }
    DisposableEffect(Unit) {
        onDispose {
            chooserCallback[0]?.onReceiveValue(null); chooserCallback[0] = null
            micPending[0]?.deny(); micPending[0] = null
            peerBridge.leave()
            holder[0]?.let { it.stopLoading(); it.removeJavascriptInterface("DuellHost"); it.destroy() }; holder[0] = null
        }
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
                web.addJavascriptInterface(DuellHost(ctx, web, peerBridge) { more() }, "DuellHost")
                web.webChromeClient = object : WebChromeClient() {
                    override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                        chooserCallback[0]?.onReceiveValue(null) // a new request replaces an unanswered one
                        chooserCallback[0] = callback
                        return try {
                            val pick = params.createIntent() // ACTION_GET_CONTENT for the page's accept="image/*"
                            val chooser = Intent.createChooser(pick, null)
                            cameraIntent(ctx, cameraTarget)?.let { chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(it)) }
                            chooserLauncher.launch(chooser)
                            true
                        } catch (_: Exception) {
                            chooserCallback[0] = null; callback.onReceiveValue(null); true
                        }
                    }

                    override fun onPermissionRequest(request: PermissionRequest) {
                        // Only the bundled page's own origin, only the microphone; anything else is refused.
                        if (!DuellLink.micAllowed(request.origin?.toString(), request.resources)) { request.deny(); return }
                        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                            request.grant(arrayOf(DuellLink.AUDIO_CAPTURE))
                        } else {
                            micPending[0]?.deny()
                            micPending[0] = request
                            micLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    }

                    override fun onPermissionRequestCanceled(request: PermissionRequest) {
                        if (micPending[0] === request) micPending[0] = null
                    }
                }
                web.webViewClient = object : WebViewClient() {
                    // A new page knows nothing of a running session, so the session ends with the old one.
                    override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) { peerBridge.leave() }

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

/**
 * Camera entry for the photo chooser: an ACTION_IMAGE_CAPTURE intent writing into the share cache through
 * the FileProvider. It needs no CAMERA permission (the camera app takes the picture) and is only started
 * when the person picks it in the chooser. Null when no camera app can handle it.
 */
private fun cameraIntent(ctx: Context, target: Array<Uri?>): Intent? {
    val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
    if (intent.resolveActivity(ctx.packageManager) == null) return null
    return try {
        val dir = File(ctx.cacheDir, "share/" + java.lang.Long.toString(System.nanoTime(), 36)).apply { mkdirs() }
        val uri = FileProvider.getUriForFile(ctx, "${BuildConfig.APPLICATION_ID}.fileprovider", File(dir, "camera.jpg"))
        target[0] = uri
        intent.putExtra(MediaStore.EXTRA_OUTPUT, uri).addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        intent.clipData = ClipData.newRawUri(null, uri)
        intent
    } catch (_: Exception) { null }
}
