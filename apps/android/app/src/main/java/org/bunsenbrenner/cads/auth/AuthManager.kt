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
import net.openid.appauth.ClientAuthentication
import net.openid.appauth.EndSessionRequest
import net.openid.appauth.GrantTypeValues
import net.openid.appauth.ResponseTypeValues
import net.openid.appauth.TokenRequest
import net.openid.appauth.TokenResponse
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.bunsenbrenner.cads.BuildConfig
import kotlin.coroutines.resume

/**
 * One access token per resource server (RFC 9700 §2.3): Keycloak narrows the access token to the scope asked for on a
 * refresh (optional client scopes `ct-api` / `mdi-api`, each with its own audience), the refresh token keeps the full
 * grant. The control plane's token lives in [AuthState] (Rust core, peer channels); the wrapper's only in memory.
 */
enum class Resource(val scopeName: String) {
    ControlPlane("ct-api"), MyDailyIdea("mdi-api");
    val scope: String get() = "openid $scopeName"
}

/** Token endpoint errors that do not mean the grant is gone (RFC 9449 §8 nonce; a DPoP proof refused for a device clock off). */
fun keepsTokens(error: String?): Boolean = error == "invalid_dpop_proof" || error == "use_dpop_nonce"

/**
 * OIDC Authorization Code + PKCE (S256) in the system browser (Custom Tabs) via AppAuth, against
 * the Keycloak realm, as a public client without secret. AppAuth refuses non-https issuers.
 * Token, refresh and revocation requests carry a DPoP proof (RFC 9449) from a Keystore key made for this sign-in:
 * Keycloak binds the refresh token to it (client policy, runbook 2026-11-11-oidc-apps). The access token stays bearer.
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

    /** Issuer and client are configured (build properties). */
    val available: Boolean get() = BuildConfig.OIDC_ISSUER.startsWith("https://") && BuildConfig.OIDC_CLIENT_ID.isNotEmpty()

    private val tokenEndpoint = BuildConfig.OIDC_ISSUER + "/protocol/openid-connect/token"

    /** Public client (client_id in the body, no secret) plus a fresh DPoP proof for each request AppAuth makes. */
    private val dpopAuth = object : ClientAuthentication {
        override fun getRequestHeaders(clientId: String): Map<String, String> =
            KeystoreDPoPSigner.current()?.let { mapOf("DPoP" to DPoP.proof(it, "POST", tokenEndpoint)) } ?: emptyMap()
        override fun getRequestParameters(clientId: String): Map<String, String> = mapOf("client_id" to clientId)
    }

    private val ctLock = Mutex()
    private val mdiLock = Mutex()
    @Volatile private var mdiToken: Pair<String, Long>? = null   // token, expiry (ms since epoch)

    /** For the account bridge: a fresh token for the My Daily Idea wrapper only (aud mydailyidea-api), or null. */
    suspend fun freshAccessToken(): String? = mdiLock.withLock {
        if (!state.isAuthorized) return@withLock null
        mdiToken?.let { (t, exp) -> if (exp - System.currentTimeMillis() > 60_000) return@withLock t }
        val (resp, ex) = refresh(Resource.MyDailyIdea)
        if (resp?.accessToken != null) {
            mdiToken = resp.accessToken!! to (resp.accessTokenExpirationTime ?: (System.currentTimeMillis() + 300_000))
        } else onRefreshError(ex)
        mdiToken?.first?.takeIf { state.isAuthorized }
    }

    /** null when already signed in: a second sign-in would replace the device key the refresh token is bound to. */
    fun signInIntent(): Intent? {
        if (state.isAuthorized) return null
        KeystoreDPoPSigner.fresh() // a new device key per sign-in; without one the token request has no proof and Keycloak refuses
        val request = AuthorizationRequest.Builder(
            config,
            BuildConfig.OIDC_CLIENT_ID,
            ResponseTypeValues.CODE,
            Uri.parse(BuildConfig.REDIRECT_URI),
        ).setScope("openid email profile offline_access ${Resource.ControlPlane.scopeName} ${Resource.MyDailyIdea.scopeName}").build() // PKCE S256 is AppAuth's default
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
        service.performTokenRequest(response.createTokenExchangeRequest(), dpopAuth) { tokenResponse, tokenError ->
            state.update(tokenResponse, tokenError)
            // the exchange's access token names both services: replace it with the control plane's narrowed one
            state.needsTokenRefresh = true
            refreshCallback(Resource.ControlPlane) { resp, ex ->
                if (resp != null) state.update(resp, null)
                persist()
                onDone(state.isAuthorized)
            }
        }
    }

    /** Refreshes the control plane's access token when it is about to expire. Call before each API request. */
    suspend fun ensureFresh() = ctLock.withLock {
        if (!state.isAuthorized || !state.needsTokenRefresh) return@withLock
        val (resp, ex) = refresh(Resource.ControlPlane)
        if (resp != null) { state.update(resp, null); persist() } else onRefreshError(ex)
    }

    private fun refreshCallback(r: Resource, done: (TokenResponse?, AuthorizationException?) -> Unit) {
        val rt = state.refreshToken ?: return done(null, null)
        val req = TokenRequest.Builder(config, BuildConfig.OIDC_CLIENT_ID)
            .setGrantType(GrantTypeValues.REFRESH_TOKEN).setRefreshToken(rt).setScope(r.scope).build()
        service.performTokenRequest(req, dpopAuth) { resp, ex -> done(resp, ex) }
    }

    private suspend fun refresh(r: Resource): Pair<TokenResponse?, AuthorizationException?> =
        suspendCancellableCoroutine { cont -> refreshCallback(r) { resp, ex -> if (cont.isActive) cont.resume(resp to ex) } }

    /** invalid_grant and friends: signed out; a refused DPoP proof or a network error: keep the tokens, retry later. */
    private fun onRefreshError(ex: AuthorizationException?) {
        if (ex != null && ex.type == AuthorizationException.TYPE_OAUTH_TOKEN_ERROR && !keepsTokens(ex.error)) signOut()
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
        val revokeUrl = BuildConfig.OIDC_ISSUER + "/protocol/openid-connect/revoke"
        // sign before the key is deleted: the revocation must prove the key the refresh token is bound to
        val proof = KeystoreDPoPSigner.current()?.let { DPoP.proof(it, "POST", revokeUrl) }
        store.clear()
        KeystoreDPoPSigner.delete()
        mdiToken = null
        state = AuthState()
        _signedIn.value = false
        if (refresh != null) {
            Thread { Revocation.revoke(revokeUrl, refresh, BuildConfig.OIDC_CLIENT_ID, proof) }.start()
        }
        return endSession
    }

    private fun persist() {
        store.write(state.jsonSerializeString())
        _signedIn.value = state.isAuthorized
    }

    fun dispose() = service.dispose()
}
