"use strict";
// Golden replay of the runner (src/lauf-engine.js): a fixed doc plus a fixed list of inputs at fixed ticks gives one
// sequence of states. Used by test/lauf-engine.test.js (Node) and test/e2e/lauf-replay.e2e.js (Chromium, WebKit/JSC):
// the function below is plain ES5 without closures over this file, so its source can be sent into a page as it is.
// inputs: [[tick, code], ...] sorted by tick; code "p" press, "r" release, "d" duck on, "u" duck off. Before tick 0 the
// runner is started with one press (as the game screen does). The text has one line per tick: tick, state, runner,
// coins, stomps, held, ducked and every live foe's place; numbers as JavaScript prints them (shortest round trip).
function replay(E, l, inputs, max) {
  var s = E.createSim(l), out = [], k = 0, i, it, row;
  s.press();
  for (var t = 0; t < max && s.state === "run"; t++) {
    while (k < inputs.length && inputs[k][0] === t) {
      var c = inputs[k][1];
      if (c === "p") s.press(); else if (c === "r") s.release(); else if (c === "d") s.setDuck(true); else if (c === "u") s.setDuck(false);
      k++;
    }
    var ev = s.step();
    row = [s.ticks, s.state, s.me.x, s.me.y, s.me.vy, s.me.on ? 1 : 0, s.coins, s.stomps, s.held ? 1 : 0, s.duck ? 1 : 0, ev.join("+")];
    for (i = 0; i < s.items.length; i++) { it = s.items[i]; if (it.t === "f" && it.live) row.push(it.k, it.x, it.y); }
    out.push(row.join(","));
  }
  return { text: out.join("\n"), ticks: s.ticks, state: s.state, points: s.points(), meters: s.meters() };
}

// ev 0 (old links) flies on Math.sin, which differs in the last bits between engines and even between V8 versions
// (Node 26 vs Chromium 141, seen in test/e2e/lauf-replay.e2e.js). Its replay is compared with every number to 6 places.
function rounded(text) { return text.replace(/-?\d+\.\d+(e-?\d+)?|-?\d+e-\d+/g, function (n) { var f = (+n).toFixed(6); return f === "-0.000000" ? "0.000000" : f; }); }

// The docs: the old link's doc (test/golden-links.json, no ev: version 0, the old flying path) and a new one (ev 1)
// with every kind of hazard, flying foes among them.
const OLD = { m: "endlos", seed: 12345, w: "bruecke", e: "🦊", o: "📦", c: "🪙", f: "🐌", fp: ["geh", "flug"], p: { g: 2000, j: 700, v: 200, a: 9, vm: 360, lu: 45, lw: 75, hi: 40, du: 0, mu: 60, ge: 30, fa: 0, hv: 35, len: 700 }, r: 321 };
const NEW = { ev: 1, m: "endlos", seed: 4242, w: "nacht", e: "🐸", o: "🧱", c: "⭐", f: "🦇", fp: ["geh", "huepf", "flug"], p: { g: 2000, j: 700, v: 200, a: 9, vm: 360, lu: 45, lw: 75, hi: 40, du: 20, mu: 60, ge: 40, fa: 20, hv: 35, len: 700 } };
// the fixed input list: a press every 0.75 s held for a quarter second, a duck now and then
const INPUTS = [];
for (let t = 20; t < 3000; t += 90) { INPUTS.push([t, "p"], [t + 30, "r"]); if (t % 450 === 200) INPUTS.push([t + 45, "d"], [t + 70, "u"]); }
INPUTS.sort((a, b) => a[0] - b[0]);
const MAX = 3000;

module.exports = { replay, rounded, OLD, NEW, INPUTS, MAX };
