/* Arcade duels: pure rules plus the game engine of one phone (no DOM, no network), after the Ballduell pattern. Every
   phone keeps the action in its own frame (itself at the bottom or on the left) and mirrors what it sends. Whoever's
   half the puck, ball or shell is in decides about it with its own, undelayed mallet, paddle or figure, so nobody
   loses a point to the network; serves, wind and the island come from the shared seed. A side only talks through
   send() and receive(), so the bot is simply a second side in the same page, and tests can pipe two sides together. */
(function (root) {
  "use strict";
  var W = 1000, H = 1600, STEP = 1 / 120, NET_P = 0.05, NET_ST = 0.1, SERVE_PAUSE = 0.9, STALL_MAX = 6, FIN_WAIT = 6;   // FIN_WAIT: a stall of up to about 5 s still ends alike; an older app costs it once

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
    function finish() { S.over = true; S.ending = false; S.serveAt = 0; S.draw = S.score[0] === S.score[1]; S.fx(S.draw ? "draw" : S.score[0] > S.score[1] ? "won" : "lost", W / 2, H / 2); }
    // Where both phones can take the last hit at once (G.fin: several snowballs or shells in the air), each one
    // freezes at the end and sends how many hits it took ("fin"); the channel is ordered, so its earlier hit reports are
    // in by then. With both numbers in, both phones end alike: equal is a draw. An older app sends no "fin": after
    // FIN_WAIT the score as it stands counts.
    S.ending = false; S.oppFin = null; S.draw = false;
    S.check = function () {
      if (S.over || !(S.score[0] >= G.WIN || S.score[1] >= G.WIN || S.oppFin !== null)) return;
      if (!G.fin) { finish(); return; }
      if (!S.ending) { S.ending = true; S.endAt = S.t; S.serveAt = 0; S.send({ t: "fin", c: S.score[1] }); }
      if (S.oppFin !== null) { S.score[0] = Math.max(S.score[0], S.oppFin); finish(); }   // a hit reported is never taken back
    };
    S.fin = function (m) {
      if (m.t !== "fin") return false;
      // Only an end that can be: the other one took WIN hits, or gave this one WIN already. At most WIN hits count.
      if (num(m.c) && m.c >= 0 && S.oppFin === null && (m.c >= G.WIN || S.score[1] >= G.WIN)) { S.oppFin = Math.min(G.WIN, m.c | 0); S.check(); }
      return true;
    };
    S.finWait = function (dt) { S.t += dt; if (S.t - S.endAt > FIN_WAIT) finish(); };
    // This phone let the point go: the other one scores, and the one who lost the point serves the next ball.
    S.concede = function (x, y) { if (S.over || S.ending) return;   // after "fin" nothing more is taken
      S.score[1]++; S.send({ t: "pt" }); S.fx("lose", x, y); S.check(); if (!S.over && G.serves) S.serveAt = S.t + SERVE_PAUSE; };
    S.gain = function () { S.score[0]++; S.fx("score", W / 2, H / 4); S.check(); };
    S.start = function () { S.started = true; if (o.serving && G.serves) S.serveAt = S.t + 0.01; };
    // How much finger time the other player's next move may use. Time saved up while no report came (up to half a
    // second) covers a burst of reports that arrive together after the network stalled; each report uses up what its
    // distance needs, so on average the figure is still never faster than a finger.
    S.oppDt = function (dist, vmax) {
      // on this phone's real clock: a phone that hung and then works off its queue still counts the time that passed
      var now = S.clock(); S.credit = Math.min(0.5, (S.credit == null ? 0.1 : S.credit) + Math.max(0, now - S.oppAt)); S.oppAt = now;
      var use = Math.min(S.credit, Math.max(0.016, dist / vmax)); S.credit -= use; return use;
    };
    // Something the other phone claims that cannot be: ignored, and counted so the screen can say so.
    S.reject = function () { S.rejected++; return false; };
    // A stall as this phone saw it: the gap between two arrivals on its own clock (the sender's clock could be faked).
    // For the burst that follows it (half a second), what the other one did during the gap may arrive at once.
    S.lastIn = null; S.burst = { len: 0, at: -1 }; S.pause = { len: 0, at: -1 };
    S.heard = function () {
      var now = S.clock();
      if (S.lastIn !== null && now - S.lastIn > 0.3) S.burst = { len: Math.min(now - S.lastIn, STALL_MAX), at: now };
      if (S.lastIn !== null && now - S.lastIn > 2 * NET_P) S.pause = { len: Math.min(now - S.lastIn, STALL_MAX), at: now };   // shorter ones too
      S.lastIn = now;
    };
    S.stall = function () { return S.clock() - S.burst.at < 0.5 ? S.burst.len : 0; };
    S.gap = function () { return S.clock() - S.pause.at < 0.5 ? S.pause.len : 0; };   // any gap over two report beats
    return S;
  }
  function loop(S, dt, sub) {
    if (S.over) return;
    if (S.ending) { S.finWait(Math.min(dt, 0.25)); return; }   // frozen until the other phone's last word
    // Whole steps only; the rest of a frame waits for the next one. So every phone runs the very same steps whatever its
    // frame rate, and the other one can work out a flight, a bounce on the net or a bump exactly as it happened here.
    S.acc = (S.acc || 0) + Math.min(dt, 0.25);
    while (S.acc > STEP - 1e-9) { S.acc -= STEP; S.t += STEP; sub(STEP); if (S.over || S.ending) break; }
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
  // How fast a figure really walks: VMOVE over a finger frame of 0.016 s, in every 1/120 s step (1824 a second). An
  // older app also stepped the short rest of a frame that way, so on a phone it walked up to half as fast again.
  VOLLEY.FIG = VOLLEY.VMOVE * 0.016 / STEP; VOLLEY.FIG_OLD = VOLLEY.FIG * 1.5;
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
  // The speed volleyBump gives a ball moving at (vx, vy) that meets a figure moving at (fvx, fvy) along the normal n:
  // the same arithmetic, without the position.
  function bumpV(vx, vy, nx, ny, fvx, fvy) {
    var V = VOLLEY, rv = (vx - fvx) * nx + (vy - fvy) * ny;
    if (rv < 0) { vx -= 2 * rv * nx; vy -= 2 * rv * ny; }
    vx += fvx * 0.25;
    if (vy > -500) vy = -500;
    var s = Math.hypot(vx, vy); if (s < V.VMIN) { vx *= V.VMIN / s; vy *= V.VMIN / s; s = V.VMIN; }
    if (s > V.VMAX) { vx *= V.VMAX / s; vy *= V.VMAX / s; }
    return [vx, vy];
  }
  // How far a ball speed (tx, ty) after a bump is from the nearest one a figure could give: a ball at (vx, vy) before,
  // normal n, the figure's speed anywhere in box [vx lo, hi, vy lo, hi]. The bump is linear in the figure's speed until
  // its clamps (upwards at least 500, at least VMIN, at most VMAX); so each speed the clamps could have turned into
  // (tx, ty) is solved for directly, and only a sideways normal (no unique solution) is searched.
  function bumpFit(vx, vy, nx, ny, tx, ty, box) {
    var V = VOLLEY, best = Infinity, ba = 0, bc = 0;
    function tryAC(a, c) {
      a = clamp(a, box[0], box[1]); c = clamp(c, box[2], box[3]);
      var r = bumpV(vx, vy, nx, ny, a, c), e = Math.hypot(r[0] - tx, r[1] - ty); if (e < best) { best = e; ba = a; bc = c; }
    }
    var s = Math.hypot(tx, ty) || 1, ux = tx / s, uy = ty / s, list = [], m;
    function add(x, y) { list.push([x, y]); if (Math.abs(y + 500) < 1.5) for (var t = -450; t <= 2500; t += 150) list.push([x, t]); }
    add(tx, ty);
    if (Math.abs(s - V.VMAX) < 1.5) { for (m = V.VMAX; m <= 3 * V.VMAX; m += 100) add(ux * m, uy * m); if (uy < 0 && -500 / uy >= V.VMAX) add(-500 * ux / uy, -500); }
    if (Math.abs(s - V.VMIN) < 1.5) { for (m = 500; m <= V.VMIN; m += 20) add(ux * m, uy * m); if (uy < 0 && -500 / uy <= V.VMIN) add(-500 * ux / uy, -500); }
    var k = vx * nx + vy * ny, ox = vx - 2 * k * nx, oy = vy - 2 * k * ny, A = 2 * nx * nx + 0.25, B = 2 * nx * ny, D = 2 * ny * ny, det = A * D - B * B;
    for (var i = 0; i < list.length; i++) {
      var x2 = list[i][0], y2 = list[i][1];
      if (Math.abs(det) > 1e-4) tryAC(((x2 - ox) * D - B * (y2 - oy)) / det, (A * (y2 - oy) - B * (x2 - ox)) / det);   // it bounced off
      var a = 4 * (x2 - vx); tryAC(a, box[2]); tryAC(a, 0); tryAC(a, box[3]);                                          // it did not
      // one of the two speeds at a bound of the box (a figure standing, or at full speed), the other one solved from x
      var cs = [box[2], 0, box[3]], as = [box[0], 0, box[1]];
      for (var j = 0; j < 3; j++) {
        tryAC((x2 - ox - cs[j] * B) / A, cs[j]);
        if (Math.abs(B) > 1e-6) tryAC(as[j], (x2 - ox - as[j] * A) / B);
        if (Math.abs(D) > 1e-6) tryAC(as[j], (y2 - oy - as[j] * B) / D);
      }
    }
    if (best > 1 && Math.abs(det) <= 0.02) {   // a sideways normal (no unique solution): search around the best so far
      for (var ia = 0; ia <= 8; ia++) for (var ic = 0; ic <= 8; ic++) tryAC(box[0] + (box[1] - box[0]) * ia / 8, box[2] + (box[3] - box[2]) * ic / 8);
      for (var h = Math.max(box[1] - box[0], box[3] - box[2]) / 8; h > 0.5; h /= 2) {
        var a0 = ba, c0 = bc; for (var da = -1; da <= 1; da++) for (var dc = -1; dc <= 1; dc++) tryAC(a0 + da * h, c0 + dc * h);
      }
    }
    return best;
  }
  function plausibleFigure(prev, m, dt, vmax) {
    var V = VOLLEY, ground = V.FY - V.PRAD;
    return { x: clamp(reach(prev.x, m.x, dt, vmax), V.NX + V.NW + V.PRAD, W - V.PRAD), y: clamp(m.y, ground - 340, ground) };
  }
  // Until OLD_UNTIL an app from before the touching figure and the game time were sent along (no fx, no gt) still has
  // its moves taken as it made them: its figure walked up to FIG_OLD, the short rest of a frame gave its bump any push,
  // and its bigger frame steps bounce off the net where this one does not. So for it only where the ball and its
  // figure met counts, not how - no better guarded than before these checks. From OLD_UNTIL on its moves must fit the
  // same bounds as everyone's. The Android app bundles this page and does not update itself (0.3.4/0.3.5 have the
  // older moves), so OLD_UNTIL is set only with the Android release that carries these checks: its release date plus
  // two weeks (as Date.UTC(...), in the commit that raises versionName). Until then null: no end to the period.
  var OLD_UNTIL = null;
  var OLD_SLACK = 10, OLD_NET = 130;   // its reach a little further (frames up to 34 ms); off the net only within 130 of the path
  var HIT_T = 0.1, GT_LEAD = 0.6;   // seconds from the last position report to a hit, at most: a report beat and a frame at 30 fps
  var VFALL = Math.sqrt(VOLLEY.VMAX * VOLLEY.VMAX + 2 * VOLLEY.G * VOLLEY.FY);   // a ball may fall faster than any hit sends it
  // slack: how far the figure may have walked since its last report arrived here (a phone that hung reports late).
  function plausibleVolley(kind, b, opp, slack) {
    var V = VOLLEY; if (!body(b) || speed(b) > (kind === "hit" ? V.VMAX * 1.01 : VFALL)) return false;
    if (kind === "pass") return Math.abs(b.x - V.NX) <= V.BR + V.NW + 90 && b.vx < 0;
    if (b.x < V.NX - V.BR) return false;
    return kind !== "hit" || Math.hypot(b.x - opp.x, b.y - opp.y) <= V.BR + V.PRAD + 260 + (slack || 0);
  }
  function volleySide(o) {
    var V = VOLLEY, S = base(V, o), aim = 250, jump = false, ground = V.FY - V.PRAD, pAt = null, path = [], fxSeen = false, forged = 0, waitServe = null, pIn = 0, idleAt = null, idleP = 0;
    var until = num(o.oldUntil) ? o.oldUntil : OLD_UNTIL;   // o.oldUntil, o.date: a test sets the end of the period and the day
    var oldOk = until === null || (num(o.date) ? o.date : Date.now()) < until;
    function lax() { return oldOk && !fxSeen && !gtSeen; }   // the other one may be an older app
    // From every state of the ball the other phone moves, this one works out its free flight for the next seconds with
    // the same physics. A state from over there has to lie on that path (a hit only near it, and in reach of the
    // reported figure): no clock is needed, so none can be faked, and late or early arrival does not matter.
    function along(b, dPos, dVel, from) {
      if (from === undefined) from = 0;
      for (var i = path.length - 1; i >= from; i--) {
        var q = path[i];
        if (Math.abs(q.x - b.x) <= dPos && Math.abs(q.y - b.y) <= dPos && (dVel === null || (Math.abs(q.vx - b.vx) <= dVel && Math.abs(q.vy - b.vy) <= dVel))) return true;
      }
      return false;
    }
    // A state from over there that cannot be. This phone rules on what it found itself, and on nothing else:
    // - the rally: where its own physics lets the ball land without that state (pre: the flight before a hit that only
    //   the next report showed up). In the other half it is this phone's point; coming over the net it could still
    //   have been played here, so nobody scores. Either way the other side serves next; "award" tells it so, but
    //   it never has to follow it (see receive): this side waits for that serve.
    // - the game: at the third such state, or when no serve comes within 8 s after one, it counts for this side.
    // What the other phone sends about this can never count against this one (see receive): honest play never
    // gets here, not with stalls of 0-6 s, a phone that hangs, or real frame times (tests).
    function forged1(pre) {
      // An older app (no gt, no fx) knows neither "award" nor "forfeit": without a rule both sides share, this side
      // books nothing for it and ends the game as with an older app (oldEnd); the page says nothing about odd moves then.
      if (!gtSeen && !fxSeen) { S.reject(); oldEnd(); return; }
      var st = S.st, fl = pre || path; S.reject(); forged++; S.forged = forged; pend = null;
      if (forged >= 3) { forfeit(); return; }
      var land = null; for (var i = 0; i < fl.length; i++) if (fl[i].y + V.BR >= V.FY) { land = fl[i]; break; }
      var mine = !!land && land.x > V.NX;
      S.send({ t: "award", w: mine ? 1 : 0 }); st.b = null; st.own = false; st.held = false; S.serveAt = 0; waitServe = S.clock();
      if (mine) S.gain();
    }
    function forfeit() {   // counts for this side: it found the other one's moves did not fit together
      S.send({ t: "forfeit" });
      S.st.b = null; S.forfeit = "me"; S.endBy = "rule"; S.draw = false; S.over = true; S.ending = false; S.serveAt = 0; waitServe = null;
      S.fx("won", W / 2, H / 2);
    }
    // The other phone ended the game ("forfeit" or "void"): that can never make this side lose. Ahead, it counts for
    // this side as if the other one had left; otherwise the game ends without a winner.
    function endedThere() {
      S.st.b = null; S.over = true; S.ending = false; S.serveAt = 0; waitServe = null; S.draw = false;
      if (S.score[0] > S.score[1]) { S.forfeit = "me"; S.endBy = "left"; S.fx("won", W / 2, H / 2); }
      else { S.voided = true; S.fx("draw", W / 2, H / 2); }
    }
    // The other side has an older app (no gt): from OLD_UNTIL on at its first report, before that at a move that does
    // not fit. The game ends at once (the page closes the connection and asks to update); ahead it counts for this side
    // as if the other one had left, otherwise without a winner.
    function oldEnd() {
      S.st.b = null; S.over = true; S.ending = false; S.serveAt = 0; waitServe = null; pend = null; S.draw = false; S.endBy = "old";
      if (S.score[0] > S.score[1]) { S.forfeit = "me"; S.fx("won", W / 2, H / 2); } else S.fx("draw", W / 2, H / 2);
    }
    // A hit from over there has to be one a figure could make, the same with or without the touching figure sent along:
    // the ball before it lies on the free flight worked out here (q), the ball after it sits right on the figure's
    // body along the normal n, the figure is in reach of its last report, and the new speed follows from the bump for
    // a figure speed a figure can have (walking at most VMOVE, up or down as fast as its height allows). With the
    // figure sent (F), n comes from it; without, every normal the flight allows is tried, which is what a sender could
    // pick by naming F anyway. Tolerances: rounding of F and the substeps of the sender's frames.
    var RB = V.BR + V.PRAD, TQ = 4, TV = 30;
    function figBox(f, laxA) {
      // an older app's bigger frame steps carry its jump higher (up to the 340 its reports are kept within)
      var h = ground - f.y; if (h < -1.5 || h > (laxA ? 340 : 300) || f.x < V.NX + V.NW + V.PRAD - 2 || f.x > W - V.PRAD + 2) return null;
      var cm = h < 0.75 ? 20 : Math.sqrt(Math.max(0, V.JUMP * V.JUMP - 2 * V.PG * Math.max(0, h - 12))) + 40;   // standing: not moving up or down
      var am = laxA ? 1e5 : V.FIG * 1.02; return [-am, am, -cm, cm];
    }
    // ok(f): a further condition on where the figure stood (the check with its next report). True if some place fits.
    function hitFits(b, F, opp, rx, ry, laxA, path, ok) {
      // an older app's flight depends on its frame rate (most of all after the net top): wider bounds for it until OLD_UNTIL
      var qs = [], i, j, q, fv = Math.hypot(laxA ? V.FIG_OLD : V.FIG, V.JUMP), tq = laxA ? (path.near !== undefined ? 30 : 10) : TQ, tv = laxA ? (path.near !== undefined ? 90 : 45) : TV;
      for (i = 0; i < path.length; i++) for (j = 0; j < (i + 1 < path.length ? 4 : 1); j++) {   // the flight, in quarter substeps
        var p0 = path[i], p1 = path[i + 1] || p0, u = j / 4;
        q = { x: p0.x + (p1.x - p0.x) * u, y: p0.y + (p1.y - p0.y) * u, vx: p0.vx + (p1.vx - p0.vx) * u, vy: p0.vy + (p1.vy - p0.vy) * u };
        if (i > 0) { var pp = path[i - 1]; q.px = pp.x + (p0.x - pp.x) * u; q.py = pp.y + (p0.y - pp.y) * u; }   // one step before
        if (Math.hypot(b.x - q.x, b.y - q.y) <= RB + tq) qs.push(q);
      }
      if (!qs.length) return false;
      function tryN(nx, ny, onlyQ) {
        var f = { x: b.x - RB * nx, y: b.y - RB * ny };
        if (Math.abs(f.x - opp.x) > rx || Math.abs(f.y - opp.y) > ry || (ok && !ok(f))) return false;
        var box = figBox(f, laxA); if (!box) return false;
        if (laxA) return true;
        for (var k = 0; k < qs.length; k++) {
          var c = qs[k]; if (onlyQ && c !== onlyQ) continue;
          var dx = b.x - c.x, dy = b.y - c.y, al = dx * nx + dy * ny;
          // q inside the figure on the line along n; a step before it was not touching it yet (unless the flight only
          // starts there, after a hand-over or a hit), so it went in only as deep as one step brings the two together
          if (Math.abs(dx * ny - dy * nx) > tq || al < -tq || al > RB + tq) continue;
          if (c.px !== undefined && Math.hypot(c.px - f.x, c.py - f.y) < RB - fv * STEP - tq) continue;
          if (bumpFit(c.vx, c.vy, nx, ny, b.vx, b.vy, box) <= tv) return true;
        }
        return false;
      }
      // An older app's bump depends on its frame rate (its figure takes uneven steps, and a bump and a bounce off the
      // net can fall into one frame): until OLD_UNTIL only where it touched counts for it - its figure in reach, RB from
      // the ball, near the flight - and what holds at any frame rate: the ball leaves upwards and lively (volleyBump).
      // With fx and gt the bump has to follow from ball and figure.
      if (laxA) {
        var sb = speed(b); if (!(b.vy < 0 && (b.vy <= -499 || sb >= V.VMAX * 0.99) && sb >= V.VMIN * 0.99 && sb <= V.VMAX * 1.01)) return false;
        for (i = 0; i < 1571; i++) if (tryN(Math.cos(i * 0.004), Math.sin(i * 0.004), null)) return true;
        return false;
      }
      if (F) {
        var d = Math.hypot(b.x - F.x, b.y - F.y); if (!d || Math.abs(d - RB) > 1.5) return false;
        var n0 = Math.atan2(b.y - F.y, b.x - F.x);
        for (i = -1; i <= 1; i++) if (tryN(Math.cos(n0 + i * 0.006), Math.sin(n0 + i * 0.006), null)) return true;
        return false;
      }
      for (i = 0; i < qs.length; i++) {
        q = qs[i]; var dq = Math.hypot(b.x - q.x, b.y - q.y); if (dq > RB + tq) continue;
        var t0 = Math.atan2(b.y - q.y, b.x - q.x), w = dq <= tq ? Math.PI : Math.asin(tq / dq), st = 0.004;
        for (var k = 0; k * st <= w + 1e-9; k++) {   // from the likeliest normal outwards
          if (tryN(Math.cos(t0 + k * st), Math.sin(t0 + k * st), q)) return true;
          if (k && tryN(Math.cos(t0 - k * st), Math.sin(t0 - k * st), q)) return true;
        }
      }
      return false;
    }
    // The next position report checks a hit once more: the figure had to get from its report before the hit through
    // the place it touched the ball to its report after it, in no more time than lies between two reports (plus what a
    // stall measured here adds). So it cannot be named anywhere in reach and then still be reported where it was.
    var pend = null;
    function laterFits(now) {
      if (!pend) return true;
      var P = pend; pend = null;
      var w = lax() ? Math.hypot(V.FIG_OLD, V.JUMP) * 1.25 * S.gap() + OLD_SLACK : 0, lx = (lax() ? V.FIG_OLD : V.FIG) * HIT_T + 4 + w, ly = V.JUMP * HIT_T + 4 + w;
      return hitFits(P.b, P.F, P.from, P.rx, P.ry, P.laxA, P.path, function (f) {
        return Math.abs(f.x - P.from.x) + Math.abs(now.x - f.x) <= lx && Math.abs(f.y - P.from.y) + Math.abs(now.y - f.y) <= ly;
      });
    }
    function keep(b) {
      var q = { x: b.x, y: b.y, vx: b.vx, vy: b.vy }; path = [copy(q)];
      // near: from where the flight touches the net or passes within 40 px of it (an older app's bigger frame steps may
      // touch it there, or miss it where this one does)
      for (var i = 0; i < 120 * (STALL_MAX + 2) && q.y + V.BR < V.FY + 60; i++) {
        if (volleyStep(q, 1 / 120) === "net" && path.net === undefined) path.net = i + 1;
        if (path.near === undefined && Math.hypot(q.x - V.NX, Math.min(0, q.y - V.NT)) < V.NW + V.BR + 40) path.near = i + 1;
        path.push(copy(q));
      }
    }
    S.st = { b: null, own: false, held: false, me: { x: 250, y: ground, vx: 0, vy: 0 }, opp: { x: W - 250, y: ground } };
    S.input = function (i) { if (!i) return; if (num(i.x)) aim = i.x; if (i.jump) jump = true; };
    function serve() { var st = S.st; st.b = volleyServe(S.seed, S.n); st.own = true; st.held = false; S.send({ t: "serve", n: S.n, b: mirrorX(st.b) }); S.n++; S.serveAt = 0; S.fx("serve", st.b.x, st.b.y); }
    S.tick = function (dt) {
      var st = S.st;
      if (waitServe !== null && !S.over && S.clock() - waitServe > 8) { waitServe = null; forfeit(); }   // no serve after an award: it counts for this side
      // Nothing to do here (the ball held for the other side's call, or no ball and none to serve here) while its
      // reports keep coming: an honest app makes its call at once, and the channel brings it before the reports
      // after it, even after a stall. 8 s and 100 reports without it are withheld: it counts for this side (an older
      // app is asked to update), the same as no serve after an award.
      var idle = S.started && !S.over && !S.ending && (st.held || (!st.b && !S.serveAt));
      if (!idle) idleAt = null;
      else if (idleAt === null) { idleAt = S.clock(); idleP = pIn; }
      else if (S.clock() - idleAt > 8 && pIn - idleP >= 100) { idleAt = null; if (!gtSeen && !fxSeen) oldEnd(); else forfeit(); }
      loop(S, dt, function (d) {
        if (volleyMove(st.me, aim, jump, d)) S.fx("land", st.me.x, V.FY);
        if (jump && st.me.vy < 0) S.fx("jump", st.me.x, V.FY);
        jump = false;
        if (S.serveAt && S.t >= S.serveAt) serve();
        var b = st.b; if (!b || st.held) return;
        if (st.own) {
          var w = volleyStep(b, d); if (w) S.fx(w, b.x, b.y);
          if (volleyBump(b, st.me)) { S.send({ t: "hit", b: mirrorX(b), fx: Math.round(W - st.me.x), fy: Math.round(st.me.y), gt: Math.round(S.t * 1000) }); S.fx("hit", b.x, b.y, { v: speed(b) }); }   // with where and when the figure touched it
          if (b.y + V.BR >= V.FY) { st.b = null; S.concede(b.x, V.FY); return; }
          if (b.x > V.NX) { st.own = false; S.send({ t: "pass", b: mirrorX(b) }); keep(b); }
        } else {
          volleyStep(b, d);
          if (b.x <= V.NX && b.vx < 0) { b.x = V.NX; st.held = true; }                    // handed over; wait for it
          if (b.y + V.BR >= V.FY) { b.y = V.FY - V.BR; st.held = true; }                 // the other phone counts it
        }
      });
      report(S, function () { S.send({ t: "p", x: Math.round(W - st.me.x), y: Math.round(st.me.y), gt: Math.round(S.t * 1000) }); }, st.own && st.b ? function () { S.send({ t: "st", b: mirrorX(st.b) }); } : null);
    };
    // The other figure's game time (gt, sent along since this check exists): its reports and hits must follow each other
    // no faster than a figure walks and jumps in the game time between them, so it can be named only where it could be.
    // A sender could set its game clock ahead to gain time: here its lead over this phone's clock may grow by GT_LEAD in
    // all (an honest one grows only as much as the network's delay varies); beyond that its time is cut back.
    var trk = null, gtOff = null, gtLead = GT_LEAD, gtLast = -Infinity, gtSeen = false;
    function gtime(m) {
      var g = m.gt / 1000, d = g - S.clock(); gtSeen = true;
      if (gtOff === null) gtOff = d;
      else if (d > gtOff) { var ex = Math.min(d - gtOff, gtLead); gtLead -= ex; gtOff += ex; g = Math.min(g, S.clock() + gtOff); }
      g = Math.max(g, gtLast); gtLast = g; return g;
    }
    function walkable(a, x, y, g) { var t = g - a.g; return Math.abs(x - a.x) <= V.FIG * t + 4 && Math.abs(y - a.y) <= (V.JUMP + 30) * t + 4; }
    S.receive = function (m) {
      var st = S.st; if (!m || S.over) return;
      S.heard();
      if (m.t === "p" && num(m.x) && num(m.y)) {
        pIn++; if (!num(m.gt) && !gtSeen && !oldOk) { oldEnd(); return; }   // an older app after OLD_UNTIL: asked to update
        pAt = S.clock(); var vf = (lax() ? V.FIG_OLD : V.FIG) * 1.25; st.opp = plausibleFigure(st.opp, m, S.oppDt(Math.abs(m.x - st.opp.x), vf), vf);
        if (num(m.gt)) {
          var g = gtime(m), px = clamp(m.x, V.NX + V.NW + V.PRAD, W - V.PRAD), py = clamp(m.y, ground - 340, ground);
          // from its last report, or from where it touched the ball since, in the game time between
          if (trk && !walkable(trk, px, py, g)) {   // faster than a figure: kept where it could have got to
            var hit = trk.hit, t = g - trk.g;
            px = clamp(px, trk.x - V.FIG * t, trk.x + V.FIG * t); py = clamp(py, trk.y - (V.JUMP + 30) * t, trk.y + (V.JUMP + 30) * t);
            trk = { x: px, y: py, g: g };
            if (hit && hit.n === S.n && waitServe === null) forged1(hit.pre); else S.reject();   // it could not have made that hit
            return;
          }
          trk = { x: px, y: py, g: g };
        } else { var P = pend; if (!laterFits(st.opp)) { if (P && P.n === S.n && waitServe === null) forged1(P.path); else S.reject(); } }
        return;
      }
      if (m.t === "pt") { if (waitServe !== null) return; st.b = null; st.own = false; S.gain(); return; }   // after an award that rally is ruled on
      // Ended over there: never against this side. If this side has been waiting for the other one's call while its
      // reports kept coming, the other one withheld it (an honest app calls at once): it counts for this side.
      if (m.t === "void" || m.t === "forfeit") { if (idleAt !== null && pIn - idleP >= 20) forfeit(); else endedThere(); return; }
      // "award" is only what the other side ruled for itself: never followed here. Followed, it would let a cheat take
      // away every ball this side could still reach. Its rule needs nothing from this side (it waits for the serve).
      if (m.t === "award") return;
      if (m.t === "serve" && num(m.n)) {
        // only when a serve from over there is due: no ball in play here and none to serve here, and never an old one
        if (st.b || S.serveAt || m.n < S.n || !same(m.b, mirrorX(volleyServe(S.seed, m.n)))) return S.reject();
        waitServe = null; st.b = copy(m.b); st.own = false; st.held = false; S.n = m.n + 1; keep(st.b); return;
      }
      if (m.t === "hit" || m.t === "st" || m.t === "pass") {
        if (st.own || waitServe !== null) return;   // after an award: what was still on its way from that rally does not count
        // How far the figure may have got since its report: only after a real gap in all arrivals (a stall of the network
        // or a phone that hung), measured here; a sender that only holds back its reports gains nothing.
        var walked = Math.hypot(lax() ? V.FIG_OLD : V.FIG, V.JUMP) * 1.25 * S.gap();
        if (!plausibleVolley(m.t, m.b, st.opp, walked)) return forged1();
        if (path.length && body(m.b)) {
          if (m.t === "hit") {
            // contact: the ball near its path (the bump only pushes it out a little) and at the reported figure
            // in reach: walking and jumping in the time from its last report to the hit, and what a stall measured here adds
            var F = num(m.fx) && num(m.fy) ? { x: m.fx, y: m.fy } : null; if (F) fxSeen = true;
            if ((!F && fxSeen) || (gtSeen && !num(m.gt))) return forged1();   // an app that once told where (and when) it touched always does
            if (F && num(m.gt) && trk) {
              // where and when it touched: walkable from its last report, the ball right at it, and on to its next report
              var gh = gtime(m);
              if (!walkable(trk, F.x, F.y, gh) || !hitFits(m.b, F, F, 3, 3, false, path)) return forged1();
              trk = { x: F.x, y: F.y, g: gh, hit: { pre: path, n: S.n } };
            } else {
              var wk = lax() ? walked + OLD_SLACK : 0, vx0 = lax() ? V.FIG_OLD : V.FIG, H = { b: copy(m.b), F: F, from: { x: st.opp.x, y: st.opp.y }, rx: vx0 * HIT_T + 2 + wk, ry: V.JUMP * HIT_T + 2 + wk, laxA: !F && lax(), path: path };
              if (!hitFits(H.b, H.F, H.from, H.rx, H.ry, H.laxA, H.path)) return forged1();
              if (!pend) pend = H;   // a hit right after a hit: the first one counts
            }
          } else if (!along(m.b, 40, 45) && !(lax() && path.near !== undefined && along(m.b, OLD_NET, null, path.near))) return forged1();   // free flight: on the path, at its speed (an older app's bounce off the net depends on its frame rate: from where the flight comes near the net only near the path)
        }
        st.b = copy(m.b); st.held = false; keep(st.b);
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
  var PANZER = { id: "panzer", WIN: 3, serves: false, fin: true, N: 100, SEA: H - 110, TX: 160, G: 620, WMAX: 140, VSHOT: 1350, VMIN: 220, RELOAD: 1.5, CR: 72, HR: 74, TH: 26, FLOOR: 12, AIM: 420 };
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
    // Sea or land is the ground under the shell, not how deep it fell within this step: a fast shell that overshoots
    // the floor of a crater still lands on the island.
    if (s.x >= 0 && s.x <= W) { var g = surface(T, s.x); if (s.y >= g) return g >= PANZER.SEA ? "sea" : "land"; }
    return null;
  }
  function flight(T, s, max) { var p = { x: s.x, y: s.y, vx: s.vx, vy: s.vy, w: s.w }; for (var i = 0; i < (max || 1200); i++) { var r = shellStep(T, p, 1 / 120); if (r) return { k: r, x: p.x, y: p.y, t: i / 120 }; } return { k: "sea", x: p.x, y: p.y, t: max / 120 }; }
  // A crater only bites into the half of the phone that decided about it. Its floor stays above the waterline, else
  // that ground would count as sea and a tank sunk that deep could never be hit again. It never raises ground.
  function crater(T, x, y, mine) {
    var P = PANZER, c = W / P.N;
    for (var i = 0; i < P.N; i++) {
      var cx = (i + 0.5) * c; if (mine ? cx > W / 2 : cx < W / 2) continue;
      var dx = cx - x; if (Math.abs(dx) >= P.CR) continue;
      T[i] = Math.max(T[i], Math.min(Math.round(y + Math.sqrt(P.CR * P.CR - dx * dx) * 0.7), P.SEA - P.FLOOR));
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
          if (r) { st.shells.splice(k, 1); land(sh, { k: r, x: sh.x, y: sh.y }); if (S.over || S.ending) return; }
        }
        st.reload = clamp((S.t - last) / P.RELOAD, 0, 1);
      });
      report(S, function () { S.send({ t: "p", vx: Math.round(-st.aim.vx), vy: Math.round(st.aim.vy) }); });
    };
    S.receive = function (m) {
      var st = S.st; if (!m || S.over) return;
      if (tokAt === null) tokAt = S.clock();   // the barrel fills from the first word of the other phone
      S.heard();                               // every arrival counts for the gap, the last word too
      if (S.fin(m)) return;
      if (S.ending && m.t !== "boom") return;   // at the end only the hit count still matters
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
  // Binary search over the speed at one angle; miss is how far the shell actually lands from aimX.
  function speedFor(T, mz, ang, aimX, w) {
    var lo = PANZER.VMIN, hi = PANZER.VSHOT, v = hi, f;
    for (var it = 0; it < 18; it++) {
      v = (lo + hi) / 2;
      f = flight(T, { x: mz.x, y: mz.y, vx: Math.cos(ang) * v, vy: -Math.sin(ang) * v, w: w }, 900);
      if (f.x < aimX) lo = v; else hi = v;
    }
    return { ang: ang, v: v, miss: f.k === "land" ? Math.abs(f.x - aimX) : Infinity };
  }
  function panzerBot(S, r) {
    var wait = 1.6 + r() * 1.0, ang = 0;
    return function (dt) {
      wait -= dt; if (wait > 0 || !S.started) return;
      var st = S.st, T = st.T, mz = muzzle(T, true), tgt = tankPos(T, false);
      if (st.reload < 1) return;
      // Take a steep angle and search the speed whose shell lands at the target plus an aiming error from the dice
      // (PANZER.AIM wide, the same on every shot: about one hit in three or four, never adjusted to the score).
      // With a strong tailwind no speed at that angle may land there (slower shells hit the hill, faster ones blow out
      // to sea); then it tries other angles, as a player would, and keeps the one that lands closest.
      ang = (48 + r() * 18) * Math.PI / 180;
      var aimX = tgt.x + (r() - 0.5) * PANZER.AIM, best = speedFor(T, mz, ang, aimX, st.wind);
      for (var a = 30; a <= 84 && best.miss > 24; a += 6) { var c = speedFor(T, mz, a * Math.PI / 180, aimX, st.wind); if (c.miss < best.miss) best = c; }
      S.input({ aim: { vx: Math.cos(best.ang) * best.v, vy: -Math.sin(best.ang) * best.v }, fire: true });
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
    add: add, _: { bumpFit: bumpFit, bumpV: bumpV, base: base, loop: loop, report: report, reach: reach, clamp: clamp, num: num, body: body, copy: copy, cap: cap, speed: speed, unit: unit, same: same } };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Arcade = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
