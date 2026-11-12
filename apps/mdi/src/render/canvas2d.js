// ops2d (ADR 0001 b, Anfrage P): eine strenge Teilmenge der Canvas-2D-API als Daten, damit der Alt-Orakel-Test die
// Aufrufliste des alten render.js direkt mit der neuen vergleichen kann. Nur Methoden/Eigenschaften aus den Listen,
// Argumente nur Zahlen oder Zeichenketten, Farben #rrggbb(aa) oder rgba(). Kein Code aus der Karte.
// Hohe Ops ({op, a}) fuehrt der Ausfuehrer von Strang P aus (src/engines/poster/paint.js), sobald er eingebunden ist;
// bis dahin werden sie als unbekannt gemeldet (info.unknown), nicht still uebergangen.
export const METHODS = new Set(["fillRect", "strokeRect", "clearRect", "beginPath", "closePath", "moveTo", "lineTo", "arc", "arcTo", "ellipse", "bezierCurveTo", "quadraticCurveTo", "rect", "roundRect", "fill", "stroke", "clip", "save", "restore", "translate", "rotate", "scale", "setTransform", "fillText", "strokeText", "setLineDash"]);
export const PROPS = new Set(["fillStyle", "strokeStyle", "lineWidth", "lineCap", "lineJoin", "globalAlpha", "font", "textAlign", "textBaseline", "shadowColor", "shadowBlur", "shadowOffsetX", "shadowOffsetY", "globalCompositeOperation", "miterLimit"]);
const COLOR = /^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/;
const ENUMS = { lineCap: ["butt", "round", "square"], lineJoin: ["round", "bevel", "miter"], textAlign: ["left", "right", "center", "start", "end"], textBaseline: ["top", "middle", "alphabetic", "bottom", "hanging", "ideographic"], globalCompositeOperation: ["source-over", "lighter", "multiply", "screen", "destination-out", "source-atop"] };
const FONT = /^(italic |bold |normal |[1-9]00 ){0,3}\d{1,3}(\.\d+)?px [A-Za-z0-9 ,'"-]{1,200}$/;

function okArg(a) { return (typeof a === "number" && Number.isFinite(a)) || (typeof a === "string" && a.length <= 300) || (Array.isArray(a) && a.length <= 8 && a.every((x) => typeof x === "number" && Number.isFinite(x))); }
function okProp(p, v) {
  if (p === "fillStyle" || p === "strokeStyle" || p === "shadowColor") return typeof v === "string" && COLOR.test(v);
  if (p === "font") return typeof v === "string" && FONT.test(v);
  if (ENUMS[p]) return ENUMS[p].includes(v);
  return typeof v === "number" && Number.isFinite(v);
}

/** @returns {number} ausgefuehrte Ops */
export function exec2d(c, list, env) {
  let n = 0, depth = 0;
  const budget = Math.max(0, env.budget === undefined ? 4000 : env.budget), unknown = env.unknown || [];
  for (const op of list) {
    if (n >= budget) break;
    n++;
    if (!op || typeof op !== "object") { unknown.push("ops2d:?"); continue; }
    if (typeof op.m === "string") {
      const a = Array.isArray(op.a) ? op.a : [];
      if (!METHODS.has(op.m) || !a.every(okArg)) { unknown.push("ops2d:" + op.m); continue; }
      if (op.m === "save") { if (depth > 64) { unknown.push("ops2d:save-tief"); continue; } depth++; }
      if (op.m === "restore") { if (depth === 0) { unknown.push("ops2d:restore"); continue; } depth--; }
      c[op.m](...a);
    } else if (typeof op.p === "string") {
      if (!PROPS.has(op.p) || !okProp(op.p, op.v)) { unknown.push("ops2d:" + op.p); continue; }
      c[op.p] = op.v;
    } else if (typeof op.op === "string") {
      if (env.high && typeof env.high[op.op] === "function") env.high[op.op](c, op.a, env);
      else unknown.push("ops2d:" + op.op);
    } else unknown.push("ops2d:?");
  }
  while (depth-- > 0) c.restore();
  return n;
}
