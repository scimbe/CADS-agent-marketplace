package org.bunsenbrenner.cads.duell

import org.bunsenbrenner.cads.BuildConfig
import uniffi.mobile_core.PeerConfig
import uniffi.mobile_core.PeerEvent
import uniffi.mobile_core.PeerException
import uniffi.mobile_core.PeerSession
import uniffi.mobile_core.peerAcceptInvite
import uniffi.mobile_core.peerCreateInvite
import uniffi.mobile_core.peerDisconnect
import java.util.Base64

/** Binds [PeerPort] to mobile-core. Null without the production front door and edge CA: the page then says so. */
class PeerCoreAdapter private constructor(private val config: PeerConfig) : PeerPort {
    override fun invite(token: String): Pair<String, String> = guarded { peerCreateInvite(config, token).let { it.link to it.contactJson } }
    override fun accept(coreLink: String): String = guarded { peerAcceptInvite(config, coreLink) }
    override fun revoke(contact: String) = guarded { peerDisconnect(config, contact) }
    override fun connect(contact: String, waitSecs: Long): PeerConnection = guarded {
        Session(PeerSession.connect(config, contact, emptyList(), listOf(PeerBridge.NS), waitSecs.toULong()))
    }

    private class Session(private val s: PeerSession) : PeerConnection {
        override val code: String = s.verificationCode()
        override val contact: String = s.contactJson()
        override fun send(ns: String, body: String) = guarded { s.sendApp(ns, body) }
        override fun leave() = guarded { s.leave() }
        override fun decline(id: Long) = guarded { s.decline(id.toULong()) }
        override fun dispose() = s.close()
        override fun next(waitMs: Long): PeerIn? = when (val e = s.nextEvent(waitMs.toULong())) {
            null -> null
            is PeerEvent.App -> PeerIn.App(e.ns, e.bodyJson)
            is PeerEvent.ApprovalNeeded -> PeerIn.Approval(e.id.toLong())
            PeerEvent.PeerLeft -> PeerIn.PeerLeft
            PeerEvent.Closed -> PeerIn.Closed
            else -> PeerIn.Ignored // free text and capability results have no place in this feature
        }
    }

    companion object {
        fun fromBuild(): PeerCoreAdapter? {
            val door = BuildConfig.PEER_FRONT_DOOR
            val ca = try { Base64.getDecoder().decode(BuildConfig.PEER_EDGE_CA_B64) } catch (_: IllegalArgumentException) { ByteArray(0) }
            if (door.isBlank() || ca.isEmpty()) return null
            return PeerCoreAdapter(PeerConfig(BuildConfig.API_BASE, door, ca, BuildConfig.PEER_SNI))
        }

        private inline fun <T> guarded(block: () -> T): T = try {
            block()
        } catch (e: PeerException) {
            throw PeerFailure(
                when (e) {
                    is PeerException.Unauthorized -> "login"
                    is PeerException.LinkUsed -> "used"
                    is PeerException.LinkExpired -> "expired"
                    is PeerException.LinkInvalid -> "invalid"
                    is PeerException.PeerOffline -> "offline"
                    is PeerException.Network -> "network"
                    else -> "failed"
                },
            )
        }
    }
}
