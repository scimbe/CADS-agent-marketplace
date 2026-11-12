// Community-Deck der freien Karten (Strang K): signiertes, versioniertes Deck, Status-Gate, Nutzung, Daumen, /deck/me.
// Server: CADS-DEMO-wrapper lib/duell-deck.mjs (route). Altcode (Untergrenze): deck.js – sane, signed, load, check/gate,
// seen/finish (Nutzung >= 20 s mit Aktion, nur mit Konto), vote (erst nach dem Oeffnen, >= 10 s), mine.
//
//   GET  /api/duell/deck              { v, at, kid, cards:[{cid, doc}], revoked:[cid], sig }   (Ed25519 ueber canonical(ohne sig))
//   GET  /api/duell/deck/key          { kid, alg:"Ed25519", pub }   kid = base64url(SHA-256(pub roh)).slice(0, 8)
//   GET  /api/duell/deck/status?c=[&d=]  { c, st: ok|blocked|unknown|changed } | 503   -> nur "ok" oeffnet (fail closed);
//                                     d = gateHash des Gezeigten (Server fix/deck-status-hash): anderer Inhalt -> changed
//   POST /api/duell/deck/use          { ki, ev:"start" } -> 200 {t} ; { ki, ev:"done", t } -> 204 ; 401 ohne Konto
//   POST /api/duell/deck/vote         { ki, v: 1|-1|0, t } -> 204
//   POST /api/duell/deck/me           {} -> { cards:[{cid, st}], credit:{balance, items}, mod:{st} }
// Ein Geraet, das Ed25519 nicht pruefen kann, bekommt kein Deck: ungepruefte Daten landen nie hier. Eine aeltere Version
// ersetzt nie eine neuere. Jede Karte geht durch dieselbe Bereinigung wie ein Link (sanitize, von aussen hereingereicht).
import { canonical, b64url, unb64url } from "./ai.js";

export const CID = /^[A-Za-z0-9_-]{22}$/;
export const USE_MS = 20000, VOTE_MS = 10000, OK_MS = 30000, MAX = 200;
export const ST_MINE = ["privat", "pruefung", "deck", "pausiert", "gesperrt", "entfernt"];
/** Die Karten-id eines Siegels (h.slice(0, 22)) oder "" */
export function cidOf(ki) { return ki && ki.k === "karte" && typeof ki.h === "string" && /^[A-Za-z0-9_-]{43}$/.test(ki.h) ? ki.h.slice(0, 22) : ""; }

/** Deck-Daten pruefen (Form, Widerruf, Bereinigung jeder Karte, cid passt zum Siegel). -> Deck | null */
export function sane(j, sanitize) {
  if (!j || typeof j !== "object" || !Number.isInteger(j.v) || j.v < 0 || j.v > 1e9 || !Array.isArray(j.cards)) return null;
  const revoked = (Array.isArray(j.revoked) ? j.revoked : []).filter((c) => typeof c === "string" && CID.test(c)).slice(-2000);
  const cards = [];
  for (const e of j.cards.slice(0, MAX)) {
    if (!e || !CID.test(e.cid) || revoked.includes(e.cid)) continue;
    const d = sanitize(e.doc);
    if (!d || cidOf(d.ki) !== e.cid) continue;
    cards.push({ cid: e.cid, doc: d });
  }
  return { v: j.v, kid: typeof j.kid === "string" ? j.kid.slice(0, 16) : "", cards, revoked };
}

/**
 * @param {object} deps
 * @param {{raw:Function}} deps.api
 * @param {(doc:object)=>object|null} deps.sanitize   Bereinigung eines Server-Docs (src/features/frei/doc.js sanitizeDoc)
 * @param {SubtleCrypto} [deps.subtle]
 * @param {()=>number} [deps.now]
 * @param {string} [deps.pin]   fest eingebauter oeffentlicher Schluessel (base64url); leer: Schluessel vom selben Server
 */
export function createDeck(deps) {
  const api = deps.api, subtle = "subtle" in deps ? deps.subtle : globalThis.crypto && globalThis.crypto.subtle, now = deps.now || (() => Date.now());
  let deck = { v: -1, kid: "", cards: [], revoked: [] };
  const okAt = new Map(), tokens = new Map();

  async function keyFor(kid) {
    let pub = deps.pin || "";
    if (!pub) { const r = await api.raw("GET", "/api/duell/deck/key"); pub = r.status === 200 && r.body && typeof r.body.pub === "string" ? r.body.pub : ""; }
    if (!pub) return null;
    const raw = unb64url(pub), id = b64url(new Uint8Array(await subtle.digest("SHA-256", raw))).slice(0, 8);
    if (!kid || id !== kid) return null;   // kid ist Pflicht und muss zum (gepinnten) Schluessel passen
    return subtle.importKey("raw", raw, { name: "Ed25519" }, false, ["verify"]);
  }
  /** true nur, wenn die Signatur haelt */
  async function signed(j) {
    if (!j || typeof j.sig !== "string" || !subtle) return false;
    try {
      const key = await keyFor(j.kid); if (!key) return false;
      const body = {}; for (const k of Object.keys(j)) if (k !== "sig") body[k] = j[k];
      return await subtle.verify({ name: "Ed25519" }, key, unb64url(j.sig), new TextEncoder().encode(canonical(body)));
    } catch (e) { return false; }
  }
  /** Deck laden. -> { ok, deck, why? } ; why: netz | signatur | form | aelter */
  async function load() {
    const r = await api.raw("GET", "/api/duell/deck");
    if (!r.status) return { ok: false, deck, why: r.error === "nicht-hier" ? "nicht-hier" : "netz" };
    if (r.status !== 200) return { ok: false, deck, why: "netz" };
    if ((await signed(r.body)) !== true) return { ok: false, deck, why: "signatur" };
    const d = sane(r.body, deps.sanitize);
    if (!d) return { ok: false, deck, why: "form" };
    if (d.v < deck.v) return { ok: false, deck, why: "aelter" };
    deck = d;
    return { ok: true, deck };
  }
  function revoked(cid) { return !!cid && deck.revoked.includes(cid); }
  /** Status einer geteilten freien Karte. d (optional): Inhalts-Hash des Gezeigten (gateHash); gegeben muss er zur
   *  freigegebenen Karte passen, sonst "changed". -> "ok" | "blocked" | "changed" | "unknown"
   *  (unbekannt beim Server gilt als blocked, wie im Altcode; alles andere als eine klare Antwort: unknown, fail closed) */
  async function status(cid, d) {
    if (!CID.test(String(cid || ""))) return "unknown";
    if (d !== undefined && !/^[A-Za-z0-9_-]{43}$/.test(String(d))) return "unknown";
    const key = cid + "|" + (d || "");
    if (okAt.has(key) && now() - okAt.get(key) < OK_MS) return "ok";
    const r = await api.raw("GET", "/api/duell/deck/status?c=" + cid + (d ? "&d=" + d : ""));
    const j = r.status === 200 ? r.body : null;
    const s = j && j.c === cid && ["ok", "blocked", "unknown", "changed"].includes(j.st) ? (j.st === "unknown" ? "blocked" : j.st) : "unknown";
    if (s === "ok") okAt.set(key, now()); else okAt.delete(key);
    return s;
  }
  /** Nutzung beginnen (nur mit Konto). -> { ok, t?, login? } */
  async function useStart(ki) {
    const cid = cidOf(ki); if (!cid) return { ok: false };
    const r = await api.raw("POST", "/api/duell/deck/use", { ki: { k: "karte", s: ki.s, h: ki.h }, ev: "start" });
    if (r.status === 401) return { ok: false, login: true };
    if (r.status !== 200 || !r.body || typeof r.body.t !== "string") return { ok: false };
    tokens.set(cid, { t: r.body.t, at: now() });
    return { ok: true, t: r.body.t };
  }
  /** Nutzung abschliessen: nur nach >= 20 s UND einer Aktion auf der Karte (der Aufrufer meldet acted). */
  async function useDone(ki, acted) {
    const cid = cidOf(ki), tk = tokens.get(cid);
    if (!tk || !acted || now() - tk.at < USE_MS || tk.done) return false;
    tk.done = true;
    const r = await api.raw("POST", "/api/duell/deck/use", { ki: { k: "karte", s: ki.s, h: ki.h }, ev: "done", t: tk.t });
    if (r.status !== 204) tk.done = false;
    return r.status === 204;
  }
  /** Daumen: erst nach dem Oeffnen (Token) und fruehestens 10 s danach. -> "ok" | "zu-frueh" | "nicht-geoeffnet" | "fehler" */
  async function vote(ki, v) {
    const cid = cidOf(ki), tk = tokens.get(cid);
    if (!tk) return "nicht-geoeffnet";
    if (![1, -1, 0].includes(v)) return "fehler";
    if (now() - tk.at < VOTE_MS) return "zu-frueh";
    const r = await api.raw("POST", "/api/duell/deck/vote", { ki: { k: "karte", s: ki.s, h: ki.h }, v, t: tk.t });
    return r.status === 204 ? "ok" : "fehler";
  }
  const opened = (ki) => tokens.has(cidOf(ki));
  /** POST /api/duell/deck/me -> { ok, cards, credit, mod } | { ok:false, error } */
  async function mine() {
    const r = await api.raw("POST", "/api/duell/deck/me", {});
    if (!r.status) return { ok: false, error: r.error || "netz" };
    if (r.status === 401) return { ok: false, error: "login" };
    if (r.status !== 200 || !r.body || !Array.isArray(r.body.cards)) return { ok: false, error: "server" };
    const cards = r.body.cards.filter((c) => c && typeof c.cid === "string" && CID.test(c.cid) && ST_MINE.includes(c.st)).map((c) => ({ cid: c.cid, st: c.st }));
    const cr = r.body.credit && Number.isInteger(r.body.credit.balance) ? { balance: r.body.credit.balance, items: (Array.isArray(r.body.credit.items) ? r.body.credit.items : []).filter((x) => x && ["use", "deck"].includes(x.reason) && Number.isInteger(x.n)).map((x) => ({ reason: x.reason, n: x.n, revoked: x.revoked === true })) } : null;
    const st = r.body.mod && ["ok", "paused", "banned"].includes(r.body.mod.st) ? r.body.mod.st : "ok";
    return { ok: true, cards, credit: cr, mod: { st } };
  }
  return { load, status, useStart, useDone, vote, opened, mine, revoked, get deck() { return deck; } };
}
