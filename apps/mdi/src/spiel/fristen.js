// Fristen der Spiel-Sandbox: eine Quelle fuer Rahmen (spiel-frame.js) und Host (spiel-host.js).
//  - Fenster: hoechster Abstand zwischen zwei Lebenszeichen des Workers, je Phase. Ein Fenster misst "haengt der Code?".
//  - Gesamtfrist: ab Start bis Bericht, waechst mit der Arbeit (workSteps), wird von Fortschritt NIE verlaengert. Sie misst
//    "rechnet der Code ewig, wenn auch mit Lebenszeichen?".
// Grundlage beider ist das Leistungsbudget der Abnahme (THRESHOLDS.p95Ms je Schritt): ein Spiel, das dieses Budget haelt,
// darf an keiner Frist scheitern; es scheitert hoechstens an checks.performance – mit dem richtigen Grund.
import { CONTROLS } from "./api.js";
import { GREEDY } from "./bots.js";
import { THRESHOLDS, workSteps } from "./pruefung.js";

const MAX_ACTS = 2 * CONTROLS.length;
/** Ein Greedy-Bot-Frame spielt bis zu MAX_ACTS * horizon Schritte voraus, bevor er Fortschritt meldet. */
const GREEDY_UNIT_MS = MAX_ACTS * GREEDY.horizon * THRESHOLDS.p95Ms;

export const FRISTEN = Object.freeze({
  fenster: Object.freeze({
    load: 3000, // Modul laden + init bis zur ersten Meldung
    tick: 1000, // Spielmodus: ein Paket Ticks
    bots: Math.max(2500, 2 * GREEDY_UNIT_MS), // Meldung je Bot-Frame, der teuerste ist ein Greedy-Entscheid
    eingaben: 2500, // Meldung je Spielschritt
    determinismus: 2500,
    neustart: 2500,
    szenarien: 2500
  }),
  /** Gesamtfrist = Ladefenster + Spielschritte * p95-Budget * faktor */
  faktor: 1.5,
  /** Der Host wartet so viel laenger als der Rahmen, damit der Rahmen mit genauerem Grund zuerst meldet. */
  hostZugabeMs: 3000
});

/**
 * Fristen mit Abweichungen (nur fuer Tests, z. B. kurze Gesamtfrist). Unbekannte Schluessel werfen.
 * @param {{faktor?: number, hostZugabeMs?: number, fenster?: Record<string, number>}} [over]
 */
export function mitFristen(over = {}) {
  for (const k of Object.keys(over)) if (!(k in FRISTEN)) throw new RangeError("Fristen: unbekannter Schluessel " + k);
  const fenster = { ...FRISTEN.fenster, ...(over.fenster || {}) };
  for (const k of Object.keys(fenster)) if (!(k in FRISTEN.fenster)) throw new RangeError("Fristen: unbekanntes Fenster " + k);
  return Object.freeze({ ...FRISTEN, ...over, fenster: Object.freeze(fenster) });
}

/** Gesamtfrist einer Pruefung im Rahmen (ms), fuer die unguenstigste Steuerung (alle fuenf). */
export function gesamtfristMs(seconds, f = FRISTEN) {
  const w = workSteps(seconds, CONTROLS.length);
  return f.fenster.load + Math.ceil((w.bots + w.eingaben + w.determinismus + w.neustart + w.szenarien) * THRESHOLDS.p95Ms * f.faktor);
}

/** Gesamtfrist im Host (ms): Rahmen-Frist plus Zugabe. */
export function hostFristMs(seconds, f = FRISTEN) {
  return gesamtfristMs(seconds, f) + f.hostZugabeMs;
}
