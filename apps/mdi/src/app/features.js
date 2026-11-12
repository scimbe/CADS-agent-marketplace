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
//   needs?: (ev, ctx) => [kartenId…]   Karten, die ein Ereignis braucht; die Laufzeit laedt sie vorher (Nachladen)
//   profileLocal?: (ctx) => { wall?, saved? } | null   lokale Profilteile fuer profile/put (Vorrang vor dem Server)
//   env?: { audio?: (win) => hostAudio, high?: {op: (c, a, env) => void}, cardSvg?: (code, {lang}) => svgDesc,
//           images?: (win) => { get(src), url(src) } }   Geraetedienste fuer Renderer/Widgets (main.js setzt zusammen)
// }
// Pfade sind absolute Zustandspfade ohne Praefix, z. B. "inhalt.card.view", "inhalt.card.play.over".

import { home } from "../ui/home/feature.js";
import { frei } from "../features/frei/chart.js";   // Strang K: freie Karte, KI-Arten, Deck, KI-Bild
import { posterFeature } from "../engines/poster/feature.js";

export const FEATURES = [
  home,      // Strang H: src/ui/home/feature.js
  frei,      // Strang K: src/features/frei/chart.js
  posterFeature, // Strang P: hohe Poster-Ops (env.high) und Ton (env.audio)
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

/** Karten, die Features fuer ein Ereignis brauchen (Nachladen, ADR 0001 Nachtrag 2). */
export function featureNeeds(ev, ctx, feats = FEATURES) {
  const out = [];
  for (const f of feats) if (typeof f.needs === "function") for (const id of f.needs(ev, ctx) || []) if (typeof id === "string") out.push(id);
  return out;
}
