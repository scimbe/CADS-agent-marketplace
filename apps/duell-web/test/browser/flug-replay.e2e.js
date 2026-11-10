"use strict";
// Golden replay across engines (A7a): Hash(seed, Spur) -> the same points and the same float64 path in Node, Chromium and
// WebKit. The page code itself (src/core.js, src/engine.js, src/spur.js) runs in the browser, through the link and back
// (btoa/atob). A Spur recorded in the browser with a frame loop of uneven frame times (taps between steps, as on a real
// phone) replays to the same score there and in Node.
// Run: PLAYWRIGHT_BROWSERS_PATH=<browsers> node --test --require ./test/e2e/lib/nolive.js test/browser/flug-replay.e2e.js
// WebKit runs when it is installed in PLAYWRIGHT_BROWSERS_PATH; otherwise its test is skipped and says so (never green).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pw = require("playwright-core");
const { record, CASES, C, E, S } = require("../fixtures/spur-golden.js");

const SRC = ["spur.js", "core.js", "engine.js"].map((f) => fs.readFileSync(path.join(__dirname, "../../src", f), "utf8"));
const cases = CASES.map((c) => {
  const st = C.sanitizeState({ v: 1, ...c.st }), r = record(st, c.frac);
  return { name: c.name, want: c.want, st: { ...st, spur: undefined }, spur: [...r.bytes], node: S.fly(E, C, st, r.bytes) };
});

// In the page: each case through the link (encodeState/decodeState with the Spur as bytes) and played back; then a run
// recorded in a frame loop with uneven frame times, taps decided once per frame (between steps).
function inPage(cases) {
  const C = window.DuellCore, E = window.DuellEngine, S = window.DuellSpur;
  const out = cases.map((c) => {
    const st = C.decodeState(C.encodeState(Object.assign({}, c.st, { ev: E.EV, spur: Uint8Array.from(c.spur) })));
    return { spur: Array.from(st.spur), fly: S.fly(E, C, st) };
  });
  let x = 7;
  const rnd = () => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return x / 4294967296; };
  const st = C.sanitizeState({ v: 1, seed: 4242, params: { gravity: 1700, jump: 430, gap: 150, speed: 120 }, k: 0.75 });
  const sim = E.createSim(st.params, C.mulberry32(st.seed), C.routeParams(st), st.k), rec = S.recorder();
  rec.put(sim.ticks, 1); sim.flap();
  let acc = 0, frames = 0;
  while (sim.state === "run" && sim.ticks < S.TMAX) {
    acc += 0.004 + rnd() * 0.03; frames++;                         // 4 to 34 ms per frame, like a busy phone
    while (acc >= E.STEP && sim.state === "run" && sim.ticks < S.TMAX) { acc -= E.STEP; sim.step(); }
    const nx = sim.pipes.find((p) => p.x + E.PIPE_W >= E.BX - E.R), mid = nx ? nx.top + nx.gap * 0.6 : E.H * 0.45;
    if (sim.state === "run" && sim.bird.y > mid && sim.bird.vy > 0) { rec.put(sim.ticks, 1); sim.flap(); }
  }
  rec.end(sim.ticks);
  const bytes = rec.bytes();
  return { out, live: { score: sim.score, ticks: sim.ticks, frames, spur: Array.from(bytes), st: Object.assign({}, st), replay: S.fly(E, C, st, bytes) } };
}

for (const name of ["chromium", "webkit"]) {
  test("Golden-Replay in " + name + ": gleiche Punkte und gleiche Bahn wie Node und wie eingefroren", async (t) => {
    let b;
    try { b = await pw[name].launch(); } catch (e) {
      // only a browser that is not installed is skipped (and says so); every other launch error fails
      if (/Executable doesn't exist/.test(String(e))) return void t.skip(name + " ist nicht installiert (PLAYWRIGHT_BROWSERS_PATH)");
      throw e;
    }
    try {
      const p = await b.newPage(), errs = [];
      p.on("pageerror", (e) => errs.push(String(e)));
      await p.setContent("<!doctype html><meta charset=utf-8><title>replay</title>");
      for (const s of SRC) await p.addScriptTag({ content: s });
      const res = await p.evaluate(inPage, cases);
      assert.deepEqual(errs, []);
      res.out.forEach((o, i) => {
        const c = cases[i];
        assert.deepEqual(o.spur, c.spur, c.name + ": Spur ueberlebt den Link in " + name);
        assert.deepEqual(o.fly, c.node, c.name + ": " + name + " = Node");
        assert.deepEqual({ score: o.fly.score, ticks: o.fly.ticks, hash: o.fly.hash, len: c.spur.length }, c.want, c.name + ": eingefroren");
      });
      const L = res.live;
      assert.ok(L.score >= 5 && L.frames > 100, "Lauf mit Bildfolge: " + L.score + " Punkte, " + L.frames + " Bilder");
      assert.deepEqual({ score: L.replay.score, ticks: L.replay.ticks }, { score: L.score, ticks: L.ticks }, "aufgenommene Spur erreicht beim Abspielen denselben Score (" + name + ")");
      const st = C.sanitizeState({ ...L.st, spur: Uint8Array.from(L.spur) });
      assert.deepEqual(S.fly(E, C, st), L.replay, "dieselbe Spur in Node: gleiche Punkte und Bahn");
      console.log(name + " " + (await b.version()) + ": " + cases.map((c, i) => c.name + " " + res.out[i].fly.score + "/" + res.out[i].fly.hash).join(", ") + "; Bildfolge-Lauf " + L.score + " Punkte, " + L.ticks + " Ticks, " + L.frames + " Bilder, Spur " + L.spur.length + " B");
    } finally { await b.close(); }
  });
}
