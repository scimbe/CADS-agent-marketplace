package org.bunsenbrenner.cads.data

import android.content.Context
import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.bunsenbrenner.cads.BuildConfig
import org.bunsenbrenner.cads.R
import uniffi.mobile_core.InstallationInput
import uniffi.mobile_core.InstallationRecord
import uniffi.mobile_core.InstallationsClient
import uniffi.mobile_core.MobileException
import uniffi.mobile_core.TargetRecord
import uniffi.mobile_core.TemplateInfo
import uniffi.mobile_core.TokenProvider
import uniffi.mobile_core.verifyPromptTemplate

/** A bundled, signed template. `info` is null when verification failed (shown as untrusted). */
data class CatalogEntry(val id: String, val json: String, val info: TemplateInfo?, val failure: String?)

object Catalog {
    /** Bundled samples (assets). Later: fetched from the registry through the same verification. */
    fun bundled(context: Context): List<CatalogEntry> =
        (context.assets.list("") ?: emptyArray()).filter { it.endsWith(".json") }.sorted().mapNotNull { name ->
            val json = runCatching { context.assets.open(name).bufferedReader().use { it.readText() } }.getOrNull()
                ?: return@mapNotNull null
            try {
                val info = verifyPromptTemplate(json)
                CatalogEntry(info.templateId, json, info, null)
            } catch (e: MobileException) {
                CatalogEntry(name, json, null, e.message)
            }
        }
}

/** The calls the UI needs; the Rust client is the production implementation. */
interface InstallationsApi {
    suspend fun list(): List<InstallationRecord>
    suspend fun get(id: String): InstallationRecord
    suspend fun create(input: InstallationInput): InstallationRecord
    suspend fun update(id: String, ifMatch: Long, input: InstallationInput): InstallationRecord
    suspend fun delete(id: String, ifMatch: Long?)
    suspend fun duplicate(id: String): InstallationRecord
}

class RustInstallationsApi(tokens: () -> String?) : InstallationsApi {
    private val client = InstallationsClient(
        BuildConfig.API_BASE,
        object : TokenProvider {
            override fun accessToken(): String? = tokens()
        },
    )

    // The Rust calls block; keep them off the main thread.
    private suspend fun <T> io(f: () -> T): T = withContext(Dispatchers.IO) { f() }

    override suspend fun list() = io { client.list(null, 50u, 0u).items }
    override suspend fun get(id: String) = io { client.get(id) }
    override suspend fun create(input: InstallationInput) = io { client.create(input) }
    override suspend fun update(id: String, ifMatch: Long, input: InstallationInput) = io { client.update(id, ifMatch, input) }
    override suspend fun delete(id: String, ifMatch: Long?) = io { client.delete(id, ifMatch) }
    override suspend fun duplicate(id: String) = io { client.duplicate(id, null) }
}

fun deviceTarget() = TargetRecord(os = "android", deviceLabel = Build.MODEL ?: "", agentHolderPubkey = null)

/** Short, user-facing text; never contains customer values or tokens. */
fun MobileException.userMessageRes(): Int = when (this) {
    is MobileException.Unauthorized -> R.string.err_unauthorized
    is MobileException.NotFound -> R.string.err_notfound
    is MobileException.Conflict -> R.string.err_conflict
    is MobileException.Network -> R.string.err_network
    is MobileException.BadSignature -> R.string.err_badsignature
    is MobileException.Expired -> R.string.err_expired
    else -> R.string.err_generic
}
