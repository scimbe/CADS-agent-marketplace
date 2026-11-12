// Erweiterungspunkte der App-Statechart (ADR 0001 g): andere Straenge (H Heim, K Freie Karte, …) haengen hier je eine
// Zeile an, statt machine.js/runtime.js zu aendern. machine.js setzt daraus zusammen; Konflikte sind Fehler beim
// Erzeugen, nie stilles Ueberschreiben.
//
// Feature = {
//   id: string,
//   states?:  { name: zustand }                Kinder von "inhalt" (nur ein Feature darf "shelf" ersetzen)
//   shelfOn?: { EVENT: transition | [..] }     zusaetzliche Uebergaenge im Regal
//   on?:      { "<pfad>": { EVENT: transition | [..] } }   Uebergaenge in fremden Zustaenden; sie werden VOR den
//                                              vorhandenen desselben Ereignisses geprueft ("inhalt" = Region selbst)
//   entry?:   { "<pfad>": [aktion…] }          Aktionen, die an vorhandene entry-Aktionen angehaengt werden
//   guards?, actions?:  { name: fn }
//   context?: (saved) => object                Anfangswerte im ctx
//   effects?: { typ: (fx, { dispatch, state, api, deps }) => void }
//   profileLocal?: (ctx) => { wall?, saved? } | null   lokale Profilteile fuer profile/put (Vorrang vor dem Server)
//   env?: { audio?: (win) => hostAudio, high?: {op: (c, a, env) => void}, cardSvg?: (code, {lang}) => svgDesc,
//           images?: (win) => { get(src), url(src) } }   Geraetedienste fuer Renderer/Widgets (main.js setzt zusammen)
// }
// Pfade sind absolute Zustandspfade ohne Praefix, z. B. "inhalt.card.view", "inhalt.card.play.over".

import { home } from "../ui/home/feature.js";

export const FEATURES = [
  home,      // Strang H: src/ui/home/feature.js
  // frei,   // Strang K: src/features/frei/chart.js
];

/** Geraetedienste aller Features zusammensetzen (doppelte Dienste sind ein Fehler). */
export function featureEnv(win, feats = FEATURES) {
  const out = {};
  for (const f of feats) for (const [k, v] of Object.entries(f.env || {})) {
    if (k in out) throw new Error("feature " + f.id + ": Dienst " + k + " doppelt");
    out[k] = typeof v === "function" && (k === "audio" || k === "images") ? v(win) : v;
  }
  return out;
}
