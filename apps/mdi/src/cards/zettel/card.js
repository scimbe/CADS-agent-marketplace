// Zettel: die eingeklappten Zeilen-Karten quiz-chaos, quiz-snack, quiz-superkraft, quiz-film, quiz-wetter (alt kind card,
// Stil zettel, alt to: zug-lob) und plan-24 „Video-Quiz“ (Stil druck, alt to: zug-kennst) als eine statische Posterkarte:
// drei Zeilen zur Wahl (Wuerfel), umschreiben, verschicken. Bild exakt wie alt:src/render.js (Poster-Engine, Alt-Orakel).
import manifest from "./manifest.json" with { type: "json" };
import data from "./data.json" with { type: "json" };
import { docOf, canvasNode } from "../../engines/poster/card.js";

/** Die drei Zeilen der Variante (alt idea.lines) fuer den Wuerfel des Editors. */
export function lines(variant, lang) { const v = data.variants[variant || "quiz-chaos"]; return v ? v.lines[lang] || v.lines.de : []; }
export default {
  manifest,
  init({ params }) { return { pub: { ...params }, priv: [null] }; },
  step() { throw new Error("statisch: keine Zuege"); },
  observe(state) { return { pub: state.pub, mine: null }; },
  status() { return { over: true, turn: -1, reveal: false, score: [], winner: -1 }; },
  moves() { return []; },
  view(obs, seat, ctx = {}) {
    const doc = docOf("card", obs.pub);
    const pic = canvasNode(doc, { format: "4:5", nick: ctx.nick, a11y: doc.x || manifest.title[ctx.lang || "de"], part: "text" });
    return { t: "frame", ratio: "4:5", fill: "paper", a11y: pic.a11y, children: [pic] };
  }
};
