/* Ballduell live: pure rules (no DOM, no network). Every phone sees its own paddle at the bottom and keeps the ball in
   its own frame; messages are mirrored on the way out. Whoever the ball flies towards decides about hit or miss with
   their own paddle, which has no delay, so nobody loses a point to the network. Serves come from the shared seed. */
(function (root) {
  "use strict";
  var W = 1000, H = 1600, R = 18, PW = 220, PY = H - 90, TOP = 90, WIN = 5;
  var V0 = 620, VMAX = 1150, SPEEDUP = 1.05, SPIN = 3.2, PMAX = 2600;   // units per second; PMAX caps paddle travel

  function hash32(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mirror(b) { return { x: W - b.x, y: H - b.y, vx: -b.vx, vy: -b.vy }; }
  // Serve number n: from the middle, at an angle fixed by the seed, away from the player who serves (towards the top).
  function serve(seed, n) {
    var a = (hash32(seed + "|serve|" + n) % 61 - 30) * Math.PI / 180;     // -30..30 degrees
    return { x: W / 2, y: H / 2, vx: Math.sin(a) * V0, vy: -Math.cos(a) * V0 };
  }
  function step(b, dt) {
    var n = { x: b.x + b.vx * dt, y: b.y + b.vy * dt, vx: b.vx, vy: b.vy };
    if (n.x < R) { n.x = 2 * R - n.x; n.vx = Math.abs(n.vx); }
    if (n.x > W - R) { n.x = 2 * (W - R) - n.x; n.vx = -Math.abs(n.vx); }
    return n;
  }
  function clampSpeed(b) {
    var s = Math.hypot(b.vx, b.vy); if (s <= VMAX) return b;
    return { x: b.x, y: b.y, vx: b.vx * VMAX / s, vy: b.vy * VMAX / s };
  }
  // Only for the defender (ball moving down in its own frame): null while the ball is still on its way.
  function defend(b, paddleX) {
    if (b.vy <= 0 || b.y < PY - R) return null;
    var off = b.x - paddleX;
    if (Math.abs(off) > PW / 2 + R) return { hit: false };
    var out = clampSpeed({ x: b.x, y: PY - R, vx: b.vx + off * SPIN, vy: -Math.abs(b.vy) * SPEEDUP });
    if (Math.abs(out.vy) < V0 * 0.6) out.vy = -V0 * 0.6;               // never a ball that crawls sideways forever
    return { hit: true, ball: out };
  }
  // The other phone's paddle may only move as fast as a finger can: a jump is held to the reachable distance.
  function plausiblePaddle(prevX, nextX, dt) {
    var max = PMAX * Math.max(dt, 0.016), d = nextX - prevX;
    var x = Math.abs(d) > max ? prevX + Math.sign(d) * max : nextX;
    return Math.min(W - PW / 2, Math.max(PW / 2, x));
  }
  function over(score) { return score[0] >= WIN || score[1] >= WIN; }
  // Three emoji both phones show, so both players can check they are really playing each other.
  var EMO = ["🦊", "🐢", "🍕", "🚀", "🌵", "🎸", "🐙", "🍩", "⚽", "🦄", "🌈", "🐝", "🍉", "🎈", "🐳", "🥨"];
  function badge(channelHex) { var h = hash32("badge|" + channelHex); return [0, 1, 2].map(function (i) { return EMO[(h >>> (i * 5)) % EMO.length]; }).join(" "); }

  var api = { W: W, H: H, R: R, PW: PW, PY: PY, TOP: TOP, WIN: WIN, V0: V0, VMAX: VMAX, mirror: mirror, serve: serve, step: step, defend: defend, plausiblePaddle: plausiblePaddle, over: over, badge: badge, hash32: hash32 };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Ballduell = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
