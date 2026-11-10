"use strict";
// Golden replay (A7a): fixed states, a bot records its flight as a Spur, the Spur is played back. Shared by
// test/spur.test.js (Node) and test/browser/flug-replay.e2e.js (Chromium, WebKit): the same seed and the same Spur
// must give the same points and the same float64 path (hash) everywhere.
const C = require("../../src/core.js");
const E = require("../../src/engine.js");
const S = require("../../src/spur.js");

// Bot as in game.js (demo): tap when the bird falls below the gap's line frac. It records each tap at sim.ticks, the
// tick the engine applies it (the tap buffer), exactly as the game will.
function record(st, frac) {
  const sim = E.createSim(st.params, C.mulberry32(st.seed), C.routeParams(st), st.k), r = S.recorder();
  r.put(sim.ticks, 1); sim.flap();
  while (sim.state === "run" && sim.ticks < S.TMAX) {
    const nx = sim.pipes.find((p) => p.x + E.PIPE_W >= E.BX - E.R), mid = nx ? nx.top + nx.gap * frac : E.H * 0.45;
    if (sim.bird.y > mid && sim.bird.vy > 0) { r.put(sim.ticks, 1); sim.flap(); }
    sim.step();
  }
  r.end(sim.ticks);
  return { bytes: r.bytes(), score: sim.score, ticks: sim.ticks };
}
const preset = (id) => C.presetState(C.PRESETS.find((p) => p.id === id), "de");
const route = C.sanitizeRoute([{ p: "ruhig", d: { gap: 30 }, t: "day", e: "🪁" }, { p: "schnell", d: { speed: 40 }, t: "night", e: "🦇" }, { p: "schwer", d: { gravity: 300 }, t: "lava", e: "🐉" }]);
// k: tempo; the frozen values come from the first run of this table (Node 26, 10 Nov 2026) and must never move.
const CASES = [
  { name: "chill k=1", st: { ...preset("chill") }, frac: 0.62, want: { score: 49, ticks: 10800, hash: 2232349165, len: 294 } },
  { name: "night k=0.5", st: { ...preset("night"), k: 0.5 }, frac: 0.62, want: { score: 30, ticks: 10800, hash: 875921006, len: 190 } },
  { name: "candy k=0.75", st: { ...preset("candy"), k: 0.75 }, frac: 0.5, want: { score: 40, ticks: 10800, hash: 1621876440, len: 222 } },
  { name: "rocket k=1 (stirbt)", st: { ...preset("rocket") }, frac: 0.62, want: { score: 17, ticks: 2383, hash: 2868072102, len: 61 } },
  { name: "Route k=0.5", st: { ...preset("ocean"), route, k: 0.5 }, frac: 0.62, want: { score: 29, ticks: 10800, hash: 3663449772, len: 165 } }
];
module.exports = { record, CASES, C, E, S };
