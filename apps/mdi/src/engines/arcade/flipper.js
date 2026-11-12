// Flipper-Duell (Variante von Stangen-Kick): zwei Klappen bewachen jedes Ende, Bumper aus dem Seed in der Mitte.
// Port von alt:src/arcade2.js:120-193.
import { W, H, clamp, num, cap, reach, speed, base, send, startBase, loop, report, halfInit, halfStep, halfReport, halfReceive, bounce } from "./core.js";
import { unit, hash32, sinD, cosD, PI } from "./num.js";

export const FLIP = { id: "flipper", WIN: 5, serves: true, R: 20, VMAX: 1500, VMIN: 620, PX: 150, PY: H - 230, L: 300, T: 13, REST: 0.52, UP: -0.5, SPIN: 24, NB: 3, BR: 38, LANE: H - 470 };
export function flipServe(seed, n) { const a = (hash32(seed + "|flip|serve|" + n) % 61 - 30) * PI / 180; return { x: W / 2, y: H / 2, vx: sinD(a) * 700, vy: -cosD(a) * 700 }; }
export function flipBumpers(seed) {
  const out = [];
  for (let k = 0; k < FLIP.NB; k++) out.push({ x: 200 + k * 300 + (unit(seed, "bump|x|" + k) - 0.5) * 120, y: H / 2 + 170 + unit(seed, "bump|y|" + k) * 260 });
  return out;
}
/** Klappe als Strecke vom Drehpunkt zur Spitze; a = Winkel unter der Waagerechten. */
export function flipSeg(left, a) {
  const px = left ? FLIP.PX : W - FLIP.PX, dir = left ? 1 : -1;
  return { ax: px, ay: FLIP.PY, bx: px + dir * cosD(a) * FLIP.L, by: FLIP.PY + sinD(a) * FLIP.L };
}
export function segHit(b, s, R, T, w, px, py, e) {
  const vx = s.bx - s.ax, vy = s.by - s.ay, l2 = vx * vx + vy * vy, k = clamp(((b.x - s.ax) * vx + (b.y - s.ay) * vy) / l2, 0, 1);
  const qx = s.ax + vx * k, qy = s.ay + vy * k, dx = b.x - qx, dy = b.y - qy, d = Math.sqrt(dx * dx + dy * dy);
  if (d >= R + T) return false;
  const nx = d ? dx / d : 0, ny = d ? dy / d : -1;
  b.x = qx + nx * (R + T); b.y = qy + ny * (R + T);
  const svx = -w * (qy - py), svy = w * (qx - px), rv = (b.vx - svx) * nx + (b.vy - svy) * ny;
  if (rv < 0) { b.vx -= (1 + e) * rv * nx; b.vy -= (1 + e) * rv * ny; }
  return true;
}
function flipFree(b, d) {
  const R = FLIP.R; let hit = "";
  b.x += b.vx * d; b.y += b.vy * d;
  if (b.x < R) { b.x = 2 * R - b.x; b.vx = Math.abs(b.vx); hit = "wall"; }
  if (b.x > W - R) { b.x = 2 * (W - R) - b.x; b.vx = -Math.abs(b.vx); hit = "wall"; }
  return hit;
}
const BALL = { serve: flipServe, R: FLIP.R, VMAX: FLIP.VMAX, free: flipFree };
const LANES = [{ ax: 0, ay: FLIP.LANE, bx: FLIP.PX, by: FLIP.PY }, { ax: W, ay: FLIP.LANE, bx: W - FLIP.PX, by: FLIP.PY }];

export function init(o) {
  const F = FLIP, S = base(F, o);
  S.st = { a: [F.REST, F.REST], w: [0, 0], opp: [F.REST, F.REST], bumps: flipBumpers(S.seed), lit: [0, 0, 0] };
  halfInit(S);
  S.h.hold = [false, false];
  return S;
}
export function start(S) { startBase(S, FLIP); }
export function input(S, i) { if (i && i.flip) { S.h.hold = [!!i.flip[0], !!i.flip[1]]; } }
export function tick(S) {
  const F = FLIP, st = S.st, bumps = st.bumps;
  loop(S, (d) => {
    for (let k = 0; k < 2; k++) { const to = S.h.hold[k] ? F.UP : F.REST, na = reach(st.a[k], to, d, F.SPIN); st.w[k] = (na - st.a[k]) / d; st.a[k] = na; }
    for (let j = 0; j < 3; j++) st.lit[j] = Math.max(0, st.lit[j] - d * 3);
    halfStep(S, BALL, F, d, (b) => {
      let hit = false;
      for (let k = 0; k < 2; k++) if (segHit(b, flipSeg(k === 0, st.a[k]), F.R, F.T, k === 0 ? st.w[k] : -st.w[k], k === 0 ? F.PX : W - F.PX, F.PY, 0.55)) hit = "flip";
      for (let l = 0; l < 2; l++) if (segHit(b, LANES[l], F.R, 6, 0, 0, 0, 0.5)) hit = hit || "wall";
      bumps.forEach((c, j) => { if (bounce(b, F.R, c, F.BR, 0, 0, 1)) { st.lit[j] = 1; hit = "bump"; const s = speed(b); b.vx *= 1.08; b.vy *= 1.08; if (s < F.VMIN) { b.vx *= F.VMIN / s; b.vy *= F.VMIN / s; } } });
      if (hit) { if (Math.abs(b.vy) < 220) b.vy = b.vy < 0 ? -220 : 220; cap(b, F.VMAX); }
      return hit === "wall" ? false : hit;
    });
  });
  report(S, () => send(S, { t: "p", a: [Math.round(st.a[1] * 100), Math.round(st.a[0] * 100)] }), halfReport(S));
}
export function receive(S, m) {
  const F = FLIP, st = S.st; if (!m || S.over) return;
  if (m.t === "p" && Array.isArray(m.a) && num(m.a[0]) && num(m.a[1])) st.opp = [clamp(m.a[0] / 100, F.UP, F.REST), clamp(m.a[1] / 100, F.UP, F.REST)];
  else halfReceive(S, BALL, F, m, (b) => b.y <= H - F.LANE + F.R + 120 || st.bumps.some((c) => { const dx = b.x - (W - c.x), dy = b.y - (H - c.y); return Math.sqrt(dx * dx + dy * dy) <= F.R + F.BR + 60; }));
}

// ---------- Bot (arcade2.js:179-193) ----------
export function botInit() { return { t: [0, 0], late: 0 }; }
export function bot(S, B, r, dt) {
  const st = S.st, b = st.b, hold = [false, false];
  B.t[0] -= dt; B.t[1] -= dt;
  if (b && st.own && b.vy > 0) {
    for (let k = 0; k < 2; k++) {
      const s = flipSeg(k === 0, FLIP.REST), mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2;
      if (Math.abs(b.x - mx) < FLIP.L * 0.55 && b.y > my - 150 - B.late && b.y < my + 40 && B.t[k] <= 0) { B.t[k] = 0.22; B.late = r() * 120 - 30; }
    }
  }
  hold[0] = B.t[0] > 0; hold[1] = B.t[1] > 0;
  input(S, { flip: hold });
}
export const rules = FLIP;
