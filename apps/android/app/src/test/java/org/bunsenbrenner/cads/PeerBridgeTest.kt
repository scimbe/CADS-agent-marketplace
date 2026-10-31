package org.bunsenbrenner.cads

import org.bunsenbrenner.cads.duell.DuellLink
import org.bunsenbrenner.cads.duell.PeerBridge
import org.bunsenbrenner.cads.duell.PeerConnection
import org.bunsenbrenner.cads.duell.PeerFailure
import org.bunsenbrenner.cads.duell.PeerIn
import org.bunsenbrenner.cads.duell.PeerJson
import org.bunsenbrenner.cads.duell.PeerPort
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PeerBridgeTest {
    private val frag = "abcDEF012-_".repeat(10)
    private val core = "https://bunsenbrenner.org/p#$frag"
    private val shared = "https://bunsenbrenner.org/duell#p=$frag"

    private class Conn(events: List<PeerIn?>, override val code: String = "1234 5678") : PeerConnection {
        val queue = ArrayDeque(events); val sent = mutableListOf<String>(); val declined = mutableListOf<Long>(); var left = 0; var disposed = 0
        override val contact = "pinned"
        override fun send(ns: String, body: String) { sent += "$ns $body" }
        override fun leave() { left += 1 }
        override fun decline(id: Long) { declined += id }
        var onNext: (() -> Unit)? = null
        override fun next(waitMs: Long): PeerIn? { onNext?.let { it(); return null }; return queue.removeFirstOrNull() ?: PeerIn.Closed }
        override fun dispose() { disposed += 1 }
    }
    private class Port(val conns: ArrayDeque<Any>, val failInvite: String? = null, val failAccept: String? = null) : PeerPort {
        val accepted = mutableListOf<String>(); val revoked = mutableListOf<String>()
        override fun invite(token: String): Pair<String, String> { failInvite?.let { throw PeerFailure(it) }; return "https://bunsenbrenner.org/p#" + "abcDEF012-_".repeat(10) to "secret" }
        override fun accept(coreLink: String): String { failAccept?.let { throw PeerFailure(it) }; accepted += coreLink; return "secret" }
        override fun connect(contact: String, waitSecs: Long): PeerConnection = when (val c = conns.removeFirstOrNull() ?: PeerFailure("failed")) { is PeerFailure -> throw c; else -> c as PeerConnection }
        override fun revoke(contact: String) { revoked += contact }
    }
    private fun bridge(p: PeerPort?, out: MutableList<String>, t: String? = "tok", clock: () -> Long = { 0L }) =
        PeerBridge(p, { t }, { out += it }, { it() }, clock)

    @Test fun invite_shows_the_duell_link_never_the_core_link_and_connects() {
        val c = Conn(listOf(PeerIn.PeerLeft)); val out = mutableListOf<String>()
        bridge(Port(ArrayDeque(listOf(c))), out).invite()
        assertEquals(PeerJson.invite(shared), out[0])
        assertEquals(PeerJson.connected("1234 5678"), out[1])
        assertEquals(PeerJson.PEER_LEFT, out[2])
    }
    @Test fun no_account_means_login_and_no_control_plane_call() {
        val out = mutableListOf<String>()
        bridge(Port(ArrayDeque(), failInvite = "wrong"), out, t = null).invite()
        assertEquals(listOf(PeerJson.error("login")), out)
    }
    @Test fun accept_passes_the_core_form_and_reports_a_used_link() {
        val out = mutableListOf<String>(); val p = Port(ArrayDeque(), failAccept = "used")
        bridge(p, out).accept(shared)
        assertEquals(listOf(PeerJson.error("used")), out)
        val ok = Port(ArrayDeque(listOf(Conn(listOf(PeerIn.PeerLeft))))); bridge(ok, mutableListOf()).accept(shared)
        assertEquals(listOf(core), ok.accepted)
    }
    @Test fun foreign_links_never_reach_the_core() {
        val p = Port(ArrayDeque()); val out = mutableListOf<String>(); val b = bridge(p, out)
        for (l in listOf(null, "https://evil.example/duell#p=$frag", "https://bunsenbrenner.org/duell#c=abc", "https://bunsenbrenner.org/duell#p=short", "http://bunsenbrenner.org/duell#p=$frag")) b.accept(l)
        assertTrue(p.accepted.isEmpty()); assertTrue(out.all { it == PeerJson.error("invalid") })
    }
    @Test fun only_frames_of_our_namespace_reach_the_page_free_text_and_requests_stop_here() {
        val c = Conn(listOf(PeerIn.Ignored, PeerIn.App("other", "{}"), PeerIn.App(PeerBridge.NS, "{\"v\":1}"), PeerIn.Approval(7), null, PeerIn.PeerLeft)); val out = mutableListOf<String>()
        bridge(Port(ArrayDeque(listOf(c))), out).accept(shared)
        assertEquals(listOf(PeerJson.connected("1234 5678"), PeerJson.message("{\"v\":1}"), PeerJson.PEER_LEFT), out)
        assertEquals(listOf(7L), c.declined)
    }
    @Test fun a_lost_link_reconnects_with_the_pinned_contact() {
        val a = Conn(listOf(PeerIn.Closed)); val b = Conn(listOf(PeerIn.PeerLeft), "1234 5678"); val out = mutableListOf<String>()
        bridge(Port(ArrayDeque(listOf(a, PeerFailure("network"), b))), out).accept(shared)
        assertEquals(listOf(PeerJson.connected("1234 5678"), PeerJson.RECONNECTING, PeerJson.connected("1234 5678"), PeerJson.PEER_LEFT), out)
        assertEquals(1, a.disposed)
    }
    @Test fun nobody_comes_ends_in_offline_after_the_wait() {
        var t = 0L; val conns = ArrayDeque<Any>(); repeat(3) { conns += PeerFailure("offline") }; val out = mutableListOf<String>()
        bridge(Port(conns), out, clock = { t.also { t += PeerBridge.WAIT_ACCEPT_MS } }).accept(shared)
        assertEquals(PeerJson.error("offline"), out.last())
    }
    private fun leaveDuringSession(asInviter: Boolean): Pair<Conn, Port> {
        val c = Conn(emptyList()); val p = Port(ArrayDeque(listOf(c))); var b: PeerBridge? = null
        c.onNext = { b!!.leave() }
        b = bridge(p, mutableListOf()); if (asInviter) b.invite() else b.accept(shared)
        return c to p
    }
    @Test fun leaving_as_inviter_says_bye_and_revokes_the_grant() {
        val (c, p) = leaveDuringSession(true); assertEquals(1, c.left); assertEquals(listOf("pinned"), p.revoked)
    }
    @Test fun leaving_as_invitee_only_says_bye() {
        val (c, p) = leaveDuringSession(false); assertEquals(1, c.left); assertTrue(p.revoked.isEmpty())
    }
    @Test fun oversized_frames_are_dropped() {
        val c = Conn(emptyList()); val b = bridge(Port(ArrayDeque(listOf(c))), mutableListOf())
        b.send("x".repeat(PeerBridge.MAX_FRAME + 1)); b.send(""); b.send(null)
        assertTrue(c.sent.isEmpty())
    }
    @Test fun without_production_values_nothing_is_ready() {
        assertFalse(bridge(null, mutableListOf()).ready); assertTrue(bridge(Port(ArrayDeque()), mutableListOf()).ready)
    }
    @Test fun the_call_into_the_page_is_a_closed_literal() {
        val s = PeerJson.call("\"});alert(1)// \n")
        assertFalse(s.contains(" ")); assertFalse(s.contains("\n"))
        assertTrue(s.contains("\\\"});alert(1)//\\u2028\\u000a"))
    }
    @Test fun link_forms_map_both_ways_and_the_share_sheet_accepts_only_the_duell_form() {
        assertEquals(shared, DuellLink.shareLink(core)); assertEquals(core, DuellLink.coreLink(shared))
        assertNull(DuellLink.shareLink("https://evil.example/p#$frag")); assertNull(DuellLink.coreLink(core))
        assertTrue(DuellLink.isShareable(shared)); assertEquals("p=$frag", DuellLink.fragmentOf(shared))
    }
}
