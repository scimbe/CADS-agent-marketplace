// Feature-Teile im Browser (ADR 0001 Nachtrag 4): Module, die ein Feature erst bei Bedarf braucht (Ansichten, Texte,
// Synthese), liegen als Teil "parts/feat-<name>.<sha12>.js" mit SRI neben den Kartenteilen. Der Build biegt
// src/gen/fparts.js (statisch, Node/Tests) auf diese Datei um. Fehler werden nie verschluckt: "teil-unbekannt",
// "teil-fehlt", "teil-manipuliert", "zeit".
/* global __FEAT_PARTS__ */
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const err = (code, n) => Object.assign(new Error(code + ": " + n), { code });
/** Register ueber eine Teile-Liste {name: {file, sri}} (Build: __FEAT_PARTS__; Tests: eigene Liste). */
export function createFeatParts(FP) {
  const LOADED = new Map(), PENDING = new Map();
  return {
    PART_NAMES: Object.freeze(Object.keys(FP)),
    /** Geladenes Modul oder null (synchron, fuer Ansichten nach needParts). */
    partOf: (name) => (LOADED.has(name) ? LOADED.get(name) : null),
    isPartLoaded: (name) => LOADED.has(name),
    /** loader(name) liefert {name, mod} aus dem Ereignis "mdi:feat" (src/broker/parts.js feat). */
    loadFeatPart(name, loader) {
      if (LOADED.has(name)) return Promise.resolve(LOADED.get(name));
      if (!own(FP, name)) return Promise.reject(err("teil-unbekannt", name));
      if (typeof loader !== "function") return Promise.reject(err("teil-fehlt", name));
      if (!PENDING.has(name)) PENDING.set(name, Promise.resolve().then(() => loader(name)).then((d) => {
        if (!d || d.name !== name || !d.mod || typeof d.mod !== "object") throw err("teil-manipuliert", name);
        LOADED.set(name, d.mod); return d.mod;
      }).finally(() => PENDING.delete(name)));
      return PENDING.get(name);
    }
  };
}
const R = createFeatParts(typeof __FEAT_PARTS__ !== "undefined" ? __FEAT_PARTS__ : {});
export const PART_NAMES = R.PART_NAMES;
export const partOf = R.partOf, isPartLoaded = R.isPartLoaded, loadFeatPart = R.loadFeatPart;
