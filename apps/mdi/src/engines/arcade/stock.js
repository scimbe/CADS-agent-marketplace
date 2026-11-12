// Eis-Stock: drei Steine je Runde, der Stein am naechsten zur Mitte gewinnt die Runde; drei Rundensiege gewinnen.
// Rundenbasiert und deterministisch im gemeinsamen Bezugssystem. Port von alt:src/arcade2.js:444-460, 489-509.
import { W, H, fx, turnInit, turnStart, turnInput, turnTick, turnReceive, mineTurn, point, discStep } from "./core.js";
import { unit } from "./num.js";

export const STOCK = { id: "stock", WIN: 3, serves: false, R: 44, DECEL: 230, STOP: 6, E: 0.85, SIDE: true, VMAX: 1250, VMIN: 150, FROM: 150, PER: 3, LATE: 15, TX: W / 2, TY: H / 2, RINGS: [70, 150, 230] };
STOCK.fromX = function () { return W / 2; };
STOCK.setup = function (S, st, round) { st.list = []; st.round = round || 0; st.thrown = 0; st.first = st.round % 2; st.turn = st.first; st.base = st.n; st.at = S.t; };
STOCK.turnOf = function (st, n) { return (st.first + (n - st.base)) % 2; };
STOCK.launch = function (S, st, p, x, vx, vy) { st.list.push({ x, y: p === 0 ? H - STOCK.FROM : STOCK.FROM, vx, vy, r: STOCK.R, p }); st.thrown++; };
STOCK.late = function (seed, n, me) { const vy = -(500 + unit(seed, "late|" + n) * 80); return { x: W / 2, vx: 0, vy: me === 0 ? vy : -vy }; };
STOCK.settle = function (S, st) {
  st.list = st.list.filter((s) => s.y > -s.r && s.y < H + s.r);
  if (st.thrown < 2 * STOCK.PER) { st.turn = STOCK.turnOf(st, st.n); return; }
  const d = st.list.map((s) => ({ p: s.p, d: Math.sqrt((s.x - STOCK.TX) * (s.x - STOCK.TX) + (s.y - STOCK.TY) * (s.y - STOCK.TY)) })).filter((x) => x.d < 300).sort((a, b) => a.d - b.d);
  const win = d.length ? d[0].p : -1;
  if (win >= 0) point(S, STOCK, win, 1); else fx(S, "draw", W / 2, H / 2);
  if (S.over) return;
  st.last = st.list.slice();
  STOCK.setup(S, st, st.round + 1);
};

export function init(o) { return turnInit(STOCK, o); }
export function start(S) { turnStart(S); }
export function input(S, i) { turnInput(S, i); }
export function tick(S) { turnTick(STOCK, S); }
export function receive(S, m) { turnReceive(STOCK, S, m); }
export { mineTurn };

/** Bots der Rundenspiele zielen, indem sie Wuerfe in der gemeinsamen Simulation probieren (arcade2.js:490-495). */
export function tryThrow(D, S, x, vx, vy) {
  const st = S.st, list = st.list.map((s) => ({ x: s.x, y: s.y, vx: s.vx, vy: s.vy, r: s.r, p: s.p, shooter: s.shooter }));
  D.launch(S, { list, r: st.r, thrown: 0 }, S.me, x, vx, vy);
  for (let i = 0; i < 2400 && discStep(D, list); i++);
  return list;
}
export function botInit() { return { wait: 1 }; }
export function bot(S, B, r, dt) {
  if (!mineTurn(S)) { B.wait = 0.9 + r() * 0.9; return; }
  B.wait -= dt; if (B.wait > 0) return;
  let best = null; const sign = S.me === 0 ? -1 : 1;
  for (let k = 0; k < 7; k++) {
    const vx = (r() - 0.5) * 120, vy = sign * (470 + r() * 180), list = tryThrow(STOCK, S, W / 2, vx, vy), mine = list[list.length - 1];
    const dx = mine.x - STOCK.TX, dy = mine.y - STOCK.TY, dd = Math.sqrt(dx * dx + dy * dy); if (!best || dd < best.d) best = { d: dd, vx, vy };
  }
  const e = 1 + (r() - 0.5) * 0.12;
  input(S, { shot: S.flip ? { vx: -best.vx * e, vy: -best.vy * e } : { vx: best.vx * e, vy: best.vy * e } }); B.wait = 1;
}
export const rules = STOCK;
