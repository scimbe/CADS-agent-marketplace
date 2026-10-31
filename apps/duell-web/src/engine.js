/* Duell engine: deterministic flap simulation (no DOM). Same seed + same taps at the same ticks = same run. */
(function (root) {
  "use strict";
  var W = 288, H = 512, GROUND = 56, R = 15, BX = 86, PIPE_W = 52, INTERVAL = 170, TERM = 720, MARGIN = 46;
  var STEP = 1 / 120;

  // rng: function() -> [0,1), params: sanitized {gravity,jump,gap,speed}
  function createSim(params, rng) {
    var sim = { W: W, H: H, GROUND: GROUND, R: R, BX: BX, PIPE_W: PIPE_W, STEP: STEP, params: params,
      bird: { y: H * 0.42, vy: 0, rot: 0 }, pipes: [], score: 0, state: "ready", ticks: 0 };

    function spawn(x) {
      var top = MARGIN + rng() * (H - GROUND - params.gap - MARGIN * 2);
      sim.pipes.push({ x: x, top: top, passed: false });
    }
    function collide() {
      var b = sim.bird;
      if (b.y + R > H - GROUND) return true;
      if (b.y - R < 0) { b.y = R; b.vy = 0; }
      for (var i = 0; i < sim.pipes.length; i++) {
        var p = sim.pipes[i];
        if (BX + R > p.x && BX - R < p.x + PIPE_W && (b.y - R < p.top || b.y + R > p.top + params.gap)) return true;
      }
      return false;
    }
    // returns list of events: "flap", "start"
    sim.flap = function () {
      if (sim.state === "over") return [];
      var ev = [];
      if (sim.state === "ready") { sim.state = "run"; ev.push("start"); }
      sim.bird.vy = -params.jump;
      ev.push("flap");
      return ev;
    };
    // advance by exactly STEP; returns events: "score", "dead"
    sim.step = function () {
      var ev = [];
      if (sim.state !== "run") return ev;
      var b = sim.bird, dt = STEP;
      sim.ticks++;
      b.vy = Math.min(b.vy + params.gravity * dt, TERM);
      b.y += b.vy * dt;
      b.rot = Math.max(-0.5, Math.min(1.3, b.vy / 480));
      for (var i = 0; i < sim.pipes.length; i++) {
        var p = sim.pipes[i];
        p.x -= params.speed * dt;
        if (!p.passed && p.x + PIPE_W < BX) { p.passed = true; sim.score++; ev.push("score"); }
      }
      while (sim.pipes.length && sim.pipes[0].x < -PIPE_W) sim.pipes.shift();
      var last = sim.pipes.length ? sim.pipes[sim.pipes.length - 1].x : -Infinity;
      if (W - last >= INTERVAL) spawn(W + 20);
      if (collide()) { sim.state = "over"; ev.push("dead"); }
      return ev;
    };
    spawn(W + 40);
    return sim;
  }

  var api = { createSim: createSim, W: W, H: H, GROUND: GROUND, STEP: STEP, PIPE_W: PIPE_W, R: R, BX: BX };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DuellEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
