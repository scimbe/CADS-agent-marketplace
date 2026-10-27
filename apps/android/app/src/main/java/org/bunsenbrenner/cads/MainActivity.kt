package org.bunsenbrenner.cads

import android.app.Application
import android.os.Bundle
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

    override fun onCleared() {
        auth.dispose()
    }
}

class MainActivity : ComponentActivity() {
    private val vm: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { Root(vm) }
    }
}

@Composable
private fun Root(vm: AppViewModel) {
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
    )
}
