// Zugablauf der Quiz-Karten als Daten (wie alt turns.js: ein Spiel = Züge, ein Zug = Eingaben/"prompts"). Daraus baut
// makeCard die Vertragsfunktionen (init/step/observe/status/moves/accepts/view). Zug t gehört Sitz t % 2 (alt state.who).
// Antworten werden wie im Altcode abgelegt: show -> 0, pick -> [k], slide -> Zahl, list -> [Text, ...].
//
// Eingaben (eine je prompt): show {t:"ok",seat} · pick {t:"pick",seat,v:k} · slide {t:"guess",seat,v:Zahl}
// · list {t:"list",seat,v:[Text, ...]}. Schieber und Listen lassen sich nicht aufzählen: accepts() prüft sie
// (angefragter Vertrags-Hook bei Strang F); moves() zählt nur show und pick auf.
import { questClean, questFold } from "./clean.js";
import { fmt } from "../seed32/seed32.js";

function int(v, lo, hi) { return Number.isInteger(v) && v >= lo && v <= hi; }
function distinct(a) { return new Set(a).size === a.length; }
export function copyPub(p) { return structuredClone(p); }

/** Ist v eine Antwort, die der Bildschirm auf prompt p geben konnte? (alt turns.js okAnswer, nur die Arten hier) */
export function okAnswer(p, v, pub, now, L) {
  if (p.w === "show") return v === 0;
  if (p.w === "slide") return int(v, p.min || 0, p.maxOf ? p.maxOf(pub) : p.max);
  if (p.w === "list") {
    if (!Array.isArray(v) || v.length !== p.n) return false;
    if (p.bytes && new TextEncoder().encode(v.join("")).length > p.bytes) return false; // das ganze Spiel muss in den Link passen
    return v.every((x) => typeof x === "string" && !!questClean(x, p.max) && questClean(x, p.max) === x) && (p.same || distinct(v.map(questFold)));
  }
  if (p.w === "pick") { const n = p.from(pub, now, "de", L).length; return Array.isArray(v) && v.length === 1 && int(v[0], 0, n - 1); }
  return false;
}
function toAnswer(p, input) {
  if (p.w === "show") return input.t === "ok" && Object.keys(input).length === 2 ? 0 : undefined;
  if (p.w === "pick") return input.t === "pick" ? [input.v] : undefined;
  if (p.w === "slide") return input.t === "guess" ? input.v : undefined;
  if (p.w === "list") return input.t === "list" && Array.isArray(input.v) ? input.v.slice() : undefined;
  return undefined;
}

/**
 * @param {object} manifest
 * @param {{setup:(params:object, seed:string)=>object, game:(pub:object)=>({turns:object[][], result:(pub, lang, X)=>({h:string, lines:string[], note?:string})}|null),
 *          texts:object, title?:(pub, lang, X)=>string}} spec
 */
export function makeCard(manifest, spec) {
  const X = (lang) => spec.texts[lang] || spec.texts.de;
  function at(pub) {
    const g = spec.game(pub);
    if (!g) return { g: null, prompt: null, t: -1 };
    const t = pub.m.length;
    if (t >= g.turns.length) return { g, prompt: null, t };
    return { g, prompt: g.turns[t][pub.now.length], t };
  }
  function status(state) {
    const p = state.pub, { g, t } = at(p);
    if (!g) return { over: false, turn: -1, reveal: false, score: [], winner: -1 };
    const over = t >= g.turns.length;
    return { over, turn: over ? -1 : t % 2, reveal: false, score: [], winner: -1 };
  }
  function moves(obs, seat) {
    const p = obs.pub, { prompt, t } = at(p);
    if (!prompt || t % 2 !== seat) return [];
    if (prompt.w === "show") return [{ t: "ok", seat }];
    if (prompt.w === "pick") return prompt.from(p, p.now, "de", X("de")).map((x, k) => ({ t: "pick", seat, v: k }));
    return [];
  }
  function accepts(obs, seat, input) {
    const p = obs.pub, { prompt, t } = at(p);
    if (!prompt || t % 2 !== seat || !input || input.seat !== seat) return false;
    const v = toAnswer(prompt, input);
    return v !== undefined && okAnswer(prompt, v, p, p.now, X("de"));
  }
  return {
    manifest,
    init({ rng, params }) { return { pub: { ...spec.setup(params, rng), m: [], now: [] }, priv: [null, null] }; },
    step(state, input) {
      const p = copyPub(state.pub), { g, prompt, t } = at(p);
      if (!g) throw new Error("ungueltig: kein Paket");
      if (!prompt) throw new Error("ungueltig: Partie vorbei");
      if (!input || input.seat !== t % 2) throw new Error("ungueltig: nicht am Zug");
      const v = toAnswer(prompt, input);
      if (v === undefined || !okAnswer(prompt, v, p, p.now, X("de"))) throw new Error("ungueltig: " + prompt.w);
      p.now.push(v);
      if (p.now.length === g.turns[t].length) { p.m.push(p.now); p.now = []; }
      return { pub: p, priv: state.priv.slice() };
    },
    observe(state) { return { pub: copyPub(state.pub), mine: null }; },
    status, moves, accepts,
    /** Ergebnis (nur wenn vorbei), für Tests und die Ansicht. */
    result(pub, lang) { const { g, t } = at(pub); return g && t >= g.turns.length ? g.result(pub, lang, X(lang)) : null; },
    view(obs, seat, ctx) {
      const lang = ctx.lang === "en" ? "en" : "de", L = X(lang), p = obs.pub, { g, prompt, t } = at(p), kids = [];
      if (spec.title) kids.push({ t: "text", role: "label", text: spec.title(p, lang, L) });
      if (ctx.preview) { kids.push({ t: "text", role: "body", text: manifest.howto[lang], part: "regeln" }); return { t: "stack", children: kids }; }
      if (!g) { kids.push({ t: "text", role: "body", text: L.pk_need }); return { t: "stack", children: kids }; }
      if (!prompt) {
        const r = g.result(p, lang, L);
        if (r.h) kids.push({ t: "text", role: "big", text: r.h });
        for (const line of r.lines) kids.push({ t: "text", role: "body", text: line });
        if (r.note) kids.push({ t: "text", role: "small", text: r.note });
        return { t: "stack", children: kids };
      }
      if (t % 2 !== seat) return { t: "stack", children: kids };
      const now = p.now;
      if (prompt.title && prompt.w !== "slide") kids.push({ t: "text", role: "label", text: prompt.title(p, now, lang, L) });
      if (prompt.peek) { const s = prompt.peek(p, now, lang, L); if (s) kids.push({ t: "text", role: "title", text: s }); }
      if (prompt.top) kids.push({ t: "text", role: "title", text: prompt.top(p, now, lang, L) });
      if (prompt.w === "show") {
        for (const s of prompt.list(p, now, lang, L)) kids.push({ t: "text", role: "body", text: s });
        for (const s of (prompt.notes ? prompt.notes(p, now, lang, L) : []).filter(Boolean)) kids.push({ t: "text", role: "small", text: s });
        if (prompt.later) kids.push({ t: "text", role: "small", text: L[prompt.later] });
        kids.push({ t: "choice", label: L[prompt.l], options: [{ label: L.next, input: { t: "ok", seat } }] });
      } else if (prompt.w === "pick") {
        kids.push({ t: "choice", label: L[prompt.l], options: prompt.from(p, now, lang, L).map((s, k) => ({ label: s, input: { t: "pick", seat, v: k } })) });
      } else if (prompt.w === "slide") {
        // Primitiv "slide" liefert Strang F; bis dahin fällt der Knoten im Renderer weg (offen, kein Ersatz-Knopf).
        const max = prompt.maxOf ? prompt.maxOf(p) : prompt.max;
        kids.push({ t: "slide", label: prompt.title ? prompt.title(p, now, lang, L) : L[prompt.l], hint: L[prompt.l], min: prompt.min || 0, max, step: prompt.step || 1,
          value: prompt.defOf ? prompt.defOf(p) : prompt.min || 0, format: prompt.money ? "eur" : "int", unit: prompt.unit ? prompt.unit(p) : "", less: L.sl_less, more: L.sl_more,
          input: { t: "guess", seat }, field: "v" });
      } else if (prompt.w === "list") {
        // Primitiv "text"/"list" (Freitext) liefert Strang F.
        kids.push({ t: "list", label: L[prompt.l], n: prompt.n, max: prompt.max, input: { t: "list", seat }, field: "v" });
      }
      return { t: "stack", children: kids };
    }
  };
}
export { fmt };
