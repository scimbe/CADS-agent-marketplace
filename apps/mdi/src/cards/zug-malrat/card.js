// Zugkarte "Mal & Rat" (Altkarte zug-malrat, Regeln in src/engines/malrat/malrat.js). Zwei Sitze malen abwechselnd:
// Sitz 0 malt das erste Bild (Runde 1), wer am Zug ist, raet das letzte Bild (lokal, kein Zug) und schickt sein
// Gegenbild mit den Sekunden des Ratens. Ohne Ende wie im Altcode, bis Runde 999 (MAX_ROUND).
//
// Ein Zug ist nur das fertige Bild im Altformat { t:"draw", seat, k, h, l, s, sec, r, d } – das Wort steht nie im
// Zustand, nur sein Pruefwert k. d ist der UTC-Tag, den der Host stempelt (manifest.inputDay, ADR 0001 f).
// Tagesmodus wie im Altcode immer an (alt game.daily, turn-ui.js:747): Seed der Partie ist der Tag des ersten Bildes
// (pub.day), damit sehen alle an diesem Tag dieselben drei Woerter je Runde.
//
// Snapshot-Karte (manifest.link.snap, wie alt "snap"): der Link haelt nur das neueste Bild. compact() macht daraus einen
// Wiederherstellungszug: Sitz 0 setzt das Bild auf einem leeren Stand (ohne vorheriges Bild ist jede Runde 1..999
// erlaubt, alt ok()), wer danach am Zug ist, folgt aus der Runde (pic.r % 2).
//
// Vom Widget zum Zug: das draw-Widget (ADR 0001 c) liefert a = Striche in 0..1000, Wort/Sprache/Ratezeit liegen im
// Entwurf (ctx.draft, bleibt auf dem Geraet). prepare() rechnet daraus einmal beim Schicken das Altbild: Douglas-Peucker
// und 64er Raster ueber pack() (feinste Toleranz, die in 600 Zeichen passt) und den Pruefwert (PBKDF2, ~250 ms, synchron).
// So stehen in Log, Link und Live nur die Altkodierung, nie die Rohpunkte und nie das Wort.
import manifest from "./manifest.json" with { type: "json" };
import * as M from "../../engines/malrat/malrat.js";
import { form, fmt } from "../../engines/seed32/seed32.js";
import { strokeItems } from "./strokes.js";
import { canon } from "../../contract/sdk.js";

const KEYS = ["d", "h", "k", "l", "r", "s", "sec", "seat", "t"].sort();
const MAX_DAY = 1000000, MAX_PTS = 2000;
function X(lang) { return M.DATA.text[lang] || M.DATA.text.de; }
function say(lang, k, n, o) { return fmt(form(X(lang), k, n, lang), Object.assign({ n }, o || {})); }
function copyPic(p) { return p ? { k: p.k, h: p.h, l: p.l, s: p.s, sec: p.sec, r: p.r } : null; }
function copy(pub) { return { day: pub.day, pic: copyPic(pub.pic) }; }
function seedOf(pub) { return String(pub.day); }
function turnOf(pub) { return pub.pic ? pub.pic.r % 2 : 0; }
function overOf(pub) { return !!pub.pic && pub.pic.r >= M.MAX_ROUND; }
function picOf(input) { return { k: input.k, h: input.h, l: input.l, s: input.s, sec: input.sec, r: input.r }; }
function wellFormed(input) {
  return !!input && typeof input === "object" && !Array.isArray(input) && Object.keys(input).sort().join(",") === KEYS.join(",") &&
    input.t === "draw" && Number.isInteger(input.d) && input.d >= 1 && input.d <= MAX_DAY;
}

/** Gueltiger Zug fuer diesen Sitz? (Hook accepts, ADR 0001 f; Bilder lassen sich nicht aufzaehlen) */
export function accepts(obs, seat, input) {
  const p = obs.pub;
  return wellFormed(input) && !overOf(p) && input.seat === seat && seat === turnOf(p) && M.valid(picOf(input), p.pic);
}

// ---------- Snapshot (ADR 0001 f: compact/merge, rein und deterministisch) ----------
/** Log -> ein Wiederherstellungszug mit dem neuesten Bild. Mit state: aus dessen pub (nach merge). */
export function compact(log, state) {
  if (state && state.pub) return state.pub.pic ? [{ t: "draw", seat: 0, ...copyPic(state.pub.pic), d: state.pub.day }] : [];
  if (!Array.isArray(log) || !log.length) return [];
  const last = log[log.length - 1];
  return [{ t: "draw", seat: 0, k: last.k, h: last.h, l: last.l, s: last.s, sec: last.sec, r: last.r, d: log[0].d }];
}
function bad(why) { const e = new Error("merge: " + why); e.code = "manipuliert"; return e; }
const PIC_KEYS = ["h", "k", "l", "r", "s", "sec"].join(",");
/** Ein Stand aus einem Link: genau die Felder eines Bildes, Form wie M.valid, Tag 1..1000000 (oder leer: day 0, pic null). */
function checkPub(pub, who) {
  if (!pub || typeof pub !== "object" || Array.isArray(pub) || Object.keys(pub).sort().join(",") !== "day,pic") throw bad(who + ": Form");
  if (pub.pic === null) { if (pub.day !== 0) throw bad(who + ": Tag ohne Bild"); return; }
  const v = pub.pic;
  if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).sort().join(",") !== PIC_KEYS || !M.valid(v, null)) throw bad(who + ": Bild");
  if (!Number.isInteger(pub.day) || pub.day < 1 || pub.day > MAX_DAY) throw bad(who + ": Tag");
}
/**
 * Eigener Stand und eingehender Stand (ADR 0001 f): der eingehende wird vollstaendig geprueft und muss dieselbe Partie
 * (denselben Tag) fortsetzen. Das neuere Bild gilt (hoehere Runde); gleiche Runde mit gleichem Bild = eigener Stand,
 * gleiche Runde mit anderem Bild ist ein Konflikt und wird abgelehnt (nie still eins waehlen).
 */
export function merge(mine, theirs) {
  checkPub(theirs, "eingehend");
  checkPub(mine, "eigen");
  const a = mine.pic, b = theirs.pic;
  if (!a) return copy(theirs);
  if (!b) return copy(mine);
  if (theirs.day !== mine.day) throw bad("anderer Tag");
  if (b.r > a.r) return copy(theirs);
  if (b.r === a.r && canon(b) !== canon(a)) throw bad("anderes Bild in derselben Runde");
  return copy(mine);
}

// ---------- Hilfen fuer die Oberflaeche (lokal, nie im Zustand) ----------
/** Runde des Bildes, das der Sitz am Zug als naechstes malt. */
export function roundOf(obs) { return M.nextRound(obs.pub.pic); }
/** Seed fuer das naechste Bild: Tag der Partie, vor dem ersten Bild der heutige Tag (ctx.today). */
function nextSeed(obs, today) { return obs.pub.pic ? seedOf(obs.pub) : Number.isInteger(today) ? String(today) : null; }
/** Die drei Wortvorschlaege fuer das naechste Bild (null ohne Tag). */
export function words(obs, lang, today) { const s = nextSeed(obs, today); return s === null ? null : M.suggest(s, roundOf(obs), lang); }
/** Striche des draw-Widgets ([[farbe, breite, [x,y,…] | [[x,y],…]], …] in 0..1000) -> Linien in 0..1, oder null. */
export function linesOf(a) {
  if (!Array.isArray(a) || !a.length || a.length > M.MAX_LINES) return null;
  const out = []; let n = 0;
  for (const st of a) {
    if (!Array.isArray(st) || st.length !== 3) return null;
    const [c, w, raw] = st;
    if (!Number.isInteger(c) || c < 0 || c >= M.COLORS.length || !Number.isInteger(w) || w < 0 || w >= M.WIDTHS.length || !Array.isArray(raw) || !raw.length) return null;
    const flat = Array.isArray(raw[0]) ? raw.flat() : raw;
    if (flat.length % 2 || !flat.every((v) => Number.isInteger(v) && v >= 0 && v <= 1000)) return null;
    const p = []; for (let i = 0; i < flat.length; i += 2) p.push([flat[i] / 1000, flat[i + 1] / 1000]);
    n += p.length; if (n > MAX_PTS) return null;
    out.push({ c, w, p });
  }
  return out;
}
/**
 * Zug aus Wort, Sprache, Linien (0..1) und Ratesekunden; null, wenn das Wort nicht gemalt werden darf, nichts gemalt
 * ist oder das Bild selbst in der groebsten Packung nicht passt (nie abschneiden). seed: Seed des naechsten Bildes.
 */
export function draftInput(obs, seat, { word, lang, lines, secs = 0, fits, seed }) {
  const r = roundOf(obs), sd = seed !== undefined ? seed : obs.pub.pic ? seedOf(obs.pub) : null;
  if (sd === null) return null;
  const w = M.suggest(sd, r, lang).map((s) => s.w).includes(word) ? word : M.own(word);
  if (!w || !Array.isArray(lines) || !lines.length) return null;
  const p = M.pack(lines, fits);
  if (!p) return null;
  const pic = M.picture(M.check(w, sd, r), w, lang, p.s, obs.pub.pic ? Math.max(0, Math.min(M.MAX_SECS, secs | 0)) : 0, r);
  return { t: "draw", seat, ...pic };
}
/**
 * Widget-Eingabe {t:"draw", seat, a} + Entwurf {w, l, sec} -> fertiger Zug ohne d (den stempelt der Host), oder null.
 * Angefragter Host-Hook (Strang F): lokal vor applyMine, damit Rohpunkte und Wort das Geraet nie verlassen.
 */
export function prepare(obs, seat, input, ctx = {}) {
  if (!input || input.t !== "draw" || input.seat !== seat) return null;
  const d = ctx.draft || {}, lang = d.l === "en" || d.l === "de" ? d.l : ctx.lang === "en" ? "en" : "de";
  const lines = linesOf(input.a), seed = nextSeed(obs, ctx.today);
  if (!lines || seed === null || typeof d.w !== "string") return null;
  return draftInput(obs, seat, { word: d.w, lang, lines, secs: Number.isInteger(d.sec) ? d.sec : 0, seed });
}
/** Rateversuch gegen das letzte Bild: { ok, word } (ok false und word "" bei gefiltertem Versuch). */
export function tryGuess(obs, text) {
  const g = M.guess(text), pic = obs.pub.pic;
  if (!g || !pic) return { ok: false, word: "" };
  return { ok: M.right(g, pic, seedOf(obs.pub)), word: g };
}
/** Listenwort hinter dem letzten Bild (fuer Tipps), sonst null. */
export function known(obs) { return obs.pub.pic ? M.find(obs.pub.pic, seedOf(obs.pub)) : null; }
/** Tipps in Reihenfolge als Texte, mit den aufgedeckten Positionen. */
export function hints(obs, lang, knownWord) {
  const pic = obs.pub.pic, lines = M.decode(pic.s), h = M.hintParts(pic.h), T = X(lang);
  return M.hintSteps(pic, knownWord, seedOf(obs.pub)).map((s) => ({
    ...s,
    text: s.t === "cat" ? fmt(T.mr_h_cat, { c: T["mr_cat_" + s.cat] }) : s.t === "col" ? fmt(T.mr_h_col, { c: colours(M.used(lines), lang) })
      : s.t === "first" ? fmt(T.mr_h_first, { l: h.first }) : s.t === "bank" ? T.mr_h_bank : T.mr_h_letter,
    bank: s.t === "bank" && knownWord ? M.bank(knownWord.w, seedOf(obs.pub), pic.r) : undefined
  }));
}
function colours(list, lang) {
  const T = X(lang), names = list.map((c) => T["mr_c_" + c]);
  // wie Intl.ListFormat "conjunction" (de: "a, b und c"; en-GB: "a, b and c"), ohne Intl (Harness)
  if (names.length < 2) return names.join("");
  return names.slice(0, -1).join(", ") + (lang === "en" ? " and " : " und ") + names[names.length - 1];
}
/** Kurzfassung des letzten Bildes (alt: game.face): Ueberschrift, Laenge + Striche, Rueckmeldung zum vorigen Bild. */
export function face(pub, lang) {
  const v = pub.pic; if (!v) return null;
  const T = X(lang), out = [T.mr_face_h, fmt(T.mr_face_len, { n: M.hintParts(v.h).n, s: say(lang, "mr_strokes", M.decode(v.s).length) })];
  if (v.r > 1) out.push(v.sec ? say(lang, "mr_face_back", v.sec) : T.mr_face_miss);
  return out;
}
// Feste Skizze fuer den Hinweiszug (moves): ein Rahmen und eine Diagonale
const SKETCH = [{ c: 0, w: 1, p: [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.2, 0.2]] }, { c: 5, w: 0, p: [[0.2, 0.8], [0.8, 0.2]] }];

// ---------- Anzeige ----------
function guessPart(obs, lang, d, kids) {
  const T = X(lang), p = obs.pub, h = M.hintParts(p.pic.h), tried = typeof d.tried === "string" && d.tried ? tryGuess(obs, d.tried) : null;
  const k = known(obs), steps = hints(obs, lang, k), shown = Math.max(0, Math.min(steps.length, d.tips | 0));
  kids.push({ t: "field", key: "guess", label: T.mr_guess_h, value: typeof d.guess === "string" ? d.guess : "", max: 24, mode: "text", hint: fmt(T.mr_len, { n: h.n }) });
  // Treffer zeigt das Listenwort, sonst den Versuch in der Schreibung des Hinweises (alt malrat-ui.js:237)
  const solved = tried && tried.ok ? (k ? k.w : h.first + M.letters(M.spelt(tried.word, h.n)).slice(1).join("").toLowerCase()) : "";
  if (tried) kids.push({ t: "text", role: "label", text: tried.ok ? say(lang, "mr_right", Number.isInteger(d.sec) ? d.sec : 0, { w: solved }) : tried.word ? fmt(T.mr_wrong, { w: tried.word }) : T.mr_bad });
  for (const s of steps.slice(0, shown)) {
    kids.push({ t: "text", role: "small", text: s.text });
    if (s.bank) kids.push({ t: "row", wrap: true, children: s.bank.map((l) => ({ t: "tile", fill: "paper", ink: "ink", value: l, a11y: fmt(T.mr_letter, { l }) })) });
  }
  if (d.gave) kids.push({ t: "text", role: "body", text: k ? fmt(T.mr_was, { w: k.w }) : T.mr_secret_was });
  const opts = [{ label: T.mr_try, draft: { ...d, tried: typeof d.guess === "string" ? d.guess : "" } }];
  opts.push(shown < steps.length ? { label: T.mr_more, draft: { ...d, tips: shown + 1 } } : { label: T.mr_h_none, draft: d, disabled: true });
  if (!d.gave) opts.push({ label: T.mr_give, draft: { ...d, gave: true } });
  if (tried && tried.ok || d.gave) opts.push({ label: T.mr_back, draft: { ...d, back: true } });
  kids.push({ t: "choice", label: T.mr_guess_h, options: opts });
}
function drawPart(obs, seat, lang, d, today, kids) {
  const T = X(lang), w = words(obs, lang, today);
  if (!w) return;
  if (typeof d.w !== "string") {
    kids.push({ t: "text", role: "label", text: obs.pub.pic ? T.mr_back : T.mr_l_draw });
    kids.push({ t: "choice", label: T.mr_word, wrap: true, options: w.map((s) => ({ label: T["mr_lvl_" + s.lvl] + ": " + s.w, draft: { ...d, w: s.w, l: lang } })).concat([{ label: T.mr_own, draft: { ...d, own: "" } }]) });
    if (typeof d.own === "string") {
      const ok = M.own(d.own);
      kids.push({ t: "field", key: "own", label: T.mr_own, value: d.own, max: M.MAXW, mode: "text", hint: T.mr_own_ph });
      kids.push({ t: "choice", label: ok ? T.mr_own : d.own ? T.mr_own_bad : T.mr_own_ph, options: [{ label: T.mr_open, draft: { ...d, w: ok, l: lang }, disabled: !ok }] });
    }
    kids.push({ t: "text", role: "small", text: T.mr_secret });
    return;
  }
  kids.push({ t: "text", role: "label", text: fmt(T.mr_draw_h, { w: d.w }) });
  kids.push({ t: "text", role: "small", text: T.mr_secret });
  kids.push({ t: "draw", id: "bild", part: "malen", label: T.mr_canvas, hint: T.mr_n1, maxPts: MAX_PTS, maxChars: M.MAX_CHARS,
    colors: M.COLORS.map((c, i) => ({ i, name: T["mr_c_" + i], color: c })), widths: M.WIDTHS.map((x, i) => ({ i, name: T["mr_s_" + i], width: x })),
    undo: T.mr_undo, empty: T.mr_empty, full: T.mr_full, submit: { t: "draw", seat }, confirm: T.mr_send });
}

export default {
  manifest,
  init() { return { pub: { day: 0, pic: null }, priv: [null, null] }; },
  step(state, input) {
    const pub = copy(state.pub);
    if (!accepts({ pub }, input && input.seat, input)) throw new Error("ungueltig: draw");
    if (!pub.pic) pub.day = input.d; // erstes Bild (oder Wiederherstellung): sein Tag ist der Seed der Partie
    pub.pic = picOf(input);
    return { pub, priv: state.priv.slice() };
  },
  observe(state) { return { pub: copy(state.pub), mine: null }; },
  status(state) {
    const p = state.pub, over = overOf(p);
    // endless: im Altcode endet Mal & Rat nie von selbst (nur die Rundengrenze 999); Treiber pruefen Hin und Rueck statt over
    return { over, endless: true, turn: over ? -1 : turnOf(p), reveal: false, score: [], winner: -1, turnNo: p.pic ? p.pic.r : 0 };
  },
  // Hinweiszug: das erste Wort der naechsten Runde mit einer festen Skizze. Vor dem ersten Bild kennt die Karte den Tag
  // nicht (den stempelt der Host erst mit dem Zug), also gibt es dort keinen Hinweis.
  moves(obs, seat) {
    const p = obs.pub;
    if (!p.pic || overOf(p) || seat !== turnOf(p)) return [];
    const r = roundOf(obs), w = M.suggest(seedOf(p), r, "de")[0].w, inp = draftInput(obs, seat, { word: w, lang: "de", lines: SKETCH, secs: 0 });
    return inp ? [{ ...inp, d: p.day }] : [];
  },
  // Erster Zug einer inputDay-Karte fuer einen gegebenen Tag (bei F angefragter Hook fuer Treiber ohne Uhr): erstes Wort
  // der Runde 1 mit der festen Skizze; der Pruefwert braucht den Tagesseed, den moves() vor dem ersten Bild nicht kennt.
  opening(seat, today) {
    if (seat !== 0 || !Number.isInteger(today) || today < 1 || today > MAX_DAY) return null;
    const obs = { pub: { day: today, pic: null } }, w = M.suggest(String(today), 1, "de")[0].w;
    const inp = draftInput(obs, 0, { word: w, lang: "de", lines: SKETCH, secs: 0, seed: String(today) });
    return inp ? { ...inp, d: today } : null;
  },
  accepts, compact, merge, prepare,
  view(obs, seat, ctx) {
    const lang = ctx.lang === "en" ? "en" : "de", T = X(lang), p = obs.pub, kids = [], d = ctx.draft && typeof ctx.draft === "object" ? ctx.draft : {};
    if (ctx.preview) return { t: "stack", children: [{ t: "text", role: "body", text: manifest.howto[lang] }] };
    const mine = seat === turnOf(p) && !overOf(p), f = face(p, lang);
    if (p.pic) {
      const lines = M.decode(p.pic.s), st = strokeItems(lines);
      kids.push({ t: "text", role: "title", text: f[0] });
      kids.push({ t: "text", role: "label", text: f[1] });
      if (f[2]) kids.push({ t: "text", role: "small", text: f[2] });
      kids.push({ t: "text", role: "small", text: T["mr_lang_" + M.langOf(p.pic.l)] });
      // Abspielen der Zeichnung Strich fuer Strich (ADR 0001 c, strokes), Text fuer Screenreader
      kids.push({ t: "strokes", id: "zeichnung", part: "malen", play: mine, again: T.mr_again, playing: T.mr_playing, ...st,
        a11y: fmt(T.mr_pic, { s: say(lang, "mr_strokes", lines.length), c: colours(M.used(lines), lang) }) });
    }
    if (mine) {
      if (p.pic && !d.back) guessPart(obs, lang, d, kids);
      else drawPart(obs, seat, lang, d, ctx.today, kids);
    } else if (!overOf(p) && p.pic) kids.push({ t: "text", role: "body", text: T.mr_ready });
    return { t: "stack", children: kids };
  }
};
