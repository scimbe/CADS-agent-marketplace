/* Six more arcade duels on the building blocks of arcade.js (pure, no DOM, no network). Real-time duels follow the
   same rule as there: whoever's half the ball is in, or whoever is being aimed at, decides with its own undelayed
   figure. The two turn-based ones (Eis-Stock, Murmel-Ring) instead simulate every throw on both phones in one shared
   frame with fixed steps and plain arithmetic, so both get the very same result and nobody can claim another. */
(function (root) {
  "use strict";
  var A = typeof module !== "undefined" && module.exports ? require("./arcade.js") : root.Arcade;
  var W = A.W, H = A.H, _ = A._, clamp = _.clamp, num = _.num, body = _.body, copy = _.copy, cap = _.cap, speed = _.speed, reach = _.reach, unit = _.unit, same = _.same;
  var mirror = A.mirror, HOLD = 6, STEP = 1 / 120;

  // A ball owned by the half it is in (Stangen-Kick, Flipper-Duell): the owner moves it and decides, the other phone
  // only flies it along and waits at the middle line until it is handed over.
  function halfBall(S, G) {
    var st = S.st, hitAt = -1, since = 0;
    st.b = null; st.own = false; st.held = false;
    function serve() { st.b = G.serve(S.seed, S.n); st.own = true; st.held = false; since = S.t; S.send({ t: "serve", n: S.n, b: mirror(st.b) }); S.n++; S.serveAt = 0; S.fx("serve", st.b.x, st.b.y); }
    function give() { st.b = mirror(G.serve(S.seed, S.n)); st.own = false; st.held = false; S.send({ t: "give", n: S.n }); S.n++; S.fx("give", st.b.x, st.b.y); }
    return {
      step: function (d, collide) {
        if (S.serveAt && S.t >= S.serveAt) serve();
        var b = st.b; if (!b || st.held) return;
        if (st.own) {
          var w = G.free(b, d); if (w) S.fx(w, b.x, b.y);
          var h = collide(b); if (h && S.t - hitAt > 0.08) { hitAt = S.t; S.send({ t: "hit", b: mirror(b) }); S.fx(h === true ? "hit" : h, b.x, b.y, { v: speed(b) }); }
          if (b.y > H + G.R) { st.b = null; S.concede(b.x, H); return; }
          if (b.y < H / 2 && b.vy < 0) { st.own = false; S.send({ t: "pass", b: mirror(b) }); }
          else if (S.t - since > HOLD) give();
        } else {
          G.free(b, d);
          if (b.y >= H / 2 && b.vy > 0) { b.y = H / 2; st.held = true; }
        }
      },
      report: function () { return st.own && st.b ? function () { S.send({ t: "st", b: mirror(st.b) }); } : null; },
      receive: function (m, near) {
        if (m.t === "pt") { st.b = null; st.own = false; S.gain(); return true; }
        if (m.t === "serve" && num(m.n)) { if (!same(m.b, mirror(G.serve(S.seed, m.n)))) return S.reject(), true; st.b = copy(m.b); st.own = false; st.held = false; S.n = m.n + 1; return true; }
        if (m.t === "give" && num(m.n)) { if (!st.own) { st.b = G.serve(S.seed, m.n); st.own = true; st.held = false; since = S.t; S.n = m.n + 1; S.fx("serve", st.b.x, st.b.y); } return true; }
        if (m.t === "hit" || m.t === "st" || m.t === "pass") {
          if (st.own) return true;
          var b = m.b, ok = body(b) && speed(b) <= G.VMAX * 1.01 && (m.t === "pass" ? Math.abs(b.y - H / 2) <= 90 && b.vy > 0 : b.y <= H / 2 + G.R && (m.t !== "hit" || near(b)));
          if (!ok) return S.reject(), true;
          st.b = copy(b); st.held = false;
          if (m.t === "pass") { st.own = true; since = S.t; } else if (m.t === "hit") S.fx("ohit", b.x, b.y, { v: speed(b) });
          return true;
        }
        return false;
      }
    };
  }
  // Disc against a moving disc (figure, bumper): pushed out and bounced off its surface; e is the bounciness.
  function bounce(b, R, c, CR, cvx, cvy, e) {
    var dx = b.x - c.x, dy = b.y - c.y, d = Math.sqrt(dx * dx + dy * dy), min = R + CR;
    if (d >= min) return false;
    var nx = d ? dx / d : 0, ny = d ? dy / d : -1;
    b.x = c.x + nx * min; b.y = c.y + ny * min;
    var rv = (b.vx - cvx) * nx + (b.vy - cvy) * ny;
    if (rv < 0) { b.vx -= (1 + e) * rv * nx; b.vy -= (1 + e) * rv * ny; }
    return true;
  }
  function tableWalls(b, d, R, mouth, fric) {
    var f = 1 - fric * d, hit = "";
    b.x += b.vx * d; b.y += b.vy * d; b.vx *= f; b.vy *= f;
    if (b.x < R) { b.x = 2 * R - b.x; b.vx = Math.abs(b.vx) * 0.9; hit = "wall"; }
    if (b.x > W - R) { b.x = 2 * (W - R) - b.x; b.vx = -Math.abs(b.vx) * 0.9; hit = "wall"; }
    if (Math.abs(b.x - W / 2) >= mouth / 2 - R * 0.4) {
      if (b.y > H - R && b.y < H + R) { b.y = 2 * (H - R) - b.y; b.vy = -Math.abs(b.vy) * 0.9; hit = "wall"; }
      if (b.y < R && b.y > -R) { b.y = 2 * R - b.y; b.vy = Math.abs(b.vy) * 0.9; hit = "wall"; }
    }
    return hit;
  }

  // ======================= Stangen-Kick: two rods per player, moved together by one finger, tap kicks =======================
  var KICK = { id: "kick", WIN: 3, serves: true, R: 26, FR: 30, GOAL: 320, VMAX: 2300, FRIC: 0.25, RMAX: 2400, KY: H - 190, SY: H - 600, GAP: 280, KICK: 0.18, KV: 1500 };
  function kickServe(seed, n) { var u = unit(seed, "kick|serve|" + n); return { x: W / 2 + (u - 0.5) * 240, y: H * 0.56, vx: (u - 0.5) * 80, vy: 60 }; }
  function kickRods(c) {   // c: where the finger put the rods; the keeper stays in front of the goal
    var k = clamp(W / 2 + (c - W / 2) * 0.6, W / 2 - 150, W / 2 + 150);
    return [{ x: k, y: KICK.KY }, { x: c - KICK.GAP, y: KICK.SY }, { x: c, y: KICK.SY }, { x: c + KICK.GAP, y: KICK.SY }];
  }
  function kickClamp(c) { return clamp(c, KICK.GAP + 40, W - KICK.GAP - 40); }
  function kickSide(o) {
    var K = KICK, S = A._.base(K, o), aim = W / 2, kickAt = -9;
    S.st = { c: W / 2, cv: 0, kick: 0, opp: W / 2, oppKick: 0 };
    var ball = halfBall(S, { serve: kickServe, R: K.R, VMAX: K.VMAX, free: function (b, d) { return tableWalls(b, d, K.R, K.GOAL, K.FRIC); } });
    S.input = function (i) { if (!i) return; if (num(i.x)) aim = kickClamp(i.x); if (i.kick && S.t - kickAt > 0.35) kickAt = S.t; };
    S.tick = function (dt) {
      var st = S.st;
      A._.loop(S, dt, function (d) {
        var c = reach(st.c, aim, d, K.RMAX); st.cv = (c - st.c) / d; st.c = c;
        st.kick = clamp(1 - (S.t - kickAt) / K.KICK, 0, 1);
        ball.step(d, function (b) {
          var rods = kickRods(st.c), hit = false;
          rods.forEach(function (f, i) { if (bounce(b, K.R, f, K.FR, i ? st.cv : st.cv * 0.6, -K.KV * st.kick, 0.8)) hit = true; });
          if (hit) { if (st.kick > 0) b.vy = Math.min(b.vy, -K.KV * 0.8); cap(b, K.VMAX); b.x = clamp(b.x, K.R, W - K.R); }
          return hit && (st.kick > 0 ? "kick" : true);
        });
      });
      A._.report(S, function () { S.send({ t: "p", c: Math.round(W - st.c), k: st.kick > 0 ? 1 : 0 }); }, ball.report());
    };
    S.receive = function (m) {
      var st = S.st; if (!m || S.over) return;
      if (m.t === "p" && num(m.c)) { st.opp = clamp(reach(st.opp, m.c, S.oppDt(Math.abs(m.c - st.opp), K.RMAX * 1.25), K.RMAX * 1.25), K.GAP + 40, W - K.GAP - 40); st.oppKick = m.k ? 1 : 0; return; }
      ball.receive(m, function (b) { return kickRods(st.opp).some(function (f) { var y = H - f.y; return Math.abs(b.x - f.x) <= K.R + K.FR + 450   /* rods move 2400 per second: a report 100 ms old is 240 off */ && Math.abs(b.y - y) <= K.R + K.FR + 120; }); });
    };
    return S;
  }
  function kickBot(S, r) {
    var wait = 0, err = 0;
    return function (dt) {
      wait -= dt; if (wait > 0) return; wait = 0.11 + r() * 0.06;
      var st = S.st, b = st.b;
      if (!b) { S.input({ x: W / 2 }); return; }
      // Put the nearest figure of the rod ahead of the ball in its way, a little off, and kick when it is close.
      var rodY = b.y < KICK.SY + 60 ? KICK.SY : KICK.KY, off = rodY === KICK.SY ? [-KICK.GAP, 0, KICK.GAP] : [0], best = 0, bd = 1e9;
      off.forEach(function (o) { var d = Math.abs(st.c + o - b.x); if (d < bd) { bd = d; best = o; } });
      if (r() < 0.3) err = (r() - 0.5) * (40 + speed(b) * 0.08);
      S.input({ x: b.x - best + err, kick: st.own && Math.abs(b.y - rodY) < 90 && bd < 70 && r() < 0.7 });
    };
  }

  // ======================= Flipper-Duell: two flippers guard each end, bumpers from the seed in the middle =======================
  var FLIP = { id: "flipper", WIN: 5, serves: true, R: 20, VMAX: 1500, VMIN: 620, PX: 150, PY: H - 230, L: 300, T: 13, REST: 0.52, UP: -0.5, SPIN: 24, NB: 3, BR: 38, LANE: H - 470 };
  function flipServe(seed, n) { var a = (A.hash32(seed + "|flip|serve|" + n) % 61 - 30) * Math.PI / 180; return { x: W / 2, y: H / 2, vx: Math.sin(a) * 700, vy: -Math.cos(a) * 700 }; }
  // Bumpers in the own half; the other half has the same ones turned around, so both ends play alike.
  function flipBumpers(seed) {
    var out = [];
    for (var k = 0; k < FLIP.NB; k++) out.push({ x: 200 + k * 300 + (unit(seed, "bump|x|" + k) - 0.5) * 120, y: H / 2 + 170 + unit(seed, "bump|y|" + k) * 260 });
    return out;
  }
  function flipSeg(left, a) {   // a flipper as a segment from its pivot to its tip; a = angle below the horizontal
    var px = left ? FLIP.PX : W - FLIP.PX, dir = left ? 1 : -1;
    return { ax: px, ay: FLIP.PY, bx: px + dir * Math.cos(a) * FLIP.L, by: FLIP.PY + Math.sin(a) * FLIP.L };
  }
  function segHit(b, s, R, T, w, px, py, e) {   // ball against a segment turning with angular speed w around (px, py)
    var vx = s.bx - s.ax, vy = s.by - s.ay, l2 = vx * vx + vy * vy, k = clamp(((b.x - s.ax) * vx + (b.y - s.ay) * vy) / l2, 0, 1);
    var qx = s.ax + vx * k, qy = s.ay + vy * k, dx = b.x - qx, dy = b.y - qy, d = Math.sqrt(dx * dx + dy * dy);
    if (d >= R + T) return false;
    var nx = d ? dx / d : 0, ny = d ? dy / d : -1;
    b.x = qx + nx * (R + T); b.y = qy + ny * (R + T);
    var svx = -w * (qy - py), svy = w * (qx - px), rv = (b.vx - svx) * nx + (b.vy - svy) * ny;
    if (rv < 0) { b.vx -= (1 + e) * rv * nx; b.vy -= (1 + e) * rv * ny; }
    return true;
  }
  function flipFree(b, d) {
    var R = FLIP.R, hit = "";
    b.x += b.vx * d; b.y += b.vy * d;
    if (b.x < R) { b.x = 2 * R - b.x; b.vx = Math.abs(b.vx); hit = "wall"; }
    if (b.x > W - R) { b.x = 2 * (W - R) - b.x; b.vx = -Math.abs(b.vx); hit = "wall"; }
    return hit;
  }
  function flipSide(o) {
    var F = FLIP, S = A._.base(F, o), hold = [false, false], bumps = flipBumpers(S.seed);
    S.st = { a: [F.REST, F.REST], w: [0, 0], opp: [F.REST, F.REST], bumps: bumps, lit: [0, 0, 0] };
    var lanes = [{ ax: 0, ay: F.LANE, bx: F.PX, by: F.PY }, { ax: W, ay: F.LANE, bx: W - F.PX, by: F.PY }];
    var ball = halfBall(S, { serve: flipServe, R: F.R, VMAX: F.VMAX, free: flipFree });
    S.input = function (i) { if (i && i.flip) { hold[0] = !!i.flip[0]; hold[1] = !!i.flip[1]; } };
    S.tick = function (dt) {
      var st = S.st;
      A._.loop(S, dt, function (d) {
        for (var k = 0; k < 2; k++) { var to = hold[k] ? F.UP : F.REST, na = reach(st.a[k], to, d, F.SPIN); st.w[k] = (na - st.a[k]) / d; st.a[k] = na; }
        for (var j = 0; j < 3; j++) st.lit[j] = Math.max(0, st.lit[j] - d * 3);
        ball.step(d, function (b) {
          var hit = false;
          for (var k = 0; k < 2; k++) if (segHit(b, flipSeg(k === 0, st.a[k]), F.R, F.T, k === 0 ? st.w[k] : -st.w[k], k === 0 ? F.PX : W - F.PX, F.PY, 0.55)) hit = "flip";
          for (var l = 0; l < 2; l++) if (segHit(b, lanes[l], F.R, 6, 0, 0, 0, 0.5)) hit = hit || "wall";
          bumps.forEach(function (c, j) { if (bounce(b, F.R, c, F.BR, 0, 0, 1)) { st.lit[j] = 1; hit = "bump"; var s = speed(b); b.vx *= 1.08; b.vy *= 1.08; if (s < F.VMIN) { b.vx *= F.VMIN / s; b.vy *= F.VMIN / s; } } });
          if (hit) { cap(b, F.VMAX); if (Math.abs(b.vy) < 220) b.vy = b.vy < 0 ? -220 : 220; }
          return hit === "wall" ? false : hit;
        });
      });
      A._.report(S, function () { S.send({ t: "p", a: [Math.round(st.a[1] * 100), Math.round(st.a[0] * 100)] }); }, ball.report());   // seen from the far end, left and right swap
    };
    S.receive = function (m) {
      var st = S.st; if (!m || S.over) return;
      if (m.t === "p" && Array.isArray(m.a) && num(m.a[0]) && num(m.a[1])) { st.opp = [clamp(m.a[0] / 100, F.UP, F.REST), clamp(m.a[1] / 100, F.UP, F.REST)]; return; }
      ball.receive(m, function (b) { return b.y <= H - F.LANE + F.R + 120 || bumps.some(function (c) { return Math.hypot(b.x - (W - c.x), b.y - (H - c.y)) <= F.R + F.BR + 60; }); });
    };
    return S;
  }
  function flipBot(S, r) {
    var t = [0, 0], late = 0;
    return function (dt) {
      var st = S.st, b = st.b, hold = [false, false];
      t[0] -= dt; t[1] -= dt;
      if (b && st.own && b.vy > 0) {
        for (var k = 0; k < 2; k++) {
          var s = flipSeg(k === 0, FLIP.REST), mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2;
          if (Math.abs(b.x - mx) < FLIP.L * 0.55 && b.y > my - 150 - late && b.y < my + 40 && t[k] <= 0) { t[k] = 0.22; late = r() * 120 - 30; }
        }
      }
      hold[0] = t[0] > 0; hold[1] = t[1] > 0;
      S.input({ flip: hold });
    };
  }

  // ======================= Schnee-Schlacht: dodge along your line, throw straight ahead, walls wear down =======================
  var SNOW = { id: "snow", WIN: 5, serves: false, FY: H - 130, FR: 46, VF: 760, R: 16, V: 980, AMMO: 3, RELOAD: 0.9, WW: 150, WH: 44, HP: 3 };
  function snowWalls(seed) {   // the own half; the other half has the same ones turned around
    var out = [];
    for (var k = 0; k < 3; k++) out.push({ x: 170 + k * 330 + (unit(seed, "wall|x|" + k) - 0.5) * 90, y: H / 2 + 230 + unit(seed, "wall|y|" + k) * 140, hp: SNOW.HP });
    return out;
  }
  function inWall(b, w) { return w.hp > 0 && Math.abs(b.x - w.x) <= SNOW.WW / 2 + SNOW.R && Math.abs(b.y - w.y) <= SNOW.WH / 2 + SNOW.R; }
  function snowSide(o) {
    var N = SNOW, S = A._.base(N, o), aim = W / 2, throwIt = false, oppAmmo = N.AMMO, id = 0;
    var mine = snowWalls(S.seed), theirs = snowWalls(S.seed).map(function (w) { return { x: W - w.x, y: H - w.y, hp: w.hp }; });
    S.st = { me: { x: W / 2, vx: 0 }, opp: W / 2, ammo: N.AMMO, load: 0, balls: [], mine: mine, theirs: theirs };
    S.input = function (i) { if (!i) return; if (num(i.x)) aim = clamp(i.x, N.FR, W - N.FR); if (i.fire) throwIt = true; };
    S.tick = function (dt) {
      var st = S.st;
      A._.loop(S, dt, function (d) {
        var nx = reach(st.me.x, aim, d, N.VF); st.me.vx = (nx - st.me.x) / d; st.me.x = nx;
        if (st.ammo < N.AMMO) { st.load += d / N.RELOAD; if (st.load >= 1) { st.load = 0; st.ammo++; } }
        oppAmmo = Math.min(N.AMMO, oppAmmo + d / N.RELOAD);
        if (throwIt && S.started && st.ammo > 0) {
          st.ammo--; var b = { x: st.me.x, y: N.FY - N.FR, vx: clamp(st.me.vx * 0.25, -220, 220), vy: -N.V, mine: true, i: id++ };
          st.balls.push(b); S.send({ t: "throw", i: b.i, x: Math.round(W - b.x), vx: -b.vx }); S.fx("throw", b.x, b.y, { mine: true });
        }
        throwIt = false;
        for (var k = st.balls.length - 1; k >= 0; k--) {
          var b2 = st.balls[k]; b2.x += b2.vx * d; b2.y += b2.vy * d;
          if (b2.x < N.R || b2.x > W - N.R) { b2.vx = -b2.vx; b2.x = clamp(b2.x, N.R, W - N.R); }
          if (b2.y < -40 || b2.y > H + 40) { st.balls.splice(k, 1); continue; }
          if (b2.mine || b2.y < H / 2) continue;               // only what flies at this phone is decided here
          var w = null; st.mine.forEach(function (x, j) { if (w === null && inWall(b2, x)) w = j; });
          if (w !== null) { st.mine[w].hp--; st.balls.splice(k, 1); S.send({ t: "wall", i: b2.i, k: w }); S.fx("wall", b2.x, b2.y, { mine: true, hp: st.mine[w].hp }); continue; }
          if (Math.abs(b2.x - st.me.x) <= N.FR + N.R && Math.abs(b2.y - N.FY) <= N.FR + N.R) { st.balls.splice(k, 1); S.send({ t: "hit", i: b2.i }); S.fx("splat", st.me.x, N.FY, { mine: true }); S.concede(st.me.x, N.FY); if (S.over) return; }
        }
      });
      A._.report(S, function () { S.send({ t: "p", x: Math.round(W - st.me.x) }); });
    };
    S.receive = function (m) {
      var st = S.st; if (!m || S.over) return;
      if (m.t === "p" && num(m.x)) { st.opp = clamp(reach(st.opp, m.x, S.oppDt(Math.abs(m.x - st.opp), N.VF * 1.25), N.VF * 1.25), N.FR, W - N.FR); return; }
      if (m.t === "throw") {
        // A throw starts where the other figure can be, with the same speed for everyone, and only with a snowball in hand.
        if (!num(m.x) || !num(m.vx) || !num(m.i) || Math.abs(m.vx) > 221 || Math.abs(m.x - st.opp) > 260 || oppAmmo < 0.95) return S.reject();
        oppAmmo -= 1;
        st.balls.push({ x: m.x, y: H - N.FY + N.FR, vx: m.vx, vy: N.V, mine: false, i: m.i }); S.fx("throw", m.x, H - N.FY, { mine: false });
        return;
      }
      if (m.t === "wall" || m.t === "hit") {
        for (var k = st.balls.length - 1; k >= 0; k--) if (st.balls[k].mine && st.balls[k].i === m.i) { var b = st.balls[k]; st.balls.splice(k, 1); S.fx(m.t === "hit" ? "splat" : "wall", b.x, b.y, { mine: false }); }
        if (m.t === "wall" && num(m.k) && st.theirs[2 - m.k]) st.theirs[2 - m.k].hp = Math.max(0, st.theirs[2 - m.k].hp - 1);
        if (m.t === "hit") S.gain();
      }
    };
    return S;
  }
  function snowBot(S, r) {
    var wait = 0, want = W / 2, err = 0;
    return function (dt) {
      wait -= dt; if (wait > 0) return; wait = 0.12 + r() * 0.08;
      var st = S.st, me = st.me.x, danger = null;
      // Dodge the first ball that will reach the line here, else walk towards the other figure and throw.
      st.balls.forEach(function (b) { if (!b.mine && b.vy > 0) { var t = (SNOW.FY - b.y) / b.vy, x = b.x + b.vx * t; if (t < 0.9 && Math.abs(x - me) < SNOW.FR + 40 && (!danger || t < danger.t)) danger = { t: t, x: x }; } });
      if (danger && r() < 0.8) want = danger.x < W / 2 ? danger.x + SNOW.FR * 2 + 60 : danger.x - SNOW.FR * 2 - 60;
      else { if (r() < 0.2) err = (r() - 0.5) * 260; want = st.opp + err; }
      S.input({ x: want, fire: st.ammo > 0 && Math.abs(me - st.opp) < 160 && r() < 0.45 });
    };
  }

  // ======================= Elfer-Duell: shooter and keeper take turns; the keeper's phone decides =======================
  var ELF = { id: "elfer", WIN: 5, serves: false, R: 24, GY: 170, GW: 520, KY: 240, KW: 72, KDIVE: 115, VK: 950, VMAX: 2300, VMIN: 650, CMAX: 900, PAUSE: 1.4, LATE: 8 };
  function elfSpot(seed, n) { return { x: W / 2 + (unit(seed, "elf|spot|" + n) - 0.5) * 240, y: H * 0.64 }; }
  function elfShooter(n, serving) { return (n % 2 === 0) === !!serving; }   // the inviter shoots first
  function elfFly(b, d) { b.vx += b.c * d; b.x += b.vx * d; b.y += b.vy * d; }
  function elfSide(o) {
    var E = ELF, S = A._.base(E, o), aim = W / 2, shot = null, taken = [0, 0];   // shots taken: [this phone, the other]
    S.st = { n: 0, b: null, phase: "wait", at: 0, k: { x: W / 2, vx: 0 }, opp: W / 2, oppV: 0, spot: elfSpot(S.seed, 0), shooting: elfShooter(0, o.serving), res: "" };
    function next() { var st = S.st; st.n++; st.b = null; st.res = ""; st.phase = "aim"; st.at = S.t; st.spot = elfSpot(S.seed, st.n); st.shooting = elfShooter(st.n, o.serving); }
    S.start = function () { S.started = true; S.st.phase = "aim"; S.st.at = S.t; };
    // Over when one side cannot catch up any more, or after five each with a winner; then shot for shot.
    function decided() {
      var a = S.score[0], b = S.score[1], left0 = Math.max(0, 5 - taken[0]), left1 = Math.max(0, 5 - taken[1]);
      if (a + left0 < b || b + left1 < a) return true;
      return taken[0] >= 5 && taken[0] === taken[1] && a !== b;
    }
    function result(r) {   // both phones run this with the same r
      var st = S.st, x = st.b ? st.b.x : W / 2; st.res = r; st.phase = "done"; st.at = S.t;
      if (st.shooting) { taken[0]++; if (r === "goal") S.score[0]++; S.fx(r === "goal" ? "score" : r, x, E.GY); }
      else { taken[1]++; if (r === "goal") S.score[1]++; S.fx(r === "goal" ? "lose" : r === "save" ? "saved" : r, x, H - E.KY); }
      if (decided()) { S.over = true; S.fx(S.score[0] > S.score[1] ? "won" : "lost", W / 2, H / 2); }
    }
    S.input = function (i) { if (!i) return; if (num(i.x)) aim = clamp(i.x, W / 2 - E.GW / 2, W / 2 + E.GW / 2); if (i.shot) shot = i.shot; };
    S.tick = function (dt) {
      var st = S.st;
      A._.loop(S, dt, function (d) {
        var k = st.k, nx = reach(k.x, aim, d, E.VK); k.vx = (nx - k.x) / d; k.x = nx;
        if (!S.started) return;
        if (st.phase === "done" && S.t - st.at >= E.PAUSE) next();
        if (st.phase === "aim" && st.shooting) {
          if (!shot && S.t - st.at > E.LATE) shot = { vx: (unit(S.seed, "elf|late|" + st.n) - 0.5) * 300, vy: -900, c: 0 };   // too slow: a soft one goes off by itself
          if (shot && num(shot.vx) && num(shot.vy)) {
            var b = cap({ x: st.spot.x, y: st.spot.y, vx: shot.vx, vy: Math.min(-E.VMIN * 0.7, shot.vy) }, E.VMAX); b.c = clamp(num(shot.c) ? shot.c : 0, -E.CMAX, E.CMAX);
            st.b = b; st.phase = "fly"; S.send({ t: "shot", n: st.n, vx: -b.vx, vy: -b.vy, c: -b.c }); S.fx("kick", b.x, b.y);
          }
        }
        shot = null;
        var b2 = st.b; if (st.phase !== "fly" || !b2) return;
        if (st.shooting) { if (b2.y > E.KY + E.R) elfFly(b2, d); return; }   // the keeper over there decides; wait at its line
        elfFly(b2, d);
        var reachK = Math.abs(k.vx) > 700 ? E.KDIVE : E.KW;   // a fast keeper stretches into a dive
        if (b2.y >= H - E.KY - E.R && b2.y < H - E.KY + E.R && Math.abs(b2.x - k.x) <= reachK + E.R) { b2.vy = -Math.abs(b2.vy) * 0.4; b2.vx += (b2.x - k.x) * 4; S.send({ t: "res", n: st.n, r: "save" }); result("save"); return; }
        if (b2.y >= H - E.GY) { var r = Math.abs(b2.x - W / 2) <= E.GW / 2 - E.R ? "goal" : "miss"; S.send({ t: "res", n: st.n, r: r }); result(r); return; }
        if (b2.x < -E.R || b2.x > W + E.R) { S.send({ t: "res", n: st.n, r: "miss" }); result("miss"); }
      });
      A._.report(S, function () { S.send({ t: "p", x: Math.round(W - st.k.x), v: Math.round(-st.k.vx) }); });
    };
    S.receive = function (m) {
      var st = S.st; if (!m || S.over) return;
      if (m.t === "p" && num(m.x)) { st.opp = clamp(reach(st.opp, m.x, S.oppDt(Math.abs(m.x - st.opp), E.VK * 1.25), E.VK * 1.25), W / 2 - E.GW / 2, W / 2 + E.GW / 2); st.oppV = num(m.v) ? m.v : 0; return; }
      if (m.t === "shot") {
        if (st.shooting || st.phase === "fly" || m.n !== st.n || !num(m.vx) || !num(m.vy) || !num(m.c)) return S.reject();
        if (Math.hypot(m.vx, m.vy) > E.VMAX * 1.01 || m.vy < E.VMIN * 0.7 - 1 || Math.abs(m.c) > E.CMAX) return S.reject();
        var sp = elfSpot(S.seed, st.n); st.b = { x: W - sp.x, y: H - sp.y, vx: m.vx, vy: m.vy, c: m.c }; st.phase = "fly"; S.fx("kick", st.b.x, st.b.y);
        return;
      }
      if (m.t === "res" && m.n === st.n && st.shooting && st.phase === "fly" && ["goal", "save", "miss"].indexOf(m.r) >= 0) result(m.r);
    };
    return S;
  }
  function elfBot(S, r) {
    var wait = 0, plan = null;
    return function (dt) {
      var st = S.st; wait -= dt;
      if (st.shooting) {
        if (st.phase !== "aim") { plan = null; return; }
        if (!plan) plan = { at: 0.8 + r() * 1.6, side: r() < 0.5 ? -1 : 1, c: (r() - 0.5) * 900 };
        plan.at -= dt; if (plan.at > 0) return;
        var tx = W / 2 + plan.side * (ELF.GW / 2 - 40 - r() * 90), ty = ELF.GY, dx = tx - st.spot.x, dy = ty - st.spot.y, v = 1450 + r() * 600, l = Math.hypot(dx, dy);
        S.input({ shot: { vx: dx / l * v - plan.c * 0.35, vy: dy / l * v, c: plan.c } }); plan = null; return;
      }
      if (wait > 0) return; wait = 0.22 + r() * 0.12;   // a keeper needs a moment to read the shot
      var b = st.b;
      if (!b || st.phase !== "fly") { S.input({ x: W / 2 + (r() - 0.5) * 60 }); return; }
      var t = (H - ELF.KY - b.y) / Math.max(1, b.vy), x = b.x + b.vx * t + 0.5 * b.c * t * t;
      S.input({ x: x + (r() - 0.5) * 300 });
    };
  }

  // ======================= Turn-based discs: Eis-Stock and Murmel-Ring =======================
  // Both phones play every throw in one shared frame (the inviter's), with fixed steps and only + - * / and sqrt, so
  // the result is bit for bit the same on every device. The invited phone just draws that frame turned around.
  function discStep(D, list) {
    var dt = STEP, i, j, moving = false;
    for (i = 0; i < list.length; i++) {
      var s = list[i], v = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      if (v > 0) { var nv = v - D.DECEL * dt; if (nv <= D.STOP) { s.vx = 0; s.vy = 0; } else { s.vx = s.vx * nv / v; s.vy = s.vy * nv / v; moving = true; } }
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (D.SIDE) {
        if (s.x < s.r) { s.x = s.r; s.vx = -s.vx * 0.5; }
        if (s.x > W - s.r) { s.x = W - s.r; s.vx = -s.vx * 0.5; }
      }
    }
    for (i = 0; i < list.length; i++) for (j = i + 1; j < list.length; j++) {
      var a = list[i], b = list[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, min = a.r + b.r;
      if (d2 >= min * min || d2 === 0) continue;
      var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (min - d) / 2;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      var rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv < 0) { var jj = -(1 + D.E) * rv / 2; a.vx -= jj * nx; a.vy -= jj * ny; b.vx += jj * nx; b.vy += jj * ny; moving = true; a.hit = b.hit = -rv; }
    }
    return moving;
  }
  function turnSide(D, o) {
    var S = A._.base(D, o), me = o.serving ? 0 : 1, queue = [], acc = 0, throwIt = null;
    S.flip = me === 1;   // the invited phone draws the shared frame turned around
    S.me = me;
    S.st = { list: [], n: 0, turn: 0, rolling: false, at: 0, flip: S.flip };
    D.setup(S, S.st, 0);
    S.mineTurn = function () { return S.started && !S.over && !S.st.rolling && S.st.turn === me && !queue.length; };
    S.start = function () { S.started = true; S.st.at = S.t; };
    // Input arrives in the own frame and is turned into the shared one.
    S.input = function (i) {
      if (!i || !i.shot || !num(i.shot.vx) || !num(i.shot.vy)) return;
      var x = num(i.shot.x) ? i.shot.x : W / 2;
      throwIt = S.flip ? { x: W - x, vx: -i.shot.vx, vy: -i.shot.vy } : { x: x, vx: i.shot.vx, vy: i.shot.vy };
    };
    function launch(p, x, vx, vy) {
      var st = S.st, v = Math.sqrt(vx * vx + vy * vy);
      if (v > D.VMAX) { vx = vx * D.VMAX / v; vy = vy * D.VMAX / v; }
      D.launch(S, st, p, x, vx, vy); st.rolling = true; st.n++; S.fx("throw", x, p === 0 ? H - D.FROM : D.FROM, { p: p });
    }
    S.tick = function (dt) {
      var st = S.st; if (S.over) return;
      dt = Math.min(dt, 0.25); S.t += dt;
      if (S.started && !st.rolling && queue.length) { var q = queue.shift(); launch(q.p, q.x, q.vx, q.vy); }
      if (S.mineTurn()) {
        if (!throwIt && S.t - st.at > D.LATE) throwIt = D.late(S.seed, st.n, me);   // too slow: a soft one goes off by itself
        // Only towards the other side counts as a throw.
        if (throwIt && (me === 0 ? throwIt.vy < -D.VMIN : throwIt.vy > D.VMIN)) { var x = D.fromX(throwIt.x); S.send({ t: "throw", n: st.n, x: x, vx: throwIt.vx, vy: throwIt.vy }); launch(me, x, throwIt.vx, throwIt.vy); }
      }
      throwIt = null;
      if (!st.rolling) return;
      acc += dt;
      while (acc >= STEP && st.rolling) { acc -= STEP; if (!discStep(D, st.list)) { st.rolling = false; acc = 0; st.at = S.t; D.settle(S, st); } }
    };
    S.receive = function (m) {
      var st = S.st; if (!m || S.over || m.t !== "throw") return;
      var expect = st.n + queue.length, who = D.turnOf(st, expect);
      // The other one may throw only on its turn, from its own line, towards this side, and not harder than a hand can.
      if (m.n !== expect || who === me || !num(m.x) || !num(m.vx) || !num(m.vy) || m.x !== D.fromX(m.x) || Math.sqrt(m.vx * m.vx + m.vy * m.vy) > D.VMAX * 1.001 || (who === 0 ? m.vy > 0 : m.vy < 0)) return S.reject();
      queue.push({ p: who, x: m.x, vx: m.vx, vy: m.vy });
    };
    // Points in the shared frame: player 0 is the inviter; this phone counts itself first.
    S.point = function (p, k) { var mine = p === me; S.score[mine ? 0 : 1] += k || 1; S.fx(mine ? "score" : "lose", W / 2, H / 2, { n: k || 1 }); S.check(); };
    return S;
  }

  // Eis-Stock: three stones each per round, the stone closest to the middle wins the round; three round wins win.
  var STOCK = { id: "stock", WIN: 3, serves: false, R: 44, DECEL: 230, STOP: 6, E: 0.85, SIDE: true, VMAX: 1250, VMIN: 150, FROM: 150, PER: 3, LATE: 15, TX: W / 2, TY: H / 2, RINGS: [70, 150, 230] };
  STOCK.fromX = function () { return W / 2; };
  STOCK.setup = function (S, st, round) { st.list = []; st.round = round || 0; st.thrown = 0; st.first = st.round % 2; st.turn = st.first; st.base = st.n; st.at = S.t; };
  STOCK.turnOf = function (st, n) { return (st.first + (n - st.base)) % 2; };
  STOCK.launch = function (S, st, p, x, vx, vy) { st.list.push({ x: x, y: p === 0 ? H - STOCK.FROM : STOCK.FROM, vx: vx, vy: vy, r: STOCK.R, p: p }); st.thrown++; };
  STOCK.late = function (seed, n, me) { var vy = -(500 + unit(seed, "late|" + n) * 80); return { x: W / 2, vx: 0, vy: me === 0 ? vy : -vy }; };
  STOCK.settle = function (S, st) {
    st.list = st.list.filter(function (s) { return s.y > -s.r && s.y < H + s.r; });
    if (st.thrown < 2 * STOCK.PER) { st.turn = STOCK.turnOf(st, st.n); return; }
    var d = st.list.map(function (s) { return { p: s.p, d: Math.sqrt((s.x - STOCK.TX) * (s.x - STOCK.TX) + (s.y - STOCK.TY) * (s.y - STOCK.TY)) }; }).filter(function (x) { return x.d < 300; }).sort(function (a, b) { return a.d - b.d; });
    var win = d.length ? d[0].p : -1;
    if (win >= 0) S.point(win, 1); else S.fx("draw", W / 2, H / 2);
    if (S.over) return;
    st.last = st.list.slice();
    STOCK.setup(S, st, st.round + 1);
  };

  // Murmel-Ring: knock the glass marbles out of the ring; the ring shrinks a little every two shots.
  var MURMEL = { id: "murmel", WIN: 5, serves: false, R: 26, DECEL: 160, STOP: 5, E: 0.95, SIDE: false, VMAX: 1500, VMIN: 150, FROM: 300, LATE: 15, RING: 360, SHRINK: 14, NM: 9 };
  MURMEL.fromX = function (x) { return Math.round(clamp(num(x) ? x : W / 2, W / 2 - 260, W / 2 + 260)); };
  MURMEL.ring = function (n) { return Math.max(250, MURMEL.RING - Math.floor(n / 2) * MURMEL.SHRINK); };
  MURMEL.setup = function (S, st) {
    st.list = []; st.turn = 0; st.r = MURMEL.RING;
    for (var k = 0; k < MURMEL.NM; k++) {   // a cross of marbles, nudged by the seed
      var a = k === 0 ? 0 : (k - 1) % 4 * Math.PI / 2, d = k === 0 ? 0 : (k < 5 ? 95 : 190);
      st.list.push({ x: W / 2 + Math.cos(a) * d + (unit(S.seed, "m|x|" + k) - 0.5) * 30, y: H / 2 + Math.sin(a) * d + (unit(S.seed, "m|y|" + k) - 0.5) * 30, vx: 0, vy: 0, r: MURMEL.R, p: 2, c: k });
    }
  };
  MURMEL.turnOf = function (st, n) { return n % 2; };
  MURMEL.launch = function (S, st, p, x, vx, vy) { st.list.push({ x: x, y: p === 0 ? H / 2 + st.r + 80 : H / 2 - st.r - 80, vx: vx, vy: vy, r: MURMEL.R + 4, p: p, shooter: true }); st.by = p; };
  MURMEL.late = function (seed, n, me) { var vy = -(900 + unit(seed, "late|" + n) * 200); return { x: W / 2, vx: 0, vy: me === 0 ? vy : -vy }; };
  MURMEL.settle = function (S, st) {
    var out = 0, keep = [];
    st.list.forEach(function (s) {
      if (s.shooter) return;
      var dx = s.x - W / 2, dy = s.y - H / 2;
      if (dx * dx + dy * dy > st.r * st.r) { out++; S.fx("out", s.x, s.y, { c: s.c }); } else keep.push(s);
    });
    st.list = keep;
    if (out) S.point(st.by, out);
    st.r = MURMEL.ring(st.n); st.turn = st.n % 2;
    if (!S.over && !keep.length) { S.over = true; S.fx(S.score[0] > S.score[1] ? "won" : "lost", W / 2, H / 2); }
  };

  // Bots for the turn games aim by trying throws in the shared simulation, with an error from their dice.
  function tryThrow(D, S, x, vx, vy) {
    var st = S.st, list = st.list.map(function (s) { return { x: s.x, y: s.y, vx: s.vx, vy: s.vy, r: s.r, p: s.p, shooter: s.shooter }; });
    D.launch(S, { list: list, r: st.r, thrown: 0 }, S.me, x, vx, vy);
    for (var i = 0; i < 2400 && discStep(D, list); i++);
    return list;
  }
  function stockBot(S, r) {
    var wait = 1;
    return function (dt) {
      if (!S.mineTurn()) { wait = 0.9 + r() * 0.9; return; }
      wait -= dt; if (wait > 0) return;
      var best = null, sign = S.me === 0 ? -1 : 1;
      for (var k = 0; k < 7; k++) {
        var vx = (r() - 0.5) * 120, vy = sign * (470 + r() * 180), list = tryThrow(STOCK, S, W / 2, vx, vy), mine = list[list.length - 1];
        var dd = Math.hypot(mine.x - STOCK.TX, mine.y - STOCK.TY); if (!best || dd < best.d) best = { d: dd, vx: vx, vy: vy };
      }
      var e = 1 + (r() - 0.5) * 0.12;   // a hand is never exact
      S.input({ shot: S.flip ? { vx: -best.vx * e, vy: -best.vy * e } : { vx: best.vx * e, vy: best.vy * e } }); wait = 1;
    };
  }
  function murmelBot(S, r) {
    var wait = 1;
    return function (dt) {
      if (!S.mineTurn()) { wait = 0.9 + r() * 0.9; return; }
      wait -= dt; if (wait > 0) return;
      var st = S.st, targets = st.list.filter(function (s) { return !s.shooter; }), t = targets[Math.floor(r() * targets.length)] || { x: W / 2, y: H / 2 };
      var fx = MURMEL.fromX(t.x + (r() - 0.5) * 200), fy = S.me === 0 ? H / 2 + st.r + 80 : H / 2 - st.r - 80, dx = t.x - fx, dy = t.y - fy, l = Math.hypot(dx, dy) || 1, v = 900 + r() * 500, e = (r() - 0.5) * 0.18;
      var vx = (dx / l) * v + e * v, vy = (dy / l) * v;
      S.input({ shot: S.flip ? { x: W - fx, vx: -vx, vy: -vy } : { x: fx, vx: vx, vy: vy } }); wait = 1;
    };
  }

  [{ id: "kick", rules: KICK, side: kickSide, bot: kickBot }, { id: "flipper", rules: FLIP, side: flipSide, bot: flipBot }, { id: "snow", rules: SNOW, side: snowSide, bot: snowBot },
    { id: "elfer", rules: ELF, side: elfSide, bot: elfBot }, { id: "stock", rules: STOCK, side: function (o) { return turnSide(STOCK, o); }, bot: stockBot },
    { id: "murmel", rules: MURMEL, side: function (o) { return turnSide(MURMEL, o); }, bot: murmelBot }].forEach(A.add);
  A.KICK = KICK; A.FLIP = FLIP; A.SNOW = SNOW; A.ELF = ELF; A.STOCK = STOCK; A.MURMEL = MURMEL;
  A.kickRods = kickRods; A.flipSeg = flipSeg; A.flipBumpers = flipBumpers; A.snowWalls = snowWalls; A.elfSpot = elfSpot; A.elfShooter = elfShooter; A.discStep = discStep;
  if (typeof module !== "undefined" && module.exports) module.exports = A;
})(typeof globalThis !== "undefined" ? globalThis : this);
