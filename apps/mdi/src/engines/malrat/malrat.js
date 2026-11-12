// Mal & Rat (zug-malrat): Regeln und Daten der Altkarte, exakt portiert (alt:src/malrat.js, malrat.json).
// Einer malt ein Wort, die andere Person sieht die Zeichnung Strich fuer Strich und raet es; wer es erraten hat, malt
// zurueck. Ein Bild ist nur das Bild:  { k: Pruefwert, h: Hinweis, l: Sprache, s: Striche, sec: Sekunden, r: Runde }
//   k    PBKDF2-SHA-256 ueber das gefaltete Wort (fold), Salz "malrat|<seed>|<runde>", 30000 Runden, 64 Bit als
//        11 base64url-Zeichen. Das Wort selbst steht nie im Link.
//   h    Anfangsbuchstabe und Laenge ("K5"), l 0 Deutsch, 1 Englisch (die Sprache, in der das Wort gewaehlt wurde)
//   s    base64url, "." zwischen zwei Strichen; je Strich ein Zeichen fuer Farbe und Breite (Farbe * 3 + Breite), dann
//        die Punkte, je zwei Zeichen (x, y im 64er Raster), vereinfacht (Douglas-Peucker) und gerundet; hoechstens 600
//   sec  wie schnell das letzte Bild erraten wurde (0: nicht erraten oder das erste Bild)
//   r    1 fuer das erste Bild, je zurueckgemaltem Bild eins mehr (das Salz wechselt mit)
// Die angebotenen Woerter kommen aus dem Seed (im Tagesmodus dem Tag) und der Runde: alle sehen dieselben drei.
// Der Pruefwert wird synchron in reinem JS berechnet (HMAC ueber sha256 des SDK), bitgleich zu WebCrypto PBKDF2.
import DATA from "./malrat.json" with { type: "json" };
import { sha256 } from "../../contract/sdk.js";
import { seeded } from "../seed32/seed32.js";
import { cleanInput, questFold } from "./filter.js";

export { DATA };
export const ITER = 30000, GRID = 64, MAXW = 16, MAX_LINES = 80, MAX_CHARS = 600, MAX_SECS = 3600, MAX_ROUND = 999;
const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
// Farben und Breiten der Stifte; Breiten als Anteil an der Bildseite. Die Farbwerte gehoeren zur Zeichnung (Daten des
// Bildes, wie im Altcode), nicht zur Oberflaeche.
export const COLORS = ["#1a1a1a", "#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa", "#6d4c41"], WIDTHS = [0.014, 0.032, 0.07];
// Douglas-Peucker-Toleranzen in Rasterzellen, feinste zuerst: ein Bild bekommt die feinste, die noch in den Link passt.
export const EPS = [0.45, 0.8, 1.3, 2];
const LINES = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/, CHECK = /^[A-Za-z0-9_-]{11}$/, HINT = /^(\p{L})(\d{1,2})$/u;
export const CATS = Object.keys(DATA.words);

function intIn(v, a, b) { return Number.isInteger(v) && v >= a && v <= b; }
function rnd(tag) { return seeded("malrat|" + tag); }

// ---------- Woerter ----------
// Jedes Wort einmal: { de, en, cat, lvl } (Stufen 0 leicht, 1 mittel, 2 schwer).
export const ALL = [];
for (const c of CATS) DATA.words[c].forEach((list, lvl) => { for (const p of list) { const x = p.split("|"); ALL.push({ de: x[0], en: x[1], cat: c, lvl }); } });
export function langOf(i) { return i ? "en" : "de"; }
/** Drei Woerter zum Malen, je eins pro Stufe: auf jedem Geraet gleich fuer diesen Seed und diese Runde. */
export function suggest(seed, round, lang) {
  return [0, 1, 2].map((lvl) => {
    const l = ALL.filter((e) => e.lvl === lvl), e = l[Math.floor(rnd(seed + "|" + round + "|" + lvl)() * l.length)];
    return { w: e[lang] || e.de, cat: e.cat, lvl };
  });
}
/** Gefaltet wie der Pruefwert es sieht: Quest.fold (Gross/klein, ä wie a, ß wie ss); ae/oe/ue zaehlen wie ä/ö/ü. */
export function fold(w) { return questFold(w).replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u"); }
function upper(ch) { const u = ch.toUpperCase(); return Array.from(u).length === 1 ? u : ch; }
export function letters(w) { return Array.from(String(w).trim()).map(upper); }
/** Ein eigenes Wort: ein Wort, nur Buchstaben, durch den Wortfilter; "" wenn es nicht gemalt werden darf. */
export function own(s) {
  const w = String(s == null ? "" : s).trim(), c = cleanInput(w, MAXW);
  return c && c === w && /^\p{L}+$/u.test(c) && letters(c).length >= 2 && fold(c).length >= 2 ? c : "";
}
/** Ein Rateversuch, wie er verglichen wird: durch denselben Filter; "" wenn der Filter ihn herausnimmt. */
export function guess(s) { return cleanInput(s, 24); }
export function hintOf(w) { const a = letters(w); return a.length ? a[0] + a.length : ""; }
export function hintParts(h) { const m = HINT.exec(String(h)); return m ? { first: m[1], n: +m[2] } : null; }

// ---------- Pruefwert: PBKDF2-HMAC-SHA-256, synchron ----------
function hexBytes(hex) { const out = new Uint8Array(hex.length / 2); for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16); return out; }
function cat(a, b) { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; }
function hmacKey(key) {
  let k = key.length > 64 ? hexBytes(sha256(key)) : key;
  const ip = new Uint8Array(64), op = new Uint8Array(64);
  for (let i = 0; i < 64; i++) { const b = i < k.length ? k[i] : 0; ip[i] = b ^ 0x36; op[i] = b ^ 0x5c; }
  return (msg) => hexBytes(sha256(cat(op, hexBytes(sha256(cat(ip, msg))))));
}
/** PBKDF2-HMAC-SHA-256 (RFC 8018) ueber Bytes; liefert die ersten bytes Byte. */
export function pbkdf2(password, salt, iter, bytes) {
  const mac = hmacKey(password), out = new Uint8Array(bytes);
  for (let block = 1, off = 0; off < bytes; block++, off += 32) {
    let u = mac(cat(salt, new Uint8Array([block >>> 24, (block >>> 16) & 255, (block >>> 8) & 255, block & 255])));
    const t = u.slice();
    for (let i = 1; i < iter; i++) { u = mac(u); for (let j = 0; j < 32; j++) t[j] ^= u[j]; }
    out.set(t.subarray(0, Math.min(32, bytes - off)), off);
  }
  return out;
}
function b64(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
const enc = (s) => new TextEncoder().encode(s);
/** Pruefwert eines Wortes fuer Seed und Runde (11 Zeichen). */
export function check(word, seed, round) { return b64(pbkdf2(enc(fold(word)), enc("malrat|" + seed + "|" + round), ITER, 8)); }
/** Ist das das Wort des Bildes? Nur der Pruefwert entscheidet. pic: { k, r } */
export function right(word, pic, seed) { const g = guess(word); return !!g && fold(g).length >= 1 && check(g, seed, pic.r) === pic.k; }
/** Das Wort hinter einem Bild, wenn es aus der Liste stammt: nur Woerter mit gleichem Hinweis werden probiert. */
export function find(pic, seed) {
  const h = hintParts(pic.h), lang = langOf(pic.l); if (!h) return null;
  const maybe = ALL.filter((e) => hintOf(e[lang]) === pic.h);
  for (const e of maybe) if (check(e[lang], seed, pic.r) === pic.k) return { w: e[lang], cat: e.cat, lvl: e.lvl };
  return null;
}

// ---------- Striche: vereinfachen, runden, packen ----------
function off(p, a, b) {   // Abstand von p zur Strecke a-b
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  let t = l ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1];
  return Math.sqrt(x * x + y * y);
}
export function simplify(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length), todo = [[0, pts.length - 1]];
  keep[0] = keep[pts.length - 1] = 1;
  while (todo.length) {
    const r = todo.pop(); let far = -1, at = -1;
    for (let i = r[0] + 1; i < r[1]; i++) { const d = off(pts[i], pts[r[0]], pts[r[1]]); if (d > far) { far = d; at = i; } }
    if (far > eps) { keep[at] = 1; todo.push([r[0], at], [at, r[1]]); }
  }
  return pts.filter((p, i) => keep[i]);
}
function cell(v) { return Math.max(0, Math.min(GRID - 1, Math.round(v * (GRID - 1)))); }
/** lines: [{ c: Farbe, w: Breite, p: [[x, y], ...] mit x, y von 0 bis 1 }] -> die Zeichenkette fuer den Link */
export function encode(lines, eps) {
  return lines.map((l) => {
    const g = simplify(l.p.map((p) => [p[0] * (GRID - 1), p[1] * (GRID - 1)]), eps);
    let out = ABC[l.c * 3 + l.w], last = "";
    for (const p of g) { const s = ABC[cell(p[0] / (GRID - 1))] + ABC[cell(p[1] / (GRID - 1))]; if (s !== last) out += s; last = s; }
    return out;
  }).join(".");
}
/** Zeichenkette aus dem Link -> [{ c, w, p: [[x, y], ...] im Raster }] oder null, wenn der Bildschirm sie nicht machen kann. */
export function decode(s) {
  if (typeof s !== "string" || !s || s.length > MAX_CHARS || !LINES.test(s)) return null;
  const parts = s.split("."), out = [];
  if (parts.length > MAX_LINES) return null;
  for (const x of parts) {
    const h = ABC.indexOf(x[0]);
    if (x.length < 3 || x.length % 2 !== 1 || h >= COLORS.length * WIDTHS.length) return null;
    const p = [];
    for (let k = 1; k < x.length; k += 2) p.push([ABC.indexOf(x[k]), ABC.indexOf(x[k + 1])]);
    out.push({ c: Math.floor(h / 3), w: h % 3, p });
  }
  return out;
}
/** Die feinste Packung, fuer die fits(string) gilt; null, wenn selbst die groebste zu lang ist (nie abschneiden). */
export function pack(lines, fits = (s) => s.length <= MAX_CHARS) {
  for (const e of EPS) { const s = encode(lines, e); if (fits(s)) return { s, eps: e }; }
  return null;
}
export function used(lines) { const u = []; for (const l of lines) if (u.indexOf(l.c) < 0) u.push(l.c); return u; }
export function count(lines) { return lines.reduce((a, l) => a + l.p.length, 0); }

// ---------- das Bild ----------
/** Bild aus Pruefwert, Wort, Sprache, Strichen, Sekunden und Runde (alt: move). */
export function picture(k, word, lang, s, sec, r) { return { k, h: hintOf(word), l: lang === "en" ? 1 : 0, s, sec, r }; }
/** Runde des naechsten Bildes: nach dem letzten Bild eins mehr, sonst 1. */
export function nextRound(last) { return last ? last.r + 1 : 1; }
/** Nur was der Bildschirm schicken kann (alt: ok). last: das vorige Bild oder null. */
export function valid(v, last) {
  if (!v || typeof v !== "object") return false;
  const h = hintParts(v.h);
  if (!h || typeof v.k !== "string" || !CHECK.test(v.k) || !intIn(h.n, 2, MAXW) || !intIn(v.l, 0, 1) || !decode(v.s) || !intIn(v.sec, 0, MAX_SECS)) return false;
  return last ? v.r === nextRound(last) && v.r <= MAX_ROUND : intIn(v.r, 1, MAX_ROUND);
}
/** Reihenfolge, in der die Buchstaben nach dem ersten als Tipp aufgedeckt werden: aus dem Seed. */
export function order(n, seed, r) {
  const a = [], g = rnd(seed + "|" + r + "|tipp");
  for (let i = 1; i < n; i++) a.push(i);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(g() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
/** Die gemischten Buchstaben zum Antippen. */
export function bank(word, seed, r) { const l = letters(word), o = order(l.length + 1, seed, r + "|bank"); return o.map((i) => l[i - 1]); }
/** Die Tipps beim Raten in ihrer Reihenfolge (alt: malrat-ui.js „Zeig mir ein Wort mehr“): Kategorie (nur Listenwort),
 *  Farben, Anfangsbuchstabe, Buchstabenbank (nur Listenwort), dann je ein Buchstabe mehr bis auf zwei.
 *  Rueckgabe: [{ t: "cat"|"col"|"first"|"bank"|"letter", open?: index }] */
export function hintSteps(pic, known, seed) {
  const h = hintParts(pic.h), steps = [];
  if (known) steps.push({ t: "cat", cat: known.cat });
  steps.push({ t: "col" });
  steps.push({ t: "first", open: 0 });
  if (known) {
    steps.push({ t: "bank" });
    for (const i of order(h.n, seed, pic.r).slice(0, Math.max(0, h.n - 2))) steps.push({ t: "letter", open: i });
  }
  return steps;
}
/** „Schildkroete“ war richtig fuer „S11“: mit Umlauten schreiben, wenn das die Laenge des Hinweises ergibt. */
export function spelt(g, n) { const u = g.replace(/ae/g, "ä").replace(/oe/g, "ö").replace(/ue/g, "ü"); return letters(g).length !== n && letters(u).length === n ? u : g; }
/** Sekunden fuers Raten: 1 bis 3600 (alt: Math.round((spent + now - at) / 1000)). */
export function seconds(ms) { return Math.max(1, Math.min(MAX_SECS, Math.round(ms / 1000))); }
/** Tempo der Wiedergabe in ms je Punkt (alt: malrat-ui.js play). */
export function playStep(lines) { return Math.max(12, Math.min(70, 5000 / Math.max(1, count(lines)))); }
