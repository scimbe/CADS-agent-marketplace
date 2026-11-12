// Bildbruecke fuer den Host (ADR 0001 (g), Strang F image-Primitiv {t:"image", src, alt}): src ist eine data:-URL oder
// {kind:"server", ref} (ein KI-Bild des Servers, /duell/bild/<ref>). Server-Bilder holt api.image() ohne Cookie und als
// data:-URL (CSP img-src data: bleibt). url(src) antwortet sofort aus dem Speicher: "" waehrend des Ladens und bei Fehler
// (kein stiller Ersatz: der Host zeigt dann den alt-Text); subscribe(fn) meldet, wenn ein Bild fertig ist (neu zeichnen).
import { createApi } from "../../broker/api.js";
import { nativeAccount } from "../../broker/native.js";

const DATA = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const REF = /^[A-Za-z0-9_-]{22}\.(jpg|png)$/;
const MAX = 40;

/** @param win window (location, Image); @param [api] fuer Tests */
export function createImages(win, api) {
  const a = api || createApi({ location: win.location, native: nativeAccount(win) });
  const cache = new Map(), els = new Map(), subs = new Set();
  const keyOf = (src) => (typeof src === "string" ? (DATA.test(src) ? src : "") : src && src.kind === "server" && typeof src.ref === "string" && REF.test(src.ref) ? "srv:" + src.ref : "");
  function notify(k) { for (const f of subs) { try { f(k); } catch (e) { setTimeout(() => { throw e; }, 0); } } }
  function load(k) {
    if (cache.has(k)) return;
    cache.set(k, { st: "busy", url: "" });
    if (cache.size > MAX) cache.delete(cache.keys().next().value);
    a.image("/duell/bild/" + k.slice(4)).then((r) => { cache.set(k, r.ok ? { st: "ok", url: r.url } : { st: r.error || "fehler", url: "" }); notify(k); });
  }
  /** data:-URL des Bildes oder "" (laedt, unbekannt, gesperrt) */
  function url(src) {
    const k = keyOf(src);
    if (!k) return "";
    if (!k.startsWith("srv:")) return k;
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
  function state(src) { const k = keyOf(src); return !k ? "ungueltig" : k.startsWith("srv:") ? (cache.get(k) || { st: "neu" }).st : "ok"; }
  return { url, get, state, subscribe: (f) => { subs.add(f); return () => subs.delete(f); } };
}
