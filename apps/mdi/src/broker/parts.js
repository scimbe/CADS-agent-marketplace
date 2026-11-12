// Nachladbare Teile (ADR 0001 Nachtrag 2): Karten (Modul, Validatoren, Assets) und Thumbnails liegen nicht im Kern,
// sondern als Skript-Teile mit Inhalts-Hash im Dateinamen und SRI (SHA-384). Der Kern darf sie per CSP 'strict-dynamic'
// einfuegen; jeder Teil meldet sich mit einem Ereignis am Dokument (keine globale Zuweisung) und wird gegen id und
// Code-Hash geprueft (src/cards/lazy.js).
//
// Laden: auf http(s) zuerst aus dem eigenen Cache (Cache Storage "mdi-parts-v1", offline nach dem ersten Laden), sonst
// per fetch; die Bytes werden gegen SRI geprueft und als blob:-Skript mit integrity ausgefuehrt. In App-Huellen und auf
// file:// liegen die Teile gebuendelt neben dem Kern und werden direkt eingefuegt. Fehler werden nie verschluckt:
// "teil-fehlt" (nicht erreichbar), "teil-manipuliert" (SRI passt nicht), "zeit" (meldet sich nicht).
/* global __CARD_PARTS__, __THUMB_PARTS__ */
const CARD_PARTS = typeof __CARD_PARTS__ !== "undefined" ? __CARD_PARTS__ : {};
const THUMB_PARTS = typeof __THUMB_PARTS__ !== "undefined" ? __THUMB_PARTS__ : { index: {}, files: {} };
export const CACHE = "mdi-parts-v1";

/**
 * Verzeichnis der App als Basis fuer Teile (Staging-Befund L2): "/duell" und "/duell/" (und "/duell/index.html") ergeben
 * dieselbe Basis "/duell/". Relativ zu "/duell" ohne Schraegstrich loeste der Browser "parts/x" zu "/parts/x" auf (404).
 * Regel: endet der Pfad auf "/", ist er das Verzeichnis; hat das letzte Segment einen Punkt, ist es eine Datei (wegnehmen);
 * sonst ist das letzte Segment das App-Verzeichnis (Schraegstrich ergaenzen). Kein Raten bei unbekanntem Protokoll.
 */
export function appBase(loc) {
  const p = String(loc.pathname || "/");
  const dir = p.endsWith("/") ? p : /\.[^/]*$/.test(p.slice(p.lastIndexOf("/") + 1)) ? p.slice(0, p.lastIndexOf("/") + 1) : p + "/";
  return /^https?:$/.test(loc.protocol) ? loc.origin + dir : loc.protocol + "//" + (loc.host || "") + dir;
}
/** Absolute URL eines Teils ("parts/…") zur App-Basis. */
export function partUrl(loc, file) { return new URL(file, appBase(loc)).href; }

function err(code, detail) { return Object.assign(new Error(code + (detail ? ": " + detail : "")), { code }); }
function b64(buf) { let s = ""; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }

/**
 * @param {object} o { win, doc, cardParts?, thumbParts?, timeoutMs? }
 */
export function createParts({ win, doc, cardParts = CARD_PARTS, thumbParts = THUMB_PARTS, timeoutMs = 15000 }) {
  const http = /^https?:$/.test(win.location.protocol);
  const cacheOk = http && !!win.caches && !!(win.crypto && win.crypto.subtle);
  const pending = new Map();
  const files = new Set([...Object.values(cardParts).map((p) => p.file), ...Object.values(thumbParts.files || {}).map((p) => p.file)]);

  // Alte Teile (andere Hashes) aus dem Cache entfernen, damit er nicht waechst
  if (cacheOk) win.caches.open(CACHE).then((c) => c.keys().then((ks) => Promise.all(ks.map((r) => { const f = new URL(r.url).pathname.split("/").slice(-2).join("/"); return files.has(f) ? null : c.delete(r); })))).catch(() => {});

  function waitFor(event, test) {
    return new Promise((ok, bad) => {
      const t = win.setTimeout(() => { doc.removeEventListener(event, on); bad(err("zeit")); }, timeoutMs);
      function on(e) { if (e.detail && test(e.detail)) { win.clearTimeout(t); doc.removeEventListener(event, on); ok(e.detail); } }
      doc.addEventListener(event, on);
    });
  }
  function inject(src, sri) {
    return new Promise((ok, bad) => {
      const s = doc.createElement("script");
      if (http) s.integrity = sri; // SRI gilt fuer http(s) und blob:; file:// ist ohne CORS nicht pruefbar (nur lokale Entwicklung/Test)
      s.onload = () => { s.remove(); ok(); };
      s.onerror = () => { s.remove(); bad(err("teil-fehlt", src)); };
      s.src = src;
      doc.head.appendChild(s);
    });
  }
  async function bytesFor(file, sri) {
    const c = await win.caches.open(CACHE);
    let res = await c.match(file), fresh = false;
    if (!res) {
      try { res = await win.fetch(file, { cache: "no-cache", credentials: "omit" }); } catch (e) { throw err("teil-fehlt", file); }
      if (!res.ok) throw err("teil-fehlt", file + " " + res.status);
      fresh = true;
    }
    const buf = await res.clone().arrayBuffer();
    const got = "sha384-" + b64(await win.crypto.subtle.digest("SHA-384", buf));
    if (got !== sri) { await c.delete(file); throw err("teil-manipuliert", file); }
    if (fresh) await c.put(file, res);
    return buf;
  }
  async function run(rel, sri, event, test) {
    const file = partUrl(win.location, rel);
    const got = waitFor(event, test);
    got.catch(() => {}); // wird unten abgewartet; verhindert einen unbehandelten Fehler, falls inject zuerst scheitert
    let src = file, url = null;
    if (cacheOk) { const buf = await bytesFor(file, sri); url = win.URL.createObjectURL(new win.Blob([buf], { type: "text/javascript" })); src = url; }
    try { await inject(src, sri); return await got; }
    finally { if (url) win.URL.revokeObjectURL(url); }
  }
  function once(key, f) {
    if (!pending.has(key)) pending.set(key, f().catch((e) => { pending.delete(key); throw e; }));
    return pending.get(key);
  }
  return {
    /** Karte laden (fuer src/cards/lazy.js loadCard): {card, params, inputs, hash, assets} */
    card(id) {
      const p = cardParts[id];
      if (!p) return Promise.reject(err("karte-unbekannt", id));
      return once("c:" + id, () => run(p.file, p.sri, "mdi:part", (d) => d.id === id));
    },
    /** Thumbnail als data:-URL; null nur, wenn die Karte/Variante keins hat */
    thumb(id, variant = null) {
      const key = variant ? id + "/" + variant : id, chunk = thumbParts.index && thumbParts.index[key];
      if (chunk === undefined) return Promise.resolve(null);
      const p = thumbParts.files[chunk];
      return once("t:" + chunk, () => run(p.file, p.sri, "mdi:thumbs", (d) => d.chunk === chunk)).then((d) => d.map[key] || null);
    },
    get cached() { return cacheOk; }
  };
}
