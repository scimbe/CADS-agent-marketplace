// Pixelfilter fuer das eigene Foto (d = RGBA-Bytes), exakt aus alt:src/studio.js:94-145. Alles bleibt im Speicher des Geraets.
function luma(d, i) { return (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255; }
function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
function contrast(x) { x = (x - 0.5) * 1.5 + 0.5; return x < 0 ? 0 : x > 1 ? 1 : x; }
export function duotone(d, dark, light) {
  const a = hex(dark), b = hex(light);
  for (let i = 0; i < d.length; i += 4) { const l = contrast(luma(d, i)); d[i] = a[0] + (b[0] - a[0]) * l; d[i + 1] = a[1] + (b[1] - a[1]) * l; d[i + 2] = a[2] + (b[2] - a[2]) * l; }
  return d;
}
export function posterize(d, levels) {
  const s = 255 / (levels - 1);
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] / s) * s;
  return d;
}
// Druckpunkte: dunkleres Bild -> groesserer Punkt je Zelle.
export function halftone(d, w, h, cell, ink, paper) {
  const a = hex(ink), b = hex(paper);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = Math.floor(x / cell) * cell + (cell >> 1), cy = Math.floor(y / cell) * cell + (cell >> 1);
    const li = (Math.min(h - 1, cy) * w + Math.min(w - 1, cx)) * 4;
    const dark = 1 - contrast(luma(d, li)), r = dark * cell * 0.72, dx = x - cx, dy = y - cy;
    d[(y * w + x) * 4 + 3] = dx * dx + dy * dy <= r * r ? 1 : 0;
  }
  for (let i = 0; i < d.length; i += 4) { const c = d[i + 3] ? a : b; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
  return d;
}
export function glitch(d, w, h, seed) {
  let s = (seed >>> 0) || 1;
  function r() { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  const src = d.slice(), shift = Math.max(2, Math.round(w * 0.018));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    d[i] = src[(y * w + Math.min(w - 1, x + shift)) * 4];
    d[i + 2] = src[(y * w + Math.max(0, x - shift)) * 4 + 2];
  }
  for (let b = 0; b < 14; b++) {
    const y0 = Math.floor(r() * h), bh = Math.ceil(r() * h * 0.05), off = Math.floor((r() - 0.5) * w * 0.3), row = d.slice();
    for (let y = y0; y < Math.min(h, y0 + bh); y++) for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 4, sx = (((x + off) % w) + w) % w, k = (y * w + sx) * 4;
      d[j] = row[k]; d[j + 1] = row[k + 1]; d[j + 2] = row[k + 2];
    }
  }
  for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x++) { const q = (y * w + x) * 4; d[q] *= 0.8; d[q + 1] *= 0.8; d[q + 2] *= 0.8; }
  return d;
}
