// Echtzeit-Vertrag (ADR 0001 b): Tick-Schleife, Eingabe-Abtastung, Partie, Bot, Geist, Lockstep, Split, Glaettung,
// Canvas-Ausfuehrer. Testkarte test/fixtures/cards/fx-rt (keine Produktkarte).
import test from "node:test";
import assert from "node:assert/strict";
import card from "./fixtures/cards/fx-rt/card.js";
import { createLoop, MAX_CATCHUP } from "../src/app/rt/loop.js";
import { createSampler, fitView, toWorld } from "../src/app/rt/input.js";
import { createMatch, verifyGhost, hashOf } from "../src/app/rt/match.js";
import { createLockstep, createSplit } from "../src/app/rt/net.js";
import { createTrack } from "../src/app/rt/smooth.js";
import { createRtSession } from "../src/app/rt/session.js";
import { paint, layoutText, MAX_OPS } from "../src/render/canvas.js";
import { exec2d } from "../src/render/canvas2d.js";
import { generate } from "../scripts/gen.js";
import * as V from "../src/gen/validators.js";
import { manifest as manifestValidator } from "../src/gen/manifest.js";

const P = { win: 2, speed: 8 };

test("Testkarte fx-rt erfuellt Manifest und Generator (rt-Schema, Knoepfe mit Tasten)", () => {
  const out = generate({ cardsDir: new URL("./fixtures/cards", import.meta.url).pathname });
  assert.match(out.index, /fx-rt/);
  assert.equal(manifestValidator(card.manifest), true, JSON.stringify(manifestValidator.errors));
});

// ---------- Schleife ----------
function fakeClock() { let t = 0, q = []; return { now: () => t, frame: (f) => { q.push(f); return q.length; }, run(ms, step = 16) { for (let x = 0; x < ms; x += step) { t += step; const f = q.splice(0); f.forEach((g) => g()); } }, jump(ms) { t += ms; const f = q.splice(0); f.forEach((g) => g()); } }; }
test("Schleife: fester Tick, Nachholgrenze 0,25 s, Pause haelt die Zeit an, alpha in [0,1)", () => {
  const c = fakeClock(); let ticks = 0; const alphas = [];
  const L = createLoop({ tick: 60, now: c.now, frame: c.frame, onTick: () => { ticks++; return true; }, onFrame: (a) => alphas.push(a) });
  L.start(); c.run(1000);
  assert.ok(Math.abs(ticks - 60) <= 1, "60 Hz: " + ticks);
  assert.ok(alphas.every((a) => a >= 0 && a < 1));
  const before = ticks; c.jump(5000);
  assert.ok(ticks - before <= Math.ceil(MAX_CATCHUP * 60) + 1, "keine Todesspirale: " + (ticks - before));
  assert.ok(L.lost >= 4700);
  L.pause(); const p = ticks; c.run(500); assert.equal(ticks, p, "Pause"); L.resume(); c.run(500); assert.ok(ticks > p);
  const t2 = createLoop({ tick: 120, now: c.now, frame: c.frame, onTick: () => false, onFrame: () => {} }); t2.start(); c.run(100); assert.equal(t2.stalled, true, "fehlende Partnereingabe = Halt");
});

// ---------- Eingaben ----------
test("Eingaben: Impuls genau einmal, Halten als Pegel, Achsen, Zeiger mit Flanken, Zonen, Wischen, Letterbox", () => {
  const ctl = { buttons: [{ id: "tap", kind: "pulse", keys: ["Space"], zone: "any" }, { id: "hold", kind: "hold", keys: ["KeyH"], zone: "button" }, { id: "duck", kind: "hold", keys: ["ArrowDown"], zone: "none", swipe: "down" }, { id: "left", kind: "hold", keys: ["KeyA"], zone: "left" }], axes: { x: { keys: ["ArrowLeft", "ArrowRight"] } }, pointer: { max: 2 } };
  const s = createSampler(ctl, { w: 1000, h: 1600 });
  assert.equal(s.key("Space", true), true); s.key("Space", false);
  assert.equal(s.sample().b, 1, "Impuls auch nach Loslassen im selben Tick");
  assert.equal(s.sample().b, 0, "nur einmal");
  s.key("KeyH", true); assert.equal(s.sample().b & 2, 2); assert.equal(s.sample().b & 2, 2); s.key("KeyH", false); assert.equal(s.sample().b & 2, 0);
  s.key("ArrowRight", true); assert.equal(s.sample().ax, 1000); s.key("ArrowLeft", true); assert.equal(s.sample().ax, undefined, "beide = 0"); s.reset();
  assert.equal(s.key("KeyQ", true), false, "fremde Taste");
  s.pointer("down", 0, 200, 900);
  let x = s.sample(); assert.deepEqual(x.p, [[0, 200, 900, 3]]); assert.equal(x.b & 1, 1, "Zone any loest tap aus"); assert.equal(x.b & 8, 8, "Zone left");
  s.pointer("move", 0, 210, 1000); x = s.sample(); assert.deepEqual(x.p, [[0, 210, 1000, 1]]); assert.equal(x.b & 4, 4, "Wischen nach unten = duck");
  s.pointer("up", 0, 210, 1000); x = s.sample(); assert.deepEqual(x.p, [[0, 210, 1000, 4]]); assert.equal(x.b & 4, 0);
  assert.equal(s.sample().p, undefined, "Zeiger weg");
  s.pointer("down", 1, 900, 10); s.pointer("down", 2, 100, 10); s.pointer("down", 3, 1, 1);
  assert.equal(s.sample().p.length, 2, "hoechstens pointer.max");
  s.button("hold", true); assert.equal(s.sample().b & 2, 2, "Bildschirmknopf"); assert.deepEqual(s.screenButtons().map((b) => b.id), ["hold"]);
  const f = fitView({ w: 1000, h: 1600 }, 500, 1000); assert.deepEqual(toWorld(f, f.ox + 250, f.oy + 400), [500, 800]);
});

// ---------- Partie ----------
function playBotVsHuman(seed, inputsFor, roles = ["human", "bot"], record = 0) {
  const m = createMatch(card, { params: P, seed, roles, level: 2, record });
  for (let t = 0; t < 20000 && !m.status().over; t++) m.step({ 0: inputsFor(t, m) });
  return m;
}
// Mensch mit begrenzter Reaktion: folgt dem Ball nur in der Haelfte der Zeit (Partie endet sicher)
const human = (t, m) => ({ b: t % 40 === 0 ? 1 : 0, ax: (t >> 5) % 2 ? 0 : m.state.ball.x > m.state.pad[0] + 10 ? 1000 : m.state.ball.x < m.state.pad[0] - 10 ? -1000 : 0 });
const hex = (s) => s.padStart(32, "0");
test("Partie: deterministisch (gleicher Seed + Eingaben = gleicher Hash), Bot als zweite Seite reproduzierbar", () => {
  const a = playBotVsHuman(hex("51"), human), b = playBotVsHuman(hex("51"), human);
  assert.equal(a.status().over, true);
  assert.equal(a.hash(), b.hash()); assert.equal(a.tick, b.tick);
  assert.notEqual(playBotVsHuman(hex("52"), human).hash(), a.hash());
  assert.throws(() => createMatch(card, { params: P, seed: "x", roles: ["human"] }), (e) => e.code === "rollen");
  assert.throws(() => createMatch({ ...card, bot: undefined }, { params: P, seed: "x", roles: ["human", "bot"] }), (e) => e.code === "bot");
  const m = createMatch(card, { params: P, seed: "x", roles: ["human", "remote"] });
  assert.throws(() => m.step({ 0: { b: 0 } }), (e) => e.code === "eingabe-fehlt", "fehlende Partnereingabe wird nicht geraten");
});

test("Geist: Aufnahme -> Link-Daten -> Pruefung durch Nachspielen; Manipulation wird erkannt", () => {
  const m = playBotVsHuman(hex("61"), human);
  const w = m.ghostWire();
  assert.equal(V.linkGhost(w), true, JSON.stringify(V.linkGhost.errors));
  const ok = verifyGhost(card, w);
  assert.equal(ok.ok, true, ok.reason + " " + ok.detail);
  assert.deepEqual(ok.score, m.status().score);
  assert.equal(verifyGhost(card, { ...w, h: "0".repeat(16) }).reason, "abweichung");
  assert.equal(verifyGhost(card, { ...w, n: w.n - 1 }).ok, false);
  assert.equal(verifyGhost(card, { ...w, tr: "!!" }).reason, "geist");
  // Gegen den Geist spielen: Geist-Sitz liest die Spur, der Mensch spielt live
  const g = createMatch(card, { params: P, seed: w.s, roles: ["ghost", "human"], ghost: ok.bytes });
  for (let t = 0; t < 400 && !g.status().over; t++) g.step({ 1: { b: 0 } });
  assert.ok(g.tick > 0);
});

// ---------- Lockstep ----------
test("Lockstep: zwei Geraete mit Verzoegerung rechnen dieselbe Partie; Hash-Abgleich meldet Abweichung offen", () => {
  const wireA = [], wireB = [];
  const mk = (seat, out) => {
    const m = createMatch(card, { params: P, seed: hex("71"), roles: seat === 0 ? ["human", "remote"] : ["remote", "human"] });
    const ls = createLockstep({ seat, other: 1 - seat, delay: 3, tick: 60, send: (x) => out.push(x), onDesync: (i) => { m.desync = i; } });
    return { m, ls };
  };
  const A = mk(0, wireA), B = mk(1, wireB);
  const inp = (seat, t) => ({ b: t % 50 === seat * 7 ? 1 : 0, ax: ((t >> 4) + seat) % 3 === 0 ? 1000 : -1000 });
  let tA = 0, tB = 0;
  for (let round = 0; round < 3000 && !(A.m.status().over && B.m.status().over); round++) {
    for (const [D, seat] of [[A, 0], [B, 1]]) {
      const t = seat === 0 ? tA : tB;
      if (D.m.status().over) continue;
      if (!D.ls.ready(t)) continue;
      D.ls.local(t, inp(seat, t));
      D.m.step(D.ls.inputs(t)); D.ls.after(t, D.m.hash());
      if (seat === 0) tA++; else tB++;
    }
    for (const x of wireA.splice(0)) B.ls.receive(JSON.parse(JSON.stringify(x)));
    for (const x of wireB.splice(0)) A.ls.receive(JSON.parse(JSON.stringify(x)));
  }
  assert.equal(A.m.status().over, true);
  assert.equal(A.m.hash(), B.m.hash(), "gleiche Partie auf beiden Geraeten");
  assert.equal(A.m.desync, undefined);
  // Abweichung: ein Geraet meldet falschen Hash
  const C = mk(0, []); let seen = null;
  const ls = createLockstep({ seat: 0, other: 1, delay: 0, tick: 2, send: () => {}, onDesync: (i) => { seen = i; } });
  ls.receive({ t: "rh", i: 1, h: "aaaaaaaaaaaaaaaa" }); ls.after(1, "bbbbbbbbbbbbbbbb");
  assert.deepEqual(seen, { tick: 1, mine: "bbbbbbbbbbbbbbbb", theirs: "aaaaaaaaaaaaaaaa" });
  void C;
  for (const x of [{ t: "rt", i: 3, x: [{ b: 1 }, { b: 0, ax: -1000 }] }, { t: "rh", i: 59, h: "0123456789abcdef" }, { t: "pause" }, { t: "resume" }, { t: "again" }, { t: "rs", i: 4, ms: 10, m: [{ t: "p", x: 3 }] }]) assert.equal(V.liveMsg(x), true, JSON.stringify(x));
  assert.equal(V.liveMsg({ t: "rt", i: 3, x: [{ b: 1, ax: 0.5 }] }), false, "nur Ganzzahlen");
});

// ---------- Split ----------
test("Split: geteilte Seiten tauschen out-Nachrichten, Ankunft als inbox im naechsten Tick; Glaettung begrenzt", () => {
  const side = {
    init: ({ seat }) => ({ seat, x: 0, seen: [] }),
    step: (st, { input, inbox, tick }) => ({ st: { ...st, x: st.x + (input.ax || 0) / 100, seen: st.seen.concat(inbox.map((m) => m.x)) }, out: tick % 3 === 0 ? [{ t: "p", x: st.x }] : [], ev: [] }),
    view: (st, ctx) => ({ t: "canvas", w: 10, h: 10, ops: [], tracked: ctx.tracked }),
    status: (st) => ({ over: st.seen.length >= 5, score: [0, 0], winner: -1 })
  };
  const c2 = { ...card, side, manifest: { ...card.manifest, rt: { ...card.manifest.rt, net: "split", smooth: [{ msg: "p", fields: ["x"], vmax: 100 }] } } };
  let now = 0; const qa = [], qb = [];
  const A = createSplit(c2, { seat: 0, params: P, seed: "x", send: (m) => qa.push(m), now: () => now });
  const B = createSplit(c2, { seat: 1, params: P, seed: "x", send: (m) => qb.push(m), now: () => now });
  for (let t = 0; t < 30; t++) { now += 16; A.step({ b: 0, ax: 1000 }); B.step({ b: 0 }); qa.splice(0).forEach((m) => B.receive(m)); qb.splice(0).forEach((m) => A.receive(m)); }
  assert.ok(B.state.seen.length >= 5, "B sieht A");
  assert.deepEqual(B.state.seen.slice(0, 3), [0, 30, 60]);
  assert.ok(B.tracked(0.016).p, "Glaettung liefert Werte");
  const tr = createTrack(1, { vmax: 10 }); tr.push(0, 0, [0]); tr.push(0.1, 0.1, [1000]);
  const v = tr.sample(0.2, 0.016)[0]; const v2 = tr.sample(0.216, 0.016)[0];
  assert.ok(Math.abs(v2 - v) <= 10 * 0.016 * 1.4 + 1e-9, "Schrittbegrenzung vmax·dt·1,4");
});

// ---------- Sitzung ----------
test("Sitzung: Countdown, Bot-Partie bis zum Ende mit Ereignissen, Pause/Weiter, Geist-Daten, Zeichnen je Bild", () => {
  let t = 0; const q = [], changes = [], evs = [], frames = [];
  const sess = createRtSession(card, { mode: "bot", seat: 0, params: P, seed: hex("81"), level: 3 }, {
    now: () => t, frame: (f) => q.push(f), draw: (node, info) => frames.push(info), onEvents: (e) => evs.push(...e), onChange: (c) => changes.push(c.type)
  });
  sess.start();
  const run = (ms) => { for (let x = 0; x < ms; x += 16) { t += 16; q.splice(0).forEach((f) => f()); } };
  run(1000); assert.equal(sess.phase, "ready"); assert.ok(frames.some((f) => f.countdown === 3));
  run(2100); assert.equal(sess.phase, "run"); assert.ok(changes.includes("go"));
  sess.key("Space", true); run(32); sess.key("Space", false);
  sess.pause(); const tk = sess.tick; run(500); assert.equal(sess.tick, tk, "Pause"); sess.resume(); assert.deepEqual(changes.slice(-2), ["pause", "resume"]);
  for (let i = 0; i < 400 && sess.phase !== "over"; i++) { sess.key("Space", i % 2 === 0); run(250); }
  assert.equal(sess.phase, "over", "Partie endet");
  assert.ok(evs.some((e) => e.k === "score"));
  assert.equal(changes[changes.length - 1], "over");
  assert.equal(verifyGhost(card, sess.ghostWire()).ok, true, "Geist der Bot-Partie pruefbar");
});

// ---------- Canvas ----------
function recCtx() {
  const calls = [];
  const grad = { addColorStop: (...a) => calls.push(["stop", ...a]) };
  return new Proxy({ calls, measureText: (s) => ({ width: s.length * 10 }), createLinearGradient: () => grad, createRadialGradient: () => grad, getContext() { return this; } }, {
    get(o, k) { if (k in o) return o[k]; return (...a) => calls.push([k, ...a]); },
    set(o, k, v) { o.calls.push(["=" + String(k), v]); return true; }
  });
}
test("Canvas: Ops werden ausgefuehrt, Token zu Farben, unbekannte Ops gemeldet, Budget, reduzierte Bewegung, Cache", () => {
  const c = recCtx();
  const node = card.view(createMatch(card, { params: P, seed: "v", roles: ["human", "bot"] }).state, { seat: 0, reduced: false });
  const env = { cw: 200, ch: 400, dpr: 2, colors: { ink: "#111111", paper: "#fff6dc", yellow: "#ffd400", red: "#ff3b1d", muted: "#4a4636", surface: "#ffffff", text: "#111111" }, t: 0, cache: new Map(), makeCanvas: () => recCtx() };
  const info = paint(c, node, env);
  assert.deepEqual(info.unknown, []);
  assert.ok(c.calls.some((x) => x[0] === "=fillStyle" && x[1] === "#ffd400"), "Token yellow");
  assert.ok(c.calls.some((x) => x[0] === "drawImage"), "gecachte Hintergrundebene");
  const again = recCtx(); paint(again, node, env);
  assert.equal(env.cache.size, 1, "Cache wiederverwendet");
  const bad = paint(recCtx(), { t: "canvas", w: 10, h: 10, ops: [{ o: "script" }, { o: "rect", x: 0, y: 0, w: 1, h: 1, fill: "javascript:" }] }, env);
  assert.deepEqual(bad.unknown, ["script"]);
  const many = { t: "canvas", w: 10, h: 10, ops: Array.from({ length: MAX_OPS + 50 }, () => ({ o: "rect", x: 0, y: 0, w: 1, h: 1 })) };
  assert.equal(paint(recCtx(), many, env).skipped, 50);
  const r = recCtx(); paint(r, { t: "canvas", w: 10, h: 10, ops: [{ o: "shake", amt: 9 }, { o: "flash", color: "#ffffff", alpha: 0.5 }, { o: "particles", list: Array.from({ length: 9 }, (_, i) => [i, i, 2, 1, "#ffffff"]), shape: "sq" }] }, { ...env, reduced: true });
  assert.equal(r.calls.filter((x) => x[0] === "fillRect").length, 1 + 3, "Hintergrund + 3 von 9 Partikeln, kein Blitz");
  assert.deepEqual(layoutText((s, z) => s.length * z * 0.5, "ein langer Satz fuer das Poster", 100, 100).lines.length >= 2, true);
});

test("ops2d: nur Methoden/Eigenschaften aus der Liste, Farben geprueft, save/restore ausgeglichen", () => {
  const c = recCtx(), unknown = [];
  const n = exec2d(c, [{ p: "fillStyle", v: "#ff0000" }, { m: "save" }, { m: "fillRect", a: [0, 0, 5, 5] }, { m: "eval", a: ["x"] }, { p: "fillStyle", v: "url(x)" }, { p: "innerHTML", v: "x" }, { op: "dots", a: [] }], { unknown });
  assert.equal(n, 7);
  assert.deepEqual(unknown, ["ops2d:eval", "ops2d:fillStyle", "ops2d:innerHTML", "ops2d:dots"]);
  assert.equal(c.calls.filter((x) => x[0] === "restore").length, 1, "offenes save wird geschlossen");
});

test("hashOf: Ganzzahl-Karten kanonisch, f64 ueber Bit-Hex, eigener hash() hat Vorrang", () => {
  assert.equal(hashOf(card, { a: 1 }).length, 16);
  const f = { manifest: { rt: { numeric: "f64" } } };
  assert.notEqual(hashOf(f, { a: 0.1 }), hashOf(f, { a: 0.2 }));
  assert.match(hashOf({ ...f, hash: () => "abc" }, {}), /^[0-9a-f]{16}$/, "eigener Hash auf 16 Hex normiert (Review M3)");
  assert.equal(hashOf({ ...f, hash: () => "0123456789abcdef99" }, {}), "0123456789abcdef");
});
