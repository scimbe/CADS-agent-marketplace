// Malt die Zeichenbefehle eines Frames (api.js createDrawer) plus Anzeigeleiste und Hinweisflaechen im App-Look:
// Gelb/Creme/Tinte/Rot, harte Schatten, Radien 16–22 px, Systemschrift. Kein Zustand: alles kommt als Argument.
import { COLORS, W, H, TOP } from "./api.js";

const FONT = "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif";
const SHADOW = 4;

function rrect(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  if (r > 0 && c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
}

/** Ein Befehl. Werte sind von createDrawer bereits geprueft. */
function op(c, o) {
  switch (o[0]) {
    case "clear": c.fillStyle = COLORS[o[1]]; c.fillRect(0, 0, W, H); return;
    case "rect": {
      const [, x, y, w, h, col, round, shadow, line] = o;
      if (shadow) { c.fillStyle = COLORS.ink; rrect(c, x + SHADOW, y + SHADOW, w, h, round); c.fill(); }
      c.fillStyle = COLORS[col]; rrect(c, x, y, w, h, round); c.fill();
      if (line) { c.strokeStyle = COLORS.ink; c.lineWidth = 2; c.stroke(); }
      return;
    }
    case "circle": {
      const [, x, y, r, col, shadow, line] = o;
      if (shadow) { c.fillStyle = COLORS.ink; c.beginPath(); c.arc(x + SHADOW, y + SHADOW, r, 0, 6.283185307179586); c.fill(); }
      c.fillStyle = COLORS[col]; c.beginPath(); c.arc(x, y, r, 0, 6.283185307179586); c.fill();
      if (line) { c.strokeStyle = COLORS.ink; c.lineWidth = 2; c.stroke(); }
      return;
    }
    case "emoji": c.font = o[4] + "px " + FONT; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(o[1], o[2], o[3]); return;
    case "text": c.font = "700 " + o[4] + "px " + FONT; c.textAlign = o[6]; c.textBaseline = "middle"; c.fillStyle = COLORS[o[5]]; c.fillText(o[1], o[2], o[3]); return;
    case "line": c.strokeStyle = COLORS[o[5]]; c.lineWidth = o[6]; c.lineCap = "round"; c.beginPath(); c.moveTo(o[1], o[2]); c.lineTo(o[3], o[4]); c.stroke(); return;
    default: throw new RangeError("paint: unbekannter Befehl " + o[0]);
  }
}

function panel(c, lines) {
  const w = 280, h = 56 + lines.length * 34, x = (W - w) / 2, y = (H - h) / 2;
  c.fillStyle = COLORS.ink; rrect(c, x + 6, y + 6, w, h, 22); c.fill();
  c.fillStyle = COLORS.cream; rrect(c, x, y, w, h, 22); c.fill();
  c.strokeStyle = COLORS.ink; c.lineWidth = 3; c.stroke();
  c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = COLORS.ink;
  lines.forEach((t, i) => { c.font = (i === 0 ? "800 28px " : "600 18px ") + FONT; c.fillText(t, W / 2, y + 40 + i * 34); });
}

/**
 * @param {CanvasRenderingContext2D} c   bereits auf logische Koordinaten skaliert
 * @param {any[]} ops
 * @param {{score:number,lives:number,level:number,over:boolean,won:boolean}} st
 * @param {{paused:boolean, texts:{score:string,level:string,over:string,won:string,again:string,pause:string,resume:string}}} o
 */
export function paint(c, ops, st, o) {
  c.save();
  c.beginPath(); c.rect(0, 0, W, H); c.clip();
  for (const x of ops) op(c, x);
  c.restore();
  // Anzeigeleiste
  c.fillStyle = COLORS.yellow; c.fillRect(0, 0, W, TOP);
  c.fillStyle = COLORS.ink; c.fillRect(0, TOP - 3, W, 3);
  c.font = "800 20px " + FONT; c.textBaseline = "middle"; c.fillStyle = COLORS.ink;
  c.textAlign = "left"; c.fillText(o.texts.score + " " + st.score, 14, TOP / 2);
  c.textAlign = "center"; c.fillText(o.texts.level + " " + st.level, W / 2 + 10, TOP / 2);
  for (let i = 0; i < st.lives; i++) {
    const x = W - 22 - i * 24, y = TOP / 2;
    c.fillStyle = COLORS.red; c.beginPath(); c.arc(x, y, 8, 0, 6.283185307179586); c.fill();
    c.strokeStyle = COLORS.ink; c.lineWidth = 2; c.stroke();
  }
  if (st.over) panel(c, [st.won ? o.texts.won : o.texts.over, o.texts.score + " " + st.score, o.texts.again]);
  else if (o.paused) panel(c, [o.texts.pause, o.texts.resume]);
}
