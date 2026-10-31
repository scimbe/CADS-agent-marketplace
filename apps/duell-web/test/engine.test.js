"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core.js");
const E = require("../src/engine.js");

// Simple bot: flap when the bird falls below the middle of the next gap.
function play(st, maxTicks) {
  const sim = E.createSim(st.params, C.mulberry32(st.seed));
  const tops = [];
  sim.flap();
  for (let t = 0; t < maxTicks && sim.state !== "over"; t++) {
    const next = sim.pipes.find((p) => p.x + sim.PIPE_W >= sim.BX - sim.R);
    if (next && !tops.includes(next.top)) tops.push(next.top);
    if (next && sim.bird.y > next.top + st.params.gap * 0.62 && sim.bird.vy > 0) sim.flap();
    sim.step();
  }
  return { score: sim.score, ticks: sim.ticks, tops };
}

test("Engine: gleiche Vorgabe + gleiche Eingaben = identischer Lauf (Challenge-Fairness)", () => {
  const st = C.dailyConfig(new Date("2026-11-01T00:00:00Z"));
  const a = play(st, 6000), b = play(st, 6000);
  assert.deepEqual(a, b);
  assert.ok(a.score >= 3, "Bot sollte Punkte holen, hat " + a.score);
});
test("Engine: anderer Seed = andere Strecke", () => {
  const st = C.dailyConfig(new Date("2026-11-01T00:00:00Z"));
  const a = play(st, 3000), b = play({ ...st, seed: st.seed + 1 }, 3000);
  assert.notDeepEqual(a.tops, b.tops);
});
test("Engine: Untaetigkeit endet am Boden, Score bleibt 0", () => {
  const st = C.presetState(C.PRESETS[0], "de");
  const sim = E.createSim(st.params, C.mulberry32(st.seed));
  sim.flap();
  let dead = false;
  for (let i = 0; i < 2000 && !dead; i++) dead = sim.step().includes("dead");
  assert.ok(dead);
  assert.equal(sim.score, 0);
  assert.deepEqual(sim.flap(), []); // nach Game Over kein Flattern mehr
});
test("Engine: exportiert alle Masse, die die Darstellung braucht", () => {
  for (const k of ["W", "H", "GROUND", "STEP", "PIPE_W", "R", "BX"]) assert.equal(typeof E[k], "number", k);
});
