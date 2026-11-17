// Insel-Panzer: Seitenansicht, eine Insel, ein Panzer an jedem Ufer, Granaten mit Schwerkraft und Wind.
// Port von alt:src/arcade.js:398-526.
import { W, H, clamp, num, cap, base, send, fx, concede, gain, reject, loop, report, check, finMsg, heard, stall, clock } from "./core.js";
import { unit, expD, sinD, cosD, PI } from "./num.js";

export const PANZER = { id: "panzer", WIN: 3, serves: false, fin: true, N: 100, SEA: H - 110, TX: 160, G: 620, WMAX: 140, VSHOT: 1350, VMIN: 220, RELOAD: 1.5, CR: 72, HR: 74, TH: 26, FLOOR: 12, AIM: 420 };
/** Spiegelgleiche Insel: beide Handys stehen am gleichen Ufer; Huegel und Buckel aus dem Seed. */
export function island(seed) {
  const P = PANZER, u1 = unit(seed, "isl|hill"), u2 = unit(seed, "isl|width"), u3 = unit(seed, "isl|bump"), a = [];
  for (let i = 0; i < P.N; i++) {
    const x = (i + 0.5) * W / P.N, dc = Math.abs(x - W / 2), edge = clamp((W / 2 - dc - 20) / 110, 0, 1), sm = edge * edge * (3 - 2 * edge);
    const z = dc / (130 + 70 * u2);
    const land = H - 300 - (240 + 170 * u1) * expD(-(z * z)) + 16 * sinD(dc / 41 + u3 * 6.28);
    a.push(Math.round(P.SEA + 40 - (P.SEA + 40 - land) * sm));
  }
  return a;
}
export function surface(T, x) { const c = W / PANZER.N, f = x / c - 0.5, i = Math.floor(f), k = f - i, a = T[clamp(i, 0, PANZER.N - 1)], b = T[clamp(i + 1, 0, PANZER.N - 1)]; return a + (b - a) * k; }
export function tankPos(T, mine) { const x = mine ? PANZER.TX : W - PANZER.TX; return { x, y: surface(T, x) - PANZER.TH }; }
export function wind(seed, k) { return Math.round((unit(seed, "wind|" + k) * 2 - 1) * PANZER.WMAX); }
export function shellStep(T, s, dt) {
  s.vx += s.w * dt; s.vy += PANZER.G * dt; s.x += s.vx * dt; s.y += s.vy * dt;
  if (s.x < -60 || s.x > W + 60 || s.y > H) return "sea";
  if (s.x >= 0 && s.x <= W) { const g = surface(T, s.x); if (s.y >= g) return g >= PANZER.SEA ? "sea" : "land"; }
  return null;
}
export function flight(T, s, max) {
  const p = { x: s.x, y: s.y, vx: s.vx, vy: s.vy, w: s.w };
  for (let i = 0; i < (max || 1200); i++) { const r = shellStep(T, p, 1 / 120); if (r) return { k: r, x: p.x, y: p.y, t: i / 120 }; }
  return { k: "sea", x: p.x, y: p.y, t: max / 120 };
}
/** Ein Krater beisst nur in die Haelfte des Handys, das darueber entschieden hat; nie unter die Wasserlinie. */
export function crater(T, x, y, mine) {
  const P = PANZER, c = W / P.N;
  for (let i = 0; i < P.N; i++) {
    const cx = (i + 0.5) * c; if (mine ? cx > W / 2 : cx < W / 2) continue;
    const dx = cx - x; if (Math.abs(dx) >= P.CR) continue;
    T[i] = Math.max(T[i], Math.min(Math.round(y + Math.sqrt(P.CR * P.CR - dx * dx) * 0.7), P.SEA - P.FLOOR));
  }
}
export function muzzle(T, mine) { const t = tankPos(T, mine); return { x: t.x, y: t.y - 22 }; }
export function plausibleShot(m, last, t) {
  const P = PANZER; if (!m || !num(m.vx) || !num(m.vy) || !num(m.w) || !num(m.i)) return false;
  if (Math.sqrt(m.vx * m.vx + m.vy * m.vy) > P.VSHOT * 1.01 || Math.abs(m.w) > P.WMAX) return false;
  return t - last >= P.RELOAD * 0.6;
}

export function init(o) {
  const P = PANZER, S = base(P, o);
  S.st = { T: island(S.seed), aim: { vx: 0, vy: 0 }, oppAim: { vx: -500, vy: -600 }, shells: [], id: 0, wind: wind(S.seed, 0), reload: 0 };
  S.h = { last: -9, fire: false, tokens: 1, tokAt: null };
  return S;
}
export function start(S) { S.started = true; }
export function input(S, i) {
  if (!i) return;
  if (i.aim && num(i.aim.vx) && num(i.aim.vy)) { const a = cap({ x: 0, y: 0, vx: i.aim.vx, vy: Math.min(i.aim.vy, 60) }, PANZER.VSHOT); S.st.aim = { vx: a.vx, vy: a.vy }; }
  if (i.fire) S.h.fire = true;
}
function land(S, s, r) {
  const P = PANZER, st = S.st, T = st.T, mine = r.x < W / 2;
  fx(S, r.k === "sea" ? "splash" : "boom", r.x, r.k === "sea" ? P.SEA : r.y, { mine: s.mine });
  if (r.k === "sea" || !mine) return;
  const tk = tankPos(T, true), dx = r.x - tk.x, dy = r.y - tk.y, hit = Math.sqrt(dx * dx + dy * dy) < P.HR;
  crater(T, r.x, r.y, true);
  send(S, { t: "boom", o: s.mine ? 1 : 0, i: s.i, x: Math.round(W - r.x), y: Math.round(r.y), hit });
  if (hit) { fx(S, "tank", tk.x, tk.y, { mine: true }); concede(S, P, tk.x, tk.y); st.wind = wind(S.seed, S.score[0] + S.score[1]); }
}
export function tick(S) {
  const P = PANZER, st = S.st, h = S.h, T = st.T;
  loop(S, (d) => {
    if (h.fire && S.started && S.t - h.last >= P.RELOAD && Math.sqrt(st.aim.vx * st.aim.vx + st.aim.vy * st.aim.vy) >= P.VMIN) {
      const mz = muzzle(T, true), s = { x: mz.x, y: mz.y, vx: st.aim.vx, vy: st.aim.vy, w: st.wind, mine: true, i: st.id++ };
      st.shells.push(s); h.last = S.t;
      send(S, { t: "shot", i: s.i, vx: -s.vx, vy: s.vy, w: -s.w });
      fx(S, "fire", mz.x, mz.y, { mine: true });
    }
    h.fire = false;
    for (let k = st.shells.length - 1; k >= 0; k--) {
      const sh = st.shells[k], r = shellStep(T, sh, d);
      if (r) { st.shells.splice(k, 1); land(S, sh, { k: r, x: sh.x, y: sh.y }); if (S.over || S.ending) return; }
    }
    st.reload = clamp((S.t - h.last) / P.RELOAD, 0, 1);
  });
  report(S, () => send(S, { t: "p", vx: Math.round(-st.aim.vx), vy: Math.round(st.aim.vy) }));
}
export function receive(S, m) {
  if (!m || S.over) return;
  rec(S, m);
}
function rec(S, m) {
  const P = PANZER, st = S.st, h = S.h, T = st.T;
  if (h.tokAt === null) h.tokAt = clock(S);
  heard(S);
  if (finMsg(S, P, m)) return;
  if (S.ending && m.t !== "boom") return;
  if (m.t === "p" && num(m.vx) && num(m.vy)) { const a = cap({ x: 0, y: 0, vx: m.vx, vy: m.vy }, P.VSHOT); st.oppAim = { vx: a.vx, vy: a.vy }; return; }
  if (m.t === "shot") {
    const t = clock(S); h.tokens = Math.min(1.5 + stall(S) / P.RELOAD + 1e-6, h.tokens + (t - h.tokAt) / P.RELOAD); h.tokAt = t;
    if (!plausibleShot(m, -Infinity, 0) || h.tokens < 1) { reject(S); return; }
    h.tokens -= 1; const mz = muzzle(T, false);
    st.shells.push({ x: mz.x, y: mz.y, vx: m.vx, vy: m.vy, w: m.w, mine: false, i: m.i });
    st.oppAim = { vx: m.vx, vy: m.vy }; fx(S, "fire", mz.x, mz.y, { mine: false });
    return;
  }
  if (m.t === "boom" && num(m.x) && num(m.y) && m.x >= W / 2 - P.CR) {
    const mine = m.o === 0;
    for (let k = st.shells.length - 1; k >= 0; k--) if (st.shells[k].mine === mine && st.shells[k].i === m.i) { st.shells.splice(k, 1); fx(S, "boom", m.x, m.y, { mine }); }
    crater(T, m.x, m.y, false);
    if (m.hit === true) { const tk = tankPos(T, false); fx(S, "tank", tk.x, tk.y, { mine: false }); gain(S, P); st.wind = wind(S.seed, S.score[0] + S.score[1]); }
  }
}
export { check };

// ---------- Bot (arcade.js:500-526) ----------
function speedFor(T, mz, ang, aimX, w) {
  let lo = PANZER.VMIN, hi = PANZER.VSHOT, v = hi, f;
  const c = cosD(ang), s = sinD(ang);
  for (let it = 0; it < 18; it++) {
    v = (lo + hi) / 2;
    f = flight(T, { x: mz.x, y: mz.y, vx: c * v, vy: -s * v, w }, 900);
    if (f.x < aimX) lo = v; else hi = v;
  }
  return { ang, v, miss: f.k === "land" ? Math.abs(f.x - aimX) : Infinity };
}
export function botInit(r) { return { wait: 1.6 + r() * 1.0, ang: 0 }; }
export function bot(S, B, r, dt) {
  B.wait -= dt; if (B.wait > 0 || !S.started) return;
  const st = S.st, T = st.T, mz = muzzle(T, true), tgt = tankPos(T, false);
  if (st.reload < 1) return;
  B.ang = (48 + r() * 18) * PI / 180;
  const aimX = tgt.x + (r() - 0.5) * PANZER.AIM;
  let best = speedFor(T, mz, B.ang, aimX, st.wind);
  for (let a = 30; a <= 84 && best.miss > 24; a += 6) { const c = speedFor(T, mz, a * PI / 180, aimX, st.wind); if (c.miss < best.miss) best = c; }
  input(S, { aim: { vx: cosD(best.ang) * best.v, vy: -sinD(best.ang) * best.v }, fire: true });
  B.wait = PANZER.RELOAD + 1.2 + r() * 1.4;
}
export const rules = PANZER;
