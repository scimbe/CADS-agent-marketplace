// Karte "lauf" (ADR 0001 (b)): die Golden-Folge des Altcodes ueber den Kartenvertrag, Geist, Herausforderung,
// Anzeigeliste, reduzierte Bewegung, Determinismus.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import Ajv from "ajv";
import lauf from "../src/cards/lauf/card.js";
import * as LP from "../src/engines/lauf/params.js";
import { points, meters } from "../src/engines/lauf/engine.js";
import * as S from "../src/engines/flug/spur.js";

const require = createRequire(import.meta.url);
const F = require("./fixtures/alt-e2/lauf-replay.cjs");
const M = lauf.manifest, DEF = Object.fromEntries(Object.entries(M.params.properties).map(([k, d]) => [k, d.default]));
const full = (p) => Object.assign({}, DEF, p);
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const GOLD_EV1 = "42d12dae9fa8f494f9d2fb16684fc7ed85306ca01e459828bb229923b915a7ff";
const GOLD_EV0 = "268498aeca8c721703ddc81fa2cdc7a4e2b215ea9b67b9bb9fe6b977d17fc197";

// Die feste Eingabeliste des Altcodes (p/r/d/u an Ticks) als Eingabewort je Tick: Tippen = Puls, Halten und Ducken = Pegel
function words(inputs, max) {
  const out = []; let hold = 0, duck = 0, k = 0;
  for (let t = 0; t < max; t++) {
    let tap = 0;
    while (k < inputs.length && inputs[k][0] === t) { const c = inputs[k][1]; if (c === "p") { tap = 1; hold = 2; } else if (c === "r") hold = 0; else if (c === "d") duck = 4; else if (c === "u") duck = 0; k++; }
    out.push(tap | hold | duck);
  }
  return out;
}
function replayCard(l, inputs, max) {
  const w = words(inputs, max);
  let st = lauf.init({ params: full(LP.paramsOfLauf(l)), players: 1 }); const rows = [];
  for (let t = 0; t < max && st.sims[0].state !== "over" && st.sims[0].state !== "goal" && (t === 0 || st.sims[0].state === "run"); t++) {
    const r = lauf.step(st, [{ b: w[t] }], t); st = r.state; const s = st.sims[0];
    const row = [s.ticks, s.state, s.me.x, s.me.y, s.me.vy, s.me.on ? 1 : 0, s.coins, s.stomps, s.held ? 1 : 0, s.duck ? 1 : 0, r.ev.filter((e) => e.k !== "start").map((e) => e.k).join("+")];
    for (const it of s.items) if (it.t === "f" && it.live) row.push(it.k, it.x, it.y);
    rows.push(row.join(","));
  }
  return { text: rows.join("\n"), st };
}

test("Manifest: Echtzeit 120 Hz, drei Knoepfe (Tippen, Halten, Ducken) mit Tasten, Ducken als echter Knopf, Parameter gueltig", () => {
  assert.equal(M.kind, "realtime"); assert.deepEqual(M.rt.controls.buttons.map((b) => b.id), ["tap", "hold", "duck"]);
  assert.ok(M.rt.controls.buttons.every((b) => b.keys.length)); assert.equal(M.rt.controls.buttons[2].zone, "button");
  const v = new Ajv({ strict: false }).compile(M.params); assert.ok(v(DEF), JSON.stringify(v.errors));
  for (const part of M.parts) for (const k of part.params) assert.ok(k in M.params.properties, part.id + "." + k);
  for (const k of LP.PKEYS) assert.deepEqual([M.params.properties[k].minimum, M.params.properties[k].maximum], LP.SPEC[k].slice(0, 2), k);
});

test("Kartenvertrag spielt die Golden-Folgen des Altcodes: ev 1 (sha256 eingefroren) und alter Link ev 0", () => {
  const a = replayCard(F.NEW, F.INPUTS, F.MAX);
  assert.equal(sha(a.text), sha(F.replay(require("./fixtures/alt-e2/lauf-engine.cjs"), F.NEW, F.INPUTS, F.MAX).text));
  assert.equal(sha(a.text), GOLD_EV1);
  const b = replayCard(F.OLD, F.INPUTS, F.MAX);
  assert.equal(sha(b.text), GOLD_EV0);
  assert.deepEqual([points(b.st.sims[0]), meters(b.st.sims[0])], [117, 117]);
});

test("Geist per Link: Sitz 1 aus der Spur laeuft bitgleich wie der Absender (Halten und Ducken als Pegel in der Spur)", () => {
  const w = words(F.INPUTS, 2400), rec = S.recorder();
  let a = lauf.init({ params: full(LP.paramsOfLauf(F.NEW)), players: 1 });
  for (let t = 0; t < 2400 && !lauf.status(a).over; t++) { rec.put(t, w[t]); a = lauf.step(a, [{ b: w[t] }], t).state; }
  rec.end(a.t);
  const bytes = rec.bytes(); assert.ok(S.sanitize(bytes), "gueltige Spur"); assert.ok(bytes.length <= M.rt.ghost.bytes);
  const pl = S.player(bytes);
  let b = lauf.init({ params: full(LP.paramsOfLauf(F.NEW)), players: 2 });
  for (let t = 0; t < 2400 && !lauf.status(b).over; t++) b = lauf.step(b, [{ b: 0 }, { b: pl.at(t) }], t).state;
  assert.equal(points(b.sims[1]), points(a.sims[0])); assert.equal(b.sims[1].me.x, a.sims[0].me.x);
  assert.equal(lauf.status(b).winner, 1, "wer nichts tut, verliert gegen den Geist");
});

test("Herausforderung ohne Geist (alt l.r): Punkte zum Schlagen im Bild und im Ergebnis", () => {
  let st = lauf.init({ params: full({ ...LP.paramsOfLauf(F.NEW), r: 5 }), players: 1 });
  assert.match(JSON.stringify(lauf.view(st, { lang: "de" })), /Schlag 5 Punkte/);
  for (let t = 0; t < 30000 && !lauf.status(st).over; t++) st = lauf.step(st, [lauf.bot(st, 0)], t).state;
  const s = lauf.status(st); assert.ok(s.over); assert.ok(s.beat && s.beat.de);
});

test("Bot als Eingabewort erreicht das Ziel wie der Seiten-Bot (30 Seeds, 3 Level)", () => {
  const miss = [];
  for (const level of ["easy", "normal", "hard"]) for (let seed = 1; seed <= 10; seed++) {
    let st = lauf.init({ params: full(LP.paramsOfLauf(LP.build({ mode: "ziel", level, world: "bruecke", has: ["luecken"] }, seed))), players: 1 });
    for (let t = 0; t < 120 * 120 && !lauf.status(st).over; t++) st = lauf.step(st, [lauf.bot(st, 0)], t).state;
    if (!lauf.status(st).goal) miss.push(level + "/" + seed);
  }
  assert.deepEqual(miss, []);
});

test("Anzeige: Canvas 400x360, deterministisch, alle Welten, Foto-Slots, reduzierte Bewegung ohne Wackeln/Blitz", () => {
  for (const w of LP.WORLDS) {
    let st = lauf.init({ params: full({ ...DEF, w, du: 30, ge: 40, fa: 20, fp: ["geh", "huepf", "flug"] }), players: 1 });
    for (let t = 0; t < 400; t++) st = lauf.step(st, [lauf.bot(st, 0)], t).state;
    const a = lauf.view(st, { t: 2, lang: "en" });
    assert.equal(a.w, 400); assert.equal(a.h, 360); assert.equal(JSON.stringify(a), JSON.stringify(lauf.view(st, { t: 2, lang: "en" })));
    assert.match(a.a11y, /Runner game/);
  }
  let st = lauf.init({ params: full({}), players: 1 });
  for (let t = 0; t < 5000 && !lauf.status(st).over; t++) st = lauf.step(st, [{ b: 0 }], t).state;
  assert.ok(lauf.status(st).over);
  assert.ok(/"o":"flash"/.test(JSON.stringify(lauf.view(st, { t: 1 }))) || st.fx.flash === 0);
  assert.ok(!/"o":"(shake|flash)"/.test(JSON.stringify(lauf.view(st, { t: 1, reduced: true }))));
  const js = JSON.stringify(lauf.view(st, { assets: { figur: true, hintergrund: true } }));
  assert.ok(js.includes('"slot":"figur"') && js.includes('"slot":"hintergrund"') && !/data:|blob:/.test(js));
});

test("Determinismus und Reinheit: gleiche Eingaben = gleiche Hash-Folge, step veraendert den alten Zustand nicht", () => {
  const seq = () => { let st = lauf.init({ params: full({}), players: 1 }); const hs = []; for (let t = 0; t < 1200; t++) { st = lauf.step(st, [{ b: t % 50 === 0 ? 3 : t % 50 < 20 ? 2 : 0 }], t).state; if (t % 100 === 0) hs.push(lauf.hash(st)); } return hs; };
  assert.deepEqual(seq(), seq());
  const s0 = lauf.init({ params: full({}), players: 1 }), snap = JSON.stringify(s0);
  lauf.step(s0, [{ b: 3 }], 0); assert.equal(JSON.stringify(s0), snap);
  const l = lauf.fromWords("Jump'n'Run im Wald mit Gegnern, Frosch der hüpft", LP.laufOf(DEF));
  assert.equal(l.w, "wald"); assert.equal(l.m, "ziel"); assert.equal(l.e, "🐸"); assert.equal(l.anim.art, "huepfen");
});
