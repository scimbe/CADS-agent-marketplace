// Netz-Volley (Variante von Stangen-Kick): Seitenansicht, eine Figur je Seite des Netzes, Ball mit Schwerkraft.
// Port von alt:src/arcade.js:292-396.
import { W, clamp, num, body, copy, mirrorX, speed, cap, reach, same, base, send, fx, concede, gain, startBase, oppDt, reject, loop, report, clock, NET_P, STALL_MAX } from "./core.js";
import { unit } from "./num.js";

const H = 1600;
export const VOLLEY = { id: "volley", WIN: 5, serves: true, FY: H - 150, BR: 46, PRAD: 78, G: 1350, PG: 2900, JUMP: 1280, VMOVE: 950, NX: W / 2, NW: 12, NT: H - 150 - 330, VMAX: 1700, VMIN: 720 };
export function volleyServe(seed, n) { const u = unit(seed, "volley|serve|" + n); return { x: 230 + (u - 0.5) * 140, y: VOLLEY.FY - 760, vx: 0, vy: 0 }; }
export function volleyStep(b, dt) {
  const V = VOLLEY, R = V.BR, px = b.x; let hit = "";
  b.vy += V.G * dt; b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.x < R) { b.x = 2 * R - b.x; b.vx = Math.abs(b.vx); hit = "wall"; }
  if (b.x > W - R) { b.x = 2 * (W - R) - b.x; b.vx = -Math.abs(b.vx); hit = "wall"; }
  if (b.y < R) { b.y = 2 * R - b.y; b.vy = Math.abs(b.vy); hit = "wall"; }
  if (Math.abs(b.x - V.NX) < V.NW + R && b.y + R > V.NT) {
    if (b.y < V.NT) {
      const dx = b.x - V.NX, dy = b.y - V.NT, d = Math.sqrt(dx * dx + dy * dy) || 1, nx = dx / d, ny = dy / d;
      if (d < V.NW + R) { b.x = V.NX + nx * (V.NW + R); b.y = V.NT + ny * (V.NW + R); const vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= 1.8 * vn * nx; b.vy -= 1.8 * vn * ny; } hit = "net"; }
    } else { const side = px < V.NX ? -1 : 1; b.x = V.NX + side * (V.NW + R); b.vx = side * Math.abs(b.vx) * 0.75; hit = "net"; }
  }
  return hit;
}
export function volleyMove(f, aimX, jump, dt) {
  const V = VOLLEY, ground = V.FY - V.PRAD, nx = reach(f.x, clamp(aimX, V.PRAD, V.NX - V.NW - V.PRAD), dt, V.VMOVE);
  f.vx = (nx - f.x) / dt; f.x = nx;
  let landed = false;
  if (jump && f.y >= ground - 0.5) f.vy = -V.JUMP;
  f.vy += V.PG * dt; f.y += f.vy * dt;
  if (f.y >= ground) { landed = f.vy > 400; f.y = ground; f.vy = 0; }
  return landed;
}
export function volleyBump(b, f) {
  const V = VOLLEY, dx = b.x - f.x, dy = b.y - f.y, d = Math.sqrt(dx * dx + dy * dy), min = V.BR + V.PRAD;
  if (d >= min) return false;
  const nx = d ? dx / d : 0, ny = d ? dy / d : -1;
  b.x = f.x + nx * min; b.y = f.y + ny * min;
  const rv = (b.vx - f.vx) * nx + (b.vy - f.vy) * ny;
  if (rv < 0) { b.vx -= 2 * rv * nx; b.vy -= 2 * rv * ny; }
  b.vx += f.vx * 0.25;
  if (b.vy > -500) b.vy = -500;
  const s = speed(b); if (s < V.VMIN) { b.vx *= V.VMIN / s; b.vy *= V.VMIN / s; }
  cap(b, V.VMAX); return true;
}
export function plausibleFigure(prev, m, dt) {
  const V = VOLLEY, ground = V.FY - V.PRAD;
  return { x: clamp(reach(prev.x, m.x, dt, V.VMOVE * 1.25), V.NX + V.NW + V.PRAD, W - V.PRAD), y: clamp(m.y, ground - 340, ground) };
}
const VFALL = Math.sqrt(VOLLEY.VMAX * VOLLEY.VMAX + 2 * VOLLEY.G * VOLLEY.FY);
export function plausibleVolley(kind, b, opp, slack) {
  const V = VOLLEY; if (!body(b) || speed(b) > (kind === "hit" ? V.VMAX * 1.01 : VFALL)) return false;
  if (kind === "pass") return Math.abs(b.x - V.NX) <= V.BR + V.NW + 90 && b.vx < 0;
  if (b.x < V.NX - V.BR) return false;
  return kind !== "hit" || Math.sqrt((b.x - opp.x) * (b.x - opp.x) + (b.y - opp.y) * (b.y - opp.y)) <= V.BR + V.PRAD + 260 + (slack || 0);
}

export function init(o) {
  const V = VOLLEY, S = base(V, o), ground = V.FY - V.PRAD;
  S.st = { b: null, own: false, held: false, me: { x: 250, y: ground, vx: 0, vy: 0 }, opp: { x: W - 250, y: ground } };
  S.h = { aim: 250, jump: false, pAt: null };
  return S;
}
export function start(S) { startBase(S, VOLLEY); }
export function input(S, i) { if (!i) return; if (num(i.x)) S.h.aim = i.x; if (i.jump) S.h.jump = true; }
function serve(S) { const st = S.st; st.b = volleyServe(S.seed, S.n); st.own = true; st.held = false; send(S, { t: "serve", n: S.n, b: mirrorX(st.b) }); S.n++; S.serveAt = 0; fx(S, "serve", st.b.x, st.b.y); }
export function tick(S) {
  const V = VOLLEY, st = S.st, h = S.h;
  loop(S, (d) => {
    if (volleyMove(st.me, h.aim, h.jump, d)) fx(S, "land", st.me.x, V.FY);
    if (h.jump && st.me.vy < 0) fx(S, "jump", st.me.x, V.FY);
    h.jump = false;
    if (S.serveAt && S.t >= S.serveAt) serve(S);
    const b = st.b; if (!b || st.held) return;
    if (st.own) {
      const w = volleyStep(b, d); if (w) fx(S, w, b.x, b.y);
      if (volleyBump(b, st.me)) { send(S, { t: "hit", b: mirrorX(b) }); fx(S, "hit", b.x, b.y, { v: speed(b) }); }
      if (b.y + V.BR >= V.FY) { st.b = null; concede(S, V, b.x, V.FY); return; }
      if (b.x > V.NX) { st.own = false; send(S, { t: "pass", b: mirrorX(b) }); }
    } else {
      volleyStep(b, d);
      if (b.x <= V.NX && b.vx < 0) { b.x = V.NX; st.held = true; }
      if (b.y + V.BR >= V.FY) { b.y = V.FY - V.BR; st.held = true; }
    }
  });
  report(S, () => send(S, { t: "p", x: Math.round(W - st.me.x), y: Math.round(st.me.y) }), st.own && st.b ? () => send(S, { t: "st", b: mirrorX(st.b) }) : null);
}
export function receive(S, m) {
  const V = VOLLEY, st = S.st; if (!m || S.over) return;
  if (m.t === "p" && num(m.x) && num(m.y)) { S.h.pAt = clock(S); st.opp = plausibleFigure(st.opp, m, oppDt(S, Math.abs(m.x - st.opp.x), V.VMOVE * 1.25)); }
  else if (m.t === "pt") { st.b = null; st.own = false; gain(S, V); }
  else if (m.t === "serve" && num(m.n)) { if (!same(m.b, mirrorX(volleyServe(S.seed, m.n)))) reject(S); else { st.b = copy(m.b); st.own = false; st.held = false; S.n = m.n + 1; } }
  else if ((m.t === "hit" || m.t === "st" || m.t === "pass") && !st.own) {
    const walked = S.h.pAt === null ? 0 : V.VMOVE * 1.25 * Math.min(STALL_MAX, Math.max(0, clock(S) - S.h.pAt - NET_P));
    if (!plausibleVolley(m.t, m.b, st.opp, walked)) reject(S);
    else {
      st.b = copy(m.b); st.held = false;
      if (m.t === "pass") st.own = true; else if (m.t === "hit") fx(S, "ohit", st.b.x, st.b.y, { v: speed(st.b) });
    }
  }
}

// ---------- Bot (arcade.js:384-396) ----------
export function botInit() { return { wait: 0, lean: 0 }; }
export function bot(S, B, r, dt) {
  B.wait -= dt; if (B.wait > 0) return; B.wait = 0.08 + r() * 0.05;
  const st = S.st, b = st.b, f = st.me, V = VOLLEY;
  if (!b) { input(S, { x: 260 }); return; }
  if (b.x > V.NX) { input(S, { x: 300 }); B.lean = (r() - 0.5) * 2; return; }
  const p = { x: b.x, y: b.y, vx: b.vx, vy: b.vy }, head = f.y - V.PRAD * 0.4;
  for (let i = 0; i < 240 && !(p.vy > 0 && p.y >= head); i++) volleyStep(p, 1 / 60);
  input(S, { x: p.x - 38 + B.lean * (30 + speed(b) * 0.09), jump: b.vy > 0 && Math.abs(b.x - f.x) < 110 && f.y - b.y < 300 && f.y - b.y > 120 });
}
export const rules = VOLLEY;
