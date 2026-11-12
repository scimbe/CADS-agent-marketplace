// Beat fuer Strassenrap (PR #227: src/rapbeat.js Regel GAMES.rapbeat, src/rapbeat-ui.js Schritt und Kartenbild,
// src/rapbeat.json Texte). Ein Zug = [Stil, BPM, Tonart, Stimmung, Variante]; zwei Zuege (dein Beat, Antwort-Beat), der Link
// traegt beide (hoechstens zehn kleine Zahlen; #227 hielt per snap nur den letzten, das Ergebnis ist dasselbe). Klang, Schleifen, Aufnahme-Modus und WAV macht der Renderer mit
// src/engines/klang/rapbeat.js aus genau diesen fuenf Zahlen (audio-Quelle kind "rapbeat").
import manifest from "./manifest.json" with { type: "json" };
import data from "./data.json" with { type: "json" };
import { STYLES, MOODS, KEYS, SEEDS, ok, fresh, params, range, phrase, dice, fileName } from "../../engines/klang/rapbeat-rule.js";
import { record } from "../../engines/poster/compile.js";

const T = (lang) => data.text[lang] || data.text.de;
function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, (m, k) => (o[k] != null ? o[k] : "")); }
export function keyName(i, lang) { return String(T(lang).rb_keys || KEYS.join("|")).split("|")[i] || KEYS[i]; }
/** Im DOM „Nr. 1234“ statt „#1234“ (sonst liest die Pruefung der Anzeigeliste es als Farbwert); im Bild wie #227. */
export function labelDom(v, lang) { return label(v, lang).replace(/#(\d+)$/, "Nr. $1"); }
export function label(v, lang) { const X = T(lang), p = params(v); return fmt(X.rb_line, { s: X["rb_s_" + p.style.id], n: p.bpm, k: keyName(p.key, lang), m: X["rb_m_" + MOODS[p.mood]], v: p.seed }); }
const LOOP_IDS = ["hook", "verse", "song"];

// Kartenbild aus #227 (rapbeat-ui.js game.pic): Titel, Schlagzeug-Raster ueber zwei Takte, Zeile mit den Einstellungen
const P = { ink: "#0E0E10", hot: "#F2C230", red: "#E0442B", grey: "#8A8A93", cream: "#F4F1EA" };
export function picture(v, title, lang) {
  const W = 540, H = 675, ph = phrase(params(v));
  return record(W, H, (c, block) => {
    c.fillStyle = P.ink; c.fillRect(0, 0, W, H);
    block(title, W * 0.07, H * 0.05, W * 0.86, H * 0.2, P.cream, null);
    const x0 = W * 0.08, w = W * 0.84, y0 = H * 0.36, rh = H * 0.075, rows = [["kick", P.red], ["snare", P.hot], ["hat", P.cream], ["bass", P.grey]];
    rows.forEach((row, k) => {
      const y = y0 + k * rh * 1.25; c.fillStyle = "rgba(255,255,255,.06)"; c.fillRect(x0, y, w, rh);
      (ph[row[0]] || []).forEach((e) => {
        const x = x0 + (e.b / 8) * w, bw = row[0] === "bass" ? Math.max(w / 64, (e.len || 0.25) / 8 * w - 2) : Math.max(2, w / 80);
        c.fillStyle = row[1]; c.globalAlpha = 0.45 + 0.55 * Math.min(1, e.v || 1); c.fillRect(x, y + rh * 0.15, bw, rh * 0.7);
      });
      c.globalAlpha = 1;
    });
    c.fillStyle = "rgba(255,255,255,.25)"; for (let b = 1; b < 8; b++) c.fillRect(x0 + b / 8 * w, y0 - 4, 1, rh * 5);
    c.font = "800 " + Math.round(W * 0.045) + "px system-ui, sans-serif"; c.fillStyle = P.hot; c.textAlign = "center"; c.textBaseline = "top";
    c.fillText(label(v, lang), W / 2, H * 0.84);
  });
}
function canvas(v, lang) {
  const pic = picture(v, manifest.title[lang] || manifest.title.de, lang);
  return { t: "canvas", w: pic.w, h: pic.h, ratio: "4:5", ops2d: pic.ops, src: {}, a11y: labelDom(v, lang) };
}

const api = {
  manifest,
  init({ rng }) { return { pub: { seed: rng.u32() % SEEDS, v: null, n: 0 }, priv: [null, null] }; },
  accepts(obs, seat, x) { return x.t === "beat" && ok(x.a) && obs.pub.n < 2 && seat === obs.pub.n % 2; },
  step(state, x) {
    if (x.t !== "beat" || !ok(x.a) || state.pub.n >= 2 || x.seat !== state.pub.n % 2) throw new Error("ungueltig: beat");
    return { pub: { ...state.pub, v: x.a.slice(), n: state.pub.n + 1 }, priv: state.priv.slice() };
  },
  observe(state) { return { pub: state.pub, mine: null }; },
  // #227: zwei Zuege, ends() nie vorher; das Ergebnis ist der letzte Beat
  status(state) { const n = state.pub.n; return { over: n >= 2, turn: n >= 2 ? -1 : n % 2, reveal: false, score: [], winner: -1, turnNo: n + 1, turns: 2 }; },
  moves(obs, seat) { const p = obs.pub; return p.n < 2 && seat === p.n % 2 ? [{ t: "beat", seat, a: p.v ? p.v.slice() : fresh(0, p.seed) }] : []; },
  view(obs, seat, ctx = {}) {
    const p = obs.pub, lang = ctx.lang || "de", X = T(lang), d = ctx.draft || {};
    const over = p.n >= 2;
    if (over || seat !== p.n % 2) {
      const v = p.v || fresh(0, p.seed);
      return { t: "stack", children: [
        canvas(v, lang),
        { t: "text", role: "label", text: labelDom(v, lang) },
        { t: "audio", src: { kind: "rapbeat", v, loop: "hook", rec: false }, label: "▶ " + X.rb_play, stop: "■ " + X.rb_stop, save: { label: "⬇ " + X.rb_wav, name: fileName(v, lang) } },
        { t: "text", role: "small", text: X.rb_note }
      ] };
    }
    const v = d.v && ok(d.v) ? d.v : p.v ? p.v.slice() : fresh(0, p.seed), loop = LOOP_IDS.includes(d.loop) ? d.loop : "hook", rec = d.rec === true;
    const set = (i, x) => { const n = v.slice(); n[i] = x; return { ...d, v: n }; };
    const r = range(v[0]);
    return { t: "stack", children: [
      { t: "text", role: "title", text: X.rb_l },
      canvas(v, lang),
      { t: "choice", label: X.rb_style_h, wrap: true, options: STYLES.map((s, i) => ({ label: X["rb_s_" + s.id] + " · " + s.lo + "–" + s.hi + " BPM", on: v[0] === i, draft: { ...d, v: [i, v[1] >= s.lo && v[1] <= s.hi ? v[1] : s.bpm, v[2], v[3], v[4]] } })) },
      { t: "audio", src: { kind: "rapbeat", v, loop, rec }, label: "▶ " + (rec ? X.rb_play_rec : X.rb_play), stop: "■ " + X.rb_stop, wait: X.rb_wait_n, fail: X.rb_fail, nosound: X.rb_nosound, go: rec ? X.rb_rec_go : labelDom(v, lang) },
      { t: "slide", id: "bpm", label: X.rb_tempo_h, min: r[0], max: r[1], step: 1, unit: "BPM", value: v[1], draftKey: "v.1", draft: set(1, v[1]) },
      { t: "choice", label: X.rb_key_h, wrap: true, options: KEYS.map((k, i) => ({ label: fmt(X.rb_minor, { k: keyName(i, lang) }), on: v[2] === i, draft: set(2, i) })) },
      { t: "choice", label: X.rb_mood_h, options: MOODS.map((m, i) => ({ label: X["rb_m_" + m], on: v[3] === i, draft: set(3, i) })) },
      { t: "choice", label: X.rb_var_h + " Nr. " + v[4], options: [{ label: "🎲 " + X.rb_dice, draft: set(4, dice(v[4])) }] },
      { t: "choice", label: X.rb_loop_h, options: LOOP_IDS.map((l) => ({ label: X["rb_" + l], on: loop === l, disabled: rec, draft: { ...d, v, loop: l } })) },
      { t: "choice", label: X.rb_rec, options: [{ label: X.rb_rec, on: rec, draft: { ...d, v, rec: !rec } }] },
      { t: "audio", src: { kind: "rapbeat", v, loop: "song", rec }, label: "⬇ " + X.rb_wav, save: { label: "⬇ " + X.rb_wav, name: fileName(v, lang), only: true }, wait: X.rb_wav_n, done: X.rb_wav_done },
      { t: "text", role: "small", text: X.rb_n1 + " " + X.rb_n2 },
      { t: "go", label: X.rb_send, input: { t: "beat", seat, a: v } }
    ] };
  }
};
export default api;
