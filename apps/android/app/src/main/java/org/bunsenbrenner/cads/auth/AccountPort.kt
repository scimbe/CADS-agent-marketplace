package org.bunsenbrenner.cads.auth

/** What the account bridge needs from the app's one login (AuthManager + the activity that launches the browser). */
interface AccountPort {
    /** Issuer and client are configured, so there is a sign-in to offer. */
    val available: Boolean
    fun signedIn(): Boolean
    /** Runs the OIDC sign-in in the system browser; true when signed in afterwards (false when cancelled). */
    suspend fun login(): Boolean
    /** Clears tokens and the device key, revokes the refresh token, ends the browser session. */
    suspend fun logout()
    /** A fresh access token, or null when signed out. Never handed to the page. */
    suspend fun accessToken(): String?
}
