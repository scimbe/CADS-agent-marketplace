// Beweisfoto: Alien und Varianten foto-tour, foto-haustier, foto-essen (alt Katalog, alt:src/render.js drawPhoto,
// alt:src/studio.js Filter): Poster oder Meme aus dem eigenen Foto. Das Foto steht nie im Link (alt:src/daily.js:463);
// ohne Foto zeigt die Karte die Flaeche in der ersten Farbe, wie im Altcode beim Empfaenger.
import manifest from "./manifest.json" with { type: "json" };
import { docOf, canvasNode } from "../../engines/poster/card.js";

export default {
  manifest,
  init({ params }) { return { pub: { ...params }, priv: [null] }; },
  step() { throw new Error("statisch: keine Zuege"); },
  observe(state) { return { pub: state.pub, mine: null }; },
  status() { return { over: true, turn: -1, reveal: false, score: [], winner: -1 }; },
  moves() { return []; },
  view(obs, seat, ctx = {}) {
    const p = obs.pub, doc = docOf("photo", p);
    // das Foto nur auf dem Geraet, das es gewaehlt hat (Slot), nie beim Empfaenger
    const pic = canvasNode(doc, { format: "4:5", nick: ctx.nick, photo: !!p.photo && !ctx.receive, a11y: [doc.x, doc.y].filter(Boolean).join(" – ") || manifest.title[ctx.lang || "de"], part: "foto" });
    return { t: "frame", ratio: "4:5", fill: "paper", a11y: pic.a11y, children: [pic] };
  }
};
