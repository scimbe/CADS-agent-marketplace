// Anzeige der Arcade-Duelle als Canvas-Anzeigeliste (ADR 0001 b). Port von alt:src/arcade-ui.js:43-415 (DRAW je Spiel,
// Licht, Partikel, Wackeln, Blitz, Zielpunkte). Rein: die Anzeige ist eine Funktion von Zustand und Anzeigezeit.
// Partikel entstehen aus dem Ereignisprotokoll (fx) mit festem Wuerfel je Ereignis und geschlossener Bewegungsformel,
// statt wie im Altcode in einer veraenderlichen Liste; so braucht die Anzeige kein eigenes Gedaechtnis.
// Anpassung: Farben (a, b), Figur-Emoji, eigenes Foto als Figur oder Hintergrund (nur als lokaler Slot, nie Pixel).
import { W, H, mineTurn } from "./core.js";
import { expD, sinD, cosD, PI } from "./num.js";
import { META, GLASS } from "./meta.js";
import { PUCK } from "./puck.js";
import { ZIEGEL } from "./ziegel.js";
import { VOLLEY } from "./volley.js";
import { PANZER, tankPos } from "./panzer.js";
import { KICK, kickRods } from "./kick.js";
import { FLIP, flipSeg } from "./flipper.js";
import { SNOW } from "./snow.js";
import { ELF } from "./elfer.js";
import { STOCK } from "./stock.js";
import { MURMEL } from "./murmel.js";

const TAU = 2 * PI;
// ---------- Bausteine ----------
const HEX = "0123456789abcdef";
const hx = (n) => { n = Math.max(0, Math.min(255, Math.round(n))); return HEX[n >> 4] + HEX[n & 15]; };
export function rgba(r, g, b, a) { return "#" + hx(r) + hx(g) + hx(b) + hx(a * 255); }
function withA(col, a) { return col.length === 7 ? col + hx(a * 255) : col; }
const lin = (y0, y1, stops) => ({ lin: [0, y0, 0, y1], stops: stops.map((s, i) => [i / (stops.length - 1), s]) });
const rad = (x, y, r, a, b) => ({ rad: [x, y, 0, r], stops: [[0, a], [1, b]] });
const glow = (x, y, r, color, alpha) => ({ o: "glow", x, y, r, color, alpha: alpha === undefined ? 0.8 : alpha });
const disc = (x, y, r, fill, more) => Object.assign({ o: "circle", x, y, r: Math.max(0, r), fill }, more || {});
const rect = (x, y, w, h, fill, more) => Object.assign({ o: "rect", x, y, w, h, fill }, more || {});
const line = (x1, y1, x2, y2, stroke, lw, more) => Object.assign({ o: "line", x1, y1, x2, y2, stroke, lw }, more || {});
const vignette = () => rect(0, 0, W, H, rad(W / 2, H / 2, H * 0.75, "#00000000", "#0000008c"));
/** Fester Wuerfel: n-ter Wert einer Folge zu einem Schluessel (mulberry32 auf einer Ganzzahl). */
function dice(key) {
  let a = key >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function specks(n, col, seed, size) { const r = dice(strHash(seed)), out = []; for (let i = 0; i < n; i++) out.push(rect(r() * W, r() * H, size || 3, size || 3, col)); return out; }

// ---------- Partikel aus Ereignissen (alt P.add, arcade-ui.js:62-68, Bewegung :123) ----------
// Je Ereignis eine Liste von Spritzern {n, o}; o wie im Altcode: dir/spread, v0/v1, l0/l1, s0/s1, c, g, drag, glow, sq.
function burst(e, m, g) {
  const v = e.v || 600, k = e.k;
  switch (k) {
    case "hit": case "ohit": case "kick": case "flip": case "bump":
      return { parts: [[6 + v / 140, { c: k === "ohit" ? m.b : m.a, v0: 80, v1: 220 + v * 0.35, l1: 0.45, s0: 3, s1: 7, glow: true }]], bump: Math.min(9, v / 260) };
    case "wall": case "net": return { parts: [[4, { c: g === "snow" ? "#ffffff" : "#cfd8ff", v1: 200, l1: 0.3, s1: 5 }]], bump: g === "snow" ? 4 : 0 };
    case "brick": return { parts: [[18, { c: e.mine ? m.a : m.b, v0: 120, v1: 520, g: 1600, drag: 0.5, l0: 0.6, l1: 1.2, s0: 8, s1: 18, sq: true }], [10, { c: "#c9b8a6", v1: 160, l1: 0.9, s0: 10, s1: 26, drag: 3 }]], bump: 8 };
    case "lose": case "tank": case "splat": {
      const p = [[k === "splat" ? 30 : 34, { c: k === "splat" ? "#ffffff" : m.b, v0: 150, v1: 760, l0: 0.5, l1: 1.2, s0: 5, s1: 14, glow: k !== "splat", g: k === "splat" ? 900 : 0 }]];
      if (k === "tank") p.push([20, { c: "#ffb347", v1: 520, l1: 1, s0: 10, s1: 24, glow: true }]);
      const hard = k === "lose" || e.mine;
      return { parts: p, bump: hard ? 16 : 0, flash: hard ? [0.32, "#ff3b1d"] : null, ymax: H - 20 };
    }
    case "score": return { parts: [[26, { c: m.a, v0: 120, v1: 640, l1: 1.1, s0: 4, s1: 11, glow: true }]], flash: [0.16, m.a], text: ["+" + (e.n || 1), W / 2, H * 0.3, m.a], ymin: 60 };
    case "serve": case "give": case "draw": return { ring: m.a };
    case "jump": return { parts: [[6, { c: "#f3d9a0", dir: -1.57, spread: 2.4, v1: 160, l1: 0.4, s0: 6, s1: 12 }]] };
    case "land": return { parts: [[10, { c: "#f3d9a0", dir: -1.57, spread: 3, v1: 220, l1: 0.5, s0: 6, s1: 14, g: 600 }]] };
    case "fire": return { parts: [[10, { c: "#ffd27a", v1: 260, l1: 0.3, glow: true }], [8, { c: "#9aa0a8", v1: 90, l1: 1.1, s0: 10, s1: 22, drag: 1 }]], bump: e.mine ? 5 : 0 };
    case "boom": return { parts: [[26, { c: "#ffb347", v0: 80, v1: 520, l1: 0.7, s0: 6, s1: 18, glow: true }], [16, { c: "#6b4a2a", dir: -1.57, spread: 2.6, v0: 200, v1: 700, g: 1500, drag: 0.4, l0: 0.6, l1: 1.3, s0: 5, s1: 11, sq: true }], [10, { c: "#7d7f86", v1: 120, l1: 1.6, s0: 16, s1: 36, drag: 1 }]], bump: 12, flash: [0.18, "#ffd27a"] };
    case "splash": return { parts: [[18, { c: "#9fd8ff", dir: -1.57, spread: 1.4, v0: 200, v1: 620, g: 1500, drag: 0.3, l1: 1, s0: 4, s1: 9 }]] };
    case "save": return { parts: [[14, { c: m.b, v1: 400, l1: 0.6, glow: true }]], text: ["✋", e.x, H * 0.22, m.b] };
    case "saved": return { parts: [[18, { c: m.a, v1: 500, l1: 0.7, glow: true }]], text: ["✋", e.x, H * 0.75, m.a], bump: 8 };
    case "miss": return { text: ["✗", e.x, H * 0.5, "#ffffff"] };
    case "out": return { parts: [[16, { c: GLASS[(e.c | 0) % GLASS.length], v1: 420, l1: 0.8, s0: 3, s1: 7, glow: true }]], bump: 5 };
    case "clack": return { parts: [[e.shooter || g === "stock" ? 6 : 5, { c: g === "murmel" && !e.shooter ? GLASS[(e.c | 0) % GLASS.length] : "#ffffff", v1: g === "murmel" ? 240 : 260, l1: g === "murmel" ? 0.3 : 0.35, s1: g === "murmel" ? 5 : 6, glow: g === "murmel" }]] };
    case "won": return { parts: [[50, { c: m.a, v0: 200, v1: 900, g: 700, l0: 1, l1: 2, s0: 6, s1: 14, sq: true, drag: 0.6 }], [50, { c: m.b, v0: 200, v1: 900, g: 700, l0: 1, l1: 2, s0: 6, s1: 14, sq: true, drag: 0.6 }]], cx: W / 2, cy: H * 0.4 };
    case "lost": return { flash: [0.25, "#000000"] };
    default: return null;
  }
}
/** Effekte aller Ereignisse im Protokoll zum Zeitpunkt now (Sekunden). calm: reduzierte Bewegung. */
function effects(log, now, m, g, calm) {
  const glowL = [], dots = [], sq = [], texts = [], rings = []; let shake = 0, flash = null;
  for (const e of log) {
    const age = now - e.at; if (age < 0 || age > 2.2) continue;
    const b = burst(e, m, g); if (!b) continue;
    const x0 = b.cx !== undefined ? b.cx : e.x, y0raw = b.cy !== undefined ? b.cy : e.y;
    const y0 = b.ymax !== undefined ? Math.min(b.ymax, y0raw) : b.ymin !== undefined ? Math.max(b.ymin, y0raw) : y0raw;
    if (b.bump && !calm) shake = Math.max(shake, b.bump * expD(-age * 9));
    if (b.flash && !calm) { const a = b.flash[0] * expD(-age * 7); if (a > 0.01 && (!flash || a > flash[0])) flash = [a, b.flash[1]]; }
    if (b.text && age < 1.1) texts.push({ s: b.text[0], x: b.text[1], y: b.text[2] - age * (calm ? 0 : 90), c: b.text[3], a: Math.max(0, 1 - age / 1.1) });
    if (b.ring && age < 0.7) rings.push({ x: e.x, y: e.y, r: age * 500, a: Math.max(0, 1 - age * 1.6), c: b.ring });
    if (!b.parts) continue;
    const r = dice(e.id * 7919 + 13);
    for (const [nn, o] of b.parts) {
      const n = Math.round(nn * (calm ? 0.35 : 1));
      for (let i = 0; i < n; i++) {
        const sp = o.spread || 3.2, ang = o.dir !== undefined ? o.dir + (-(sp) + r() * 2 * sp) / 2 : r() * TAU, v = (o.v0 || 60) + r() * ((o.v1 || 400) - (o.v0 || 60));
        const life = (o.l0 || 0.3) + r() * ((o.l1 || 0.8) - (o.l0 || 0.3)), s = (o.s0 || 4) + r() * ((o.s1 || 10) - (o.s0 || 4));
        if (age >= life) continue;
        const d = o.drag === undefined ? 2 : o.drag, gr = o.g || 0, vx = cosD(ang) * v, vy = sinD(ang) * v;
        let x, y;
        if (d > 0) { const f = (1 - expD(-d * age)) / d; x = x0 + vx * f; y = y0 + (gr / d) * age + (vy - gr / d) * f; }
        else { x = x0 + vx * age; y = y0 + vy * age + 0.5 * gr * age * age; }
        const al = 1 - age / life, c = o.c || "#ffffff";
        if (o.glow) glowL.push([x, y, s * 3, al, c]); else if (o.sq) sq.push([x, y, s, al, c]); else dots.push([x, y, s, al, c]);   // particles: Groesse = Durchmesser (canvas.js)
      }
    }
  }
  const ops = [];
  if (glowL.length) ops.push({ o: "particles", shape: "glow", list: glowL.slice(0, 420) });
  if (sq.length) ops.push({ o: "particles", shape: "sq", list: sq.slice(0, 420) });
  if (dots.length) ops.push({ o: "particles", shape: "dot", list: dots.slice(0, 420) });
  for (const g2 of rings) ops.push({ o: "arc", x: g2.x, y: g2.y, r: g2.r, a0: 0, a1: 1, stroke: g2.c, lw: 6, alpha: g2.a });
  return { ops, texts, shake, flash };
}

// ---------- je Spiel (alt DRAW, arcade-ui.js:155-408) ----------
function trail(b, n, r, color) {   // Spur aus der Geschwindigkeit nach hinten (alt: Liste der letzten Lagen)
  const ops = [];
  for (let i = n; i >= 1; i--) { const a = (n - i + 1) / n; ops.push(disc(b.x - b.vx * i / 60, b.y - b.vy * i / 60, r * (0.4 + 0.6 * a), color, { alpha: a * 0.35 })); }
  return ops;
}
function photoAt(look, x, y, r) { return look.photo === "figure" ? [{ o: "image", src: { kind: "local", slot: "photo" }, x: x - r, y: y - r, w: 2 * r, h: 2 * r, fit: "cover", clip: "circle" }] : []; }
function emojiAt(look, x, y, size) { return look.emoji ? [{ o: "sprite", emoji: look.emoji, x, y, w: size, h: size }] : []; }   // sprite: x,y ist die Mitte (canvas.js)
/** Eigene Figur: Foto, wenn gewaehlt, sonst Emoji, wenn gewaehlt (zusaetzlich zur gezeichneten Figur). */
function mine(look, x, y, r) { return look.photo === "figure" ? photoAt(look, x, y, r) : emojiAt(look, x, y, r * 1.3); }

const DRAW = {
  puck: {
    bg(m) {
      const U = PUCK, r = dice(strHash("ice")), ops = [rect(0, 0, W, H, rad(W / 2, H / 2, H * 0.7, "#0e3342", "#03101a"))];
      for (let i = 0; i < 70; i++) { const x = r() * W, y = r() * H; ops.push(line(x, y, x + (r() - 0.5) * 160, y + (r() - 0.5) * 60, "#b4f0ff0f", 2)); }
      ops.push(line(0, H / 2, W, H / 2, "#00e5ff59", 6, { dash: [24, 18] }), { o: "arc", x: W / 2, y: H / 2, r: 150, a0: 0, a1: 1, stroke: "#00e5ff59", lw: 6 });
      for (const [y, c] of [[H, m.a], [0, m.b]]) ops.push(rect(W / 2 - U.GOAL / 2, y - 16, U.GOAL, 32, "#000000", { stroke: c, lw: 8, shadow: { color: c, blur: 30 } }));
      ops.push(rect(5, 5, W - 10, H - 10, null, { stroke: "#bff6ff", lw: 10, shadow: { color: "#7fe9ff", blur: 24 } }), vignette());
      return ops;
    },
    fg(S, m, look) {
      const st = S.st, U = PUCK, p = st.p, ops = [];
      for (const [f, c, own] of [[st.opp, m.b, false], [st.me, m.a, true]]) {
        ops.push(glow(f.x, f.y, U.MR * 2.4, c, 0.55), disc(f.x, f.y, U.MR, rad(f.x - 20, f.y - 20, U.MR * 1.4, "#ffffff", c)), disc(f.x, f.y, U.MR * 0.55, c), disc(f.x - 8, f.y - 10, U.MR * 0.3, "#ffffffa6"));
        if (own) ops.push(...mine(look, f.x, f.y, U.MR * 0.55));
      }
      if (p) ops.push(...trail(p, 10, U.PR, "#bff6ff"), glow(p.x, p.y, U.PR * 3.5, "#7fe9ff", 0.7), disc(p.x, p.y, U.PR, "#f4fbff"), disc(p.x, p.y, U.PR * 0.7, "#1c2a33"), disc(p.x, p.y, U.PR * 0.45, "#e6f7ff"));
      return ops;
    }
  },
  ziegel: {
    bg() {
      const ops = [rect(0, 0, W, H, lin(0, H, ["#1e130c", "#2a1a10", "#1e130c"]))];
      for (let y = 0; y < H; y += 60) for (let x = (y / 60) % 2 ? 0 : 60; x < W; x += 120) ops.push(rect(x, y, 120, 60, null, { stroke: "#ffb4780d", lw: 3 }));
      ops.push(line(0, H / 2, W, H / 2, "#ff7a1a59", 5, { dash: [20, 20] }), vignette());
      return ops;
    },
    fg(S, m, look) {
      const st = S.st, Z = ZIEGEL, bw = W / Z.NB, b = st.b, ops = [];
      const wall = (list, y, col) => list.forEach((on, i) => {
        const x = i * bw;
        if (!on) { for (let k = 0; k < 4; k++) ops.push(rect(x + 14 + k * 26, y + Z.BH / 2 - 8 + (k % 2) * 6, 18, 10, "#785a4680")); return; }
        ops.push(rect(x + 4, y - Z.BH / 2, bw - 8, Z.BH, col), rect(x + 4, y - Z.BH / 2, bw - 8, 7, "#ffffff40"), rect(x + 4, y + Z.BH / 2 - 7, bw - 8, 7, "#00000040"));
      });
      wall(st.mine, Z.WY, m.a); wall(st.theirs, H - Z.WY, m.b);
      for (const [x, y, c, own] of [[st.me, Z.PY, m.a, true], [st.opp, H - Z.PY, m.b, false]]) {
        ops.push(glow(x, y, 180, c, 0.35), rect(x - Z.PW / 2, y - 12, Z.PW, 24, c, { r: 12 }), rect(x - Z.PW / 2 + 14, y - 8, Z.PW - 28, 5, "#ffffff80"));
        if (own) ops.push(...mine(look, x, y, 34));
      }
      if (b) ops.push(...trail(b, 12, Z.R * 1.3, "#ff9a3c"), glow(b.x, b.y, 90, "#ff7a1a", 0.9), disc(b.x, b.y, Z.R, "#fff3d6"));
      return ops;
    }
  },
  volley: {
    bg() {
      const V = VOLLEY, ops = [rect(0, 0, W, V.FY, lin(0, V.FY, ["#06222b", "#0b3d4a", "#1d7a85"]))];
      ops.push(...specks(60, "#ffffff80", "stars", 3), glow(780, 260, 220, "#bfffe9", 0.35), disc(780, 260, 60, "#e9fff6"));
      ops.push({ o: "path", d: "M0 " + (V.FY - 120) + " Q250 " + (V.FY - 220) + " 520 " + (V.FY - 110) + " Q780 " + (V.FY - 30) + " " + W + " " + (V.FY - 140) + " L" + W + " " + V.FY + " L0 " + V.FY + " Z", fill: "#0e5560" });
      ops.push(rect(0, V.FY, W, H - V.FY, lin(V.FY, H, ["#f3d9a0", "#c99a5a"])), ...specks(220, "#78501e59", "sand", 4).map((o) => Object.assign(o, { y: V.FY + (o.y / H) * (H - V.FY) })));
      ops.push(rect(V.NX - 6, V.NT, 12, V.FY - V.NT, "#e9eef0"));
      for (let y = V.NT + 10; y < V.FY - 140; y += 22) ops.push(line(V.NX - V.NW, y, V.NX + V.NW, y, "#ffffff59", 2));
      ops.push(disc(V.NX, V.NT, V.NW + 4, "#ffffff"));
      return ops;
    },
    fg(S, m, look) {
      const st = S.st, V = VOLLEY, b = st.b, ops = [];
      if (b) { const h = Math.max(0, V.FY - b.y), sc = Math.max(0.3, 1 - h / 1100); ops.push({ o: "ellipse", x: b.x, y: V.FY + 8, rx: V.BR * 1.3 * sc, ry: 12 * sc, fill: "#00000040" }); }
      const fig = (f, col, face, own) => {
        const sq = f.y >= V.FY - V.PRAD - 1 ? 1 : 1.08;
        ops.push({ o: "ellipse", x: f.x, y: V.FY + 6, rx: 70, ry: 12, fill: "#00000040" }, glow(f.x, f.y, 150, col, 0.3));
        ops.push(rect(f.x - 62, f.y - V.PRAD * sq, 124, V.PRAD * 2 * sq - 18, col, { r: 34 }), rect(f.x - 44 + face * 10, f.y - V.PRAD * sq + 22, 88, 30, "#000000bf", { r: 14 }));
        ops.push(rect(f.x + face * 26 - 6, f.y - V.PRAD * sq + 30, 12, 14, "#ffffff"), rect(f.x - 40, f.y + V.PRAD - 26, 26, 22, "#00000059"), rect(f.x + 14, f.y + V.PRAD - 26, 26, 22, "#00000059"));
        if (own) ops.push(...mine(look, f.x, f.y + 10, 40));
      };
      fig(st.me, m.a, b && b.x > st.me.x ? 1 : -1, true); fig(st.opp, m.b, b && b.x > st.opp.x ? 1 : -1, false);
      if (b) {
        ops.push(...trail(b, 8, V.BR, "#fff6c4"), glow(b.x, b.y, V.BR * 3, "#ffe680", 0.6), disc(b.x, b.y, V.BR, "#fff8e1"));
        const spin = b.x / 40;
        for (let k = 0; k < 3; k++) ops.push({ o: "arc", x: b.x, y: b.y, r: V.BR * 0.8, a0: (spin + k * 2.09) / TAU, a1: (spin + k * 2.09 + 1.2) / TAU, stroke: "#e0b400", lw: 5 });
      }
      return ops;
    }
  },
  panzer: {
    bg() { return [rect(0, 0, W, H, lin(0, H, ["#141d45", "#3a3a7a", "#c86a5a", "#f6b26b"])), glow(W * 0.5, H * 0.72, 320, "#ffd38a", 0.6), disc(W * 0.5, H * 0.72, 90, "#ffe2a8"), ...specks(50, "#ffffff99", "stars2", 3)]; },
    fg(S, m, look, now, aim, calm) {
      const st = S.st, Z = PANZER, T = st.T, cw = W / Z.N, ops = [];
      for (let k = 0; k < 4; k++) { const cx = ((k * 330 + now * st.wind * 0.6) % (W + 300) + W + 300) % (W + 300) - 150, cy = 220 + k * 140; ops.push({ o: "ellipse", x: cx, y: cy, rx: 120, ry: 34, fill: "#ffffff2e" }, { o: "ellipse", x: cx + 60, y: cy - 20, rx: 80, ry: 30, fill: "#ffffff2e" }); }
      const pts = [0, T[0]]; for (let i = 0; i < Z.N; i++) pts.push((i + 0.5) * cw, T[i]); pts.push(W, T[Z.N - 1], W, H, 0, H);
      ops.push({ o: "poly", pts, closed: true, fill: lin(H - 760, Z.SEA + 40, ["#7cdb3c", "#4f8f2a", "#5a3b1e"]), stroke: "#b6ff7a", lw: 6 });
      ops.push(rect(0, Z.SEA, W, H - Z.SEA, lin(Z.SEA, H, ["#1c6fb8", "#0b2d55"]), { alpha: 0.88 }));
      const wv = []; for (let w = 0; w <= W; w += 20) wv.push(w, Z.SEA + sinD(w / 60 + (calm ? 0 : now * 2)) * 6);
      ops.push({ o: "poly", pts: wv, closed: false, stroke: "#ffffff80", lw: 4 });
      for (const [own, a, col] of [[true, st.aim, m.a], [false, st.oppAim, m.b]]) {
        const p = tankPos(T, own), vx = a.vx || (own ? 500 : -500), vy = a.vy || -600, l = Math.sqrt(vx * vx + vy * vy) || 1;
        ops.push(glow(p.x, p.y, 110, col, 0.3), line(p.x, p.y - 22, p.x + vx / l * 70, p.y - 22 + vy / l * 70, "#333333", 14, { cap: "round" }));
        ops.push(rect(p.x - 50, p.y - 18, 100, 34, col, { r: 8 }), disc(p.x, p.y - 22, 26, col), rect(p.x - 56, p.y + 10, 112, 20, "#222222", { r: 10 }));
        if (own) ops.push(...mine(look, p.x, p.y - 22, 26));
      }
      for (const s of st.shells) ops.push(glow(s.x, s.y, 50, s.mine ? m.a : m.b, 0.9), disc(s.x, s.y, 9, "#ffffff"));
      if (aim) {   // der erste Teil des eigenen Schusses, gepunktet: Zielen ist fair, nicht geschenkt (alt :258-261)
        const mz = tankPos(T, true), p2 = { x: mz.x, y: mz.y - 22, vx: aim.vx, vy: aim.vy };
        for (let j = 0; j < 22; j++) { for (let q = 0; q < 3; q++) { p2.vx += st.wind / 120; p2.vy += Z.G / 120; p2.x += p2.vx / 120; p2.y += p2.vy / 120; } ops.push(disc(p2.x, p2.y, 5, "#ffffff", { alpha: 1 - j / 22 })); }
      }
      const wa = st.wind / Z.WMAX;
      ops.push({ o: "text", x: W / 2, y: 90, text: "💨 " + (wa > 0 ? "→" : "←").repeat(1 + Math.round(Math.abs(wa) * 2)), size: 44, font: "body", align: "center", fill: "#ffffff" });
      const tp = tankPos(T, true); ops.push(rect(tp.x - 50, tp.y + 40, 100, 10, "#00000066"), rect(tp.x - 50, tp.y + 40, 100 * st.reload, 10, st.reload >= 1 ? m.a : "#ffffff"));
      return ops;
    }
  },
  kick: {
    bg() {
      const K = KICK, ops = [rect(0, 0, W, H, "#3a2414")];
      for (let y = 0; y < H; y += 100) ops.push(rect(20, y, W - 40, 100, (y / 100) % 2 ? "#1f7a3a" : "#238a42"));
      ops.push(rect(30, 30, W - 60, H - 60, null, { stroke: "#ffffffb3", lw: 6 }), line(30, H / 2, W - 30, H / 2, "#ffffffb3", 6), { o: "arc", x: W / 2, y: H / 2, r: 130, a0: 0, a1: 1, stroke: "#ffffffb3", lw: 6 });
      ops.push(rect(W / 2 - 260, 30, 520, 200, null, { stroke: "#ffffffb3", lw: 6 }), rect(W / 2 - 260, H - 230, 520, 200, null, { stroke: "#ffffffb3", lw: 6 }));
      ops.push(rect(W / 2 - K.GOAL / 2, 0, K.GOAL, 22, "#111111"), rect(W / 2 - K.GOAL / 2, H - 22, K.GOAL, 22, "#111111"));
      for (const y of [K.KY, K.SY, H - K.KY, H - K.SY]) ops.push(rect(0, y + 6, W, 12, "#00000040"), rect(0, y - 7, W, 14, lin(y - 7, y + 7, ["#e8e8e8", "#8a8a8a"])));
      ops.push(vignette());
      return ops;
    },
    fg(S, m, look) {
      const st = S.st, K = KICK, b = st.b, ops = [];
      const man = (x, y, col, dir, kick, own) => {
        const dy = kick * 26 * dir;
        ops.push({ o: "ellipse", x: x + 6, y: y + 10, rx: 30, ry: 22, fill: "#0000004d" }, rect(x - 30, y - 20 + dy, 60, 40, col, { r: 14 }), disc(x, y + dy, 17, "#f2c9a0"));
        ops.push(rect(x - 10, dir > 0 ? y + dy + 22 : y + dy - 40, 20, 18, "#222222"));
        if (kick > 0) ops.push(glow(x, y + dy, 70, col, 0.6 * kick));
        if (own) ops.push(...mine(look, x, y + dy, 17));
      };
      kickRods(st.opp).forEach((f) => man(f.x, H - f.y, m.b, 1, st.oppKick, false));
      kickRods(st.c).forEach((f) => man(f.x, f.y, m.a, -1, st.kick, true));
      if (b) {
        ops.push(...trail(b, 10, K.R, "#ffffff"), glow(b.x, b.y, 70, "#ffffff", 0.5), disc(b.x, b.y, K.R, "#fafafa"));
        const s = b.x / 30 + b.y / 30; for (let k = 0; k < 3; k++) ops.push(disc(b.x + cosD(s + k * 2.1) * 13, b.y + sinD(s + k * 2.1) * 13, 6, "#222222"));
      }
      return ops;
    }
  },
  flipper: {
    bg(m) {
      const F = FLIP, ops = [rect(0, 0, W, H, lin(0, H, ["#140626", "#22093f", "#140626"]))];
      for (let x = 0; x <= W; x += 50) ops.push(line(x, 0, x, H, "#b04bff1f", 2));
      for (let y = 0; y <= H; y += 50) ops.push(line(0, y, W, y, "#b04bff1f", 2));
      for (const [flip, c] of [[false, m.a], [true, m.b]]) {
        const px = (x) => (flip ? W - x : x), py = (y) => (flip ? H - y : y), sh = { color: c, blur: 22 };
        ops.push(line(px(0), py(F.LANE), px(F.PX), py(F.PY), c, 10, { cap: "round", shadow: sh }), line(px(W), py(F.LANE), px(W - F.PX), py(F.PY), c, 10, { cap: "round", shadow: sh }));
      }
      ops.push(vignette());
      return ops;
    },
    fg(S, m, look) {
      const st = S.st, F = FLIP, b = st.b, ops = [];
      st.bumps.forEach((bp, j) => {
        for (const [x, y, c, lit] of [[bp.x, bp.y, m.a, st.lit[j]], [W - bp.x, H - bp.y, m.b, 0]]) ops.push(glow(x, y, F.BR * (2.4 + lit * 1.5), c, 0.4 + lit * 0.6), disc(x, y, F.BR, c), disc(x, y, F.BR * 0.6, "#140626"), disc(x, y, F.BR * 0.35, lit > 0 ? "#ffffff" : c));
      });
      const flip = (s, col) => ops.push(line(s.ax, s.ay, s.bx, s.by, col, F.T * 2.4, { cap: "round" }), line(s.ax, s.ay, s.bx, s.by, "#ffffff99", F.T, { cap: "round" }), disc(s.ax, s.ay, 16, "#ffffff"));
      for (let k = 0; k < 2; k++) {
        const s = flipSeg(k === 0, st.a[k]); ops.push(glow((s.ax + s.bx) / 2, (s.ay + s.by) / 2, 170, m.a, 0.35)); flip(s, m.a);
        const o = flipSeg(k === 0, st.opp[k]); flip({ ax: W - o.ax, ay: H - o.ay, bx: W - o.bx, by: H - o.by }, m.b);
      }
      ops.push(...mine(look, W / 2, F.PY + 110, 34));   // neu: Flipper hat keine Figur; Foto/Emoji unter der eigenen Luecke
      if (b) ops.push(...trail(b, 12, F.R, "#bff6ff"), glow(b.x, b.y, 70, "#9ff3ff", 0.8), disc(b.x, b.y, F.R, rad(b.x - 6, b.y - 6, F.R * 1.6, "#ffffff", "#6b7c8a")));
      return ops;
    }
  },
  snow: {
    bg() {
      const N = SNOW, ops = [rect(0, 0, W, H, lin(0, H, ["#cfe3f5", "#f4f9ff", "#cfe3f5"])), ...specks(160, "#78a0c82e", "prints", 8), { o: "ellipse", x: W / 2, y: H / 2, rx: W * 0.6, ry: 26, fill: "#ffffffcc" }];
      for (const y of [N.FY + 60, H - N.FY - 60]) ops.push(line(0, y, W, y, "#5082b440", 4, { dash: [16, 16] }));
      return ops;
    },
    fg(S, m, look, now, aim, calm) {
      const st = S.st, N = SNOW, ops = [];
      const wall = (w, col) => {
        if (w.hp <= 0) { ops.push({ o: "ellipse", x: w.x, y: w.y + 10, rx: N.WW / 2, ry: 12, fill: "#ffffffb3" }); return; }
        const h = N.WH * (0.5 + 0.5 * w.hp / N.HP);
        ops.push(rect(w.x - N.WW / 2 + 6, w.y - h / 2 + 10, N.WW, h, "#3c648c33"), rect(w.x - N.WW / 2, w.y - h / 2, N.WW, h, "#ffffff", { r: 16, stroke: col, lw: 4 }));
      };
      st.mine.forEach((w) => wall(w, m.a)); st.theirs.forEach((w) => wall(w, m.b));
      const guy = (x, y, col, up, own) => {
        ops.push({ o: "ellipse", x: x + 8, y: y + 14, rx: N.FR, ry: N.FR * 0.6, fill: "#3c648c40" }, disc(x, y, N.FR, col), disc(x, y + up * 6, N.FR * 0.62, "#ffe0c2"), rect(x - N.FR, y - up * 6 - 6, N.FR * 2, 12, col));
        if (own) ops.push(...mine(look, x, y + up * 6, N.FR * 0.62));
      };
      guy(st.opp, H - N.FY, m.b, -1, false); guy(st.me.x, N.FY, m.a, 1, true);
      for (const b of st.balls) ops.push({ o: "ellipse", x: b.x + 10, y: b.y + 16, rx: N.R, ry: N.R * 0.6, fill: "#3c648c40" }, disc(b.x, b.y, N.R + 2, "#ffffff"), disc(b.x - 4, b.y - 4, N.R * 0.5, "#e6f2ff"));
      for (let k = 0; k < N.AMMO; k++) ops.push(disc(st.me.x - 40 + k * 40, N.FY + 78, 12, k < st.ammo ? m.a : "#00000026"));
      if (!calm) { const r = dice(7), fl = []; for (let i = 0; i < 40; i++) { const x0 = r() * W, sp = 60 + r() * 80, ph = r() * 7; fl.push([x0 + sinD(now + ph) * 20, ((now * sp + ph * 230) % (H + 40)) - 20, 3 + r() * 4, 0.9, "#ffffff"]); } ops.push({ o: "particles", shape: "dot", list: fl }); }
      return ops;
    }
  },
  elfer: {
    bg() {
      const ops = [];
      for (let y = 0; y < H; y += 110) ops.push(rect(0, y, W, 110, (y / 110) % 2 ? "#0f4a26" : "#12572d"));
      for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) ops.push(glow(x, y, 520, "#e8ffe0", 0.35));
      ops.push(rect(W / 2 - 380, -10, 760, 520, null, { stroke: "#ffffff99", lw: 6 }), rect(W / 2 - 380, H - 510, 760, 520, null, { stroke: "#ffffff99", lw: 6 }), vignette());
      return ops;
    },
    fg(S, m, look, now, aim, calm, swipe) {
      const st = S.st, E = ELF, top = st.shooting, gy = top ? E.GY : H - E.GY, ky = top ? E.KY : H - E.KY, ops = [];
      ops.push(rect(W / 2 - E.GW / 2, top ? 0 : gy, E.GW, top ? gy : H - gy, "#00000059"));
      for (let nx = W / 2 - E.GW / 2; nx <= W / 2 + E.GW / 2; nx += 26) ops.push(line(nx, top ? 0 : gy, nx, top ? gy : H, "#ffffff40", 2));
      ops.push({ o: "poly", pts: [W / 2 - E.GW / 2, top ? 0 : H, W / 2 - E.GW / 2, gy, W / 2 + E.GW / 2, gy, W / 2 + E.GW / 2, top ? 0 : H], closed: false, stroke: "#ffffff", lw: 12 });
      const kx = top ? st.opp : st.k.x, kc = top ? m.b : m.a, kv = top ? (st.oppV || 0) : st.k.vx, wide = Math.abs(kv) > 700 ? E.KDIVE : E.KW;
      ops.push(glow(kx, ky, 170, kc, 0.4), rect(kx - wide, ky - 22, wide * 2, 44, kc, { r: 22 }), disc(kx, ky, 26, "#f2c9a0"));
      if (!top) ops.push(...mine(look, kx, ky, 26));
      const spot = top ? st.spot : { x: W - st.spot.x, y: H - st.spot.y };
      ops.push(disc(spot.x, spot.y, 8, "#ffffffcc"));
      if (st.phase === "aim") ops.push(disc(spot.x, spot.y + (top ? 80 : -80), 30, top ? m.a : m.b));
      if (top) ops.push(...mine(look, spot.x, spot.y + 80, 30));   // neu: eigene Figur/Foto auch als Schuetze sichtbar
      const b = st.b || (st.phase === "aim" ? { x: spot.x, y: spot.y, vx: 0, vy: 0 } : null);
      if (b) { if (st.phase === "fly") ops.push(...trail(b, 10, E.R, "#ffffff")); ops.push(glow(b.x, b.y, 70, "#ffffff", 0.45), disc(b.x, b.y, E.R, "#fafafa"), disc(b.x + 6, b.y - 4, 7, "#222222")); }
      if (aim && top && st.phase === "aim") ops.push(line(spot.x, spot.y, aim.x, aim.y, m.a, 6, { dash: [14, 12], alpha: 0.7 }), disc(aim.x, aim.y, 18, null, { stroke: m.a, lw: 5 }));
      if (swipe && swipe.length > 1) ops.push({ o: "poly", pts: swipe.flat(), closed: false, stroke: m.a, lw: 10, alpha: 0.7 });
      return ops;
    }
  },
  stock: {
    bg() {
      const D = STOCK, r = dice(strHash("rink")), ops = [rect(0, 0, W, H, lin(0, H, ["#bfeff0", "#e9fbfb", "#bfeff0"]))];
      for (let i = 0; i < 90; i++) { const x = r() * W, y = r() * H; ops.push(line(x, y, x + (r() - 0.5) * 220, y + (r() - 0.5) * 40, "#3c8c961a", 2)); }
      for (const [rr, c] of [[D.RINGS[2], "#e0863a"], [D.RINGS[1], "#ffffff"], [D.RINGS[0], "#20c9c9"]]) ops.push(disc(D.TX, D.TY, rr, c));
      ops.push(disc(D.TX, D.TY, 18, "#ffffff"));
      for (const y of [D.FROM, H - D.FROM]) ops.push(line(80, y, W - 80, y, "#1e3c5066", 6));
      ops.push(rect(0, 0, 18, H, "#8a5a32"), rect(W - 18, 0, 18, H, "#8a5a32"));
      return ops;
    },
    fg(S, m, look, now, aim) {
      const ops = [];
      for (const s of S.st.list) {
        const own = s.p === S.me, col = own ? m.a : m.b, sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        ops.push({ o: "ellipse", x: s.x + 6, y: s.y + 10, rx: s.r, ry: s.r * 0.8, fill: "#143c4640" });
        if (sp > 50) ops.push(glow(s.x, s.y, s.r * 2.6, col, Math.min(0.6, sp / 1500)));
        ops.push(disc(s.x, s.y, s.r, rad(s.x - 12, s.y - 12, s.r * 1.6, "#ffffff", "#6c7a80")), disc(s.x, s.y, s.r * 0.72, col), rect(s.x - 8, s.y - s.r * 0.55, 16, s.r * 1.1, "#222222", { r: 8 }));
        if (own) ops.push(...mine(look, s.x, s.y, s.r * 0.6));
      }
      if (mineTurn(S) && !aim) ops.push(...mine(look, W / 2, S.me === 0 ? H - STOCK.FROM : STOCK.FROM, 30));   // neu: wer dran ist, sieht seine Figur am Abwurf
      ops.push(...aimDots(S, aim, m.a, STOCK));
      return ops;
    }
  },
  murmel: {
    bg() { return [rect(0, 0, W, H, rad(W / 2, H / 2, H * 0.7, "#4b2a76", "#1c0d30")), ...specks(300, "#ffffff0a", "felt", 3)]; },
    fg(S, m, look, now, aim) {
      const st = S.st, ops = [{ o: "arc", x: W / 2, y: H / 2, r: st.r, a0: 0, a1: 1, stroke: "#ffffffcc", lw: 8, dash: [28, 14] }];
      for (const [y, p] of [[H / 2 + st.r + 80, 0], [H / 2 - st.r - 80, 1]]) ops.push(line(W / 2 - 260, y, W / 2 + 260, y, p === S.me ? m.a : m.b, 4, { alpha: 0.5 }));
      for (const s of st.list) {
        const col = s.shooter ? (s.p === S.me ? m.a : m.b) : GLASS[s.c % GLASS.length];
        ops.push({ o: "ellipse", x: s.x + 6, y: s.y + 8, rx: s.r, ry: s.r * 0.7, fill: "#00000059" }, glow(s.x, s.y, s.r * 2.2, col, 0.35), disc(s.x, s.y, s.r, rad(s.x - 8, s.y - 8, s.r * 1.5, "#ffffff", col)), disc(s.x - s.r * 0.35, s.y - s.r * 0.35, s.r * 0.25, "#ffffffd9"));
        if (s.shooter && s.p === S.me) ops.push(...mine(look, s.x, s.y, s.r * 0.7));
      }
      if (mineTurn(S) && !aim) ops.push(...mine(look, W / 2, S.me === 0 ? H / 2 + st.r + 80 : H / 2 - st.r - 80, 30));
      ops.push(...aimDots(S, aim, m.a, MURMEL));
      return ops;
    }
  }
};
// Gepunkteter erster Teil des eigenen Wurfs in den Rundenspielen, im gemeinsamen Bild (alt aimDots :410-415).
function aimDots(S, aim, col, D) {
  if (!aim || !mineTurn(S)) return [];
  const p = { x: aim.x, y: aim.y, vx: aim.vx, vy: aim.vy }, ops = [disc(p.x, p.y, D.R, "#ffffff59")];
  let v = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  for (let i = 0; i < 18 && v > 1; i++) { const dt = 0.05, nv = Math.max(0, v - D.DECEL * dt); p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= nv / v; p.vy *= nv / v; v = nv; ops.push(disc(p.x, p.y, 6, col)); }
  return ops;
}

/** Sichtbare Farben und Figur einer Partie aus den Parametern (Port alt Frei.arcadeLook). */
export function lookOf(g, params) {
  const m = META[g], p = params || {};
  return { a: typeof p.colA === "string" ? p.colA : m.a, b: typeof p.colB === "string" ? p.colB : m.b, e: m.e, emoji: typeof p.emoji === "string" && p.emoji ? p.emoji : "", photo: p.photo && p.photoUse && p.photoUse !== "off" ? p.photoUse : "off" };
}
/** Die Anzeige einer Seite. fx: Ereignisprotokoll mit at in Sekunden; aim/swipe: Zielhilfe aus der Gestenerinnerung. */
export function drawSide(S, look, o) {
  const g = S.g, D = DRAW[g], m = { a: look.a, b: look.b }, now = o.now, calm = !!o.reduced;
  const bg = D.bg(m);
  if (look.photo === "bg") bg.push({ o: "image", src: { kind: "local", slot: "photo" }, x: 0, y: 0, w: W, h: H, fit: "cover", alpha: 0.45 }, rect(0, 0, W, H, "#00000059"));
  let fg = D.fg(S, m, look, now, o.aim || null, calm, o.swipe || null);
  if (S.flip) fg = [{ o: "group", tx: W, ty: H, sx: -1, sy: -1, ops: fg }];   // das eingeladene Handy sieht das gemeinsame Bild gedreht
  const eff = effects(o.fx || [], now, m, g, calm);
  const fxOps = S.flip ? [{ o: "group", tx: W, ty: H, sx: -1, sy: -1, ops: eff.ops }] : eff.ops;
  const top = [];
  for (const t of eff.texts) top.push({ o: "text", x: t.x, y: t.y, text: t.s, size: 120, font: "brand", align: "center", fill: t.c, alpha: t.a });
  if (o.count) top.push({ o: "text", x: W / 2, y: H / 2 + 90, text: String(o.count), size: 260, font: "brand", align: "center", fill: "#ffffff", alpha: 0.9 });
  // Schrift auf einem halbdurchsichtigen Band statt mit shadowBlur: Weichzeichnen in jedem Bild kostet beim Rastern
  // am meisten (gemessen im Trace: Panzer 27 -> s. PR, bei 4x gedrosselter CPU).
  if (o.hud) top.push(rect(W / 2 - 330, 18, 660, 64, "#00000073", { r: 32 }), { o: "text", x: W / 2, y: 64, text: o.hud, size: 46, font: "brand", align: "center", fill: "#ffffff", maxW: 640 });
  if (o.note) top.push(rect(30, H - 78, W - 60, 60, "#00000073", { r: 30 }), { o: "text", x: W / 2, y: H - 36, text: o.note, size: 36, font: "body", align: "center", fill: "#ffffff", maxW: W - 90 });
  if (eff.flash) top.push(rect(0, 0, W, H, eff.flash[1], { alpha: eff.flash[0] }));
  if (eff.shake > 0.1) top.unshift({ o: "shake", amt: eff.shake });
  return { t: "canvas", w: W, h: H, layers: [{ id: "bg", key: g + "|" + S.seed + "|" + look.a + look.b + look.photo, ops: bg }, { id: "fg", ops: fg.concat(fxOps) }, { id: "top", ops: top }], a11y: o.a11y || "" };
}
export { DRAW, effects, burst, withA };
