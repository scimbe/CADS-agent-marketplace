package org.bunsenbrenner.cads.duell

/** What the shared channel core can do, narrowed to what "Zusammen bauen" needs. [PeerCoreAdapter] binds it to mobile-core. */
interface PeerPort {
    /** Link in the core's form and the secret contact JSON. */
    fun invite(token: String): Pair<String, String>
    fun accept(coreLink: String): String
    fun connect(contact: String, waitSecs: Long): PeerConnection
    fun revoke(contact: String)
}

interface PeerConnection {
    val code: String
    val contact: String
    fun send(ns: String, body: String)
    fun leave()
    fun decline(id: Long)
    fun next(waitMs: Long): PeerIn?
    fun dispose()
}

sealed interface PeerIn {
    data class App(val ns: String, val body: String) : PeerIn
    data class Approval(val id: Long) : PeerIn
    data object PeerLeft : PeerIn
    data object Closed : PeerIn
    data object Ignored : PeerIn
}

/** `code` is the closed set the page understands: login, used, expired, invalid, offline, failed. */
class PeerFailure(val code: String) : Exception(code)

/**
 * The session behind `DuellHost.peer*`. It carries only structured frames of one namespace. Free text and every
 * capability request stop here, the contact stays in memory, and nothing is logged. Blocking calls run on [spawn].
 */
class PeerBridge(
    private val port: PeerPort?,
    private val token: () -> String?,
    private val emit: (String) -> Unit,
    private val spawn: (() -> Unit) -> Unit,
    private val now: () -> Long = System::currentTimeMillis,
) {
    private val lock = Any()
    private var generation = 0L
    private var live: PeerConnection? = null
    private var contact: String? = null
    private var inviter = false

    val ready: Boolean get() = port != null

    fun invite() {
        val core = port ?: return
        val gen = begin()
        spawn {
            try {
                val bearer = token() ?: throw PeerFailure("login")
                val (link, secret) = core.invite(bearer)
                val shareable = DuellLink.shareLink(link) ?: throw PeerFailure("failed")
                synchronized(lock) { if (gen != generation) return@spawn; contact = secret; inviter = true }
                emit(PeerJson.invite(shareable))
                run(core, gen, secret, WAIT_INVITE_MS)
            } catch (e: PeerFailure) { failed(gen, e.code) }
        }
    }

    fun accept(link: String?) {
        val core = port ?: return
        val coreLink = DuellLink.coreLink(link) ?: run { emit(PeerJson.error("invalid")); return }
        val gen = begin()
        spawn {
            try {
                val secret = core.accept(coreLink)
                synchronized(lock) { if (gen != generation) return@spawn; contact = secret; inviter = false }
                run(core, gen, secret, WAIT_ACCEPT_MS)
            } catch (e: PeerFailure) { failed(gen, e.code) }
        }
    }

    /** Oversized or empty frames are dropped here; the core refuses anything that is not JSON. */
    fun send(frame: String?) {
        if (frame.isNullOrEmpty() || frame.toByteArray().size > MAX_FRAME) return
        val c = synchronized(lock) { live } ?: return
        spawn { try { c.send(NS, frame) } catch (_: PeerFailure) { /* the digest repairs what got lost */ } }
    }

    /** "Verlassen": tells the peer while connected. The inviter also revokes the grant, which needs no login. */
    fun leave() {
        val c: PeerConnection?
        val secret: String?
        val revoke: Boolean
        synchronized(lock) {
            generation += 1; c = live; live = null; secret = contact; contact = null; revoke = inviter; inviter = false
        }
        val core = port ?: return
        if (c == null && secret == null) return
        spawn {
            try { c?.leave() } catch (_: PeerFailure) { /* already gone */ }
            if (revoke && secret != null) try { core.revoke(secret) } catch (_: PeerFailure) { /* the grant ends by itself */ }
        }
    }

    private fun begin(): Long { leave(); return synchronized(lock) { generation } }
    private fun stale(gen: Long) = synchronized(lock) { gen != generation }
    private fun failed(gen: Long, code: String) { if (!stale(gen)) { synchronized(lock) { contact = null }; emit(PeerJson.error(code)) } }

    private fun run(core: PeerPort, gen: Long, first: String, firstWaitMs: Long) {
        var secret = first
        var deadline = now() + firstWaitMs
        while (!stale(gen)) {
            val c = try {
                core.connect(secret, JOIN_SECS)
            } catch (e: PeerFailure) {
                if (e.code != "offline" && e.code != "network") { failed(gen, e.code); return }
                if (now() >= deadline) { failed(gen, "offline"); return }
                continue
            }
            val current = synchronized(lock) {
                if (gen != generation) null else { live = c; secret = c.contact; contact = c.contact; c }
            }
            if (current == null) { c.dispose(); return }
            emit(PeerJson.connected(c.code))
            val again = pump(c, gen)
            synchronized(lock) { if (live === c) live = null }
            c.dispose()
            if (!again) return
            emit(PeerJson.RECONNECTING)
            deadline = now() + WAIT_RECONNECT_MS
        }
    }

    /** True when the link broke and is worth another try. */
    private fun pump(c: PeerConnection, gen: Long): Boolean {
        while (!stale(gen)) {
            when (val e = c.next(POLL_MS)) {
                is PeerIn.App -> if (e.ns == NS) emit(PeerJson.message(e.body))
                is PeerIn.Approval -> try { c.decline(e.id) } catch (_: PeerFailure) { /* closing anyway */ }
                PeerIn.PeerLeft -> { emit(PeerJson.PEER_LEFT); synchronized(lock) { contact = null }; return false }
                PeerIn.Closed -> return true
                PeerIn.Ignored, null -> {}
            }
        }
        return false
    }

    companion object {
        const val NS = "mdi.collab.v1"
        const val MAX_FRAME = 16 * 1024
        const val JOIN_SECS = 15L
        const val POLL_MS = 300L
        const val WAIT_INVITE_MS = 10 * 60 * 1000L
        const val WAIT_ACCEPT_MS = 60 * 1000L
        const val WAIT_RECONNECT_MS = 2 * 60 * 1000L
    }
}

/** Events for `window.DuellPeer.onPeerMessage`, as text, because org.json does not exist in plain JVM tests. */
object PeerJson {
    const val RECONNECTING = """{"t":"reconnecting"}"""
    const val PEER_LEFT = """{"t":"peer-left"}"""
    fun invite(link: String) = """{"t":"invite","link":${quote(link)}}"""
    fun connected(code: String) = """{"t":"connected","code":${quote(code)}}"""
    fun message(body: String) = """{"t":"msg","body":${quote(body)}}"""
    fun error(code: String) = """{"t":"error","e":${quote(code)}}"""
    /** The call into the page. The argument is a JSON string, which is also a safe JavaScript literal. */
    fun call(json: String) = "window.DuellPeer&&window.DuellPeer.onPeerMessage(${quote(json)})"

    fun quote(s: String): String = buildString(s.length + 8) {
        append('"')
        for (c in s) when {
            c == '"' -> append("\\\"")
            c == '\\' -> append("\\\\")
            c < ' ' || c == ' ' || c == ' ' -> append("\\u").append(c.code.toString(16).padStart(4, '0'))
            else -> append(c)
        }
        append('"')
    }
}
