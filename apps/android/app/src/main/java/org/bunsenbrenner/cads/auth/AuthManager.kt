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
import net.openid.appauth.EndSessionRequest
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
        null,
        Uri.parse(BuildConfig.OIDC_ISSUER + "/protocol/openid-connect/logout"),
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

    /**
     * Clears all local token state at once and revokes the refresh token at Keycloak in the
     * background. Returns an intent that ends the Keycloak browser session (end_session with the
     * ID token hint) or null when there is none; the caller launches it and may ignore its result.
     */
    fun signOut(): Intent? {
        val refresh = state.refreshToken
        val idToken = state.idToken
        val endSession = idToken?.let {
            service.getEndSessionRequestIntent(
                EndSessionRequest.Builder(config)
                    .setIdTokenHint(it)
                    .setPostLogoutRedirectUri(Uri.parse(BuildConfig.REDIRECT_URI))
                    .build(),
            )
        }
        store.clear()
        state = AuthState()
        _signedIn.value = false
        if (refresh != null) {
            Thread { Revocation.revoke(BuildConfig.OIDC_ISSUER + "/protocol/openid-connect/revoke", refresh, BuildConfig.OIDC_CLIENT_ID) }.start()
        }
        return endSession
    }

    private fun persist() {
        store.write(state.jsonSerializeString())
        _signedIn.value = state.isAuthorized
    }

    fun dispose() = service.dispose()
}
