// Strichdaten fuer die Anzeige (Zeichenflaeche und Abspielen liefert Strang F): reine Funktion aus den dekodierten
// Strichen eines Bildes. Raster 0..63 wie im Link; Farbe und Breite als Index in COLORS/WIDTHS der Engine.
// Abspielen wie im Altcode (alt:src/malrat-ui.js paint/play): Punkt fuer Punkt in Strichreihenfolge, ein einzelner Punkt
// ist ein Klecks, Tempo playStep(lines) ms je Punkt, bei reduzierter Bewegung das ganze Bild sofort.
import { COLORS, WIDTHS, GRID, playStep, count } from "../../engines/malrat/malrat.js";

/**
 * @param {{c:number,w:number,p:number[][]}[]} lines dekodierte Striche (decode)
 * @returns {{grid:number, total:number, stepMs:number, items:{c:number,w:number,color:string,width:number,dot:boolean,from:number,pts:number[][]}[]}}
 *   from: Index des ersten Punktes dieses Strichs in der Abspielreihenfolge; bis Punkt k ist ein Strich mit
 *   min(pts.length, k - from) Punkten gemalt (alt: paint(cv, lines, upTo)).
 */
export function strokeItems(lines) {
  let from = 0;
  const items = lines.map((l) => {
    const it = { c: l.c, w: l.w, color: COLORS[l.c], width: WIDTHS[l.w], dot: l.p.length === 1, from, pts: l.p.map((p) => [p[0], p[1]]) };
    from += l.p.length;
    return it;
  });
  return { grid: GRID, total: count(lines), stepMs: playStep(lines), items };
}

/** Wie viele Punkte jedes Strichs bis zum Abspielschritt k sichtbar sind (0 = Strich noch nicht begonnen). */
export function visibleAt(items, k) { return items.map((it) => Math.max(0, Math.min(it.pts.length, k - it.from))); }
