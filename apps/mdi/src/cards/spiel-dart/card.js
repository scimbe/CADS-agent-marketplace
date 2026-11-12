// Zugkarte "Dart im Wohnzimmer" (alt spiel-dart, Regeln in src/engines/dart/dart.js). Der Zustand traegt nur Ganzzahlen
// und Zeichenketten: Spielart, Partie-Seed (aus dem Init-rng), die Darts als Zeichenkette wie im Altcode (Kopf + 5 Zeichen
// je Pfeil) und die Spitznamen. Jede Ansicht rechnet die Treffer daraus nach; Punkte stehen nie im Zustand oder Link.
//
// Eingaben (manifest.inputs, Rohwert im Feld a wie die Widgets aus ADR 0001 c ihn liefern):
//   {t:"dart", seat, a:{aim:[x,y], power:p}, f?:1, n?:Spitzname}
//       EIN PFEIL je Eingabe: das form-Widget (aim + power) liefert genau einen Wurf; die Karte zeigt nach jedem Pfeil
//       die Landung (wie alt dart-ui.js), und Bust/Checkout beenden die Aufnahme nach 1 oder 2 Pfeilen ohne Sonderfall.
//       aim = Raster 0..4095 (Tausendstel Brettradius um 2048), power = Stufe 0..8 (4 fliegt gerade), f = am Regler ohne
//       Timing gesetzt (der Seed verschiebt die Stufe wie im Altcode je 1 zu 5 um eine nach unten/oben). Intern wird
//       daraus die Altkodierung (D.enc) – Golden-Tests bleiben bitgleich.
//   {t:"bert", seat:1}  Bert uebernimmt Sitz 1 (einzig nach der ersten Aufnahme); danach rechnet die Engine jede
//       Bert-Aufnahme aus dem Seed (Kopf "b"), Sitz 1 hat keine eigenen Zuege mehr.
//   {t:"snap", seat:0, a:{d, b, n}}  Schnappschuss (manifest.link.snap, alt "snap: the link holds only the latest move,
//       which carries every dart"): die ganze Partie als Darts-Zeichenkette d, b = gegen Bert, n = Spitznamen. Nur als
//       erste Eingabe einer Partie; compact() erzeugt ihn, damit eine volle Partie (72 Pfeile) klein im Link reist.
// Die alte "Behauptung" (Punkte, die der Bildschirm des Werfers zeigte) entfaellt: der Link traegt den Zustandshash h,
// jedes Geraet rechnet nach und lehnt Abweichungen ab (staerker als der alte Hinweis da_fixed).
import manifest from "./manifest.json" with { type: "json" };
import * as D from "../../engines/dart/dart.js";
import * as B from "./board.js";
import { gameSeed, fmt } from "../../engines/seed32/seed32.js";

function copy(p) { return { mode: p.mode, seed: p.seed, s: p.s, n: p.n.slice() }; }
function game(p) { return D.sim(p.seed, p.s); }
/** Wer wirft den naechsten Pfeil: -1 vorbei; bei begonnener Aufnahme deren Sitz; gegen Bert immer 0. */
function turnOf(g) {
  if (!g || g.over) return -1;
  if (g.partial) return g.turns[g.turns.length - 1].p;
  return g.bot ? 0 : g.turns.length % 2;
}
function done(g) { return g.turns.length - (g.partial ? 1 : 0); }
function bertOk(g) { return !!g && !g.bot && !g.over && !g.partial && g.turns.length === 1; }
function isInt(v, lo, hi) { return Number.isInteger(v) && v >= lo && v <= hi; }
// Schluessel exakt (Review: kein dehnbares Log): Pflicht- und erlaubte Felder je Eingabe und im Rohwert a
function keysOk(o, need, may = []) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  const k = Object.keys(o);
  return need.every((x) => k.includes(x)) && k.every((x) => need.includes(x) || may.includes(x));
}
/** Gegen Bert erst nach einer abgeschlossenen Aufnahme von Sitz 0 (alt: Bert uebernimmt nach dem ersten Wurf). */
function botStartOk(g) { return !g.bot || (g.turns.length >= 1 && !(g.partial && g.turns.length === 1)); }
function charsOf(input) {
  const a = input.a;
  if (!keysOk(a, ["aim", "power"]) || !Array.isArray(a.aim) || a.aim.length !== 2 || !isInt(a.aim[0], 0, 4095) || !isInt(a.aim[1], 0, 4095) || !isInt(a.power, 0, D.LEVELS - 1)) return null;
  if (input.f !== undefined && input.f !== 1) return null;
  const d = { ax: a.aim[0], ay: a.aim[1], p: a.power }; if (input.f === 1) d.f = 1;
  return D.enc(d);
}

/** Zustand nach einem Pfeil oder null, wenn er nicht geht (nur, was der Bildschirm senden kann). */
function afterDart(p, input) {
  if (!keysOk(input, ["t", "seat", "a"], ["f", "n"])) return null;
  const g = game(p);
  if (!g || input.seat !== turnOf(g)) return null;
  const c = charsOf(input); if (!c) return null;
  const ng = D.sim(p.seed, p.s + c);
  if (!ng || ng.extra) return null;
  const n = p.n.slice();
  if (input.n !== undefined) { if (typeof input.n !== "string") return null; n[input.seat] = input.n; }
  if (!D.namesOk(n)) return null;
  return { ...copy(p), s: p.s + c, n };
}
function afterSnap(p, input) {
  if (input.seat !== 0 || p.s.length !== 2 || p.s[1] !== "l" || p.n[0] || p.n[1]) return null;
  if (!keysOk(input, ["t", "seat", "a"]) || !keysOk(input.a, ["d", "b", "n"])) return null;
  const a = input.a;
  if (typeof a.d !== "string" || typeof a.b !== "boolean" || !Array.isArray(a.n) || a.n.length !== 2 || a.n.some((x) => typeof x !== "string")) return null;
  const s = p.mode + (a.b ? "b" : "l") + a.d, g = D.sim(p.seed, s);
  if (!g || g.extra || !botStartOk(g) || !D.namesOk(a.n)) return null;
  return { ...copy(p), s, n: a.n.slice() };
}
function next(p, input) {
  if (!input || typeof input !== "object") return null;
  if (input.t === "dart") return afterDart(p, input);
  if (input.t === "snap") return afterSnap(p, input);
  if (input.t === "bert") { const g = game(p); return input.seat === 1 && bertOk(g) ? { ...copy(p), s: p.s[0] + "b" + p.s.slice(2) } : null; }
  return null;
}

export function accepts(obs, seat, input) {
  if (!input || typeof input !== "object" || input.seat !== seat) return false;
  if (input.t === "bert" && Object.keys(input).length !== 2) return false;
  return next(obs.pub, input) !== null;
}

/** Hinweiszug fuer den Sitz am Zug: Ziel wie ein Stammspieler (Berts aimFor), Kraft in der Mitte. Fuer Bot-Ersatz,
 *  Hinweise und den kartenunabhaengigen Treiber; die echte Bedienung waehlt Ziel und Kraft selbst. */
function hint(g, seat) {
  const at = D.aimFor(g, seat), c = D.centre(at.n, at.r), d = D.dart(c[0], c[1], D.MID);
  return { t: "dart", seat, a: { aim: [d.ax, d.ay], power: d.p } };
}
function moves(obs, seat) {
  const g = game(obs.pub);
  if (!g || turnOf(g) !== seat) return [];
  const out = [];
  if (seat === 1 && bertOk(g)) out.push({ t: "bert", seat: 1 });
  out.push(hint(g, seat));
  return out;
}

/** Sicht dieses Geraets als { v, g, foreign, me } fuer face/result der Engine (Behauptung = nachgerechnet). */
function sight(p, seat) {
  const g = game(p);
  const v = [p.s, g && g.turns.length && !g.partial ? D.claimed(g) : 0, p.n.slice()];
  return { v, g, foreign: false, me: g && !g.bot && (seat === 0 || seat === 1) ? seat : -1 };
}

function dartTiles(t, lang) {
  return t.d.map((h, i) => ({ t: "tile", fill: t.p === 0 ? "red" : "paper", ink: "ink", value: D.short(h, lang), sub: "", mark: "none", focus: false,
    a11y: fmt(D.T(lang).da_dart_of, { n: i + 1 }) + ": " + D.spoken(h, lang) }));
}

/** Bedienung fuer einen Pfeil: Canvas mit Brett, form aus aim + power, Tastatur-/Schalterweg „Zielen auf“ (da_n2). */
function throwUi(p, g, seat, ctx, lang) {
  const X = D.T(lang), draft = ctx.draft && typeof ctx.draft === "object" ? ctx.draft : {}, kDart = g.k;
  const chosen = typeof draft.aim === "string" ? B.aimGrid(draft.aim) : null, aim = chosen || B.aimGrid("t20");
  const slider = draft.slider === true;
  const other = p.n[1 - seat], nick = typeof ctx.nick === "string" ? D.myName(ctx.nick, other) : "";
  const submit = { t: "dart", seat };
  if (slider) submit.f = 1;
  if (nick && nick !== p.n[seat]) submit.n = nick;
  const cur = g.partial ? g.turns[g.turns.length - 1].d.length : 0;
  const kids = [
    { t: "text", role: "label", text: fmt(X.da_dart_of, { n: cur + 1 }) },
    B.canvas(p, lang, kDart, aim),
    { t: "form", id: "wurf", label: X.da_board, hint: X.da_board_help, confirm: X.da_throw, submit, fields: [
      { t: "aim", id: "aim", label: X.da_aim, w: B.SIZE, h: B.SIZE, grid: 4096, map: { x0: B.MID, y0: B.MID, g0: 2048, per: 1 }, value: aim, card: "brett" },
      { t: "power", id: "power", label: X.da_power, levels: D.LEVELS, mode: slider ? "schieber" : "pendel", value: slider ? D.MID : D.hand(p.seed, kDart).lv,
        swing: D.SWING, quick: D.QUICK, hint: X.da_power_mid }
    ] }
  ];
  // Tastatur und Schalter (alt da_n2): Zahl, dann Ring; „Ohne Timing“ schaltet die Kraft auf den Regler
  const num = typeof draft.num === "string" ? draft.num : null;
  if (num && num !== "50" && num !== "25" && num !== "") {
    kids.push({ t: "choice", label: X.da_aim + " " + num, wrap: true, options: B.aimRings(Number(num), lang).map((o) => ({ label: o.label, draft: { ...draft, num: null, aim: o.v }, on: draft.aim === o.v })) });
  } else {
    kids.push({ t: "choice", label: X.da_aim, wrap: true, options: B.aimNumbers(lang).map((o) => ({ label: o.label,
      draft: o.v === "50" || o.v === "25" ? { ...draft, num: null, aim: o.v } : o.v === "" ? { ...draft, num: null, aim: null } : { ...draft, num: o.v }, on: o.v === "" ? !draft.aim : draft.aim === o.v })) });
  }
  kids.push({ t: "choice", label: X.da_power, options: [{ label: X.da_power_go, draft: { ...draft, slider: false }, on: !slider }, { label: X.da_lv_mid, draft: { ...draft, slider: true }, on: slider }] });
  kids.push({ t: "text", role: "small", text: X.da_n2 });
  return kids;
}

export default {
  manifest,
  init({ rng, params }) {
    return { pub: { mode: params.spiel, seed: gameSeed(rng), s: D.head(params.spiel, false), n: ["", ""] }, priv: [null, null] };
  },
  step(state, input) {
    const r = next(state.pub, input);
    if (!r) throw new Error("ungueltig: " + (input && input.t));
    return { pub: r, priv: state.priv.slice() };
  },
  observe(state) { return { pub: copy(state.pub), mine: null }; },
  status(state) {
    const g = game(state.pub);
    if (!g) return { over: true, turn: -1, reveal: false, score: [0, 0], winner: -1 };
    const score = g.kind === "x01" ? g.left.slice() : g.kind === "atc" ? [g.next[0] - 1, g.next[1] - 1] : g.total.slice();
    return { over: g.over, turn: turnOf(g), reveal: false, score, winner: g.over ? g.win : -1, bot: g.bot,
      turnNo: Math.min(D.rounds(g), Math.floor(done(g) / 2) + 1), turns: D.rounds(g) };
  },
  moves,
  accepts,
  /** Eigener Bot (ADR 0001 f): Bert uebernimmt Sitz 1; ohne Bert-Moeglichkeit wirft er wie ein Stammspieler (Hinweiszug).
   *  Deterministisch: haengt nur von der Beobachtung ab (Berts Pfeile rechnet die Engine aus dem Partie-Seed). */
  bot(obs, seat) {
    const m = moves(obs, seat);
    if (!m.length) throw new Error("bot: nicht am Zug");
    return m[0];
  },
  sample(obs) { return { pub: copy(obs.pub), priv: [null, null] }; },
  /** Snapshot (manifest.link.snap): die ganze Partie als ein Zug. Mit state aus dessen pub, sonst aus dem Log. */
  compact(log, state) {
    if (!log.length) return [];
    let d = "", b = false; const n = ["", ""];
    if (state && state.pub) { d = state.pub.s.slice(2); b = state.pub.s[1] === "b"; n[0] = state.pub.n[0]; n[1] = state.pub.n[1]; }
    else {
      for (const x of log) {
        if (x.t === "snap") { d = x.a.d; b = x.a.b; n[0] = x.a.n[0]; n[1] = x.a.n[1]; }
        else if (x.t === "bert") b = true;
        else if (x.t === "dart") { d += charsOf(x); if (typeof x.n === "string") n[x.seat] = x.n; }
      }
    }
    return [{ t: "snap", seat: 0, a: { d, b, n } }];
  },
  /** Zwei Staende derselben Partie vereinigen: a = eigener (gespeicherter), b = eingehender Stand.
   *  Nach alt trust (dart.js) darf b den eigenen Stand um hoechstens EINE Aufnahme fortsetzen oder ein frueherer Stand sein.
   *  Strenger als alt (Review): b muss selbst eine gueltige Partie sein (keine Pfeile nach dem Ende, Bert erst nach der
   *  ersten Aufnahme, Namen nach namesOk), eine begonnene zweite Aufnahme zaehlt als zu viel. Gegen Bert zaehlt eine
   *  Aufnahme des Menschen samt der daraus gerechneten Bert-Aufnahme als ein Fortschritt (alt: Bert-Partien hatten
   *  keinen Ruecklink, sim rechnet Bert sofort mit; Fortschritt wird deshalb in Aufnahmen von Sitz 0 gemessen).
   *  Namen: nur wer im neuen Teil geworfen hat, darf seinen Namen setzen; die anderen behalten den eigenen Stand
   *  (alt view: der eigene Name kommt immer aus dem eigenen Speicher). Alles andere wird abgelehnt, nie still gezaehlt. */
  merge(a, b) {
    const bad = (why) => { const e = new Error("merge: " + why); e.code = "manipuliert"; throw e; };
    if (!a || !b || a.seed !== b.seed || a.mode !== b.mode || typeof b.s !== "string" || !Array.isArray(b.n) || b.n.length !== 2) bad("andere Partie");
    if (b.s[0] !== a.mode || !D.nameOk(b.n[0]) || !D.nameOk(b.n[1])) bad("ungueltiger Stand");
    const ga = game(a), gb = game(b);
    if (!ga || !gb || gb.extra || !botStartOk(gb)) bad("ungueltiger Stand");
    const da = a.s.slice(2), db = b.s.slice(2);
    if (ga.bot && !gb.bot && db.length >= da.length) bad("Bert verschwunden");
    if (da.slice(0, db.length) === db && (gb.bot === ga.bot || !gb.bot)) return copy(a); // gleich oder frueher: eigener Stand
    if (db.slice(0, da.length) !== da) bad("passt nicht zum letzten Wurf");
    const unit = (g) => g.bot ? g.turns.filter((t, i) => t.p === 0 && !(g.partial && i === g.turns.length - 1)).length : done(g);
    const ua = unit(ga), ub = unit(gb);
    if (ub > ua + 1 || (gb.partial && ub > ua)) bad("mehr als eine Aufnahme");
    const from = ga.turns.length - (ga.partial ? 1 : 0), threw = new Set(gb.turns.slice(from).filter((t) => !(gb.bot && t.p === 1)).map((t) => t.p));
    const n = [0, 1].map((x) => (threw.has(x) ? b.n[x] : a.n[x]));
    if (!D.namesOk(n)) for (const x of threw) n[x] = "";
    return { ...copy(b), n: D.namesOk(n) ? n : a.n.slice() };
  },
  view(obs, seat, ctx) {
    const lang = ctx.lang === "en" ? "en" : "de", X = D.T(lang), p = obs.pub, w = sight(p, seat), g = w.g, kids = [];
    if (ctx.preview) {
      kids.push({ t: "text", role: "label", text: D.modeName(p.mode, lang), part: "regeln" });
      kids.push({ t: "text", role: "body", text: X["da_mi_" + p.mode], part: "regeln" });
      kids.push({ t: "text", role: "small", text: manifest.howto[lang] });
      return { t: "stack", children: kids };
    }
    if (!g) return { t: "stack", children: [{ t: "text", role: "body", text: X.da_over }] };
    const full = done(g);
    if (!full) {
      kids.push({ t: "text", role: "label", text: D.modeName(p.mode, lang) + " · " + X["da_mi_" + p.mode] });
      kids.push({ t: "text", role: "body", text: D.pair(g, lang, p.n, w.me) });
    } else if (g.over) {
      const r = D.result(w, lang);
      kids.push({ t: "text", role: "big", text: r.h });
      for (const l of r.lines) kids.push({ t: "text", role: "body", text: l });
    } else {
      const gf = g.partial ? D.sim(p.seed, p.s.slice(0, p.s.length - 5 * g.turns[g.turns.length - 1].d.length)) : g;
      for (const l of D.face({ ...w, g: gf, v: [w.v[0], D.claimed(gf), w.v[2]] }, lang)) kids.push({ t: "text", role: "body", text: l });
    }
    if (g.turns.length) {
      const t = g.turns[g.turns.length - 1];
      if (g.bot && t.p === 1) kids.push({ t: "text", role: "small", text: X.da_bert_go + " " + D.quip(p.seed, g.turns.length - 1, lang) });
      if (g.partial && g.turns.length > 1) kids.push({ t: "row", wrap: false, children: dartTiles(g.turns[g.turns.length - 2], lang) });
      kids.push({ t: "row", wrap: false, children: dartTiles(t, lang) });
      if (t.bust && !g.partial) kids.push({ t: "text", role: "small", text: fmt(X.da_bust, { n: t.from }) });
    }
    if (!g.over) {
      const turn = turnOf(g);
      if (turn === seat) {
        kids.push({ t: "text", role: "label", text: full ? X.da_l : X.da_l_first });
        kids.push(...throwUi(p, g, seat, ctx, lang));
      } else kids.push({ t: "text", role: "small", text: g.bot ? X.da_bert_go : X.da_send_note });
      if (g.bot) kids.push({ t: "text", role: "small", text: X.da_bot_note });
    } else kids.push(B.canvas(p, lang));
    return { t: "stack", children: kids };
  }
};
