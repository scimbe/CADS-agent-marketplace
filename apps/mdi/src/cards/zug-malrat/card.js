// Zugkarte "Mal & Rat" (Altkarte zug-malrat, Regeln in src/engines/malrat/malrat.js). Zwei Sitze malen abwechselnd:
// Sitz 0 malt das erste Bild (Runde 1), wer am Zug ist, raet das letzte Bild (lokal, kein Zug) und schickt sein
// Gegenbild mit den Sekunden des Ratens. Ein Zug ist nur das Bild { t:"draw", seat, k, h, l, s, sec, r } – das Wort
// steht nie im Zustand, nur sein Pruefwert. Ohne Ende (wie im Altcode), bis Runde 999.
// Tagesmodus: params.day > 0 ist der Tag (Tage seit 1970, alt: Tn.today()) und damit der Seed der Wortvorschlaege; die
// Karte hat keine Uhr, den Tag setzt der Host. Sonst ein Seed aus dem Partie-Seed (gameSeed).
// Die Zeichenflaeche, das Abspielen und das Raten (Pruefwert, Tipps) sind Oberflaeche von Strang F; diese Karte
// beschreibt sie als Anzeige-Knoten "draw" und "strokes" und liefert die reinen Hilfen unten (draftInput, tryGuess, …).
import manifest from "./manifest.json" with { type: "json" };
import * as M from "../../engines/malrat/malrat.js";
import { gameSeed, form, fmt } from "../../engines/seed32/seed32.js";
import { strokeItems } from "./strokes.js";

const KEYS = ["h", "k", "l", "r", "s", "sec", "seat", "t"].sort();
function X(lang) { return M.DATA.text[lang] || M.DATA.text.de; }
function say(lang, k, n, o) { return fmt(form(X(lang), k, n, lang), Object.assign({ n }, o || {})); }
function copyPic(p) { return p ? { k: p.k, h: p.h, l: p.l, s: p.s, sec: p.sec, r: p.r } : null; }
function copy(pub) { return { seed: pub.seed, day: pub.day, n: pub.n, pic: copyPic(pub.pic) }; }
function turnOf(pub) { return pub.n % 2; }
function overOf(pub) { return !!pub.pic && pub.pic.r >= M.MAX_ROUND; }
function picOf(input) { return { k: input.k, h: input.h, l: input.l, s: input.s, sec: input.sec, r: input.r }; }
function wellFormed(input) { return !!input && typeof input === "object" && Object.keys(input).sort().join(",") === KEYS.join(",") && input.t === "draw"; }

/** Gueltiger Zug fuer diesen Sitz? (angefragter Hook accepts; moves() kann Bilder nicht aufzaehlen) */
export function accepts(obs, seat, input) {
  const p = obs.pub;
  return wellFormed(input) && !overOf(p) && input.seat === seat && seat === turnOf(p) && M.valid(picOf(input), p.pic);
}

// ---------- Hilfen fuer die Oberflaeche (lokal, nie im Zustand) ----------
/** Runde des Bildes, das der Sitz am Zug als naechstes malt. */
export function roundOf(obs) { return M.nextRound(obs.pub.pic); }
/** Die drei Wortvorschlaege fuer das naechste Bild. */
export function words(obs, lang) { return M.suggest(obs.pub.seed, roundOf(obs), lang); }
/**
 * Zug aus Wort, Sprache, rohen Strichen (Punkte 0..1) und Ratesekunden; null, wenn das Wort nicht gemalt werden darf,
 * nichts gemalt ist oder das Bild selbst in der groebsten Packung nicht passt (nie abschneiden).
 * fits: Platzpruefung des Links (Standard: hoechstens 600 Zeichen Striche).
 */
export function draftInput(obs, seat, { word, lang, lines, secs = 0, fits }) {
  const r = roundOf(obs);
  const list = words(obs, lang).map((s) => s.w);
  const w = list.includes(word) ? word : M.own(word);
  if (!w || !Array.isArray(lines) || !lines.length) return null;
  const p = M.pack(lines, fits);
  if (!p) return null;
  const pic = M.picture(M.check(w, obs.pub.seed, r), w, lang, p.s, obs.pub.pic ? Math.max(0, Math.min(M.MAX_SECS, secs)) : 0, r);
  return { t: "draw", seat, ...pic };
}
/** Rateversuch gegen das letzte Bild: { ok, word } (ok false und word "" bei gefiltertem Versuch). */
export function tryGuess(obs, text) {
  const g = M.guess(text), pic = obs.pub.pic;
  if (!g || !pic) return { ok: false, word: "" };
  return { ok: M.right(g, pic, obs.pub.seed), word: g };
}
/** Listenwort hinter dem letzten Bild (fuer Tipps), sonst null. */
export function known(obs) { return obs.pub.pic ? M.find(obs.pub.pic, obs.pub.seed) : null; }
/** Tipps in Reihenfolge als Texte, mit den aufgedeckten Positionen. */
export function hints(obs, lang, knownWord) {
  const pic = obs.pub.pic, lines = M.decode(pic.s), h = M.hintParts(pic.h), T = X(lang);
  return M.hintSteps(pic, knownWord, obs.pub.seed).map((s) => ({
    ...s,
    text: s.t === "cat" ? fmt(T.mr_h_cat, { c: T["mr_cat_" + s.cat] }) : s.t === "col" ? fmt(T.mr_h_col, { c: colours(M.used(lines), lang) })
      : s.t === "first" ? fmt(T.mr_h_first, { l: h.first }) : s.t === "bank" ? T.mr_h_bank : T.mr_h_letter,
    bank: s.t === "bank" && knownWord ? M.bank(knownWord.w, obs.pub.seed, pic.r) : undefined
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

export default {
  manifest,
  init({ rng, params }) {
    const day = params.day | 0;
    return { pub: { seed: day > 0 ? String(day) : gameSeed(rng), day, n: 0, pic: null }, priv: [null, null] };
  },
  step(state, input) {
    const pub = copy(state.pub);
    if (!accepts({ pub }, input && input.seat, input)) throw new Error("ungueltig: draw");
    pub.pic = picOf(input);
    pub.n += 1;
    return { pub, priv: state.priv.slice() };
  },
  observe(state) { return { pub: copy(state.pub), mine: null }; },
  status(state) {
    const p = state.pub, over = overOf(p);
    return { over, turn: over ? -1 : turnOf(p), reveal: false, score: [], winner: -1 };
  },
  moves() { return []; },
  accepts,
  view(obs, seat, ctx) {
    const lang = ctx.lang === "en" ? "en" : "de", T = X(lang), p = obs.pub, kids = [];
    if (ctx.preview) {
      kids.push({ t: "text", role: "body", text: manifest.howto[lang] });
      return { t: "stack", children: kids };
    }
    const mine = seat === turnOf(p) && !overOf(p), f = face(p, lang);
    if (p.pic) {
      const lines = M.decode(p.pic.s), st = strokeItems(lines);
      kids.push({ t: "text", role: "title", text: f[0] });
      kids.push({ t: "text", role: "label", text: f[1] });
      if (f[2]) kids.push({ t: "text", role: "small", text: f[2] });
      // Abspielen der Zeichnung (Strang F, Canvas): Anzeige-Knoten mit allen Strichen und dem Text fuer Screenreader
      kids.push({ t: "strokes", part: "malen", play: mine, ...st, a11y: fmt(T.mr_pic, { s: say(lang, "mr_strokes", lines.length), c: colours(M.used(lines), lang) }) });
      if (mine) kids.push({ t: "text", role: "body", text: T.mr_l_guess });
    } else if (mine) kids.push({ t: "text", role: "label", text: T.mr_l_draw });
    if (mine) {
      const w = words(obs, lang);
      kids.push({ t: "text", role: "label", text: T.mr_word });
      kids.push({ t: "row", wrap: true, children: w.map((s) => ({ t: "text", role: "body", text: T["mr_lvl_" + s.lvl] + ": " + s.w })) });
      kids.push({ t: "text", role: "small", text: T.mr_secret });
      // Zeichenflaeche (Strang F): Woerter, eigenes Wort, Farben, Breiten, Platz im Link; Ergebnis ueber draftInput
      kids.push({ t: "draw", part: "malen", round: roundOf(obs), lang, maxw: M.MAXW, maxChars: M.MAX_CHARS, grid: M.GRID,
        words: w.map((s) => ({ w: s.w, lvl: s.lvl, label: T["mr_lvl_" + s.lvl] })), own: T.mr_own,
        colors: M.COLORS.map((c, i) => ({ i, name: T["mr_c_" + i], color: c })), widths: M.WIDTHS.map((x, i) => ({ i, name: T["mr_s_" + i], width: x })),
        a11y: T.mr_canvas });
    } else if (!overOf(p) && p.pic) kids.push({ t: "text", role: "body", text: T.mr_ready });
    return { t: "stack", children: kids };
  }
};
