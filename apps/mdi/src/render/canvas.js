// Canvas-Anzeigeliste (ADR 0001 b): ein Ausfuehrer fuer Echtzeitkarten, Poster, Dart und Tisch. Karten liefern nur
// Daten ({t:"canvas", w, h, layers|ops|ops2d, a11y}); Farben sind Token-Namen, #rrggbb(aa) oder Verlaeufe.
// Unbekannte Ops werden gezaehlt und gemeldet (info.unknown), nie still als etwas anderes gezeichnet. Hoechstens
// MAX_OPS Ops je Bild. Bei reduzierter Bewegung entfallen shake und flash, particles werden auf 35 % ausgeduennt.
// Abhaengigkeiten (2D-Kontext, Hilfsflaechen, Bilder, Path2D, Token-Farben) kommen herein: testbar mit einem Aufzeichner.
import { FILLS } from "../contract/tokens.js";
import { fitView } from "../app/rt/input.js";
import { exec2d } from "./canvas2d.js";

export const MAX_OPS = 4000;
const HEX = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const PATH_D = /^[MLHVQCSTAZmlhvqcstaz0-9.,\s+-]{1,4000}$/;
const TAU = Math.PI * 2;
export const FONTS = { brand: "Anton, Impact, 'Arial Narrow Bold', sans-serif", body: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif", emoji: "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif" };
const num = (v, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Token-Farben aus den CSS-Variablen (hell/dunkel folgt dem System). */
export function tokenColors(getVar) {
  const out = {};
  for (const f of FILLS) out[f] = (getVar("--" + f) || "").trim() || null;
  return out;
}

/**
 * @param {CanvasRenderingContext2D} c
 * @param {object} node   {t:"canvas", w, h, layers?|ops?|ops2d?, bg?}
 * @param {object} env    { cw, ch, dpr, colors, reduced, t, images?: {get(src)}, path2d?: (d)=>Path2D, makeCanvas?: (w,h)=>canvas,
 *                          cache?: Map, measure? }
 * @returns {{ops:number, unknown:string[], fit:object}}
 */
export function paint(c, node, env) {
  const info = { ops: 0, unknown: [], skipped: 0 };
  if (!node || node.t !== "canvas") throw new TypeError("paint: kein canvas-Knoten");
  const view = { w: num(node.w, 100), h: num(node.h, 100), fit: node.fit === "width" ? "width" : "contain" };
  const fit = fitView(view, env.cw, env.ch), dpr = env.dpr || 1;
  info.fit = fit;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
  c.fillStyle = color(c, env, "surface", "#ffffff"); c.fillRect(0, 0, env.cw, env.ch);
  c.save();
  c.translate(fit.ox, fit.oy); c.scale(fit.k, fit.k);
  c.beginPath(); c.rect(0, 0, view.w, view.h); c.clip();
  let shake = null, flash = null;
  const fx = { setShake: (a) => { shake = a; }, setFlash: (f) => { flash = f; } };
  const layers = Array.isArray(node.layers) ? node.layers : [{ id: "main", ops: node.ops || [] }];
  for (const L of layers) {
    if (!L || typeof L !== "object") continue;
    c.save();
    if (shake && !env.reduced) { const s = shake * Math.sin(env.t * 97), q = shake * Math.cos(env.t * 71); c.translate(s, q); }
    if (L.camera) { const z = num(L.camera.zoom, 1) || 1; c.scale(z, z); c.translate(-num(L.camera.x), -num(L.camera.y)); }
    if (typeof L.key === "string" && env.cache && env.makeCanvas) drawCached(c, L, view, env, info, fx, fit, dpr);
    else ops(c, L.ops || [], env, info, fx);
    if (Array.isArray(L.ops2d)) info.ops += exec2d(c, L.ops2d, { ...env, budget: MAX_OPS - info.ops, unknown: info.unknown });
    c.restore();
  }
  if (Array.isArray(node.ops2d)) info.ops += exec2d(c, node.ops2d, { ...env, src: node.src, budget: MAX_OPS - info.ops, unknown: info.unknown });
  if (flash && !env.reduced) { c.save(); c.globalAlpha = Math.max(0, Math.min(1, num(flash.alpha, 0.3))); c.fillStyle = color(c, env, flash.color, "#ffffff"); c.fillRect(0, 0, view.w, view.h); c.restore(); }
  c.restore();
  return info;
}

function drawCached(c, L, view, env, info, fx, fit, dpr) {
  const scale = fit.k * dpr, key = L.id + "|" + L.key + "|" + Math.round(scale * 1000) + "|" + (env.colorsKey || "");
  let hit = env.cache.get(L.id);
  if (!hit || hit.key !== key) {
    const cv = env.makeCanvas(Math.max(1, Math.ceil(view.w * scale)), Math.max(1, Math.ceil(view.h * scale)));
    const x = cv.getContext("2d");
    x.setTransform(scale, 0, 0, scale, 0, 0);
    ops(x, L.ops || [], env, info, fx);
    hit = { key, cv }; env.cache.set(L.id, hit);
  } else info.ops += (L.ops || []).length;
  c.drawImage(hit.cv, 0, 0, view.w, view.h);
}

export function color(c, env, v, fallback) {
  if (typeof v === "string") {
    if (FILLS.includes(v)) return (env.colors && env.colors[v]) || fallback;
    if (HEX.test(v)) return v;
    return fallback;
  }
  if (v && typeof v === "object" && Array.isArray(v.stops)) {
    let g = null;
    if (Array.isArray(v.lin) && v.lin.length === 4) g = c.createLinearGradient(num(v.lin[0]), num(v.lin[1]), num(v.lin[2]), num(v.lin[3]));
    else if (Array.isArray(v.rad) && v.rad.length === 4) g = c.createRadialGradient(num(v.rad[0]), num(v.rad[1]), Math.max(0, num(v.rad[2])), num(v.rad[0]), num(v.rad[1]), Math.max(0, num(v.rad[3])));
    if (!g) return fallback;
    for (const s of v.stops.slice(0, 16)) if (Array.isArray(s)) g.addColorStop(Math.max(0, Math.min(1, num(s[0]))), color(c, env, s[1], "#000000"));
    return g;
  }
  return fallback;
}

function style(c, env, o, draw) {
  const a = o.alpha === undefined ? null : Math.max(0, Math.min(1, num(o.alpha, 1)));
  const sh = o.shadow && typeof o.shadow === "object" ? o.shadow : null;
  if (a !== null || sh) c.save();
  if (a !== null) c.globalAlpha *= a;
  if (sh) { c.shadowColor = color(c, env, sh.color, "#000000"); c.shadowBlur = Math.max(0, num(sh.blur)); c.shadowOffsetX = num(sh.dx); c.shadowOffsetY = num(sh.dy); }
  draw();
  if (o.fill !== undefined) { c.fillStyle = color(c, env, o.fill, "#000000"); c.fill(); }
  if (o.stroke !== undefined) { c.strokeStyle = color(c, env, o.stroke, "#000000"); c.lineWidth = Math.max(0, num(o.lw, 1)); if (o.cap) c.lineCap = ["butt", "round", "square"].includes(o.cap) ? o.cap : "butt"; c.setLineDash(Array.isArray(o.dash) ? o.dash.slice(0, 8).map((x) => Math.max(0, num(x))) : []); c.stroke(); c.setLineDash([]); }
  if (a !== null || sh) c.restore();
}

function roundRect(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r); c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r); c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
}

function ops(c, list, env, info, fx) {
  for (const o of list) {
    if (info.ops >= MAX_OPS) { info.skipped++; continue; }
    info.ops++;
    if (!o || typeof o !== "object") { info.unknown.push(String(o)); continue; }
    switch (o.o) {
      case "rect": style(c, env, o, () => { c.beginPath(); if (o.r) roundRect(c, num(o.x), num(o.y), num(o.w), num(o.h), num(o.r)); else c.rect(num(o.x), num(o.y), num(o.w), num(o.h)); }); break;
      case "circle": style(c, env, o, () => { c.beginPath(); c.arc(num(o.x), num(o.y), Math.max(0, num(o.r)), 0, TAU); }); break;
      case "ellipse": style(c, env, o, () => { c.beginPath(); c.ellipse(num(o.x), num(o.y), Math.max(0, num(o.rx)), Math.max(0, num(o.ry)), num(o.rot) * TAU, 0, TAU); }); break;
      case "arc": style(c, env, o, () => {
        c.beginPath(); const a0 = num(o.a0) * TAU - Math.PI / 2, a1 = num(o.a1) * TAU - Math.PI / 2;
        if (o.r0 !== undefined) { c.arc(num(o.x), num(o.y), Math.max(0, num(o.r)), a0, a1); c.arc(num(o.x), num(o.y), Math.max(0, num(o.r0)), a1, a0, true); c.closePath(); }
        else c.arc(num(o.x), num(o.y), Math.max(0, num(o.r)), a0, a1);
      }); break;
      case "line": style(c, env, { ...o, fill: undefined, stroke: o.stroke === undefined ? "text" : o.stroke }, () => { c.beginPath(); c.moveTo(num(o.x1), num(o.y1)); c.lineTo(num(o.x2), num(o.y2)); }); break;
      case "poly": style(c, env, o, () => {
        const p = Array.isArray(o.pts) ? o.pts.slice(0, 2000) : []; c.beginPath();
        for (let i = 0; i + 1 < p.length; i += 2) (i ? c.lineTo : c.moveTo).call(c, num(p[i]), num(p[i + 1]));
        if (o.closed) c.closePath();
      }); break;
      case "path":
        if (typeof o.d !== "string" || !PATH_D.test(o.d) || !env.path2d) { info.unknown.push("path"); break; }
        { const p = env.path2d(o.d); const a = o.alpha === undefined ? 1 : num(o.alpha, 1); c.save(); c.globalAlpha *= a;
          if (o.fill !== undefined) { c.fillStyle = color(c, env, o.fill, "#000000"); c.fill(p); }
          if (o.stroke !== undefined) { c.strokeStyle = color(c, env, o.stroke, "#000000"); c.lineWidth = Math.max(0, num(o.lw, 1)); c.stroke(p); }
          c.restore(); }
        break;
      case "text": text(c, env, o); break;
      case "textblock": textblock(c, env, o); break;
      case "sprite": sprite(c, env, o, info); break;
      case "image": image(c, env, o, info); break;
      case "glow": {
        if (!env.reduced || o.keep) { c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha *= Math.max(0, Math.min(1, num(o.alpha, 0.5)));
          const r = Math.max(1, num(o.r, 10)), g = c.createRadialGradient(num(o.x), num(o.y), 0, num(o.x), num(o.y), r);
          const col = color(c, env, o.color, "#ffffff"); g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
          c.fillStyle = g; c.beginPath(); c.arc(num(o.x), num(o.y), r, 0, TAU); c.fill(); c.restore(); }
        break;
      }
      case "particles": {
        const list2 = Array.isArray(o.list) ? o.list.slice(0, 600) : [];
        c.save();
        if (o.shape === "glow") c.globalCompositeOperation = "lighter";
        list2.forEach((p, i) => {
          if (env.reduced && i % 3 !== 0) return; // 35 % bei reduzierter Bewegung (Altcode arcade-ui.js:63)
          if (!Array.isArray(p)) return;
          const [x, y, s, a, col] = p; c.globalAlpha = Math.max(0, Math.min(1, num(a, 1))); c.fillStyle = color(c, env, col, "#ffffff");
          if (o.shape === "sq") c.fillRect(num(x) - num(s) / 2, num(y) - num(s) / 2, num(s), num(s));
          else { c.beginPath(); c.arc(num(x), num(y), Math.max(0, num(s) / 2), 0, TAU); c.fill(); }
        });
        c.restore(); break;
      }
      case "group": {
        c.save();
        c.translate(num(o.tx), num(o.ty)); if (o.rot) c.rotate(num(o.rot) * TAU); c.scale(num(o.sx, 1), num(o.sy, 1));
        if (o.alpha !== undefined) c.globalAlpha *= Math.max(0, Math.min(1, num(o.alpha, 1)));
        if (o.clip && typeof o.clip === "object") { c.beginPath(); if (o.clip.r) c.arc(num(o.clip.x), num(o.clip.y), num(o.clip.r), 0, TAU); else c.rect(num(o.clip.x), num(o.clip.y), num(o.clip.w), num(o.clip.h)); c.clip(); }
        ops(c, Array.isArray(o.ops) ? o.ops : [], env, info, fx);
        c.restore(); break;
      }
      case "shake": fx.setShake(env.reduced ? 0 : Math.max(0, Math.min(40, num(o.amt)))); break;
      case "flash": fx.setFlash(env.reduced ? null : o); break;
      default: info.unknown.push(String(o.o));
    }
  }
}

function font(o) { const size = Math.max(4, Math.min(400, num(o.size, 16))); return (o.font === "brand" ? "400 " : o.bold ? "700 " : "400 ") + size + "px " + (FONTS[o.font] || FONTS.body); }
function text(c, env, o) {
  const s = String(o.text === undefined ? "" : o.text).slice(0, 300);
  c.save(); c.font = font(o);
  c.textAlign = ["left", "center", "right"].includes(o.align) ? o.align : "left";
  c.textBaseline = ["top", "middle", "alphabetic", "bottom"].includes(o.base) ? o.base : "alphabetic";
  if (o.alpha !== undefined) c.globalAlpha *= Math.max(0, Math.min(1, num(o.alpha, 1)));
  const mw = o.maxW ? Math.max(1, num(o.maxW)) : undefined;
  if (o.stroke !== undefined) { c.lineJoin = "round"; c.lineWidth = Math.max(0, num(o.lw, 2)); c.strokeStyle = color(c, env, o.stroke, "#000000"); c.strokeText(s, num(o.x), num(o.y), mw); }
  c.fillStyle = color(c, env, o.fill === undefined ? "text" : o.fill, "#000000"); c.fillText(s, num(o.x), num(o.y), mw);
  c.restore();
}

/** Umbruch und Groesse automatisch: groesste Schrift, bei der alle Zeilen in w×h passen (Gierig-Umbruch). */
export function layoutText(measure, s, w, h, { max = 160, min = 10, lh = 1.1 } = {}) {
  const words = String(s).split(/\s+/).filter(Boolean);
  for (let size = max; size >= min; size = Math.floor(size * 0.92)) {
    const lines = []; let cur = "", ok = true;
    for (const wd of words) {
      const t = cur ? cur + " " + wd : wd;
      if (measure(t, size) <= w) cur = t;
      else { if (!cur || measure(wd, size) > w) { ok = false; break; } lines.push(cur); cur = wd; }
    }
    if (cur) lines.push(cur);
    if (ok && lines.length * size * lh <= h) return { size, lines, lh };
  }
  return { size: min, lines: words.length ? [words.join(" ")] : [], lh, overflow: true };
}
function textblock(c, env, o) {
  const mode = ["poster", "meme", "warm"].includes(o.mode) ? o.mode : "poster";
  const fam = mode === "warm" ? FONTS.body : FONTS.brand;
  let s = String(o.text === undefined ? "" : o.text).slice(0, 300); if (mode === "meme") s = s.toUpperCase();
  const measure = env.measure || ((t, size) => { c.font = "400 " + size + "px " + fam; return c.measureText(t).width; });
  const L = (env.layoutText || layoutText)(measure, s, Math.max(1, num(o.w)), Math.max(1, num(o.h)));
  c.save(); c.font = "400 " + L.size + "px " + fam; c.textAlign = "center"; c.textBaseline = "top";
  const top = num(o.y) + (num(o.h) - L.lines.length * L.size * L.lh) / 2;
  L.lines.forEach((ln, i) => {
    const x = num(o.x) + num(o.w) / 2, y = top + i * L.size * L.lh;
    if (mode === "meme") { c.lineJoin = "round"; c.lineWidth = Math.max(2, L.size / 8); c.strokeStyle = color(c, env, o.stroke === undefined ? "ink" : o.stroke, "#000000"); c.strokeText(ln, x, y); }
    if (o.shadow) { c.shadowColor = color(c, env, o.shadow.color, "rgba(0,0,0,.5)"); c.shadowBlur = num(o.shadow.blur, 4); c.shadowOffsetX = num(o.shadow.dx, 0); c.shadowOffsetY = num(o.shadow.dy, 2); }
    c.fillStyle = color(c, env, o.fill === undefined ? (mode === "meme" ? "paper" : "text") : o.fill, "#000000"); c.fillText(ln, x, y);
  });
  c.restore();
}

function place(o) { return [num(o.x), num(o.y), Math.max(0, num(o.w, num(o.size, 32))), Math.max(0, num(o.h, num(o.size, 32)))]; }
function sprite(c, env, o, info) {
  const [x, y, w, h] = place(o);
  c.save(); c.translate(x, y); if (o.rot) c.rotate(num(o.rot) * TAU); if (o.flip) c.scale(-1, 1);
  if (o.alpha !== undefined) c.globalAlpha *= Math.max(0, Math.min(1, num(o.alpha, 1)));
  if (typeof o.emoji === "string") {
    c.font = Math.round(h) + "px " + FONTS.emoji; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(Array.from(o.emoji).slice(0, 8).join(""), 0, 0);
  } else {
    const img = env.images && env.images.get(o.asset ? { kind: "asset", id: o.asset, key: o.key } : o.src);
    if (img) { if (img.sw) c.drawImage(img.img, img.sx, img.sy, img.sw, img.sh, -w / 2, -h / 2, w, h); else c.drawImage(img.img || img, -w / 2, -h / 2, w, h); }
    else info.unknown.push("sprite:" + (o.asset || (o.src && o.src.kind) || "?") + " fehlt");
  }
  c.restore();
}
function image(c, env, o, info) {
  const [x, y, w, h] = place(o);
  const src = o.src && typeof o.src === "object" ? o.src : null;
  const got = src && env.images ? env.images.get(src, o.filter ? { filter: o.filter, tone: o.tone, seed: o.seed } : null) : null;
  if (!got) { info.unknown.push("image:" + (src ? src.kind : "?") + " fehlt"); return; }
  const img = got.img || got, iw = got.w || img.width || w, ih = got.h || img.height || h;
  c.save();
  if (o.alpha !== undefined) c.globalAlpha *= Math.max(0, Math.min(1, num(o.alpha, 1)));
  c.beginPath();
  if (o.clip === "circle") c.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, TAU);
  else if (o.clip === "burst") { const n = 14, cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) / 2; for (let i = 0; i < n * 2; i++) { const r = i % 2 ? R * 0.78 : R, a = i / (n * 2) * TAU; (i ? c.lineTo : c.moveTo).call(c, cx + r * Math.cos(a), cy + r * Math.sin(a)); } c.closePath(); }
  else c.rect(x, y, w, h);
  c.clip();
  let dw = w, dh = h;
  if (o.fit === "contain") { const k = Math.min(w / iw, h / ih); dw = iw * k; dh = ih * k; } else { const k = Math.max(w / iw, h / ih); dw = iw * k; dh = ih * k; }
  c.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  c.restore();
}
