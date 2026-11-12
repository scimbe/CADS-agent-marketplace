// Dart (spiel-dart): eine echte Dartscheibe, portiert aus alt:src/dart.js (Regeln, Hand, Bert, Namen, Texte bitgleich).
// Reine Logik ohne DOM, ohne Globals, ohne Uhr. Kein Punktestand steht je im Link: ein Zug sagt, was die Hand tat, und
// jedes Geraet rechnet die Treffer nach. Darts-Kodierung (base64url):
//   2 Zeichen Kopf  Spielart (a 301 Double-Out, b 301 Einsteiger, c Rund um die Uhr, d Hoechste Punktzahl in 3 Runden)
//                   und Gegner (l per Link, b gegen Bert)
//   5 Zeichen/Pfeil Ziel x, Ziel y (je 2: 0..4095, Tausendstel des Brettradius um 2048), Kraft (0..8; 4 fliegt gerade;
//                   9..17 dieselben Stufen am Regler ohne Timing, die der Seed um eine Stufe schuettelt: 1 von 5 weniger,
//                   1 von 5 mehr)
// Wo ein Pfeil landet: Ziel + Kraft (jede Stufe neben der Mitte etwa 9 mm zu hoch oder zu tief) + Streuung der Hand aus
// Seed und Pfeilnummer (etwa 15 mm je Achse). Nur + - * / auf Literalen und eine Sinustabelle (kein Math.sin): jedes
// Geraet bekommt dieselben Zahlen. Keine gesteuerte Schwierigkeit: Streuung und Berts Hand haengen nie vom Stand ab.
// Gleitkomma bleibt intern; der Kartenzustand traegt nur die Zeichenkette der Darts.
import DATA from "./dart.json" with { type: "json" };
import { seeded, form, fmt } from "../seed32/seed32.js";
import { clean } from "./filter.js";

export { DATA };
const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
// die Zahlen im Uhrzeigersinn von oben
export const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
// sin 0°, 9°, ... 90°: jeder Winkel des Bretts (Segmentkanten 9° + 18° k, Mitten 18° k) ist ein Vielfaches von 9°
const SIN9 = [0, 0.15643446504023087, 0.3090169943749474, 0.45399049973954675, 0.5877852522924731, 0.7071067811865476,
  0.8090169943749475, 0.8910065241883679, 0.9510565162951535, 0.9876883405951378, 1];
// round(1000 sin(i 360° / 64)) fuer eine Vierteldrehung: das Zittern der Hand
const W16 = [0, 98, 195, 290, 383, 471, 556, 634, 707, 773, 831, 882, 924, 957, 981, 995, 1000];
// Ringe eines Turnierbretts in mm; der Aussenrand des Doppelrings (170 mm) ist 1
const MMR = 170, BULL = 6.35 / MMR, OUTER = 15.9 / MMR, T_IN = 99 / MMR, T_OUT = 107 / MMR, D_IN = 162 / MMR;
export const KIND = { a: "x01", b: "x01", c: "atc", d: "high" }, MODES = ["a", "b", "c", "d"], START = 301, ROUNDS = 12, HIGH = 3;
export const WOB = 0.09, POWER = 0.055, SCAT = 0.09, LEVELS = 9, MID = 4, STEPS = 64, STEP_MS = 70, NAME = 12, MAXLEN = 2 + 5 * 3 * ROUNDS * 2;
const RADIUS = { s: (T_OUT + D_IN) / 2, i: (OUTER + T_IN) / 2, t: (T_IN + T_OUT) / 2, d: (D_IN + 1) / 2 };
export const R = { BULL, OUTER, T_IN, T_OUT, D_IN };

/** Textblock einer Sprache; Luecken liest er aus dem deutschen Block (alt:src/core.js textsFor). */
export function T(lang) { const de = DATA.text.de, b = DATA.text[lang]; return !b || b === de ? de : { ...de, ...b }; }
function say(lang, k, n, o) { return fmt(form(T(lang), k, n, lang), Object.assign({ n }, o || {})); }
function intIn(v, a, b) { return Number.isInteger(v) && v >= a && v <= b; }
function rng(tag) { return seeded("dart|" + tag); }

// ---------- das Brett ----------
export function sd(j) { j = ((j % 40) + 40) % 40; const q = Math.floor(j / 10), r = j % 10; return q === 0 ? SIN9[r] : q === 1 ? SIN9[10 - r] : q === 2 ? -SIN9[r] : -SIN9[10 - r]; }
export function dir(j) { return [sd(j), -sd(j + 10)]; }
const EDGE = []; for (let e = 0; e < 20; e++) EDGE.push(dir(1 + 2 * e));
function cross(a, x, y) { return a[0] * y - a[1] * x; }
function sector(x, y) {
  for (let k = 0; k < 20; k++) { const b = EDGE[(k + 1) % 20]; if (cross(EDGE[k], x, y) >= 0 && cross(b, x, y) < 0) return ORDER[(k + 1) % 20]; }
  return ORDER[0];
}
/** n: Zahl (25 Bull, 0 daneben), m: 1 Single, 2 Double (Bullseye zaehlt als Double), 3 Triple. */
export function score(x, y) {
  const r2 = x * x + y * y;
  if (r2 > 1) return { n: 0, m: 0, p: 0 };
  if (r2 <= BULL * BULL) return { n: 25, m: 2, p: 50 };
  if (r2 <= OUTER * OUTER) return { n: 25, m: 1, p: 25 };
  const n = sector(x, y), m = r2 >= D_IN * D_IN ? 2 : r2 >= T_IN * T_IN && r2 < T_OUT * T_OUT ? 3 : 1;
  return { n, m, p: n * m };
}
/** Mitte eines Feldes: r "s" aeusseres Single, "i" inneres Single, "t", "d"; beim Bull "o" der 25er-Ring, sonst Mitte. */
export function centre(n, r) {
  if (n === 25) return r === "o" ? [0, -(BULL + OUTER) / 2] : [0, 0];
  const d = dir(2 * ORDER.indexOf(n)), k = RADIUS[r] || RADIUS.s;
  return [d[0] * k, d[1] * k];
}

// ---------- die Hand ----------
function w64(i) { i = ((i % 64) + 64) % 64; const q = i >> 4, r = i & 15; return (q === 0 ? W16[r] : q === 1 ? W16[16 - r] : q === 2 ? -W16[r] : -W16[16 - r]) / 1000; }
const IH = SCAT / 0.5773502691896258;
/** Pfeil Nummer k der Partie (beide Seiten gezaehlt, Bert auch): Streuung, Phase des Zitterns, Startstufe des Pendels. */
export function hand(seed, k) {
  const r = rng(seed + "|" + k), ph = [0, 0, 0, 0].map(() => Math.floor(r() * STEPS));
  return { ph, sx: (r() + r() + r() + r() - 2) * IH, sy: (r() + r() + r() + r() - 2) * IH, lv: Math.floor(r() * LEVELS) };
}
/** Wohin das Fadenkreuz zur Zeit t (0..63) driftet: nur ein Bild der Hand, der Wurf haengt nicht davon ab. */
export function wobble(h, t) {
  if (t !== Math.floor(t)) { const a = wobble(h, Math.floor(t)), b = wobble(h, Math.floor(t) + 1), f = t - Math.floor(t); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
  return [WOB * (0.6 * w64(3 * t + h.ph[0]) + 0.4 * w64(7 * t + h.ph[1])), WOB * (0.6 * w64(2 * t + h.ph[2]) + 0.4 * w64(5 * t + h.ph[3]))];
}
/** Pendel der Kraft: eine Stufe je SWING ms, hoch und wieder runter ohne Halt, ab der Startstufe lv. */
export const SWING = 160, QUICK = 150;
export function swing(lv, ms) { const n = 2 * (LEVELS - 1), i = ((lv + Math.floor(Math.max(0, ms) / SWING)) % n + n) % n; return i < LEVELS ? i : n - i; }
export function aimOf(d) { return [(d.ax - 2048) / 1000, (d.ay - 2048) / 1000]; }
function grid(v) { return Math.max(0, Math.min(4095, Math.round(v * 1000) + 2048)); }
/** Regler-Stufe, vom Seed geschuettelt wie ein Pendel: je 1 von 5 eine Stufe weniger oder mehr. */
export function shake(seed, k) { const u = rng("lv|" + seed + "|" + k)(); return u < 0.2 ? -1 : u < 0.4 ? 1 : 0; }
export function level(seed, k, d) { return d.f ? Math.max(0, Math.min(LEVELS - 1, d.p + shake(seed, k))) : d.p; }
/** Landung eines Pfeils: { x, y, n, m, p, d }. */
export function land(seed, k, d) {
  const h = hand(seed, k), a = aimOf(d), x = a[0] + h.sx, y = a[1] - (level(seed, k, d) - MID) * POWER + h.sy, s = score(x, y);
  return { x, y, n: s.n, m: s.m, p: s.p, d };
}

// ---------- die Zeichen im Link ----------
export function enc(d) { return ABC[d.ax >> 6] + ABC[d.ax & 63] + ABC[d.ay >> 6] + ABC[d.ay & 63] + ABC[d.p + (d.f ? LEVELS : 0)]; }
export function dec(s) {
  if (typeof s !== "string" || s.length % 5) return null;
  const out = [];
  for (let i = 0; i < s.length; i += 5) {
    const c = []; for (let j = 0; j < 5; j++) { const v = ABC.indexOf(s[i + j]); if (v < 0) return null; c.push(v); }
    if (c[4] >= 2 * LEVELS) return null;
    const o = { ax: c[0] * 64 + c[1], ay: c[2] * 64 + c[3], p: c[4] % LEVELS }; if (c[4] >= LEVELS) o.f = 1;
    out.push(o);
  }
  return out;
}
/** f: am Regler gesetzt (ohne Timing), vom Seed geschuettelt. */
export function dart(ax, ay, p, f) { const d = { ax: grid(ax), ay: grid(ay), p: Math.max(0, Math.min(LEVELS - 1, Math.round(p))) }; if (f) d.f = 1; return d; }
export function head(mode, bot) { return mode + (bot ? "b" : "l"); }

// ---------- Bert, der Bot: ein Stammgast. Dieselbe Streuung wie alle, zielt wie ein Stammgast, trifft die Kraftstufe
// 2 von 5 Mal um eine daneben und passt sich nie dem Stand an ----------
export function aimFor(g, p) {
  if (g.kind === "atc") return { n: g.next[p], r: "s" };
  if (g.kind === "high") return { n: 20, r: "t" };
  const L = g.left[p];
  if (L === 50) return { n: 25, r: "b" };
  if (g.mode === "b") {
    if (L <= 20) return { n: L, r: "s" };
    if (L === 25) return { n: 25, r: "o" };
    if (L <= 40 && L % 2 === 0) return { n: L / 2, r: "d" };
    if (L <= 60 && L % 3 === 0) return { n: L / 3, r: "t" };
    return L >= 61 ? { n: 20, r: "t" } : { n: L - 20 <= 20 ? L - 20 : 20, r: "s" };
  }
  if (L >= 62) return { n: 20, r: "t" };
  if (L > 40) return L - 40 <= 20 ? { n: L - 40, r: "s" } : { n: 7, r: "t" };
  return L % 2 === 0 ? { n: L / 2, r: "d" } : { n: 1, r: "s" };
}
export function botDart(seed, k, at) {
  const r = rng("bert|" + seed + "|" + k), c = centre(at.n, at.r), u = r();
  return dart(c[0], c[1], u < 0.2 ? MID - 1 : u < 0.4 ? MID + 1 : MID);
}

// ---------- das Spiel: jede Aufnahme aus den Darts neu gerechnet ----------
// -> { mode, kind, bot, left, next, total, done, turns: [{ p, d: [Landung], pts, bust, out, from }], k, over, win (-1
//    Unentschieden), capped, partial, extra } oder null
export function sim(seed, s) {
  if (typeof s !== "string" || s.length < 2 || s.length > MAXLEN || !KIND[s[0]] || "lb".indexOf(s[1]) < 0) return null;
  const ds = dec(s.slice(2)); if (!ds) return null;
  const g = { mode: s[0], kind: KIND[s[0]], bot: s[1] === "b", left: [START, START], next: [1, 1], total: [0, 0], done: [0, 0], turns: [], k: 0, over: false, win: -1, capped: false, partial: false, extra: false };
  let i = 0;
  while (!g.over) {
    const p = g.turns.length % 2, bert = g.bot && p === 1;
    if (!bert && i >= ds.length) break;
    if (!turn(g, seed, p, bert ? (k) => botDart(seed, k, aimFor(g, 1)) : () => (i < ds.length ? ds[i++] : null))) break;
  }
  g.extra = i < ds.length;
  return g;
}
function turn(g, seed, p, next) {
  const t = { p, d: [], pts: 0, bust: false, out: false, from: g.left[p] };
  g.turns.push(t);
  for (let j = 0; j < 3; j++) {
    const d = next(g.k); if (!d) { g.partial = true; return false; }
    const h = land(seed, g.k, d); g.k++; t.d.push(h);
    if (g.kind === "x01") {
      const L = g.left[p] - h.p;
      if (L < 0 || (g.mode === "a" && (L === 1 || (L === 0 && h.m !== 2)))) { t.bust = true; t.pts = 0; g.left[p] = t.from; break; }
      g.left[p] = L; t.pts += h.p;
      if (!L) { t.out = true; g.done[p] = g.k; break; }
    } else if (g.kind === "atc") {
      if (h.n === g.next[p]) { h.ok = true; g.next[p]++; t.pts++; }
      if (g.next[p] > 20) { t.out = true; g.done[p] = g.k; break; }
    } else { g.total[p] += h.p; t.pts += h.p; }
  }
  // Beide bekommen gleich viele Aufnahmen (301 und Rund um die Uhr): Wer beginnt und zuerst fertig ist, wartet die
  // Aufnahme des anderen ab; sind beide fertig, gewinnen weniger Pfeile, gleich viele sind unentschieden.
  if (g.turns.length % 2 === 0 && (g.done[0] || g.done[1])) {
    const d0 = g.done[0] ? darts(g, 0) : 1e9, d1 = g.done[1] ? darts(g, 1) : 1e9;
    g.over = true; g.win = d0 < d1 ? 0 : d1 < d0 ? 1 : -1;
  }
  if (!g.over && g.turns.length >= 2 * (g.kind === "high" ? HIGH : ROUNDS)) {
    g.over = true; g.capped = g.kind !== "high";
    const a = g.kind === "x01" ? g.left[1] - g.left[0] : g.kind === "atc" ? g.next[0] - g.next[1] : g.total[0] - g.total[1];
    g.win = a > 0 ? 0 : a < 0 ? 1 : -1;
  }
  return true;
}
export function darts(g, p) { return g.turns.reduce((a, t) => a + (t.p === p ? t.d.length : 0), 0); }
export function rounds(g) { return g.kind === "high" ? HIGH : ROUNDS; }

// ---------- Spitznamen: jede Schrift, eine je Name, Vergleich ueber ein Skelett ----------
const HIDDEN = /[\p{Cf}\p{Cc}⠀ㅤᅟᅠﾠ]/gu;
const LOOK = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s", "к": "k", "м": "m", "н": "h", "т": "t", "в": "b",
  "ԁ": "d", "ӏ": "l", "ь": "b", "г": "r", "ԛ": "q", "ԝ": "w", "α": "a", "β": "b", "ε": "e", "η": "n", "ι": "i", "κ": "k", "μ": "m", "ν": "v", "ο": "o", "ρ": "p", "τ": "t", "υ": "u", "χ": "x", "γ": "y",
  "ս": "u", "օ": "o", "հ": "h", "ո": "n", "զ": "q", "ց": "g", "ա": "w", "ք": "p", "ւ": "l", "ᥙ": "u", "ᥒ": "n", "ᥐ": "g",
  "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "ß": "ss" };
const CHER = { "Ꭰ": "d", "Ꭱ": "r", "Ꭲ": "t", "Ꭵ": "i", "Ꭺ": "a", "Ꭻ": "j", "Ꭼ": "e", "Ꮃ": "w", "Ꮇ": "m", "Ꮋ": "h", "Ꮐ": "g", "Ꮓ": "z", "Ꮤ": "w", "Ꮩ": "v",
  "Ꮪ": "s", "Ꮮ": "l", "Ꮯ": "c", "Ꮲ": "p", "Ꮶ": "k", "Ᏼ": "b", "Ᏻ": "g", "Ꮍ": "y", "Ꮑ": "n", "Ꮻ": "o", "Ꮜ": "u",
  "ꓐ": "b", "ꓑ": "p", "ꓒ": "d", "ꓓ": "d", "ꓔ": "t", "ꓖ": "g", "ꓗ": "k", "ꓙ": "j", "ꓚ": "c", "ꓜ": "z", "ꓝ": "f", "ꓟ": "m", "ꓠ": "n", "ꓡ": "l", "ꓢ": "s",
  "ꓣ": "r", "ꓦ": "v", "ꓧ": "h", "ꓪ": "w", "ꓫ": "x", "ꓬ": "y", "ꓮ": "a", "ꓰ": "e", "ꓲ": "i", "ꓳ": "o", "ꓴ": "u" };
const UP = { "Α": "a", "Β": "b", "Ε": "e", "Ζ": "z", "Η": "h", "Ι": "i", "Κ": "k", "Μ": "m", "Ν": "n", "Ο": "o", "Ρ": "p", "Τ": "t", "Υ": "y", "Χ": "x",
  "А": "a", "В": "b", "Е": "e", "К": "k", "М": "m", "Н": "h", "О": "o", "Р": "p", "С": "c", "Т": "t", "Х": "x", "У": "y", "Ѕ": "s", "І": "i", "Ј": "j", "Ԁ": "d", "Ԛ": "q", "Ԝ": "w", "Д": "d", "д": "d",
  "Ꮢ": "r", "ᴀ": "a", "ᴁ": "ae", "ᴃ": "b", "ᴄ": "c", "ᴅ": "d", "ᴆ": "d", "ᴇ": "e", "ᴉ": "i", "ᴊ": "j", "ᴋ": "k", "ᴌ": "l", "ᴍ": "m", "ᴎ": "n", "ᴏ": "o", "ᴐ": "o",
  "ᴑ": "o", "ᴓ": "o", "ᴘ": "p", "ᴙ": "r", "ᴚ": "r", "ᴛ": "t", "ᴜ": "u", "ᴠ": "v", "ᴡ": "w", "ᴢ": "z", "ɑ": "a", "ɡ": "g", "ʀ": "r", "ɪ": "i", "ʙ": "b", "ɢ": "g",
  "ʜ": "h", "ʟ": "l", "ɴ": "n", "ʏ": "y", "ꜱ": "s", "ꜰ": "f", "ı": "i", "ȷ": "j" };
function cher(c) { const k = c.codePointAt(0); return k >= 0xAB70 && k <= 0xABBF ? String.fromCodePoint(k - 0xAB70 + 0x13A0) : c; }
export function plainName(n) { return String(n === undefined || n === null ? "" : n).replace(HIDDEN, ""); }
export function foldName(n) {
  return Array.from(plainName(n).normalize("NFKC")).map((c) => { const u = cher(c); return CHER[u] || UP[u] || LOOK[u.toLowerCase()] || UP[u.toLowerCase()] || u.toLowerCase(); }).join("")
    .normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");
}
const SCRIPTS = ["Latin", "Greek", "Cyrillic", "Armenian", "Hebrew", "Arabic", "Syriac", "Thaana", "Devanagari", "Bengali", "Gurmukhi", "Gujarati", "Oriya", "Tamil", "Telugu",
  "Kannada", "Malayalam", "Sinhala", "Thai", "Lao", "Tibetan", "Myanmar", "Georgian", "Hangul", "Ethiopic", "Cherokee", "Khmer", "Mongolian", "Hiragana", "Katakana", "Han", "Lisu", "Tai_Le", "Bopomofo"]
  .map((x) => [x, new RegExp("\\p{scx=" + x + "}", "u")]);
const AUG = { Han: ["Jpan", "Kore", "Hanb"], Hiragana: ["Jpan"], Katakana: ["Jpan"], Hangul: ["Kore"], Bopomofo: ["Hanb"] };
function oneScript(n) {
  let left = null;
  Array.from(n.normalize("NFKC")).forEach((c) => {
    if (/[\p{scx=Common}\p{scx=Inherited}]/u.test(c) && !SCRIPTS.some((x) => x[1].test(c))) return;
    const set = {}; SCRIPTS.forEach((x) => { if (x[1].test(c)) { set[x[0]] = 1; (AUG[x[0]] || []).forEach((a) => { set[a] = 1; }); } });
    if (!Object.keys(set).length) set["?" + c] = 1;
    if (!left) left = set; else Object.keys(left).forEach((k) => { if (!set[k]) delete left[k]; });
  });
  return !left || Object.keys(left).length > 0;
}
const TAKEN = {};
Object.keys(DATA.text).forEach((l) => { ["da_me", "da_bot", "da_p1", "da_p2", "da_opp"].forEach((k) => { if (DATA.text[l][k]) TAKEN[foldName(DATA.text[l][k])] = 1; }); });
["bert", "bot", "du", "you", "ich", "me", "spieler", "player", "gegner", "opponent"].forEach((w) => { TAKEN[w] = 1; });
const MARK = { du: 1, you: 1 };
export function nameOk(n) {
  if (n === "") return true;
  if (typeof n !== "string" || plainName(n) !== n || /[()[\]{}]/.test(n) || clean(n, NAME) !== n || !oneScript(n) || !foldName(n) || TAKEN[foldName(n)]) return false;
  const tail = /\p{Ll}(\p{Lu}\p{Ll}*)$/u.exec(n.normalize("NFKC"));
  if (tail && MARK[foldName(tail[1])]) return false;
  return !n.normalize("NFKC").split(/[\s\-_.,;:'’·]+/).some((w) => { const f = foldName(w); return f && TAKEN[f]; });
}
export function namesOk(a) { return Array.isArray(a) && a.length === 2 && nameOk(a[0]) && nameOk(a[1]) && !(a[0] && a[1] && foldName(a[0]) === foldName(a[1])); }
/** Mein Spitzname fuer den Zug: versteckte Zeichen weg, durch den Filter; "" wenn vergeben oder der verkleidete des anderen. */
export function myName(nick, other) { const n = clean(plainName(nick), NAME); return n && nameOk(n) && !(other && foldName(other) === foldName(n)) ? n : ""; }

// ---------- der Zug: [darts, Behauptung, Namen] ----------
export function last(m) { return m && m.length ? m[m.length - 1] : null; }
/** Ein von Hand gebauter Zug: nur, was der Bildschirm haette senden koennen. prev: der Zug davor (oder null), first:
 *  ob ein Zug ohne Vorgaenger eine einzelne Aufnahme sein muss (neuer Zug) statt eines ganzen Spielstands (snap). */
export function ok(v, seed, prev, first) {
  if (!Array.isArray(v) || v.length !== 3 || !intIn(v[1], 0, 999) || !namesOk(v[2])) return false;
  const g = sim(seed, v[0]);
  if (!g || g.partial || g.extra || !g.turns.length) return false;
  if (g.bot) return !prev && g.over;
  if (!prev) return !first || g.turns.length === 1;
  const pg = sim(seed, prev[0]), me = pg ? pg.turns.length % 2 : 0;
  return !!pg && !pg.over && v[0].slice(0, prev[0].length) === prev[0] && g.turns.length === pg.turns.length + 1 && v[2][1 - me] === prev[2][1 - me];
}
/** Ein zurueckkommender Link muss die zuletzt von hier gesendeten Darts (mine) fortsetzen und darf nur eine Aufnahme
 *  anhaengen; ein frueherer Link desselben Spiels ist auch gut. (Im Neuentwurf prueft das zusaetzlich game.continues.) */
export function trust(mine, v, seed) {
  if (!mine) return true;
  const s = v && typeof v[0] === "string" ? v[0] : null;
  if (!s) return false;
  if (mine.slice(0, s.length) === s) return true;
  if (s.slice(0, mine.length) !== mine) return false;
  const a = sim(seed, mine), b = sim(seed, s);
  return !!a && !!b && b.turns.length <= a.turns.length + 1;
}
/** Was dieses Geraet zaehlt: { v, g, foreign, me } oder null. own = { s, n }: was es zuletzt fuer diese Partie sandte
 *  (aus seinem Speicher); ein Link, der nicht davon weitergeht, zaehlt nicht. Der eigene Name kommt immer aus own. */
export function counted(seed, v, own) {
  const o = own && v ? own : null;
  const mg = o && o.s ? sim(seed, o.s) : null, me = mg && !mg.bot && mg.turns.length ? mg.turns[mg.turns.length - 1].p : -1;
  if (mg && !trust(o.s, v, seed)) { if (!mg.partial) return { v: [o.s, claimed(mg), namesOk(o.n) ? o.n : ["", ""]], g: mg, foreign: true, me }; }
  if (!v) return null;
  const g = sim(seed, v[0]);
  if (me >= 0 && g && !g.bot) {
    const n = v[2].slice(); if (Array.isArray(o.n) && nameOk(o.n[me])) n[me] = o.n[me];
    if (!namesOk(n)) n[1 - me] = "";
    if (!namesOk(n)) n[me] = "";
    v = [v[0], v[1], n];
  }
  return { v, g, foreign: false, me };
}
/** Was die letzte Aufnahme laut Link brachte (gegen Bert: alle eigenen Punkte). */
export function claimed(g) { return g.bot ? g.turns.filter((t) => t.p === 0).reduce((a, t) => a + t.pts, 0) : g.turns[g.turns.length - 1].pts; }
export function fixed(v, g) { const n = claimed(g); return v[1] === n ? null : { c: v[1], n }; }

// ---------- Woerter ----------
export function short(h, lang) { return h.n === 0 ? T(lang).da_k_0 : h.n === 25 ? (h.m === 2 ? T(lang).da_k_50 : "25") : (h.m === 3 ? "T" : h.m === 2 ? "D" : "") + h.n; }
export function field(h, lang) { const X = T(lang); return h.n === 0 ? X.da_s_0 : h.n === 25 ? X[h.m === 2 ? "da_s_50" : "da_s_25"] : fmt(X["da_s_" + h.m], { n: h.n }); }
/** "Triple 20, 60 Punkte": was der Screenreader zu einem Pfeil sagt. */
export function spoken(h, lang) { return say(lang, "da_sp", h.p, { h: field(h, lang), p: h.p }); }
/** Gegen Bert "Du" und "Bert"; per Link meine Seite mit "(du)" (oder "Du"), die andere mit Spitzname, sonst "Gegner"
 *  (wenn dieses Geraet seine Seite kennt) oder "Spieler 1/2". */
export function who(g, p, lang, names, me) {
  const X = T(lang), nm = names ? plainName(names[p]) : "";
  if (g.bot) return p ? X.da_bot : X.da_me;
  if (p === me) return nm ? fmt(X.da_mark, { p: nm }) : X.da_me;
  return nm || (me === 0 || me === 1 ? X.da_opp : X["da_p" + (p + 1)]);
}
export function pair(g, lang, names, me) { const a = me === 1 ? [1, 0] : [0, 1]; return stand(g, a[0], lang, names, me) + " · " + stand(g, a[1], lang, names, me); }
export function modeName(m, lang) { return T(lang)["da_m_" + m]; }
export function stand(g, p, lang, names, me) {
  const w = who(g, p, lang, names, me);
  if (g.kind === "x01") return fmt(T(lang).da_left, { p: w, n: g.left[p] });
  if (g.kind === "atc") return g.next[p] > 20 ? fmt(T(lang).da_next_done, { p: w }) : fmt(T(lang).da_next, { p: w, n: g.next[p] });
  return say(lang, "da_total", g.total[p], { p: w });
}
export function turnLine(t, g, lang) {
  const X = T(lang), d = t.d.map((h) => short(h, lang)).join(" · ");
  if (t.bust) return fmt(X.da_turn_bust, { d, n: t.from });
  return g.kind === "atc" ? say(lang, "da_turn_atc", t.pts, { d }) : say(lang, "da_turn", t.pts, { d });
}
export function head1(g, lang) { return modeName(g.mode, lang) + " · " + fmt(T(lang).da_round, { r: Math.min(rounds(g), Math.floor(g.turns.length / 2) + 1), n: rounds(g) }); }

/** Kopfzeilen zum Stand (alt face): w = counted(...). */
export function face(w, lang) {
  const v = w && w.v, g = w && w.g; if (!g) return null;
  const n = v[2], me = w.me, out = [head1(g, lang), pair(g, lang, n, me), who(g, g.turns[g.turns.length - 1].p, lang, n, me) + ": " + turnLine(g.turns[g.turns.length - 1], g, lang)], f = fixed(v, g);
  if (f) out.push(fmt(T(lang).da_fixed, f));
  if (w.foreign) out.push(T(lang).da_foreign);
  return out;
}
/** Ergebnis (alt result): { h, lines }. */
export function result(w, lang) {
  const v = w && w.v, g = w && w.g, X = T(lang); if (!g) return { h: "", lines: [] };
  const n = v[2], me = w.me, h = g.win < 0 ? X.da_draw : g.bot ? X[g.win ? "da_win_bot" : "da_win_you"] : g.win === me ? X.da_win_self : fmt(X.da_win, { p: who(g, g.win, lang, n, me) }), lines = [modeName(g.mode, lang), pair(g, lang, n, me)];
  const end = g.turns[g.turns.length - 1];
  if (end.out && g.kind === "x01") lines.push(fmt(X.da_out_with, { h: field(end.d[end.d.length - 1], lang) }));
  if (g.capped) lines.push(fmt(X.da_cap, { n: ROUNDS }));
  const f = fixed(v, g); if (f) lines.push(fmt(X.da_fixed, f));
  if (w.foreign) lines.push(X.da_foreign);
  return { h, lines };
}
/** Berts Spruch zur Aufnahme k (aus dem Seed). */
export function quip(seed, k, lang) { const q = DATA.quips[lang] || DATA.quips.de; return q[Math.floor(rng("quip|" + seed + "|" + k)() * q.length)]; }
