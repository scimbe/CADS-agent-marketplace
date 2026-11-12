// Puck-Duell (Variante von Stangen-Kick): Draufsicht, Schlaeger irgendwo in der eigenen Haelfte, Tore an beiden Enden.
// Port von alt:src/arcade.js:92-200 (Regeln, Seite, Bot), Parameter unveraendert.
import { W, H, TICK, clamp, num, body, copy, mirror, speed, cap, reach, same, base, send, fx, concede, gain, startBase, oppDt, reject, loop, report } from "./core.js";
import { unit, expD } from "./num.js";

export const PUCK = { id: "puck", WIN: 5, serves: true, PR: 34, MR: 72, GOAL: 400, VMAX: 2400, MMAX: 3200, FRIC: 0.3, E: 0.92, HOLD: 6 };
const FRIC_F = expD(-PUCK.FRIC / TICK);   // Altcode: Math.exp(-FRIC * dt) mit dt = 1/120

export function puckServe(seed, n) {
  const u = unit(seed, "puck|serve|" + n), v = unit(seed, "puck|drift|" + n);
  return { x: W / 2 + (u - 0.5) * 320, y: H * 0.66, vx: (v - 0.5) * 160, vy: 30 };
}
function mouth(x) { return Math.abs(x - W / 2) < PUCK.GOAL / 2 - PUCK.PR * 0.4; }
export function puckWalls(p, dt, f = FRIC_F) {
  const R = PUCK.PR, E = PUCK.E;
  p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= f; p.vy *= f;
  let wall = false;
  if (p.x < R) { p.x = 2 * R - p.x; p.vx = Math.abs(p.vx) * E; wall = true; }
  if (p.x > W - R) { p.x = 2 * (W - R) - p.x; p.vx = -Math.abs(p.vx) * E; wall = true; }
  if (!mouth(p.x)) {
    if (p.y > H - R && p.y < H + R) { p.y = 2 * (H - R) - p.y; p.vy = -Math.abs(p.vy) * E; wall = true; }
    if (p.y < R && p.y > -R) { p.y = 2 * R - p.y; p.vy = Math.abs(p.vy) * E; wall = true; }
  }
  return wall;
}
export function puckStrike(p, m) {
  const dx = p.x - m.x, dy = p.y - m.y, d = Math.sqrt(dx * dx + dy * dy), min = PUCK.PR + PUCK.MR;
  if (d >= min) return false;
  const nx = d ? dx / d : 0, ny = d ? dy / d : -1;
  p.x = m.x + nx * min; p.y = m.y + ny * min;
  const rv = (p.vx - m.vx) * nx + (p.vy - m.vy) * ny;
  if (rv < 0) { p.vx -= (1 + PUCK.E) * rv * nx; p.vy -= (1 + PUCK.E) * rv * ny; }
  cap(p, PUCK.VMAX);
  p.x = clamp(p.x, PUCK.PR, W - PUCK.PR); if (!mouth(p.x)) p.y = Math.min(p.y, H - PUCK.PR);
  return true;
}
export function puckClampMallet(x, y, mine) {
  const R = PUCK.MR, lo = mine ? H / 2 + R : R, hi = mine ? H - R : H / 2 - R;
  return { x: clamp(x, R, W - R), y: clamp(y, lo, hi) };
}
export function plausibleMallet(prev, next, dt) {
  const c = puckClampMallet(next.x, next.y, false);
  return { x: reach(prev.x, c.x, dt, PUCK.MMAX * 1.25), y: reach(prev.y, c.y, dt, PUCK.MMAX * 1.25) };
}
export function plausiblePuck(kind, b, opp) {
  if (!body(b) || speed(b) > PUCK.VMAX * 1.01) return false;
  if (kind === "pass") return Math.abs(b.y - H / 2) <= 90 && b.vy > 0;
  if (b.y > H / 2 + PUCK.PR) return false;
  return kind !== "hit" || Math.sqrt((b.x - opp.x) * (b.x - opp.x) + (b.y - opp.y) * (b.y - opp.y)) <= PUCK.PR + PUCK.MR + 320;
}

export function init(o) {
  const S = base(PUCK, o);
  S.st = { p: null, own: false, held: false, me: { x: W / 2, y: H - 200, vx: 0, vy: 0 }, opp: { x: W / 2, y: 200 } };
  S.h = { aim: { x: W / 2, y: H - 200 }, hitAt: -1, since: 0 };
  return S;
}
export function start(S) { startBase(S, PUCK); }
export function input(S, i) { if (i && num(i.x) && num(i.y)) S.h.aim = puckClampMallet(i.x, i.y, true); }
function serve(S) { const st = S.st; st.p = puckServe(S.seed, S.n); st.own = true; st.held = false; S.h.since = S.t; send(S, { t: "serve", n: S.n, b: mirror(st.p) }); S.n++; S.serveAt = 0; fx(S, "serve", st.p.x, st.p.y); }
function give(S) { const st = S.st; st.p = mirror(puckServe(S.seed, S.n)); st.own = false; st.held = false; send(S, { t: "give", n: S.n }); S.n++; fx(S, "give", st.p.x, st.p.y); }
export function tick(S) {
  const st = S.st, h = S.h;
  loop(S, (d) => {
    const m = st.me, nx = reach(m.x, h.aim.x, d, PUCK.MMAX), ny = reach(m.y, h.aim.y, d, PUCK.MMAX);
    m.vx = (nx - m.x) / d; m.vy = (ny - m.y) / d; m.x = nx; m.y = ny;
    if (S.serveAt && S.t >= S.serveAt) serve(S);
    const p = st.p; if (!p) return;
    if (st.own) {
      if (puckWalls(p, d)) fx(S, "wall", p.x, p.y);
      if (puckStrike(p, m) && S.t - h.hitAt > 0.08) { h.hitAt = S.t; send(S, { t: "hit", b: mirror(p) }); fx(S, "hit", p.x, p.y, { v: speed(p) }); }
      if (p.y > H + PUCK.PR) { st.p = null; concede(S, PUCK, p.x, H); return; }
      if (p.y < H / 2 && p.vy < 0) { st.own = false; send(S, { t: "pass", b: mirror(p) }); }
      else if (S.t - h.since > PUCK.HOLD) give(S);
    } else if (!st.held) {
      puckWalls(p, d);
      if (p.y >= H / 2 && p.vy > 0) { p.y = H / 2; st.held = true; }
    }
  });
  report(S, () => send(S, { t: "p", x: Math.round(W - st.me.x), y: Math.round(H - st.me.y) }), st.own && st.p ? () => send(S, { t: "st", b: mirror(st.p) }) : null);
}
export function receive(S, m) {
  const st = S.st; if (!m || S.over) return;
  rec(S, st, m);
}
function rec(S, st, m) {
  if (m.t === "p" && num(m.x) && num(m.y)) { st.opp = plausibleMallet(st.opp, m, oppDt(S, Math.max(Math.abs(m.x - st.opp.x), Math.abs(m.y - st.opp.y)), PUCK.MMAX * 1.25)); return; }
  if (m.t === "pt") { st.p = null; st.own = false; gain(S, PUCK); return; }
  if (m.t === "serve" && num(m.n)) { if (!same(m.b, mirror(puckServe(S.seed, m.n)))) { reject(S); return; } st.p = copy(m.b); st.own = false; st.held = false; S.n = m.n + 1; return; }
  if (m.t === "give" && num(m.n)) { if (st.own) return; st.p = puckServe(S.seed, m.n); st.own = true; st.held = false; S.h.since = S.t; S.n = m.n + 1; fx(S, "serve", st.p.x, st.p.y); return; }
  if (m.t === "hit" || m.t === "st" || m.t === "pass") {
    if (st.own) return;
    if (!plausiblePuck(m.t, m.b, st.opp)) { reject(S); return; }
    st.p = copy(m.b); st.held = false;
    if (m.t === "pass") { st.own = true; S.h.since = S.t; } else if (m.t === "hit") fx(S, "ohit", st.p.x, st.p.y, { v: speed(st.p) });
  }
}

// ---------- Bot (arcade.js:182-200): schaut und bewegt sich in kurzen Takten, wie eine Hand ----------
export function botInit() { return { wait: 0, goal: { x: W / 2, y: H - 170 }, err: 0 }; }
export function bot(S, B, r, dt) {
  const BOTV = 950;
  B.wait -= dt; if (B.wait > 0) return; B.wait = 0.12 + r() * 0.06;
  const st = S.st, p = st.p, m = st.me; let want;
  if (!p || !st.own) want = { x: W / 2 + ((p ? p.x : W / 2) - W / 2) * 0.45, y: H - 190 };
  else if (p.vy > 250 && p.y < m.y) { if (!B.err) B.err = (r() - 0.5) * (80 + speed(p) * 0.16); want = { x: p.x + p.vx * 0.1 + B.err, y: Math.max(p.y + 110, H - 230) }; }
  else {
    const tx = W / 2 + (r() - 0.5) * 300, ty = -200, dx = p.x - tx, dy = p.y - ty, d = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / d, uy = dy / d;
    const behind = { x: p.x + ux * (PUCK.PR + PUCK.MR + 25), y: p.y + uy * (PUCK.PR + PUCK.MR + 25) };
    want = Math.sqrt((m.x - behind.x) * (m.x - behind.x) + (m.y - behind.y) * (m.y - behind.y)) < 60 ? { x: p.x - ux * 80, y: p.y - uy * 80 } : behind;
    if (p.y > H - 140 || p.x < 110 || p.x > W - 110) want = { x: p.x + (W / 2 - p.x) * 0.5, y: p.y + (H * 0.7 - p.y) * 0.5 };
  }
  if (!p || p.vy <= 250) B.err = 0;
  const step = BOTV * 0.15, dx2 = want.x - B.goal.x, dy2 = want.y - B.goal.y, dd = Math.sqrt(dx2 * dx2 + dy2 * dy2);
  if (dd > step) want = { x: B.goal.x + dx2 / dd * step, y: B.goal.y + dy2 / dd * step };
  B.goal = want; input(S, want);
}
export const rules = PUCK;
