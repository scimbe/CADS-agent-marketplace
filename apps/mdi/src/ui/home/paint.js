// Bilder ohne Netz auf einer Leinwand (2D-Kontext, kein fremdes Bild -> nie "tainted"): Werk-Kachel fuer Wand und
// Profil-Sync (data:image/jpeg <= 30000 Zeichen, Server-Regel) und das Story-Bild 9:16 mit QR (alt:src/statuscard.js).
import { qrMatrix } from "./qr.js";

const SHAPES = {
  star: (g, x, y, r) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); } g.closePath(); },
  heart: (g, x, y, r) => { g.beginPath(); g.moveTo(x, y + r * 0.8); g.bezierCurveTo(x - r * 1.4, y - r * 0.2, x - r * 0.6, y - r * 1.2, x, y - r * 0.4); g.bezierCurveTo(x + r * 0.6, y - r * 1.2, x + r * 1.4, y - r * 0.2, x, y + r * 0.8); g.closePath(); },
  bolt: (g, x, y, r) => { g.beginPath(); [[0.1, -1], [-0.6, 0.15], [-0.05, 0.15], [-0.2, 1], [0.6, -0.2], [0.05, -0.2], [0.25, -1]].forEach(([a, b]) => g.lineTo(x + a * r, y + b * r)); g.closePath(); },
  drop: (g, x, y, r) => { g.beginPath(); g.moveTo(x, y - r); g.bezierCurveTo(x + r, y, x + r * 0.7, y + r, x, y + r); g.bezierCurveTo(x - r * 0.7, y + r, x - r, y, x, y - r); g.closePath(); },
  coin: (g, x, y, r) => { g.beginPath(); g.arc(x, y, r * 0.85, 0, Math.PI * 2); },
  ring: (g, x, y, r) => { g.beginPath(); g.arc(x, y, r * 0.85, 0, Math.PI * 2); g.arc(x, y, r * 0.45, 0, Math.PI * 2, true); }
};
function lines(g, text, max) {
  const out = []; let cur = "";
  for (const w of String(text).split(/\s+/).filter(Boolean)) { const t = cur ? cur + " " + w : w; if (g.measureText(t).width > max && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur);
  return out.slice(0, 3);
}
/** Kachel 16:9 im Stil der Thumbnails: Familienfarbe, Strahlen, Form, Titeltafel unten links. */
export function drawTile(g, w, h, o) {
  g.fillStyle = o.color; g.fillRect(0, 0, w, h);
  g.save(); g.translate(w * 0.62, h * 0.55); g.fillStyle = "rgba(255,255,255,.22)";
  for (let i = 0; i < 20; i++) { g.rotate(Math.PI / 10); g.beginPath(); g.moveTo(0, 0); g.lineTo(w, -w * 0.08); g.lineTo(w, w * 0.08); g.closePath(); if (i % 2 === 0) g.fill(); }
  g.restore();
  (SHAPES[o.shape] || SHAPES.star)(g, w * 0.72, h * 0.45, h * 0.28);
  g.fillStyle = "#F9D84A"; g.fill(); g.lineWidth = Math.max(3, h / 60); g.strokeStyle = "#17140F"; g.stroke();
  const fs = Math.round(h / 7.5);
  g.font = "400 " + fs + "px Anton, Impact, sans-serif";
  const ls = lines(g, String(o.title || "").toUpperCase(), w * 0.62);
  const pad = fs * 0.3, lh = fs * 1.08, bw = Math.max(...ls.map((l) => g.measureText(l).width), 10) + pad * 2, bh = ls.length * lh + pad;
  g.save(); g.translate(w * 0.04, h - h * 0.06 - bh); g.rotate(-0.026);
  g.fillStyle = "#17140F"; g.fillRect(0, 0, bw, bh);
  g.fillStyle = "#F9D84A"; g.textBaseline = "top"; ls.forEach((l, i) => g.fillText(l, pad, pad * 0.6 + i * lh));
  g.restore();
}
/** Werk-Kachel als data:image/jpeg; wird kleiner, bis sie unter die Grenze passt. null, wenn das nicht geht. */
export function tileJpeg(doc, o, limit = 30000) {
  for (const [w, q] of [[480, 0.72], [400, 0.6], [320, 0.5], [240, 0.45]]) {
    const cv = doc.createElement("canvas"); cv.width = w; cv.height = Math.round((w * 9) / 16);
    const g = cv.getContext("2d"); if (!g) return null;
    drawTile(g, cv.width, cv.height, o);
    const url = cv.toDataURL("image/jpeg", q);
    if (url.startsWith("data:image/jpeg") && url.length <= limit) return url;
  }
  return null;
}
export const STORY = { W: 1080, H: 1920, SAFE_TOP: 150, SAFE_BOTTOM: 260, SIDE: 300, MARGIN: 72 };
export function splitUrl(url) { const s = String(url).replace(/^https?:\/\//, ""), i = s.indexOf("/s/"); return i < 0 ? { head: s.length > 34 ? s.slice(0, 33) + "…" : s, id: "" } : { head: s.slice(0, i + 3), id: s.slice(i + 3) }; }
/** Story-Bild 9:16 (alt:statuscard.js draw): Werk oben, unten QR mit Ruhezone und die Adresse in Klartext. */
export function drawStory(doc, o) {
  const { W, H, SAFE_TOP, SAFE_BOTTOM, SIDE, MARGIN } = STORY;
  const cv = doc.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  g.fillStyle = o.bg || "#F9D84A"; g.fillRect(0, 0, W, H);
  const bandTop = H - SAFE_BOTTOM - SIDE, pw = W - 2 * MARGIN, ph = Math.round((pw * 9) / 16), py = Math.max(SAFE_TOP, bandTop - 40 - ph - 200);
  g.fillStyle = "#17140F"; g.fillRect(MARGIN - 6, py - 6, pw + 12, ph + 12);
  g.save(); g.translate(MARGIN, py); drawTile(g, pw, ph, o); g.restore();
  g.fillStyle = "#17140F"; g.font = "400 64px Anton, Impact, sans-serif"; g.textBaseline = "alphabetic";
  lines(g, String(o.headline || "").toUpperCase(), W - 2 * MARGIN).forEach((l, i) => g.fillText(l, MARGIN, py + ph + 100 + i * 72));
  const m = qrMatrix(o.url), n = m.length, s = Math.floor(SIDE / (n + 8)), full = s * (n + 8), off = 4 * s, qx = W - MARGIN - full;
  g.fillStyle = "#FFFFFF"; g.fillRect(qx, bandTop, full, full); g.fillStyle = "#000000";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) g.fillRect(qx + off + c * s, bandTop + off + r * s, s, s);
  const mid = bandTop + full / 2, parts = splitUrl(o.url), tw = W - 2 * MARGIN - full - 30;
  g.fillStyle = "#17140F"; g.textAlign = "left";
  g.font = "400 52px Anton, Impact, sans-serif"; g.fillText(o.cta, MARGIN, mid - 66, tw);
  g.font = "700 36px ui-monospace, Menlo, Consolas, monospace"; g.fillText(parts.head, MARGIN, mid + 2, tw);
  if (parts.id) { g.font = "700 72px ui-monospace, Menlo, Consolas, monospace"; g.fillText(parts.id, MARGIN, mid + 84, tw); }
  return cv;
}
