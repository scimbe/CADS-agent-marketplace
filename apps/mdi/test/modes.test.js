// Gleiche Karte in allen Modi ohne Kartensonderlogik: EIN Treiber, der nur den Vertrag (moves/observe/status) und
// die Statechart kennt. Er laeuft fuer jede Karte und jeden Modus, den ihr Manifest ergibt.
import test from "node:test";
import assert from "node:assert/strict";
import { ORDER, cardOf, modesOf } from "../src/cards/index.js";
import { testRuntime, counter, fakeLiveNet, until, tick } from "./helpers.js";
import { leaf } from "../src/ui/view.js";

const L = (rt) => leaf(rt.state);
// Ein Zug: der erste legale Zug des Sitzes, den das Geraet gerade zeigt (kartenunabhaengig)
function playTurns(rt) {
  // Abdecken auch vor dem ersten Zug (ADR 0001 f, 13 §6.4): erst aufdecken, dann spielen
  if (rt.matches("inhalt.card.play.cover")) rt.dispatch("COVER_OK");
  for (let i = 0; i < 100 && rt.matches("inhalt.card.play.turn"); i++) {
    const c = cardOf(rt.state.ctx.cardId), v = rt.state.ctx.viewer;
    const mv = c.moves(c.observe(rt.state.ctx.session.state, v), v);
    rt.dispatch({ type: "INPUT", input: mv[mv.length - 1] });
    if (rt.matches("inhalt.card.play.cover")) rt.dispatch("COVER_OK");
  }
}
/** Geheimnis-Pruefung: auf dem Geraet stehen fremde private Teile nie vor der Aufloesung. */
function noForeignSecret(rt) {
  const s = rt.state.ctx.session; if (!s) return;
  const c = cardOf(s.card);
  for (const seat of c.manifest.secretSeats || []) if (!s.mine.includes(seat) && !s.log.some((x) => x.t === "reveal" && x.seat === seat)) assert.equal(s.state.priv[seat], null, "fremdes Geheimnis auf dem Geraet");
}

async function scenario(id, mode) {
  const c = cardOf(id), A = testRuntime({ entropy: counter("a"), async: true }), net = fakeLiveNet();
  const B = testRuntime({ entropy: counter("b"), async: true, live: net.loader });
  const A2 = mode === "live" ? testRuntime({ entropy: counter("c"), async: true, live: net.loader }) : null;
  const a = A2 || A;
  a.dispatch({ type: "OPEN", id }); a.dispatch({ type: "MODE", mode }); a.dispatch("GO");
  const sent = [];
  if (mode === "alone") { playTurns(a); await until(() => L(a) === "card.play.over"); return { a }; }
  if (mode === "bot") {
    for (let i = 0; i < 50 && L(a) !== "card.play.over"; i++) { await until(() => ["card.play.turn", "card.play.over"].includes(L(a))); noForeignSecret(a); playTurns(a); }
    await until(() => L(a) === "card.play.over"); noForeignSecret(a); return { a };
  }
  if (mode === "link") {
    // Hin und her per Link, bis beide das Ende sehen; der Treiber gibt nur Links weiter
    const devs = [a, B];
    let from = 0;
    if (c.manifest.mode === "static") {
      assert.equal(L(a), "card.share"); a.dispatch("SHARE"); await until(() => a.shared.length >= 2);
      B.link(a.shared[a.shared.length - 1]); assert.equal(L(B), "receive.show"); B.dispatch("ACCEPT"); assert.equal(L(B), "card.view");
      assert.deepEqual(B.state.ctx.params[id], a.state.ctx.params[id] || B.state.ctx.params[id]);
      return { a, b: B, sent: a.shared };
    }
    for (let hop = 0; hop < 10; hop++) {
      const d = devs[from], o = devs[1 - from];
      playTurns(d); noForeignSecret(d);
      if (L(d) === "card.play.over" && !d.state.ctx.link) break;
      const n = d.shared.length; d.dispatch("SHARE"); await until(() => d.shared.length > n);
      const link = d.shared[d.shared.length - 1]; sent.push(link);
      if (L(d) === "card.play.send") d.dispatch("SENT");
      o.link(link); assert.equal(L(o), "receive.show", o.state.ctx.reason); o.dispatch("ACCEPT"); noForeignSecret(o);
      if (L(d) === "card.play.over" && L(o) === "card.play.over") break;
      from = 1 - from;
    }
    assert.equal(L(a), "card.play.over"); assert.equal(L(B), "card.play.over");
    return { a, b: B, sent };
  }
  if (mode === "live") {
    await until(() => a.state.ctx.raum && a.state.ctx.raum.inviteLink);
    B.link(a.state.ctx.raum.inviteLink); assert.equal(L(B), "receive.live"); B.dispatch("ACCEPT");
    if (c.manifest.mode === "static") { await until(() => L(B) === "receive.show"); B.dispatch("ACCEPT"); assert.equal(L(B), "card.view"); return { a, b: B, wire: net.wire }; }
    for (let i = 0; i < 200 && !(L(a) === "card.play.over" && L(B) === "card.play.over"); i++) { await tick(); noForeignSecret(a); noForeignSecret(B); playTurns(a); playTurns(B); }
    await until(() => L(a) === "card.play.over" && L(B) === "card.play.over");
    return { a, b: B, wire: net.wire };
  }
  throw new Error("Modus " + mode);
}

for (const id of ORDER) for (const mode of modesOf(cardOf(id))) {
  test("Karte " + id + " im Modus " + mode + " – derselbe Treiber, keine Sonderlogik", async () => {
    const r = await scenario(id, mode);
    for (const d of [r.a, r.b].filter(Boolean)) assert.equal(d.state.ctx.error, null);
    if (r.a.state.ctx.session && r.b && r.b.state.ctx.session) assert.equal(JSON.stringify(r.a.state.ctx.session.state.pub), JSON.stringify(r.b.state.ctx.session.state.pub), "beide sehen dasselbe Ende");
    // Netz/Link sehen vor der Aufloesung nie ein Salz
    const salts = [r.a, r.b].filter(Boolean).flatMap((d) => d.storage.dump().map((e) => e.salt).filter(Boolean)).concat([r.a, r.b].filter(Boolean).flatMap((d) => d.state.ctx.session ? Object.values(d.state.ctx.session.secrets) : []));
    const traffic = (r.wire || []).concat(r.sent || []);
    for (const t of traffic) {
      const isReveal = /"t":"reveal"/.test(t) || (t.startsWith("#v2.challenge.") && Buffer.from(t.split(".")[2], "base64url").toString().includes('"reveal"'));
      if (!isReveal) for (const s of salts) assert.ok(!t.includes(s) && !Buffer.from(t.split(".")[2] || "", "base64url").toString().includes(s), "Salz vor Aufloesung uebertragen");
    }
  });
}

test("Live: Abweichender Zustandshash beendet ehrlich statt still weiterzuspielen", async () => {
  const net = fakeLiveNet(), A = testRuntime({ entropy: counter("d"), async: true, live: net.loader }), B = testRuntime({ entropy: counter("e"), async: true, live: net.loader });
  A.dispatch({ type: "OPEN", id: "bluff" }); A.dispatch({ type: "MODE", mode: "live" }); A.dispatch("GO");
  await until(() => A.state.ctx.raum && A.state.ctx.raum.inviteLink);
  B.link(A.state.ctx.raum.inviteLink); B.dispatch("ACCEPT");
  await until(() => L(A) === "card.play.turn" && L(B) === "card.play.wait");
  B.dispatch({ type: "PEER_IN", msg: { t: "in", i: 0, x: { t: "say", seat: 0, v: 6 }, h: "0".repeat(16) } });
  assert.equal(L(B), "card.play.error"); assert.equal(B.state.ctx.error, "abweichung");
});

test("Link: wer als zweiter Sitz einlaedt, bekommt sofort den Einladungslink (Regression aus dem Zustands-Durchlauf)", async () => {
  const A = testRuntime({ entropy: counter("f"), async: true }), B = testRuntime({ entropy: counter("a1"), async: true });
  A.dispatch({ type: "OPEN", id: "bluff" }); A.dispatch({ type: "MODE", mode: "link" }); A.dispatch({ type: "SEAT", seat: 1 }); A.dispatch("GO");
  assert.equal(L(A), "card.play.send");
  await until(() => A.shared.length >= 1, 2000);
  B.link(A.shared[A.shared.length - 1]); assert.equal(L(B), "receive.show"); B.dispatch("ACCEPT");
  assert.equal(L(B), "card.play.turn"); assert.deepEqual(B.state.ctx.session.mine, [0], "Empfaenger wird Bote");
  assert.ok(B.storage.dump()[0].salt, "Bote legt sein Salz beim Annehmen fest");
  assert.equal(A.state.ctx.session.state.priv[0], null);
});
