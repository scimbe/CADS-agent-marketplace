// Schlechtes Mobilnetz fuer die Echtzeit-Duelle (Port von alt:test/netsim.js channel/rng): zuverlaessiger, geordneter
// Kanal wie der WebRTC-Datenkanal; ein verlorenes Paket kommt nach rto, ein Aussetzer laesst eine Weile nichts durch.
import * as A from "../src/engines/arcade/index.js";

export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function channel(r, o) {
  let last = 0; const q = [];
  return {
    send(now, m) {
      let at = now + Math.max(0.005, o.base + (r() * 2 - 1) * o.jitter);
      if (r() < o.loss) at += o.rto;
      if (o.stall && at > o.stall[0] && now < o.stall[1]) at = Math.max(at, o.stall[1] + o.base * 0.5);
      at = Math.max(at, last); last = at;
      q.push([at, JSON.stringify(m)]);
    },
    due(now, fn) { while (q.length && q[0][0] <= now) fn(JSON.parse(q.shift()[1])); }
  };
}
export const BAD = { base: 0.15, jitter: 0.08, loss: 0.05, rto: 0.25, stall: [20, 20.5] };

/** Eine Seite wie alt A.side(g, o) mit send/clock: tick(dt) rechnet so viele 1/120-Schritte wie alt loop() (dt <= 0.25). */
export function Side(g, o) {
  const S = A.side(g, o);
  const W = {
    S,
    get st() { return S.st; }, get score() { return S.score; }, get rejected() { return S.rejected; }, get over() { return S.over; }, get draw() { return S.draw; }, get t() { return S.t; }, get g() { return S.g; },
    start() { A.start(S); },
    input(i) { A.input(S, i); },
    receive(m) { if (o.clock) S.wall = o.clock(); A.receive(S, m); W.flush(); },
    tick(dt) {
      const n = Math.max(1, Math.round(Math.min(dt, 0.25) * 120));
      for (let i = 0; i < n; i++) { if (o.clock) S.wall = o.clock(); A.tick(S); W.flush(); }
    },
    flush() { const out = S.out; S.out = []; S.ev = []; for (const m of out) if (o.send) o.send(JSON.parse(JSON.stringify(m))); }
  };
  return W;
}
export function Bot(g, W, seed) { const B = A.botNew(g, seed); return (dt) => A.botStep(W.S, B, dt); }
