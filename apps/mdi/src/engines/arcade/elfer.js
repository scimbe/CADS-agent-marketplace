// Elfer-Duell: Schuetze und Torwart wechseln sich ab; das Handy des Torwarts entscheidet. Port von alt:src/arcade2.js:282-363.
import { W, H, clamp, num, cap, reach, base, send, fx, reject, loop, report, oppDt } from "./core.js";
import { unit } from "./num.js";

export const ELF = { id: "elfer", WIN: 5, serves: false, R: 24, GY: 170, GW: 520, KY: 240, KW: 72, KDIVE: 115, VK: 950, VMAX: 2300, VMIN: 650, CMAX: 900, PAUSE: 1.4, LATE: 8 };
export function elfSpot(seed, n) { return { x: W / 2 + (unit(seed, "elf|spot|" + n) - 0.5) * 240, y: H * 0.64 }; }
/** Der Einladende schiesst zuerst. */
export function elfShooter(n, serving) { return (n % 2 === 0) === !!serving; }
function fly(b, d) { b.vx += b.c * d; b.x += b.vx * d; b.y += b.vy * d; }

export function init(o) {
  const S = base(ELF, o);
  S.st = { n: 0, b: null, phase: "wait", at: 0, k: { x: W / 2, vx: 0 }, opp: W / 2, oppV: 0, spot: elfSpot(S.seed, 0), shooting: elfShooter(0, S.serving), res: "" };
  S.h = { aim: W / 2, shot: null, taken: [0, 0] };
  return S;
}
function next(S) { const st = S.st; st.n++; st.b = null; st.res = ""; st.phase = "aim"; st.at = S.t; st.spot = elfSpot(S.seed, st.n); st.shooting = elfShooter(st.n, S.serving); }
export function start(S) { S.started = true; S.st.phase = "aim"; S.st.at = S.t; }
/** Entschieden, wenn eine Seite nicht mehr aufholen kann, oder nach fuenf je mit Sieger; dann Schuss um Schuss. */
function decided(S) {
  const a = S.score[0], b = S.score[1], taken = S.h.taken, left0 = Math.max(0, 5 - taken[0]), left1 = Math.max(0, 5 - taken[1]);
  if (a + left0 < b || b + left1 < a) return true;
  return taken[0] >= 5 && taken[0] === taken[1] && a !== b;
}
function result(S, r) {
  const E = ELF, st = S.st, x = st.b ? st.b.x : W / 2; st.res = r; st.phase = "done"; st.at = S.t;
  if (st.shooting) { S.h.taken[0]++; if (r === "goal") S.score[0]++; fx(S, r === "goal" ? "score" : r, x, E.GY); }
  else { S.h.taken[1]++; if (r === "goal") S.score[1]++; fx(S, r === "goal" ? "lose" : r === "save" ? "saved" : r, x, H - E.KY); }
  if (decided(S)) { S.over = true; fx(S, S.score[0] > S.score[1] ? "won" : "lost", W / 2, H / 2); }
}
export function input(S, i) { if (!i) return; if (num(i.x)) S.h.aim = clamp(i.x, W / 2 - ELF.GW / 2, W / 2 + ELF.GW / 2); if (i.shot) S.h.shot = { vx: i.shot.vx, vy: i.shot.vy, c: i.shot.c }; }
export function tick(S) {
  const E = ELF, st = S.st, h = S.h;
  loop(S, (d) => {
    const k = st.k, nx = reach(k.x, h.aim, d, E.VK); k.vx = (nx - k.x) / d; k.x = nx;
    if (!S.started) return;
    if (st.phase === "done" && S.t - st.at >= E.PAUSE) next(S);
    if (st.phase === "aim" && st.shooting) {
      if (!h.shot && S.t - st.at > E.LATE) h.shot = { vx: (unit(S.seed, "elf|late|" + st.n) - 0.5) * 300, vy: -900, c: 0 };
      if (h.shot && num(h.shot.vx) && num(h.shot.vy)) {
        const b = cap({ x: st.spot.x, y: st.spot.y, vx: h.shot.vx, vy: Math.min(-E.VMIN * 0.7, h.shot.vy) }, E.VMAX); b.c = clamp(num(h.shot.c) ? h.shot.c : 0, -E.CMAX, E.CMAX);
        st.b = b; st.phase = "fly"; send(S, { t: "shot", n: st.n, vx: -b.vx, vy: -b.vy, c: -b.c }); fx(S, "kick", b.x, b.y);
      }
    }
    h.shot = null;
    const b2 = st.b; if (st.phase !== "fly" || !b2) return;
    if (st.shooting) { if (b2.y > E.KY + E.R) fly(b2, d); return; }
    fly(b2, d);
    const reachK = Math.abs(k.vx) > 700 ? E.KDIVE : E.KW;
    if (b2.y >= H - E.KY - E.R && b2.y < H - E.KY + E.R && Math.abs(b2.x - k.x) <= reachK + E.R) { b2.vy = -Math.abs(b2.vy) * 0.4; b2.vx += (b2.x - k.x) * 4; send(S, { t: "res", n: st.n, r: "save" }); result(S, "save"); return; }
    if (b2.y >= H - E.GY) { const r = Math.abs(b2.x - W / 2) <= E.GW / 2 - E.R ? "goal" : "miss"; send(S, { t: "res", n: st.n, r }); result(S, r); return; }
    if (b2.x < -E.R || b2.x > W + E.R) { send(S, { t: "res", n: st.n, r: "miss" }); result(S, "miss"); }
  });
  report(S, () => send(S, { t: "p", x: Math.round(W - st.k.x), v: Math.round(-st.k.vx) }));
}
export function receive(S, m) { if (!m || S.over) return; rec(S, m); }
function rec(S, m) {
  const E = ELF, st = S.st;
  if (m.t === "p" && num(m.x)) { st.opp = clamp(reach(st.opp, m.x, oppDt(S, Math.abs(m.x - st.opp), E.VK * 1.25), E.VK * 1.25), W / 2 - E.GW / 2, W / 2 + E.GW / 2); st.oppV = num(m.v) ? m.v : 0; return; }
  if (m.t === "shot") {
    if (!num(m.vx) || !num(m.vy) || !num(m.c) || Math.sqrt(m.vx * m.vx + m.vy * m.vy) > E.VMAX * 1.01 || m.vy < E.VMIN * 0.7 - 1 || Math.abs(m.c) > E.CMAX) { reject(S); return; }
    if (st.phase === "done" && m.n === st.n + 1 && !elfShooter(m.n, S.serving)) next(S);
    if (st.shooting || st.phase !== "aim" || m.n !== st.n) { reject(S); return; }
    const sp = elfSpot(S.seed, st.n); st.b = { x: W - sp.x, y: H - sp.y, vx: m.vx, vy: m.vy, c: m.c }; st.phase = "fly"; fx(S, "kick", st.b.x, st.b.y);
    return;
  }
  if (m.t === "res" && m.n === st.n && st.shooting && st.phase === "fly" && ["goal", "save", "miss"].indexOf(m.r) >= 0) result(S, m.r);
}

// ---------- Bot (arcade2.js:346-363) ----------
export function botInit() { return { wait: 0, plan: null }; }
export function bot(S, B, r, dt) {
  const st = S.st; B.wait -= dt;
  if (st.shooting) {
    if (st.phase !== "aim") { B.plan = null; return; }
    if (!B.plan) B.plan = { at: 0.8 + r() * 1.6, side: r() < 0.5 ? -1 : 1, c: (r() - 0.5) * 900 };
    B.plan.at -= dt; if (B.plan.at > 0) return;
    const tx = W / 2 + B.plan.side * (ELF.GW / 2 - 40 - r() * 90), ty = ELF.GY, dx = tx - st.spot.x, dy = ty - st.spot.y, v = 1450 + r() * 600, l = Math.sqrt(dx * dx + dy * dy);
    input(S, { shot: { vx: dx / l * v - B.plan.c * 0.35, vy: dy / l * v, c: B.plan.c } }); B.plan = null; return;
  }
  if (B.wait > 0) return; B.wait = 0.22 + r() * 0.12;
  const b = st.b;
  if (!b || st.phase !== "fly") { input(S, { x: W / 2 + (r() - 0.5) * 60 }); return; }
  const t = (H - ELF.KY - b.y) / Math.max(1, b.vy), x = b.x + b.vx * t + 0.5 * b.c * t * t;
  input(S, { x: x + (r() - 0.5) * 300 });
}
export const rules = ELF;
