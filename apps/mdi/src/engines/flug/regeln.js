// Regler des Flugspiels in benannten Stufen statt roher Physikzahlen (alt:src/regeln.js, unveraendert).
// Fuenf Stufen je Regler, die mittlere ist der Standard; eine Stufe ist ein fester Wert innerhalb von RANGES.
import { RANGES } from "./params.js";
export const KEYS = ["gravity", "jump", "gap", "speed"], N = 5;
function r5(v) { return Math.round(v / 5) * 5; }
export function steps(k) { const g = RANGES[k]; return [g[0], r5((g[0] + g[2]) / 2), g[2], r5((g[2] + g[1]) / 2), g[1]]; }
export function level(k, v) {
  const s = steps(k); let best = 0;
  for (let i = 1; i < N; i++) if (Math.abs(s[i] - v) < Math.abs(s[best] - v)) best = i;
  return best;
}
export function value(k, i) { const s = steps(k); return s[Math.max(0, Math.min(N - 1, Math.round(Number(i) || 0)))]; }
