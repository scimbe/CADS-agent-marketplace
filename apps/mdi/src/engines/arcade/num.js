// Arcade-Mathe: nur exakt spezifizierte Operationen (ECMA-262: + - * / und Math.sqrt sind IEEE-754 korrekt gerundet,
// also auf jeder Engine bitgleich). Die approximierten Math-Funktionen des Altcodes (exp, sin, cos, hypot, pow) werden
// hier durch Reihen aus Grundrechenarten ersetzt, wie logD im SDK (08-forschung/determinismus.md, Befund 1).
// Zahlenmodell numeric:"f64" (ADR 0001 b): der Zustand haelt Gleitkommazahlen, die nur aus exakt spezifizierten
// Operationen entstehen; damit ist jede Partie auf jeder Engine bitgleich und dem Altcode so nah wie moeglich.
// Der Hash serialisiert jede Zahl exakt (Number::toString ist die kuerzeste eindeutige Darstellung, ECMA-262 6.1.6.1.20).
// TODO(strang-f): expD/sinD/cosD liegen ab SDK 0.2 im SDK; dann von dort importieren.
import { fnv1a, rng, sha256 } from "../../contract/sdk.js";

const LN2 = 0.6931471805599453, PI = 3.141592653589793, TWO_PI = 6.283185307179586;

/** e^x nur aus + - * /: Reduktion um k*ln2, Taylorreihe, dann exakte Verdopplung. */
export function expD(x) {
  if (x !== x) throw new RangeError("expD");
  if (x > 700) return Infinity;
  if (x < -745) return 0;
  const k = Math.round(x / LN2), r = x - k * LN2;
  let term = 1, sum = 1;
  for (let n = 1; n < 30; n++) { term = term * r / n; sum = sum + term; }
  if (k > 0) for (let i = 0; i < k; i++) sum = sum * 2;
  else for (let i = 0; i < -k; i++) sum = sum / 2;
  return sum;
}
function reduce(x) { return x - TWO_PI * Math.round(x / TWO_PI); }
/** sin(x), x im Bogenmass, nur + - * / (Taylor nach Reduktion auf [-pi, pi]). */
export function sinD(x) {
  x = reduce(x);
  const x2 = x * x;
  let term = x, sum = x;
  for (let n = 1; n < 22; n++) { term = -term * x2 / ((2 * n) * (2 * n + 1)); sum = sum + term; }
  return sum;
}
export function cosD(x) {
  x = reduce(x);
  const x2 = x * x;
  let term = 1, sum = 1;
  for (let n = 1; n < 22; n++) { term = -term * x2 / ((2 * n - 1) * (2 * n)); sum = sum + term; }
  return sum;
}
export function hypot(a, b) { return Math.sqrt(a * a + b * b); }
/** atan2 aus Grundrechenarten (Reduktion auf |t|<=tan(pi/12), Reihe); nur fuer Zielhilfen und Anzeige. */
export function atan2D(y, x) {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x), ay = Math.abs(y), sw = ay > ax;
  let t = sw ? ax / ay : ay / ax, add = 0;
  const T15 = 0.2679491924311227;   // tan(pi/12)
  if (t > T15) { t = (t - T15) / (1 + t * T15); add = PI / 12; }
  const t2 = t * t; let term = t, sum = t;
  for (let n = 1; n < 40; n++) { term = -term * t2; sum = sum + term / (2 * n + 1); }
  let a = sum + add;
  if (sw) a = PI / 2 - a;
  if (x < 0) a = PI - a;
  return y < 0 ? -a : a;
}
export { PI, TWO_PI };

// ---------- kanonischer Hash fuer f64-Zustaende ----------
/** Schluessel sortiert, Zahlen exakt (auch -0, Infinity), fluechtige Schluessel (skip) fallen auf oberster Ebene weg. */
export function canonF(v, skip) {
  if (v === null || typeof v === "boolean") return JSON.stringify(v);
  if (typeof v === "number") return Object.is(v, -0) ? "-0" : String(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map((x) => canonF(x)).join(",") + "]";
  if (typeof v === "object") return "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined && !(skip && skip.has(k))).map((k) => JSON.stringify(k) + ":" + canonF(v[k])).join(",") + "}";
  throw new TypeError("canonF: " + typeof v);
}
export function hashOf(o, skip) { return sha256(canonF(o, skip)).slice(0, 16); }

// ---------- Zufall nur aus dem Seed ----------
/** 0..1, fest durch den Seed (Altcode arcade.js:11 unit(), FNV-1a auf denselben Bytes bei ASCII-Seeds). */
export function unit(seed, key) { return fnv1a(seed + "|" + key) / 4294967296; }
export function hash32(s) { return fnv1a(s); }
/** Wuerfel des Bots: n-ter Wurf eines Stroms, 0..1. Der Zaehler steht im Zustand, also ist der Bot serialisierbar. */
export function die(seed, n) { return rng(seed + "|" + n).u32() / 4294967296; }
