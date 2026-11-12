// Engine E2 Flug: deterministische Flatter-Simulation ohne DOM, bitgenau aus alt:src/engine.js (EV 1).
// Gleicher Seed + gleiche Taps an denselben Ticks = gleicher Lauf. Im Lauf nur + - * / Math.min/max (IEEE-754 exakt,
// 08-forschung/determinismus.md Befund 1), kein Math.sin/pow/random: die alten Golden-Hashes (float64-Bits) halten.
export const EV = 1;
export const W = 288, H = 512, GROUND = 56, R = 15, BX = 86, PIPE_W = 52, INTERVAL = 170, TERM = 720, MARGIN = 46;
export const STEP = 1 / 120, TPS = 120, PER_SECTION = 5;

/**
 * params: {gravity,jump,gap,speed} (sanitizeParams), rng: function() -> [0,1) (mulberry32(seed)), route: Physik je
 * Abschnitt (routeParams) oder null; Roehre n gehoert zu Abschnitt floor(n / PER_SECTION), der letzte laeuft weiter.
 * k: Tempo als Zeitdehnung (speed*k, gravity*k*k, jump*k): dieselbe Bahn bei jedem k.
 */
export function createSim(params, rng, route, k) {
  k = k || 1;
  const tk = (p) => ({ gravity: p.gravity * k * k, jump: p.jump * k, gap: p.gap, speed: p.speed * k });
  params = tk(params); route = route && route.map(tk);
  const sim = { W, H, GROUND, R, BX, PIPE_W, STEP, params: route ? route[0] : params,
    bird: { y: H * 0.42, vy: 0, rot: 0 }, pipes: [], score: 0, state: "ready", ticks: 0, section: 0, sections: route ? route.length : 1, tap: 0 };
  let made = 0;
  const sectionOf = (n) => (route ? Math.min(route.length - 1, Math.floor(n / PER_SECTION)) : 0);
  function spawn(x) {
    const gap = route ? route[sectionOf(made)].gap : params.gap;
    const top = MARGIN + rng() * (H - GROUND - gap - MARGIN * 2);
    sim.pipes.push({ x, top, gap, passed: false });
    made++;
  }
  function collide() {
    const b = sim.bird;
    if (b.y + R > H - GROUND) return true;
    if (b.y - R < 0) { b.y = R; b.vy = 0; }
    for (const p of sim.pipes) if (BX + R > p.x && BX - R < p.x + PIPE_W && (b.y - R < p.top || b.y + R > p.top + p.gap)) return true;
    return false;
  }
  // Ereignisse "start", "flap"; der Tap wartet auf den naechsten Schritt (Tick sim.ticks, Spur)
  sim.flap = function () {
    if (sim.state === "over") return [];
    const ev = [];
    if (sim.state === "ready") { sim.state = "run"; ev.push("start"); }
    sim.tap = 1;
    ev.push("flap");
    return ev;
  };
  // genau ein STEP weiter; Ereignisse "score", "section", "dead"
  sim.step = function () {
    const ev = [];
    if (sim.state !== "run") return ev;
    const b = sim.bird, dt = STEP, pr = sim.params;
    sim.ticks++;
    if (sim.tap) { sim.tap = 0; b.vy = -pr.jump; }
    b.vy = Math.min(b.vy + pr.gravity * dt, TERM * k);
    b.y += b.vy * dt;
    b.rot = Math.max(-0.5, Math.min(1.3, b.vy / k / 480));
    for (const p of sim.pipes) {
      p.x -= pr.speed * dt;
      if (!p.passed && p.x + PIPE_W < BX) {
        p.passed = true; sim.score++; ev.push("score");
        if (route && sectionOf(sim.score) !== sim.section) { sim.section = sectionOf(sim.score); sim.params = route[sim.section]; ev.push("section"); }
      }
    }
    while (sim.pipes.length && sim.pipes[0].x < -PIPE_W) sim.pipes.shift();
    const last = sim.pipes.length ? sim.pipes[sim.pipes.length - 1].x : -Infinity;
    if (W - last >= INTERVAL) spawn(W + 20);
    if (collide()) { sim.state = "over"; ev.push("dead"); }
    return ev;
  };
  spawn(W + 40);
  return sim;
}

/** Die naechste Roehre vor dem Vogel (fuer Bots und die Anzeige). */
export function nextPipe(sim, strict) {
  for (const p of sim.pipes) if (strict ? p.x + PIPE_W > BX - R : p.x + PIPE_W >= BX - R) return p;
  return null;
}
/** Demo-Bot aus alt:src/game.js bot(): tippt, wenn der Vogel unter die Linie frac der Luecke faellt. */
export function demoWants(sim, frac = 0.62) {
  const nx = nextPipe(sim, false), mid = nx ? nx.top + nx.gap * frac : H * 0.45;
  return sim.bird.y > mid && sim.bird.vy > 0;
}
