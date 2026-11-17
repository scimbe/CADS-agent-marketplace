// Fotos, die auf dem Geraet bleiben (Feldtyp media.local; Strang H, abgestimmt mit F): Inhalt nur in IndexedDB "mdi.media",
// im Link reist nie ein Foto (travel: link "no", ausser withLocalMedia). Parameterwert der Karte: "local:<id>", id = die ersten
// 32 Hex des SHA-256 der gespeicherten Bytes (dasselbe Foto -> dieselbe id). Fotos werden vor dem Speichern verkleinert
// (laengste Kante 1600 px, JPEG) und duerfen danach hoechstens 2 MB haben. Ohne IndexedDB (privates Fenster, gesperrt)
// ehrlich "nicht-verfuegbar": kein stiller Wechsel auf einen Sitzungsspeicher.
export const ID_RE = /^[0-9a-f]{32}$/, VALUE_RE = /^local:[0-9a-f]{32}$/;
export const MAX_BYTES = 2 * 1024 * 1024, MAX_EDGE = 1600;
const DB = "mdi.media", STORE = "fotos";

/** IndexedDB als einfacher Schluesselspeicher {get,put,del}; null, wenn es keinen gibt. */
export function idbStore(win) {
  let idb = null;
  try { idb = win && win.indexedDB; } catch (e) { idb = null; }
  if (!idb) return null;
  let dbp = null;
  const open = () => (dbp = dbp || new Promise((ok, no) => {
    const r = idb.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error || new Error("idb"));
  }));
  const tx = (mode, f) => open().then((db) => new Promise((ok, no) => { const t = db.transaction(STORE, mode), s = t.objectStore(STORE), r = f(s); t.oncomplete = () => ok(r && r.result); t.onerror = () => no(t.error); t.onabort = () => no(t.error); }));
  return { get: (k) => tx("readonly", (s) => s.get(k)), put: (k, v) => tx("readwrite", (s) => s.put(v, k)), del: (k) => tx("readwrite", (s) => s.delete(k)) };
}

/**
 * @param o { store: {get,put,del}|null, digest: (bytes:Uint8Array) => Promise<ArrayBuffer>, shrink?: (file) => Promise<Blob>, objectUrl?: {create, revoke} }
 */
export function createMedia(o) {
  const urls = new Map();
  const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  return {
    get available() { return !!o.store; },
    /** -> { ok:true, id, value } | { ok:false, error: nicht-verfuegbar|kein-bild|zu-gross|fehler } */
    async put(file) {
      if (!o.store) return { ok: false, error: "nicht-verfuegbar" };
      if (!file || typeof file.type !== "string" || !/^image\//.test(file.type)) return { ok: false, error: "kein-bild" };
      try {
        const blob = o.shrink ? await o.shrink(file) : file;
        if (!blob || blob.size > MAX_BYTES) return { ok: false, error: "zu-gross" };
        const bytes = new Uint8Array(await blob.arrayBuffer()), id = hex(await o.digest(bytes)).slice(0, 32);
        await o.store.put(id, { type: blob.type || "image/jpeg", bytes, at: Date.now() });
        return { ok: true, id, value: "local:" + id };
      } catch (e) { return { ok: false, error: "fehler" }; }
    },
    /** neue blob:-URL, die dem Aufrufer gehoert (er gibt sie frei; fuer env.images) oder null */
    async open(id) {
      if (!ID_RE.test(String(id)) || !o.store || !o.objectUrl) return null;
      const v = await o.store.get(id).catch(() => null);
      return v && v.bytes ? o.objectUrl.create(new Blob([v.bytes], { type: v.type })) : null;
    },
    /** blob:-URL eines gespeicherten Fotos (gecacht) oder null */
    async url(id) {
      if (!ID_RE.test(String(id)) || !o.store || !o.objectUrl) return null;
      if (urls.has(id)) return urls.get(id);
      const v = await o.store.get(id).catch(() => null);
      if (!v || !v.bytes) return null;
      const u = o.objectUrl.create(new Blob([v.bytes], { type: v.type }));
      urls.set(id, u);
      return u;
    },
    async delete(id) {
      if (!ID_RE.test(String(id)) || !o.store) return false;
      if (urls.has(id)) { if (o.objectUrl) o.objectUrl.revoke(urls.get(id)); urls.delete(id); }
      await o.store.del(id).catch(() => {});
      return true;
    }
  };
}

/** Verkleinern im Browser: laengste Kante MAX_EDGE, JPEG 0,85 (bei Bedarf 0,7). */
export function browserShrink(win) {
  return async (file) => {
    const bmp = await win.createImageBitmap(file), k = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const c = win.document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const enc = (q) => new Promise((ok) => c.toBlob((b) => ok(b), "image/jpeg", q));
    const b = await enc(0.85);
    return b && b.size > MAX_BYTES ? enc(0.7) : b;
  };
}

/** Fotos im Browser: IndexedDB, SHA-256 aus crypto.subtle, Verkleinern ueber Canvas. */
export function browserMedia(win) {
  const subtle = win && win.crypto && win.crypto.subtle, U = win && win.URL;
  return createMedia({
    store: subtle ? idbStore(win) : null,
    digest: (b) => subtle.digest("SHA-256", b),
    shrink: win && win.createImageBitmap ? browserShrink(win) : null,
    objectUrl: U && U.createObjectURL ? { create: (b) => U.createObjectURL(b), revoke: (u) => U.revokeObjectURL(u) } : null
  });
}
