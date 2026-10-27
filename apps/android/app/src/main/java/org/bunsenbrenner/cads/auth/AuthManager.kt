package org.bunsenbrenner.cads.auth

import android.content.Context
import android.content.Intent
import android.net.Uri
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import net.openid.appauth.AuthState
import net.openid.appauth.AuthorizationException
import net.openid.appauth.AuthorizationRequest
import net.openid.appauth.AuthorizationResponse
import net.openid.appauth.AuthorizationService
import net.openid.appauth.AuthorizationServiceConfiguration
import net.openid.appauth.ResponseTypeValues
import org.bunsenbrenner.cads.BuildConfig
import kotlin.coroutines.resume

/**
 * OIDC Authorization Code + PKCE (S256) in the system browser (Custom Tabs) via AppAuth, against
 * the Keycloak realm, as a public client without secret. AppAuth refuses non-https issuers.
 */
class AuthManager(context: Context) {
    private val store = TokenStore(context)
    private val service = AuthorizationService(context)
    private var state: AuthState = store.read()?.let { runCatching { AuthState.jsonDeserialize(it) }.getOrNull() } ?: AuthState()
    private val _signedIn = MutableStateFlow(state.isAuthorized)
    val signedIn: StateFlow<Boolean> = _signedIn

    private val config = AuthorizationServiceConfiguration(
        Uri.parse(BuildConfig.OIDC_ISSUER + "/protocol/openid-connect/auth"),
        Uri.parse(BuildConfig.OIDC_ISSUER + "/protocol/openid-connect/token"),
    )

    /** Synchronous read for the Rust client's token callback (runs on a background thread). */
    fun accessToken(): String? = state.accessToken

    fun signInIntent(): Intent {
        val request = AuthorizationRequest.Builder(
            config,
            BuildConfig.OIDC_CLIENT_ID,
            ResponseTypeValues.CODE,
            Uri.parse(BuildConfig.REDIRECT_URI),
        ).setScope("openid email profile offline_access").build() // PKCE S256 is AppAuth's default
        return service.getAuthorizationRequestIntent(request)
    }

    /** Completes the code exchange after the browser returned. `onDone(true)` when signed in. */
    fun handleSignInResult(data: Intent?, onDone: (Boolean) -> Unit) {
        val response = data?.let { AuthorizationResponse.fromIntent(it) }
        val error = data?.let { AuthorizationException.fromIntent(it) }
        if (response == null) {
            onDone(false)
            return
        }
        state.update(response, error)
        service.performTokenRequest(response.createTokenExchangeRequest()) { tokenResponse, tokenError ->
            state.update(tokenResponse, tokenError)
            persist()
            onDone(state.isAuthorized)
        }
    }

    /** Refreshes the access token when it is about to expire. Call before each API request. */
    suspend fun ensureFresh() {
        if (!state.isAuthorized) return
        suspendCancellableCoroutine { cont ->
            state.performActionWithFreshTokens(service) { _, _, ex ->
                if (ex != null && ex.type == AuthorizationException.TYPE_OAUTH_TOKEN_ERROR) {
                    signOut() // refresh token revoked or expired
                } else {
                    persist()
                }
                if (cont.isActive) cont.resume(Unit)
            }
        }
    }

    fun signOut() {
        store.clear()
        state = AuthState()
        _signedIn.value = false
    }

    private fun persist() {
        store.write(state.jsonSerializeString())
        _signedIn.value = state.isAuthorized
    }

    fun dispose() = service.dispose()
}
