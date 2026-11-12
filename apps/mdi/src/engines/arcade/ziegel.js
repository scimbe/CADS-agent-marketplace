// Ziegel-Duell: Schlaeger vorn, dahinter eine Mauer als letzte Linie. Port von alt:src/arcade.js:202-290.
import { W, H, clamp, num, body, copy, mirror, speed, cap, reach, same, base, send, fx, concede, gain, startBase, oppDt, reject, loop, report } from "./core.js";
import { hash32, sinD, cosD, PI } from "./num.js";

export const ZIEGEL = { id: "ziegel", WIN: 5, serves: true, R: 18, PW: 200, PY: H - 210, WY: H - 110, BH: 46, NB: 7, V0: 640, VMAX: 1250, UP: 1.045, SPIN: 3.0, PMAX: 2600 };
export function ziegelServe(seed, n) {
  const a = (hash32(seed + "|ziegel|serve|" + n) % 61 - 30) * PI / 180;   // -30..30 Grad, weg vom Aufschlaeger
  return { x: W / 2, y: H / 2, vx: sinD(a) * ZIEGEL.V0, vy: -cosD(a) * ZIEGEL.V0 };
}
function walls(b, dt) {
  const R = ZIEGEL.R; b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.x < R) { b.x = 2 * R - b.x; b.vx = Math.abs(b.vx); return true; }
  if (b.x > W - R) { b.x = 2 * (W - R) - b.x; b.vx = -Math.abs(b.vx); return true; }
  return false;
}
export function brickAt(x) { return clamp(Math.floor(x / (W / ZIEGEL.NB)), 0, ZIEGEL.NB - 1); }
export function ziegelDefend(b, paddleX) {
  const Z = ZIEGEL; if (b.vy <= 0 || b.y < Z.PY - Z.R) return null;
  const off = b.x - paddleX;
  if (Math.abs(off) > Z.PW / 2 + Z.R) return { hit: false };
  const out = cap({ x: b.x, y: Z.PY - Z.R, vx: b.vx + off * Z.SPIN, vy: -Math.abs(b.vy) * Z.UP }, Z.VMAX);
  if (Math.abs(out.vy) < Z.V0 * 0.6) {
    out.vy = -Z.V0 * 0.6; const side = Math.sqrt(Z.VMAX * Z.VMAX - out.vy * out.vy);
    if (Math.abs(out.vx) > side) out.vx = Math.sign(out.vx) * side;
  }
  return { hit: true, ball: out };
}
export function plausiblePaddle(prev, next, dt) { return clamp(reach(prev, next, dt, ZIEGEL.PMAX * 1.25), ZIEGEL.PW / 2, W - ZIEGEL.PW / 2); }
export function plausibleZiegel(kind, b, opp, k, theirs) {
  const Z = ZIEGEL; if (!body(b) || speed(b) > Z.VMAX * 1.01 || b.vy <= 0) return false;
  if (kind === "hit") return Math.abs(b.y - (H - Z.PY + Z.R)) <= 40 && Math.abs(b.x - opp) <= Z.PW / 2 + Z.R + 200;
  return num(k) && k === (k | 0) && k >= 0 && k < Z.NB && theirs[Z.NB - 1 - k] === 1 && Math.abs(b.y - (H - Z.WY + Z.BH / 2 + Z.R)) <= 40;
}

export function init(o) {
  const Z = ZIEGEL, S = base(Z, o);
  S.st = { b: null, held: false, past: false, me: W / 2, opp: W / 2, mine: [], theirs: [] };
  for (let i = 0; i < Z.NB; i++) { S.st.mine.push(1); S.st.theirs.push(1); }
  S.h = { aim: W / 2 };
  return S;
}
export function start(S) { startBase(S, ZIEGEL); }
export function input(S, i) { if (i && num(i.x)) S.h.aim = clamp(i.x, ZIEGEL.PW / 2, W - ZIEGEL.PW / 2); }
function serve(S) { const st = S.st; st.b = ziegelServe(S.seed, S.n); st.held = false; st.past = false; send(S, { t: "serve", n: S.n, b: mirror(st.b) }); S.n++; S.serveAt = 0; fx(S, "serve", W / 2, H / 2); }
export function tick(S) {
  const Z = ZIEGEL, st = S.st, wallsY = Z.WY - Z.BH / 2 - Z.R;
  loop(S, (d) => {
    st.me = reach(st.me, S.h.aim, d, Z.PMAX);
    if (S.serveAt && S.t >= S.serveAt) serve(S);
    const b = st.b; if (!b || st.held) return;
    if (walls(b, d)) fx(S, "wall", b.x, b.y);
    if (b.vy > 0) {
      if (!st.past) {
        const r = ziegelDefend(b, st.me);
        if (r && r.hit) { st.b = r.ball; send(S, { t: "hit", b: mirror(st.b) }); fx(S, "hit", st.b.x, st.b.y, { v: speed(st.b) }); }
        else if (r) st.past = true;
      }
      if (st.past && b.y >= wallsY && b.y < wallsY + Z.BH) {
        const k = brickAt(b.x);
        if (st.mine[k]) { st.mine[k] = 0; b.y = wallsY; b.vy = -Math.abs(b.vy); st.past = false; send(S, { t: "brk", k, b: mirror(b) }); fx(S, "brick", b.x, Z.WY, { i: k, mine: true }); }
      }
      if (b.y > H + Z.R) { st.b = null; st.past = false; concede(S, Z, b.x, H); }
    } else if (b.y <= H - Z.PY + Z.R) { b.y = H - Z.PY + Z.R; st.held = true; }
  });
  report(S, () => send(S, { t: "p", x: Math.round(W - st.me) }));
}
export function receive(S, m) {
  const Z = ZIEGEL, st = S.st; if (!m || S.over) return;
  if (m.t === "p" && num(m.x)) st.opp = plausiblePaddle(st.opp, m.x, oppDt(S, Math.abs(m.x - st.opp), Z.PMAX * 1.25));
  else if (m.t === "pt") { st.b = null; gain(S, Z); }
  else if (m.t === "serve" && num(m.n)) { if (!same(m.b, mirror(ziegelServe(S.seed, m.n)))) reject(S); else { st.b = copy(m.b); st.held = false; st.past = false; S.n = m.n + 1; } }
  else if (m.t === "hit" || m.t === "brk") {
    if (!(st.b && st.b.vy > 0 && !st.held)) {
      if (!plausibleZiegel(m.t, m.b, st.opp, m.k, st.theirs)) reject(S);
      else {
        st.b = copy(m.b); st.held = false; st.past = false;
        if (m.t === "brk") { st.theirs[Z.NB - 1 - m.k] = 0; fx(S, "brick", st.b.x, H - Z.WY, { i: Z.NB - 1 - m.k, mine: false }); }
        else fx(S, "ohit", st.b.x, st.b.y, { v: speed(st.b) });
      }
    }
  }
}

// ---------- Bot (arcade.js:276-290) ----------
export function botInit() { return { wait: 0, want: W / 2, at: W / 2, miss: 0 }; }
export function bot(S, B, r, dt) {
  const BOTV = 1000;
  B.wait -= dt; if (B.wait > 0) return; B.wait = 0.09 + r() * 0.04;
  const b = S.st.b;
  if (!b || b.vy <= 0) { B.want = W / 2 + (B.want - W / 2) * 0.6; B.miss = (r() - 0.5) * 2; }
  else {
    const tt = (ZIEGEL.PY - b.y) / b.vy, span = W - 2 * ZIEGEL.R;
    let x = b.x + b.vx * tt;
    x = ((x - ZIEGEL.R) % (2 * span) + 2 * span) % (2 * span); x = ZIEGEL.R + (x > span ? 2 * span - x : x);
    B.want = x + B.miss * (50 + speed(b) * 0.11);
  }
  B.at = reach(B.at, B.want, 0.11, BOTV); input(S, { x: B.at });
}
export const rules = ZIEGEL;
