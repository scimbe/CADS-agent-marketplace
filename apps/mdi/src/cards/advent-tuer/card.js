// Adventstuer (alt Katalog advent-tuer, alt:src/render.js Stil "advent", alt:src/door.js, alt:src/daily.js:321): die Nutzerin
// gestaltet ein Tuerchen im Format 16:9 mit Text, Stil, Farbe, Stickern (Noto-Set "advent"), eigenem Foto (bleibt lokal),
// KI-Bild (/api/duell/bild, mit Konto) und Wetter (/api/duell/weather). Die Nummer kommt aus dem Datum (UTC) und wird beim
// Absenden eingefroren (stamp). Der Empfaenger sieht die Tuer zu und klappt sie auf; nie gesperrt.
import manifest from "./manifest.json" with { type: "json" };
import { docOf, canvasNode, doorOf, dateOf, early } from "../../engines/poster/card.js";
import { PAIR_HEX } from "../../engines/poster/doc.js";
import { sanitizeName } from "../../engines/text/filter.js";

function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, (m, k) => String(o[k])); }
const T = (lang) => manifest.texts[lang] || manifest.texts.de;

export default {
  manifest,
  /** Beim Absenden: Nummer aus dem UTC-Tag (0 = automatisch) und der Name aus „Mein Stil“ (alt doc.n, „Von {n}“). */
  stamp(params, { today, nick }) { return { ...params, nr: params.nr || doorOf(today), n: params.n || sanitizeName(nick) }; },
  init({ params }) { return { pub: { ...params }, priv: [null] }; },
  step() { throw new Error("statisch: keine Zuege"); },
  observe(state) { return { pub: state.pub, mine: null }; },
  status() { return { over: true, turn: -1, reveal: false, score: [], winner: -1 }; },
  moves() { return []; },
  view(obs, seat, ctx = {}) {
    const p = obs.pub, lang = ctx.lang || "de", X = T(lang);
    const nr = p.nr || (Number.isInteger(ctx.today) ? doorOf(ctx.today) : 1);
    const doc = docOf("card", { ...p, nr });
    const pic = canvasNode(doc, { format: "16:9", nick: ctx.nick, photo: !!p.photo, a11y: fmt(X.title, {}) + " " + nr + ". " + (doc.x || ""), part: "text" });
    if (!ctx.receive) return { t: "frame", ratio: "16:9", fill: "paper", a11y: pic.a11y, children: [pic] };
    const col = PAIR_HEX[p.pair] || PAIR_HEX.advent;
    const lines = [];
    const from = sanitizeName(p.n);
    if (from) lines.push({ t: "text", role: "small", text: fmt(X.from, { n: from }) });
    if (Number.isInteger(ctx.today) && early(nr, dateOf(ctx.today))) lines.push({ t: "text", role: "small", text: fmt(X.for, { n: nr }) });
    return {
      t: "stack", children: [
        { t: "text", role: "title", text: X.title },
        { t: "door", nr, closed: true, colors: col, label: fmt(X.open, { n: nr }), hint: X.tap, children: [pic], submit: { t: "open", seat: 0 } },
        ...lines
      ]
    };
  }
};
