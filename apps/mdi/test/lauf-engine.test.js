// Engine E3 Lauf gegen das Alt-Orakel: eingefrorene sha256 aus alt test/lauf-engine.test.js (ev 1, ev 0, ev 0 mit
// Sinus-Flugbahn), alter Link aus golden-links.json, Tick-fuer-Tick-Vergleich und der Bot der Seite ueber 600 Seeds.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import * as E from "../src/engines/lauf/engine.js";
import * as L from "../src/engines/lauf/params.js";
import { fromWords } from "../src/engines/lauf/words.js";

const require = createRequire(import.meta.url);
const F = require("./fixtures/alt-e2/lauf-replay.cjs");
const AL = require("./fixtures/alt-e2/lauf.cjs");
const AE = require("./fixtures/alt-e2/lauf-engine.cjs");
const LINKS = require("./fixtures/flug-lauf-links.json");
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const GOLD_EV1 = "42d12dae9fa8f494f9d2fb16684fc7ed85306ca01e459828bb229923b915a7ff";
const GOLD_EV0 = "268498aeca8c721703ddc81fa2cdc7a4e2b215ea9b67b9bb9fe6b977d17fc197";
const GOLD_EV0_FLUG = "e4639726fb86289187ed90580d1291cf1e1fe71e7ad9499a0f234db4ee465fe8";

test("Golden-Replay ev 1: fester Seed + feste Tick-Eingaben = eingefrorener sha256 (mit fliegenden Gegnern, Ducken, Spruengen)", () => {
  const r = F.replay(E, F.NEW, F.INPUTS, F.MAX);
  assert.equal(L.sanitize(F.NEW).ev, 1);
  const rows = r.text.split("\n");
  assert.ok(rows.filter((x) => /,flug,/.test(x)).length > 300);
  assert.ok(rows.filter((x) => /,jump/.test(x)).length >= 3);
  assert.ok(rows.some((x) => x.split(",")[9] === "1"), "geduckt");
  assert.equal(sha(r.text), GOLD_EV1, r.ticks + " Ticks, " + r.points + " Punkte");
});

test("Alter Link (golden-links.json, ohne ev = ev 0): dasselbe Doc, dieselbe Zustandsfolge, Sinus-Bahn auf 6 Stellen", () => {
  const g = LINKS.links.find((x) => x.doc.k === "lauf");
  const raw = JSON.parse(Buffer.from(g.hash.slice(3), "base64url").toString()).d;
  const cp = L.fromServerDoc(raw), p = { l: L.laufOf(cp) };
  assert.deepEqual(p.l, g.doc.l); assert.equal(cp.t, g.doc.t); assert.deepEqual(cp.ki, g.doc.ki); assert.deepEqual(cp.col, g.doc.col);
  assert.deepEqual(L.toServerDoc(cp, raw), g.doc, "Rundreise Doc -> Kartenparameter -> Doc");
  assert.equal("ev" in p.l, false);
  assert.deepEqual(p.l, F.OLD);
  const r = F.replay(E, p.l, F.INPUTS, F.MAX);
  assert.equal(sha(r.text), GOLD_EV0);
  assert.deepEqual([r.ticks, r.state, r.points, r.meters], [689, "over", 117, 117]);
  const r2 = F.replay(E, { ...p.l, seed: 11 }, F.INPUTS, F.MAX);
  assert.equal(r2.text.split("\n").filter((x) => /,flug,/.test(x)).length, 1079);
  assert.equal(sha(F.rounded(r2.text)), GOLD_EV0_FLUG);
  assert.deepEqual([r2.ticks, r2.state, r2.points], [1232, "over", 240]);
});

test("Differenz gegen den Altcode: 90 Docs aus build() und Zufallsparametern, gleiche Zustandsfolge Tick fuer Tick", () => {
  let seed = 1;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  for (let n = 0; n < 90; n++) {
    let l;
    if (n % 2) l = L.build({ mode: L.MODES[n % 2], world: L.WORLDS[n % 8], level: ["easy", "normal", "hard"][n % 3], has: Object.keys(L.HAS).filter(() => rnd() < 0.6), foes: L.PATTERNS.filter(() => rnd() < 0.6) }, n * 7919);
    else { const p = {}; for (const k of Object.keys(L.SPEC)) p[k] = L.SPEC[k][0] + rnd() * (L.SPEC[k][1] - L.SPEC[k][0]); l = { ev: n % 4 ? 1 : undefined, seed: n, fp: ["geh", "huepf", "flug"], p }; }
    assert.deepEqual(L.sanitize(l), AL.sanitize(l), "sanitize " + n);
    const a = F.replay(E, l, F.INPUTS, 1500).text, b = F.replay(AE, l, F.INPUTS, 1500).text;
    if (l.ev) assert.equal(a, b, "Lauf " + n); else assert.equal(F.rounded(a), F.rounded(b), "Lauf ev0 " + n);
  }
});

test("build() und Wortregeln gleich dem Altcode; ev bleibt; Zahlen kommen aus dem Level", () => {
  assert.equal(L.EV, 1);
  assert.equal("ev" in L.sanitize({}), false); assert.equal(L.sanitize({ ev: 7 }).ev, 7);
  for (const bad of [0, -1, "1", 1.5, null, 1e3]) assert.equal("ev" in L.sanitize({ ev: bad }), false);
  for (const lv of Object.keys(L.LEVELS)) for (const w of L.WORLDS) assert.deepEqual(L.build({ level: lv, world: w, has: ["gegner", "ducken"], foes: ["flug"] }, 3), AE.build({ level: lv, world: w, has: ["gegner", "ducken"], foes: ["flug"] }, 3));
  const base = L.build({}, 42);
  const src = fs.readFileSync(new URL("./fixtures/alt-e2/lauf-engine.cjs", import.meta.url), "utf8");
  assert.ok(src.length > 0);
  for (const s of ["Endlos über Brücken", "Jump’n’Run mit Ziel im Wald", "Nachts in der Stadt, mit Gegnern", "Weich Dingen von oben aus, nur das", "schwerer Dino im Vulkan der hüpft", "easy snow penguin"]) {
    const l = fromWords(s, base);
    assert.equal(l.seed, 42, "Seed bleibt");
    assert.ok(L.WORLDS.includes(l.w) && L.MODES.includes(l.m));
  }
  assert.equal(fromWords("Jump'n'Run im Wald", base).m, "ziel");
  assert.equal(fromWords("im Wald", base).w, "wald");
  assert.deepEqual(fromWords("Weich Dingen von oben aus, nur das", base).p.fa > 0, true);
});

test("Eingaben am Tick: press/release/duck wirken erst im naechsten step(); halten springt hoeher als tippen", () => {
  const s = E.createSim({ ev: 1, p: { v: 200, vm: 200, a: 0, lu: 0, hi: 0, ge: 0, mu: 0, hv: 0, du: 0 } });
  assert.deepEqual(s.press(), ["start"]);
  s.step(); const y0 = s.me.y;
  s.press(); s.setDuck(true);
  assert.equal(s.me.y, y0); assert.equal(s.duck, false);
  assert.deepEqual(s.step(), ["jump"]); assert.equal(s.held, true); assert.equal(s.duck, true);
  const peak = (hold) => { const t = E.createSim({ ev: 1, p: { v: 200, vm: 200, a: 0, lu: 0, hi: 0, ge: 0, mu: 0, hv: 0 } }); t.press(); t.step(); t.press(); if (!hold) t.release(); let top = 0; t.step(); for (let i = 0; i < 400 && !t.me.on; i++) { t.step(); top = Math.max(top, E.GY - t.me.y); } return top; };
  assert.ok(peak(true) > peak(false) * 1.3);
});

test("Ziel ev 1 ist eine Linie (auch uebersprungen), ev 0 nur bei Beruehrung", () => {
  const run = (ev) => {
    const l = { m: "ziel", seed: 2, p: { v: 200, vm: 200, a: 0, lu: 0, hi: 0, ge: 0, mu: 0, hv: 0, len: 100 } }; if (ev) l.ev = ev;
    const s = E.createSim(l); s.press(); const g = s.items.find((x) => x.t === "g");
    for (let i = 0; i < 120 * 30 && s.state === "run"; i++) { if (s.me.x > g.x - 60 && s.me.x < g.x + 60) { s.me.y = g.y - 80; s.me.vy = 0; } s.step(); }
    return s.state;
  };
  assert.equal(run(1), "goal"); assert.equal(run(0), "over");
});

test("Flugbahn ev 1: Dreieck in ganzen Ticks, Abstand in 1/256 px, Periode 192", () => {
  const f = E.createSim({ ev: 1, seed: 5, fp: ["flug"], p: { ge: 80, hi: 0, lu: 0, mu: 0 } });
  const fl = f.items.filter((x) => x.t === "f" && x.k === "flug");
  assert.ok(fl.length >= 3);
  f.press();
  const seen = new Map(fl.map((x) => [x, []]));
  for (let t = 0; t < 2 * E.FLY && f.state === "run"; t++) { f.step(); for (const x of fl) if (x.live) seen.get(x).push(x.y); }
  for (const [x, list] of seen) {
    for (const y of list) { const q = (y - (x.base - 64)) * 256; assert.ok(Math.abs(q - Math.round(q)) < 1e-6); }
    if (list.length > E.FLY) assert.equal(list[E.FLY], list[0]);
  }
});

test("Bot der Seite erreicht das Ziel: 200 Seeds x 3 Level mit Luecken und Stufen", () => {
  const miss = [];
  for (const level of ["easy", "normal", "hard"]) for (let seed = 1; seed <= 200; seed++) {
    const s = E.createSim(L.build({ mode: "ziel", level, world: "bruecke", has: ["luecken"] }, seed)); s.press();
    for (let i = 0; i < 120 * 120 && s.state === "run"; i++) { E.bot(s); s.step(); }
    if (s.state !== "goal") miss.push(level + "/" + seed);
  }
  assert.deepEqual(miss, []);
});

test("Simulationskern ohne Math.sin/cos/exp/pow/random, auch der eingefrorene ev-0-Block (sinD); zur Laufzeit geprueft, auch fuer ev 0", () => {
  const BAD = /Math\.(sin|cos|tan|asin|acos|atan2?|sinh|cosh|tanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot|random)\b|\*\*/;
  const src = fs.readFileSync(new URL("../src/engines/lauf/engine.js", import.meta.url), "utf8");
  const a = src.indexOf("// ---- ev 0, frozen"), b = src.indexOf("// ---- end ev 0 ----");
  assert.ok(a > 0 && b > a); assert.equal(src.slice(a, b).split("\n").length, 3); assert.ok(/sinD\(/.test(src.slice(a, b)), "ev 0: sinD statt Math.sin");
  const core = (src.slice(0, a) + src.slice(b)).replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((x) => BAD.test(x.replace(/\/\/.*$/, "")));
  assert.deepEqual(core, []);
  for (const f of ["params.js", "words.js"]) assert.deepEqual(fs.readFileSync(new URL("../src/engines/lauf/" + f, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((x) => BAD.test(x.replace(/\/\/.*$/, ""))), [], f);
  const keep = {};
  for (const k of ["sin", "cos", "exp", "pow", "random"]) { keep[k] = Math[k]; Math[k] = () => { throw new Error("Math." + k); }; }
  try { F.replay(E, F.NEW, F.INPUTS, F.MAX); F.replay(E, { ...F.OLD, seed: 11 }, F.INPUTS, F.MAX); } finally { Object.assign(Math, keep); }
});
