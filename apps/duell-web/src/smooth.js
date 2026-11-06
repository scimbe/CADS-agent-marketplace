/* Smooth drawing of what comes over the network in the real-time duels (pure, no DOM). Only the picture changes: what
   the rules decide (hit, miss, point) stays as it was, so this never makes anyone lose or win a point.
   - track(): the other player's figure. Samples carry the sender's own clock, sit in a small jitter buffer whose delay
     follows the measured jitter, are interpolated in between, carried on for a moment at the last speed when data stops,
     and a jump after a gap is faded out instead of snapping.
   - view(): wraps one arcade side for the screen: the figure through track(), the ball that the other phone moves
     without a snap when its state arrives, and briefly carried on while it waits at the middle line. */
(function (root) {
  "use strict";
  var FADE = 0.12;   // seconds for a correction to fade out

  function track(dim, o) {
    o = o || {};
    var EX = o.extrap == null ? 0.15 : o.extrap, MIN = o.min == null ? 0.04 : o.min, MAX = o.max == null ? 0.3 : o.max;
    var buf = [], off = null, offV = null, late = 0, dev = 0.01, gap = 0.05, delay = 0.1, out = null, at0 = null;
    var lo = o.lo || [], hi = o.hi || [];   // the field: carrying on never leaves it
    // local: arrival time in seconds; sender: the sender's clock in seconds (null: none sent, the arrival time stands in).
    function push(local, sender, v) {
      var s = sender == null ? local : sender;
      if (buf.length && s <= buf[buf.length - 1].s) return;   // old or doubled: the newer one is there already
      var o1 = local - s;
      if (off === null || o1 < off) off = o1; else off += (o1 - off) * 0.002;   // the fastest path seen, drifting slowly
      var ex = o1 - off;                                                       // how much later than that this one came
      late += (ex - late) * 0.1; dev += (Math.abs(ex - late) - dev) * 0.1;
      if (buf.length) gap += (Math.min(0.5, s - buf[buf.length - 1].s) - gap) * 0.1;
      buf.push({ s: s, v: v.slice() }); if (buf.length > 64) buf.shift();
    }
    function raw(t) {
      var n = buf.length;
      if (t <= buf[0].s) return { v: buf[0].v.slice(), fresh: true };
      for (var i = n - 1; i > 0; i--) {
        if (buf[i - 1].s <= t) {
          if (t > buf[i].s) break;
          var a = buf[i - 1], b = buf[i], k = (t - a.s) / (b.s - a.s || 1);
          return { v: a.v.map(function (x, j) { return x + (b.v[j] - x) * k; }), fresh: true };
        }
      }
      // Beyond the newest sample: carry on with the last speed for a moment (EX at most), then hold; never off the field.
      var L = buf[n - 1], P = n > 1 ? buf[n - 2] : L, span = L.s - P.s || 1, dt = Math.min(t - L.s, EX);
      return { v: L.v.map(function (x, j) { var y = x + (x - P.v[j]) / span * dt; if (lo[j] != null) y = Math.max(lo[j], y); if (hi[j] != null) y = Math.min(hi[j], y); return y; }), fresh: false };
    }
    // local: now in seconds; vmax[j]: how far dimension j can move per second (beyond that a change counts as a jump).
    function at(local, vmax) {
      if (!buf.length) return null;
      var dt = at0 === null ? 0 : Math.max(0, local - at0); at0 = local;
      var want = Math.min(MAX, Math.max(MIN, late + 2.5 * dev + gap));
      delay += (want - delay) * Math.min(1, dt * 2);   // the delay follows slowly, so the figure never visibly speeds up
      // A faster packet moves the clock offset at once; the playback follows it at most 10 % faster or slower.
      offV = offV === null ? off : offV + Math.max(-0.1 * dt, Math.min(0.1 * dt, off - offV));
      var r = raw(local - offV - delay);
      // Where the data jumps (after a gap), the picture does not: it catches up a little faster than the figure can
      // move, so every drawn step stays one the figure could really make.
      out = out ? out.map(function (x, j) { var lim = (vmax ? vmax[j] : Infinity) * Math.max(dt, 0.001) * 1.4, d = r.v[j] - x; return Math.abs(d) > lim ? x + Math.sign(d) * lim : r.v[j]; }) : r.v.slice();
      return { v: out.slice(), fresh: r.fresh, delay: delay };
    }
    return { push: push, at: at, state: function () { return { delay: delay, late: late, dev: dev, gap: gap, n: buf.length }; } };
  }

  // Which numbers of a side's state are the other player's figure, how fast they can move, and which field is the ball.
  function figure(A) {
    return {
      puck: { get: function (s) { return [s.opp.x, s.opp.y]; }, set: function (s, v) { s.opp = { x: v[0], y: v[1] }; }, vmax: [A.PUCK.MMAX, A.PUCK.MMAX], lo: [A.PUCK.MR, A.PUCK.MR], hi: [A.W - A.PUCK.MR, A.H / 2 - A.PUCK.MR], ball: "p" },
      ziegel: { get: function (s) { return [s.opp]; }, set: function (s, v) { s.opp = v[0]; }, vmax: [A.ZIEGEL.PMAX], lo: [A.ZIEGEL.PW / 2], hi: [A.W - A.ZIEGEL.PW / 2], ball: "b" },
      volley: { get: function (s) { return [s.opp.x, s.opp.y]; }, set: function (s, v) { s.opp = { x: v[0], y: v[1] }; }, vmax: [A.VOLLEY.VMOVE, A.VOLLEY.JUMP], lo: [A.VOLLEY.NX + A.VOLLEY.NW + A.VOLLEY.PRAD, A.VOLLEY.FY - A.VOLLEY.PRAD - 340], hi: [A.W - A.VOLLEY.PRAD, A.VOLLEY.FY - A.VOLLEY.PRAD], ball: "b" },
      kick: { get: function (s) { return [s.opp, s.oppKick]; }, set: function (s, v) { s.opp = v[0]; s.oppKick = v[1]; }, vmax: [A.KICK.RMAX, 1e9], lo: [A.KICK.GAP + 40, 0], hi: [A.W - A.KICK.GAP - 40, 1], ball: "b" },
      flipper: { get: function (s) { return [s.opp[0], s.opp[1]]; }, set: function (s, v) { s.opp = [v[0], v[1]]; }, vmax: [A.FLIP.SPIN, A.FLIP.SPIN], lo: [A.FLIP.UP, A.FLIP.UP], hi: [A.FLIP.REST, A.FLIP.REST], ball: "b" },
      snow: { get: function (s) { return [s.opp]; }, set: function (s, v) { s.opp = v[0]; }, vmax: [A.SNOW.VF], lo: [A.SNOW.FR], hi: [A.W - A.SNOW.FR] },
      elfer: { get: function (s) { return [s.opp, s.oppV || 0]; }, set: function (s, v) { s.opp = v[0]; s.oppV = v[1]; }, vmax: [A.ELF.VK, 1e9], lo: [A.W / 2 - A.ELF.GW / 2], hi: [A.W / 2 + A.ELF.GW / 2], ball: "b" },
      panzer: { get: function (s) { return [s.oppAim.vx, s.oppAim.vy]; }, set: function (s, v) { s.oppAim = { vx: v[0], vy: v[1] }; }, vmax: [1e9, 1e9], lo: [-A.PANZER.VSHOT, -A.PANZER.VSHOT], hi: [A.PANZER.VSHOT, A.PANZER.VSHOT] }
    };
  }
  // One side for the screen. now(): seconds. Returns { frame(dt) -> a stand-in for the side to draw }.
  function view(A, g, S, now) {
    var F = figure(A)[g]; if (!F) return { frame: function () { return S; }, track: null };
    var T = track(F.get(S.st).length, { lo: F.lo, hi: F.hi }), fix = { x: 0, y: 0 }, wait = 0, rec = S.receive;
    S.receive = function (m) {
      var key = F.ball, b0 = key && S.st[key] ? { x: S.st[key].x, y: S.st[key].y } : null;
      rec(m);
      if (!m) return;
      if (m.t === "p" || m.t === "shot") T.push(now(), typeof m.ms === "number" && isFinite(m.ms) ? m.ms / 1000 : null, F.get(S.st));
      // The other phone's ball state replaces the one flown along here: keep the picture where it was and fade over.
      var b1 = key && S.st[key];
      if (b0 && b1 && (m.t === "st" || m.t === "hit" || m.t === "pass")) {
        var dx = b0.x - b1.x, dy = b0.y - b1.y;
        if (dx * dx + dy * dy < 400 * 400) { fix.x += dx; fix.y += dy; }
      }
    };
    return {
      track: T,
      frame: function (dt) {
        var st = Object.assign({}, S.st), r = T.at(now(), F.vmax);
        if (r) F.set(st, r.v);
        var b = F.ball && S.st[F.ball], f = Math.exp(-dt / FADE);
        fix.x *= f; fix.y *= f;
        if (!b) { fix.x = fix.y = 0; wait = 0; }
        else {
          // Waiting at the middle line for the hand-over: carry the ball on for a moment instead of freezing it.
          wait = S.st.held ? wait + dt : 0;
          var go = Math.min(wait, 0.1);
          st[F.ball] = Object.assign({}, b, { x: b.x + fix.x + b.vx * go, y: b.y + fix.y + b.vy * go });
        }
        var v = Object.create(S); v.st = st;
        return v;
      }
    };
  }

  var api = { track: track, view: view, figure: figure, FADE: FADE };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Smooth = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
