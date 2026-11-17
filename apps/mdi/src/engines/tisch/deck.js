// Das Kartendeck von My Daily Idea, im Code gezeichnet (CC0 1.0, apps/mdi/licenses/Kartendeck-CC0.txt; Gestaltung wie
// im Altcode table-ui.js cardSvg). Vierfarbblatt wie im deutschen Turnier: Kreuz schwarz, Pik gruen, Herz rot, Karo
// orange (dunkel genug fuer 4.5:1 auf Weiss). Jede Farbe hat ausserdem ihre eigene Form als gezeichneten Pfad (nicht
// als Schriftzeichen, damit sie auf jedem Geraet gleich aussieht): wer Farben nicht unterscheidet, liest die Form.
// Reine Funktionen ohne DOM: cardSvg liefert eine SVG-Beschreibung {tag, attrs, children}, die der Renderer zeichnet.

export const SUITS = {
  C: { color: "#111111", de: "Kreuz", en: "Clubs" },
  S: { color: "#146c2e", de: "Pik", en: "Spades" },
  H: { color: "#c81e1e", de: "Herz", en: "Hearts" },
  D: { color: "#a34a06", de: "Karo", en: "Diamonds" }
};
export const RANKS = {
  de: { A: "A", T: "10", K: "K", Q: "D", J: "B", 9: "9", 8: "8", 7: "7" },
  en: { A: "A", T: "10", K: "K", Q: "Q", J: "J", 9: "9", 8: "8", 7: "7" }
};
const RANK_NAME = {
  de: { A: "Ass", T: "Zehn", K: "König", Q: "Dame", J: "Bube", 9: "Neun", 8: "Acht", 7: "Sieben" },
  en: { A: "Ace", T: "Ten", K: "King", Q: "Queen", J: "Jack", 9: "Nine", 8: "Eight", 7: "Seven" }
};
// Formen in einem 20x20-Feld
const PIP = {
  C: "M10 1.5a4.2 4.2 0 0 1 3.4 6.7 4.2 4.2 0 1 1-1.6 6.6L13 19H7l1.2-4.2a4.2 4.2 0 1 1-1.6-6.6A4.2 4.2 0 0 1 10 1.5z",
  S: "M10 1C6 6 2 8.6 2 12.2a4 4 0 0 0 6.6 3L7 19h6l-1.6-3.8a4 4 0 0 0 6.6-3C18 8.6 14 6 10 1z",
  H: "M10 18.5C4.5 14 1.5 11 1.5 7a4.3 4.3 0 0 1 8.5-1.6A4.3 4.3 0 0 1 18.5 7c0 4-3 7-8.5 11.5z",
  D: "M10 1l7 9-7 9-7-9z"
};

function el(tag, attrs, children) { return { tag, attrs, children: children || [] }; }
function pip(s, x, y, size) {
  const k = size / 20;
  return el("path", { d: PIP[s], fill: SUITS[s].color, transform: "translate(" + x + " " + y + ") scale(" + k + ")" });
}
export function isCode(code) { return typeof code === "string" && /^[CSHD][AKQJT987]$/.test(code); }
export function cardName(code, lang = "de") {
  const L = lang === "en" ? "en" : "de";
  return L === "en" ? RANK_NAME.en[code[1]] + " of " + SUITS[code[0]].en : SUITS[code[0]].de + "-" + RANK_NAME.de[code[1]];
}
export function rankLabel(code, lang = "de") { return RANKS[lang === "en" ? "en" : "de"][code[1]]; }

/** Kartenbild. code null = Rueckseite. Rueckgabe: SVG-Beschreibung, aria-hidden (der Name steht am Element darueber). */
export function cardSvg(code, { lang = "de" } = {}) {
  const root = { viewBox: "0 0 60 90", "aria-hidden": "true", focusable: "false", class: "pcard-svg" };
  if (!isCode(code)) {
    return el("svg", root, [
      el("rect", { x: 1, y: 1, width: 58, height: 88, rx: 6, fill: "#0d5c2e", stroke: "#111", "stroke-width": 2 }),
      el("rect", { x: 7, y: 7, width: 46, height: 76, rx: 3, fill: "none", stroke: "#ffd400", "stroke-width": 2 }),
      el("path", { d: "M30 22l12 23-12 23-12-23z", fill: "none", stroke: "#ffd400", "stroke-width": 2 })
    ]);
  }
  const s = code[0], c = SUITS[s].color, r = rankLabel(code, lang), face = /[KQJ]/.test(code[1]);
  const corner = (rot) => el("g", rot ? { transform: "rotate(180 30 45)" } : {}, [
    el("text", { x: 4, y: 16, "font-size": r.length > 1 ? 13 : 15, "font-weight": 900, fill: c, "font-family": "system-ui,sans-serif" }, [r]),
    pip(s, 4, 19, 11)
  ]);
  const kids = [el("rect", { x: 1, y: 1, width: 58, height: 88, rx: 6, fill: "#ffffff", stroke: "#111111", "stroke-width": 2 }), corner(false)];
  if (face) {
    kids.push(el("rect", { x: 15, y: 22, width: 30, height: 46, rx: 4, fill: "none", stroke: c, "stroke-width": 1.5 }));
    kids.push(el("text", { x: 30, y: 52, "font-size": 22, "font-weight": 900, "text-anchor": "middle", fill: c, "font-family": "system-ui,sans-serif" }, [r]));
    kids.push(pip(s, 24, 55, 12));
  } else kids.push(pip(s, 15, 30, 30));
  kids.push(corner(true));
  return el("svg", root, kids);
}
