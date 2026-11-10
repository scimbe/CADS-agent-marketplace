"use strict";
// The runner's deterministic core (doc version ev 1, src/lauf.js EV): a golden replay (fixed doc + fixed inputs at fixed
// ticks -> one sha256 of the states, the same in Chromium and WebKit: test/e2e/lauf-replay.e2e.js), inputs only at a
// tick, the flying path in exact fixed point, nothing transcendental in the run, old links (no ev) unchanged, and the
// page's bot (src/lauf-ui.js) reaching the goal of 200 seeds in each of the 3 levels.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const L = require("../src/lauf.js");
const E = require("../src/lauf-engine.js");
const D = require("../src/daily.js");
const F = require("./fixtures/lauf-replay.js");
const G = require("./golden-links.json");

const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
// frozen: ev 1 as made by this change; ev 0 as feat/engine-lauf c083322 (before it) played the old link, and the same
// doc with seed 11 (its run meets flying foes in 1079 of 1232 ticks: the old sine path is in the hash). The old link's
// own run meets no flying foe, so no Math.sin: its exact hash holds in every engine. Seed 11 does use Math.sin, which
// differs in the last bits between engines (F.rounded): compared to 6 places.
const GOLD_EV1 = "42d12dae9fa8f494f9d2fb16684fc7ed85306ca01e459828bb229923b915a7ff";
const GOLD_EV0 = "268498aeca8c721703ddc81fa2cdc7a4e2b215ea9b67b9bb9fe6b977d17fc197";
const GOLD_EV0_FLUG = "e4639726fb86289187ed90580d1291cf1e1fe71e7ad9499a0f234db4ee465fe8";
// the page's bot, taken from src/lauf-ui.js as it is (that file needs a DOM)
const UI = fs.readFileSync(path.join(__dirname, "../src/lauf-ui.js"), "utf8");
const bot = new Function("return " + UI.match(/function bot\(s\) \{[\s\S]*?\n {2}\}/)[0])();

test("Golden-Replay ev 1: fester Seed + feste Tick-Eingaben = eingefrorener sha256, mit fliegenden Gegnern", () => {
  const r = F.replay(E, F.NEW, F.INPUTS, F.MAX);
  assert.equal(L.sanitize(F.NEW).ev, 1);
  assert.ok(r.ticks > 600, "lang genug: " + r.ticks + " Ticks");
  const rows = r.text.split("\n");
  assert.ok(rows.filter((x) => /,flug,/.test(x)).length > 300, "Flieger bewegen sich in den meisten Ticks");
  assert.ok(rows.filter((x) => /,jump/.test(x)).length >= 3, "gesprungen");
  assert.ok(rows.some((x) => x.split(",")[9] === "1"), "geduckt");
  assert.equal(sha(r.text), GOLD_EV1, "Zustandsfolge ev 1 geaendert: " + r.ticks + " Ticks, " + r.points + " Punkte");
  assert.equal(sha(F.replay(E, F.NEW, F.INPUTS, F.MAX).text), GOLD_EV1, "zweimal gleich");
});

test("Alte Links (ohne ev = ev 0): dasselbe Doc, dieselbe Zustandsfolge und dieselben Punkte wie vor der Aenderung", () => {
  const g = G.links.find((x) => x.doc.k === "lauf");
  const doc = D.parseRoute(g.hash).doc;
  assert.deepEqual(doc, g.doc); assert.equal("ev" in doc.l, false, "kein ev im alten Link");
  assert.deepEqual(doc.l, F.OLD, "die Fixture ist das Doc des alten Links");
  const r = F.replay(E, doc.l, F.INPUTS, F.MAX);
  assert.equal(sha(r.text), GOLD_EV0, "alte Bahn geaendert");
  assert.deepEqual([r.ticks, r.state, r.points, r.meters], [689, "over", 117, 117]);
  const r2 = F.replay(E, { ...doc.l, seed: 11 }, F.INPUTS, F.MAX);
  assert.equal(r2.text.split("\n").filter((x) => /,flug,/.test(x)).length, 1079, "alte Flugbahn im Lauf");
  assert.equal(sha(F.rounded(r2.text)), GOLD_EV0_FLUG, "alte Flugbahn (Math.sin) geaendert");
  assert.deepEqual([r2.ticks, r2.state, r2.points], [1232, "over", 240]);
  // the same seed as ev 1 has the same track (only the flying path and the goal line differ)
  const a = E.createSim(doc.l), b = E.createSim({ ...doc.l, ev: 1 });
  assert.deepEqual(a.spans, b.spans); assert.equal(a.items.length, b.items.length);
});

test("ev im Doc: fehlt = 0 (bleibt weg), 1 bleibt, eine neuere Version bleibt erhalten, Unsinn faellt weg; build() setzt EV", () => {
  assert.equal(L.EV, 1);
  assert.equal("ev" in L.sanitize({}), false);
  assert.equal(L.sanitize({ ev: 1 }).ev, 1);
  assert.equal(L.sanitize({ ev: 7 }).ev, 7, "weitergeteilt bleibt die Version, gespielt wird der neueste bekannte Lauf");
  for (const bad of [0, -1, "1", 1.5, null, 1e3]) assert.equal("ev" in L.sanitize({ ev: bad }), false, String(bad));
  const l = E.build({ mode: "ziel", level: "easy" }, 3);
  assert.equal(l.ev, 1);
  assert.deepEqual(L.sanitize(l), l, "stabil");
  const doc = D.sanitizeDoc({ k: "lauf", col: ["#ffd400", "#ff3b1d"], by: [], t: "Lauf", l: { ...l, r: 99 } });
  const url = D.docUrl(doc), back = D.parseRoute(url.slice(url.indexOf("#"))).doc;
  assert.deepEqual(back, doc); assert.equal(back.l.ev, 1);
  assert.ok(url.length < 900, "kurzer Link: " + url.length);
});

test("Flugbahn ev 1: Dreieck in ganzen Ticks, Abstand in 1/256 px, Periode 192 Ticks, 22 px auf und ab", () => {
  const f = E.createSim({ ev: 1, seed: 5, fp: ["flug"], p: { ge: 80, hi: 0, lu: 0, mu: 0 } });
  const fl = f.items.filter((x) => x.t === "f" && x.k === "flug");
  assert.ok(fl.length >= 3, "Flieger im Doc");
  for (const x of fl) assert.ok(Number.isInteger(x.fph) && x.fph >= 0 && x.fph < E.FLY);
  f.press();
  const seen = new Map(fl.map((x) => [x, []]));
  for (let t = 0; t < 2 * E.FLY && f.state === "run"; t++) { f.step(); for (const x of fl) if (x.live) seen.get(x).push(x.y); }
  for (const [x, list] of seen) {
    for (const y of list) {
      const q = (y - (x.base - 64)) * 256;
      assert.ok(Math.abs(q - Math.round(q)) < 1e-6, "Festkomma: Abstand " + q / 256);
      assert.ok(y >= x.base - 64 - 22 && y <= x.base - 64 + 22, "Hoehe " + y);
    }
    if (list.length > E.FLY) assert.equal(list[E.FLY], list[0], "Periode " + E.FLY);
  }
});

test("Eingaben am Tick: press/release/duck wirken erst im naechsten step(), druecken+loslassen davor = kurzer Sprung", () => {
  const s = E.createSim({ ev: 1, p: { v: 200, vm: 200, a: 0, lu: 0, hi: 0, ge: 0, mu: 0, hv: 0, du: 0 } });
  assert.deepEqual(s.press(), ["start"]); assert.equal(s.state, "run", "der erste Tipp startet sofort (Tick 0)");
  s.step(); const y0 = s.me.y, vy0 = s.me.vy;
  s.press(); s.setDuck(true);
  assert.equal(s.me.y, y0); assert.equal(s.me.vy, vy0); assert.equal(s.held, false); assert.equal(s.duck, false, "nichts zwischen zwei Ticks");
  assert.deepEqual(s.step(), ["jump"]); assert.equal(s.held, true); assert.equal(s.duck, true);
  s.release(); s.setDuck(false); assert.equal(s.held, true, "Loslassen erst am naechsten Tick");
  s.step(); assert.equal(s.held, false);
  // a tap (press and release before one tick) jumps lower than a held press
  const peak = (hold) => { const t = E.createSim({ ev: 1, p: { v: 200, vm: 200, a: 0, lu: 0, hi: 0, ge: 0, mu: 0, hv: 0 } }); t.press(); t.step(); t.press(); if (!hold) t.release(); let top = 0; t.step(); for (let i = 0; i < 400 && !t.me.on; i++) { t.step(); top = Math.max(top, E.GY - t.me.y); } return top; };
  assert.ok(peak(true) > peak(false) * 1.3, "halten hoeher als tippen");
});

test("Ziel ev 1 ist eine Linie (auch uebersprungen), ev 0 nur bei Beruehrung der Fahne wie bisher", () => {
  const run = (ev) => {
    const l = { m: "ziel", seed: 2, p: { v: 200, vm: 200, a: 0, lu: 0, hi: 0, ge: 0, mu: 0, hv: 0, len: 100 } };
    if (ev) l.ev = ev;
    const s = E.createSim(l); s.press();
    const g = s.items.find((x) => x.t === "g");
    // fly over the flag: high above the ground, held there
    for (let i = 0; i < 120 * 30 && s.state === "run"; i++) { if (s.me.x > g.x - 60 && s.me.x < g.x + 60) { s.me.y = g.y - 80; s.me.vy = 0; } s.step(); }
    return s.state;
  };
  assert.equal(run(1), "goal");
  assert.equal(run(0), "over", "ev 0 bleibt wie vorher");
});

test("Simulationskern ohne Math.sin/cos/exp/pow/random (nur der eingefrorene ev-0-Block hat Math.sin)", () => {
  const BAD = /Math\.(sin|cos|tan|asin|acos|atan2?|sinh|cosh|tanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot|random)\b|\*\*/;
  const src = fs.readFileSync(path.join(__dirname, "../src/lauf-engine.js"), "utf8");
  const a = src.indexOf("// ---- ev 0, frozen"), b = src.indexOf("// ---- end ev 0 ----");
  assert.ok(a > 0 && b > a, "ev-0-Block markiert");
  const v0 = src.slice(a, b);
  assert.equal(v0.split("\n").length, 3, "ev-0-Block bleibt eine Zeile");
  assert.ok(/Math\.sin/.test(v0));
  const core = src.slice(0, a) + src.slice(b);
  const hit = core.split("\n").map((x, i) => [i + 1, x]).filter(([, x]) => BAD.test(x.replace(/\/\/.*$/, "")));
  assert.deepEqual(hit, [], "verbotene Funktion im Kern");
  const doc = fs.readFileSync(path.join(__dirname, "../src/lauf.js"), "utf8").split("\n").filter((x) => BAD.test(x.replace(/\/\/.*$/, "")));
  assert.deepEqual(doc, []);
  // and at run time: a run of ev 1 never calls them
  const keep = {};
  for (const k of ["sin", "cos", "exp", "pow", "random"]) { keep[k] = Math[k]; Math[k] = () => { throw new Error("Math." + k + " im Lauf"); }; }
  try { F.replay(E, F.NEW, F.INPUTS, F.MAX); } finally { Object.assign(Math, keep); }
});

test("Bot der Seite (LaufDebug.auto) erreicht das Ziel: 200 Seeds x 3 Level, Level mit Luecken und Stufen", () => {
  let n = 0;
  const miss = [];
  for (const level of ["easy", "normal", "hard"]) for (let seed = 1; seed <= 200; seed++) {
    const l = E.build({ mode: "ziel", level, world: "bruecke", has: ["luecken"] }, seed);
    assert.ok(l.p.lu > 0 && l.p.hv > 0 && l.ev === 1);
    const s = E.createSim(l); s.press();
    for (let i = 0; i < 120 * 120 && s.state === "run"; i++) { bot(s); s.step(); }
    if (s.state === "goal") n++; else miss.push(level + "/" + seed + ": " + s.state + " bei " + s.meters() + " m");
  }
  assert.deepEqual(miss, []); assert.equal(n, 600);
});
