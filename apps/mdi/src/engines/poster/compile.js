// Poster-Engine (E7): Dokument -> Canvas-Anzeigeliste. Die Zeichenfunktionen sind aus alt:src/render.js und alt:src/warm.js
// uebernommen (gleiche Reihenfolge, gleiche Masse); sie zeichnen auf einen Aufzeichner statt auf eine Leinwand. Heraus kommt
// eine Liste reiner Daten (ops), die paint.js auf eine echte Leinwand ausfuehrt. Alles, was Schriftmasse braucht (Textbloecke),
// bleibt ein hohes Op und wird erst beim Ausfuehren gesetzt: so ist die Liste unabhaengig von Schrift und Geraet und eignet
// sich fuer Golden-Tests. Gleiches Dokument => gleiche Liste (Schnee und Glitch kommen aus dem Text als Seed).
//
// Format: 4:5 ist das Altformat (540x675, Poster, Foto, Klang). 16:9 gilt fuer die Adventstuer (Wunsch des Users,
// 2026-11-12): eigene Anordnung derselben Elemente (Schnee, Band mit Schleife, dunkles Feld, vier Sterne, Text, Nummer).
// Groessen haengen an u = min(W, 0.8 H); bei 4:5 ist u = W, also bitgleich zum Altcode.
import { hash32, mulberry32, MOTIFS } from "./doc.js";
import { tile as notoTile } from "./noto.js";

const FONT = 'Anton,Impact,"Avenir Next Condensed","Roboto Condensed","Arial Black",system-ui,sans-serif';
const EMO = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
export { FONT, EMO };

export function lum(h) { const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); return (0.3 * r + 0.59 * g + 0.11 * b) / 255; }
export function ink(h) { return lum(h) > 0.45 ? "#111111" : "#fffaf0"; }

const METHODS = ["fillRect", "strokeRect", "clearRect", "beginPath", "closePath", "moveTo", "lineTo", "arc", "arcTo", "ellipse", "bezierCurveTo", "quadraticCurveTo",
  "fill", "stroke", "clip", "save", "restore", "translate", "rotate", "scale", "setTransform", "fillText", "strokeText"];
const PROPS = ["fillStyle", "strokeStyle", "lineWidth", "globalAlpha", "font", "textAlign", "textBaseline", "shadowColor", "shadowBlur", "shadowOffsetX", "shadowOffsetY",
  "lineJoin", "lineCap", "globalCompositeOperation"];
export const OP_METHODS = METHODS, OP_PROPS = PROPS;

/** Aufzeichner mit der Teilmenge der Canvas-2D-Schnittstelle, die das Poster braucht. */
function recorder() {
  const ops = [], c = { ops };
  for (const m of METHODS) c[m] = (...a) => { ops.push({ m, a: a.map(r6) }); };
  for (const p of PROPS) Object.defineProperty(c, p, { set(v) { ops.push({ p, v: typeof v === "number" ? r6(v) : v }); }, get() { throw new Error("poster: " + p + " nur schreiben"); } });
  c.op = (o) => ops.push(o);
  return c;
}
// Zahlen auf 6 Nachkommastellen: gleiche Liste auf jeder Engine, Unterschied unter einem Millionstel Pixel.
function r6(v) { return typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 1e6) / 1e6 : v; }

// ---------- Bausteine aus alt:src/render.js ----------
function softDots(c, W, H, col, cell, ang, text) {
  const clash = Math.abs(lum(col) - lum(text)) < 0.45;
  c.save(); if (clash) c.globalAlpha = 0.28; dots(c, W, H, col, cell, ang); c.restore();
  return clash ? (lum(text) > 0.5 ? "#111111" : "#fffaf0") : col;
}
function block(c, text, x, y, w, h, col, shadow, off) { c.op({ op: "block", a: [String(text), r6(x), r6(y), r6(w), r6(h), col, shadow || null, r6(off || 0)] }); }
function dots(c, W, H, col, cell, seedAngle) {
  c.fillStyle = col;
  for (let y = 0; y < H; y += cell) for (let x = (Math.floor(y / cell) % 2) * cell / 2; x < W; x += cell) {
    const k = (x / W * Math.cos(seedAngle) + y / H * Math.sin(seedAngle) + 0.4) * 0.9;
    if (k <= 0.25) continue;
    c.beginPath(); c.arc(x, y, Math.min(cell * 0.46, cell * 0.5 * (k - 0.25)), 0, 6.3); c.fill();
  }
}
function rays(c, W, H, col, rot) {
  c.save(); c.translate(W / 2, H * 0.42); c.rotate(rot); c.fillStyle = col;
  for (let i = 0; i < 14; i++) { c.rotate(6.2832 / 14); c.beginPath(); c.moveTo(0, 0); c.lineTo(H * 1.2, -H * 0.13); c.lineTo(H * 1.2, H * 0.13); c.fill(); }
  c.restore();
}
// Sticker: weisser Kreis mit Rand, darin das Emoji. Im Export nur aus Noto Emoji; ohne Kachel bleibt der Sticker weg.
function stickers(c, W, H, list, exporting) {
  const u = Math.min(W, H * 0.8);
  (list || []).forEach((s) => {
    if (exporting && !notoTile(s.e)) return;
    const r = u * 0.1 * s.z;
    c.save(); c.translate(s.x * W, s.y * H); c.rotate(s.r); c.op({ op: "note", a: ["sticker", r6(-r), r6(-r), r6(2 * r), r6(2 * r)] });
    c.fillStyle = "#fff"; c.strokeStyle = "#111"; c.lineWidth = u * 0.006; c.beginPath(); c.arc(0, 0, r, 0, 6.3); c.fill(); c.stroke();
    c.op({ op: "glyph", a: [s.e, r6(r), exporting ? 1 : 0] });
    c.restore();
  });
}
export function sky(code) { return code <= 1 ? "☀️" : code <= 3 ? "⛅" : code <= 48 ? "🌫" : code <= 67 ? "🌧" : code <= 77 ? "❄️" : code <= 82 ? "🌦" : code <= 86 ? "❄️" : "⛈"; }
function weather(c, W, H, w) {
  if (!w) return;
  const u = Math.min(W, H * 0.8), y = H * 0.8, h = H * 0.105, day = w.d.slice(8, 10) + "." + w.d.slice(5, 7) + ".";
  c.fillStyle = "#111"; c.fillRect(0, y, W, h); c.fillStyle = "#fff"; c.textBaseline = "middle"; c.textAlign = "left";
  c.font = "900 " + r6(u * 0.05) + "px system-ui,sans-serif," + EMO; c.fillText(sky(w.c) + " " + w.hi + "° / " + w.lo + "°  💧" + w.rn + " %", W * 0.04, y + h * 0.33);
  c.font = "700 " + r6(u * 0.032) + "px system-ui,sans-serif"; c.fillText(w.p + ", " + day + " · open-meteo.com, CC BY 4.0, gerundet", W * 0.04, y + h * 0.75);
}
function credit(c, W, H, nick, col) {
  const u = Math.min(W, H * 0.8);
  c.font = "800 " + r6(u * 0.036) + "px system-ui,sans-serif," + EMO; c.textBaseline = "alphabetic";
  c.fillStyle = col; c.textAlign = "left"; c.fillText(nick || "", W * 0.04, H - u * 0.032);
  c.textAlign = "right"; c.fillText("my daily idea", W * 0.96, H - u * 0.032);
}
function burstPath(c, cx, cy, r, n, inner) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n, q = i % 2 ? r * inner : r; c[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * q, cy + Math.sin(a) * q); }
  c.closePath();
}
function snow(c, W, H, seed, n = 70) {
  const r = mulberry32(seed), u = Math.min(W, H * 0.8); c.fillStyle = "rgba(255,255,255,.75)";
  for (let i = 0; i < n; i++) { c.beginPath(); c.arc(r() * W, r() * H, u * (0.003 + r() * 0.007), 0, 6.3); c.fill(); }
}
function star(c, x, y, r, col) { burstPath(c, x, y, r, 5, 0.45); c.fillStyle = col; c.fill(); }
function bow(c, W, H, col) {
  c.fillStyle = col; c.fillRect(W * 0.47, 0, W * 0.06, H); c.fillRect(0, H * 0.13, W, W * 0.05);
  [-1, 1].forEach((s) => { c.beginPath(); c.moveTo(W / 2, H * 0.15); c.lineTo(W / 2 + s * W * 0.16, H * 0.06); c.lineTo(W / 2 + s * W * 0.16, H * 0.2); c.closePath(); c.fill(); });
  c.beginPath(); c.arc(W / 2, H * 0.15, W * 0.04, 0, 6.3); c.fill();
}
function doorBadge(c, W, H, nr, a, b) {
  const r = W * 0.1, x = W * 0.15, y = H * 0.12;
  c.fillStyle = b; c.strokeStyle = a; c.lineWidth = W * 0.012; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill(); c.stroke();
  c.fillStyle = ink(b); c.font = "900 " + r6(r * 1.1) + "px " + FONT; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(nr), x, y + r * 0.04);
  c.textBaseline = "alphabetic";
}

// ---------- Adventstuer im Format 16:9 ----------
// Gleiche Bauteile wie alt "advent", quer angeordnet: Band senkrecht in der Mitte und waagerecht oben, Schleife oben mittig,
// das Feld fuer den Text rechts der Nummer, die Nummer gross links. Ein KI-Bild (gi) fuellt das Feld unter einem Schleier.
function adventWide(c, W, H, doc, opt) {
  const a = doc.col[0], b = doc.col[1], tx = doc.x || "…", u = Math.min(W, H * 0.8);
  c.fillStyle = a; c.fillRect(0, 0, W, H); snow(c, W, H, hash32(doc.x + "|" + (doc.nr || 0)), 110);
  c.fillStyle = b; c.fillRect(W * 0.485, 0, W * 0.03, H); c.fillRect(0, H * 0.1, W, H * 0.05);
  [-1, 1].forEach((s) => { c.beginPath(); c.moveTo(W / 2, H * 0.125); c.lineTo(W / 2 + s * W * 0.09, H * 0.03); c.lineTo(W / 2 + s * W * 0.09, H * 0.22); c.closePath(); c.fill(); });
  c.beginPath(); c.arc(W / 2, H * 0.125, H * 0.045, 0, 6.3); c.fill();
  const px = W * 0.25, py = H * 0.26, pw = W * 0.7, ph = H * 0.6;
  if (opt.gi) {
    c.save(); c.beginPath(); c.moveTo(px, py); c.lineTo(px + pw, py); c.lineTo(px + pw, py + ph); c.lineTo(px, py + ph); c.closePath(); c.clip();
    c.op({ op: "image", a: ["gi", r6(px), r6(py), r6(pw), r6(ph)] }); c.restore();
    c.fillStyle = "rgba(0,0,0,.45)"; c.fillRect(px, py, pw, ph);
  } else { c.fillStyle = "rgba(0,0,0,.28)"; c.fillRect(px, py, pw, ph); }
  c.strokeStyle = b; c.lineWidth = u * 0.01; c.strokeRect(px, py, pw, ph);
  [[0.035, 0.07], [0.965, 0.07], [0.035, 0.93], [0.965, 0.93]].forEach((p) => { star(c, px + pw * p[0], py + ph * p[1], u * 0.035, b); });
  block(c, tx, px + pw * 0.06, py + ph * 0.09, pw * 0.88, ph * 0.82, "#fffaf0", "rgba(0,0,0,.35)", u * 0.008);
  // die Nummer: grosser Kreis links, auf jeder Farbe lesbar
  const r = H * 0.2, x = W * 0.125, y = H * 0.56;
  c.fillStyle = b; c.strokeStyle = a; c.lineWidth = u * 0.012; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill(); c.stroke();
  c.op({ op: "note", a: ["nummer", r6(x - r), r6(y - r), r6(2 * r), r6(2 * r)] });
  c.fillStyle = ink(b); c.font = "900 " + r6(r * 1.1) + "px " + FONT; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(doc.nr || 1), x, y + r * 0.04);
  c.textBaseline = "alphabetic";
}

// ---------- Herz-Karte (alt:src/warm.js:67-124) ----------
const INK = "#3a2a28", SHEET = "#fff6e6";
function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function heart(c, s) { c.beginPath(); c.moveTo(0, 30 * s); c.bezierCurveTo(-62 * s, -8 * s, -30 * s, -58 * s, 0, -24 * s); c.bezierCurveTo(30 * s, -58 * s, 62 * s, -8 * s, 0, 30 * s); c.fill(); }
function wstar(c, s, n) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, q = (i % 2 ? 18 : 42) * s; c[i ? "lineTo" : "moveTo"](Math.cos(a) * q, Math.sin(a) * q); }
  c.closePath(); c.fill();
}
const DRAW = {
  herz: (c, a) => { c.fillStyle = a; heart(c, 1.05); },
  blume: (c, a) => { c.fillStyle = a; for (let i = 0; i < 5; i++) { const w = i * 1.2566 - 1.57; c.beginPath(); c.arc(Math.cos(w) * 23, Math.sin(w) * 23, 17, 0, 6.3); c.fill(); } c.fillStyle = SHEET; c.beginPath(); c.arc(0, 0, 13, 0, 6.3); c.fill(); },
  stern: (c, a) => { c.fillStyle = a; c.strokeStyle = a; c.lineWidth = 7; c.lineJoin = "round"; wstar(c, 1, 5); c.stroke(); },
  mond: (c, a, b) => { c.fillStyle = a; c.beginPath(); c.arc(-4, 0, 36, 0, 6.3); c.fill(); c.fillStyle = b; c.beginPath(); c.arc(12, -12, 30, 0, 6.3); c.fill(); c.fillStyle = a; c.translate(24, 18); wstar(c, 0.3, 4); },
  klee: (c) => { c.fillStyle = "#5ba868"; [[-15, -15], [15, -15], [-15, 15], [15, 15]].forEach((p) => { c.beginPath(); c.arc(p[0], p[1], 17, 0, 6.3); c.fill(); }); c.strokeStyle = "#3f7f4c"; c.lineWidth = 6; c.lineCap = "round"; c.beginPath(); c.moveTo(0, 6); c.quadraticCurveTo(10, 30, 26, 42); c.stroke(); },
  regenbogen: (c) => { c.lineWidth = 9; ["#e2574c", "#f7b733", "#5ba868", "#4a90c2"].forEach((k, i) => { c.strokeStyle = k; c.beginPath(); c.arc(0, 18, 42 - i * 9, Math.PI, 0); c.stroke(); }); },
  ballon: (c, a) => { c.fillStyle = a; c.beginPath(); c.ellipse(0, -12, 27, 33, 0, 0, 6.3); c.fill(); c.beginPath(); c.moveTo(-6, 22); c.lineTo(6, 22); c.lineTo(0, 15); c.fill(); c.strokeStyle = a; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 22); c.bezierCurveTo(-10, 32, 10, 38, 0, 46); c.stroke(); c.fillStyle = "rgba(255,255,255,.55)"; c.beginPath(); c.ellipse(-10, -24, 6, 10, -0.5, 0, 6.3); c.fill(); },
  sonne: (c, a) => { c.fillStyle = a; c.strokeStyle = a; c.lineWidth = 7; c.lineCap = "round"; c.beginPath(); c.arc(0, 0, 21, 0, 6.3); c.fill(); for (let i = 0; i < 10; i++) { const w = i * 0.6283; c.beginPath(); c.moveTo(Math.cos(w) * 30, Math.sin(w) * 30); c.lineTo(Math.cos(w) * 42, Math.sin(w) * 42); c.stroke(); } },
  pflaster: (c, a) => { c.rotate(-0.6); c.fillStyle = a; rr(c, -44, -16, 88, 32, 16); c.fill(); c.fillStyle = SHEET; rr(c, -14, -12, 28, 24, 5); c.fill(); c.fillStyle = a; [[-30, -5], [-30, 5], [30, -5], [30, 5]].forEach((p) => { c.beginPath(); c.arc(p[0], p[1], 2.5, 0, 6.3); c.fill(); }); },
  tasse: (c, a) => { c.fillStyle = a; c.strokeStyle = a; rr(c, -28, -8, 46, 40, 9); c.fill(); c.lineWidth = 7; c.beginPath(); c.arc(20, 10, 11, -1.4, 1.4); c.stroke(); c.lineWidth = 5; c.lineCap = "round"; [-14, 2].forEach((x) => { c.beginPath(); c.moveTo(x, -16); c.bezierCurveTo(x - 7, -24, x + 7, -30, x, -40); c.stroke(); }); },
  brief: (c, a) => { c.fillStyle = a; rr(c, -40, -26, 80, 52, 6); c.fill(); c.strokeStyle = SHEET; c.lineWidth = 5; c.lineJoin = "round"; c.beginPath(); c.moveTo(-36, -22); c.lineTo(0, 6); c.lineTo(36, -22); c.stroke(); c.fillStyle = SHEET; c.translate(0, 14); heart(c, 0.25); }
};
function herz(c, W, H, doc) {
  const a = doc.col[0], b = doc.col[1], m = doc.mo || MOTIFS[hash32(doc.x || "") % MOTIFS.length];
  c.fillStyle = a; c.fillRect(0, 0, W, H);
  c.op({ op: "radial", a: [W / 2, r6(H * 0.12), 0, W / 2, r6(H * 0.12), r6(H * 0.8)], stops: [[0, "rgba(255,255,255,.32)"], [1, "rgba(255,255,255,0)"]] }); c.fillRect(0, 0, W, H);
  c.save(); c.shadowColor = "rgba(58,42,40,.18)"; c.shadowBlur = W * 0.03; c.shadowOffsetY = W * 0.01;
  c.fillStyle = SHEET; rr(c, W * 0.07, H * 0.17, W * 0.86, H * 0.72, W * 0.04); c.fill(); c.restore();
  const r = mulberry32(hash32("warm|" + (doc.x || ""))); c.fillStyle = a;
  for (let i = 0; i < 4; i++) { c.save(); c.globalAlpha = 0.75; c.translate(W * (i % 2 ? 0.7 + r() * 0.16 : 0.14 + r() * 0.16), H * (0.22 + r() * 0.06)); c.rotate((r() - 0.5) * 0.8); heart(c, W * (0.0004 + r() * 0.0003)); c.restore(); }
  c.op({ op: "warm", a: [doc.x || "…", r6(W * 0.14), r6(H * 0.31), r6(W * 0.72), r6(H * 0.55)] });
  const cx = W / 2, cy = H * 0.17, rad = W * 0.17;
  c.save(); c.shadowColor = "rgba(58,42,40,.22)"; c.shadowBlur = W * 0.02; c.shadowOffsetY = W * 0.008;
  c.fillStyle = "#fff"; c.beginPath(); c.arc(cx, cy, rad, 0, 6.3); c.fill(); c.restore();
  c.fillStyle = b; c.beginPath(); c.arc(cx, cy, rad - W * 0.014, 0, 6.3); c.fill();
  c.save(); c.translate(cx, cy); c.scale(rad / 62, rad / 62); DRAW[m](c, a, b); c.restore();
}

function drawCard(c, W, H, doc, opt) {
  const a = doc.col[0], b = doc.col[1], tx = doc.x || "…";
  if (doc.st === "herz") herz(c, W, H, doc);
  else if (doc.st === "zettel") {
    c.fillStyle = b; c.fillRect(0, 0, W, H); dots(c, W, H, a, W * 0.05, 0.9);
    c.save(); c.translate(W / 2, H * 0.47); c.rotate(-0.04);
    c.fillStyle = "#fff8e4"; c.fillRect(-W * 0.42, -H * 0.38, W * 0.84, H * 0.76);
    c.strokeStyle = "rgba(30,60,160,.28)"; c.lineWidth = W * 0.003;
    for (let y = -H * 0.32; y < H * 0.37; y += H * 0.062) { c.beginPath(); c.moveTo(-W * 0.42, y); c.lineTo(W * 0.42, y); c.stroke(); }
    c.fillStyle = a; c.globalAlpha = 0.85; c.fillRect(-W * 0.13, -H * 0.405, W * 0.26, H * 0.05); c.globalAlpha = 1;
    block(c, tx, -W * 0.37, -H * 0.31, W * 0.74, H * 0.62, "#141414", null);
    c.restore();
  } else if (doc.st === "stempel") {
    c.fillStyle = a; c.fillRect(0, 0, W, H); rays(c, W, H, "rgba(0,0,0,.05)", 0.2);
    c.save(); c.translate(W / 2, H * 0.47); c.rotate(-0.09);
    c.strokeStyle = b; c.lineWidth = W * 0.022; c.strokeRect(-W * 0.4, -H * 0.32, W * 0.8, H * 0.64); c.lineWidth = W * 0.006; c.strokeRect(-W * 0.375, -H * 0.3, W * 0.75, H * 0.6);
    block(c, tx, -W * 0.34, -H * 0.27, W * 0.68, H * 0.54, b, null);
    c.restore();
  } else if (doc.st === "advent") {
    if (W / H > 1.2) { adventWide(c, W, H, doc, opt); return; }
    c.fillStyle = a; c.fillRect(0, 0, W, H); snow(c, W, H, hash32(doc.x + "|" + (doc.nr || 0)));
    bow(c, W, H, b);
    c.fillStyle = "rgba(0,0,0,.28)"; c.fillRect(W * 0.08, H * 0.27, W * 0.84, H * 0.56);
    c.strokeStyle = b; c.lineWidth = W * 0.01; c.strokeRect(W * 0.08, H * 0.27, W * 0.84, H * 0.56);
    [[0.13, 0.31], [0.87, 0.31], [0.13, 0.79], [0.87, 0.79]].forEach((p) => { star(c, W * p[0], H * p[1], W * 0.035, b); });
    block(c, tx, W * 0.13, H * 0.32, W * 0.74, H * 0.46, "#fffaf0", "rgba(0,0,0,.35)", W * 0.008);
  } else if (doc.st === "neon") {
    c.fillStyle = "#0c0a14"; c.fillRect(0, 0, W, H); dots(c, W, H, "rgba(255,255,255,.07)", W * 0.03, 2);
    c.save(); c.shadowColor = a; c.shadowBlur = W * 0.04;
    block(c, tx, W * 0.08, H * 0.1, W * 0.84, H * 0.72, a, null); block(c, tx, W * 0.08, H * 0.1, W * 0.84, H * 0.72, "#fff", null, 0);
    c.restore(); c.globalCompositeOperation = "source-over";
  } else {
    c.fillStyle = a; c.fillRect(0, 0, W, H); rays(c, W, H, "rgba(0,0,0,.05)", 0.1);
    block(c, tx, W * 0.06, H * 0.07, W * 0.88, H * 0.8, ink(a), softDots(c, W, H, b, W * 0.032, 0.7, ink(a)), W * 0.012);
  }
  if (doc.nr) doorBadge(c, W, H, doc.nr, a, b);
}
// Fotoebene: das eigene Foto (nur auf dem Geraet) mit Filter; seed fuer Glitch aus Text und Farben (alt photoLayer).
function photo(c, doc, W, H) { c.op({ op: "photo", a: [doc.st, doc.col.slice(), hash32(doc.x + "|" + doc.y + "|" + doc.col.join()), 0, 0, W, H] }); }
function drawPhoto(c, W, H, doc, opt) {
  const a = doc.col[0], b = doc.col[1], has = !!opt.photo;
  if (doc.st === "sticker") {
    c.fillStyle = a; c.fillRect(0, 0, W, H); rays(c, W, H, b, 0.2);
    const cx = W / 2, cy = H * 0.5, r = W * 0.46;
    burstPath(c, cx, cy, r * 1.08, 16, 0.86); c.fillStyle = "#fff"; c.fill();
    c.save(); burstPath(c, cx, cy, r, 16, 0.86); c.clip();
    if (has) photo(c, doc, W, H); else { c.fillStyle = b; c.fill(); }
    c.restore();
    block(c, doc.x, W * 0.08, H * 0.03, W * 0.84, H * 0.15, ink(a), null);
    block(c, doc.y, W * 0.08, H * 0.8, W * 0.84, H * 0.13, ink(a), null);
    return;
  }
  if (has) photo(c, doc, W, H); else { c.fillStyle = a; c.fillRect(0, 0, W, H); }
  if (doc.st === "poster") {
    c.save(); c.globalAlpha = 0.5; dots(c, W, H, b, W * 0.022, 1.2); c.restore();
    block(c, doc.x, W * 0.05, H * 0.03, W * 0.9, H * 0.24, lum(a) > 0.45 ? a : "#fffaf0", "#16121f", W * 0.009);
    block(c, doc.y, W * 0.05, H * 0.8, W * 0.9, H * 0.13, "#fffaf0", "#16121f", W * 0.006);
  } else if (doc.st === "meme") {
    c.op({ op: "meme", a: [doc.x, 0.02, W, H] }); c.op({ op: "meme", a: [doc.y, 0.78, W, H] });
  } else {
    c.fillStyle = b; c.fillRect(0, H * 0.04, W * 0.72, H * 0.1); block(c, doc.x, W * 0.03, H * 0.045, W * 0.66, H * 0.09, ink(b), null);
    c.fillStyle = "#000"; c.fillRect(W * 0.28, H * 0.82, W * 0.72, H * 0.09); block(c, doc.y, W * 0.31, H * 0.825, W * 0.66, H * 0.08, a, null);
  }
}
// Klangkarte: Text, Welle aus den Spitzen, Liedzeilen im Takt, beim Beat die BPM.
function drawSound(c, W, H, doc, peaks, lyr) {
  const a = doc.col[0], b = doc.col[1], fg = ink(a), song = doc.ly && doc.ly.length;
  c.fillStyle = a; c.fillRect(0, 0, W, H);
  block(c, doc.x || "…", W * 0.06, H * 0.05, W * 0.88, H * (song ? 0.22 : 0.3), fg, softDots(c, W, H, b, W * 0.03, 0.4, fg), W * 0.01);
  const n = 40, bw = W * 0.88 / n, cy = H * (song ? 0.36 : 0.64), amp = H * (song ? 0.07 : 0.2);
  c.fillStyle = fg; c.op({ op: "note", a: ["klang", r6(W * 0.06), r6(cy - amp), r6(W * 0.88), r6(amp * 2)] });
  for (let i = 0; i < n; i++) {
    const v = peaks && peaks.length ? peaks[Math.floor(i * peaks.length / n)] : 0.05, bh = Math.max(W * 0.008, v * amp);
    c.fillRect(W * 0.06 + i * bw, cy - bh, bw * 0.62, bh * 2);
  }
  if (song) c.op({ op: "lyrics", a: [doc.ly.slice(), lyr == null ? -1 : lyr, a, b, W, H] });
  if (doc.m === "beat") {
    c.fillStyle = fg; c.font = "900 " + r6(W * 0.05) + "px " + FONT; c.textAlign = "center"; c.fillText(doc.bpm + " BPM", W / 2, H * 0.9);
  }
}

/**
 * @param {object} doc bereinigtes Poster-Dokument (doc.js sanitizePoster)
 * @param {{W?:number,H?:number,nick?:string,photo?:boolean,gi?:boolean,exporting?:boolean,peaks?:number[],lyr?:number}} opt
 * @returns {{w:number,h:number,ops:object[]}} Canvas-Anzeigeliste
 */
export function compile(doc, opt = {}) {
  const W = opt.W || 540, H = opt.H || 675, c = recorder();
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H); c.shadowBlur = 0;
  if (doc.k === "card") drawCard(c, W, H, doc, opt);
  else if (doc.k === "photo") drawPhoto(c, W, H, doc, opt);
  else if (doc.k === "sound") drawSound(c, W, H, doc, opt.peaks, opt.lyr);
  stickers(c, W, H, doc.sk, !!opt.exporting);
  weather(c, W, H, doc.w);          // zuletzt: Sticker duerfen die Quellenzeile nie verdecken
  credit(c, W, H, opt.nick || "", doc.k === "card" && (doc.st === "neon" || doc.st === "advent") ? "#fff" : (doc.k === "photo" && doc.st !== "sticker" ? "#fff" : ink(doc.k === "card" && doc.st === "zettel" ? doc.col[1] : doc.col[0])));
  return { w: W, h: H, ops: c.ops };
}
export const FORMATS = { "4:5": [540, 675], "16:9": [960, 540] };
