package org.bunsenbrenner.cads

import android.app.Application
import android.content.Intent
import android.os.Bundle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.bunsenbrenner.cads.duell.DuellFiles
import org.bunsenbrenner.cads.duell.DuellLink
import java.io.File
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.AndroidViewModel
import org.bunsenbrenner.cads.auth.AccountPort
import org.bunsenbrenner.cads.auth.AuthManager
import androidx.compose.runtime.remember
import kotlinx.coroutines.CompletableDeferred
import org.bunsenbrenner.cads.data.Catalog
import org.bunsenbrenner.cads.data.InstallationsApi
import org.bunsenbrenner.cads.data.RustInstallationsApi
import org.bunsenbrenner.cads.ui.CadsApp

class AppViewModel(app: Application) : AndroidViewModel(app) {
    val auth = AuthManager(app)
    val catalog = Catalog.bundled(app)
    val api: InstallationsApi = RustInstallationsApi { auth.accessToken() }

    // Challenge link (https://bunsenbrenner.org/duell#c=...) handed to the Duell tab; the sequence
    // number makes a repeated identical link load again.
    var duellFragment by mutableStateOf<String?>(null)
    var duellLinkSeq by mutableIntStateOf(0)

    fun onLink(intent: Intent?) {
        if (intent?.action != Intent.ACTION_VIEW) return
        val frag = DuellLink.fragmentOf(intent.dataString) ?: return
        duellFragment = frag
        duellLinkSeq += 1
    }

    override fun onCleared() {
        auth.dispose()
    }
}

class MainActivity : ComponentActivity() {
    private val vm: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (savedInstanceState == null) {
            vm.onLink(intent)
            // Files left from a share or a camera shot of an earlier run are not needed any more.
            DuellFiles.sweep(File(cacheDir, "share"), System.currentTimeMillis(), 0)
        }
        setContent { Root(vm, ::applyFullscreen) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        vm.onLink(intent)
    }

    private var immersive = false

    /**
     * Coming back from a system window (share sheet, permission dialog, file chooser) can leave the
     * bars visible; they would then cover the page's bottom buttons (Save, Keep changing). Hide them
     * again whenever the window regains focus while the game screen is up.
     */
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && immersive) applyFullscreen(true)
    }

    /** Full screen in the game: system bars hidden, shown briefly by a swipe from the edge. */
    private fun applyFullscreen(on: Boolean) {
        immersive = on
        val c = WindowInsetsControllerCompat(window, window.decorView)
        c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        if (on) c.hide(WindowInsetsCompat.Type.systemBars()) else c.show(WindowInsetsCompat.Type.systemBars())
    }
}

@Composable
private fun Root(vm: AppViewModel, onImmersive: (Boolean) -> Unit) {
    val signedIn by vm.auth.signedIn.collectAsState()
    // The account bridge waits for the browser round trip: one pending sign-in at a time, completed by the launcher.
    val pending = remember { arrayOfNulls<CompletableDeferred<Boolean>>(1) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        vm.auth.handleSignInResult(result.data) { ok -> pending[0]?.complete(ok); pending[0] = null }
    }
    val endSessionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { /* result not needed */ }
    val account = remember {
        object : AccountPort {
            override val available: Boolean get() = vm.auth.available
            override fun signedIn() = vm.auth.signedIn.value
            override suspend fun login(): Boolean {
                val intent = vm.auth.signInIntent() ?: return true   // already signed in
                pending[0]?.complete(false)
                val d = CompletableDeferred<Boolean>().also { pending[0] = it }
                launcher.launch(intent)
                return d.await()
            }
            override suspend fun logout() { vm.auth.signOut()?.let { endSessionLauncher.launch(it) } }
            override suspend fun accessToken(): String? = vm.auth.freshAccessToken()
        }
    }
    CadsApp(
        catalog = vm.catalog,
        api = vm.api,
        signedIn = signedIn,
        beforeRequest = { vm.auth.ensureFresh() },
        onSignIn = { vm.auth.signInIntent()?.let { launcher.launch(it) } },
        onSignOut = { vm.auth.signOut()?.let { endSessionLauncher.launch(it) } },
        duellFragment = vm.duellFragment,
        duellLinkSeq = vm.duellLinkSeq,
        peerToken = { vm.auth.accessToken() },
        onImmersive = onImmersive,
        account = account,
    )
}
