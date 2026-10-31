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
import org.bunsenbrenner.cads.duell.DuellLink
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.AndroidViewModel
import org.bunsenbrenner.cads.auth.AuthManager
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
        if (savedInstanceState == null) vm.onLink(intent)
        setContent { Root(vm, ::setImmersive) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        vm.onLink(intent)
    }

    /** Full screen in the game: system bars hidden, shown briefly by a swipe from the edge. */
    private fun setImmersive(on: Boolean) {
        val c = WindowInsetsControllerCompat(window, window.decorView)
        c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        if (on) c.hide(WindowInsetsCompat.Type.systemBars()) else c.show(WindowInsetsCompat.Type.systemBars())
    }
}

@Composable
private fun Root(vm: AppViewModel, onImmersive: (Boolean) -> Unit) {
    val signedIn by vm.auth.signedIn.collectAsState()
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        vm.auth.handleSignInResult(result.data) { /* signedIn flow updates the UI */ }
    }
    val endSessionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { /* result not needed */ }
    CadsApp(
        catalog = vm.catalog,
        api = vm.api,
        signedIn = signedIn,
        beforeRequest = { vm.auth.ensureFresh() },
        onSignIn = { launcher.launch(vm.auth.signInIntent()) },
        onSignOut = { vm.auth.signOut()?.let { endSessionLauncher.launch(it) } },
        duellFragment = vm.duellFragment,
        duellLinkSeq = vm.duellLinkSeq,
        onImmersive = onImmersive,
    )
}
