// Sticker auf der Vorschau: reine Regeln aus alt:src/stickers.js:8-24 (Treffer, zwei Finger, Rueckgaengig, Muelleimer).
// Verallgemeinert auf jedes Seitenverhaeltnis: aspect = H / W (alt fest 1.25 fuer 4:5; bei 16:9 0.5625).
export const MIN_Z = 0.5, MAX_Z = 2.5, MAX_R = 3.14, HISTORY = 20;
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
/** Oberster Sticker unter p (0..1 der Flaeche). minR: kleinster Trefferradius, damit ein Finger kleine Sticker findet. */
export function hit(list, p, minR, aspect = 1.25) {
  const k = Math.min(1, 0.8 * aspect); // Radius in Breiten-Einheiten: 0.1 z u / W mit u = min(W, 0.8 H)
  for (let i = list.length - 1; i >= 0; i--) {
    if (Math.hypot(list[i].x - p.x, (list[i].y - p.y) * aspect) < Math.max(0.1 * list[i].z * k, minR || 0)) return i;
  }
  return -1;
}
export function inBox(p, b) { return !!b && p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom; }
function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
/** Sticker s0 folgt der Aenderung von Linie a0-b0 zu a1-b1 (zwei Finger oder Mitte und Griff). */
export function transform(s0, a0, b0, a1, b1) {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1, d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  const turn = Math.atan2(b1.y - a1.y, b1.x - a1.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x);
  return { z: Math.round(clamp(s0.z * d1 / d0, MIN_Z, MAX_Z) * 1000) / 1000, r: Math.round(clamp(wrapAngle(s0.r + turn), -MAX_R, MAX_R) * 1000) / 1000 };
}
export function snapshot(list) { return JSON.stringify(list || []); }
export function remember(hist, before) { if (!hist.length || hist[hist.length - 1] !== before) hist.push(before); while (hist.length > HISTORY) hist.shift(); return hist; }
export function restore(hist, list) { if (!hist.length) return false; const was = JSON.parse(hist.pop()); list.length = 0; was.forEach((s) => list.push(s)); return true; }
