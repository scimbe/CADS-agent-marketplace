// Arcade-Duelle, gemeinsame Bausteine (Port von alt:src/arcade.js:6-90 und alt:src/arcade2.js:11-70, 365-442).
// Jede Seite ist reiner Zustand (nur Daten, keine Closures). Zahlen: numeric "f64" (ADR 0001 b), nur + - * / und sqrt,
// die Zeit ist wie im Altcode die Summe der Schritte von 1/120 s. Eine Seite spricht nur ueber S.out (gesendete Nachrichten) und receive(); S.ev sind Ereignisse fuer
// die Anzeige. So ist der Bot eine zweite Seite im selben Zustand, und Live verbindet zwei Seiten ueber den Broker.
// Regel aus dem Altcode: Wessen Haelfte Puck, Ball oder Granate gerade hat, entscheidet mit der eigenen, unverzoegerten
// Figur, damit niemand einen Punkt ans Netz verliert. Aufschlaege, Wind und Insel kommen aus dem gemeinsamen Seed.
import { hypot, hashOf } from "./num.js";

export const W = 1000, H = 1600, TICK = 120, STEP = 1 / TICK;
export const NET_P = 0.05, NET_ST = 0.1, SERVE_PAUSE = 0.9, STALL_MAX = 6, FIN_WAIT = 6;
/** Fluechtige Teile einer Seite: nicht im Hash, nicht im Raster. */
export const VOLATILE = new Set(["out", "ev", "wall"]);

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function num(v) { return typeof v === "number" && Number.isFinite(v); }
export function body(b) { return !!b && num(b.x) && num(b.y) && num(b.vx) && num(b.vy) && Math.abs(b.x) < 5 * W && Math.abs(b.y) < 5 * H; }
export function copy(b) { return { x: b.x, y: b.y, vx: b.vx, vy: b.vy }; }
export function mirror(b) { return { x: W - b.x, y: H - b.y, vx: -b.vx, vy: -b.vy }; }
export function mirrorX(b) { return { x: W - b.x, y: b.y, vx: -b.vx, vy: b.vy }; }
export function speed(b) { return hypot(b.vx, b.vy); }
export function cap(b, max) { const s = speed(b); if (s > max) { b.vx *= max / s; b.vy *= max / s; } return b; }
/** Was das andere Handy per Finger bewegt, kommt nur so weit, wie ein Finger in der Zeit kommt (arcade.js:25). */
export function reach(prev, next, dt, vmax) { const max = vmax * Math.max(dt, 0.016), d = next - prev; return Math.abs(d) > max ? prev + Math.sign(d) * max : next; }
export function same(a, b) { return body(a) && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.vx - b.vx) < 0.5 && Math.abs(a.vy - b.vy) < 0.5; }

// ---------- Basis jeder Seite (arcade.js:29-80) ----------
/** o: { seed, serving, win } – win: Punkte zum Sieg einer freien Karte (1-9), sonst G.WIN. */
export function base(G, o) {
  const win = o.win;
  return {
    g: G.id, WIN: num(win) && win >= 1 && win <= 9 && win % 1 === 0 ? win : G.WIN, seed: String(o.seed), serving: !!o.serving,
    score: [0, 0], over: false, started: false, n: 0, t: 0, serveAt: 0, oppAt: 0, sentP: 0, sentSt: 0, rejected: 0,
    ending: false, endAt: 0, oppFin: null, draw: false, credit: null, lastIn: null, burst: { len: 0, at: -1 },
    st: {}, h: {}, out: [], ev: [], wall: null
  };
}
/** Uhr der Seite in Sekunden: die Spielzeit S.t; der Host darf eine Ankunftsuhr setzen (S.wall), wie alt o.clock. */
export function clock(S) { return S.wall !== null && S.wall !== undefined ? S.wall : S.t; }
export function send(S, m) {
  if (m.t === "p" || m.t === "shot" || m.t === "throw") m.ms = Math.round(clock(S) * 1000);
  S.out.push(m);
}
export function fx(S, k, x, y, more) {
  const e = { k, x, y }; if (more) for (const q of Object.keys(more)) e[q] = more[q];
  S.ev.push(e); if (S.ev.length > 80) S.ev.shift();
}
export function finish(S) { S.over = true; S.ending = false; S.serveAt = 0; S.draw = S.score[0] === S.score[1]; fx(S, S.draw ? "draw" : S.score[0] > S.score[1] ? "won" : "lost", W / 2, H / 2); }
/** Ende: bei G.fin (mehrere Granaten/Schneebaelle in der Luft) friert jede Seite ein und meldet ihre Treffer ("fin"). */
export function check(S, G) {
  if (S.over || !(S.score[0] >= S.WIN || S.score[1] >= S.WIN || S.oppFin !== null)) return;
  if (!G.fin) { finish(S); return; }
  if (!S.ending) { S.ending = true; S.endAt = S.t; S.serveAt = 0; send(S, { t: "fin", c: S.score[1] }); }
  if (S.oppFin !== null) { S.score[0] = Math.max(S.score[0], S.oppFin); finish(S); }
}
export function finMsg(S, G, m) {
  if (m.t !== "fin") return false;
  if (num(m.c) && m.c >= 0 && S.oppFin === null && (m.c >= S.WIN || S.score[1] >= S.WIN)) { S.oppFin = Math.min(S.WIN, m.c | 0); check(S, G); }
  return true;
}
/** Diese Seite hat den Punkt hergegeben: die andere punktet, wer verloren hat, schlaegt auf. */
export function concede(S, G, x, y) {
  if (S.over || S.ending) return;
  S.score[1]++; send(S, { t: "pt" }); fx(S, "lose", x, y); check(S, G); if (!S.over && G.serves) S.serveAt = S.t + SERVE_PAUSE;
}
export function gain(S, G) { S.score[0]++; fx(S, "score", W / 2, H / 4); check(S, G); }
export function startBase(S, G) { S.started = true; if (S.serving && G.serves) S.serveAt = S.t + 0.01; }
/** Fingerzeit fuer den naechsten Zug der anderen Seite (arcade.js:63-67). */
export function oppDt(S, dist, vmax) {
  const t = clock(S); S.credit = Math.min(0.5, (S.credit === null ? 0.1 : S.credit) + Math.max(0, t - S.oppAt)); S.oppAt = t;
  const use = Math.min(S.credit, Math.max(0.016, dist / vmax)); S.credit -= use; return use;
}
export function reject(S) { S.rejected++; return false; }
export function heard(S) {
  const t = clock(S);
  if (S.lastIn !== null && t - S.lastIn > 0.3) S.burst = { len: Math.min(t - S.lastIn, STALL_MAX), at: t };
  S.lastIn = t;
}
export function stall(S) { return clock(S) - S.burst.at < 0.5 ? S.burst.len : 0; }
/** Ein Tick (arcade.js:81-86 mit dt = 1/120, also genau ein Schritt). sub() rechnet die Regeln dieses Schritts.
 *  Die Zeit ist wie im Altcode die Fliesskomma-Summe der Schritte (bitgleich, + ist exakt spezifiziert). */
export function loop(S, sub) {
  if (S.over) return;
  if (S.ending) { S.t += STEP; if (S.t - S.endAt > FIN_WAIT) finish(S); return; }
  S.t += STEP; sub(STEP);
}
export function report(S, sendP, sendSt) {
  if (S.t - S.sentP >= NET_P) { S.sentP = S.t; sendP(); }
  if (sendSt && S.t - S.sentSt >= NET_ST) { S.sentSt = S.t; sendSt(); }
}
export function hashSide(S) { return hashOf(S, VOLATILE); }

// ---------- Ball, der der Haelfte gehoert, in der er ist (arcade2.js:11-49) ----------
const HOLD = 6;
/** G: { serve(seed, n), R, VMAX, free(b, d) } */
export function halfInit(S) { S.st.b = null; S.st.own = false; S.st.held = false; S.h.hitAt = -1; S.h.since = 0; }
function halfServe(S, G) { const st = S.st; st.b = G.serve(S.seed, S.n); st.own = true; st.held = false; S.h.since = S.t; send(S, { t: "serve", n: S.n, b: mirror(st.b) }); S.n++; S.serveAt = 0; fx(S, "serve", st.b.x, st.b.y); }
function halfGive(S, G) { const st = S.st; st.b = mirror(G.serve(S.seed, S.n)); st.own = false; st.held = false; send(S, { t: "give", n: S.n }); S.n++; fx(S, "give", st.b.x, st.b.y); }
export function halfStep(S, G, Rules, d, collide) {
  const st = S.st;
  if (S.serveAt && S.t >= S.serveAt) halfServe(S, G);
  const b = st.b; if (!b || st.held) return;
  if (st.own) {
    const w = G.free(b, d); if (w) fx(S, w, b.x, b.y);
    const h = collide(b); if (h && S.t - S.h.hitAt > 0.08) { S.h.hitAt = S.t; send(S, { t: "hit", b: mirror(b) }); fx(S, h === true ? "hit" : h, b.x, b.y, { v: speed(b) }); }
    if (b.y > H + G.R) { st.b = null; concede(S, Rules, b.x, H); return; }
    if (b.y < H / 2 && b.vy < 0) { st.own = false; send(S, { t: "pass", b: mirror(b) }); }
    else if (S.t - S.h.since > HOLD) halfGive(S, G);
  } else {
    G.free(b, d);
    if (b.y >= H / 2 && b.vy > 0) { b.y = H / 2; st.held = true; }
  }
}
export function halfReport(S) { return S.st.own && S.st.b ? () => send(S, { t: "st", b: mirror(S.st.b) }) : null; }
export function halfReceive(S, G, Rules, m, near) {
  const st = S.st;
  if (m.t === "pt") { st.b = null; st.own = false; gain(S, Rules); return true; }
  if (m.t === "serve" && num(m.n)) { if (!same(m.b, mirror(G.serve(S.seed, m.n)))) { reject(S); return true; } st.b = copy(m.b); st.own = false; st.held = false; S.n = m.n + 1; return true; }
  if (m.t === "give" && num(m.n)) { if (!st.own) { st.b = G.serve(S.seed, m.n); st.own = true; st.held = false; S.h.since = S.t; S.n = m.n + 1; fx(S, "serve", st.b.x, st.b.y); } return true; }
  if (m.t === "hit" || m.t === "st" || m.t === "pass") {
    if (st.own) return true;
    const b = m.b, ok = body(b) && speed(b) <= G.VMAX * 1.01 && (m.t === "pass" ? Math.abs(b.y - H / 2) <= 90 && b.vy > 0 : b.y <= H / 2 + G.R && (m.t !== "hit" || near(b)));
    if (!ok) { reject(S); return true; }
    st.b = copy(b); st.held = false;
    if (m.t === "pass") { st.own = true; S.h.since = S.t; } else if (m.t === "hit") fx(S, "ohit", b.x, b.y, { v: speed(b) });
    return true;
  }
  return false;
}
/** Scheibe gegen bewegte Scheibe (Figur, Bumper): herausgeschoben und abgeprallt; e = Sprungkraft (arcade2.js:51). */
export function bounce(b, R, c, CR, cvx, cvy, e) {
  const dx = b.x - c.x, dy = b.y - c.y, d = Math.sqrt(dx * dx + dy * dy), min = R + CR;
  if (d >= min) return false;
  const nx = d ? dx / d : 0, ny = d ? dy / d : -1;
  b.x = c.x + nx * min; b.y = c.y + ny * min;
  const rv = (b.vx - cvx) * nx + (b.vy - cvy) * ny;
  if (rv < 0) { b.vx -= (1 + e) * rv * nx; b.vy -= (1 + e) * rv * ny; }
  return true;
}
export function tableWalls(b, d, R, mouth, fric) {
  const f = 1 - fric * d; let hit = "";
  b.x += b.vx * d; b.y += b.vy * d; b.vx *= f; b.vy *= f;
  if (b.x < R) { b.x = 2 * R - b.x; b.vx = Math.abs(b.vx) * 0.9; hit = "wall"; }
  if (b.x > W - R) { b.x = 2 * (W - R) - b.x; b.vx = -Math.abs(b.vx) * 0.9; hit = "wall"; }
  if (Math.abs(b.x - W / 2) >= mouth / 2 - R * 0.4) {
    if (b.y > H - R && b.y < H + R) { b.y = 2 * (H - R) - b.y; b.vy = -Math.abs(b.vy) * 0.9; hit = "wall"; }
    if (b.y < R && b.y > -R) { b.y = 2 * R - b.y; b.vy = Math.abs(b.vy) * 0.9; hit = "wall"; }
  }
  return hit;
}

// ---------- Rundenspiele mit Scheiben: Eis-Stock und Murmel-Ring (arcade2.js:365-442) ----------
// Beide Handys spielen jeden Wurf im selben Bezugssystem (dem des Einladenden), in festen Schritten und nur mit
// + - * / und sqrt, also Bit fuer Bit gleich. Das eingeladene Handy zeichnet dieses Bild gedreht.
export function discStep(D, list) {
  const dt = STEP; let moving = false;
  for (let i = 0; i < list.length; i++) {
    const s = list[i], v = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    if (v > 0) { const nv = v - D.DECEL * dt; if (nv <= D.STOP) { s.vx = 0; s.vy = 0; } else { s.vx = s.vx * nv / v; s.vy = s.vy * nv / v; moving = true; } }
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (D.SIDE) {
      if (s.x < s.r) { s.x = s.r; s.vx = -s.vx * 0.5; }
      if (s.x > W - s.r) { s.x = W - s.r; s.vx = -s.vx * 0.5; }
    }
  }
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, min = a.r + b.r;
    if (d2 >= min * min || d2 === 0) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (min - d) / 2;
    a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rv < 0) { const jj = -(1 + D.E) * rv / 2; a.vx -= jj * nx; a.vy -= jj * ny; b.vx += jj * nx; b.vy += jj * ny; moving = true; a.hit = b.hit = -rv; }
  }
  return moving;
}
export function turnInit(D, o) {
  const S = base(D, o), me = o.serving ? 0 : 1;
  S.flip = me === 1; S.me = me;
  S.st = { list: [], n: 0, turn: 0, rolling: false, at: 0, flip: S.flip };
  S.h = { queue: [], throwIt: null };
  D.setup(S, S.st, 0);
  return S;
}
export function mineTurn(S) { return S.started && !S.over && !S.st.rolling && S.st.turn === S.me && !S.h.queue.length; }
export function turnStart(S) { S.started = true; S.st.at = S.t; }
export function turnInput(S, i) {
  if (!i || !i.shot || !num(i.shot.vx) || !num(i.shot.vy)) return;
  const x = num(i.shot.x) ? i.shot.x : W / 2;
  S.h.throwIt = S.flip ? { x: W - x, vx: -i.shot.vx, vy: -i.shot.vy } : { x, vx: i.shot.vx, vy: i.shot.vy };
}
function launch(D, S, p, x, vx, vy) {
  const st = S.st, v = Math.sqrt(vx * vx + vy * vy);
  if (v > D.VMAX) { vx = vx * D.VMAX / v; vy = vy * D.VMAX / v; }
  D.launch(S, st, p, x, vx, vy); st.rolling = true; st.n++; fx(S, "throw", x, p === 0 ? H - D.FROM : D.FROM, { p });
}
export function turnTick(D, S) {
  const st = S.st, h = S.h; if (S.over) return;
  S.t += STEP;
  while (S.started && !st.rolling && h.queue.length) {
    const qq = h.queue.shift(), who = D.turnOf(st, st.n);
    if (who === S.me || (who === 0 ? qq.vy > 0 : qq.vy < 0)) reject(S); else launch(D, S, who, qq.x, qq.vx, qq.vy);
  }
  if (mineTurn(S)) {
    if (!h.throwIt && S.t - st.at > D.LATE) h.throwIt = D.late(S.seed, st.n, S.me);
    const ti = h.throwIt;
    if (ti && (S.me === 0 ? ti.vy < -D.VMIN : ti.vy > D.VMIN)) { const x = D.fromX(ti.x); send(S, { t: "throw", n: st.n, x, vx: ti.vx, vy: ti.vy }); launch(D, S, S.me, x, ti.vx, ti.vy); }
  }
  h.throwIt = null;
  if (!st.rolling) return;
  const moving = discStep(D, st.list);
  // Altcode: die Anzeige las s.hit und setzte es zurueck; hier wird daraus ein Ereignis, der Zustand bleibt rein.
  for (const s of st.list) if (s.hit) { fx(S, "clack", s.x, s.y, { v: s.hit, p: s.p, c: s.c, shooter: !!s.shooter }); delete s.hit; }
  if (!moving) { st.rolling = false; st.at = S.t; D.settle(S, st); }
}
export function turnReceive(D, S, m) {
  const st = S.st, h = S.h; if (!m || S.over || m.t !== "throw") return;
  const expect = st.n + h.queue.length;
  if (m.n !== expect || !num(m.x) || !num(m.vx) || !num(m.vy) || m.x !== D.fromX(m.x) || Math.sqrt(m.vx * m.vx + m.vy * m.vy) > D.VMAX * 1.001) { reject(S); return; }
  if (!st.rolling && !h.queue.length) { const who = D.turnOf(st, st.n); if (who === S.me || (who === 0 ? m.vy > 0 : m.vy < 0)) { reject(S); return; } }
  else if (h.queue.length >= 2) { reject(S); return; }
  h.queue.push({ x: m.x, vx: m.vx, vy: m.vy });
}
/** Punkte im gemeinsamen Bild: Spieler 0 ist der Einladende; diese Seite zaehlt sich zuerst. */
export function point(S, D, p, k) { const mine = p === S.me; S.score[mine ? 0 : 1] += k || 1; fx(S, mine ? "score" : "lose", W / 2, H / 2, { n: k || 1 }); check(S, D); }
