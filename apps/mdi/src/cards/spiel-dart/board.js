// Brett und Wurf-Hilfen fuer die Dart-Oberflaeche, als reine Daten (kein DOM). Die Zeichnung uebernimmt der
// Canvas-Renderer aus Strang F; bis dahin ist dies die vereinbarte Anzeigeliste:
//   { k:"circle", r, fill } | { k:"sector", r0, r1, a0, a1, fill } | { k:"line", x1, y1, x2, y2 } | { k:"text", x, y, text }
//   | { k:"dart", x, y, seat, label }
// Koordinaten in Tausendsteln des Brettradius (Ganzzahlen), viewBox -1150..1150, y nach unten; Winkel in Grad im
// Uhrzeigersinn von oben. Farben sind Token-Namen (src/contract/tokens.js).
import * as D from "../../engines/dart/dart.js";
import { fmt } from "../../engines/seed32/seed32.js";

export const VIEWBOX = [-1150, -1150, 2300, 2300];
const k = (v) => Math.round(v * 1000);

/** Ringe, Segmente, Zahlen und die Pfeile der Partie (aus pub nachgerechnet). */
export function boardItems(pub, lang) {
  const out = [{ k: "circle", r: 1150, fill: "ink" }];
  const rings = [[D.R.D_IN, 1, "d"], [D.R.T_OUT, D.R.D_IN, "s"], [D.R.T_IN, D.R.T_OUT, "t"], [D.R.OUTER, D.R.T_IN, "i"]];
  D.ORDER.forEach((n, i) => {
    const a0 = 18 * i - 9, a1 = 18 * i + 9, even = i % 2 === 0;
    for (const [r0, r1, ring] of rings) {
      const fill = ring === "d" || ring === "t" ? (even ? "red" : "yellow") : (even ? "ink" : "paper");
      out.push({ k: "sector", r0: k(r0), r1: k(r1), a0, a1, fill, n, ring });
    }
    const c = D.dir(2 * i);
    out.push({ k: "text", x: k(c[0] * 1.08), y: k(c[1] * 1.08), text: String(n) });
  });
  out.push({ k: "circle", r: k(D.R.OUTER), fill: "yellow" }, { k: "circle", r: k(D.R.BULL), fill: "red" });
  const g = pub && D.sim(pub.seed, pub.s);
  if (g) g.turns.forEach((t) => t.d.forEach((h) => out.push({ k: "dart", x: k(h.x), y: k(h.y), seat: t.p, label: D.spoken(h, lang) })));
  return out;
}

/** "Zielen auf" fuer Tastatur und Schalter (alt dart-ui.js): frei, Bullseye, Bull 25, dann 20..1 je Triple/Double/Single. */
export function aimOptions(lang) {
  const X = D.T(lang), opts = [{ v: "", label: X.da_aim_free }, { v: "50", label: X.da_s_50 }, { v: "25", label: X.da_s_25 }];
  for (let n = 20; n >= 1; n--) opts.push({ v: "t" + n, label: fmt(X.da_s_3, { n }) }, { v: "d" + n, label: fmt(X.da_s_2, { n }) }, { v: "s" + n, label: fmt(X.da_s_1, { n }) });
  return opts;
}
/** Zielpunkt einer Option als Raster 0..4095 (null fuer "frei"). */
export function aimGrid(v) {
  if (!v) return null;
  const c = v === "50" ? D.centre(25, "b") : v === "25" ? D.centre(25, "o") : D.centre(Number(v.slice(1)), v[0]);
  const d = D.dart(c[0], c[1], D.MID);
  return [d.ax, d.ay];
}
/** Ein Pfeil aus UI-Werten: Ziel im Raster 0..4095, Kraftstufe 0..8, slider = am Regler ohne Timing gesetzt. */
export function dartChars(ax, ay, p, slider) {
  if (![ax, ay].every((v) => Number.isInteger(v) && v >= 0 && v <= 4095) || !Number.isInteger(p) || p < 0 || p >= D.LEVELS) throw new RangeError("dart: Eingabe");
  const d = { ax, ay, p }; if (slider) d.f = 1;
  return D.enc(d);
}
/** Die Aufnahme als Zug; claim = Punkte, die der Bildschirm zeigte; name nur, wenn gesetzt. */
export function turnInput(seat, chars, claim, name) {
  const x = { t: "turn", seat, d: chars.join(""), c: claim };
  if (name) x.n = name;
  return x;
}
/** Pendelstufe zur Zeit ms ab Start des Haltens (Startstufe aus dem Seed: hand(seed, k).lv). */
export function powerAt(seed, k, ms) { return D.swing(D.hand(seed, k).lv, ms); }
/** Wo das Fadenkreuz zur Zeit ms zittert (nur Bild, Raster-Tausendstel). */
export function wobbleAt(seed, k, ms) { const w = D.wobble(D.hand(seed, k), (ms / D.STEP_MS) % D.STEPS); return [k2(w[0]), k2(w[1])]; }
function k2(v) { return Math.round(v * 1000); }
