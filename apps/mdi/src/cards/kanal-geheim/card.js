// Geheimer Kanal und Varianten kanal-link, -drei, -kennst, -staffel, -erfinder (alt Katalog kind quest, alt:src/quest.js,
// Oberflaeche alt:src/modes.js:300-363) sowie raum-tunnel (alt:src/turns.js:600-617, eingeklappt in kanal-geheim).
// Quest: Sitz 0 schreibt 1-3 Raetsel mit Antwort und einen Schluss in einen Entwurf; prepare() versiegelt synchron (Antworten
// gehen nie ins Log, das im Link reist). Sitz 1 schliesst Schloss fuer Schloss auf; step entschluesselt synchron. Nach zwei
// Fehlversuchen kommt der Tipp (erster Buchstabe, Laenge). Gesperrter Inhalt (Filter) wird nicht gezeigt.
// Tunnel: ein gemeinsames Wort ergibt 26 Braille-Zeichen (gleiches Wort, gleiche Zeichen); nichts geht durch die App.
import manifest from "./manifest.json" with { type: "json" };
import data from "./data.json" with { type: "json" };
import { clean, fold, cleanDraft, complete, MAX_Q, MAX_A, MAX_STOPS, BLOB, sealSync, openSync } from "../../engines/quest/quest.js";
import { hash32, mulberry32 } from "../../engines/poster/doc.js";

const T = (lang) => data.texts[lang] || data.texts.de;
function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, (m, k) => String(o[k])); }

// ---------- raum-tunnel: alt glyphs ----------
const DOTS = [1, 8, 2, 16, 4, 32, 64, 128];
export function glyphs(word) {
  const r = mulberry32(hash32("tunnel|" + fold(word))), seen = {}, out = [];
  for (let i = 0; i < 26; i++) {
    let g;
    do { g = 0; DOTS.forEach((d) => { if (r() < 0.5) g |= d; }); } while (seen[g] || g === 0 || g === 255 || (g & 15) === 0 || (g & 240) === 0);
    seen[g] = 1; out.push(String.fromCharCode(0x2800 + g));
  }
  return out;
}
const oneWord = (s) => { const c = clean(s, 14); return c && !/\s/.test(c) ? c : ""; };

/** Entwurf -> Altformat {stops:[{q,a}], end} */
export function draftOf(d) {
  const n = Math.max(1, Math.min(MAX_STOPS, (d && d.n) || 1)), stops = [];
  for (let i = 0; i < n; i++) stops.push({ q: (d && d["q" + i]) || "", a: (d && d["a" + i]) || "" });
  return { stops, end: (d && d.end) || "" };
}

const api = {
  manifest,
  init({ params }) { return { pub: { mode: params.mode, e: params.e, riddles: params.riddles.slice(0, MAX_STOPS), lock: null, k: 0, q: "", h: "", miss: 0, end: null, word: null }, priv: [null, null] }; },
  /** Versiegeln ohne Zufall im Vertrag: Nonce aus seed und Inhalt (quest.js sealSync). */
  prepare(draft, { seed, seat }) {
    if (seat !== 0) throw new Error("prepare: nur Sitz 0");
    const s = sealSync(draftOf(draft), seed);
    if (!s) throw new Error("prepare: unvollstaendig");
    return { t: "seal", seat: 0, a: s };
  },
  accepts(obs, seat, x) {
    const p = obs.pub;
    if (p.mode === "tunnel") return p.word === null && x.t === "word" && typeof x.a === "string" && oneWord(x.a) === x.a;
    if (!p.lock) return seat === 0 && x.t === "seal" && !!x.a && typeof x.a.q0 === "string" && Array.isArray(x.a.c);
    return seat === 1 && p.end === null && x.t === "answer" && typeof x.a === "string" && Array.from(x.a).length <= MAX_A;
  },
  step(state, x) {
    const p = { ...state.pub };
    if (p.mode === "tunnel") {
      if (!api.accepts({ pub: p }, x.seat, x)) throw new Error("ungueltig: word");
      p.word = x.a;
    } else if (!p.lock) {
      const a = x.a || {}, q0 = clean(a.q0, MAX_Q), c = (Array.isArray(a.c) ? a.c : []).filter((b) => typeof b === "string" && BLOB.test(b)).slice(0, MAX_STOPS);
      if (x.t !== "seal" || x.seat !== 0 || !q0 || !c.length || c.length !== (a.c || []).length) throw new Error("ungueltig: seal");
      p.lock = { q0, h0: clean(a.h0, 6), c }; p.q = q0; p.h = p.lock.h0;
    } else {
      if (x.t !== "answer" || x.seat !== 1 || p.end !== null) throw new Error("ungueltig: answer");
      const r = openSync(p.lock.c[p.k], x.a);
      if (!r) p.miss += 1;
      else if (r.blocked) p.end = { ok: false, text: "" };
      else { p.miss = 0; p.k += 1; if (r.e) p.end = { ok: true, text: r.e }; else { p.q = r.q; p.h = r.h; } }
    }
    return { pub: p, priv: state.priv.slice() };
  },
  observe(state) { return { pub: state.pub, mine: null }; },
  status(state) {
    const p = state.pub;
    if (p.mode === "tunnel") return { over: p.word !== null, turn: p.word !== null ? -1 : 0, reveal: false, score: [], winner: -1, local: true };
    const over = p.end !== null;
    return { over, turn: over ? -1 : p.lock ? 1 : 0, reveal: false, score: [], winner: -1, local: true, turnNo: p.lock ? p.k + 1 : 0, turns: p.lock ? p.lock.c.length : 0 };
  },
  moves() { return []; },
  view(obs, seat, ctx = {}) {
    const p = obs.pub, lang = ctx.lang || "de", X = T(lang), d = ctx.draft || {};
    if (p.mode === "tunnel") {
      if (p.word === null) return { t: "stack", children: [
        { t: "field", key: "w", label: X.tunWord, value: d.w || "", max: 14, mode: "name" },
        { t: "go", label: X.tunGo, input: { t: "word", seat: 0, a: oneWord(d.w) }, disabled: !oneWord(d.w), why: X.tunWord }
      ] };
      const g = glyphs(p.word), lines = [];
      for (let i = 0; i < 26; i += 2) lines.push(String.fromCharCode(65 + i) + " " + g[i] + "    " + String.fromCharCode(66 + i) + " " + g[i + 1]);
      return { t: "stack", children: [{ t: "text", role: "title", text: X.tunH }, ...lines.map((l) => ({ t: "text", role: "big", text: l })), { t: "text", role: "small", text: X.tunNote }] };
    }
    if (!p.lock) {
      if (seat !== 0) return { t: "text", role: "body", text: X.need };
      const pre = (i) => (lang === "en" && data.riddlesEn[ctx.variant || "kanal-geheim"] ? data.riddlesEn[ctx.variant || "kanal-geheim"][i] : p.riddles[i]) || "";
      const n = Math.max(1, Math.min(MAX_STOPS, d.n || p.riddles.length || 1)), kids = [{ t: "text", role: "big", text: p.e }];
      for (let i = 0; i < n; i++) {
        const q = d["q" + i] !== undefined ? d["q" + i] : pre(i);
        kids.push({ t: "field", key: "q" + i, label: fmt(X.q, { n: i + 1 }), value: q, max: MAX_Q, mode: "text", hint: d["q" + i] && !clean(d["q" + i], MAX_Q) ? X.blocked : undefined });
        kids.push({ t: "field", key: "a" + i, label: X.a, value: d["a" + i] || "", max: MAX_A, mode: "text", hint: d["a" + i] && !clean(d["a" + i], MAX_A) ? X.blocked : undefined });
      }
      const opts = [];
      if (n < MAX_STOPS) opts.push({ label: "＋ " + X.add, draft: { ...d, n: n + 1 } });
      if (n > 1) opts.push({ label: "－ " + X.del, draft: { ...d, n: n - 1 } });
      if (opts.length) kids.push({ t: "choice", label: X.q.replace(" {n}", ""), options: opts });
      const endDef = (data.ends[ctx.variant || "kanal-geheim"] || [X.endDef, X.endDef])[lang === "en" ? 1 : 0];
      kids.push({ t: "field", key: "end", label: X.end, value: d.end !== undefined ? d.end : endDef, max: MAX_Q, mode: "text", multiline: true });
      kids.push({ t: "text", role: "small", text: X.note });
      const full = { ...d, n }; for (let i = 0; i < n; i++) if (full["q" + i] === undefined) full["q" + i] = pre(i);
      if (full.end === undefined) full.end = endDef;
      const ok = complete(cleanDraft(draftOf(full)));
      kids.push({ t: "go", label: X.lock, prepare: true, draft: full, disabled: !ok, why: X.need });
      return { t: "stack", children: kids };
    }
    if (p.end !== null) return { t: "stack", children: [
      { t: "text", role: "big", text: p.end.ok ? "🎉" : "🚫" },
      ...(p.end.ok ? [{ t: "text", role: "label", text: X.open }] : []),
      { t: "text", role: "title", text: p.end.ok ? p.end.text : X.gone }
    ] };
    if (seat !== 1) return { t: "stack", children: [{ t: "text", role: "body", text: X.you }, { t: "text", role: "small", text: X.sees }] };
    const m = /^(.+?)(\d+)$/.exec(p.h || ""), tip = p.miss >= 2 && m ? fmt(X.tip, { l: m[1], n: m[2] }) : p.miss ? X.wrong : "";
    return { t: "stack", children: [
      { t: "text", role: "big", text: p.e },
      { t: "text", role: "label", text: fmt(X.step, { n: p.k + 1, m: p.lock.c.length }) },
      { t: "text", role: "title", text: p.q },
      { t: "field", key: "ans", label: X.ans, value: d.ans || "", max: MAX_A, mode: "text" },
      ...(tip ? [{ t: "text", role: "small", text: tip, live: true }] : []),
      { t: "go", label: X.try, input: { t: "answer", seat: 1, a: d.ans || "" }, disabled: !(d.ans || "").trim(), why: X.ans }
    ] };
  }
};
export default api;
