// Regressionstests zu den Review-Befunden PR #236 (H1, M1, M2, LOW). Jeder Test schlug auf Commit 4b190ee fehl.
import test from "node:test";
import assert from "node:assert/strict";
import { testRuntime, counter, memStorage } from "./helpers.js";
import { decode, encode } from "../src/app/link.js";
import * as S from "../src/contract/session.js";
import * as H from "../src/contract/handshake.js";
import { cardOf, modesOf } from "../src/cards/index.js";
import { machine, initialContext } from "../src/app/machine.js";
import { leaf } from "../src/ui/view.js";
import { checkCardSource } from "../scripts/harness.js";

const card = cardOf("bluff");
const L = (rt) => leaf(rt.state);
const frag = (s) => s.replace(/^.*#/, "#");

function messengerSent() {
  const rt = testRuntime({ entropy: counter("a") });
  rt.dispatch({ type: "OPEN", id: "bluff" }); rt.dispatch({ type: "MODE", mode: "link" }); rt.dispatch({ type: "SEAT", seat: 0 }); rt.dispatch({ type: "GO" });
  for (let i = 0; i < 5; i++) { const o = S.observe(card, rt.state.ctx.session, 0); rt.dispatch({ type: "INPUT", input: { t: "say", seat: 0, v: o.mine.cards[i] } }); }
  return { rt, link: frag(rt.state.ctx.link) };
}

test("H1: gefaelschter Link mit gleicher Partie-id loest keine Aufdeckung aus (Repro t3.mjs)", () => {
  const { rt, link } = messengerSent();
  const d = decode(link).data;
  const forged = { ...d, m: [...Array(5)].map(() => ({ t: "say", seat: 0, v: 6 })).concat([...Array(5)].map(() => ({ t: "call", seat: 1, open: false }))) };
  delete forged.h;
  rt.dispatch({ type: "BACK" });
  const before = rt.shared.length;
  rt.link(encode("challenge", forged));
  assert.equal(L(rt), "receive.reject");
  assert.equal(rt.state.ctx.reason, "manipuliert");
  assert.equal(rt.shared.length, before, "kein Link mit Salz erzeugt");
  assert.equal(rt.state.ctx.link, null);
});

test("H1: Seed, Parameter oder eigenes Commitment geaendert -> abgelehnt; echte Fortsetzung -> angenommen", () => {
  const { rt, link } = messengerSent();
  const d = decode(link).data, calls = [...Array(5)].map((_, i) => ({ t: "call", seat: 1, open: i % 2 === 0 }));
  rt.dispatch({ type: "BACK" });
  for (const bad of [{ ...d, s: "f".repeat(32), m: d.m.concat(calls) }, { ...d, p: { ...d.p, bonus: 0 }, m: d.m.concat(calls) }, { ...d, k: ["e".repeat(64), null], m: d.m.concat(calls) }]) {
    delete bad.h; rt.link(encode("challenge", bad)); assert.equal(rt.state.ctx.reason, "manipuliert"); rt.dispatch("DONE");
  }
  const good = { ...d, m: d.m.concat(calls) }; delete good.h;
  rt.link(encode("challenge", good)); assert.equal(L(rt), "receive.show"); rt.dispatch("ACCEPT");
  assert.equal(L(rt), "card.play.over", "echte Antwort fuehrt zur Aufdeckung");
});

test("H1: Zuege fuer den eigenen Sitz darf ein Link nicht anhaengen; aelterer Stand -> veraltet", () => {
  const { rt, link } = messengerSent();
  const d = decode(link).data;
  rt.dispatch({ type: "BACK" });
  const calls = [...Array(5)].map(() => ({ t: "call", seat: 1, open: false }));
  // Antwort, die zusaetzlich einen Zug fuer den Boten (eigener Sitz) anhaengt – hier eine Aufdeckung ohne Salz-Kenntnis
  const own = { ...d, m: d.m.slice(0, 4).concat(d.m.slice(4)).concat(calls).concat([{ t: "reveal", seat: 0, salt: "f".repeat(32) }]) }; delete own.h;
  rt.link(encode("challenge", own)); assert.equal(rt.state.ctx.reason, "manipuliert"); rt.dispatch("DONE");
  const shorter = { ...d, m: d.m.slice(0, 3) }; delete shorter.h;
  rt.link(encode("challenge", shorter)); assert.equal(rt.state.ctx.reason, "veraltet");
});

test("M1: Bote kann nach den Pruefer-Entscheidungen seine Ansagen nicht mehr aendern (Pruefer haelt seinen Stand)", () => {
  const { link } = messengerSent();
  const B = testRuntime({ entropy: counter("b") });
  B.link(link); B.dispatch("ACCEPT");
  for (let i = 0; i < 5; i++) B.dispatch({ type: "INPUT", input: { t: "call", seat: 1, open: true } });
  const l2 = decode(frag(B.state.ctx.link)).data;
  // Bote "korrigiert" Ansagen und Entscheidungen und schickt das Ergebnis zurueck
  const edited = { ...l2, m: l2.m.map((x) => (x.t === "say" ? { ...x, v: 6 } : x.t === "call" ? { ...x, open: false } : x)) }; delete edited.h;
  B.link(encode("challenge", edited));
  assert.equal(B.state.ctx.reason, "manipuliert");
});

test("LOW: nicht angenommene Links speichern nichts (verdraengen keine Salze)", () => {
  const { link } = messengerSent();
  const st = memStorage(), B = testRuntime({ entropy: counter("c"), storage: st });
  B.link(link);
  assert.deepEqual(st.dump(), []);
  B.dispatch("ACCEPT");
  assert.equal(st.dump().length, 1);
  assert.ok(typeof st.dump()[0].lh === "string" && Number.isInteger(st.dump()[0].n));
});

function chart() {
  let s = machine.initial(initialContext("de")), fx = [];
  const send = (ev) => { s = machine.send(s, { ...ev, rand: ["a".repeat(32), "b".repeat(32), "c".repeat(32), "d".repeat(32)] }); fx = s.effects.map((e) => e.type); return s; };
  const raum = () => s.config.filter((c) => c.startsWith("raum.")).join();
  return { send, raum, fx: () => fx };
}
const LIVE = encode("live", { t: "A".repeat(22) });
test("M2: Zurueck aus der Live-Einladung schliesst die Verbindung (Repro t1.mjs 3)", () => {
  const c = chart(); c.send({ type: "LINK", hash: LIVE }); c.send({ type: "ACCEPT" });
  assert.equal(c.raum(), "raum.beitreten");
  c.send({ type: "BACK" });
  assert.equal(c.raum(), "raum.allein"); assert.ok(c.fx().includes("live.close"));
});
test("M2: nach gescheitertem Beitritt verbindet ein zweiter Live-Link wieder (Repro t1.mjs 4-6)", () => {
  const c = chart(); c.send({ type: "LINK", hash: LIVE }); c.send({ type: "ACCEPT" }); c.send({ type: "LIVE_FAIL", reason: "verbindung" });
  c.send({ type: "DONE" }); assert.equal(c.raum(), "raum.allein");
  c.send({ type: "LINK", hash: LIVE }); c.send({ type: "ACCEPT" });
  assert.equal(c.raum(), "raum.beitreten"); assert.ok(c.fx().includes("live.accept"));
});
test("M2: Link waehrend der Lobby schliesst die Einladung ausdruecklich (Repro t1.mjs 7-9)", () => {
  const c = chart(); c.send({ type: "OPEN", id: "bluff" }); c.send({ type: "MODE", mode: "live" }); c.send({ type: "GO" });
  assert.equal(c.raum(), "raum.einladen");
  c.send({ type: "LINK", hash: LIVE });
  assert.equal(c.raum(), "raum.allein"); assert.ok(c.fx().includes("live.close"));
  c.send({ type: "ACCEPT" }); assert.equal(c.raum(), "raum.beitreten");
});
test("M2: raise sieht den Kontext vor den Aktionen", async () => {
  const { createMachine } = await import("../src/app/statechart.js");
  const m = createMachine({ type: "parallel", states: { a: { initial: "x", states: { x: { on: { GO: { target: "a.y", actions: ["clear"], raise: (ctx) => (ctx.flag ? { type: "PING" } : null) } } }, y: {} } }, b: { initial: "p", states: { p: { on: { PING: "b.q" } }, q: {} } } } },
    { actions: { clear: (ctx) => ({ ...ctx, flag: false }) } });
  assert.deepEqual(m.send(m.initial({ flag: true }), "GO").config, ["a", "a.y", "b", "b.q"]);
});

test("LOW: hello mit Sitz ausserhalb der Karte wird abgelehnt", () => {
  const hi = H.hello(card, { cards: 5, bonus: 2, accent: "red" }, 0, ["1".repeat(32), "2".repeat(32)]).msg;
  assert.throws(() => H.join(card, { ...hi, q: 5 }, ["3".repeat(32), "4".repeat(32)]), (e) => e.code === "eingabe");
  assert.throws(() => H.hello(card, {}, 7, ["1".repeat(32), "2".repeat(32)]), (e) => e.code === "eingabe");
});
test("LOW: Harness sperrt gebietsschema-/gleitkommaabhaengige Ausgaben", () => {
  for (const src of ["a.localeCompare(b)", "x.toLocaleString()", "x.toFixed(2)", "x.toPrecision(3)", "x.toString(2)"]) assert.ok(checkCardSource(src).length > 0, src);
  assert.deepEqual(checkCardSource("String(x); x.toString();"), []);
});
test("LOW: Live mit 2 bis 6 Sitzen (ab 3 als Gruppe); Bot ab zwei Sitzen mit n-1 Bot-Agenten (ADR 0001 f)", () => {
  const m3 = { manifest: { ...card.manifest, players: { min: 2, max: 3 } } };
  assert.deepEqual(modesOf(m3), ["alone", "bot", "link", "live"]);
  assert.deepEqual(modesOf({ manifest: { ...card.manifest, players: { min: 2, max: 10 } } }), ["alone", "bot", "link"]);
  assert.deepEqual(modesOf({ manifest: { ...card.manifest, players: { min: 1, max: 1 } } }), ["alone"]);
  assert.deepEqual(modesOf({ manifest: { ...card.manifest, modes: ["alone", "bot", "live"] } }), ["alone", "bot", "live"]);
});
