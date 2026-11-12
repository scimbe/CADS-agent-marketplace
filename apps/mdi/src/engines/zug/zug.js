// Zug-Engine (E1): eine Altregel-Tabelle (turns.js GAMES) wird zur Vertragskarte. Der Kern ist der alte, nur in den
// Kartenvertrag uebersetzt (02-spec/12-paritaet.md §2 E1; Altcode turns.js:1145-1210):
//   Zustand pub = { seed, m: [[Antwort je Prompt] je Zug], now: [Antworten des laufenden Zugs], o, k }
//     seed  uint32 aus dem Partie-Seed (alt doc.seed), m wie alt (checked), now = noch nicht abgeschlossener Zug,
//     o     Tag, an dem sich etwas oeffnet (gateFrom), oder 2 = von der Besitzerin geschlossen (close), sonst 0,
//     k     Zahl der abgeschlossenen Zuege (auch nach snap; bestimmt den Sitz).
//   Eingabe { t:"ans", seat, a:<Rohwert>, d? } beantwortet genau einen Prompt (eine Frage je Bildschirm).
//     d = UTC-Tag des Absenders, nur beim letzten Prompt von Zug 0 einer gateFrom-Karte (alt d.o = today + Tage).
//   Eingabe { t:"close", seat } schliesst eine Liste (alt close, nur Karten mit game.close).
// Sitz: "pair" = Zuege abwechselnd (k % 2), "chain" = jeder Zug ein eigener Sitz (k), "room" = ein Geraet (Sitz 0).
// Die Uhr gibt es in der Karte nicht: Ob ein Tor schon offen ist, entscheidet nur die Ansicht mit ctx.today.
import { textsFor, fmt, intIn, clean as cleanText } from "./alt.js";
import { okAnswer } from "./check.js";
import { shopMerge as mergeList } from "./merge.js";

// ---------- Antworten im Link: der Rohwert (int, string, Listen davon), wie F's Widgets ihn als `a` schicken ----------
// Die Huelle (kanonisch <= 2048 Byte, keine Steuerzeichen, kein <>) prueft der Host global (ADR 0001 f); accepts prueft
// Form und Regel, step prueft noch einmal und wirft.
/** Ganzzahl-JSON pruefen: der Zustand darf keine Gleitkommazahl enthalten (canon im SDK wirft sonst). */
function intJson(v, depth = 0) {
  if (depth > 6) return false;
  if (v === null || typeof v === "string" || typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isInteger(v);
  if (Array.isArray(v)) return v.length <= 64 && v.every((x) => intJson(x, depth + 1));
  return false;
}

/** uint32 aus dem Partie-Seed (Zeichenkette): erste 8 Hex-Stellen, sonst FNV ueber den Text (stabil, rein). */
export function seed32(seed) {
  if (typeof seed === "string" && /^[0-9a-f]{8}/.test(seed)) return parseInt(seed.slice(0, 8), 16) >>> 0;
  let h = 0x811c9dc5; const s = String(seed);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * @param {{manifest:object, games:Object<string,object>, text:{de:object,en:object}, data?:object, seating?:"pair"|"chain"|"room",
 *          variantKey?:string, docOf?:(params:object, seed:number)=>object, view?:Object<string,Function>}} def
 *   games: Variante -> alter GAMES-Eintrag; variantKey nennt den Parameter, der die Variante waehlt (sonst die einzige).
 *   docOf: Parameter -> alte doc-Felder (w, pk, …); seed kommt immer aus der Partie.
 */
export function makeZug(def) {
  const { manifest } = def;
  const seating = def.seating || "pair";
  const T = (lang) => textsFor(def.text, lang);
  const variantOf = (params) => {
    const ids = Object.keys(def.games);
    const v = def.variantKey ? params[def.variantKey] : ids[0];
    if (!Object.prototype.hasOwnProperty.call(def.games, v)) throw new Error("ungueltig: Variante " + v);
    return v;
  };
  const docFor = (pub) => ({ seed: pub.seed, o: pub.o || undefined, ...(def.docOf ? def.docOf(pub.p, pub.seed) : {}) });
  const gameOf = (pub) => def.games[pub.v];
  function over(g, pub) { return !!(pub.m.length >= g.turns.length || (g.ends && g.ends(docFor(pub), pub.m))); }
  // Sitzordnung je Variante: alt local -> ein Geraet; sonst die der Karte (oder game.seating)
  function seatingOf(g) { return g.seating || (g.local ? "room" : seating); }
  function seatOf(pub) { const s = seatingOf(gameOf(pub)); return s === "room" ? 0 : s === "chain" ? pub.k : pub.k % 2; }
  function prompts(g, pub) { return over(g, pub) ? [] : g.turns[pub.m.length]; }
  function copy(pub) { return JSON.parse(JSON.stringify(pub)); }

  function status(state) {
    const pub = state.pub, g = gameOf(pub), done = over(g, pub);
    // "stay" (alt): ab Zug 2 bleibt alles auf dem Geraet; der Link geht unveraendert an die naechste Person weiter.
    const local = !!(g.stay && pub.k >= 1);
    const total = g.turns.length;
    return { over: done, turn: done ? -1 : seatOf(pub), reveal: false, score: [], winner: -1, local, turnNo: done ? pub.m.length : pub.m.length + 1, turns: total };
  }

  /** Antwort fuer den naechsten Prompt pruefen (ohne Zustand zu aendern). */
  function acceptsAnswer(pub, v) {
    const g = gameOf(pub), ps = prompts(g, pub), p = ps[pub.now.length];
    if (!p || !intJson(v)) return false;
    // end:true (pay): die Ansicht bietet keinen Weiter-Knopf (alt turn-ui.js:663); als Regel gilt okAnswer wie alt
    return okAnswer(p, v, docFor(pub), "de", pub.m, pub.now);
  }
  function accepts(obs, seat, input) {
    const pub = obs.pub, st = status({ pub });
    if (st.over || seat !== st.turn || input.seat !== seat) return false;
    if (input.t === "close") return !!gameOf(pub).close && pub.m.length > 0 && pub.now.length === 0;
    if (input.t !== "ans") return false;
    const v = input.a;
    if (!acceptsAnswer(pub, v)) return false;
    const g = gameOf(pub), last = pub.now.length + 1 === prompts(g, pub).length;
    // d stempelt der Host (manifest.inputDay, ADR 0001 §4); Pflicht nur dort, wo ein Tor entsteht (alt gateFrom)
    if (input.d !== undefined && !intIn(input.d, 10000, 100000)) return false;
    if (g.gateFrom && pub.m.length === 0 && last) return input.d !== undefined;
    return true;
  }

  function step(state, input) {
    const pub = copy(state.pub);
    if (!accepts({ pub }, input.seat, input)) throw new Error("ungueltig: " + input.t);
    const g = gameOf(pub);
    if (input.t === "close") { pub.o = g.close; return { pub, priv: state.priv.slice() }; }
    const v = JSON.parse(JSON.stringify(input.a));
    pub.now.push(v);
    if (pub.now.length === prompts(g, pub).length) {
      const answers = pub.now, t = pub.m.length;
      pub.m = g.snap ? pub.m.slice(0, g.snap === true ? 0 : g.snap).concat([answers]) : pub.m.concat([answers]);
      if (g.gateFrom && t === 0) pub.o = input.d + answers[1];
      if (g.list && g.list.wish && pub.o === 1) pub.o = 0; // der eigene Link der Wuenschenden geht nie als der der Familie weiter
      pub.now = []; pub.k += 1;
    }
    return { pub, priv: state.priv.slice() };
  }

  function result(pub, lang) {
    const g = gameOf(pub);
    return over(g, pub) ? g.result(docFor(pub), pub.m, lang) : null;
  }
  /** Tage, bis sich der naechste Zug oeffnet (alt gate, turns.js:1192); 0 = offen. today = UTC-Tag des Geraets. */
  function gateLeft(pub, today) {
    const g = gameOf(pub), at = g.gate ? g.gate(docFor(pub), pub.m) : 0;
    if (!at) return 0;
    if (!Number.isInteger(today)) return null; // ohne Tag vom Host bleibt das Tor zu (kein stilles Oeffnen)
    return at - today > 0 ? at - today : 0;
  }

  const card = {
    manifest,
    init({ rng, params }) {
      // alt: jede neue Partie hat ihren eigenen Seed; hier aus dem SDK-RNG der Partie (Commit des Seeds liegt beim Host)
      const v = variantOf(params);
      return { pub: { v, p: params, seed: rng.u32(), m: [], now: [], o: 0, k: 0 }, priv: new Array(manifest.players.max).fill(null) };
    },
    step,
    observe(state) { return { pub: copy(state.pub), mine: null }; },
    status,
    accepts,
    // aufzaehlbare Zuege fuer Bot/Hinweis: nur Auswahl-Prompts mit n = 1; freie Eingaben pruefen accepts()
    moves(obs, seat) {
      const pub = obs.pub, st = status({ pub });
      if (st.over || seat !== st.turn) return [];
      const g = gameOf(pub), p = prompts(g, pub)[pub.now.length];
      if (!p) return [];
      if ((p.w === "show" || p.w === "blow") && acceptsAnswer(pub, 0)) return [{ t: "ans", seat, a: 0, ...dayFor(g, pub, null) }];
      if (p.w !== "pick" || p.n !== 1) return [];
      const n = p.from(docFor(pub), pub.m, pub.now, "de").length, out = [];
      for (let i = 0; i < n; i++) out.push({ t: "ans", seat, a: [i] });
      return out;
    },
    // ---------- fuer Ansicht, Host und Tests ----------
    T, docFor, gameOf, seatingOf: (pub) => seatingOf(gameOf(pub)), prompts: (pub) => prompts(gameOf(pub), pub), result, gateLeft,
    face(pub, lang) { const g = gameOf(pub); return g.face ? g.face(docFor(pub), pub.m, lang) : null; },
    whole(pub, lang) { const g = gameOf(pub); return g.peekWhole ? g.peekWhole(docFor(pub), pub.m, lang) : ""; },
    /** Woerter dieser Variante fuer die gemeinsamen Knoepfe (alt GAMES[g].words), schon in der Sprache. */
    words(pub, lang) {
      const X = T(lang), w = gameOf(pub).words || {}, out = {};
      for (const k of ["you_start", "go_first", "go_play", "note_turn", "note_over", "ready", "send", "rematch"]) out[k] = X[w[k] || k] || "";
      return out;
    },
    /** Eingabe fuer eine Antwort (Host/Ansicht). today nur noetig, wenn dieser Prompt einen Tag traegt. */
    answer(pub, seat, v, today) { return { t: "ans", seat, a: v, ...dayFor(gameOf(pub), pub, today) }; },
    view(obs, seat, ctx) { return viewOf(card, obs, seat, ctx || {}, def); },
    /** Freie Karte (Strang K): Doc {k:"turn", i:<Katalog-id>, t?, s?, w?} -> Parameter oder null; und zurueck (Robot). */
    fromFree(doc) {
      if (!doc || typeof doc !== "object" || typeof doc.i !== "string") return null;
      const v = (def.legacy || {})[doc.i];
      if (!v) return null;
      const props = manifest.params.properties, out = {};
      for (const [k, p] of Object.entries(props)) out[k] = JSON.parse(JSON.stringify(p.default));
      if (def.variantKey) out[def.variantKey] = v;
      if (props.titel && typeof doc.t === "string") { const t = cleanText(doc.t, props.titel.maxLength); if (t) out.titel = t; }
      return out;
    },
    toFree(params) {
      const v = def.variantKey ? params[def.variantKey] : Object.keys(def.games)[0];
      const id = Object.keys(def.legacy || {}).find((k) => def.legacy[k] === v) || manifest.id;
      return { k: "turn", i: id, ...(params.titel ? { t: params.titel } : {}) };
    },
    /** snap-Karten (manifest.link.snap, ADR 0001 f): Der Link traegt die Liste, wie sie jetzt ist, nicht den Weg dorthin
     *  (alt snap, turns.js:1186). Der letzte Zug einer snap-Karte ist ein einzelner Prompt mit der ganzen Liste; aus ihm
     *  und einem etwaigen close entsteht ein kurzes Log, das von init aus denselben Listenstand ergibt. Danach ist der
     *  andere Sitz dran. Ohne snap bleibt das Log unveraendert. */
    compact(log) {
      const lastAns = [...log].reverse().find((x) => x && x.t === "ans");
      if (!lastAns || !log.length) return log;
      const closed = log.some((x) => x && x.t === "close");
      const out = [{ t: "ans", seat: 0, a: lastAns.a }];
      if (closed) out.push({ t: "close", seat: 1 });
      return out;
    },
    /** Vereinigung zweier Staende derselben snap-Partie (alt shopMerge beim Empfang, turn-ui.js shopSeen): kommutativ,
     *  assoziativ, idempotent. Geschlossen bleibt geschlossen. */
    merge(a, b) {
      const g = gameOf(b);
      if (!g.snap || !g.list || a.v !== b.v || a.seed !== b.seed) return copy(b);
      const la = a.m.length ? a.m[0][0] : null, lb = b.m.length ? b.m[0][0] : null;
      const list = la && lb ? mergeList(la, lb, g.list) : copy(lb || la);
      const out = copy(b);
      out.m = list ? [[list]] : [];
      out.now = [];
      out.o = Math.max(a.o === 2 ? 2 : 0, b.o === 2 ? 2 : 0);
      out.k = list ? 1 : 0;
      return out;
    }
  };
  function dayFor(g, pub, today) {
    const last = pub.now.length + 1 === prompts(g, pub).length;
    return g.gateFrom && pub.m.length === 0 && last ? { d: today } : {};
  }
  return card;
}

// ---------- Ansicht: eine Frage je Bildschirm (13-produktverstaendnis §6.4) ----------
import { widget, ui } from "./widgets.js";

function viewOf(card, obs, seat, ctx, def) {
  const pub = obs.pub, lang = ctx.lang || "de", X = card.T(lang), g = card.gameOf(pub), st = card.status({ pub });
  const words = card.words(pub, lang);
  const head = { who: st.turn, turn: st.turnNo, total: st.turns, rule: def.manifest.howto ? def.manifest.howto[lang] || def.manifest.howto.de : "" };
  const kids = [];
  if (ctx.preview) {
    if (def.preview) return def.preview(card, pub, lang);
    return { t: "stack", head, children: [{ t: "text", role: "body", text: head.rule }] };
  }
  if (st.over) {
    const r = card.result(pub, lang);
    kids.push({ t: "text", role: "big", text: r.h });
    for (const s of r.lines) kids.push({ t: "text", role: "body", text: s });
    if (r.copy) kids.push({ t: "copy", text: r.copy, label: X.sor_copy });
    if (r.note) kids.push({ t: "text", role: "small", text: r.note });
    if (g.after) for (const n of g.after(card, pub, lang, ctx)) kids.push(n);
    if (r.open) kids.push({ t: "open", card: r.open.i, label: X[r.open.l] });
    return { t: "stack", head, result: true, children: kids };
  }
  const left = card.gateLeft(pub, ctx.today);
  if (left === null || left > 0) {
    kids.push({ t: "text", role: "big", text: left === null ? ui(lang).gateUnknown : fmt(X.note_wait, { n: left }) });
    const w = card.whole(pub, lang); if (w) kids.push({ t: "text", role: "body", text: w });
    return { t: "stack", head, gate: left, children: kids };
  }
  const face = card.face(pub, lang);
  if (seat !== st.turn) {
    if (face) for (const s of face) kids.push({ t: "text", role: "body", text: s });
    return { t: "stack", head, children: kids };
  }
  const ps = card.prompts(pub), i = pub.now.length, p = ps[i];
  const w0 = card.whole(pub, lang); if (w0 && i === 0) kids.push({ t: "text", role: "body", text: w0 });
  if (pub.m.length === 0 && i === 0 && words.you_start) kids.push({ t: "text", role: "label", text: words.you_start });
  const doc = card.docFor(pub);
  const c = { doc, m: pub.m, now: pub.now, lang, X, seat, draft: ctx.draft === undefined ? null : ctx.draft, ctx, card, pub, step: i, steps: ps.length, today: ctx.today };
  const node = (g.view && g.view[p.w]) ? g.view[p.w](p, c) : (def.view && def.view[p.w]) ? def.view[p.w](p, c) : widget(p, c);
  kids.push(node);
  return { t: "stack", head, step: { i: i + 1, n: ps.length }, children: kids };
}
