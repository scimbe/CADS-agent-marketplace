// Bildbruecke fuer den Host (ADR 0001 (g), Strang F image-Primitiv {t:"image", src, alt}): src ist eine data:-URL oder
// {kind:"server", ref} (ein KI-Bild des Servers, /duell/bild/<ref>). Server-Bilder holt api.image() ohne Cookie und als
// data:-URL (CSP img-src data: bleibt). url(src) antwortet sofort aus dem Speicher: "" waehrend des Ladens und bei Fehler
// (kein stiller Ersatz: der Host zeigt dann den alt-Text); subscribe(fn) meldet, wenn ein Bild fertig ist (neu zeichnen).
// {kind:"local", id} ist ein Foto auf dem Geraet (Feldtyp media.local, broker/media.js): aufgeloest ueber den injizierten
// Lieferanten o.local(id) -> Promise<blob:-URL|null>, nie ueber den Server. Ohne Lieferant: url "" und get null. Die
// blob:-URLs gehoeren diesem Dienst und werden beim Verdraengen, Ersetzen oder forget() per o.revoke freigegeben.
import { createApi } from "../../broker/api.js";
import { nativeAccount } from "../../broker/native.js";

const DATA = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const REF = /^[A-Za-z0-9_-]{22}\.(jpg|png)$/;
const LOCAL = /^[0-9a-f]{32}$/;
const MAX = 40;

/** @param win window (location, Image); @param [api] fuer Tests; @param [o] { local(id): Promise<string|null>, revoke(url), now() } */
export function createImages(win, api, o = {}) {
  const a = api || createApi({ location: win.location, native: nativeAccount(win) });
  const cache = new Map(), els = new Map(), subs = new Set();
  const keyOf = (src) => (typeof src === "string" ? (DATA.test(src) ? src : "")
    : src && src.kind === "server" && typeof src.ref === "string" && REF.test(src.ref) ? "srv:" + src.ref
    : src && src.kind === "local" && typeof src.id === "string" && LOCAL.test(src.id) ? "local:" + src.id : "");
  const free = (v) => { if (v && v.local && v.url && o.revoke) { try { o.revoke(v.url); } catch (e) { /* schon frei */ } } };
  function put(k, v) { const old = cache.get(k); if (old && old.url !== v.url) { els.delete(old.url); free(old); } cache.set(k, v); }
  function trim() { while (cache.size > MAX) { const k = cache.keys().next().value, v = cache.get(k); cache.delete(k); if (v) { els.delete(v.url); free(v); } } }
  let version = 0;   // Bildstand: zaehlt bei jedem fertigen Bild hoch (statische Leinwaende zeichnen danach neu, render.js; F 006cf9b9)
  function notify(k) { version++; for (const f of subs) { try { f(k); } catch (e) { setTimeout(() => { throw e; }, 0); } } }
  // Ein fehlendes Foto kann spaeter gespeichert werden (Editor, gleiche id): der Fehlzustand gilt RETRY ms, dann neu fragen
  // (gedrosselt, damit Neuzeichnen nicht jedes Bild erneut laedt)
  const RETRY = 2000, now = () => (o.now ? o.now() : Date.now());
  function load(k) {
    const c = cache.get(k);
    if (c && !(c.local === false && now() - c.at >= RETRY)) return;
    if (c) cache.delete(k);
    cache.set(k, { st: "busy", url: "" });
    trim();
    if (k.startsWith("local:")) {
      Promise.resolve().then(() => o.local(k.slice(6))).then((u) => (typeof u === "string" && u ? { st: "ok", url: u, local: true } : { st: "fehlt", url: "", local: false, at: now() }), () => ({ st: "fehler", url: "", local: false, at: now() }))
        .then((v) => { if (cache.has(k)) { put(k, v); notify(k); } else free(v); });
      return;
    }
    a.image("/duell/bild/" + k.slice(4)).then((r) => { put(k, r.ok ? { st: "ok", url: r.url } : { st: r.error || "fehler", url: "" }); notify(k); });
  }
  const remote = (k) => k.startsWith("srv:") || k.startsWith("local:");
  /** data:-URL des Bildes oder "" (laedt, unbekannt, gesperrt) */
  function url(src) {
    const k = keyOf(src);
    if (!k) return "";
    if (!remote(k)) return k;
    if (k.startsWith("local:") && typeof o.local !== "function") return "";
    load(k);
    return cache.get(k).url;
  }
  /** fertiges HTMLImageElement fuer die Canvas oder null (noch nicht da) */
  function get(src) {
    const u = url(src);
    if (!u) return null;
    let im = els.get(u);
    if (!im && win.Image) {
      im = new win.Image(); im.decoding = "async";
      im.onload = () => notify(keyOf(src));
      im.src = u; els.set(u, im);
      if (els.size > MAX) els.delete(els.keys().next().value);
    }
    return im && im.complete && im.naturalWidth > 0 ? im : null;
  }
  function state(src) { const k = keyOf(src); return !k ? "ungueltig" : k.startsWith("local:") && typeof o.local !== "function" ? "nicht-verfuegbar" : remote(k) ? (cache.get(k) || { st: "neu" }).st : "ok"; }
  /** Bild verwerfen (z. B. Foto geloescht oder ersetzt): blob:-URL frei, naechstes url() laedt neu */
  function forget(src) { const k = keyOf(src), v = k && cache.get(k); if (v) { cache.delete(k); els.delete(v.url); free(v); } }
  return { url, get, state, forget, get version() { return version; }, subscribe: (f) => { subs.add(f); return () => subs.delete(f); } };
}
