// Quest-Engine (E9) „Geheimer Kanal“: jede Antwort ist der Schluessel zum naechsten Raetsel. Exakt aus alt:src/quest.js.
// PBKDF2-SHA-256, 30000 Runden, AES-GCM-256; hier synchron (sync.js), Web-Crypto-Fassung in web.js (nur Seite und Tests). Gebaut vom letzten Raetsel rueckwaerts: jede Antwort oeffnet
// genau den naechsten Schritt.
import { isClean, sanitizeEmoji } from "../text/filter.js";
var MAX_STOPS = 3, MAX_Q = 44, MAX_A = 24, ITER = 30000, NONCE = 12;
var BLOB = /^[A-Za-z0-9_-]{20,420}$/;
// No meeting places, addresses or ways to reach someone: a riddle is about what two people already share.
var CONTACT = /https?:|www\.|\.(de|com|org|net)\b|@|\d[\d\s/-]{4,}\d|\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s*uhr\b|stra(ß|ss)e|\bstr\.|(markt|sport|spiel|park|schul)platz|treffpunkt|treffen\b|\btreff\b|adresse|standort|bahnhof|haltestelle|komm (zu|allein|\w* ?vorbei)|allein|hausnummer|handynummer|telefon|snap|insta|tiktok|whatsapp|discord|\bstreet\b|\bmeet\b|address|location|\bcome (to|alone|over)|\balone\b|phone number/i;

function clean(s, max) {
  var t = Array.from(String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim()).slice(0, max).join("").trim();
  return t && isClean(t) && !CONTACT.test(t) ? t : "";
}
function fold(s) {
  return String(s == null ? "" : s).toLowerCase().replace(/ß/g, "ss").replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "");
}
function b64(bytes) { var s = ""; bytes.forEach(function (b) { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function unb64(s) { var b = s.replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(b + "===".slice(0, (4 - b.length % 4) % 4)), function (x) { return x.charCodeAt(0); }); }
function hintOf(answer) { var a = Array.from(String(answer).trim()); return a.length ? a[0].toUpperCase() + a.length : ""; }

function cleanDraft(d) {
  var stops = (d && Array.isArray(d.stops) ? d.stops : []).slice(0, MAX_STOPS).map(function (s) { return { q: clean(s && s.q, MAX_Q), a: clean(s && s.a, MAX_A) }; });
  return { stops: stops, end: clean(d && d.end, MAX_Q) };
}
function complete(d) {
  var c = cleanDraft(d);
  return !!c.stops.length && !!c.end && c.stops.every(function (s) { return s.q && fold(s.a).length >= 2; });
}
function sanitize(o, d) {
  var c = (Array.isArray(o.c) ? o.c : []).filter(function (b) { return typeof b === "string" && BLOB.test(b); }).slice(0, MAX_STOPS);
  d.q0 = clean(o.q0, MAX_Q); d.h0 = clean(o.h0, 6); d.c = c;
  d.e = typeof o.e === "string" ? sanitizeEmoji(o.e) : "🗝️";
  return d;
}
function fromIdea(idea, lang, base) {
  var L = idea[lang] || idea.de;
  base.q0 = L.riddles[0]; base.h0 = ""; base.c = []; base.e = idea.quest.e;
  return base;
}
export { MAX_STOPS, MAX_Q, MAX_A, ITER, NONCE, clean, fold, complete, sanitize, fromIdea, hintOf, cleanDraft, BLOB, b64, unb64 };

// ---------- synchron fuer den Kartenvertrag (prepare/step), gleiches Format wie seal/open ----------
import { pbkdf2, gcmEncrypt, gcmDecrypt, sha256Bytes } from "./sync.js";
const enc = new TextEncoder();
function lockSync(obj, answer, nonce) {
  const key = pbkdf2(enc.encode(fold(answer)), nonce, ITER), ct = gcmEncrypt(key, nonce, enc.encode(JSON.stringify(obj))), out = new Uint8Array(NONCE + ct.length);
  out.set(nonce); out.set(ct, NONCE);
  return b64(out);
}
/**
 * Siegel ohne Zufall im Vertrag: Nonce = SHA-256("mdi-quest|" + seed + "|" + i + "|" + Entwurf)[0..12]. Eindeutig je Sitzung
 * und Inhalt (seed hat 128 Bit), daher kein Nonce zweimal mit demselben Schluessel. Gleiches Ergebnisformat wie seal().
 */
export function sealSync(draft, seed) {
  const d = cleanDraft(draft); if (!complete(d)) return null;
  const tag = JSON.stringify(d), blobs = [];
  for (let i = 0; i < d.stops.length; i++) {
    const next = d.stops[i + 1], nonce = sha256Bytes(enc.encode("mdi-quest|" + seed + "|" + i + "|" + tag)).slice(0, NONCE);
    blobs.push(lockSync(next ? { q: next.q, h: hintOf(next.a) } : { e: d.end }, d.stops[i].a, nonce));
  }
  return { q0: d.stops[0].q, h0: hintOf(d.stops[0].a), c: blobs };
}
/** Wie open(), synchron. */
export function openSync(blob, answer) {
  if (typeof blob !== "string" || !BLOB.test(blob)) return null;
  let raw;
  try {
    const all = unb64(blob), nonce = all.slice(0, NONCE), key = pbkdf2(enc.encode(fold(answer)), nonce, ITER), pt = gcmDecrypt(key, nonce, all.slice(NONCE));
    if (!pt) return null;
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(pt));
  } catch (e) { return null; }
  if (raw && typeof raw.q === "string") { const q = clean(raw.q, MAX_Q); return q ? { q, h: typeof raw.h === "string" ? clean(raw.h, 6) : "" } : { blocked: true }; }
  if (raw && typeof raw.e === "string") { const e = clean(raw.e, MAX_Q); return e ? { e } : { blocked: true }; }
  return { blocked: true };
}
