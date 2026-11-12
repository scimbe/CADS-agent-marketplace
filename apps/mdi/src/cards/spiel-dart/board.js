// Brett und Wurf-Hilfen fuer die Dart-Oberflaeche als reine Daten (kein DOM): Canvas-Anzeigeliste nach ADR 0001
// „Canvas-Anzeigeliste“ ({t:"canvas", w, h, layers}) und die Werte fuer die Widgets aim/power (ADR 0001 c).
// Koordinaten: Flaeche 2640 × 2640 = Zielflaeche des Altcodes (alt dart-ui.js EXT = 1.32 Brettradien je Seite),
// Brettmitte (1320, 1320), 1000 = Aussenkante des Doppelrings (170 mm), y nach unten. Das aim-Widget rechnet die
// Zeigerposition linear ueber genau diese Flaeche (grid 2641 = Werte 0..2640); Flaechenpunkt + 728 = Altraster 0..4095
// (Tausendstel Radius um 2048), wie alt px() auf ±EXT begrenzt.
// Winkel der Ringsektoren in Umdrehungen wie src/render/canvas.js arc: 0 = oben (12 Uhr), im Uhrzeigersinn.
// Farben sind Token-Namen (src/contract/tokens.js).
import * as D from "../../engines/dart/dart.js";
import { fmt } from "../../engines/seed32/seed32.js";

export const SIZE = 2640, MID = 1320, GRID = SIZE + 1, OFF = 2048 - MID;
const k = (v) => Math.round(v * 1000);
// Grad im Uhrzeigersinn von oben -> Umdrehungen ab 12 Uhr im Uhrzeigersinn, in [0, 1)
function turnsOf(deg) { const t = deg / 360; return t - Math.floor(t); }

/** Hintergrund-Ebene: Ringe, 80 Ringsektoren, Zahlen, Bull. Haengt nur von nichts ab (Schluessel fest). */
export function boardOps() {
  const ops = [{ o: "circle", x: MID, y: MID, r: MID, fill: "ink" }];
  const rings = [[D.R.D_IN, 1, "d"], [D.R.T_OUT, D.R.D_IN, "s"], [D.R.T_IN, D.R.T_OUT, "t"], [D.R.OUTER, D.R.T_IN, "i"]];
  D.ORDER.forEach((n, i) => {
    const a0 = turnsOf(18 * i - 9), a1 = turnsOf(18 * i + 9), even = i % 2 === 0;
    for (const [r0, r1, ring] of rings) {
      const fill = ring === "d" || ring === "t" ? (even ? "red" : "yellow") : (even ? "ink" : "paper");
      ops.push({ o: "arc", x: MID, y: MID, r: k(r1), r0: k(r0), a0, a1: a1 > a0 ? a1 : a1 + 1, fill, stroke: "muted", lw: 2 });
    }
    const c = D.dir(2 * i);
    ops.push({ o: "text", x: MID + k(c[0] * 1.08), y: MID + k(c[1] * 1.08), text: String(n), size: 80, font: "brand", align: "center", base: "middle", fill: "paper" });
  });
  ops.push({ o: "circle", x: MID, y: MID, r: k(D.R.OUTER), fill: "yellow" }, { o: "circle", x: MID, y: MID, r: k(D.R.BULL), fill: "red" });
  return ops;
}

/** Pfeile der Partie (aus pub nachgerechnet): Punkte mit Farbe je Sitz; der juengste Pfeil groesser. */
export function dartOps(pub) {
  const g = pub && D.sim(pub.seed, pub.s), ops = [];
  if (!g) return ops;
  const all = []; g.turns.forEach((t) => t.d.forEach((h) => all.push([t.p, h])));
  // nur die laufende und die vorige Aufnahme stecken noch im Brett (alt dart-ui: Pfeile der letzten Aufnahmen)
  const keep = g.turns.slice(-2).reduce((a, t) => a + t.d.length, 0);
  all.slice(-keep).forEach(([p, h], i, arr) => {
    const x = MID + k(h.x), y = MID + k(h.y), last = i === arr.length - 1;
    ops.push({ o: "circle", x, y, r: last ? 34 : 24, fill: p === 0 ? "paper" : "yellow", stroke: "ink", lw: 8 });
  });
  return ops;
}

/** Zitterbahn des Fadenkreuzes fuer Pfeil k (nur Bild, die Streuung haengt nicht vom Zeitpunkt ab): 64 Stuetzpunkte
 *  in Flaechen-Koordinaten relativ zum Ziel, ein Schritt je STEP_MS. */
export function wobbleFrames(seed, kDart) {
  const h = D.hand(seed, kDart), out = [];
  for (let t = 0; t < D.STEPS; t++) { const w = D.wobble(h, t); out.push([k(w[0]), k(w[1])]); }
  return out;
}

/** Die ganze Canvas-Wurzel fuer view: Hintergrund (gecacht) und Pfeile. Das Fadenkreuz zeichnet das aim-Widget selbst;
 *  die Zitterbahn (wobbleFrames) liegt als Datenreihe bereit, sobald das Widget sie abspielen kann (offen bei F). */
export function canvas(pub, lang) {
  const layers = [{ id: "brett", key: "dart-brett-2", ops: boardOps() }, { id: "pfeile", ops: dartOps(pub) }];
  return { t: "canvas", w: SIZE, h: SIZE, ratio: "1:1", layers, a11y: D.T(lang).da_board };
}

/** Flaechenpunkt des aim-Widgets (0..2640) -> Altraster (0..4095); 1 Einheit = 1/1000 Radius auf beiden Seiten. */
export function gridOf(x, y) { return [x + OFF, y + OFF]; }
/** Altraster -> Flaechenpunkt, begrenzt auf die Zielflaeche (alt px). */
export function surfOf(ax, ay) { return [Math.max(0, Math.min(SIZE, ax - OFF)), Math.max(0, Math.min(SIZE, ay - OFF))]; }

/** Zahlen fuer „Zielen auf“ (alt dart-ui.js, Tastatur/Schalter): frei, Bullseye, Bull, 20..1 – hoechstens 24 Optionen. */
export function aimNumbers(lang) {
  const X = D.T(lang), out = [{ v: "", label: X.da_aim_free }, { v: "50", label: X.da_s_50 }, { v: "25", label: X.da_s_25 }];
  for (let n = 20; n >= 1; n--) out.push({ v: String(n), label: String(n) });
  return out;
}
/** Ringe zu einer Zahl: Triple, Double, Single (alt: drei Felder je Zahl). */
export function aimRings(n, lang) {
  const X = D.T(lang);
  return [{ v: "t" + n, label: fmt(X.da_s_3, { n }) }, { v: "d" + n, label: fmt(X.da_s_2, { n }) }, { v: "s" + n, label: fmt(X.da_s_1, { n }) }];
}
/** Alle 63 Felder wie im Altcode (frei, 50, 25, dann je Zahl T/D/S). */
export function aimOptions(lang) {
  const out = aimNumbers(lang).slice(0, 3);
  for (let n = 20; n >= 1; n--) out.push(...aimRings(n, lang));
  return out;
}
/** Zielpunkt einer Option als Flaechenpunkt 0..2640 des aim-Widgets (null fuer „frei“). */
export function aimGrid(v) {
  if (!v) return null;
  const c = v === "50" ? D.centre(25, "b") : v === "25" ? D.centre(25, "o") : D.centre(Number(v.slice(1)), v[0]);
  const d = D.dart(c[0], c[1], D.MID);
  return surfOf(d.ax, d.ay);
}
/** Pendelstufe zur Zeit ms ab Start des Haltens (Startstufe aus dem Seed: hand(seed, k).lv). */
export function powerAt(seed, kDart, ms) { return D.swing(D.hand(seed, kDart).lv, ms); }
