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
//   context?: (saved) => object                Anfangswerte im ctx; saved.feat[id] = eigener Speicher (siehe store)
//   store?: true                               eigener Geraetespeicher: die Laufzeit liest storage.loadFeature(id) beim Start
//                                              (saved.feat[id], sonst null); schreiben im Effekt ueber
//                                              deps.storage.saveFeature(id, objekt) (<= 8 KiB JSON, sonst false)
//   persist?: (ctx, now) => objekt|null        Stand, den die Laufzeit vor dem Anmelde-Gate (konto.login) sichert (mit store);
//                                              saved.now ist beim naechsten Start die Uhrzeit (Ablauf pruefen)
//   effects?: { typ: (fx, { dispatch, state, api, deps }) => void }
//   needs?: (ev, ctx) => [kartenId…]   Karten, die ein Ereignis braucht; die Laufzeit laedt sie vorher (Nachladen)
//   needParts?: (ev, ctx) => [teilName…]  Feature-Teile (src/app/feature-parts.json), die ein Ereignis braucht; die
//                                              Laufzeit laedt sie vorher (LOADING, sonst PART_FAIL mit Wiederholen);
//                                              danach liefert partOf(name) (src/gen/fparts.js) das Modul synchron
//   profileLocal?: (ctx) => { wall?, saved? } | null   lokale Profilteile fuer profile/put (Vorrang vor dem Server)
//   env?: { audio?: (win) => hostAudio, high?: {op: (c, a, env) => void}, cardSvg?: (code, {lang}) => svgDesc,
//           images?: (win) => { get(src), url(src) } }   Geraetedienste fuer Renderer/Widgets (main.js setzt zusammen);
//           audio/images bekommen als zweites Argument { part: (name) => Promise<Modul> } (Feature-Teil nachladen)
// }
// Pfade sind absolute Zustandspfade ohne Praefix, z. B. "inhalt.card.view", "inhalt.card.play.over".

import tisch from "../engines/tisch/feature.js";   // Strang T: Kartenbild fuer pcard
import { home } from "../ui/home/feature.js";
import { frei } from "../features/frei/chart.js";   // Strang K: freie Karte, KI-Arten, Deck, KI-Bild
import { posterFeature } from "../engines/poster/feature.js";

export const FEATURES = [
  tisch,     // Strang T: Kartenbild fuer pcard (env.cardSvg)
  home,      // Strang H: src/ui/home/feature.js
  frei,      // Strang K: src/features/frei/chart.js
  posterFeature, // Strang P: hohe Poster-Ops (env.high) und Ton (env.audio)
];

/** Geraetedienste aller Features zusammensetzen (doppelte Dienste sind ein Fehler). */
export function featureEnv(win, feats = FEATURES, svc = {}) {
  const out = {};
  for (const f of feats) for (const [k, v] of Object.entries(f.env || {})) {
    if (k in out) throw new Error("feature " + f.id + ": Dienst " + k + " doppelt");
    out[k] = typeof v === "function" && (k === "audio" || k === "images") ? v(win, svc) : v;
  }
  return out;
}

/** Feature-Teile, die Features fuer ein Ereignis brauchen (ADR 0001 Nachtrag 4). */
export function featureNeedParts(ev, ctx, feats = FEATURES) {
  const out = [];
  for (const f of feats) if (typeof f.needParts === "function") for (const n of f.needParts(ev, ctx) || []) if (typeof n === "string") out.push(n);
  return [...new Set(out)];
}

/** Karten, die Features fuer ein Ereignis brauchen (Nachladen, ADR 0001 Nachtrag 2). */
export function featureNeeds(ev, ctx, feats = FEATURES) {
  const out = [];
  for (const f of feats) if (typeof f.needs === "function") for (const id of f.needs(ev, ctx) || []) if (typeof id === "string") out.push(id);
  return out;
}
