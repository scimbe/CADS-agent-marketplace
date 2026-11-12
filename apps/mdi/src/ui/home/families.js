// Vielfalt geordnet: 4 Absichten -> 9 Familien -> jede der 64 Regalkarten genau einmal (13-produktverstaendnis §4.2).
// Absichten bleiben die alten (alt:start.json): Gruss, Planen, Spielen, Stimme. Eine Absicht oeffnet ihre Familien auf
// einer Seite (Familie = Abschnitt, kein eigener Tipp): Absicht -> Karte -> Los = 3 Taps.
// Akzentfarben und Schriftfarbe darauf aus dem Design-System Phase C (Strang D, --fam-*/--on-*, alle >= 4,5:1); sie ersetzen
// die alten Situationsfarben (alt:src/turn-ui.js:722-740), die Zuordnung Situation -> Farbe bleibt sinngemaess.
import { IDEAS, byId } from "./rotation.js";
import { cardOf, CARDS, LEGACY } from "../../cards/index.js";

export const FAMILIES = [
  { id: "gruessen", intent: "gruss", color: "#FF6FAE", ink: "#17140F", shape: "heart", ids: ["karte-danke", "advent-tuer", "zug-umschlag", "zug-kapsel", "zug-gutschein", "zug-lob", "zug-reihum", "raum-damals"] },
  { id: "planen", intent: "planen", color: "#3B8CFF", ink: "#17140F", shape: "ring", ids: ["zug-termin", "zug-einkauf", "zug-wichteln", "zug-sammeln", "zug-einig", "zug-wunschzettel", "geschenk-finder", "raum-streichen", "zug-recht"] },
  { id: "kennen", intent: "spielen", color: "#FFA41B", ink: "#17140F", shape: "drop", ids: ["zug-kennst", "zug-abfragen", "zug-typen", "quiz-preis", "zug-snack", "zug-luecke", "zug-woerter", "zug-stimme", "zug-wette"] },
  { id: "bluff", intent: "spielen", color: "#7A3BFF", ink: "#FFFFFF", shape: "bolt", ids: ["zug-bluff", "zug-luege", "zug-auktion", "zug-kreis", "zug-steine", "zug-socken", "zug-hoeflich", "zug-reaktion", "zug-pokal"] },
  { id: "geschick", intent: "spielen", color: "#FF3B1D", ink: "#17140F", shape: "coin", ids: ["arcade-kick", "arcade-elfer", "arcade-ziegel", "arcade-panzer", "arcade-stock", "spiel-dart"] },
  { id: "tisch", intent: "spielen", color: "#0F5C3A", ink: "#FFFFFF", shape: "star", ids: ["tisch-skat", "tisch-bauernskat"] },
  { id: "raetsel", intent: "spielen", color: "#26305F", ink: "#FFFFFF", shape: "ring", ids: ["kanal-geheim"] },
  { id: "kreativ", intent: "stimme", color: "#17B3A3", ink: "#17140F", shape: "star", ids: ["zug-malrat", "zug-wort", "zug-schmuggel", "zug-blitz", "zug-rap", "karte-ausrede", "karte-regel", "beat-pausenhof", "foto-alien", "spiel-lava", "zug-auftrag"] },
  { id: "vorort", intent: "stimme", color: "#2DB35E", ink: "#17140F", shape: "heart", ids: ["beat-disco", "mut-tierstory", "mut-werbung", "raum-erklaeren", "raum-maschine", "raum-suche", "raum-maus", "raum-papagei", "raum-sorry"] }
];
export const INTENT_ORDER = ["gruss", "planen", "spielen", "stimme"];
const BY_FAMILY = new Map(FAMILIES.map((f) => [f.id, f]));
const FAMILY_OF = new Map();
for (const f of FAMILIES) for (const id of f.ids) FAMILY_OF.set(id, f);

// Katalog-ID -> Karte im neuen Code, wo sie unter anderem Namen steht (D0-Karte "bluff" ist die alte zug-bluff).
// Sonst gilt die alte ID; die Straenge legen ihre Karten unter src/cards/<alte-id>/ an.
export const ALIAS = { "zug-bluff": "bluff" };
const REVERSE = Object.fromEntries(Object.entries(ALIAS).map(([a, b]) => [b, a]));

export function family(id) { return BY_FAMILY.get(id) || null; }
export function familyOf(catalogId) { return FAMILY_OF.get(catalogId) || null; }
export function familiesOf(intent) { return FAMILIES.filter((f) => f.intent === intent); }
/** Karte im neuen Code fuer eine Katalog-ID oder null ("kommt"). */
export function newIdOf(catalogId) {
  if (ALIAS[catalogId] && cardOf(ALIAS[catalogId])) return ALIAS[catalogId];
  if (cardOf(catalogId)) return catalogId;
  const l = LEGACY && Object.prototype.hasOwnProperty.call(LEGACY, catalogId) ? LEGACY[catalogId] : null; // Register (ADR 0001 a): alte id -> Karte/Variante
  return l && cardOf(l.card) ? l.card : null;
}
/** Variante der neuen Karte, die eine alte Katalog-ID traegt (oder null). */
export function variantOf(catalogId) { const l = LEGACY && Object.prototype.hasOwnProperty.call(LEGACY, catalogId) ? LEGACY[catalogId] : null; return l && l.variant ? l.variant : null; }
export function catalogIdOf(newId) { return REVERSE[newId] || newId; }

/** Karten im Register ohne eigene Regalzeile im Altkatalog: neue Karten und ehemals eingeklappte Varianten, die ein Strang
 *  als eigene Karte baut (z. B. arcade-murmel, alt "to": arcade-stock). Familie: Manifest, sonst die der Traegerkarte,
 *  sonst nach Art. Sie stehen im Regal in ihrer Familie, nie in der Tagesrotation (die bleibt exakt wie im Altcode). */
export function extras() {
  const serving = new Set(IDEAS.map((i) => newIdOf(i.id)).filter(Boolean));
  return Object.keys(CARDS).filter((id) => !serving.has(id)).map((id) => {
    const m = cardOf(id).manifest, old = byId(catalogIdOf(id));
    const fam = (m.family && (family(m.family) || familyOf(m.family))) || (old && old.to && familyOf(old.to)) || (m.mode === "static" ? family("gruessen") : m.mode === "realtime" ? family("geschick") : family("kennen"));
    return { id, fam, manifest: m };
  });
}

/** Schriftfarbe auf einer Akzentfarbe: schwarz oder weiss, je nach hoeherem Kontrast (WCAG 2.x, relative Leuchtdichte). */
export function inkOn(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? "#17140F" : "#FFFFFF";
}
export function allCatalogIds() { return IDEAS.map((i) => i.id); }
