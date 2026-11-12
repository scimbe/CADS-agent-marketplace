// „Mit Foto als Bild teilen“ (Entscheidung Integrator 2026-11-12): Die Karte wird mit dem eigenen Foto als Bild gezeichnet und
// ueber das Teilen-Menue des Systems oder als Download angeboten (Teilen-Blatt: Strang H). Kein Upload, keine id im Link; der
// Link bleibt fotofrei. Hier nur das Zeichnen: canvas-Knoten der Karte -> Leinwand in voller Groesse, Sticker aus Noto Emoji
// (Systemglyphen duerfen nicht ins veroeffentlichte Bild, alt render.js stickers/exporting).
import { HIGH } from "./paint.js";
import { OP_METHODS, OP_PROPS } from "./compile.js";

const NAMES = ["photo", "gi"];
/** Wartet, bis die Bilder des Knotens geladen sind (Bilddienst env.images: get(src) | subscribe(fn)); Fehler mit code. */
function ready(node, images, ms) {
  const need = NAMES.filter((n) => node.src && node.src[n]);
  const have = () => need.every((n) => images.get(node.src[n]));
  if (!need.length || have()) return Promise.resolve();
  return new Promise((ok, no) => {
    let off = null, t = null;
    const done = (e) => { if (off) off(); clearTimeout(t); if (e) no(e); else ok(); };
    const check = () => { if (have()) done(); };
    off = images.subscribe ? images.subscribe(check) : null;
    t = setTimeout(() => { const e = new Error("Bild fehlt"); e.code = need.includes("photo") ? "foto-fehlt" : "bild-fehlt"; done(e); }, ms);
    check();
  });
}

/**
 * @param {{t:"canvas", w:number, h:number, ops2d:object[], src?:object}} node canvas-Knoten aus der Anzeigeliste der Karte
 * @param {{images:{get(src):CanvasImageSource|null, subscribe?(fn):Function}, makeCanvas:(w:number,h:number)=>HTMLCanvasElement,
 *          scale?:number, timeout?:number}} env
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function posterImage(node, env) {
  if (!node || node.t !== "canvas" || !Array.isArray(node.ops2d)) throw Object.assign(new Error("kein Poster"), { code: "kein-poster" });
  if (!node.src || !node.src.photo) throw Object.assign(new Error("kein Foto gewaehlt"), { code: "foto-fehlt" });
  await ready(node, env.images, env.timeout || 8000);
  const k = env.scale || 2, cv = env.makeCanvas(Math.round(node.w * k), Math.round(node.h * k)), c = cv.getContext("2d");
  c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, node.w, node.h);
  const assets = { noto: env.images.get({ kind: "asset", id: "noto" }) };
  for (const n of NAMES) if (node.src[n]) assets[n] = env.images.get(node.src[n]);
  const x = { assets, parts: null, makeCanvas: env.makeCanvas, cache: {} };
  for (const o of node.ops2d) {
    if (o.m) { if (OP_METHODS.includes(o.m)) c[o.m](...o.a); continue; }
    if (o.p) { if (OP_PROPS.includes(o.p)) c[o.p] = o.v; continue; }
    // Sticker im veroeffentlichten Bild nur aus Noto Emoji (alt render.js: Render.exporting)
    if (o.op === "glyph") { HIGH.glyph(c, [o.a[0], o.a[1], 1], x); continue; }
    if (HIGH[o.op]) HIGH[o.op](c, o.a, x);
  }
  return cv;
}
export { imageName } from "./card.js";
