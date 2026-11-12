// Poster-Engine (E7): das Dokument einer Karte, eines Fotos oder eines Klangs und seine Bereinigung.
// Exakt aus dem Altcode portiert (alt:src/daily.js:42-52, 255-262, 321-337, 364-385; alt:src/core.js:22-26, 309-324;
// alt:src/app.js:14). Das Bild selbst steht nie im Dokument: ein eigenes Foto bleibt auf dem Geraet, ein KI-Bild reist
// nur als Server-ID (gi.p). Zufall gibt es hier nicht; Muster (Schnee, Glitch) kommen aus dem Text als Seed.
import { cleanInput, sanitizeName, sanitizeEmoji } from "../text/filter.js";

export const STYLES = { card: ["druck", "zettel", "stempel", "neon", "herz", "advent"], photo: ["poster", "sticker", "meme", "glitch"] };
export const FX = ["chip", "monster", "robot", "echo", "rev", "alien", "tel", "chor"];
export const TEMPO = ["slow", "fast"];
export const MAX_STICKERS = 8, MAX_TEXT = 90;
export const KINDS = ["card", "photo", "sound"];
// Farbpaare aus „Mein Stil“ (alt:src/app.js:14); erste Farbe Flaeche, zweite Akzent.
export const PAIRS = [["#ffd400", "#ff3b1d"], ["#2b4bff", "#ffe600"], ["#ff4fa3", "#0a7f55"], ["#14c872", "#ff3da5"], ["#ff6a1f", "#1b2bd8"], ["#c8ff00", "#7a1fff"], ["#ffffff", "#ff2d2d"], ["#7ee0ff", "#ff5a1f"]];
// Sticker-Saetze (alt:src/daily.js:258-262); "advent" ist das Set der Adventstuer.
export const SETS = {
  tiere: ["🐸", "🦆", "🐙", "🦝", "🐌", "🦖"], essen: ["🍕", "🌮", "🍩", "🥨", "🍟", "🧃"],
  weltall: ["🚀", "🛸", "👽", "🪐", "🌟", "☄️"], chaos: ["💥", "🔥", "💀", "🤡", "🌀", "⚡"],
  grusel: ["🎃", "👻", "🦇", "🕷️", "🧛", "🕸️"], herz: ["💛", "🌻", "✨", "🫶", "🌈", "☀️"],
  advent: ["🎄", "⭐", "🎁", "❄️", "⛄", "🍪"]
};
// Emoji aus „Mein Stil“ (alt:src/app.js:15): in jedem Set als Sticker waehlbar.
export const EMOJI = ["🐸", "🦝", "🐙", "🦖", "🍕", "👽", "🤖", "👻", "🔥", "🌈", "🦄", "🐝"];
export const DEFAULT_COL = ["#ffd400", "#ff3b1d"];
const HEX = /^#[0-9a-f]{6}$/;

export function clampNum(v, min, max, def) {
  if (typeof v === "string" && v.trim() !== "") v = Number(v);
  if (typeof v !== "number" || !isFinite(v)) return def;
  return Math.min(max, Math.max(min, v));
}
/** FNV-1a ueber UTF-16-Codeeinheiten wie im Altcode (alt:src/core.js:309); anders als sdk.fnv1a (UTF-8). */
export function hash32(str) {
  let h = 0x811c9dc5;
  str = String(str);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export function mulberry32(a) {
  a = a >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function sanitizeColors(c, def = DEFAULT_COL) {
  return Array.isArray(c) && c.length === 2 && HEX.test(c[0]) && HEX.test(c[1]) ? [c[0], c[1]] : def.slice();
}
function num(v, r, d) { return Math.round(clampNum(v, r[0], r[1], d)); }

export function steps(v) { return typeof v === "string" && /^[x-]{16}$/.test(v) ? v : "----------------"; }
export function sanitizeStickers(a) {
  return (Array.isArray(a) ? a : []).slice(0, MAX_STICKERS).map((s) => {
    const f = (v, lo, hi, d) => Math.round(clampNum(v, lo, hi, d) * 1000) / 1000;
    return s && typeof s === "object" ? { e: sanitizeEmoji(s.e), x: f(s.x, 0, 1, 0.5), y: f(s.y, 0, 1, 0.5), r: f(s.r, -3.14, 3.14, 0), z: f(s.z, 0.5, 2.5, 1) } : null;
  }).filter(Boolean);
}
/** Wetterstreifen: nur Zahlen des Wetterdienstes, nie aus Wunsch oder Modell; die Karte nennt immer die Quelle. */
export function sanitizeWeather(o) {
  if (!o || typeof o !== "object" || !/^\d{4}-\d{2}-\d{2}$/.test(o.d)) return null;
  const p = cleanInput(o.p, 32), hi = clampNum(o.hi, -60, 60, NaN), lo = clampNum(o.lo, -60, 60, NaN);
  if (!p || isNaN(hi) || isNaN(lo)) return null;
  return { p, d: o.d, hi: Math.round(hi), lo: Math.round(lo), rn: Math.round(clampNum(o.rn, 0, 100, 0)), c: Math.round(clampNum(o.c, 0, 99, 0)) };
}
/** Antwort von POST /api/duell/weather (wr:lib/duell-weather.mjs) -> Wetterstreifen (alt:src/wetter.js:26). */
export function weatherFromApi(j) {
  return j && typeof j === "object" ? sanitizeWeather({ p: j.place, d: j.date, hi: j.hi, lo: j.lo, rn: j.rain, c: j.code }) : null;
}
// KI-Bilder (wr:lib/duell-bild.mjs): nur ihre Server-ID, nie die Bytes. p = Bild der Karte, l = Logo.
const GI_RE = /^[A-Za-z0-9_-]{22}\.(jpg|png)$/; // alt:src/daily.js:356, Ref aus POST /api/duell/bild
export function sanitizeGi(o) {
  if (!o || typeof o !== "object") return null;
  const r = {};
  if (typeof o.p === "string" && GI_RE.test(o.p)) r.p = o.p;
  if (typeof o.l === "string" && GI_RE.test(o.l)) r.l = o.l;
  return r.p || r.l ? r : null;
}

/**
 * Bereinigt ein Poster-Dokument (Teilmenge von alt sanitizeDoc fuer k = card | photo | sound).
 * Felder: k, col, x (y), st, sk, w, nr, gi, n (Name der Macherin), m/fx/tp/bpm/p/ly (Klang), mo (Motiv der Herz-Karte).
 * @returns {object|null}
 */
export function sanitizePoster(o) {
  if (!o || typeof o !== "object" || KINDS.indexOf(o.k) < 0) return null;
  const d = { k: o.k, col: sanitizeColors(o.col) };
  const n = sanitizeName(o.n); if (n) d.n = n;
  const gi = sanitizeGi(o.gi); if (gi) d.gi = gi;
  if (o.k === "card") {
    d.x = cleanInput(o.x, MAX_TEXT); d.st = STYLES.card.indexOf(o.st) >= 0 ? o.st : "druck"; d.sk = sanitizeStickers(o.sk);
    const w = sanitizeWeather(o.w); if (w) d.w = w;
    if (o.nr !== undefined) d.nr = num(o.nr, [1, 24], 1);
    if (typeof o.mo === "string" && MOTIFS.indexOf(o.mo) >= 0) d.mo = o.mo;
  } else if (o.k === "photo") {
    d.x = cleanInput(o.x, 28); d.y = cleanInput(o.y, 28); d.st = STYLES.photo.indexOf(o.st) >= 0 ? o.st : "poster"; d.sk = sanitizeStickers(o.sk);
  } else {
    d.m = o.m === "voice" ? "voice" : "beat"; d.x = cleanInput(o.x, 28); d.fx = FX.indexOf(o.fx) >= 0 ? o.fx : "chip"; if (TEMPO.indexOf(o.tp) >= 0) d.tp = o.tp; d.bpm = num(o.bpm, [70, 170], 110);
    d.p = { k: steps(o.p && o.p.k), s: steps(o.p && o.p.s), h: steps(o.p && o.p.h), b: steps(o.p && o.p.b) };
    const ly = Array.isArray(o.ly) ? o.ly.slice(0, 4).map((l) => (typeof l === "string" ? cleanInput(l, 60) : "")).filter(Boolean) : [];
    if (ly.length) d.ly = ly;
  }
  return d;
}
// Motive der Herz-Karten (alt:src/warm.js:11): Stil "herz" zeichnet eines davon als Sticker.
export const MOTIFS = ["herz", "blume", "stern", "mond", "klee", "regenbogen", "ballon", "sonne", "pflaster", "tasse", "brief"];
// Farbpaare als Feldwert (Enum): das Paar der Adventstuer (Katalog advent-tuer.col) und die acht aus „Mein Stil“.
export const PAIR_HEX = { advent: ["#0f5132", "#ffd400"], ...Object.fromEntries(PAIRS.map((p, i) => ["p" + i, p])) };
export const PAIR_IDS = Object.keys(PAIR_HEX);
