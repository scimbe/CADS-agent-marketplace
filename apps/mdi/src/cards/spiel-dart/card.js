// Zugkarte "Dart im Wohnzimmer" (alt spiel-dart, Regeln in src/engines/dart/dart.js). Der Zustand traegt nur Ganzzahlen
// und Zeichenketten: den Partie-Seed (aus dem Init-rng), die Darts als Zeichenkette wie im Altcode (Kopf + 5 Zeichen je
// Pfeil), die letzte Behauptung und die Spitznamen. Jede Ansicht rechnet die Treffer daraus nach; Punkte im Link zaehlen
// nie (alt: "No score ever stands in the link").
// Zuege: {t:"turn", seat, d, c[, n]} = eine Aufnahme (1..3 Pfeile wie sim sie verlangt: 3, oder weniger bei Bust/Checkout),
// c = Punkte, die der Bildschirm zeigte (nur zum Vergleich), n = eigener Spitzname.
// {t:"bert", seat:1} = Bert uebernimmt Sitz 1; ab dann rechnet die Engine Berts Aufnahmen aus dem Seed (Kopf "b").
import manifest from "./manifest.json" with { type: "json" };
import * as D from "../../engines/dart/dart.js";
import { gameSeed } from "../../engines/seed32/seed32.js";

function copy(p) { return { mode: p.mode, seed: p.seed, s: p.s, c: p.c, n: p.n.slice() }; }
function game(p) { return D.sim(p.seed, p.s); }
function humanTurns(g) { return g.turns.filter((t) => !(g.bot && t.p === 1)).length; }
function turnOf(g) { return g.over ? -1 : g.bot ? 0 : g.turns.length % 2; }
function bertOk(p, g) { return !g.bot && !g.over && g.turns.length === 1; }

/** Neue Darts-Zeichenkette nach einer Aufnahme oder null, wenn der Zug nicht geht (nur, was der Bildschirm senden kann). */
function afterTurn(p, input) {
  const g = game(p);
  if (!g || g.over || input.seat !== turnOf(g)) return null;
  if (typeof input.d !== "string" || input.d.length < 5 || input.d.length > 15 || !D.dec(input.d)) return null;
  if (!Number.isInteger(input.c) || input.c < 0 || input.c > 999) return null;
  const s = p.s + input.d, ng = D.sim(p.seed, s);
  if (!ng || ng.partial || ng.extra || humanTurns(ng) !== humanTurns(g) + 1) return null;
  const n = p.n.slice();
  if (input.n !== undefined) { if (typeof input.n !== "string") return null; n[input.seat] = input.n; }
  if (!D.namesOk(n)) return null;
  return { s, n };
}

export function accepts(obs, seat, input) {
  if (!input || typeof input !== "object" || input.seat !== seat) return false;
  const p = obs.pub, g = game(p);
  if (!g) return false;
  if (input.t === "bert") return seat === 1 && Object.keys(input).length === 2 && bertOk(p, g);
  if (input.t === "turn") return afterTurn(p, input) !== null;
  return false;
}

function moves(obs, seat) {
  const g = game(obs.pub);
  return g && seat === 1 && bertOk(obs.pub, g) ? [{ t: "bert", seat: 1 }] : [];
}

/** Sicht dieses Geraets als { v, g, foreign, me } fuer face/result der Engine. */
function sight(p, seat) {
  const g = game(p);
  return { v: [p.s, p.c, p.n.slice()], g, foreign: false, me: g && !g.bot && (seat === 0 || seat === 1) ? seat : -1 };
}

function dartTiles(t, g, lang) {
  return t.d.map((h, i) => ({ t: "tile", fill: t.p === 0 ? "red" : "paper", ink: t.p === 0 ? "ink" : "ink", value: D.short(h, lang), sub: "", mark: "none", focus: false,
    a11y: D.T(lang).da_dart_of.replace("{n}", String(i + 1)) + ": " + D.spoken(h, lang) }));
}

export default {
  manifest,
  init({ rng, params }) {
    return { pub: { mode: params.spiel, seed: gameSeed(rng), s: D.head(params.spiel, false), c: 0, n: ["", ""] }, priv: [null, null] };
  },
  step(state, input) {
    const pub = copy(state.pub), g = game(pub);
    if (!g) throw new Error("ungueltig: Partie");
    if (input.t === "bert") {
      if (input.seat !== 1 || !bertOk(pub, g)) throw new Error("ungueltig: bert");
      pub.s = pub.s[0] + "b" + pub.s.slice(2);
      pub.c = 0;
      return { pub, priv: state.priv.slice() };
    }
    if (input.t !== "turn") throw new Error("ungueltig: Zug");
    const r = afterTurn(pub, input);
    if (!r) throw new Error("ungueltig: Aufnahme");
    pub.s = r.s; pub.n = r.n; pub.c = input.c;
    return { pub, priv: state.priv.slice() };
  },
  observe(state) { return { pub: copy(state.pub), mine: null }; },
  status(state) {
    const g = game(state.pub);
    if (!g) return { over: true, turn: -1, reveal: false, score: [0, 0], winner: -1 };
    const score = g.kind === "x01" ? g.left.slice() : g.kind === "atc" ? [g.next[0] - 1, g.next[1] - 1] : g.total.slice();
    return { over: g.over, turn: turnOf(g), reveal: false, score, winner: g.over ? g.win : -1, bot: g.bot };
  },
  moves,
  accepts,
  sample(obs) { return { pub: copy(obs.pub), priv: [null, null] }; },
  view(obs, seat, ctx) {
    const lang = ctx.lang === "en" ? "en" : "de", X = D.T(lang), p = obs.pub, w = sight(p, seat), g = w.g, kids = [];
    if (ctx.preview) {
      kids.push({ t: "text", role: "label", text: D.modeName(p.mode, lang), part: "regeln" });
      kids.push({ t: "text", role: "body", text: X["da_mi_" + p.mode], part: "regeln" });
      kids.push({ t: "text", role: "small", text: manifest.howto[lang] });
      return { t: "stack", children: kids };
    }
    if (!g) return { t: "stack", children: [{ t: "text", role: "body", text: X.da_over }] };
    if (!g.turns.length) {
      kids.push({ t: "text", role: "label", text: D.modeName(p.mode, lang) + " · " + X["da_mi_" + p.mode] });
      kids.push({ t: "text", role: "body", text: D.pair(g, lang, p.n, w.me) });
    } else if (g.over) {
      const r = D.result(w, lang);
      kids.push({ t: "text", role: "big", text: r.h });
      for (const l of r.lines) kids.push({ t: "text", role: "body", text: l });
    } else {
      for (const l of D.face(w, lang)) kids.push({ t: "text", role: "body", text: l });
    }
    if (g.turns.length) {
      const t = g.turns[g.turns.length - 1];
      if (g.bot && t.p === 1) kids.push({ t: "text", role: "small", text: X.da_bert_go + " " + D.quip(p.seed, g.turns.length - 1, lang) });
      kids.push({ t: "row", wrap: false, children: dartTiles(t, g, lang) });
    }
    if (!g.over) {
      const turn = turnOf(g);
      if (turn === seat) {
        kids.push({ t: "text", role: "label", text: g.turns.length ? X.da_l : X.da_l_first });
        kids.push({ t: "text", role: "small", text: X.da_n2 });
      } else kids.push({ t: "text", role: "small", text: g.bot ? X.da_bert_go : X.da_send_note });
      if (g.bot) kids.push({ t: "text", role: "small", text: X.da_bot_note });
    }
    return { t: "stack", children: kids };
  }
};
