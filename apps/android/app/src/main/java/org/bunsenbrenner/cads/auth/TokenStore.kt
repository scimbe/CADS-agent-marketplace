package org.bunsenbrenner.cads.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Persists the AppAuth state (access/refresh token) in EncryptedSharedPreferences. The AES-256
 * master key lives in the Android Keystore; the file is excluded from backup and device transfer
 * (see data_extraction_rules.xml). Nothing here is ever logged.
 */
class TokenStore(context: Context) {
    private val prefs: SharedPreferences = run {
        val key = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        EncryptedSharedPreferences.create(
            context,
            "cads_auth",
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun read(): String? = prefs.getString(KEY, null)

    fun write(json: String) {
        prefs.edit().putString(KEY, json).apply()
    }

    fun clear() {
        prefs.edit().remove(KEY).apply()
    }

    private companion object {
        const val KEY = "auth_state"
    }
}
