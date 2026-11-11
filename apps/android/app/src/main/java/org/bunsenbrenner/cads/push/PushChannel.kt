package org.bunsenbrenner.cads.push

import org.json.JSONObject

/**
 * How this shell can wake the device ("Bescheid geben"). The page asks through `DuellHost.push()` and gets
 * [PushBridge.capability] as JSON (bridge v1, contract in apps/android/app/src/test/resources/bridge-push-v1.json).
 *
 * Implementations to come, each behind this interface and each needing something only the owner can provide:
 * FCM (Firebase project, google-services.json), UnifiedPush (a distributor app such as ntfy on the device; no account).
 * Until then [NoPush]: the page says honestly that the app cannot do it yet.
 *
 * Rules for every implementation: [enable] only after the page's own dialog said yes (then POST_NOTIFICATIONS on
 * Android 13+); a wake-up carries only its kind ([PushMessage.kindOf]), the text comes from the app's resources; no
 * background service of our own, no other kinds (no reminders, streaks or ads).
 */
interface PushChannel {
    /** "none" | "fcm" | "unifiedpush" */
    val kind: String

    /** "unsupported" | "default" | "granted" | "denied" */
    fun state(): String

    /** After the page's yes: asks the system, registers, answers "on" | "denied" | "none" | "error". */
    fun enable(onResult: (String) -> Unit)

    /** Unregisters and forgets the registration. */
    fun disable()
}

/** This build has no push provider. */
object NoPush : PushChannel {
    override val kind = "none"
    override fun state() = "unsupported"
    override fun enable(onResult: (String) -> Unit) = onResult("none")
    override fun disable() {}
}

object PushBridge {
    const val VERSION = 1
    val KINDS = setOf("none", "fcm", "unifiedpush", "apns")
    val STATES = setOf("unsupported", "default", "granted", "denied")
    private const val NONE = "{\"v\":1,\"kind\":\"none\",\"state\":\"unsupported\"}"

    /** What `DuellHost.push()` returns. Only listed values; anything else reads as "none", so the page never gets a stray string. */
    fun capability(kind: String, state: String): String =
        if (kind !in KINDS || state !in STATES || kind == "none") NONE else "{\"v\":$VERSION,\"kind\":\"$kind\",\"state\":\"$state\"}"

    fun capability(channel: PushChannel): String = capability(channel.kind, channel.state())
}

/** A wake-up message: only its kind counts. Whatever else it carries is never read or shown. */
object PushMessage {
    val KINDS = setOf("reply", "live")

    /** "reply" | "live" | null (show the neutral sentence). */
    fun kindOf(payload: String?): String? {
        if (payload.isNullOrEmpty() || payload.length > 4096) return null
        val r = try { JSONObject(payload).opt("r") } catch (_: Exception) { null }
        return (r as? String)?.takeIf { it in KINDS }
    }
}
