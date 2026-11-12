// Bau einen Beat und Varianten beat-boss, plan-05, plan-12 (alt Katalog, alt:src/studio.js renderBeat, alt:src/render.js
// drawSound): 16-Schritt-Drumcomputer mit Kick, Snare, Hi-Hat und Bass, Tempo 70-170. Der Link traegt nur Muster, Tempo
// und Text; den Ton erzeugt das Geraet (Synthese, keine Samples). Hinweis: Die Karte strassenrap-beat (PR #227) ist nicht
// im Tag pre-legacy-removal und damit nicht Teil der Untergrenze.
import manifest from "./manifest.json" with { type: "json" };
import data from "./data.json" with { type: "json" };
import { docOf, canvasNode } from "../../engines/poster/card.js";

const T = (lang) => data.texts[lang] || data.texts.de;

export default {
  manifest,
  init({ params }) { return { pub: { ...params }, priv: [null] }; },
  step() { throw new Error("statisch: keine Zuege"); },
  observe(state) { return { pub: state.pub, mine: null }; },
  status() { return { over: true, turn: -1, reveal: false, score: [], winner: -1 }; },
  moves() { return []; },
  view(obs, seat, ctx = {}) {
    const p = obs.pub, lang = ctx.lang || "de", doc = docOf("sound", { ...p, m: "beat" });
    const pic = canvasNode(doc, { format: "4:5", nick: ctx.nick, peaksFrom: { kind: "beat", p: doc.p, bpm: doc.bpm, loops: 1 }, /* Welle: 40 Spitzen aus einem Takt (alt app.js beatPeaks), rechnet der Renderer */ a11y: (doc.x || manifest.title[lang]) + ", " + doc.bpm + " BPM", part: "beat" });
    return { t: "stack", children: [
      { t: "frame", ratio: "4:5", fill: "paper", a11y: pic.a11y, children: [pic] },
      { t: "audio", src: { kind: "beat", p: doc.p, bpm: doc.bpm, loops: 2 }, label: T(lang).play, loop: true }
    ] };
  }
};
