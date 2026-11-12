// Stimme verzerren (alt Katalog stimme-verzerren, alt:src/klang.js, alt:src/klang-ui.js): bis zu 10 s eigene Stimme, ein
// Effekt aus acht und hoechstens ein Tempo. Aufnahme erst nach Tippen, sie bleibt im Speicher des Geraets; der Link traegt nur
// Effekt, Tempo und Text, der Empfaenger antwortet mit seiner eigenen Stimme. Im Altcode seit 2026-11 nicht im Regal
// (zusammengelegt in mut-tierstory), alte Links und die Aliase stimme-monster/-maus/-robo oeffnen sie weiter.
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
    const p = obs.pub, lang = ctx.lang || "de", X = T(lang), doc = docOf("sound", { ...p, m: "voice", tp: p.tp || undefined });
    const fx = { fx: doc.fx, tp: doc.tp || "" };
    const pic = canvasNode(doc, { format: "4:5", nick: ctx.nick, peaksFrom: { kind: "local", slot: "voice", fx: doc.fx, tp: doc.tp || "", fallback: "dummy" }, a11y: (doc.x || manifest.title[lang]) + " – " + manifest.params.properties.fx["x-names"][lang][doc.fx], part: "stimme" });
    return { t: "stack", children: [
      { t: "frame", ratio: "4:5", fill: "paper", a11y: pic.a11y, children: [pic] },
      { t: "text", role: "small", text: X.mic },
      { t: "record", slot: "voice", ms: 10000, label: ctx.receive ? X.answer : X.rec, again: X.again, hint: X.others },
      { t: "audio", src: { kind: "local", slot: "voice", ...fx, fallback: "dummy" }, label: X.play },
      { t: "text", role: "small", text: X.link + " " + X.warn }
    ] };
  }
};
