// Server-Docs der freien Karte und des Decks: bereinigen, pruefen, auf eine Karte des Neuentwurfs abbilden (Strang K).
// Ein Doc kommt vom Server (POST /api/duell/ai kind karte: options[{art, doc, ki}], GET /api/duell/deck) im Format der alten
// App (lib/duell-karte.mjs compose, gegen deren sanitizeDoc geprueft). Hier wird es wie ein fremder Link behandelt: nur
// bekannte Felder, feste Laengen, nichts wird erfunden (A4). Altcode (Untergrenze): create-ui.js artOk/kindOk/preview/lines,
// daily.js sanitizeDoc/sanitizeKi/sanitizeStickers.
//
// Abbildung auf Karten (Kartenvertrag): card/meme -> Karte "frei" (src/cards/frei); game -> "flug", lauf -> "lauf" (Strang L);
// quiz -> "zug-abfragen" (Strang S, Fragepaket); faehigkeit -> die Katalogkarte doc.i (Z1/Z2). Jede Zielkarte bringt ihren
// eigenen Adapter mit: `fromFree(doc) -> params | null` am Kartenmodul (und `toFree(params) -> doc` fuer Robot/Verfeinern).
// Fehlt die Karte oder ihr Adapter, sagt die Seite das ehrlich (frei_missing); es entsteht nie still eine andere Karte.

export const ARTS = ["card", "meme", "game", "quiz", "faehigkeit"];
export const GENRES = ["G1", "G2"];
/** Wer spielt? je Genre (Altcode MODES): allein immer, Duell per Link (Geist bzw. Punkte), kein Bot, kein Live */
export const MODES = { G1: { allein: true, bot: false, duell: true }, G2: { allein: true, bot: false, duell: true } };
/** Was die freie Karte noch nicht baut, mit den naechsten Katalogkarten oder einem Genre (Altcode SOON) */
export const SOON = [["strategie", ["zug-bluff", "zug-steine"]], ["schieben", ["zug-steine"]], ["rennen", "G1"], ["brett", ["tisch-skat"]], ["schaetzen", ["quiz-preis"]], ["bluff", ["zug-luege", "zug-bluff"]], ["skala", []]];
export const CARD_STYLES = ["druck", "zettel", "stempel", "neon", "herz", "advent"];
export const PHOTO_STYLES = ["poster", "sticker", "meme", "glitch"];
/** Die Farbpaare der alten App (Server PAIRS), Index = palette */
export const PAIRS = [["#ffd400", "#ff3b1d"], ["#2b4bff", "#ffe600"], ["#ff4fa3", "#0a7f55"], ["#14c872", "#ff3da5"], ["#ff6a1f", "#1b2bd8"], ["#c8ff00", "#7a1fff"], ["#ffffff", "#ff2d2d"], ["#7ee0ff", "#ff5a1f"]];
/** Namen der Paare in der Karte "frei" (Parameter palette) */
export const PAIR_NAMES = ["gelb", "blau", "pink", "gruen", "orange", "lime", "weiss", "himmel"];
export const CARD_STICKERS = ["🐸", "🦆", "🐙", "🦝", "🐌", "🦖", "🐶", "🐱", "🦄", "🐝", "🍕", "🌮", "🍩", "🥨", "🍟", "🧃", "🍪", "🎂", "🚀", "🛸", "👽", "🪐", "🌟", "☄️", "💥", "🔥", "🌀", "⚡",
  "🎄", "⭐", "🎁", "❄️", "⛄", "🦌", "🔔", "🕯️", "✨", "🧦", "☃️", "💛", "🌻", "🫶", "🌈", "☀️", "🌙", "🌸", "🍀", "🎉", "🎈", "🥳", "⚽", "🎸", "🎮", "📚", "💪", "🏖️"];
const KINDS = ["card", "photo", "game", "lauf", "turn", "duel"];
const HEX = /^#[0-9a-f]{6}$/i, ID = /^[a-z0-9-]{1,32}$/;
const KIND_OF = { card: "card", meme: "photo", game: "game", quiz: "turn", lauf: "lauf" };

/** Text wie die alte App (cleanInput): keine Steuer- und Formatzeichen, keine spitzen Klammern, gekuerzt nach Zeichen. */
export function txt(v, max) {
  if (typeof v !== "string") return "";
  const s = v.normalize("NFC").replace(/[\p{Cc}\p{Cf}<>]/gu, " ").replace(/\s+/g, " ").trim();
  return [...s].slice(0, max).join("").trim();
}
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const r3 = (v, lo, hi, d) => Math.round(num(v, lo, hi, d) * 1000) / 1000;
/** Ein Emoji (Graphem) aus einer festen Grundmenge: Bilderzeichen, Variationsselektor, ZWJ */
export function emoji(e) { const s = typeof e === "string" ? e : ""; return /^[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}‍️\u{1F3FB}-\u{1F3FF}]{1,12}$/u.test(s) ? s : ""; }

export function sanitizeKi(o) {
  if (!o || typeof o !== "object" || typeof o.k !== "string" || !/^[a-z]{2,12}$/.test(o.k)) return null;
  const r = { k: o.k };
  if (typeof o.s === "string" && /^[A-Za-z0-9._~-]{8,200}$/.test(o.s)) r.s = o.s;
  if (r.s && typeof o.h === "string" && /^[A-Za-z0-9_-]{43}$/.test(o.h)) r.h = o.h;
  if (r.s && typeof o.o === "string" && /^[A-Za-z0-9_-]{22}$/.test(o.o)) r.o = o.o;
  return r;
}
function stickers(a) {
  return (Array.isArray(a) ? a : []).slice(0, 8).map((s) => (s && typeof s === "object" && emoji(s.e) ? { e: s.e, x: r3(s.x, 0, 1, 0.5), y: r3(s.y, 0, 1, 0.5), r: r3(s.r, -3.14, 3.14, 0), z: r3(s.z, 0.5, 2.5, 1) } : null)).filter(Boolean);
}
function pack(pk) {
  if (!pk || typeof pk !== "object" || !Array.isArray(pk.q)) return null;
  const q = pk.q.slice(0, 12).map((x) => (Array.isArray(x) && x.length >= 3 ? x.slice(0, 5).map((s) => txt(s, 130)) : null)).filter((x) => x && x.every(Boolean));
  return q.length >= 3 ? { t: txt(pk.t, 44), q } : null;
}
// Spiel und Lauf: die Zielkarte (Strang L) bereinigt ihre Parameter selbst und streng; hier bleibt eine flache, begrenzte
// Kopie fuer die Vorschau und fuer deren fromFree (nur JSON-Werte, Tiefe <= 4, <= 4 KB).
function plain(v, depth = 0) {
  if (depth > 4) return undefined;
  if (v === null || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") return txt(v, 60);
  if (Array.isArray(v)) return v.slice(0, 24).map((x) => plain(x, depth + 1)).filter((x) => x !== undefined);
  if (typeof v === "object") { const o = {}; for (const k of Object.keys(v).slice(0, 40)) if (/^[A-Za-z][A-Za-z0-9]{0,15}$/.test(k)) { const x = plain(v[k], depth + 1); if (x !== undefined) o[k] = x; } return o; }
  return undefined;
}

/** Bereinigt ein Server-Doc. -> Doc | null */
export function sanitizeDoc(o) {
  if (!o || typeof o !== "object" || !KINDS.includes(o.k)) return null;
  const d = { k: o.k, col: Array.isArray(o.col) && o.col.length === 2 && HEX.test(o.col[0]) && HEX.test(o.col[1]) ? [o.col[0].toLowerCase(), o.col[1].toLowerCase()] : ["#ffd400", "#ff3b1d"] };
  if (typeof o.i === "string" && ID.test(o.i)) d.i = o.i;
  const t = txt(o.t, 40), s = txt(o.s, 70);
  if (t) d.t = t; if (s) d.s = s;
  const ki = sanitizeKi(o.ki); if (ki) d.ki = ki;
  if (typeof o.fr === "string" && /^[A-Za-z0-9_-]{22}$/.test(o.fr)) d.fr = o.fr;
  if (Number.isSafeInteger(o.seed) && o.seed >= 0) d.seed = o.seed;
  if (o.k === "card") { d.x = txt(o.x, 90); d.st = CARD_STYLES.includes(o.st) ? o.st : "druck"; d.sk = stickers(o.sk); }
  else if (o.k === "photo") { d.x = txt(o.x, 28); d.y = txt(o.y, 28); d.st = PHOTO_STYLES.includes(o.st) ? o.st : "poster"; d.sk = stickers(o.sk); }
  else if (o.k === "turn" || o.k === "duel") {
    const w = txt(o.w, 40); if (w) d.w = w;
    if (typeof o.g === "string" && ID.test(o.g)) d.g = o.g;
    const p = pack(o.pk); if (p) d.pk = p;
    if (!d.i && !d.pk) return null;
  } else if (o.k === "game") {
    if (!o.g || typeof o.g !== "object") return null;
    d.g = plain(o.g);
    if (JSON.stringify(d.g).length > 4096) return null;
  } else if (o.k === "lauf") {
    if (!o.l || typeof o.l !== "object") return null;
    d.l = plain(o.l);
    if (JSON.stringify(d.l).length > 4096) return null;
  }
  return d;
}

/** Was zurueckkam, muss das Gefragte sein (Kategorie und Art), sonst verworfen und zurueckgegeben (Altcode artOk/kindOk). */
export function artOk(asked, art) { return art === asked || (asked === "game" && art === "lauf"); }
export function kindOk(art, doc) {
  if (!doc) return false;
  if (art === "faehigkeit") return (doc.k === "turn" || doc.k === "duel") && !!doc.i;
  if (art === "quiz") return doc.k === "turn" && !!doc.pk;
  return doc.k === KIND_OF[art];
}

/** Die id einer freien Karte fuer Status-Gate und Deck: die Wurzel eines Remix (fr), sonst h.slice(0, 22) des Siegels. */
export function freeIdOf(doc) {
  if (!doc) return "";
  if (typeof doc.fr === "string" && /^[A-Za-z0-9_-]{22}$/.test(doc.fr)) return doc.fr;
  return doc.ki && doc.ki.k === "karte" && typeof doc.ki.h === "string" && /^[A-Za-z0-9_-]{43}$/.test(doc.ki.h) ? doc.ki.h.slice(0, 22) : "";
}

// WCAG-Kontrast zweier #rrggbb
export function contrast(a, b) {
  const L = (h) => { const v = [1, 3, 5].map((i) => { const c = parseInt(h.substr(i, 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** Naechstes Paar der Designsprache (Tokens) zu einem Farbpaar der alten App: Grundflaeche nach Helligkeit/Rotanteil. */
export function fillOf(col) {
  const h = Array.isArray(col) && HEX.test(col[0]) ? col[0] : "#ffd400";
  const r = parseInt(h.substr(1, 2), 16), g = parseInt(h.substr(3, 2), 16), b = parseInt(h.substr(5, 2), 16);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (lum < 90) return "ink";
  if (r > 200 && g < 140) return "red";
  if (lum > 225 && b > 180) return "paper";
  return "yellow";
}

/** Karte "frei" aus einem Doc der Art card/photo (Parameter wie src/cards/frei/manifest.json) */
export function freiParams(doc) {
  const pal = PAIR_NAMES[Math.max(0, PAIRS.findIndex((p) => p[0] === doc.col[0] && p[1] === doc.col[1]))];
  const base = { kind: doc.k === "photo" ? "meme" : "card", title: doc.t || "", text: doc.k === "card" ? doc.x || "" : "", top: doc.k === "photo" ? doc.x || "" : "", bottom: doc.k === "photo" ? doc.y || "" : "",
    style: doc.st, palette: pal, stickers: [...new Set((doc.sk || []).map((s) => s.e).filter((e) => CARD_STICKERS.includes(e)))].slice(0, 6),
    seal: doc.ki && doc.ki.s ? doc.ki.s : "", hash: doc.ki && doc.ki.h ? doc.ki.h : "", owner: doc.ki && doc.ki.o ? doc.ki.o : "", root: doc.fr || "" };
  return base;
}
/** Umkehrung fuer Robot/Verfeinern: Parameter der Karte "frei" -> Doc (base), wie der Server es liest (freeDoc/sanitizeDoc). */
export function freiDoc(p) {
  const col = PAIRS[Math.max(0, PAIR_NAMES.indexOf(p.palette))];
  const sk = (p.stickers || []).map((e, i) => ({ e, x: [0.13, 0.87, 0.13, 0.87, 0.08, 0.92][i % 6], y: [0.12, 0.12, 0.88, 0.88, 0.5, 0.5][i % 6], r: 0, z: 1 }));
  const ki = p.seal ? { k: "karte", s: p.seal, ...(p.hash ? { h: p.hash } : {}), ...(p.owner ? { o: p.owner } : {}) } : undefined;
  const d = p.kind === "meme" ? { k: "photo", t: p.title, x: p.top, y: p.bottom, st: PHOTO_STYLES.includes(p.style) ? p.style : "meme", col: col.slice(), sk, by: [] }
    : { k: "card", t: p.title, x: p.text, st: CARD_STYLES.includes(p.style) ? p.style : "druck", col: col.slice(), sk, by: [] };
  if (ki) d.ki = ki;
  if (p.root) d.fr = p.root;
  return d;
}

/** Die Zielkarte eines Docs im Kartenvertrag. cardOf: Kartenregister. -> {cardId, params} | {missing: name} */
export function targetOf(doc, cardOf) {
  if (!doc) return { missing: "?" };
  if (doc.k === "card" || doc.k === "photo") return { cardId: "frei", params: freiParams(doc) };
  const id = doc.k === "game" ? "flug" : doc.k === "lauf" ? "lauf" : doc.pk ? "zug-abfragen" : doc.i || "?";
  const card = cardOf(id);
  if (!card || typeof card.fromFree !== "function") return { missing: id };
  let params = null;
  try { params = card.fromFree(doc); } catch (e) { params = null; }
  return params ? { cardId: card.manifest.id, params } : { missing: id };
}

/** Kurzbeschreibung fuer die Vorschau (Altcode lines/preview): Titel, Zeilen, Sticker, Fotohinweis. */
export function previewOf(doc) {
  const sk = (doc.sk || []).map((s) => s.e);
  if (doc.k === "card") return { title: doc.t || "", lines: [doc.x || ""], sk, photo: false };
  if (doc.k === "photo") return { title: doc.t || "", lines: [doc.x || "", doc.y || ""], sk, photo: true };
  if (doc.k === "game") { const g = doc.g || {}; return { title: [g.emoji, g.title || doc.t].filter(Boolean).join(" "), lines: [(Array.isArray(g.route) ? g.route : []).map((r) => r && r.e).filter(Boolean).join(" → ")], sk: [], photo: false, kind: "game" }; }
  if (doc.k === "lauf") { const l = doc.l || {}; return { title: [l.e, doc.t].filter(Boolean).join(" "), lines: [l.m === "ziel" ? "ziel" : "endlos", [l.o, l.c, l.f].filter(Boolean).join(" ")], sk: [], photo: false, kind: "lauf" }; }
  if (doc.pk) return { title: doc.pk.t || doc.t || "", lines: [doc.pk.q[0][0]], sk: [], photo: false, kind: "quiz", n: doc.pk.q.length };
  return { title: doc.t || "", lines: [doc.s || ""], sk: [], photo: false, kind: "faehigkeit", uses: doc.i };
}

// ---- Inhalt einer geteilten freien Karte (Status-Gate) ------------------------------------------------------------------
// Byte fuer Byte dieselbe Projektion wie der Server (CADS-DEMO-wrapper lib/duell-deck.mjs gateView, fix/deck-status-hash):
// nur, was eine Person sieht. gateHash = base64url(SHA-256(canonical(gateView(doc)))). Feste Vektoren in test/frei.test.js.
export function gateView(doc) {
  const d = doc && typeof doc === "object" ? doc : {}, s = (x) => (typeof x === "string" ? x : "");
  const sk = [...new Set((Array.isArray(d.sk) ? d.sk : []).map((x) => s(x && x.e)).filter(Boolean))].slice(0, 6);
  const v = { k: s(d.k), t: s(d.t), col: Array.isArray(d.col) ? d.col.map((c) => s(c).toLowerCase()) : [] };
  if (d.k === "card") Object.assign(v, { x: s(d.x), st: s(d.st), sk });
  else if (d.k === "photo") Object.assign(v, { x: s(d.x), y: s(d.y), st: s(d.st), sk });
  else if (d.k === "game") { const g = d.g && typeof d.g === "object" ? d.g : {}; v.g = { title: s(g.title), emoji: s(g.emoji), theme: s(g.theme), route: (Array.isArray(g.route) ? g.route : []).map((r) => [s(r && r.p), s(r && r.t), s(r && r.e)]) }; }
  else if (d.k === "lauf") { const l = d.l && typeof d.l === "object" ? d.l : {}; v.l = [s(l.m), s(l.w), s(l.e), s(l.o), s(l.c), s(l.f)]; }
  else { v.i = s(d.i); v.s = s(d.s); v.w = s(d.w); v.pk = d.pk && typeof d.pk === "object" ? { t: s(d.pk.t), q: Array.isArray(d.pk.q) ? d.pk.q.map((q) => (Array.isArray(q) ? q.map(s) : [])) : [] } : null; }
  return v;
}
/** Was das Gate fragt: [{cid, doc|null}] – eine Karte mit eigenem Siegel (ki.h) mit ihrem Inhalt, ein Remix (fr) nur per id. */
export function gateChecksOf(doc) {
  if (!doc) return [];
  const out = [];
  if (doc.ki && doc.ki.k === "karte" && typeof doc.ki.h === "string" && /^[A-Za-z0-9_-]{43}$/.test(doc.ki.h)) out.push({ cid: doc.ki.h.slice(0, 22), doc });
  if (typeof doc.fr === "string" && /^[A-Za-z0-9_-]{22}$/.test(doc.fr) && !out.some((c) => c.cid === doc.fr)) out.push({ cid: doc.fr, doc: null });
  return out;
}
