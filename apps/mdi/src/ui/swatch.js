// Farbwahl als echte Farbfelder (Befund 17.11.: Pillen mit Hex-Text sind keine Farbauswahl). Jede Farbe ist ein rundes
// Feld >= 48 px in ihrer Farbe, ohne Hex-Text; die Auswahl traegt Rahmen und Haekchen. Wegen WCAG 1.4.1 hat jede Farbe
// einen Namen (aria-label und Tooltip). Werte und Namen stammen aus dem Design-System (Kartenfarben-Paare pair1–pair8,
// Marken-Token) und den Farben der Arcade-Karten; ein Wert ohne Namen ist ein Fehler des Manifests (test/farbfelder.test.js),
// hier wird nichts still ersetzt: ein freier Wert aus einem alten Link heisst ehrlich „Eigene Farbe“.
import { h } from "./dom.js";
import { PAIRS as FREI_PAIRS, PAIR_NAMES } from "../engines/frei/doc.js";

/** Namen je Hex-Wert (klein geschrieben). */
export const COLOR_NAMES = {
  "#ffd400": { de: "Gelb", en: "Yellow" }, "#ff3b1d": { de: "Signalrot", en: "Signal red" }, "#2b4bff": { de: "Königsblau", en: "Royal blue" },
  "#ffe600": { de: "Zitrone", en: "Lemon" }, "#ff4fa3": { de: "Pink", en: "Pink" }, "#0a7f55": { de: "Tannengrün", en: "Pine green" },
  "#14c872": { de: "Grün", en: "Green" }, "#ff3da5": { de: "Himbeere", en: "Raspberry" }, "#ff6a1f": { de: "Mandarine", en: "Tangerine" },
  "#1b2bd8": { de: "Ultramarin", en: "Ultramarine" }, "#c8ff00": { de: "Limette", en: "Lime" }, "#7a1fff": { de: "Violett", en: "Violet" },
  "#ffffff": { de: "Weiß", en: "White" }, "#ff2d2d": { de: "Rot", en: "Red" }, "#7ee0ff": { de: "Hellblau", en: "Light blue" },
  "#ff5a1f": { de: "Koralle", en: "Coral" }, "#00e5ff": { de: "Cyan", en: "Cyan" }, "#ff7a1a": { de: "Orange", en: "Orange" },
  "#e8d6bf": { de: "Sand", en: "Sand" }, "#2bd9a0": { de: "Mint", en: "Mint" }, "#7cdb3c": { de: "Grasgrün", en: "Grass green" },
  "#39ff88": { de: "Neongrün", en: "Neon green" }, "#ff5fa2": { de: "Rosa", en: "Rose" }, "#00f0ff": { de: "Eisblau", en: "Ice blue" },
  "#b04bff": { de: "Lila", en: "Purple" }, "#4fc3ff": { de: "Himmelblau", en: "Sky blue" }, "#ff7a59": { de: "Lachs", en: "Salmon" },
  "#ff2bd6": { de: "Magenta", en: "Magenta" }, "#20c9c9": { de: "Türkis", en: "Turquoise" }, "#e0863a": { de: "Kupfer", en: "Copper" },
  "#0f5132": { de: "Dunkelgrün", en: "Dark green" }
};
// Marken-Token der Anzeigeliste (contract/tokens.js PALETTE): Werte wie auf der Buehne (die Buehne bleibt auch im Dunkeln hell)
const TOKENS = { yellow: "#f9d84a", red: "#ff3b1d", ink: "#17140f", paper: "#fbf5dd" };
const TOKEN_NAMES = { yellow: { de: "Gelb", en: "Yellow" }, red: { de: "Rot", en: "Red" }, ink: { de: "Schwarz", en: "Black" }, paper: { de: "Papier", en: "Paper" } };
// Paare der freien Karte (engines/frei/doc.js): Name nach der Grundfarbe
const FREI = Object.fromEntries(PAIR_NAMES.map((n, i) => [n, FREI_PAIRS[i]]));
const FREI_LABEL = { gelb: { de: "Gelb", en: "Yellow" }, blau: { de: "Blau", en: "Blue" }, pink: { de: "Pink", en: "Pink" }, gruen: { de: "Grün", en: "Green" }, orange: { de: "Orange", en: "Orange" }, lime: { de: "Limette", en: "Lime" }, weiss: { de: "Weiß", en: "White" }, himmel: { de: "Himmelblau", en: "Sky blue" } };
const HEX = /^#[0-9a-f]{6}$/i;
const L = (o, lang) => o[lang === "en" ? "en" : "de"];

/**
 * Farbe(n) eines Werts: ein oder zwei Hex-Werte (Paar), oder null, wenn der Wert keine Farbe ist.
 * @param pairs x-pairs eines Felds (pair) oder null
 */
export function colorsOf(value, pairs = null) {
  // nur eigene Schluessel (Object.hasOwn): "constructor" oder "toString" sind keine Farben
  if (pairs && typeof value === "string" && Object.hasOwn(pairs, value) && Array.isArray(pairs[value])) return pairs[value].map((c) => String(c).toLowerCase());
  if (typeof value !== "string") return null;
  if (HEX.test(value)) return [value.toLowerCase()];
  if (Object.hasOwn(TOKENS, value)) return [TOKENS[value]];
  if (Object.hasOwn(FREI, value)) return FREI[value].slice();
  return null;
}
/** Name eines Farbwerts; null, wenn es keinen gibt (der Aufrufer entscheidet ehrlich, siehe swatchField). */
export function colorName(value, lang, pairs = null) {
  const cs = colorsOf(value, pairs);
  if (!cs) return null;
  if (Object.hasOwn(TOKEN_NAMES, value)) return L(TOKEN_NAMES[value], lang);
  if (Object.hasOwn(FREI_LABEL, value)) return L(FREI_LABEL[value], lang);
  const n = cs.map((c) => Object.hasOwn(COLOR_NAMES, c) && L(COLOR_NAMES[c], lang));
  return n.every(Boolean) ? n.join(" / ") : null;
}
// Haekchen und Strich: Tinte auf weissem Kreis mit Tintenrand, auf jeder Farbe >= 3:1 (WCAG 1.4.11)
const check = () => h("svg", { class: "sw-mark", viewBox: "0 0 24 24", "aria-hidden": "true" }, h("circle", { cx: "12", cy: "12", r: "10.5" }), h("path", { d: "M7 12.5l3.2 3.2L17 9" }));
const strike = () => h("svg", { class: "sw-taken", viewBox: "0 0 48 48", "aria-hidden": "true" }, h("path", { d: "M10 38L38 10" }));

/** Pfeiltasten in der Radiogruppe: naechstes/voriges freies Feld (im Kreis), Pos1/Ende; Fokus und Auswahl wandern mit. */
function arrows(e, set) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: "first", End: "last" }[e.key];
  if (step === undefined) return;
  const all = [...e.currentTarget.parentNode.querySelectorAll(".sw-opt")].filter((b) => !b.disabled);
  if (!all.length) return;
  const i = all.indexOf(e.currentTarget);
  const next = step === "first" ? all[0] : step === "last" ? all[all.length - 1] : all[(i + step + all.length) % all.length];
  e.preventDefault();
  next.focus();
  set(next.dataset.v);   // Farbwerte sind Zeichenketten (Hex, Token, Paarname)
}

/**
 * Farbfelder als Auswahl (role radiogroup). Werte in Reihenfolge; ein aktueller Wert ausserhalb der Liste steht vorne
 * (alter Link), damit die Auswahl sichtbar bleibt.
 * @param o { id, label, values, value, set, lang, pairs?, taken?, takenBy? } taken: belegter Wert (z. B. Spielerfarbe), nicht waehlbar
 */
export function swatchField(o) {
  const { id, label, value, set, lang } = o, lid = label ? "lbl-" + id : "dlg-title";
  const values = o.values.includes(value) || value === undefined || value === null ? o.values : [value, ...o.values];
  const own = lang === "en" ? "Own colour" : "Eigene Farbe";
  const isTaken = (v) => o.taken !== undefined && o.taken !== null && v === o.taken && v !== value;
  // Roving Tabindex (ARIA-Radiogruppe): ein Tab-Stopp je Gruppe (die Auswahl, sonst das erste freie Feld)
  const stop = values.includes(value) ? value : values.find((v) => !isTaken(v));
  return h("div", { class: "field", key: id },
    h("div", { class: "seg", role: "radiogroup", "aria-labelledby": lid },
      label ? h("p", { class: "seg-label", id: lid }, label) : null,
      h("div", { class: "sw-row" }, values.map((v) => {
        const cs = colorsOf(v, o.pairs) || [], on = v === value, taken = isTaken(v);
        const name = colorName(v, lang, o.pairs) || own;
        const tip = taken ? name + " – " + (lang === "en" ? "taken by " : "belegt: ") + o.takenBy : name;
        const bg = cs.length === 2 ? { "background-image": "linear-gradient(135deg, " + cs[0] + " 50%, " + cs[1] + " 50%)", "background-color": cs[0] } : { "background-color": cs[0] || "transparent" };
        return h("button", { type: "button", role: "radio", class: "sw-opt", key: String(v), "data-v": String(v), "aria-checked": on ? "true" : "false", "aria-label": tip, title: tip, disabled: taken || null, tabindex: v === stop ? "0" : "-1", on: { click: () => set(v), keydown: (e) => arrows(e, set) } },
          h("span", { class: "sw-dot", style: bg }), on ? check() : null, taken ? strike() : null);
      }))));
}
