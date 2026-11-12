// Murmel-Ring (Variante von Eis-Stock): Glasmurmeln aus dem Ring schiessen; der Ring schrumpft alle zwei Schuesse.
// Port von alt:src/arcade2.js:462-487, 510-520.
import { W, H, clamp, num, fx, turnInit, turnStart, turnInput, turnTick, turnReceive, mineTurn, point } from "./core.js";
import { unit, sinD, cosD, PI } from "./num.js";

export const MURMEL = { id: "murmel", WIN: 5, serves: false, R: 26, DECEL: 160, STOP: 5, E: 0.95, SIDE: false, VMAX: 1500, VMIN: 150, FROM: 300, LATE: 15, RING: 360, SHRINK: 14, NM: 9 };
MURMEL.fromX = function (x) { return Math.round(clamp(num(x) ? x : W / 2, W / 2 - 260, W / 2 + 260)); };
MURMEL.ring = function (n) { return Math.max(250, MURMEL.RING - Math.floor(n / 2) * MURMEL.SHRINK); };
MURMEL.setup = function (S, st) {
  st.list = []; st.turn = 0; st.r = MURMEL.RING;
  for (let k = 0; k < MURMEL.NM; k++) {   // ein Kreuz aus Murmeln, vom Seed angestossen
    const a = k === 0 ? 0 : (k - 1) % 4 * PI / 2, d = k === 0 ? 0 : (k < 5 ? 95 : 190);
    st.list.push({ x: W / 2 + cosD(a) * d + (unit(S.seed, "m|x|" + k) - 0.5) * 30, y: H / 2 + sinD(a) * d + (unit(S.seed, "m|y|" + k) - 0.5) * 30, vx: 0, vy: 0, r: MURMEL.R, p: 2, c: k });
  }
};
MURMEL.turnOf = function (st, n) { return n % 2; };
MURMEL.launch = function (S, st, p, x, vx, vy) { st.list.push({ x, y: p === 0 ? H / 2 + st.r + 80 : H / 2 - st.r - 80, vx, vy, r: MURMEL.R + 4, p, shooter: true }); st.by = p; };
MURMEL.late = function (seed, n, me) { const vy = -(900 + unit(seed, "late|" + n) * 200); return { x: W / 2, vx: 0, vy: me === 0 ? vy : -vy }; };
MURMEL.settle = function (S, st) {
  let out = 0; const keep = [];
  st.list.forEach((s) => {
    if (s.shooter) return;
    const dx = s.x - W / 2, dy = s.y - H / 2;
    if (dx * dx + dy * dy > st.r * st.r) { out++; fx(S, "out", s.x, s.y, { c: s.c }); } else keep.push(s);
  });
  st.list = keep;
  if (out) point(S, MURMEL, st.by, out);
  st.r = MURMEL.ring(st.n); st.turn = st.n % 2;
  if (!S.over && !keep.length) { S.over = true; fx(S, S.score[0] > S.score[1] ? "won" : "lost", W / 2, H / 2); }
};

export function init(o) { return turnInit(MURMEL, o); }
export function start(S) { turnStart(S); }
export function input(S, i) { turnInput(S, i); }
export function tick(S) { turnTick(MURMEL, S); }
export function receive(S, m) { turnReceive(MURMEL, S, m); }
export { mineTurn };

export function botInit() { return { wait: 1 }; }
export function bot(S, B, r, dt) {
  if (!mineTurn(S)) { B.wait = 0.9 + r() * 0.9; return; }
  B.wait -= dt; if (B.wait > 0) return;
  const st = S.st, targets = st.list.filter((s) => !s.shooter), t = targets[Math.floor(r() * targets.length)] || { x: W / 2, y: H / 2 };
  const fx0 = MURMEL.fromX(t.x + (r() - 0.5) * 200), fy = S.me === 0 ? H / 2 + st.r + 80 : H / 2 - st.r - 80, dx = t.x - fx0, dy = t.y - fy, l = Math.sqrt(dx * dx + dy * dy) || 1, v = 900 + r() * 500, e = (r() - 0.5) * 0.18;
  const vx = (dx / l) * v + e * v, vy = (dy / l) * v;
  input(S, { shot: S.flip ? { x: W - fx0, vx: -vx, vy: -vy } : { x: fx0, vx, vy } }); B.wait = 1;
}
export const rules = MURMEL;
