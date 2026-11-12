// 24 Tueren fuer eine Person (alt Katalog zug-advent, alt:src/turns.js:666-673, Widgets list und doors in alt:src/turn-ui.js):
// Sitz 0 schreibt 24 kurze Saetze (je hoechstens 20 Zeichen, leere erlaubt), Sitz 1 oeffnet im Dezember jeden Tag eine Tuer.
// Leere Tueren bekommen einen festen Satz (turn.json doorFill). Welche Tueren offen sind, kommt aus ctx.today (UTC):
// Dezember -> bis zum Tag, Januar -> alle 24, sonst keine (alt: Datum des Handys).
import manifest from "./manifest.json" with { type: "json" };
import data from "./data.json" with { type: "json" };
import { clean } from "../../engines/quest/quest.js";
import { civil } from "../../engines/poster/door.js";

const T = (lang) => data.texts[lang] || data.texts.de;
const pk = (s, lang) => { const a = s.split("|"); return lang === "en" ? a[1] || a[0] : a[0]; };
/** Text der Tuer i (0..23): eigener Satz oder fester Satz (alt doorText). */
export function doorText(lines, i, lang) { return (lines && lines[i]) || pk(data.fill[i % data.fill.length], lang); }
/** Wie viele Tueren offen sind (alt turn-ui doors). */
export function openDoors(today) {
  if (!Number.isInteger(today)) return 0;
  const c = civil(today);
  return c.m === 12 ? Math.min(24, c.d) : c.m === 1 ? 24 : 0;
}
/** Bereinigung wie alt Widget list (loose, Quest.clean): leer bleibt leer, ein gefilterter Satz wird leer (dann fester Satz). */
export function cleanLines(a) { return Array.from({ length: 24 }, (_, i) => (typeof a[i] === "string" && a[i].trim() ? clean(a[i], 20) : "")); }

export default {
  manifest,
  init() { return { pub: { lines: null }, priv: [null, null] }; },
  accepts(obs, seat, input) { return seat === 0 && obs.pub.lines === null && input.t === "write" && Array.isArray(input.a) && input.a.length === 24; },
  step(state, input) {
    if (state.pub.lines !== null || input.t !== "write" || input.seat !== 0 || !Array.isArray(input.a) || input.a.length !== 24) throw new Error("ungueltig: write");
    const lines = cleanLines(input.a);
    // Das Widget schickt bereinigte Saetze; was davon abweicht, kommt nicht vom Widget (Link von Hand gebaut): ablehnen
    if (lines.some((s, i) => s !== input.a[i])) throw new Error("ungueltig: Satz");
    return { pub: { lines }, priv: state.priv.slice() };
  },
  observe(state) { return { pub: state.pub, mine: null }; },
  status(state) {
    const done = state.pub.lines !== null;
    return { over: done, turn: done ? -1 : 0, reveal: false, score: [], winner: -1, turnNo: done ? 1 : 0, turns: 1 };
  },
  // Beispielzug fuer Bot und Treiber (ADR 0001 f: moves bleibt fuer Bot/Hinweise): 24 leere Tueren = feste Saetze
  moves(obs, seat) { return seat === 0 && obs.pub.lines === null ? [{ t: "write", seat: 0, a: new Array(24).fill("") }] : []; },
  view(obs, seat, ctx = {}) {
    const lang = ctx.lang || "de", X = T(lang), lines = obs.pub.lines;
    if (lines === null) {
      if (seat !== 0) return { t: "text", role: "body", text: X.wait };
      return { t: "stack", children: [
        { t: "text", role: "title", text: X.h },
        { t: "list", id: "adv", label: X.write, n: 24, max: 20, loose: true, hints: Array.from({ length: 24 }, (_, i) => X.door + " " + (i + 1)), value: ctx.draft && Array.isArray(ctx.draft.adv) ? ctx.draft.adv : undefined, submit: { t: "write", seat: 0 }, confirm: X.send }
      ] };
    }
    const open = openDoors(ctx.today);
    return { t: "stack", children: [
      { t: "text", role: "title", text: X.open },
      { t: "doors", id: "adv", label: open ? X.tap : X.wait, texts: Array.from({ length: 24 }, (_, i) => doorText(lines, i, lang)), open }
    ] };
  }
};
