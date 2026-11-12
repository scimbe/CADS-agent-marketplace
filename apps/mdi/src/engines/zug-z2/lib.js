// Gemeinsame Hilfen der Z2-Zugkarten: dieselben Bausteine wie turns.js:9-37 (Altcode), ohne DOM, ohne Uhr, ohne Zufall
// ausser dem Seed. Die Zufallsreihen (mix) kommen bitgleich aus dem Zug-Kern (src/engines/zug/alt.js, Strang Z1).
import D from "../zug/turn.json" with { type: "json" };
import { mix as mixSeed, fmt, fold, clean, hash32, mulberry32, num } from "../zug/alt.js";

export { D, fmt, fold, clean, hash32, mulberry32, num };
const LANGS = Object.keys(D.text);
const BLOCK = {};
/** Textblock einer Sprache; fehlende Schluessel aus dem deutschen Block (core.js:433 textsFor). */
export function T(lang) {
  if (!BLOCK[lang]) BLOCK[lang] = lang !== "de" && D.text[lang] ? Object.assign({}, D.text.de, D.text[lang]) : D.text.de;
  return BLOCK[lang];
}
function col(lang) { const i = LANGS.indexOf(lang); return i < 0 ? 0 : i; }
/** "de|en"-Paar: eigene Spalte, sonst Deutsch (core.js:440 pick). */
export function pk(s, lang) { const p = String(s).split("|"), i = col(lang); return p[i] != null && p[i] !== "" ? p[i] : p[0]; }
export function alt(a, lang) { const x = a[col(lang)]; return x != null ? x : a[0]; }
export function pair(list, i, lang) { return pk(list[i], lang); }
export function side(s, lang) { return alt(s.split("||"), lang).split("|"); }
export function listOf(k) { return (doc, m, now, lang) => D[k].map((x, i) => pair(D[k], i, lang)); }
/** gleiche Reihenfolge auf beiden Geraeten aus dem Seed (turns.js:18 mix) */
export function mix(doc, tag, n) { return mixSeed(doc.seed, tag, n); }
export function hits(a, b) { return a.filter((x) => b.indexOf(x) >= 0); }
export function places(order) { const p = []; order.forEach((o, at) => { p[o] = at; }); return p; }
export function side2(lang) { const X = T(lang); return [X.first, X.second]; }
