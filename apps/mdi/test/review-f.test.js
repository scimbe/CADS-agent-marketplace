// Regressionstests zum unabhaengigen Review von PR #247 (Befunde H1–H3, M1–M7, L1–L10). Jeder Test war vor der
// Behebung rot (geprueft gegen feat/mdi-paritaet c206d91).
import test from "node:test";
import assert from "node:assert/strict";
import card from "./fixtures/cards/fx-rt/card.js";
import { createMatch, verifyGhost, hashOf } from "../src/app/rt/match.js";
import { createLockstep } from "../src/app/rt/net.js";
import { createRtSession } from "../src/app/rt/session.js";
import { decode } from "../src/app/link.js";
import * as S from "../src/contract/session.js";
import * as H from "../src/contract/handshake.js";
import { canonF } from "../src/contract/sdk.js";
import { checkCardSource } from "../scripts/harness.js";
import { createSound } from "../src/render/sound.js";
import { createStage } from "../src/render/rt-stage.js";
import { render } from "../src/render/render.js";
import fx from "./fixtures/cards/fx-zug/card.js";
import { counter, testRuntime } from "./helpers.js";

/** Zwei Live-Sitzungen (lockstep) ueber Warteschlangen, gemeinsame Testuhr. */
function livePair(c, { ms = 3000 } = {}) {
  let t = 0; const q = [], qa = [], qb = [];
  const mk = (seat, out) => createRtSession(c, { mode: "live", seat, params: P, seed: hex("f6"), level: 2 }, { now: () => t, frame: (f) => q.push(f), draw() {}, onChange() {}, send: (m) => out.push(JSON.parse(JSON.stringify(m))) });
  const A = mk(0, qa), B = mk(1, qb);
  A.start(); B.start();
  for (let x = 0; x < ms + 3200; x += 16) { t += 16; q.splice(0).forEach((f) => f()); qa.splice(0).forEach((m) => B.receive(m)); qb.splice(0).forEach((m) => A.receive(m)); }
  return { A, B };
}

const hex = (s) => s.padStart(32, "0"), P = { win: 9, speed: 8 };
function all(v, out = []) { if (v && typeof v === "object") { out.push(v); for (const c of v.children || []) all(c, out); } return out; }

test("H1: Geist mit abgeschnittener Spur ist pruefbar (h, n, sc vom Schnittpunkt) statt scheinbar gueltig", () => {
  const small = { ...card, manifest: { ...card.manifest, rt: { ...card.manifest.rt, ghost: { bytes: 40 } } } };
  const m = createMatch(small, { params: P, seed: hex("a1"), roles: ["human", "bot"], level: 2, record: 0 });
  for (let t = 0; t < 600 && !m.status().over; t++) m.step({ 0: { b: t % 2, ax: (t % 3) * 500 - 500 } });
  const w = m.ghostWire();
  assert.equal(w.cut, true); assert.ok(w.n < m.tick);
  assert.equal(verifyGhost(small, w).ok, true, JSON.stringify(verifyGhost(small, w)));
});

test("H2: Live-Sitzungen mit delay 0 und 1 laufen (eigene Eingabe vor dem Warten, kein halber Stapel)", () => {
  for (const delay of [0, 1]) {
    const c = { ...card, manifest: { ...card.manifest, rt: { ...card.manifest.rt, delay } } };
    const { A, B } = livePair(c, { ms: 2000 });
    assert.ok(A.tick > 30 && B.tick > 30, "delay " + delay + ": " + A.tick + "/" + B.tick);
  }
});

test("H2 (Netzebene): Lockstep mit delay 0 und 1 laeuft, wenn jede Seite zuerst sendet", () => {
  for (const delay of [0, 1]) {
    const qa = [], qb = [];
    const A = createLockstep({ seat: 0, other: 1, delay, tick: 60, send: (x) => qa.push(x), onDesync() {} });
    const B = createLockstep({ seat: 1, other: 0, delay, tick: 60, send: (x) => qb.push(x), onDesync() {} });
    let ta = 0, tb = 0, sa = -1, sb = -1;
    // wie die Sitzung: erst eigene Eingabe des Ticks abtasten/senden, dann auf den Partner warten
    for (let r = 0; r < 50; r++) {
      if (sa < ta) { A.local(ta, { b: 0 }); sa = ta; } if (A.ready(ta)) { A.inputs(ta); ta++; } else A.flush();
      if (sb < tb) { B.local(tb, { b: 0 }); sb = tb; } if (B.ready(tb)) { B.inputs(tb); tb++; } else B.flush();
      qa.splice(0).forEach((x) => B.receive(x)); qb.splice(0).forEach((x) => A.receive(x));
    }
    assert.ok(ta >= 20 && tb >= 20, "delay " + delay + ": " + ta + "/" + tb);
  }
});

function fakeSession(c, opts = {}) {
  let t = 0; const q = [], changes = [];
  const s = createRtSession(c, { mode: "bot", seat: 0, params: P, seed: hex("b2"), level: 2, ...opts }, { now: () => t, frame: (f) => q.push(f), draw: () => {}, onChange: (x) => changes.push(x), send: () => {} });
  return { s, changes, run(ms) { for (let x = 0; x < ms; x += 16) { t += 16; q.splice(0).forEach((f) => f()); } } };
}
test("H3: Fehler in step friert nicht still ein, sondern endet mit error", () => {
  const bad = { ...card, step(st, i, tick) { if (tick === 5) throw new Error("kaputt"); return card.step(st, i, tick); } };
  const f = fakeSession(bad); f.s.start(); f.run(4000);
  assert.equal(f.changes[f.changes.length - 1].type, "error");
  assert.equal(f.changes[f.changes.length - 1].reason, "karte-fehler");
});

test("M1: tief verschachtelte Live-Nachricht fuehrt zu FAIL statt zu einer Ausnahme in der Laufzeit", async () => {
  let cb = null;
  const rt = testRuntime({ live: () => Promise.resolve({ invite(c) { cb = c; return { send() {}, close() {} }; }, accept(t, c) { cb = c; return { send() {}, close() {} }; } }) });
  rt.dispatch({ type: "OPEN", id: "bluff" }); rt.dispatch({ type: "MODE", mode: "live" }); rt.dispatch("GO"); rt.flush();
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(cb, "Kanal geoeffnet");
  let d = "0"; for (let i = 0; i < 2000; i++) d = "[" + d + "]";
  const deep = JSON.parse('{"t":"rs","i":1,"m":[{"a":' + d + "}]}");
  assert.doesNotThrow(() => cb.onMessage(deep));
});

test("M1 (Link): tief verschachtelte Links werden abgelehnt statt zu werfen", () => {
  let deep = "0"; for (let i = 0; i < 1500; i++) deep = "[" + deep + "]";
  const json = '{"c":"bluff","v":"1.0.0","p":{"x":' + deep + "}}";
  const hash = "#v2.card." + Buffer.from(json).toString("base64url");
  assert.doesNotThrow(() => decode(hash));
  assert.equal(decode(hash).ok, false);
});

test("M2: Live-Sitzung berechnet den Zustandshash nur im Pruefintervall (nicht jeden Tick)", () => {
  let calls = 0; const c = { ...card, hash: (st) => { calls++; return "0123456789abcdef"; } };
  livePair(c, { ms: 2000 });
  assert.ok(calls <= 8, "Aufrufe " + calls);
});

test("M2 (Netzebene): Hash als Funktion wird nur im Intervall gerufen", () => {
  let calls = 0; const c = { ...card, hash: (st) => { calls++; return "0123456789abcdef"; } };
  const ls = createLockstep({ seat: 0, other: 1, delay: 3, tick: 60, send: () => {}, onDesync() {} });
  const m = createMatch(c, { params: P, seed: hex("c3"), roles: ["human", "remote"] });
  for (let t = 0; t < 120; t++) { ls.local(t, { b: 0 }); ls.receive({ t: "rt", i: t, x: [{ b: 0 }] }); m.step(ls.inputs(t)); ls.after(t, () => m.hash()); }
  assert.ok(calls <= 2, "Aufrufe " + calls);
});

test("M3: eigener Kartenhash wird auf 16 Hex normiert (Live-Schema rh)", () => {
  assert.match(hashOf({ ...card, hash: () => 123 }, {}), /^[0-9a-f]{16}$/);
});

test("M4: verifyGhost verlangt gueltigen Geist-Sitz, Rollen der Aufnahme und Stand je Sitz", () => {
  const m = createMatch(card, { params: { win: 1, speed: 8 }, seed: hex("d4"), roles: ["human", "bot"], level: 2, record: 0 });
  for (let t = 0; t < 4000 && !m.status().over; t++) m.step({ 0: { b: t % 40 === 0 ? 1 : 0 } });
  const w = m.ghostWire();
  assert.equal(verifyGhost(card, w).ok, true);
  assert.equal(verifyGhost(card, { ...w, q: 5 }).ok, false);
  assert.equal(verifyGhost(card, { ...w, rl: undefined }).ok, false);
  assert.equal(verifyGhost(card, { ...w, sc: [w.sc[0]] }).ok, false);
});

test("M5: pausiert der Partner zu lange, endet die Partie ehrlich", () => {
  const c = { ...card, manifest: { ...card.manifest } };
  const f = fakeSession(c, { mode: "live" }); f.s.start(); f.run(3500);
  f.s.receive({ t: "pause" }); f.run(61000);
  assert.ok(f.changes.some((x) => x.type === "peer-lost"), JSON.stringify(f.changes.map((x) => x.type)));
});

test("M6: Lockstep nimmt Eingaben/Hashes nur im Fenster an (Maps wachsen nicht ungebunden)", () => {
  const ls = createLockstep({ seat: 0, other: 1, delay: 3, tick: 60, send: () => {}, onDesync() {} });
  for (let i = 0; i < 2000; i++) ls.receive({ t: "rt", i: 10000 + i * 8, x: [{ b: 0 }] });
  for (let i = 0; i < 2000; i++) ls.receive({ t: "rh", i: 50000 + i, h: "0123456789abcdef" });
  assert.ok(ls.sizes.theirs < 700 && ls.sizes.peerHash < 700, JSON.stringify(ls.sizes));
});

test("M7: Echtzeit zeichnet immer in rt.view (Zeigerumrechnung und Leinwand gleich)", () => {
  const odd = { ...card, view: (st, ctx) => ({ ...card.view(st, ctx), w: 123, h: 456 }) };
  const seen = [];
  let t = 0; const q = [];
  const s = createRtSession(odd, { mode: "bot", seat: 0, params: P, seed: hex("e5"), level: 2 }, { now: () => t, frame: (f) => q.push(f), draw: (n) => seen.push([n.w, n.h]), onChange() {} });
  s.start(); for (let x = 0; x < 100; x += 16) { t += 16; q.splice(0).forEach((f) => f()); }
  assert.deepEqual(seen[seen.length - 1], [card.manifest.rt.view.w, card.manifest.rt.view.h]);
});

function fakeWin() {
  const L = {}, ml = []; const add = (k) => (t, f) => { (L[k + t] = L[k + t] || []).push(f); }, rem = (k) => (t, f) => { L[k + t] = (L[k + t] || []).filter((x) => x !== f); };
  const mq = { addEventListener: (t, f) => ml.push(f), removeEventListener: (t, f) => { const i = ml.indexOf(f); if (i >= 0) ml.splice(i, 1); } };
  const win = { addEventListener: add("w"), removeEventListener: rem("w"), matchMedia: () => mq, getComputedStyle: () => ({ getPropertyValue: () => "" }), devicePixelRatio: 1 };
  const doc = { documentElement: {}, addEventListener: add("d"), removeEventListener: rem("d"), createElement: () => ({}) };
  return { win, doc, L, ml };
}
function fakeCanvas() { return { addEventListener() {}, getContext: () => ({}), getBoundingClientRect: () => ({ width: 100, height: 100, left: 0, top: 0 }), isConnected: true, setAttribute() {} }; }
test("L2: Spieltasten werden in Knoepfen nicht abgefangen; Achsenknoepfe per Tastatur mit aria-pressed", () => {
  const { win, doc, L } = fakeWin(); const keys = [];
  const rt = { active: true, view: { w: 10, h: 10 }, controls: { buttons: [], axes: { x: { keys: ["ArrowLeft", "ArrowRight"] } } }, screenButtons: () => [], key: (c, d) => { keys.push([c, d]); return true; }, pointer() {}, button() {}, blur() {}, hidden() {} };
  const st = createStage({ win, doc, rt });
  const node = st.stageNode("card.rt.run", () => {}, "de");
  const cv = all(node).find((x) => x.tag === "canvas"); cv.props.ref(fakeCanvas());
  let prevented = false;
  L.wkeydown[0]({ code: "Space", key: " ", target: { tagName: "BUTTON" }, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false, "Leertaste auf einem Knopf gehoert dem Knopf");
  const ax = all(node).filter((x) => x.props && x.props.class === "rt-btn rt-axis");
  assert.equal(ax.length, 2); assert.equal(ax[0].props["aria-pressed"], "false");
  const el = { setAttribute: (k, v) => { el[k] = v; } };
  ax[0].props.on.keydown({ key: " ", repeat: false, preventDefault() {}, currentTarget: el });
  assert.deepEqual(keys[keys.length - 1], ["ArrowLeft", true]); assert.equal(el["aria-pressed"], "true");
});

test("L6: matchMedia-Listener wird beim Aushaengen entfernt", () => {
  const { win, doc, ml } = fakeWin();
  const rt = { active: true, view: { w: 10, h: 10 }, controls: null, screenButtons: () => [], key: () => false, pointer() {}, button() {}, blur() {}, hidden() {} };
  const st = createStage({ win, doc, rt });
  const cv = all(st.stageNode("card.rt.run", () => {}, "de")).find((x) => x.tag === "canvas");
  cv.props.ref(fakeCanvas()); assert.equal(ml.length, 1);
  cv.props.ref(fakeCanvas()); assert.equal(ml.length, 1, "neue Leinwand: alter Listener weg");
});

test("L1: Zeichnen per Tastatur; Farb-/Breitenwahl mit Pfeiltasten und uebersetzten Gruppen", () => {
  let draft = {};
  const host = { lang: "en", get draft() { return draft; }, onDraftPatch: (p) => { draft = { ...draft, ...p }; }, onInput() {}, idp: "t" };
  const node = { t: "draw", id: "d", label: "Draw", colors: ["#111111", "#ff0000"], widths: [2, 4], submit: { t: "x", seat: 0 } };
  const tree = () => all(render(node, host));
  const groups = tree().filter((x) => x.props && x.props.role === "radiogroup").map((x) => x.props["aria-label"]);
  assert.deepEqual(groups, ["Colour", "Width"]);
  const surf = () => tree().find((x) => x.props && x.props.class === "w-draw");
  const k = (key) => surf().props.on.keydown({ key, preventDefault() {} });
  k(" "); k("ArrowRight"); k("ArrowRight"); k(" ");
  assert.equal(draft["w:d"].s.length, 1, "ein Strich per Tastatur");
  const radio = tree().find((x) => x.props && x.props.role === "radio");
  radio.props.on.keydown({ key: "ArrowRight", preventDefault() {}, currentTarget: { parentNode: null } });
  assert.equal(draft["w:d"].c, 1);
});

test("L3: Feld schreibt jede Aenderung sofort (kein Zuruecksetzen durch Entprellen)", () => {
  const patches = [];
  const tree = all(render({ t: "field", key: "a", label: "A", value: "" }, { lang: "de", onDraftPatch: (p) => patches.push(p), onInput() {} }));
  tree.find((x) => x.tag === "input").props.on.input({ target: { value: "Hal" } });
  assert.deepEqual(patches, [{ a: "Hal" }]);
});

test("L4: kein RegExp aus Kartendaten im Render-Pfad (pattern wird nicht ausgewertet)", () => {
  assert.doesNotThrow(() => render({ t: "input", id: "i", label: "x", pattern: "(", submit: { t: "a", seat: 0 } }, { lang: "de", draft: { "w:i": "abc" }, onInput() {}, onDraft() {} }));
});

test("L5: Klang begrenzt Stimmen und Rate je Ereignis, Rauschpuffer werden wiederverwendet", () => {
  let osc = 0, bufs = 0;
  const node = () => ({ connect: (x) => x || node(), start() {}, stop() {}, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 }, type: "", buffer: null });
  const ac = { currentTime: 0, sampleRate: 1000, state: "running", destination: {}, createOscillator: () => { osc++; return node(); }, createGain: node, createBiquadFilter: node, createBufferSource: node, createBuffer: (c, n) => { bufs++; return { getChannelData: () => new Float32Array(n) }; } };
  const s = createSound({ audioContext: () => ac });
  const sounds = { hit: { synth: "tone", f0: 400, dur: 0.1 }, boom: { synth: "noise", dur: 0.1 } };
  s.play(Array.from({ length: 50 }, () => ({ k: "hit" })), sounds);
  assert.equal(osc, 1, "gleiche Art im selben Moment: einmal");
  for (let i = 0; i < 20; i++) { ac.currentTime += 0.05; s.play([{ k: "boom" }], sounds); }
  assert.equal(bufs, 1, "Rauschpuffer wiederverwendet");
});

test("L7: Harness – eine lokale Verschattung entlastet nie die globale Nutzung", () => {
  assert.ok(checkCardSource("function a() { const Date = 1; return Date; } export default Date.now();").some((x) => /Date/.test(x)));
});

test("L8: NaN im Zustand ist ein Fehler (plattformabhaengige Bits)", () => {
  assert.throws(() => canonF({ a: NaN }), /NaN/);
});

test("L9: Gast prueft beim Gruppen-Start Vollstaendigkeit und Sitze", () => {
  const e = counter("a"), r = H.helloGroup(fx, { rounds: 1 }, 0, [e(), e()]);
  const g1 = H.join(fx, r.msgs[0].msg, [counter("b")(), counter("b")()]);
  const start = { t: "start", s: r.local.seedA, j: [{ q: 1, n: g1.msg.n }], k: [r.local.commits[0], g1.msg.k[1], null] };
  assert.throws(() => H.begin(fx, g1.local, start), (x) => x.code === "eingabe", "Sitz 2 fehlt im start");
});

test("L10: Eingabegrenze zaehlt UTF-8-Byte, nicht UTF-16-Einheiten", () => {
  const sec = S.makeSecrets(fx, [0, 1, 2], counter("c"));
  let s = S.newSession(fx, { params: { rounds: 1 }, seed: "s".repeat(32), mine: [0, 1, 2], ...sec });
  for (let d = S.dueReveal(fx, s); d; d = S.dueReveal(fx, s)) s = S.apply(fx, s, d);
  assert.throws(() => S.apply(fx, s, { t: "say", seat: 0, a: "€".repeat(700), d: 1 }), (x) => x.code === "eingabe" && /zu gross/.test(x.message));
});
