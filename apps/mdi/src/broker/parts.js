// Teile nachladen (Capability-Broker): Skript mit Inhalts-Hash im Namen, SRI auf http(s) (auf file:// kann der
// Browser SRI nicht pruefen, dort kommt die Datei aus demselben Ordner). Der Teil meldet sich per Ereignis
// "mdi:part" am Dokument – kein globales Objekt (A1).
/* global __PARTS__ */
const PARTS = typeof __PARTS__ !== "undefined" ? __PARTS__ : {};
const waiting = new Map(), loaded = new Map();
if (typeof document !== "undefined") {
  document.addEventListener("mdi:part", (e) => {
    const d = e.detail || {};
    if (!PARTS[d.name] || loaded.has(d.name)) return;
    loaded.set(d.name, d.api);
    const w = waiting.get(d.name); if (w) { waiting.delete(d.name); w.ok(d.api); }
  });
}
export function loadPart(name) {
  if (loaded.has(name)) return Promise.resolve(loaded.get(name));
  const p = PARTS[name];
  if (!p) return Promise.reject(new Error("Teil fehlt: " + name));
  return new Promise((ok, bad) => {
    waiting.set(name, { ok, bad });
    const s = document.createElement("script");
    s.src = p.file;
    if (/^https?:$/.test(location.protocol)) { s.integrity = p.sri; s.crossOrigin = "anonymous"; }
    s.onerror = () => { waiting.delete(name); bad(new Error("Teil laedt nicht: " + name)); };
    document.head.appendChild(s);
  });
}
