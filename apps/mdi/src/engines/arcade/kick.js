// Stangen-Kick: zwei Stangen je Spieler, ein Finger bewegt beide, Tippen kickt. Port von alt:src/arcade2.js:72-118.
import { W, H, clamp, num, cap, reach, speed, base, send, startBase, oppDt, loop, report, halfInit, halfStep, halfReport, halfReceive, bounce, tableWalls } from "./core.js";
import { unit } from "./num.js";

export const KICK = { id: "kick", WIN: 3, serves: true, R: 26, FR: 30, GOAL: 320, VMAX: 2300, FRIC: 0.25, RMAX: 2400, KY: H - 190, SY: H - 600, GAP: 280, KICK: 0.18, KV: 1500 };
export function kickServe(seed, n) { const u = unit(seed, "kick|serve|" + n); return { x: W / 2 + (u - 0.5) * 240, y: H * 0.56, vx: (u - 0.5) * 80, vy: 60 }; }
/** c: wohin der Finger die Stangen geschoben hat; der Torwart bleibt vor dem Tor. */
export function kickRods(c) {
  const k = clamp(W / 2 + (c - W / 2) * 0.6, W / 2 - 150, W / 2 + 150);
  return [{ x: k, y: KICK.KY }, { x: c - KICK.GAP, y: KICK.SY }, { x: c, y: KICK.SY }, { x: c + KICK.GAP, y: KICK.SY }];
}
export function kickClamp(c) { return clamp(c, KICK.GAP + 40, W - KICK.GAP - 40); }
const BALL = { serve: kickServe, R: KICK.R, VMAX: KICK.VMAX, free: (b, d) => tableWalls(b, d, KICK.R, KICK.GOAL, KICK.FRIC) };

export function init(o) {
  const S = base(KICK, o);
  S.st = { c: W / 2, cv: 0, kick: 0, opp: W / 2, oppKick: 0 };
  halfInit(S);
  S.h.aim = W / 2; S.h.kickAt = -9;
  return S;
}
export function start(S) { startBase(S, KICK); }
export function input(S, i) { if (!i) return; if (num(i.x)) S.h.aim = kickClamp(i.x); if (i.kick && S.t - S.h.kickAt > 0.35) S.h.kickAt = S.t; }
export function tick(S) {
  const K = KICK, st = S.st;
  loop(S, (d) => {
    const c = reach(st.c, S.h.aim, d, K.RMAX); st.cv = (c - st.c) / d; st.c = c;
    st.kick = clamp(1 - (S.t - S.h.kickAt) / K.KICK, 0, 1);
    halfStep(S, BALL, K, d, (b) => {
      const rods = kickRods(st.c); let hit = false;
      rods.forEach((f, i) => { if (bounce(b, K.R, f, K.FR, i ? st.cv : st.cv * 0.6, -K.KV * st.kick, 0.8)) hit = true; });
      if (hit) { if (st.kick > 0) b.vy = Math.min(b.vy, -K.KV * 0.8); cap(b, K.VMAX); b.x = clamp(b.x, K.R, W - K.R); }
      return hit && (st.kick > 0 ? "kick" : true);
    });
  });
  report(S, () => send(S, { t: "p", c: Math.round(W - st.c), k: st.kick > 0 ? 1 : 0 }), halfReport(S));
}
export function receive(S, m) {
  const K = KICK, st = S.st; if (!m || S.over) return;
  if (m.t === "p" && num(m.c)) { st.opp = clamp(reach(st.opp, m.c, oppDt(S, Math.abs(m.c - st.opp), K.RMAX * 1.25), K.RMAX * 1.25), K.GAP + 40, W - K.GAP - 40); st.oppKick = m.k ? 1 : 0; }
  else halfReceive(S, BALL, K, m, (b) => kickRods(st.opp).some((f) => { const y = H - f.y; return Math.abs(b.x - f.x) <= K.R + K.FR + 450 && Math.abs(b.y - y) <= K.R + K.FR + 120; }));
}

// ---------- Bot (arcade2.js:106-118) ----------
export function botInit() { return { wait: 0, err: 0 }; }
export function bot(S, B, r, dt) {
  B.wait -= dt; if (B.wait > 0) return; B.wait = 0.11 + r() * 0.06;
  const st = S.st, b = st.b;
  if (!b) { input(S, { x: W / 2 }); return; }
  const rodY = b.y < KICK.SY + 60 ? KICK.SY : KICK.KY, off = rodY === KICK.SY ? [-KICK.GAP, 0, KICK.GAP] : [0];
  let best = 0, bd = 1e9;
  off.forEach((o) => { const d = Math.abs(st.c + o - b.x); if (d < bd) { bd = d; best = o; } });
  if (r() < 0.3) B.err = (r() - 0.5) * (40 + speed(b) * 0.08);
  input(S, { x: b.x - best + B.err, kick: st.own && Math.abs(b.y - rodY) < 90 && bd < 70 && r() < 0.7 });
}
export const rules = KICK;
