// Ausfuehrer der Poster-Anzeigeliste auf eine echte Canvas-2D-Leinwand (Referenz fuer den Renderer, Strang F).
// Die hohen Ops (block, meme, warm, lyrics) setzen Text mit den echten Schriftmassen, genau wie alt:src/render.js layout()
// und alt:src/warm.js textBlock(). Die Fotoebene filtert das eigene Foto im Speicher (filters.js) und merkt sich das Ergebnis.
import { FONT, EMO, OP_METHODS, OP_PROPS, ink } from "./compile.js";
import * as F from "./filters.js";
import { draw as notoDraw } from "./noto.js";

// Wortblock: jede Zeile streckt sich auf die volle Breite, wie ein Konzertplakat (alt render.js breakLines/layout).
function breakLines(words, n) {
  const total = words.join(" ").length, tgt = total / n, lines = [];
  let cur = "";
  words.forEach((w) => {
    if (cur && (cur + " " + w).length > tgt * 1.15 && lines.length < n - 1) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
  });
  if (cur) lines.push(cur);
  return lines;
}
/** @returns {{t:string,size:number}[]} */
export function layout(c, text, w, h) {
  const words = String(text).toUpperCase().split(/\s+/).filter(Boolean);
  let best = null;
  if (!words.length) return [];
  for (let n = 1; n <= Math.min(6, words.length); n++) {
    const lines = breakLines(words, n), L = [];
    let H = 0;
    c.font = "900 100px " + FONT;
    lines.forEach((t) => { const size = 100 * w / Math.max(1, c.measureText(t).width); L.push({ t, size }); H += size * 0.98; });
    const k = H > h ? h / H : 1, fill = H * k * k;
    if (!best || fill > best.fill) best = { fill, lines: L.map((l) => ({ t: l.t, size: l.size * k })) };
  }
  return best.lines;
}

// Bildquellen fuer die hohen Ops: eigene Form (env.assets[name], Tests und Referenz) oder die des Renderers
// (env.images.get(env.src[name]), ADR 0001 b). peaks: Wellenspitzen; noto: Sticker-Bogen.
function asset(env, name) {
  if (env.assets && env.assets[name]) return env.assets[name];
  const src = env.src && env.src[name];
  if (name === "noto" && env.images) return env.images.get({ kind: "asset", id: "noto" }) || null;
  return src && env.images ? env.images.get(src) || null : null;
}
function words(c, env, lines, x, y, w, total) {
  if (!Array.isArray(env.parts)) return; // messen nur fuer die Blasen (alt: nur mit rec)
  let mw = 0; lines.forEach((l) => { c.font = "900 " + l.size + "px " + FONT; mw = Math.max(mw, c.measureText(l.t).width); });
  note(c, env, "text", x + (w - mw) / 2, y, mw, total);
}
// Lage der Teile fuer die Blasen des Editors: nur wenn env.parts ein Feld ist (alt: nur die Buehne #stage)
function note(c, env, id, x, y, w, h) {
  if (!Array.isArray(env.parts) || !(w > 0 && h > 0) || !c.getTransform) return;
  const m = c.getTransform(), xs = [], ys = [];
  [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach((q) => { xs.push(m.a * q[0] + m.c * q[1] + m.e); ys.push(m.b * q[0] + m.d * q[1] + m.f); });
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  env.parts.push({ id, x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 });
}
/** Hohe Ops der Poster-Engine: (c, a, env). Der Renderer haengt sie als env.high ein (src/render/canvas2d.js). */
export const HIGH = {
  block(c, a, env) {
    const [text, x, y, w, h, col, shadow, off] = a;
    const lines = layout(c, text, w, h), total = lines.reduce((s, l) => s + l.size * 0.98, 0);
    let yy = y + (h - total) / 2;
    if (lines.length) words(c, env, lines, x, yy, w, total);
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    lines.forEach((l) => {
      yy += l.size * 0.98; c.font = "900 " + l.size + "px " + FONT;
      if (shadow) { c.fillStyle = shadow; c.fillText(l.t, x + w / 2 + (off || 0), yy - l.size * 0.09 + (off || 0)); }
      c.fillStyle = col; c.fillText(l.t, x + w / 2, yy - l.size * 0.09);
    });
  },
  meme(c, a, env) {
    const [text, fy, W, H] = a, ls = layout(c, text, W * 0.92, H * 0.17);
    let yy = H * fy;
    if (ls.length) words(c, env, ls, W * 0.04, yy, W * 0.92, ls.reduce((s, l) => s + l.size * 0.96, 0) + ls[ls.length - 1].size * 0.2);
    ls.forEach((l) => { yy += l.size * 0.96; c.font = "900 " + l.size + "px " + FONT; c.textAlign = "center"; c.lineJoin = "round"; c.lineWidth = l.size * 0.13; c.strokeStyle = "#000"; c.strokeText(l.t, W / 2, yy); c.fillStyle = "#fff"; c.fillText(l.t, W / 2, yy); });
  },
  warm(c, a) {
    const [text, x, y, w, h] = a, max = w * 0.19, lines = layout(c, text, w, h), low = Math.min(...lines.map((l) => l.size));
    lines.forEach((l) => { l.size = Math.min(l.size, max, low * 1.35); });
    const total = lines.reduce((s, l) => s + l.size * 1.06, 0);
    let yy = y + (h - total) / 2;
    c.textAlign = "center"; c.textBaseline = "alphabetic"; c.fillStyle = "#3a2a28";
    lines.forEach((l) => { yy += l.size * 1.06; c.font = "900 " + l.size + "px " + FONT; c.fillText(l.t, x + w / 2, yy - l.size * 0.12); });
  },
  lyrics(c, a) {
    const [ly, lyr, A, B, W, H] = a, top = H * 0.5, step = H * 0.085;
    c.textAlign = "center"; c.textBaseline = "middle";
    for (let i = 0; i < ly.length; i++) {
      const on = i === lyr, y = top + i * step;
      let size = W * (on ? 0.062 : 0.05);
      c.font = "900 " + size + "px " + FONT;
      while (size > W * 0.03 && c.measureText(ly[i]).width > W * 0.86) { size *= 0.92; c.font = "900 " + size + "px " + FONT; }
      if (on) { c.fillStyle = B; c.fillRect(W * 0.04, y - step * 0.46, W * 0.92, step * 0.92); }
      c.fillStyle = on ? ink(B) : ink(A); c.globalAlpha = lyr >= 0 && !on ? 0.75 : 1;
      c.fillText(ly[i], W / 2, y); c.globalAlpha = 1;
    }
    c.textBaseline = "alphabetic";
  },
  radial(c, a) {
    const g = c.createRadialGradient(a[0], a[1], a[2], a[3], a[4], a[5]);
    a[6].forEach((s) => g.addColorStop(s[0], s[1]));
    c.fillStyle = g;
  },
  dots(c, a) {
    const [W, H, col, cell, ang] = a;
    c.fillStyle = col;
    for (let y = 0; y < H; y += cell) for (let x = (Math.floor(y / cell) % 2) * cell / 2; x < W; x += cell) {
      const k = (x / W * Math.cos(ang) + y / H * Math.sin(ang) + 0.4) * 0.9;
      if (k <= 0.25) continue;
      c.beginPath(); c.arc(x, y, Math.min(cell * 0.46, cell * 0.5 * (k - 0.25)), 0, 6.3); c.fill();
    }
  },
  wave(c, a, env) {
    const [x0, cy, amp, bw, n, minh, own] = a, pk = own || (env.assets && env.assets.peaks) || env.peaks;
    for (let i = 0; i < n; i++) {
      const v = pk && pk.length ? pk[Math.floor(i * pk.length / n)] : 0.05, bh = Math.max(minh, v * amp);
      c.fillRect(x0 + i * bw, cy - bh, bw * 0.62, bh * 2);
    }
  },
  note(c, a, env) { note(c, env, ...a); },
  glyph(c, a, env) {
    const [e, r, exporting] = a;
    if (exporting) notoDraw(c, asset(env, "noto"), e, 0, -r * 0.09, r * 1.25);
    else { c.font = r * 1.25 + "px " + EMO; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#000"; c.fillText(e, 0, r * 0.06); }
  },
  photo(c, a, env) {
    const [st, col, seed, x, y, W, H] = a, img = asset(env, "photo");
    if (img) c.drawImage(photoLayer(env, img, st, col, seed, W, H), x, y, W, H);
  },
  image(c, a, env) {
    const [name, x, y, w, h] = a, img = asset(env, name);
    if (img) cover(c, img, x, y, w, h);
  }
};

/**
 * Fuehrt eine Anzeigeliste aus (Referenz und Tests; der Renderer nutzt canvas2d.js mit env.high = HIGH).
 * @param {CanvasRenderingContext2D} c
 * @param {{w:number,h:number,ops:object[]}} list
 * @param {{photo?, gi?, noto?, peaks?, canvas?:(w,h)=>canvas, cache?:object, parts?:boolean}} assets
 * @returns {{id:string,x:number,y:number,w:number,h:number}[]} Lage der Teile in Pixeln (nur mit assets.parts)
 */
export function exec(c, list, assets = {}) {
  const env = { assets, parts: assets.parts ? [] : null, makeCanvas: assets.canvas, cache: assets.cache || (assets.cache = {}) };
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, list.w, list.h); // Vollbild wie alt draw()
  for (const o of list.ops) {
    if (o.m) { if (OP_METHODS.includes(o.m)) c[o.m](...o.a); continue; }
    if (o.p) { if (OP_PROPS.includes(o.p)) c[o.p] = o.v; continue; }
    if (HIGH[o.op]) HIGH[o.op](c, o.a, env); // unbekannte Ops fallen weg (wie im Renderer, dort gemeldet)
  }
  return env.parts || [];
}
function cover(c, img, x, y, w, h) {
  const iw = img.width, ih = img.height, k = Math.max(w / iw, h / ih), dw = iw * k, dh = ih * k;
  c.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
function photoLayer(env, img, st, col, seed, W, H) {
  const cache = env.cache instanceof Map ? env.cache : (env.cache || (env.cache = {})), key = [img._id || "p", W, H, st, col.join(), st === "glitch" ? seed : 0].join("/");
  const hit = cache instanceof Map ? cache.get("poster-photo") : cache.photo;
  if (hit && hit.key === key) return hit.cv;
  const cv = env.makeCanvas ? env.makeCanvas(W, H) : Object.assign(document.createElement("canvas"), { width: W, height: H });
  const c = cv.getContext("2d", { willReadFrequently: true }); cover(c, img, 0, 0, W, H);
  const im = c.getImageData(0, 0, W, H), d = im.data;
  if (st === "poster") F.duotone(d, "#16121f", col[0]);
  else if (st === "sticker") F.posterize(d, 4);
  else if (st === "glitch") F.glitch(d, W, H, seed);
  c.putImageData(im, 0, 0);
  const v = { key, cv };
  if (cache instanceof Map) cache.set("poster-photo", v); else cache.photo = v;
  return cv;
}
