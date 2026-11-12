// Beweisfoto: Alien und Varianten foto-tour, foto-haustier, foto-essen (alt Katalog, alt:src/render.js drawPhoto,
// alt:src/studio.js Filter): Poster oder Meme aus dem eigenen Foto. Das Foto steht nie im Link (alt:src/daily.js:463);
// ohne Foto (und immer beim Empfaenger) steht das Bot-Gesicht als freundlicher Platzhalter (alt app.js:160 R.botFace).
// „Mit Foto als Bild teilen“: mit gewaehltem Foto steht ein action-Knoten (act share-image, of = id des canvas) in der Liste;
// das Teilen-Blatt (Strang H) zeichnet ihn ueber env.cardImage und bietet ihn per Teilen-Menue oder Download an.
import manifest from "./manifest.json" with { type: "json" };
import data from "./data.json" with { type: "json" };
import { docOf, canvasNode, photoId, imageName } from "../../engines/poster/card.js";

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
    const pic = canvasNode(doc, { format: "4:5", nick: ctx.nick, photo: ctx.receive ? null : photoId(p.photo), bot: true, a11y: [doc.x, doc.y].filter(Boolean).join(" – ") || manifest.title[ctx.lang || "de"], part: "foto" });
    pic.id = "poster";
    const frame = { t: "frame", ratio: "4:5", fill: "paper", a11y: pic.a11y, children: [pic] }, id = ctx.receive ? null : photoId(p.photo);
    if (!id) return frame;
    return { t: "stack", children: [frame, { t: "action", act: "share-image", of: "poster", label: { de: data.texts.de.shareImage, en: data.texts.en.shareImage }, name: imageName(manifest.title.de + " " + (doc.x || "")) }] };
  }
};
