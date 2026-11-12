// UEBERGANGSFASSUNG (Strang K) im Format von Strang F (feat/mdi-w1-f, ADR 0001 (g)): Liste der Features und ihre
// Zusammensetzung. Beim Mergen gilt F's Fassung von features.js/machine.js/runtime.js; K traegt nur die Zeile `frei` bei.
import { frei } from "../features/frei/chart.js";

export const FEATURES = [frei];

/** Feature-Teile zusammenfuehren; doppelte Namen sind ein Fehler beim Erzeugen (kein stilles Ueberschreiben). */
export function mergeNamed(base, list, what) {
  const out = { ...base };
  for (const f of list) for (const [k, v] of Object.entries(f[what] || {})) { if (k in out) throw new Error("features: " + what + " doppelt: " + k); out[k] = v; }
  return out;
}
/** Setzt die Features in die Statechart ein: states unter inhalt, shelfOn im Regal, on[pfad][EVENT] VOR den vorhandenen. */
export function compose(chart, list = FEATURES) {
  const c = structuredCloneSafe(chart), inhalt = c.states.inhalt;
  for (const f of list) {
    for (const [k, v] of Object.entries(f.states || {})) { if (inhalt.states[k]) throw new Error("features: Zustand doppelt: " + k); inhalt.states[k] = v; }
    if (f.shelfOn) inhalt.states.shelf.on = { ...(inhalt.states.shelf.on || {}), ...f.shelfOn };
    for (const [p, evs] of Object.entries(f.on || {})) {
      const node = p.split(".").slice(1).reduce((n, k) => { if (!n || !n.states || !n.states[k]) throw new Error("features: Pfad fehlt: " + p); return n.states[k]; }, c.states[p.split(".")[0]]);
      node.on = { ...(node.on || {}) };
      for (const [ev, t] of Object.entries(evs)) node.on[ev] = [...[].concat(t), ...[].concat(node.on[ev] || [])];
    }
  }
  return c;
}
// Tiefe Kopie der Zustandsbeschreibung (Funktionen in raise bleiben dieselben Verweise)
function structuredCloneSafe(n) { if (Array.isArray(n)) return n.map(structuredCloneSafe); if (n && typeof n === "object") { const o = {}; for (const k of Object.keys(n)) o[k] = structuredCloneSafe(n[k]); return o; } return n; }
