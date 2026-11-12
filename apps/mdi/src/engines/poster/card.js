// Gemeinsamer Kartenbaustein der Poster-Engine fuer statische Karten (advent-tuer, foto-*, beat-*, stimme-verzerren und
// die Kategorien card/meme der freien Karte): Parameter -> Poster-Dokument -> Canvas-Knoten der Anzeigeliste.
import { sanitizePoster, PAIR_HEX } from "./doc.js";
import { compile, FORMATS } from "./compile.js";
import { early, doorNumber, civil } from "./door.js";

/** Tuernummer aus dem UTC-Tag (alt daily.js doorNumber). */
export function doorOf(today) { return doorNumber(today); }

/** Parameter einer Poster-Karte -> bereinigtes Dokument. Fremde Felder fallen weg (sanitizePoster). */
export function docOf(kind, p) {
  return sanitizePoster({
    k: kind, col: PAIR_HEX[p.pair] || PAIR_HEX.p0, x: p.x, y: p.y, st: p.st, sk: p.sk, w: p.w, gi: p.gi && p.gi.p ? p.gi : undefined,
    nr: kind === "card" && p.nr ? p.nr : undefined, m: p.m, fx: p.fx, tp: p.tp, bpm: p.bpm, p: p.p
  });
}

/**
 * Canvas-Knoten (ADR 0001 b, Format ops2d = Aufzeichnung der Canvas-2D-Teilmenge, siehe compile.js).
 * @param {object} doc Poster-Dokument
 * @param {{format?:"4:5"|"16:9", nick?:string, photo?:boolean, peaks?:number[], a11y:string, part?:string}} o
 */
export function canvasNode(doc, o) {
  const [W, H] = FORMATS[o.format || "4:5"];
  const list = compile(doc, { W, H, nick: o.nick, photo: !!o.photo, gi: !!(doc.gi && doc.gi.p), peaks: o.peaks });
  const src = {};
  if (o.photo) src.photo = { kind: "local", slot: "photo" };
  if (doc.gi && doc.gi.p) src.gi = { kind: "server", ref: doc.gi.p };
  return { t: "canvas", w: W, h: H, ratio: o.format || "4:5", ops2d: list.ops, src, assets: ["noto"], a11y: o.a11y, part: o.part || "bild" };
}
export { early, civil, FORMATS };
