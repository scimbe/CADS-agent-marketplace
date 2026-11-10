"use strict";
// The second game engine (src/lauf.js doc, src/lauf-engine.js physics and generator): rules of the doc, physics,
// collisions, the seed as the only source of the track, and a generator that never makes a gap the farthest jump misses.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../src/lauf.js");
const E = require("../src/lauf-engine.js");
const D = require("../src/daily.js");
const C = require("../src/core.js");

const BASE = { m: "endlos", seed: 7, w: "bruecke", p: { lu: 50, hi: 40, mu: 50, ge: 30, du: 15, fa: 20 }, fp: ["geh", "huepf", "flug"] };
// a run without anything in the way: only the ground and its gaps
const bare = (s) => { s.items = s.items.filter((it) => it.t === "g"); return s; };
const run = (s, n) => { for (let i = 0; i < n && s.state === "run"; i++) s.step(); return s; };
const fp = (s) => JSON.stringify([s.state, s.ticks, s.me, s.coins, s.stomps, s.spans, s.items.length]);

test("Doc: Grenzen, Standardwerte, nur bekannte Werte; passt in einen Link und kommt gleich zurueck", () => {
  const l = L.sanitize({ m: "x", seed: -3, w: "mond", e: "💣", p: { g: 99999, j: "a", v: 500, vm: 10, lu: 50.4 }, fp: ["kriech", "flug"], r: 1.5, extra: 1 });
  assert.equal(l.m, "endlos"); assert.equal(l.seed, 1); assert.equal(l.w, "bruecke"); assert.equal(l.e, "🏃");
  assert.equal(l.p.g, 3200); assert.equal(l.p.j, L.SPEC.j[2]); assert.ok(E.jumps(L.sanitize({ p: { g: 900, j: 1000 } }).p).top < 260, "Sprung bleibt im Bild"); assert.equal(l.p.v, 420); assert.equal(l.p.vm, 420, "Hoechsttempo nie unter dem Starttempo"); assert.equal(l.p.lu, 50);
  assert.deepEqual(l.fp, ["flug"]); assert.equal(l.r, undefined); assert.equal(l.extra, undefined);
  assert.deepEqual(L.sanitize(l), l, "stabil");
  const doc = D.sanitizeDoc({ k: "lauf", col: ["#ffd400", "#ff3b1d"], by: [], t: "Brückenlauf", l: { ...BASE, r: 1234 } });
  assert.equal(doc.l.r, 1234);
  const url = D.docUrl(doc), back = D.parseRoute(url.slice(url.indexOf("#")));
  assert.ok(url.length < 900, "kurzer Link: " + url.length);
  assert.deepEqual(back.doc, doc);
  assert.equal(D.sanitizeDoc({ k: "lauf" }).l.m, "endlos", "ein leeres Spiel ist spielbar");
});

test("Physik: Schwerkraft, kurzer Sprung niedriger als gehaltener, Tabelle = Lauf", () => {
  const p = L.sanitize({}).p, J = E.jumps(p);
  const peak = (hold) => { const s = bare(E.createSim({ p })); s.press(); s.press(); if (!hold) s.release(); let top = 0; run(s, 1); for (let i = 0; i < 400 && !s.me.on; i++) { s.step(); top = Math.max(top, E.GY - s.me.y); } return top; };
  const tap = peak(false), held = peak(true);
  assert.ok(tap > 40 && held > tap * 1.3, "halten springt hoeher: " + tap.toFixed(1) + " < " + held.toFixed(1));
  assert.ok(Math.abs(held - J.top) < 1, "gleiche Bahn wie die Sprungtabelle");
  // schwerer = niedriger
  assert.ok(E.jumps({ ...p, g: 3000 }).top < J.top);
  // the speed grows with the distance only, up to the top speed
  assert.equal(E.speedAt(p, 0), p.v); assert.equal(E.speedAt(p, 1e9), p.vm);
});

test("Kollision: Block toetet, Muenze zaehlt, von oben auf den Gegner, unter dem Balken durchducken", () => {
  const mk = (items) => { const s = bare(E.createSim({ p: { v: 200, vm: 200, a: 0 } })); s.items = items; s.press(); return s; };
  let s = run(mk([{ t: "o", x: 60, y: E.GY - 30, w: 30, h: 30 }]), 200);
  assert.equal(s.state, "over", "Block");
  s = run(mk([{ t: "c", x: 40, y: E.GY - 30, w: 20, h: 20, live: true }]), 60);
  assert.equal(s.coins, 1); assert.equal(s.state, "run");
  s = mk([{ t: "d", x: 80, y: E.GY - 420, w: 60, h: 392 }]);
  run(s, 200); assert.equal(s.state, "over", "stehend unter dem Balken");
  s = mk([{ t: "d", x: 80, y: E.GY - 420, w: 60, h: 392 }]); s.setDuck(true);
  run(s, 200); assert.equal(s.state, "run", "geduckt drunter durch"); assert.ok(s.me.x > 140);
  // a foe right below: falling onto it is a stomp, running into it the end
  s = mk([{ t: "f", k: "geh", x: 70, x0: 0, x1: 900, y: E.GY - 26, base: E.GY, w: 26, h: 26, vx: 0, vy: 0, ph: 0, live: true }]);
  s.me.y = E.GY - 120; s.me.on = false; run(s, 120);
  assert.equal(s.stomps, 1); assert.equal(s.state, "run");
  s = run(mk([{ t: "f", k: "geh", x: 70, x0: 0, x1: 900, y: E.GY - 26, base: E.GY, w: 26, h: 26, vx: 0, vy: 0, ph: 0, live: true }]), 120);
  assert.equal(s.state, "over");
  // into the side of a higher stretch
  s = E.createSim({ p: { v: 200, vm: 200, a: 0 } }); bare(s); s.spans = [{ x0: -400, x1: 100, y: E.GY }, { x0: 100, x1: 900, y: E.GY - 60 }]; s.press();
  run(s, 200); assert.equal(s.state, "over", "gegen die Kante");
});

test("Seed: gleiches Doc + gleiche Tipps = gleicher Lauf, anderer Seed = andere Strecke, kein Math.random", () => {
  const rnd = Math.random;
  Math.random = () => { throw new Error("Math.random im Spielinhalt"); };
  try {
    const play = (l) => { const s = E.createSim(l); s.press(); for (let i = 0; i < 2400 && s.state === "run"; i++) { if (i % 97 === 0) s.press(); if (i % 97 === 30) s.release(); s.step(); } return s; };
    assert.equal(fp(play(BASE)), fp(play(BASE)));
    assert.notEqual(JSON.stringify(E.createSim(BASE).spans), JSON.stringify(E.createSim({ ...BASE, seed: 8 }).spans));
  } finally { Math.random = rnd; }
});

test("Generator: jede Luecke ist mit dem weitesten Sprung schaffbar (nachgespielt), jede Stufe hoch erreichbar", () => {
  let gaps = 0, steps = 0;
  const sets = [{}, { lu: 80, lw: 100, hv: 100 }, { lu: 80, lw: 100, hv: 100, g: 3200, j: 400 }, { lu: 80, lw: 100, hv: 100, g: 900, j: 1000, v: 420, vm: 520, a: 40 }, { lu: 80, lw: 100, hv: 100, g: 1400, j: 900, v: 300, vm: 520, a: 20 }, { lu: 80, lw: 100, hv: 0, v: 100, vm: 120 }];
  for (const p of sets) for (let seed = 1; seed <= 40; seed++) {
    const l = { ...BASE, seed, p: { ...BASE.p, ...p } }, s0 = E.createSim(l), J = s0.J, all = [];
    // walk far ahead: the generator makes the track in front of the runner
    const s = E.createSim(l); s.press();
    for (let x = 0; x < 12000; x += 400) { s.me.x = x; s.me.y = -5000; s.me.vy = 0; s.step(); all.push(...s.spans); }
    const spans = [...new Map(all.map((sp) => [sp.x0, sp])).values()].sort((a, b) => a.x0 - b.x0);
    for (let i = 1; i < spans.length; i++) {
      const a = spans[i - 1], b = spans[i], gap = b.x0 - a.x1, rise = a.y - b.y;
      if (rise > 0) { assert.ok(rise <= J.top * 0.7 + 1e-6, "Stufe zu hoch: " + rise); steps++; }
      if (gap <= 0) continue;
      gaps++;
      const v = E.speedAt(s0.p, a.x1);
      assert.ok(gap <= v * J.air(rise) * E.SAFE + 1e-6, `Luecke ${gap.toFixed(1)} > ${E.SAFE} * Sprungweite (seed ${seed})`);
      // played: a held jump from some spot on the stretch (the last one for a long gap, earlier for a step up), nothing else in the way
      const lands = (from, hold) => {
        const t = bare(E.createSim(l)); t.spans = [a, b]; t.state = "run"; t.ticks = 1;
        t.me.x = from; t.me.y = a.y; t.me.on = true; t.press(); t.press();
        t.step(); for (let k = 0; k < hold; k++) t.step(); t.release();
        // the generator goes on filling the track in front: only the two stretches count here
        for (let k = 0; k < 2000 && t.state === "run" && !(t.me.on && t.me.x > b.x0); k++) { t.items.length = 0; t.spans = [a, b]; t.step(); }
        return t.state === "run" && t.me.on && t.me.y === b.y;
      };
      let ok = false;
      for (const hold of [99, 12, 4, 0]) for (let from = a.x1 + E.PW / 2 - 0.5; from > Math.max(a.x0, a.x1 - 400) && !ok; from -= 3) ok = lands(from, hold);
      assert.ok(ok, `Luecke ${gap.toFixed(1)}, Stufe ${rise.toFixed(1)} nicht schaffbar (seed ${seed}, ${JSON.stringify(p)})`);
    }
  }
  assert.ok(gaps > 300 && steps > 50, `genug geprueft: ${gaps} Luecken, ${steps} Stufen`);
});

test("Arten nur als Parameter: Endlos ueber Bruecken, Level mit Ziel (erreichbar), Ausweichen von oben", () => {
  const br = E.build({ mode: "endlos", world: "bruecke", level: "normal", has: ["hindernisse", "muenzen"], figure: "🦊" }, 5);
  assert.equal(br.m, "endlos"); assert.equal(br.w, "bruecke"); assert.ok(br.p.lu >= 45, "Bruecken haben Luecken"); assert.equal(br.e, "🦊"); assert.equal(br.p.ge, 0);
  const z = E.build({ mode: "ziel", world: "wald", level: "easy", len: 150 }, 9);
  // a level with only gaps: a held jump at each edge reaches the goal
  const s = E.createSim(z); s.press();
  for (let i = 0; i < 120 * 120 && s.state === "run"; i++) {
    const m = s.me, edge = s.spans.find((sp) => sp.x1 > m.x && sp.x1 - m.x < 14 && m.on);
    if (edge) s.press(); s.step();
  }
  assert.equal(s.state, "goal", "Ziel erreicht bei " + s.meters() + " m");
  assert.ok(s.meters() >= 150);
  const fall = E.build({ mode: "endlos", world: "nacht", has: ["von_oben"] }, 3);
  assert.ok(fall.p.fa > 0 && fall.p.hi === 0 && fall.p.lu === 0);
  assert.ok(E.createSim(fall).items.some((it) => it.t === "x"), "es faellt etwas von oben");
});

test("Ohne Engine-Code im Kern: der Kern kennt nur das Doc", () => {
  const C2 = C; assert.ok(C2);
  assert.equal(typeof L.sanitize, "function");
  assert.ok(!/createSim/.test(require("fs").readFileSync(require.resolve("../src/lauf.js"), "utf8")));
});
