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
  for (let i = 0; i < 2000 && rt.matches("inhalt.card.play.turn"); i++) {
    const c = cardOf(rt.state.ctx.cardId), v = rt.state.ctx.viewer;
    let mv = c.moves(c.observe(rt.state.ctx.session.state, v), v);
    // inputDay-Karten (z. B. Malrat): erster Zug braucht den Tag (card.opening, nur Treiber; der Host stempelt d)
    if (!mv.length && c.manifest.inputDay && typeof c.opening === "function" && !rt.state.ctx.session.log.length) mv = [c.opening(v, rt.state.ctx.today === null ? 20769 : rt.state.ctx.today)];
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
  if (mode === "bot") {
    // Bots laufen ueber die Warteschlange der Laufzeit (schedule): hier synchron abgearbeitet (flush), ohne Wanduhr.
    // So haengt der Test nicht an der Rechnerlast (Befund H: Zeitueberschreitung unter Last), und jeder Lauf ist gleich.
    const S = testRuntime({ entropy: counter("a"), async: false });
    S.dispatch({ type: "OPEN", id }); S.dispatch({ type: "MODE", mode }); S.dispatch("GO");
    for (let i = 0; i < 2000 && L(S) !== "card.play.over"; i++) { S.flush(); noForeignSecret(S); if (L(S) === "card.play.turn") playTurns(S); else if (L(S) !== "card.play.over") await new Promise((r) => setTimeout(r, 0)); }
    S.flush();
    assert.equal(L(S), "card.play.over", "Bot-Partie endet"); noForeignSecret(S); return { a: S };
  }
  a.dispatch({ type: "OPEN", id }); a.dispatch({ type: "MODE", mode }); a.dispatch("GO");
  const sent = [];
  if (mode === "alone") { playTurns(a); await until(() => L(a) === "card.play.over"); return { a }; }
  if (mode === "link") {
    // Hin und her per Link, bis beide das Ende sehen; der Treiber gibt nur Links weiter
    // Kettenkarten (Sitz = Zugindex, z. B. Terminumfrage) brauchen so viele Geraete wie Sitze; der Link geht reihum
    const devs = [a, B];
    for (let k = 2; k < c.manifest.players.max; k++) devs.push(testRuntime({ entropy: counter("d" + k), async: true }));
    let from = 0;
    if (c.manifest.mode === "static") {
      assert.equal(L(a), "card.share"); a.dispatch("SHARE"); await until(() => a.shared.length >= 2);
      B.link(a.shared[a.shared.length - 1]); assert.equal(L(B), "receive.show"); B.dispatch("ACCEPT"); assert.equal(L(B), "card.view");
      assert.deepEqual(B.state.ctx.params[id], a.state.ctx.params[id] || B.state.ctx.params[id]);
      return { a, b: B, sent: a.shared };
    }
    for (let hop = 0; hop < 10 * devs.length; hop++) {
      const d = devs[from], o = devs[(from + 1) % devs.length];
      playTurns(d); noForeignSecret(d);
      if (L(d) === "card.play.over" && !d.state.ctx.link) break;
      if (d.state.ctx.session && cardOf(id).status(d.state.ctx.session.state).endless === true && hop >= 6) return { a: d, b: null, sent, endless: true }; // endlose Karten: 6 Zuege
      if (L(d) === "card.play.over" && d.state.ctx.session && cardOf(id).status(d.state.ctx.session.state).local === true) break; // Ergebnis bleibt beim letzten Geraet (status.local)
      const n = d.shared.length; d.dispatch("SHARE"); await until(() => d.shared.length > n);
      const link = d.shared[d.shared.length - 1]; sent.push(link);
      if (L(d) === "card.play.send") d.dispatch("SENT");
      o.link(link); assert.equal(L(o), "receive.show", o.state.ctx.reason); o.dispatch("ACCEPT"); noForeignSecret(o);
      if (L(d) === "card.play.over" && L(o) === "card.play.over") break;
      if (L(o) === "card.play.over" && o.state.ctx.session && cardOf(id).status(o.state.ctx.session.state).local === true) break;
      from = (from + 1) % devs.length;
    }
    const fin = devs.find((d) => L(d) === "card.play.over");
    assert.ok(fin, "ein Geraet sieht das Ende");
    if (cardOf(id).status(fin.state.ctx.session.state).local === true) return { a: fin, b: null, sent, local: true };
    if (devs.length > 2) return { a: fin, b: null, sent }; // Kette: das letzte Geraet sieht das Ende, Ruecklink gibt es nicht
    assert.equal(L(a), "card.play.over"); assert.equal(L(B), "card.play.over");
    return { a, b: B, sent };
  }
  if (mode === "live" && c.manifest.players.max > 2) {
    // Gruppen-Live: ein Geraet je Gastsitz ueber die Einladung dieses Sitzes (ctx.raum.invites)
    await until(() => a.state.ctx.raum && a.state.ctx.raum.invites && Object.keys(a.state.ctx.raum.invites).length === c.manifest.players.max - 1);
    const guests = Object.keys(a.state.ctx.raum.invites).map((seat, k) => { const g = testRuntime({ entropy: counter("e" + k), async: true, live: net.loader }); g.link(a.state.ctx.raum.invites[seat]); g.dispatch("ACCEPT"); return g; });
    const devs = [a, ...guests];
    for (let i = 0; i < 4000 && !devs.every((d) => L(d) === "card.play.over"); i++) { await tick(); for (const d of devs) { noForeignSecret(d); playTurns(d); } }
    assert.ok(devs.every((d) => L(d) === "card.play.over"), devs.map(L).join());
    const pub = devs.map((d) => JSON.stringify(d.state.ctx.session.state.pub));
    assert.ok(pub.every((x) => x === pub[0]), "alle sehen denselben Stand");
    return { a, b: guests[0], wire: net.wire };
  }
  if (mode === "live") {
    await until(() => a.state.ctx.raum && a.state.ctx.raum.inviteLink);
    B.link(a.state.ctx.raum.inviteLink); assert.equal(L(B), "receive.live"); B.dispatch("ACCEPT");
    if (c.manifest.mode === "static") { await until(() => L(B) === "receive.show"); B.dispatch("ACCEPT"); assert.equal(L(B), "card.view"); return { a, b: B, wire: net.wire }; }
    for (let i = 0; i < 200 && !(L(a) === "card.play.over" && L(B) === "card.play.over"); i++) {
      await tick(); noForeignSecret(a); noForeignSecret(B); playTurns(a); playTurns(B);
      const s0 = a.state.ctx.session; if (s0 && c.status(s0.state).endless === true && s0.log.length >= 6) return { a, b: B, wire: net.wire, endless: true };
    }
    await until(() => L(a) === "card.play.over" && L(B) === "card.play.over");
    return { a, b: B, wire: net.wire };
  }
  throw new Error("Modus " + mode);
}

// Zug- und statische Karten; Echtzeitkarten laufen ueber den Echtzeit-Treiber (test/rt-modes.test.js)
for (const id of ORDER.filter((x) => cardOf(x).manifest.mode !== "realtime")) for (const mode of modesOf(cardOf(id))) {
  test("Karte " + id + " im Modus " + mode + " – derselbe Treiber, keine Sonderlogik", async () => {
    const r = await scenario(id, mode);
    for (const d of [r.a, r.b].filter(Boolean)) assert.equal(d.state.ctx.error, null);
    if (!r.endless && r.a.state.ctx.session && r.b && r.b.state.ctx.session) assert.equal(JSON.stringify(r.a.state.ctx.session.state.pub), JSON.stringify(r.b.state.ctx.session.state.pub), "beide sehen dasselbe Ende");
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
