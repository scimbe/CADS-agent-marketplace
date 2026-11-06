/* Arcade duels: pure rules plus the game engine of one phone (no DOM, no network), after the Ballduell pattern. Every
   phone keeps the action in its own frame (itself at the bottom or on the left) and mirrors what it sends. Whoever's
   half the puck, ball or shell is in decides about it with its own, undelayed mallet, paddle or figure, so nobody
   loses a point to the network; serves, wind and the island come from the shared seed. A side only talks through
   send() and receive(), so the bot is simply a second side in the same page, and tests can pipe two sides together. */
(function (root) {
  "use strict";
  var W = 1000, H = 1600, STEP = 1 / 120, NET_P = 0.05, NET_ST = 0.1, SERVE_PAUSE = 0.9, STALL_MAX = 6;

  function hash32(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function unit(seed, key) { return hash32(seed + "|" + key) / 4294967296; }               // 0..1, fixed by the seed
  function rng(seed) {                                                                      // the bot's dice: also only the seed
    var a = hash32(String(seed));
    return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v) { return typeof v === "number" && isFinite(v); }
  function body(b) { return !!b && num(b.x) && num(b.y) && num(b.vx) && num(b.vy) && Math.abs(b.x) < 5 * W && Math.abs(b.y) < 5 * H; }
  function copy(b) { return { x: b.x, y: b.y, vx: b.vx, vy: b.vy }; }
  function mirror(b) { return { x: W - b.x, y: H - b.y, vx: -b.vx, vy: -b.vy }; }   // top view: the other phone looks from the far end
  function mirrorX(b) { return { x: W - b.x, y: b.y, vx: -b.vx, vy: b.vy }; }       // side view: the other phone stands on the right
  function speed(b) { return Math.hypot(b.vx, b.vy); }
  function cap(b, max) { var s = speed(b); if (s > max) { b.vx *= max / s; b.vy *= max / s; } return b; }
  // Anything the other phone moves by finger may only travel as far as a finger can in the time since its last report.
  function reach(prev, next, dt, vmax) { var max = vmax * Math.max(dt, 0.016), d = next - prev; return Math.abs(d) > max ? prev + Math.sign(d) * max : next; }

  // What every side shares: score, serves, the clock, events for the screen, and the regular position report.
  function base(G, o) {
    var S = { g: G.id, WIN: G.WIN, seed: String(o.seed), score: [0, 0], over: false, started: false, n: 0, t: 0, ev: [], serveAt: 0, oppAt: 0, sentP: 0, sentSt: 0, rejected: 0 };
    // Position reports and shots carry the sender's clock (ms), so the other screen can place them in time despite
    // jitter. o.clock (seconds) is a real clock on the phone, which keeps running when a frame hangs; tests pass their own.
    S.clock = o.clock || function () { return S.t; };
    S.send = function (m) { if (m.t === "p" || m.t === "shot" || m.t === "throw") m.ms = Math.round(S.clock() * 1000); if (o.send) o.send(m); };
    S.fx = function (k, x, y, more) { var e = { k: k, x: x, y: y }; if (more) for (var q in more) e[q] = more[q]; S.ev.push(e); if (S.ev.length > 80) S.ev.shift(); };
    S.check = function () { if (S.score[0] >= G.WIN || S.score[1] >= G.WIN) { S.over = true; S.serveAt = 0; S.fx(S.score[0] > S.score[1] ? "won" : "lost", W / 2, H / 2); } };
    // This phone let the point go: the other one scores, and the one who lost the point serves the next ball.
    S.concede = function (x, y) { S.score[1]++; S.send({ t: "pt" }); S.fx("lose", x, y); S.check(); if (!S.over && G.serves) S.serveAt = S.t + SERVE_PAUSE; };
    S.gain = function () { S.score[0]++; S.fx("score", W / 2, H / 4); S.check(); };
    S.start = function () { S.started = true; if (o.serving && G.serves) S.serveAt = S.t + 0.01; };
    // How much finger time the other player's next move may use. Time saved up while no report came (up to half a
    // second) covers a burst of reports that arrive together after the network stalled; each report uses up what its
    // distance needs, so on average the figure is still never faster than a finger.
    S.oppDt = function (dist, vmax) {
      S.credit = Math.min(0.5, (S.credit == null ? 0.1 : S.credit) + S.t - S.oppAt); S.oppAt = S.t;
      var use = Math.min(S.credit, Math.max(0.016, dist / vmax)); S.credit -= use; return use;
    };
    // Something the other phone claims that cannot be: ignored, and counted so the screen can say so.
    S.reject = function () { S.rejected++; return false; };
    // A stall as this phone saw it: the gap between two arrivals on its own clock (the sender's clock could be faked).
    // For the burst that follows it (half a second), what the other one did during the gap may arrive at once.
    S.lastIn = null; S.burst = { len: 0, at: -1 };
    S.heard = function () {
      var now = S.clock();
      if (S.lastIn !== null && now - S.lastIn > 0.3) S.burst = { len: Math.min(now - S.lastIn, STALL_MAX), at: now };
      S.lastIn = now;
    };
    S.stall = function () { return S.clock() - S.burst.at < 0.5 ? S.burst.len : 0; };
    return S;
  }
  function loop(S, dt, sub) {
    if (S.over) return;
    dt = Math.min(dt, 0.25);
    while (dt > 1e-9) { var d = Math.min(STEP, dt); dt -= d; S.t += d; sub(d); if (S.over) break; }
  }
  function report(S, sendP, sendSt) {
    if (S.t - S.sentP >= NET_P) { S.sentP = S.t; sendP(); }
    if (sendSt && S.t - S.sentSt >= NET_ST) { S.sentSt = S.t; sendSt(); }
  }

  // ======================= Puck-Duell: top view, mallet anywhere in the own half, goals at both ends =======================
  var PUCK = { id: "puck", WIN: 5, serves: true, PR: 34, MR: 72, GOAL: 400, VMAX: 2400, MMAX: 3200, FRIC: 0.3, E: 0.92, HOLD: 6 };
  function puckServe(seed, n) {
    var u = unit(seed, "puck|serve|" + n), v = unit(seed, "puck|drift|" + n);
    return { x: W / 2 + (u - 0.5) * 320, y: H * 0.66, vx: (v - 0.5) * 160, vy: 30 };   // at rest in front of the one who serves
  }
  function puckMouth(x) { return Math.abs(x - W / 2) < PUCK.GOAL / 2 - PUCK.PR * 0.4; }
  function puckWalls(p, dt) {
    var R = PUCK.PR, E = PUCK.E, f = Math.exp(-PUCK.FRIC * dt);
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= f; p.vy *= f;
    var wall = false;
    if (p.x < R) { p.x = 2 * R - p.x; p.vx = Math.abs(p.vx) * E; wall = true; }
    if (p.x > W - R) { p.x = 2 * (W - R) - p.x; p.vx = -Math.abs(p.vx) * E; wall = true; }
    if (!puckMouth(p.x)) {   // outside the goal mouth the end wall throws the puck back
      if (p.y > H - R && p.y < H + R) { p.y = 2 * (H - R) - p.y; p.vy = -Math.abs(p.vy) * E; wall = true; }
      if (p.y < R && p.y > -R) { p.y = 2 * R - p.y; p.vy = Math.abs(p.vy) * E; wall = true; }
    }
    return wall;
  }
  // Mallet m (with its own speed) against puck p: the puck is pushed out and bounces off the moving mallet.
  function puckStrike(p, m) {
    var dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy), min = PUCK.PR + PUCK.MR;
    if (d >= min) return false;
    var nx = d ? dx / d : 0, ny = d ? dy / d : -1;
    p.x = m.x + nx * min; p.y = m.y + ny * min;
    var rv = (p.vx - m.vx) * nx + (p.vy - m.vy) * ny;
    if (rv < 0) { p.vx -= (1 + PUCK.E) * rv * nx; p.vy -= (1 + PUCK.E) * rv * ny; }
    cap(p, PUCK.VMAX);
    p.x = clamp(p.x, PUCK.PR, W - PUCK.PR); if (!puckMouth(p.x)) p.y = Math.min(p.y, H - PUCK.PR);
    return true;
  }
  function puckClampMallet(x, y, mine) {   // the own half in the own frame; mine=false: the other half
    var R = PUCK.MR, lo = mine ? H / 2 + R : R, hi = mine ? H - R : H / 2 - R;
    return { x: clamp(x, R, W - R), y: clamp(y, lo, hi) };
  }
  function plausibleMallet(prev, next, dt) {
    var c = puckClampMallet(next.x, next.y, false);
    return { x: reach(prev.x, c.x, dt, PUCK.MMAX * 1.25), y: reach(prev.y, c.y, dt, PUCK.MMAX * 1.25) };
  }
  // A puck state sent by the other phone must lie in its half, near where its mallet can be, and not be too fast.
  function plausiblePuck(kind, b, opp) {
    if (!body(b) || speed(b) > PUCK.VMAX * 1.01) return false;
    if (kind === "pass") return Math.abs(b.y - H / 2) <= 90 && b.vy > 0;
    if (b.y > H / 2 + PUCK.PR) return false;
    return kind !== "hit" || Math.hypot(b.x - opp.x, b.y - opp.y) <= PUCK.PR + PUCK.MR + 320;
  }
  function same(a, b) { return body(a) && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.vx - b.vx) < 0.5 && Math.abs(a.vy - b.vy) < 0.5; }
  function puckSide(o) {
    var S = base(PUCK, o), aim = { x: W / 2, y: H - 200 }, hitAt = -1, since = 0;
    S.st = { p: null, own: false, held: false, me: { x: W / 2, y: H - 200, vx: 0, vy: 0 }, opp: { x: W / 2, y: 200 } };
    S.input = function (i) { if (i && num(i.x) && num(i.y)) aim = puckClampMallet(i.x, i.y, true); };
    function serve() { var st = S.st; st.p = puckServe(S.seed, S.n); st.own = true; st.held = false; since = S.t; S.send({ t: "serve", n: S.n, b: mirror(st.p) }); S.n++; S.serveAt = 0; S.fx("serve", st.p.x, st.p.y); }
    // Holding the puck in the own half for too long (pinned in a corner, say) hands it over: to the seed's serve spot over there.
    function give() { var st = S.st; st.p = mirror(puckServe(S.seed, S.n)); st.own = false; st.held = false; S.send({ t: "give", n: S.n }); S.n++; S.fx("give", st.p.x, st.p.y); }
    S.tick = function (dt) {
      var st = S.st;
      loop(S, dt, function (d) {
        var m = st.me, nx = reach(m.x, aim.x, d, PUCK.MMAX), ny = reach(m.y, aim.y, d, PUCK.MMAX);
        m.vx = (nx - m.x) / d; m.vy = (ny - m.y) / d; m.x = nx; m.y = ny;
        if (S.serveAt && S.t >= S.serveAt) serve();
        var p = st.p; if (!p) return;
        if (st.own) {
          if (puckWalls(p, d)) S.fx("wall", p.x, p.y);
          if (puckStrike(p, m) && S.t - hitAt > 0.08) { hitAt = S.t; S.send({ t: "hit", b: mirror(p) }); S.fx("hit", p.x, p.y, { v: speed(p) }); }
          if (p.y > H + PUCK.PR) { st.p = null; S.concede(p.x, H); return; }
          if (p.y < H / 2 && p.vy < 0) { st.own = false; S.send({ t: "pass", b: mirror(p) }); }
          else if (S.t - since > PUCK.HOLD) give();
        } else if (!st.held) {
          puckWalls(p, d);
          if (p.y >= H / 2 && p.vy > 0) { p.y = H / 2; st.held = true; }   // the other phone hands it over; wait for it
        }
      });
      report(S, function () { S.send({ t: "p", x: Math.round(W - st.me.x), y: Math.round(H - st.me.y) }); }, st.own && st.p ? function () { S.send({ t: "st", b: mirror(st.p) }); } : null);
    };
    S.receive = function (m) {
      var st = S.st; if (!m || S.over) return;
      if (m.t === "p" && num(m.x) && num(m.y)) { st.opp = plausibleMallet(st.opp, m, S.oppDt(Math.max(Math.abs(m.x - st.opp.x), Math.abs(m.y - st.opp.y)), PUCK.MMAX * 1.25)); return; }
      if (m.t === "pt") { st.p = null; st.own = false; S.gain(); return; }
      // Serves and hand-overs lie where the seed says: anything else is not believed.
      if (m.t === "serve" && num(m.n)) { if (!same(m.b, mirror(puckServe(S.seed, m.n)))) return S.reject(); st.p = copy(m.b); st.own = false; st.held = false; S.n = m.n + 1; return; }
      if (m.t === "give" && num(m.n)) { if (st.own) return; st.p = puckServe(S.seed, m.n); st.own = true; st.held = false; since = S.t; S.n = m.n + 1; S.fx("serve", st.p.x, st.p.y); return; }
      if (m.t === "hit" || m.t === "st" || m.t === "pass") {
        if (st.own) return;                                   // it is already here: this side decides now
        if (!plausiblePuck(m.t, m.b, st.opp)) return S.reject();
        st.p = copy(m.b); st.held = false;
        if (m.t === "pass") { st.own = true; since = S.t; } else if (m.t === "hit") S.fx("ohit", st.p.x, st.p.y, { v: speed(st.p) });
      }
    };
    return S;
  }
  function puckBot(S, r) {
    var wait = 0, goal = { x: W / 2, y: H - 170 }, BOTV = 950, err = 0;
    return function (dt) {
      wait -= dt; if (wait > 0) return; wait = 0.12 + r() * 0.06;   // a bot looks and moves in short beats, like a hand
      var st = S.st, p = st.p, m = st.me, want;
      if (!p || !st.own) want = { x: W / 2 + ((p ? p.x : W / 2) - W / 2) * 0.45, y: H - 190 };
      else if (p.vy > 250 && p.y < m.y) { if (!err) err = (r() - 0.5) * (80 + speed(p) * 0.16); want = { x: p.x + p.vx * 0.1 + err, y: Math.max(p.y + 110, H - 230) }; }   // a shot comes: block it, roughly
      else {
        var tx = W / 2 + (r() - 0.5) * 300, ty = -200, dx = p.x - tx, dy = p.y - ty, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        var behind = { x: p.x + ux * (PUCK.PR + PUCK.MR + 25), y: p.y + uy * (PUCK.PR + PUCK.MR + 25) };
        want = Math.hypot(m.x - behind.x, m.y - behind.y) < 60 ? { x: p.x - ux * 80, y: p.y - uy * 80 } : behind;
        if (p.y > H - 140 || p.x < 110 || p.x > W - 110) want = { x: p.x + (W / 2 - p.x) * 0.5, y: p.y + (H * 0.7 - p.y) * 0.5 };   // dig it out of the corner towards the middle
      }
      if (!p || p.vy <= 250) err = 0;
      var step = BOTV * 0.15, dx2 = want.x - goal.x, dy2 = want.y - goal.y, dd = Math.hypot(dx2, dy2);
      if (dd > step) { want = { x: goal.x + dx2 / dd * step, y: goal.y + dy2 / dd * step }; }
      goal = want; S.input(want);
    };
  }

  // ======================= Ziegel-Duell: paddle up front, a wall of bricks behind it as the last line =======================
  var ZIEGEL = { id: "ziegel", WIN: 5, serves: true, R: 18, PW: 200, PY: H - 210, WY: H - 110, BH: 46, NB: 7, V0: 640, VMAX: 1250, UP: 1.045, SPIN: 3.0, PMAX: 2600 };
  function ziegelServe(seed, n) {
    var a = (hash32(seed + "|ziegel|serve|" + n) % 61 - 30) * Math.PI / 180;   // -30..30 degrees, away from the server
    return { x: W / 2, y: H / 2, vx: Math.sin(a) * ZIEGEL.V0, vy: -Math.cos(a) * ZIEGEL.V0 };
  }
  function ziegelWalls(b, dt) {
    var R = ZIEGEL.R; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < R) { b.x = 2 * R - b.x; b.vx = Math.abs(b.vx); return true; }
    if (b.x > W - R) { b.x = 2 * (W - R) - b.x; b.vx = -Math.abs(b.vx); return true; }
    return false;
  }
  function brickAt(x) { return clamp(Math.floor(x / (W / ZIEGEL.NB)), 0, ZIEGEL.NB - 1); }
  // The defender's paddle at its line: null while the ball is on its way, otherwise hit (with the ball sent back) or miss.
  function ziegelDefend(b, paddleX) {
    var Z = ZIEGEL; if (b.vy <= 0 || b.y < Z.PY - Z.R) return null;
    var off = b.x - paddleX;
    if (Math.abs(off) > Z.PW / 2 + Z.R) return { hit: false };
    var out = cap({ x: b.x, y: Z.PY - Z.R, vx: b.vx + off * Z.SPIN, vy: -Math.abs(b.vy) * Z.UP }, Z.VMAX);
    if (Math.abs(out.vy) < Z.V0 * 0.6) {   // never a ball that crawls sideways forever, and never faster than VMAX
      out.vy = -Z.V0 * 0.6; var side = Math.sqrt(Z.VMAX * Z.VMAX - out.vy * out.vy);
      if (Math.abs(out.vx) > side) out.vx = Math.sign(out.vx) * side;
    }
    return { hit: true, ball: out };
  }
  function plausiblePaddle(prev, next, dt) { return clamp(reach(prev, next, dt, ZIEGEL.PMAX * 1.25), ZIEGEL.PW / 2, W - ZIEGEL.PW / 2); }
  function plausibleZiegel(kind, b, opp, k, theirs) {
    var Z = ZIEGEL; if (!body(b) || speed(b) > Z.VMAX * 1.01 || b.vy <= 0) return false;
    if (kind === "hit") return Math.abs(b.y - (H - Z.PY + Z.R)) <= 40 && Math.abs(b.x - opp) <= Z.PW / 2 + Z.R + 200;
    return num(k) && k === (k | 0) && k >= 0 && k < Z.NB && theirs[Z.NB - 1 - k] === 1 && Math.abs(b.y - (H - Z.WY + Z.BH / 2 + Z.R)) <= 40;
  }
  function ziegelSide(o) {
    var Z = ZIEGEL, S = base(Z, o), aim = W / 2, wallsY = Z.WY - Z.BH / 2 - Z.R;
    S.st = { b: null, held: false, past: false, me: W / 2, opp: W / 2, mine: [], theirs: [] };
    for (var i = 0; i < Z.NB; i++) { S.st.mine.push(1); S.st.theirs.push(1); }
    S.input = function (i) { if (i && num(i.x)) aim = clamp(i.x, Z.PW / 2, W - Z.PW / 2); };
    function serve() { var st = S.st; st.b = ziegelServe(S.seed, S.n); st.held = false; st.past = false; S.send({ t: "serve", n: S.n, b: mirror(st.b) }); S.n++; S.serveAt = 0; S.fx("serve", W / 2, H / 2); }
    S.tick = function (dt) {
      var st = S.st;
      loop(S, dt, function (d) {
        st.me = reach(st.me, aim, d, Z.PMAX);
        if (S.serveAt && S.t >= S.serveAt) serve();
        var b = st.b; if (!b || st.held) return;
        if (ziegelWalls(b, d)) S.fx("wall", b.x, b.y);
        if (b.vy > 0) {
          if (!st.past) {
            var r = ziegelDefend(b, st.me);
            if (r && r.hit) { st.b = r.ball; S.send({ t: "hit", b: mirror(st.b) }); S.fx("hit", st.b.x, st.b.y, { v: speed(st.b) }); }
            else if (r) st.past = true;
          }
          if (st.past && b.y >= wallsY && b.y < wallsY + Z.BH) {
            var k = brickAt(b.x);
            if (st.mine[k]) { st.mine[k] = 0; b.y = wallsY; b.vy = -Math.abs(b.vy); st.past = false; S.send({ t: "brk", k: k, b: mirror(b) }); S.fx("brick", b.x, Z.WY, { i: k, mine: true }); }
          }
          if (b.y > H + Z.R) { st.b = null; st.past = false; S.concede(b.x, H); }
        } else if (b.y <= H - Z.PY + Z.R) { b.y = H - Z.PY + Z.R; st.held = true; }   // the other phone decides; wait for it
      });
      report(S, function () { S.send({ t: "p", x: Math.round(W - st.me) }); });
    };
    S.receive = function (m) {
      var st = S.st; if (!m || S.over) return;
      if (m.t === "p" && num(m.x)) { st.opp = plausiblePaddle(st.opp, m.x, S.oppDt(Math.abs(m.x - st.opp), Z.PMAX * 1.25)); return; }
      if (m.t === "pt") { st.b = null; S.gain(); return; }
      if (m.t === "serve" && num(m.n)) { if (!same(m.b, mirror(ziegelServe(S.seed, m.n)))) return S.reject(); st.b = copy(m.b); st.held = false; st.past = false; S.n = m.n + 1; return; }
      if (m.t === "hit" || m.t === "brk") {
        if (st.b && st.b.vy > 0 && !st.held) return;            // the ball is already on its way here: this side decides
        if (!plausibleZiegel(m.t, m.b, st.opp, m.k, st.theirs)) return S.reject();
        st.b = copy(m.b); st.held = false; st.past = false;
        if (m.t === "brk") { st.theirs[Z.NB - 1 - m.k] = 0; S.fx("brick", st.b.x, H - Z.WY, { i: Z.NB - 1 - m.k, mine: false }); }
        else S.fx("ohit", st.b.x, st.b.y, { v: speed(st.b) });
      }
    };
    return S;
  }
  function ziegelBot(S, r) {
    var wait = 0, want = W / 2, at = W / 2, miss = 0, BOTV = 1000;
    return function (dt) {
      wait -= dt; if (wait > 0) return; wait = 0.09 + r() * 0.04;
      var b = S.st.b;
      if (!b || b.vy <= 0) { want = W / 2 + (want - W / 2) * 0.6; miss = (r() - 0.5) * 2; }
      else {
        // Where the ball crosses the paddle line, folded at the side walls; the faster the ball, the rougher the guess.
        var tt = (ZIEGEL.PY - b.y) / b.vy, x = b.x + b.vx * tt, span = W - 2 * ZIEGEL.R;
        x = ((x - ZIEGEL.R) % (2 * span) + 2 * span) % (2 * span); x = ZIEGEL.R + (x > span ? 2 * span - x : x);
        want = x + miss * (50 + speed(b) * 0.11);
      }
      at = reach(at, want, 0.11, BOTV); S.input({ x: at });
    };
  }

  // ======================= Netz-Volley: side view, a figure on each side of the net, ball with gravity =======================
  var VOLLEY = { id: "volley", WIN: 5, serves: true, FY: H - 150, BR: 46, PRAD: 78, G: 1350, PG: 2900, JUMP: 1280, VMOVE: 950, NX: W / 2, NW: 12, NT: H - 150 - 330, VMAX: 1700, VMIN: 720 };
  function volleyServe(seed, n) { var u = unit(seed, "volley|serve|" + n); return { x: 230 + (u - 0.5) * 140, y: VOLLEY.FY - 760, vx: 0, vy: 0 }; }
  // Gravity, side walls, ceiling, and the net (a post with a round top). Returns "net" or "wall" when it bounced.
  function volleyStep(b, dt) {
    var V = VOLLEY, R = V.BR, px = b.x, hit = "";
    b.vy += V.G * dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < R) { b.x = 2 * R - b.x; b.vx = Math.abs(b.vx); hit = "wall"; }
    if (b.x > W - R) { b.x = 2 * (W - R) - b.x; b.vx = -Math.abs(b.vx); hit = "wall"; }
    if (b.y < R) { b.y = 2 * R - b.y; b.vy = Math.abs(b.vy); hit = "wall"; }
    if (Math.abs(b.x - V.NX) < V.NW + R && b.y + R > V.NT) {
      if (b.y < V.NT) {   // on the round top
        var dx = b.x - V.NX, dy = b.y - V.NT, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
        if (d < V.NW + R) { b.x = V.NX + nx * (V.NW + R); b.y = V.NT + ny * (V.NW + R); var vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= 1.8 * vn * nx; b.vy -= 1.8 * vn * ny; } hit = "net"; }
      } else { var side = px < V.NX ? -1 : 1; b.x = V.NX + side * (V.NW + R); b.vx = side * Math.abs(b.vx) * 0.75; hit = "net"; }
    }
    return hit;
  }
  function volleyMove(f, aimX, jump, dt) {   // a figure: walks to the finger, jumps when asked and standing
    var V = VOLLEY, ground = V.FY - V.PRAD, nx = reach(f.x, clamp(aimX, V.PRAD, V.NX - V.NW - V.PRAD), dt, V.VMOVE);
    f.vx = (nx - f.x) / dt; f.x = nx;
    var landed = false;
    if (jump && f.y >= ground - 0.5) f.vy = -V.JUMP;
    f.vy += V.PG * dt; f.y += f.vy * dt;
    if (f.y >= ground) { landed = f.vy > 400; f.y = ground; f.vy = 0; }
    return landed;
  }
  function volleyBump(b, f) {   // ball on a figure: off the round body, always upwards and lively
    var V = VOLLEY, dx = b.x - f.x, dy = b.y - f.y, d = Math.hypot(dx, dy), min = V.BR + V.PRAD;
    if (d >= min) return false;
    var nx = d ? dx / d : 0, ny = d ? dy / d : -1;
    b.x = f.x + nx * min; b.y = f.y + ny * min;
    var rv = (b.vx - f.vx) * nx + (b.vy - f.vy) * ny;
    if (rv < 0) { b.vx -= 2 * rv * nx; b.vy -= 2 * rv * ny; }
    b.vx += f.vx * 0.25;
    if (b.vy > -500) b.vy = -500;
    var s = speed(b); if (s < V.VMIN) { b.vx *= V.VMIN / s; b.vy *= V.VMIN / s; }
    cap(b, V.VMAX); return true;
  }
  function plausibleFigure(prev, m, dt) {
    var V = VOLLEY, ground = V.FY - V.PRAD;
    return { x: clamp(reach(prev.x, m.x, dt, V.VMOVE * 1.25), V.NX + V.NW + V.PRAD, W - V.PRAD), y: clamp(m.y, ground - 340, ground) };
  }
  var VFALL = Math.sqrt(VOLLEY.VMAX * VOLLEY.VMAX + 2 * VOLLEY.G * VOLLEY.FY);   // a ball may fall faster than any hit sends it
  function plausibleVolley(kind, b, opp) {
    var V = VOLLEY; if (!body(b) || speed(b) > (kind === "hit" ? V.VMAX * 1.01 : VFALL)) return false;
    if (kind === "pass") return Math.abs(b.x - V.NX) <= V.BR + V.NW + 90 && b.vx < 0;
    if (b.x < V.NX - V.BR) return false;
    return kind !== "hit" || Math.hypot(b.x - opp.x, b.y - opp.y) <= V.BR + V.PRAD + 260;
  }
  function volleySide(o) {
    var V = VOLLEY, S = base(V, o), aim = 250, jump = false, ground = V.FY - V.PRAD;
    S.st = { b: null, own: false, held: false, me: { x: 250, y: ground, vx: 0, vy: 0 }, opp: { x: W - 250, y: ground } };
    S.input = function (i) { if (!i) return; if (num(i.x)) aim = i.x; if (i.jump) jump = true; };
    function serve() { var st = S.st; st.b = volleyServe(S.seed, S.n); st.own = true; st.held = false; S.send({ t: "serve", n: S.n, b: mirrorX(st.b) }); S.n++; S.serveAt = 0; S.fx("serve", st.b.x, st.b.y); }
    S.tick = function (dt) {
      var st = S.st;
      loop(S, dt, function (d) {
        if (volleyMove(st.me, aim, jump, d)) S.fx("land", st.me.x, V.FY);
        if (jump && st.me.vy < 0) S.fx("jump", st.me.x, V.FY);
        jump = false;
        if (S.serveAt && S.t >= S.serveAt) serve();
        var b = st.b; if (!b || st.held) return;
        if (st.own) {
          var w = volleyStep(b, d); if (w) S.fx(w, b.x, b.y);
          if (volleyBump(b, st.me)) { S.send({ t: "hit", b: mirrorX(b) }); S.fx("hit", b.x, b.y, { v: speed(b) }); }
          if (b.y + V.BR >= V.FY) { st.b = null; S.concede(b.x, V.FY); return; }
          if (b.x > V.NX) { st.own = false; S.send({ t: "pass", b: mirrorX(b) }); }
        } else {
          volleyStep(b, d);
          if (b.x <= V.NX && b.vx < 0) { b.x = V.NX; st.held = true; }                    // handed over; wait for it
          if (b.y + V.BR >= V.FY) { b.y = V.FY - V.BR; st.held = true; }                 // the other phone counts it
        }
      });
      report(S, function () { S.send({ t: "p", x: Math.round(W - st.me.x), y: Math.round(st.me.y) }); }, st.own && st.b ? function () { S.send({ t: "st", b: mirrorX(st.b) }); } : null);
    };
    S.receive = function (m) {
      var st = S.st; if (!m || S.over) return;
      if (m.t === "p" && num(m.x) && num(m.y)) { st.opp = plausibleFigure(st.opp, m, S.oppDt(Math.abs(m.x - st.opp.x), V.VMOVE * 1.25)); return; }
      if (m.t === "pt") { st.b = null; st.own = false; S.gain(); return; }
      if (m.t === "serve" && num(m.n)) { if (!same(m.b, mirrorX(volleyServe(S.seed, m.n)))) return S.reject(); st.b = copy(m.b); st.own = false; st.held = false; S.n = m.n + 1; return; }
      if (m.t === "hit" || m.t === "st" || m.t === "pass") {
        if (st.own) return;
        if (!plausibleVolley(m.t, m.b, st.opp)) return S.reject();
        st.b = copy(m.b); st.held = false;
        if (m.t === "pass") st.own = true; else if (m.t === "hit") S.fx("ohit", st.b.x, st.b.y, { v: speed(st.b) });
      }
    };
    return S;
  }
  function volleyBot(S, r) {
    var wait = 0, lean = 0;
    return function (dt) {
      wait -= dt; if (wait > 0) return; wait = 0.08 + r() * 0.05;
      var st = S.st, b = st.b, f = st.me, V = VOLLEY;
      if (!b) { S.input({ x: 260 }); return; }
      if (b.x > V.NX) { S.input({ x: 300 }); lean = (r() - 0.5) * 2; return; }
      // Fly the ball forward until it is at head height, then stand a little behind that spot so it pops towards the net.
      var p = { x: b.x, y: b.y, vx: b.vx, vy: b.vy }, head = f.y - V.PRAD * 0.4;
      for (var i = 0; i < 240 && !(p.vy > 0 && p.y >= head); i++) volleyStep(p, 1 / 60);
      S.input({ x: p.x - 38 + lean * (30 + speed(b) * 0.09), jump: b.vy > 0 && Math.abs(b.x - f.x) < 110 && f.y - b.y < 300 && f.y - b.y > 120 });
    };
  }

  // ======================= Insel-Panzer: side view, one island, a tank on each shore, shells with gravity and wind =======================
  var PANZER = { id: "panzer", WIN: 3, serves: false, N: 100, SEA: H - 110, TX: 160, G: 620, WMAX: 140, VSHOT: 1350, VMIN: 220, RELOAD: 1.5, CR: 72, HR: 74, TH: 26 };
  // The island is mirror-symmetric, so both phones stand on the same shore; its hill and bumps come from the seed.
  function island(seed) {
    var P = PANZER, u1 = unit(seed, "isl|hill"), u2 = unit(seed, "isl|width"), u3 = unit(seed, "isl|bump"), a = [];
    for (var i = 0; i < P.N; i++) {
      var x = (i + 0.5) * W / P.N, dc = Math.abs(x - W / 2), edge = clamp((W / 2 - dc - 20) / 110, 0, 1), sm = edge * edge * (3 - 2 * edge);
      var land = H - 300 - (240 + 170 * u1) * Math.exp(-Math.pow(dc / (130 + 70 * u2), 2)) + 16 * Math.sin(dc / 41 + u3 * 6.28);
      a.push(Math.round(P.SEA + 40 - (P.SEA + 40 - land) * sm));
    }
    return a;
  }
  function surface(T, x) { var c = W / PANZER.N, f = x / c - 0.5, i = Math.floor(f), k = f - i, a = T[clamp(i, 0, PANZER.N - 1)], b = T[clamp(i + 1, 0, PANZER.N - 1)]; return a + (b - a) * k; }
  function tankPos(T, mine) { var x = mine ? PANZER.TX : W - PANZER.TX; return { x: x, y: surface(T, x) - PANZER.TH }; }
  function wind(seed, k) { return Math.round((unit(seed, "wind|" + k) * 2 - 1) * PANZER.WMAX); }
  // One shell step; returns "land" with the spot, "sea" when it is gone, or null while it flies.
  function shellStep(T, s, dt) {
    s.vx += s.w * dt; s.vy += PANZER.G * dt; s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.x < -60 || s.x > W + 60 || s.y > H) return "sea";
    if (s.x >= 0 && s.x <= W && s.y >= surface(T, s.x)) return s.y >= PANZER.SEA ? "sea" : "land";
    return null;
  }
  function flight(T, s, max) { var p = { x: s.x, y: s.y, vx: s.vx, vy: s.vy, w: s.w }; for (var i = 0; i < (max || 1200); i++) { var r = shellStep(T, p, 1 / 120); if (r) return { k: r, x: p.x, y: p.y, t: i / 120 }; } return { k: "sea", x: p.x, y: p.y, t: max / 120 }; }
  // A crater only bites into the half of the phone that decided about it.
  function crater(T, x, y, mine) {
    var P = PANZER, c = W / P.N;
    for (var i = 0; i < P.N; i++) {
      var cx = (i + 0.5) * c; if (mine ? cx > W / 2 : cx < W / 2) continue;
      var dx = cx - x; if (Math.abs(dx) >= P.CR) continue;
      T[i] = Math.min(Math.max(T[i], Math.round(y + Math.sqrt(P.CR * P.CR - dx * dx) * 0.7)), P.SEA + 20);
    }
  }
  function muzzle(T, mine) { var t = tankPos(T, mine); return { x: t.x, y: t.y - 22 }; }
  function plausibleShot(m, last, now) {
    var P = PANZER; if (!m || !num(m.vx) || !num(m.vy) || !num(m.w) || !num(m.i)) return false;
    if (Math.hypot(m.vx, m.vy) > P.VSHOT * 1.01 || Math.abs(m.w) > P.WMAX) return false;
    return now - last >= P.RELOAD * 0.6;   // nobody reloads faster than the barrel allows
  }
  function panzerSide(o) {
    var P = PANZER, S = base(P, o), T = island(S.seed), last = -9, fire = false, tokens = 1, tokAt = null, RATE = P.RELOAD;
    S.st = { T: T, aim: { vx: 0, vy: 0 }, oppAim: { vx: -500, vy: -600 }, shells: [], id: 0, wind: wind(S.seed, 0), reload: 0 };
    S.input = function (i) {
      if (!i) return;
      if (i.aim && num(i.aim.vx) && num(i.aim.vy)) S.st.aim = cap({ x: 0, y: 0, vx: i.aim.vx, vy: Math.min(i.aim.vy, 60) }, P.VSHOT);
      if (i.fire) fire = true;
    };
    function land(s, r) {
      var st = S.st, mine = r.x < W / 2;
      S.fx(r.k === "sea" ? "splash" : "boom", r.x, r.k === "sea" ? P.SEA : r.y, { mine: s.mine });
      if (r.k === "sea" || !mine) return;   // the other half is decided over there
      var tk = tankPos(T, true), hit = Math.hypot(r.x - tk.x, r.y - tk.y) < P.HR;
      crater(T, r.x, r.y, true);
      S.send({ t: "boom", o: s.mine ? 1 : 0, i: s.i, x: Math.round(W - r.x), y: Math.round(r.y), hit: hit });
      if (hit) { S.fx("tank", tk.x, tk.y, { mine: true }); S.concede(tk.x, tk.y); st.wind = wind(S.seed, S.score[0] + S.score[1]); }
    }
    S.tick = function (dt) {
      var st = S.st;
      loop(S, dt, function (d) {
        if (fire && S.started && S.t - last >= P.RELOAD && Math.hypot(st.aim.vx, st.aim.vy) >= P.VMIN) {
          var mz = muzzle(T, true), s = { x: mz.x, y: mz.y, vx: st.aim.vx, vy: st.aim.vy, w: st.wind, mine: true, i: st.id++ };
          st.shells.push(s); last = S.t;
          S.send({ t: "shot", i: s.i, vx: -s.vx, vy: s.vy, w: -s.w });
          S.fx("fire", mz.x, mz.y, { mine: true });
        }
        fire = false;
        for (var k = st.shells.length - 1; k >= 0; k--) {
          var sh = st.shells[k], r = shellStep(T, sh, d);
          if (r) { st.shells.splice(k, 1); land(sh, { k: r, x: sh.x, y: sh.y }); if (S.over) return; }
        }
        st.reload = clamp((S.t - last) / P.RELOAD, 0, 1);
      });
      report(S, function () { S.send({ t: "p", vx: Math.round(-st.aim.vx), vy: Math.round(st.aim.vy) }); });
    };
    S.receive = function (m) {
      var st = S.st; if (!m || S.over) return;
      if (tokAt === null) tokAt = S.clock();   // the barrel fills from the first word of the other phone
      S.heard();
      if (m.t === "p" && num(m.vx) && num(m.vy)) { st.oppAim = cap({ x: 0, y: 0, vx: m.vx, vy: m.vy }, P.VSHOT); return; }
      if (m.t === "shot") {
        // Nobody reloads faster than the barrel allows: one shot per RATE of this phone's time, a single one in hand;
        // after a stall seen here, the shots fired during it may come together.
        var now = S.clock(); tokens = Math.min(1.5 + S.stall() / P.RELOAD + 1e-6, tokens + (now - tokAt) / RATE); tokAt = now;   // half a shot of slack for jitter; a gap holds what a barrel reloads in it
        if (!plausibleShot(m, -Infinity, 0) || tokens < 1) return S.reject();
        tokens -= 1; var mz = muzzle(T, false);
        st.shells.push({ x: mz.x, y: mz.y, vx: m.vx, vy: m.vy, w: m.w, mine: false, i: m.i });
        st.oppAim = { vx: m.vx, vy: m.vy }; S.fx("fire", mz.x, mz.y, { mine: false });
        return;
      }
      if (m.t === "boom" && num(m.x) && num(m.y) && m.x >= W / 2 - P.CR) {
        var mine = m.o === 0;   // o is the sender's view: 1 = its own shell
        for (var k = st.shells.length - 1; k >= 0; k--) if (st.shells[k].mine === mine && st.shells[k].i === m.i) { st.shells.splice(k, 1); S.fx("boom", m.x, m.y, { mine: mine }); }
        crater(T, m.x, m.y, false);
        if (m.hit === true) { var tk = tankPos(T, false); S.fx("tank", tk.x, tk.y, { mine: false }); S.gain(); st.wind = wind(S.seed, S.score[0] + S.score[1]); }
      }
    };
    return S;
  }
  function panzerBot(S, r) {
    var wait = 1.6 + r() * 1.0, spread = 340, shots = 0, ang = 0;
    return function (dt) {
      wait -= dt; if (wait > 0 || !S.started) return;
      var st = S.st, T = st.T, mz = muzzle(T, true), tgt = tankPos(T, false);
      if (st.reload < 1) return;
      // Take a steep angle and search the speed whose shell lands at the target plus an error that shrinks shot by shot.
      ang = (48 + r() * 18) * Math.PI / 180;
      var aimX = tgt.x + (r() - 0.5) * spread, lo = PANZER.VMIN, hi = PANZER.VSHOT, v = hi;
      for (var it = 0; it < 18; it++) {
        v = (lo + hi) / 2;
        var f = flight(T, { x: mz.x, y: mz.y, vx: Math.cos(ang) * v, vy: -Math.sin(ang) * v, w: st.wind }, 900);
        if (f.x < aimX) lo = v; else hi = v;
      }
      S.input({ aim: { vx: Math.cos(ang) * v, vy: -Math.sin(ang) * v }, fire: true });
      shots++; spread = Math.max(50, 340 * Math.pow(0.72, shots));
      wait = PANZER.RELOAD + 1.2 + r() * 1.4;
    };
  }

  var GAMES = {
    puck: { id: "puck", rules: PUCK, side: puckSide, bot: puckBot },
    ziegel: { id: "ziegel", rules: ZIEGEL, side: ziegelSide, bot: ziegelBot },
    volley: { id: "volley", rules: VOLLEY, side: volleySide, bot: volleyBot },
    panzer: { id: "panzer", rules: PANZER, side: panzerSide, bot: panzerBot }
  };
  var IDS = ["puck", "ziegel", "volley", "panzer"];
  // One phone's side of a duel. o: { seed, serving, send(msg) }.
  function side(g, o) { return GAMES[g].side(o); }
  // More duels (arcade2.js) register here with the same building blocks.
  function add(g) { GAMES[g.id] = g; IDS.push(g.id); }
  function bot(g, S, seed) { return GAMES[g].bot(S, rng(seed + "|bot")); }
  // Two sides wired together in one page (the bot match, the card preview, the tests). lag: messages arrive that many
  // ticks later, which lets the tests play over a slow network.
  function pair(g, seed, lag) {
    var qa = [], qb = [], now = 0;
    var A = side(g, { seed: seed, serving: true, send: function (m) { qb.push([now + (lag || 0), JSON.parse(JSON.stringify(m))]); } });
    var B = side(g, { seed: seed, serving: false, send: function (m) { qa.push([now + (lag || 0), JSON.parse(JSON.stringify(m))]); } });
    function deliver(q, S) { while (q.length && q[0][0] <= now) S.receive(q.shift()[1]); }
    return { A: A, B: B, start: function () { A.start(); B.start(); }, tick: function (dt) { now++; deliver(qa, A); deliver(qb, B); A.tick(dt); B.tick(dt); } };
  }

  var api = { W: W, H: H, IDS: IDS, GAMES: GAMES, PUCK: PUCK, ZIEGEL: ZIEGEL, VOLLEY: VOLLEY, PANZER: PANZER, side: side, bot: bot, pair: pair, rng: rng, hash32: hash32,
    mirror: mirror, mirrorX: mirrorX, puckServe: puckServe, puckStrike: puckStrike, plausibleMallet: plausibleMallet, plausiblePuck: plausiblePuck,
    ziegelServe: ziegelServe, ziegelDefend: ziegelDefend, plausiblePaddle: plausiblePaddle, plausibleZiegel: plausibleZiegel,
    volleyServe: volleyServe, volleyStep: volleyStep, volleyBump: volleyBump, plausibleFigure: plausibleFigure, plausibleVolley: plausibleVolley,
    island: island, surface: surface, tankPos: tankPos, wind: wind, flight: flight, crater: crater, plausibleShot: plausibleShot,
    add: add, _: { base: base, loop: loop, report: report, reach: reach, clamp: clamp, num: num, body: body, copy: copy, cap: cap, speed: speed, unit: unit, same: same } };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Arcade = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
