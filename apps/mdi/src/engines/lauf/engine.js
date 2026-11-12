// Engine E3 Lauf (Runner und Plattformer), reine Logik ohne DOM, bitgenau aus alt:src/lauf-engine.js.
// Gleiches Dokument + gleiche Eingaben an denselben Ticks = gleicher Lauf; jedes Stueck Strecke kommt aus dem Seed.
// ev 1: fester Schritt, Eingaben nur am Tick, im Lauf nur + - * / floor sqrt min max (bitgleich auf jeder Engine).
// ev 0 (alte Links ohne ev) behaelt seine alte Sinus-Flugbahn im eingefrorenen Block V0, damit alte Links spielen wie damals.
import { mulberry32 } from "../flug/rng.js";
import { sanitize } from "./params.js";

export const H = 360, GY = 280, YMIN = 170, YMAX = 310, PW = 26, PH = 40, DH = 22, STEP = 1 / 120, HOLD = 0.24, HOLDG = 0.42, TERM = 1100, COY = 0.09, BUF = 0.12, SAFE = 0.8, AHEAD = 1600;
export function speedAt(p, x) { return Math.min(p.vm, p.v + p.a * Math.max(0, x) / 1000); }
function vert(b, held, g) {
  const m = held && b.ht > 0 && b.vy < 0 ? HOLDG : 1;
  b.ht -= STEP; b.vy = Math.min(b.vy + g * m * STEP, TERM); b.y += b.vy * STEP;
}
function arc(p) {
  const b = { y: 0, vy: -p.j, ht: HOLD }, up = [];
  while (b.y < 500 && up.length < 4000) { vert(b, true, p.g); up.push(-b.y); }
  return up;
}
export function jumps(p) {
  const up = arc(p), top = Math.max.apply(null, up);
  return {
    top,
    air(h) { for (let i = up.length - 1; i >= 0; i--) if (up[i] >= h) return (i + 1) * STEP; return 0; },
    above(h) { let n = 0; for (let i = 0; i < up.length; i++) if (up[i] >= h) n++; return n * STEP; }
  };
}
export const FLY = 192, FAMP = 22;
function fly(it, ticks) {
  const u = (ticks + it.fph) % FLY, tri = u < FLY / 2 ? u : FLY - u;
  return it.base - 64 + Math.floor((4 * tri - FLY) * FAMP * 256 / FLY) / 256;
}
// ---- ev 0, frozen (only here, never in the ev 1 run) ----
const V0 = { fly(it, ticks) { return it.base - 64 + Math.sin(ticks * STEP * 3.9 + it.ph) * 22; } };
// ---- end ev 0 ----

export function createSim(input) {
  const l = sanitize(input);
  const p = l.p, rng = mulberry32(l.seed), J = jumps(p), r = () => rng(), v1 = (l.ev || 0) >= 1, path = v1 ? fly : V0.fly;
  const s = { l, p, J, H, PW, state: "ready", ticks: 0, coins: 0, stomps: 0, held: false, duck: false,
    me: { x: 0, y: GY, vy: 0, ht: 0, on: true, coy: 0, want: 0 }, spans: [], items: [], goal: l.m === "ziel" ? l.p.len * 10 : 0, end: false };
  const inq = { jump: false, held: false, duck: false };
  let gx = -300, gy = GY, n = 0;
  function put(it) { s.items.push(it); return it; }
  function fill(sp) {
    const v = speedAt(p, sp.x0), gapS = v * J.air(0) * 1.15 + 70, stop = sp.x1 - 130 - v * 0.25;
    const hz = [p.hi, p.du, p.ge, p.fa], sum = hz.reduce((a, b) => a + b, 0);
    for (let x = sp.x0 + (n === 1 ? 900 : 150); x < stop; x += gapS * (1 + r() * 0.6)) {
      const u = r() * Math.max(100, sum); let k = -1;
      for (let i = 0, c = 0; i < 4; i++) { c += hz[i]; if (u < c) { k = i; break; } }
      const w = 28 + r() * 14; let h = 18 + r() * (Math.min(60, J.top * 0.55) - 18);
      while (h > 10 && J.above(h + 4) * speedAt(p, x) < w + PW + 24) h -= 4;
      if (k === 0 && h > 10) put({ t: "o", x, y: sp.y - h, w, h });
      else if (k === 1) put({ t: "d", x, y: sp.y - 420, w: 50 + r() * 50, h: 420 - 28 });
      else if (k === 2) {
        const f = l.fp[Math.floor(r() * l.fp.length)], ph = r() * 6.28;
        put({ t: "f", k: f, x, x0: sp.x0 + 10, x1: sp.x1 - 10, y: f === "flug" ? sp.y - 64 : sp.y - 26, base: sp.y, w: 26, h: 26, vx: -40, vy: 0, ph, fph: Math.floor(ph * FLY / 6.28), live: true });
      } else if (k === 3 && h > 10) put({ t: "x", x, y: -60, to: sp.y - Math.min(30, h), w: Math.min(30, h), h: Math.min(30, h), vy: 0, at: x - speedAt(p, x) * 1.2, go: false });
      if (r() * 100 < p.mu) {
        const cy = sp.y - 24 - r() * Math.min(100, J.top * 0.7), cn = 3 + Math.floor(r() * 3);
        for (let j = 0; j < cn; j++) put({ t: "c", x: x + gapS * 0.5 + j * 30 - cn * 15, y: cy - 10, w: 20, h: 20, live: true });
      }
    }
  }
  function more() {
    let sp;
    if (s.end) return;
    if (n === 0) sp = { x0: -400, x1: 700, y: GY };
    else {
      const v = speedAt(p, gx); let gap = 0, ty = Math.max(YMIN, Math.min(YMAX, gy + (r() * 2 - 1) * p.hv * 1.1));
      if (r() * 100 < p.lu) {
        ty = Math.max(ty, gy - J.top * 0.7);
        const reach = v * J.air(gy - ty) * SAFE;
        gap = Math.min(reach, 40 + r() * Math.max(0, reach - 40) * p.lw / 100);
        if (reach < 40) { gap = 0; ty = gy; }
      } else ty = Math.max(ty, gy - J.top * 0.5);
      const len = (300 + r() * 500) * Math.max(1, v / 220);
      sp = { x0: gx + gap, x1: gx + gap + len, y: ty };
      if (s.goal && sp.x1 >= s.goal) { sp.x1 = Math.max(sp.x0 + 900, s.goal + 900); s.end = true; s.gx = put({ t: "g", x: Math.max(s.goal, sp.x0 + 200), y: sp.y - 90, w: 20, h: 90 }).x; }
    }
    n++; s.spans.push(sp); gx = sp.x1; gy = sp.y;
    if (!s.end) fill(sp);
  }
  function grow() {
    while (gx < s.me.x + AHEAD && !s.end) more();
    if (s.ticks % 30) return;
    while (s.spans.length > 2 && s.spans[0].x1 < s.me.x - 600) s.spans.shift();
    s.items = s.items.filter((it) => it.x + (it.w || 0) > s.me.x - 600 || it.t === "g");
  }
  grow();
  function hit(a, b) { return a.x0 < b.x + b.w && a.x1 > b.x && a.y0 < b.y + b.h && a.y1 > b.y; }
  s.press = function () { if (s.state === "ready") { s.state = "run"; return ["start"]; } if (s.state === "run") { inq.jump = true; inq.held = true; } return []; };
  s.release = function () { inq.held = false; };
  s.setDuck = function (on) { inq.duck = !!on; };
  s.speed = function () { return speedAt(p, s.me.x); };
  s.meters = function () { return Math.floor(Math.max(0, s.me.x) / 10); };
  s.points = function () { return s.meters() + s.coins * 5 + s.stomps * 10; };
  s.height = function () { return s.duck && s.me.on ? DH : PH; };
  s.step = function () {
    const ev = [], m = s.me, dt = STEP;
    if (s.state !== "run") return ev;
    if (inq.jump) { m.want = BUF; inq.jump = false; }
    s.held = inq.held; s.duck = inq.duck;
    s.ticks++;
    const px = m.x, py = m.y;
    m.x += speedAt(p, m.x) * dt;
    m.want -= dt; m.coy -= dt;
    if (m.want > 0 && (m.on || m.coy > 0)) { m.vy = -p.j; m.ht = HOLD; m.on = false; m.coy = 0; m.want = 0; ev.push("jump"); }
    vert(m, s.held, p.g);
    const was = m.on; let under = null;
    m.on = false;
    for (const sp of s.spans) {
      if (m.x + PW / 2 <= sp.x0 || m.x - PW / 2 >= sp.x1) continue;
      if (px + PW / 2 <= sp.x0 && m.y > sp.y + 4) { s.state = "over"; ev.push("dead"); return ev; }
      if (m.vy >= 0 && py <= sp.y + 0.5 && m.y >= sp.y && (!under || sp.y < under.y)) under = sp;
    }
    if (under) { m.y = under.y; m.vy = 0; m.on = true; if (!was) ev.push("land"); } else if (was) m.coy = COY;
    const hh = s.height(), me = { x0: m.x - PW / 2 + 3, x1: m.x + PW / 2 - 3, y0: m.y - hh + 3, y1: m.y };
    for (const it of s.items) {
      if (it.t === "f" && it.live) {
        if (it.k === "flug") { it.x += it.vx * dt; it.y = path(it, s.ticks); }
        else {
          it.x += it.vx * dt; if (it.x < it.x0 || it.x > it.x1 - it.w) it.vx = -it.vx;
          if (it.k === "huepf") { it.vy += 1400 * dt; it.y += it.vy * dt; if (it.y >= it.base - it.h) { it.y = it.base - it.h; it.vy = -460; } }
        }
      } else if (it.t === "x") {
        if (!it.go && m.x >= it.at) it.go = true;
        if (it.go && it.y < it.to) { it.vy += 1200 * dt; it.y = Math.min(it.to, it.y + it.vy * dt); }
      }
      if (it.live === false || !hit(me, it)) continue;
      if (it.t === "c") { it.live = false; s.coins++; ev.push("coin"); }
      else if (it.t === "g") { s.state = "goal"; ev.push("goal"); return ev; }
      else if (it.t === "f" && m.vy > 0 && py - 2 <= it.y + 6) { it.live = false; s.stomps++; m.vy = -p.j * 0.6; m.ht = 0; ev.push("stomp"); }
      else { s.state = "over"; ev.push("dead"); return ev; }
    }
    if (v1 && s.gx != null && me.x1 >= s.gx) { s.state = "goal"; ev.push("goal"); return ev; }
    if (m.y > H + 80) { s.state = "over"; ev.push("dead"); return ev; }
    grow();
    return ev;
  };
  return s;
}

// Einfacher Spieler (alt:src/lauf-ui.js bot): springt vor Luecken, Stufen und Bloecken; vor einer Luecke erst an der Kante.
export function bot(s) {
  const m = s.me, v = s.speed(), near = m.x + v * 0.22, edge = m.x + v * 0.04 + 14; let want = false;
  for (let i = 0; i < s.spans.length; i++) { const sp = s.spans[i], nx = s.spans[i + 1], lim = nx && nx.x0 > sp.x1 ? edge : near + 20; if ((sp.x1 > m.x && sp.x1 < lim) || (sp.x0 > m.x && sp.x0 < near && sp.y < m.y - 2)) want = true; }
  for (const it of s.items) if (it.t !== "c" && it.t !== "d" && it.live !== false && it.x > m.x && it.x < near) want = true;
  if (want && m.on) s.press(); else if (!want && m.vy > -100) s.release();
}
// Standbild der Karte: die Strecke einen Moment nach dem Start (300 Ticks Bot).
export function still(l) {
  const s = createSim(l); s.press();
  for (let i = 0; i < 300 && s.state === "run"; i++) { bot(s); s.step(); }
  s.state = "run"; return s;
}
