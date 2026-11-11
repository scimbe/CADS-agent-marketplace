// Statische Karte: Text, Farbe, Sticker. step ist leer; alles Weitere (Blasen, Teilen, Live) leitet der Host ab.
import manifest from "./manifest.json" with { type: "json" };
import { onFill } from "../../contract/tokens.js";

const SPOTS = [[14, 16, -12], [84, 22, 10], [80, 84, -6]]; // Sticker-Plaetze in Prozent (x, y, Drehung in Grad)

export default {
  manifest,
  init({ params }) {
    return { pub: { title: params.title, text: params.text, bg: params.bg, stickers: params.stickers.slice(0, 3) }, priv: [null] };
  },
  step() { throw new Error("statisch: keine Zuege"); },
  observe(state) { return { pub: state.pub, mine: null }; },
  status() { return { over: true, turn: -1, reveal: false, score: [], winner: -1 }; },
  moves() { return []; },
  view(obs) {
    const p = obs.pub, ink = onFill(p.bg);
    return {
      t: "frame", fill: p.bg, ratio: "3:4", part: "farbe", a11y: p.title + ". " + p.text,
      children: [
        ...p.stickers.map((s, i) => ({ t: "shape", kind: s, fill: p.bg === "red" ? "yellow" : "red", x: SPOTS[i][0], y: SPOTS[i][1], size: "l", rot: SPOTS[i][2], part: "sticker" })),
        { t: "text", role: "title", text: p.title, fill: ink, x: 8, y: 34, w: 84, part: "titel" },
        { t: "text", role: "body", text: p.text, fill: ink, x: 8, y: 62, w: 84, part: "text" }
      ]
    };
  }
};
