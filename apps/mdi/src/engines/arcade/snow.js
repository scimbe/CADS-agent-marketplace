// Schnee-Schlacht (Variante von Insel-Panzer): an der eigenen Linie ausweichen, geradeaus werfen, Waelle nutzen sich ab.
// Port von alt:src/arcade2.js:195-280.
import { W, H, clamp, num, reach, base, send, fx, concede, gain, reject, loop, report, finMsg, heard, stall, clock, oppDt } from "./core.js";
import { unit } from "./num.js";

export const SNOW = { id: "snow", WIN: 5, serves: false, fin: true, FY: H - 130, FR: 46, VF: 760, R: 16, V: 980, AMMO: 3, RELOAD: 0.9, WW: 150, WH: 44, HP: 3 };
export function snowWalls(seed) {
  const out = [];
  for (let k = 0; k < 3; k++) out.push({ x: 170 + k * 330 + (unit(seed, "wall|x|" + k) - 0.5) * 90, y: H / 2 + 230 + unit(seed, "wall|y|" + k) * 140, hp: SNOW.HP });
  return out;
}
function inWall(b, w) { return w.hp > 0 && Math.abs(b.x - w.x) <= SNOW.WW / 2 + SNOW.R && Math.abs(b.y - w.y) <= SNOW.WH / 2 + SNOW.R; }

export function init(o) {
  const N = SNOW, S = base(N, o);
  const mine = snowWalls(S.seed), theirs = snowWalls(S.seed).map((w) => ({ x: W - w.x, y: H - w.y, hp: w.hp }));
  S.st = { me: { x: W / 2, vx: 0 }, opp: W / 2, ammo: N.AMMO, load: 0, balls: [], mine, theirs };
  S.h = { aim: W / 2, throwIt: false, oppAmmo: N.AMMO, id: 0, oppClock: null, oldBurst: -1 };
  return S;
}
export function start(S) { S.started = true; }
export function input(S, i) { if (!i) return; if (num(i.x)) S.h.aim = clamp(i.x, SNOW.FR, W - SNOW.FR); if (i.fire) S.h.throwIt = true; }
export function tick(S) {
  const N = SNOW, st = S.st, h = S.h;
  loop(S, (d) => {
    const nx = reach(st.me.x, h.aim, d, N.VF); st.me.vx = (nx - st.me.x) / d; st.me.x = nx;
    if (st.ammo < N.AMMO) { st.load += d / N.RELOAD; if (st.load >= 1) { st.load = 0; st.ammo++; } }
    if (!h.oppClock) h.oppAmmo = Math.min(N.AMMO, h.oppAmmo + d / N.RELOAD);
    if (h.throwIt && S.started && st.ammo > 0) {
      st.ammo--; const b = { x: st.me.x, y: N.FY - N.FR, vx: clamp(st.me.vx * 0.25, -220, 220), vy: -N.V, mine: true, i: h.id++ };
      st.balls.push(b); send(S, { t: "throw", i: b.i, x: Math.round(W - b.x), vx: -b.vx }); fx(S, "throw", b.x, b.y, { mine: true });
    }
    h.throwIt = false;
    for (let k = st.balls.length - 1; k >= 0; k--) {
      const b2 = st.balls[k]; b2.x += b2.vx * d; b2.y += b2.vy * d;
      if (b2.x < N.R || b2.x > W - N.R) { b2.vx = -b2.vx; b2.x = clamp(b2.x, N.R, W - N.R); }
      if (b2.y < -40 || b2.y > H + 40) { st.balls.splice(k, 1); continue; }
      if (b2.mine || b2.y < H / 2) continue;
      let w = null; st.mine.forEach((x, j) => { if (w === null && inWall(b2, x)) w = j; });
      if (w !== null) { st.mine[w].hp--; st.balls.splice(k, 1); send(S, { t: "wall", i: b2.i, k: w }); fx(S, "wall", b2.x, b2.y, { mine: true, hp: st.mine[w].hp }); continue; }
      if (Math.abs(b2.x - st.me.x) <= N.FR + N.R && Math.abs(b2.y - N.FY) <= N.FR + N.R) { st.balls.splice(k, 1); send(S, { t: "hit", i: b2.i }); fx(S, "splat", st.me.x, N.FY, { mine: true }); concede(S, N, st.me.x, N.FY); if (S.over || S.ending) return; }
    }
  });
  report(S, () => send(S, { t: "p", x: Math.round(W - st.me.x) }));
}
export function receive(S, m) { if (!m || S.over) return; rec(S, m); }
function rec(S, m) {
  const N = SNOW, st = S.st, h = S.h;
  heard(S);
  if (finMsg(S, N, m)) return;
  if (S.ending && m.t !== "hit") return;
  if (m.t === "p" && num(m.x)) { st.opp = clamp(reach(st.opp, m.x, oppDt(S, Math.abs(m.x - st.opp), N.VF * 1.25), N.VF * 1.25), N.FR, W - N.FR); return; }
  if (m.t === "throw") {
    // Nachladen nach der Uhr des Werfers, aus einem Guthaben, das mit der Zeit dieses Handys waechst (arcade2.js:238-255).
    const extra = stall(S);
    if (num(m.ms)) {
      const CAP = N.AMMO * N.RELOAD + 1 + extra, t = clock(S);
      if (!h.oppClock) h.oppClock = { last: m.ms, budget: CAP, at: t };
      const oc = h.oppClock;
      oc.budget = Math.min(CAP, oc.budget + t - oc.at); oc.at = t;
      const give = Math.min(Math.max(0, m.ms - oc.last) / 1000, oc.budget);
      oc.budget -= give; oc.last = Math.max(oc.last, m.ms);
      h.oppAmmo = Math.min(N.AMMO, h.oppAmmo + give / N.RELOAD);
    } else if (!h.oppClock && extra && h.oldBurst !== S.burst.at) {
      h.oldBurst = S.burst.at; h.oppAmmo = Math.min(N.AMMO + extra / N.RELOAD, h.oppAmmo + extra / N.RELOAD);
    }
    if (!num(m.x) || !num(m.vx) || !num(m.i) || Math.abs(m.vx) > 221 || Math.abs(m.x - st.opp) > 260 || h.oppAmmo < 0.95) { reject(S); return; }
    h.oppAmmo -= 1;
    st.balls.push({ x: m.x, y: H - N.FY + N.FR, vx: m.vx, vy: N.V, mine: false, i: m.i }); fx(S, "throw", m.x, H - N.FY, { mine: false });
    return;
  }
  if (m.t === "wall" || m.t === "hit") {
    for (let k = st.balls.length - 1; k >= 0; k--) if (st.balls[k].mine && st.balls[k].i === m.i) { const b = st.balls[k]; st.balls.splice(k, 1); fx(S, m.t === "hit" ? "splat" : "wall", b.x, b.y, { mine: false }); }
    if (m.t === "wall" && num(m.k) && st.theirs[2 - m.k]) st.theirs[2 - m.k].hp = Math.max(0, st.theirs[2 - m.k].hp - 1);
    if (m.t === "hit") gain(S, N);
  }
}

// ---------- Bot (arcade2.js:269-280) ----------
export function botInit() { return { wait: 0, want: W / 2, err: 0 }; }
export function bot(S, B, r, dt) {
  B.wait -= dt; if (B.wait > 0) return; B.wait = 0.12 + r() * 0.08;
  const st = S.st, me = st.me.x; let danger = null;
  st.balls.forEach((b) => { if (!b.mine && b.vy > 0) { const t = (SNOW.FY - b.y) / b.vy, x = b.x + b.vx * t; if (t < 0.9 && Math.abs(x - me) < SNOW.FR + 40 && (!danger || t < danger.t)) danger = { t, x }; } });
  if (danger && r() < 0.8) B.want = danger.x < W / 2 ? danger.x + SNOW.FR * 2 + 60 : danger.x - SNOW.FR * 2 - 60;
  else { if (r() < 0.2) B.err = (r() - 0.5) * 260; B.want = st.opp + B.err; }
  input(S, { x: B.want, fire: st.ammo > 0 && Math.abs(me - st.opp) < 160 && r() < 0.45 });
}
export const rules = SNOW;
