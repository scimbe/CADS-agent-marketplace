// Arcade-Mathe: nur exakt spezifizierte Operationen (ECMA-262: + - * / und Math.sqrt sind IEEE-754 korrekt gerundet,
// also auf jeder Engine bitgleich). Zahlenmodell numeric:"f64" (ADR 0001 b). Die approximierten Math-Funktionen des
// Altcodes (exp, sin, cos, hypot) ersetzen expD/sinD/cosD aus dem SDK 0.2 und sqrt(x*x+y*y).
import { fnv1a, rng, stateHashF, expD, sinD, cosD } from "../../contract/sdk.js";

export const PI = 3.141592653589793;
export { expD, sinD, cosD };
export function hypot(a, b) { return Math.sqrt(a * a + b * b); }
/** Kanonischer Hash eines f64-Zustands (SDK stateHashF); skip: fluechtige Schluessel auf oberster Ebene. */
export function hashOf(o, skip) {
  if (!skip) return stateHashF(o);
  const r = {}; for (const k of Object.keys(o)) if (!skip.has(k)) r[k] = o[k];
  return stateHashF(r);
}

// ---------- Zufall nur aus dem Seed ----------
/** 0..1, fest durch den Seed (Altcode arcade.js:11 unit(), FNV-1a auf denselben Bytes bei ASCII-Seeds). */
export function unit(seed, key) { return fnv1a(seed + "|" + key) / 4294967296; }
export function hash32(s) { return fnv1a(s); }
/** Wuerfel des Bots: n-ter Wurf eines Stroms, 0..1. Der Zaehler steht im Zustand, also ist der Bot serialisierbar. */
export function die(seed, n) { return rng(seed + "|" + n).u32() / 4294967296; }
