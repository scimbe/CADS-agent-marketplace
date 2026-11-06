// A bad mobile network for the real-time duels, and what the receiving screen shows on it. Two arcade sides play with
// their bots; every message goes through a reliable, ordered channel like the WebRTC data channel in live.js: a lost
// packet is not missing but comes later (resent after rto) and holds up everything behind it. One stall lets nothing
// through for a while. Measured on side A, per drawn frame, against where side B really has things at that moment.
"use strict";

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// o: { base, jitter, loss, rto, stall: [from, to] } in seconds.
function channel(r, o) {
  let last = 0; const q = [];
  return {
    send(now, m) {
      let at = now + Math.max(0.005, o.base + (r() * 2 - 1) * o.jitter);
      if (r() < o.loss) at += o.rto;                                                  // resent once the loss is noticed
      if (o.stall && at > o.stall[0] && now < o.stall[1]) at = Math.max(at, o.stall[1] + o.base * 0.5);
      at = Math.max(at, last); last = at;                                             // ordered: nothing overtakes
      q.push([at, JSON.stringify(m)]);
    },
    due(now, fn) { while (q.length && q[0][0] <= now) fn(JSON.parse(q.shift()[1])); }
  };
}

class Meter {
  // strict: also count steps over 1.6 x top speed per frame (teleports of 400 and more, serves and hand-offs, left out)
  constructor(vmax, strict) { this.lim = vmax / 60 * 1.5; this.slim = strict ? strict / 60 * 1.6 : Infinity; this.n = 0; this.jump = 0; this.strict = 0; this.still = 0; this.jerk = 0; this.err = 0; this.p = null; this.d = null; }
  add(p, real) {   // p, real: { x, y } of what is drawn and where it really is
    if (this.p) {
      const d = Math.hypot(p.x - this.p.x, p.y - this.p.y), rd = Math.hypot(real.x - this.r.x, real.y - this.r.y);
      this.n++; if (d > this.lim) this.jump++; if (d > this.slim && d < 400) this.strict++;
      if (d < 0.5 && rd > 2) this.still++;
      if (this.d !== null) this.jerk += Math.abs(d - this.d);
      this.err += Math.hypot(p.x - real.x, p.y - real.y); this.d = d;
    }
    this.p = p; this.r = real;
  }
  cut() { this.p = null; this.d = null; }
  sum() { const n = Math.max(1, this.n); return { frames: this.n, strict: this.strict, jump: this.jump / n, still: this.still / n, jerk: this.jerk / n, err: this.err / n }; }
}
// Where side B really has its own figure, in A's frame.
const REAL = {
  puck: (B, A) => ({ x: A.W - B.st.me.x, y: A.H - B.st.me.y }),
  volley: (B, A) => ({ x: A.W - B.st.me.x, y: B.st.me.y }),
  ziegel: (B, A) => ({ x: A.W - B.st.me, y: 0 }),
  kick: (B, A) => ({ x: A.W - B.st.c, y: 0 }),
  snow: (B, A) => ({ x: A.W - B.st.me.x, y: 0 })
};
const SHOWN = {
  puck: (st) => ({ x: st.opp.x, y: st.opp.y }), volley: (st) => ({ x: st.opp.x, y: st.opp.y }),
  ziegel: (st) => ({ x: st.opp, y: 0 }), kick: (st) => ({ x: st.opp, y: 0 }), snow: (st) => ({ x: st.opp, y: 0 })
};
const VFIG = { puck: (A) => A.PUCK.MMAX, volley: (A) => A.VOLLEY.JUMP, ziegel: (A) => A.ZIEGEL.PMAX, kick: (A) => A.KICK.RMAX, snow: (A) => A.SNOW.VF };
const BALL = { puck: "p", volley: "b", ziegel: "b", kick: "b" };

// The bot game of g over the channel. Smooth: the module for the smoothed picture, or null for the plain one.
// Per watched thing: jump (share of frames with a step neither figure nor ball can make), still (share of frames that
// show no change while the real thing moved), jerk (mean change of the step per frame) and err (mean distance to the
// real position: the price of waiting for data).
function play(A, Smooth, g, o) {
  const r = rng(o.seed || 7), dt = 1 / 60, secs = o.secs || 60, ab = channel(r, o), ba = channel(r, o);
  let now = 0;
  const clock = () => now;   // both phones' real clocks; the network sim has its own time
  const SA = A.side(g, { seed: "net|" + g, serving: true, clock, send: (m) => ab.send(now, m) });
  const SB = A.side(g, { seed: "net|" + g, serving: false, clock, send: (m) => ba.send(now, m) });
  // when A last got a position report: frames more than 0.1 s after it have no new data
  let heard = 0; const rec = SA.receive; SA.receive = (m) => { if (m && m.t === "p") heard = now; rec(m); };
  const botA = A.bot(g, SA, "na"), botB = A.bot(g, SB, "nb"), V = Smooth ? Smooth.view(A, g, SA, clock) : null;
  const flip = g === "volley" ? (p) => ({ x: A.W - p.x, y: p.y }) : (p) => ({ x: A.W - p.x, y: A.H - p.y });
  const fig = new Meter(VFIG[g](A)), ball = new Meter(A.GAMES[g].rules.VMAX * 1.6), whole = new Meter(A.GAMES[g].rules.VMAX * 1.6, A.GAMES[g].rules.VMAX);
  let frames = 0, empty = 0;
  SA.start(); SB.start();
  for (let f = 0; f < secs * 60 && !SA.over && !SB.over; f++) {
    now += dt;
    ba.due(now, (m) => SA.receive(m)); ab.due(now, (m) => SB.receive(m));
    botA(dt); botB(dt); SA.tick(dt); SB.tick(dt); SA.ev.length = 0; SB.ev.length = 0;
    const shown = V ? V.frame(dt) : SA;
    frames++; if (now - heard > 0.1) empty++;
    fig.add(SHOWN[g](shown.st), REAL[g](SB, A));
    const k = BALL[g], bA = k && shown.st[k], bB = k && SB.st[k];
    // the ball while the other phone moves it (in the Ziegel-Duell: while it flies away from A)
    const theirs = k && (g === "ziegel" ? bB && bB.vy > 0 : SB.st.own && !SA.st.own);
    if (bA && bB && theirs) ball.add({ x: bA.x, y: bA.y }, flip(bB)); else ball.cut();
    // the ball the whole rally through, hand-overs and releases at the middle line included: real is whoever decides
    const raw = k && SA.st[k], mine = raw && (g === "ziegel" ? raw.vy > 0 : SA.st.own);
    if (bA && bB) whole.add({ x: bA.x, y: bA.y }, mine ? { x: raw.x, y: raw.y } : flip(bB)); else whole.cut();
  }
  return { fig: fig.sum(), ball: ball.sum(), whole: whole.sum(), empty: empty / Math.max(1, frames), score: SA.score.slice(), t: SA.t };
}
const BAD = { base: 0.15, jitter: 0.08, loss: 0.05, rto: 0.25, stall: [20, 20.5] };
module.exports = { play, channel, rng, BAD, GAMES: Object.keys(REAL) };
