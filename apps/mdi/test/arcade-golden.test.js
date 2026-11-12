// Golden-Tests gegen den Altcode (Alt-Orakel): test/fixtures/arcade-alt.json entsteht aus alt:src/arcade.js/arcade2.js
// (test/fixtures/arcade-alt/gen.mjs) mit festen Seeds und derselben Wuerfelfolge der Bots.
//
// Toleranzen und ihr Grund: Der Altcode rechnet in Gleitkomma wie die neue Engine (numeric "f64"), nutzt aber
// Math.hypot, Math.exp, Math.sin und Math.cos. Diese Funktionen sind in ECMA-262 nur "implementation-approximated";
// die neue Engine ersetzt sie durch sqrt(x*x+y*y) und Reihen aus + - * / (num.js), die auf jeder Engine bitgleich sind.
// Einzelwerte weichen dadurch hoechstens um wenige ulp ab (gemessen <= 1.4e-11 absolut): Toleranz 1e-9.
// Ganzzahlige Ergebnisse (Insel, Krater, Wind) und Rechnungen ohne diese Funktionen (Eis-Stock, Murmeln, Granatenflug)
// muessen exakt gleich sein. In ganzen Partien waechst eine ulp-Abweichung an Stoessen exponentiell (chaotische
// Dynamik): Spiele mit Reibung exp() und hypot() in jedem Schritt (Puck, Kick, Volley) laufen nur bis zu einem Horizont
// gleich (gemessen: erste Abweichung > 0,5 nach 12-80 s), dahinter gilt der Verteilungsvergleich ueber 16 Partien.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as A from "../src/engines/arcade/index.js";
import { puckServe, puckStrike } from "../src/engines/arcade/puck.js";
import { ziegelServe, ziegelDefend } from "../src/engines/arcade/ziegel.js";
import { volleyServe, volleyStep, volleyBump } from "../src/engines/arcade/volley.js";
import { island, wind, flight, crater, surface } from "../src/engines/arcade/panzer.js";
import { kickRods } from "../src/engines/arcade/kick.js";
import { flipBumpers, flipSeg } from "../src/engines/arcade/flipper.js";
import { snowWalls } from "../src/engines/arcade/snow.js";
import { elfSpot } from "../src/engines/arcade/elfer.js";
import { discStep } from "../src/engines/arcade/core.js";
import { LIMIT_TICKS } from "../src/engines/arcade/index.js";

const G = JSON.parse(fs.readFileSync(new URL("./fixtures/arcade-alt.json", import.meta.url), "utf8"));
const EPS = 1e-9;
function near(a, b, eps, what) {
  if (typeof a === "number") { assert.ok(Math.abs(a - b) <= eps, what + ": " + a + " vs " + b); return; }
  if (typeof a === "boolean" || typeof a === "string" || a === null) { assert.equal(b, a, what); return; }
  if (Array.isArray(a)) { assert.equal(b.length, a.length, what + " Laenge"); a.forEach((x, i) => near(x, b[i], eps, what + "[" + i + "]")); return; }
  for (const k of Object.keys(a)) near(a[k], b[k], eps, what + "." + k);
}

test("Golden: Aufschlaege aus dem Seed wie im Altcode (Puck exakt, Ziegel/Volley bis auf ulp von sin/cos)", () => {
  assert.ok(G.fn.serves.length >= 60);
  for (const v of G.fn.serves) {
    assert.deepEqual(puckServe(v.s, v.n), v.puck, "puck " + v.s);
    near(v.ziegel, ziegelServe(v.s, v.n), EPS, "ziegel " + v.s);
    assert.deepEqual(volleyServe(v.s, v.n), v.volley, "volley " + v.s);
  }
});
test("Golden: Insel und Wind exakt (Ganzzahlen), Bumper, Waelle, Elfmeterpunkte und Murmelkreuz", () => {
  for (const v of G.fn.island) { assert.deepEqual(island(v.s), v.T, "Insel " + v.s); assert.deepEqual([0, 1, 2, 3, 4, 5].map((k) => wind(v.s, k)), v.wind); }
  for (const v of G.fn.layout) {
    assert.deepEqual(flipBumpers(v.s), v.bumps); assert.deepEqual(snowWalls(v.s), v.walls);
    assert.deepEqual([0, 1, 2, 3].map((n) => elfSpot(v.s, n)), v.spots);
    near(v.murmel, A.side("murmel", { seed: v.s, serving: true }).st.list.map((m) => [m.x, m.y]), EPS, "murmel " + v.s);
  }
  for (const v of G.fn.kickRods) assert.deepEqual(kickRods(v.c), v.rods);
  for (const v of G.fn.flipSeg) { near(v.l, flipSeg(true, v.a), EPS, "flipSeg l"); near(v.r, flipSeg(false, v.a), EPS, "flipSeg r"); }
});
test("Golden: Stoesse (Ziegel-Schlaeger, Puck-Schlaeger, Volley-Figur) und 90 Schritte Volley-Flug", () => {
  for (const v of G.fn.ziegelDefend) near(v.r, ziegelDefend(v.b, v.p), EPS, "defend " + JSON.stringify(v.b));
  for (const v of G.fn.puckStrike) { const q = { ...v.p }; assert.equal(puckStrike(q, v.m), v.hit); near(v.out, q, EPS, "strike"); }
  for (const v of G.fn.volley) {
    const s = { ...v.b }, k = { ...v.b }, steps = [];
    for (let i = 0; i < 90; i++) steps.push(volleyStep(s, 1 / 120));
    assert.equal(steps.join(","), v.steps); near(v.after, s, 1e-6, "volley flug");
    assert.equal(volleyBump(k, v.f), v.bump); near(v.bumped, k, EPS, "bump");
  }
});
test("Golden: Granatenflug und Krater exakt, Eis-Stock-Wurf Bit fuer Bit, Murmelwurf bis auf ulp", () => {
  for (const v of G.fn.flight) assert.deepEqual(flight(island(v.s), v.sh, 1200), v.f, "flight " + v.s);
  for (const v of G.fn.crater) { const T = island(v.s); for (const [x, y] of v.hits) { assert.equal(surface(T, x) <= y + 1e9, true); crater(T, x, y, x < 500); } assert.deepEqual(T, v.T, "crater " + v.s); }
  for (const v of G.fn.disc) {
    const S = A.side(v.g, { seed: v.s, serving: true }), D = A.rulesOf(v.g), list = S.st.list.map((x) => ({ ...x }));
    D.launch(S, { list, r: S.st.r, thrown: 0 }, 0, v.g === "stock" ? 500 : 520, v.vx, v.vy);
    let n = 0; while (n < 2400 && discStep(D, list)) n++;
    // Eis-Stock: nur + - * / sqrt in beiden Fassungen -> bitgleich. Murmeln: das Startkreuz nutzt cos/sin (ulp, s. Kopf).
    assert.equal(n, v.n, v.g + " Schritte");
    if (v.g === "stock") assert.deepEqual(list.map((x) => [x.x, x.y]), v.list, v.g + " " + v.s); else near(v.list, list.map((x) => [x.x, x.y]), 1e-9, v.g + " " + v.s);
  }
});

const BALL = { puck: "p", ziegel: "b", volley: "b", kick: "b", flipper: "b", elfer: "b", panzer: "shells", snow: "balls", stock: "list", murmel: "list" };
// Horizont in Ticks, bis zu dem der Ball auf 0,5 genau wie im Altcode fliegt; Infinity = ganze Partie (gemessen, s. Kopf).
const HORIZON = { puck: 1200, kick: 3600, volley: 6000 };
function pts(v) { if (!v) return []; return (Array.isArray(v) ? v : [v]).map((b) => [Math.round(b.x * 1e4) / 1e4, Math.round(b.y * 1e4) / 1e4]); }
function run(g, seed, maxT, onSample) {
  let st = A.matchStart(A.matchInit({ g, seed, players: ["bot", "bot"] })), t = 0;
  for (; t < maxT && !A.matchStatus(st).over; t++) { st = A.matchStep(st, []).state; if (onSample && t % 60 === 59) onSample(t + 1, st); }
  const s = A.matchStatus(st);
  return { ticks: t, over: s.over, score: st.sides[0].score.slice(), draw: !!st.sides[0].draw, rejected: s.rejected };
}
for (const g of A.IDS) {
  test("Golden-Partie " + g + ": Bot gegen Bot mit gleichem Seed und gleichen Wuerfeln wie der Altcode", () => {
    for (const tr of G.traces[g]) {
      const h = HORIZON[g] || Infinity, byT = new Map(tr.tr.map((x) => [x[0], x]));
      const end = run(g, tr.seed, 120 * 180, (t, st) => {
        const x = byT.get(t); if (!x || t > h) return;
        near(x[1], pts(st.sides[0].st[BALL[g]]), 0.5, g + " " + tr.seed + " A Tick " + t);
        near(x[2], pts(st.sides[1].st[BALL[g]]), 0.5, g + " " + tr.seed + " B Tick " + t);
        assert.deepEqual(st.sides[0].score, x[3], g + " Stand Tick " + t);
      });
      if (!HORIZON[g]) assert.deepEqual(end, tr.end, g + " " + tr.seed + ": gleiches Ende");
      else assert.equal(end.rejected, 0, g + " keine Verwerfung");
    }
  });
}
// Flipper: sin/cos der Klappen in jedem Schritt; 15 von 16 Partien enden gleich (gemessen), eine laeuft nach ulp auseinander.
const SAME_ENDS = { flipper: 14 };
const median = (a) => { const b = a.slice().sort((x, y) => x - y); return (b[(b.length - 1) >> 1] + b[b.length >> 1]) / 2; };
test("Golden-Verteilung: 16 Partien je Spiel; ohne Chaos gleiche Enden, sonst gleiche Dauer (Median) und Knappheit", () => {
  for (const g of A.IDS) {
    const L0 = G.stats[g], r = Array.from({ length: L0.n }, (_, i) => run(g, "stat-" + g + "-" + i, 120 * 600));
    // Hartes Partie-Limit der neuen Engine (300 s): eine Altcode-Partie, die laenger lief, gilt mit ihrem Stand bei 300 s.
    const L = { ...L0, ends: L0.ends.map((e, i) => (e[0] > LIMIT_TICKS ? [LIMIT_TICKS, L0.at300[i]] : e)) };
    assert.ok(r.every((x) => x.rejected === 0), g + " keine Verwerfung");
    // stat-flipper-8: zwei Bots spielen im Altcode 600 s ohne Punkt; die neue Engine beendet die Partie nach 300 s.
    assert.ok(r.every((x) => x.over && x.ticks <= LIMIT_TICKS), g + " alle enden spaetestens beim Partie-Limit");
    const ends = r.map((x) => [x.ticks, x.score]), same = ends.filter((e, i) => JSON.stringify(e) === JSON.stringify(L.ends[i])).length;
    if (!HORIZON[g]) { if (SAME_ENDS[g]) assert.ok(same >= SAME_ENDS[g], g + " gleiche Enden " + same); else assert.deepEqual(ends, L.ends, g); continue; }
    const mNew = median(r.map((x) => x.ticks)), mOld = median(L.ends.map((x) => x[0]));
    const margin = r.reduce((a, x) => a + Math.abs(x.score[0] - x.score[1]), 0) / r.length;
    assert.ok(Math.abs(mNew - mOld) / mOld < 0.4, g + " Median Dauer " + (mNew / 120).toFixed(1) + " s, alt " + (mOld / 120).toFixed(1) + " s");
    assert.ok(Math.abs(margin - L.meanMargin) <= 1.0, g + " mittlerer Abstand " + margin + ", alt " + L.meanMargin);
  }
});
