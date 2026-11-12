// Stimmen-Raetsel (alt Katalog zug-stimme, alt:src/turns.js:712-721 GAMES.stimme, Widget voices alt:src/turn-ui.js:322):
// Zug 1: Sitz 0 laedt ein (Anruf in einer beliebigen App, Link teilen). Zug 2: Sitz 1 waehlt die Rolle (sprechen oder raten)
// und spielt fuenf Runden: wer spricht, sieht die Figur; wer raet, tippt eine von sechs. Figuren und Karten aus dem Seed
// (alt mix: mulberry32(hash32("turn|" + seed + "|" + tag))), also auf beiden Handys gleich. Nichts wird aufgenommen.
// Varianten anruf-quiz und anruf-stimme (alt duel/deck, zusammengelegt) oeffnen diese Karte.
import manifest from "./manifest.json" with { type: "json" };
import { hash32, mulberry32 } from "../../engines/poster/doc.js";

const ROUNDS = 5, N = manifest.figures.length;
const T = (lang) => manifest.texts[lang] || manifest.texts.de;
const pk = (s, lang) => { const a = s.split("|"); return lang === "en" ? a[1] || a[0] : a[0]; };
function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, (m, k) => String(o[k])); }
/** alt turns.js mix: dieselbe Reihenfolge auf beiden Handys aus dem Seed. */
export function mix(seed, tag, n) {
  const r = mulberry32(hash32("turn|" + seed + "|" + tag)), a = [];
  for (let i = 0; i < n; i++) a.push(i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
export function figure(seed, r) { return mix(seed, "figur", N)[r]; }
export function figureCards(seed, r) {
  const ok = figure(seed, r), rest = mix(seed, "fk" + r, N).filter((i) => i !== ok).slice(0, 5).concat([ok]);
  return mix(seed, "fo" + r, 6).map((i) => rest[i]);
}
export function right(seed, r) { return figureCards(seed, r).indexOf(figure(seed, r)); }

export default {
  manifest,
  init({ rng }) { return { pub: { seed: rng.u32(), called: false, role: -1, hits: -1 }, priv: [null, null] }; },
  accepts(obs, seat, x) {
    const p = obs.pub;
    if (!p.called) return seat === 0 && x.t === "call";
    return seat === 1 && p.role < 0 && x.t === "play" && (x.r === 0 || x.r === 1) && Number.isInteger(x.a) && x.a >= 0 && x.a <= ROUNDS && (x.r === 1 || x.a === 0);
  },
  step(state, x) {
    const p = { ...state.pub };
    if (!p.called) { if (x.t !== "call" || x.seat !== 0) throw new Error("ungueltig: call"); p.called = true; }
    else {
      if (p.role >= 0 || x.t !== "play" || x.seat !== 1 || !this.accepts({ pub: p }, 1, x)) throw new Error("ungueltig: play");
      p.role = x.r; p.hits = x.a;
    }
    return { pub: p, priv: state.priv.slice() };
  },
  observe(state) { return { pub: state.pub, mine: null }; },
  status(state) {
    const p = state.pub, over = p.role >= 0;
    return { over, turn: over ? -1 : p.called ? 1 : 0, reveal: false, score: over ? [p.hits] : [], winner: -1, turnNo: p.called ? 2 : 1, turns: 2, local: false };
  },
  moves(obs, seat) {
    const p = obs.pub;
    if (!p.called) return seat === 0 ? [{ t: "call", seat: 0 }] : [];
    if (p.role < 0 && seat === 1) { const out = [{ t: "play", seat: 1, r: 0, a: 0 }]; for (let h = 0; h <= ROUNDS; h++) out.push({ t: "play", seat: 1, r: 1, a: h }); return out; }
    return [];
  },
  view(obs, seat, ctx = {}) {
    const p = obs.pub, lang = ctx.lang || "de", X = T(lang), fig = (i) => pk(manifest.figures[i], lang);
    if (!p.called) return { t: "stack", children: [{ t: "show", id: "call", label: X.call, lines: [X.share], submit: { t: "call", seat: 0 }, confirm: X.ok }] };
    if (p.role >= 0) return { t: "stack", children: [
      { t: "text", role: "title", text: p.role === 0 ? X.done : fmt(X.h, { n: p.hits }) },
      { t: "text", role: "small", text: X.note }
    ] };
    if (seat !== 1) return { t: "text", role: "body", text: X.share };
    const role = ctx.draft && (ctx.draft.role === 0 || ctx.draft.role === 1) ? ctx.draft.role : -1;
    if (role < 0) return { t: "stack", children: [
      { t: "choice", label: X.role, options: [{ label: X.speak, draft: { role: 0 } }, { label: X.guess, draft: { role: 1 } }] },
      { t: "text", role: "small", text: X.note }
    ] };
    const rounds = Array.from({ length: ROUNDS }, (_, r) => ({ figure: fig(figure(p.seed, r)), options: figureCards(p.seed, r).map(fig), right: right(p.seed, r) }));
    return { t: "voices", id: "voices", label: X.go, rounds: ROUNDS, role: role === 0 ? "speak" : "guess", data: rounds,
      texts: { round: X.round, which: X.which, yes: X.yes, no: X.no, done: X.done, h: X.h, next: X.next },
      submit: { t: "play", seat: 1, r: role } }; // Wert a = Treffer (Sprecher: 0)
  }
};
