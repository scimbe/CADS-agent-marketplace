// Ein Daumen je Spiel, im eigenen Bezugssystem (Port von alt:src/arcade-ui.js:418-467), dazu Tastatur fuer jedes Spiel
// (Altcode-Luecke: nur Zeiger). Eingabe des Hosts je Tick (ADR 0001 b): { b, ax, ay, p:[[id,x,y,f]] }, f: bit0 unten,
// bit1 neu gedrueckt, bit2 losgelassen. Die Gestenerinnerung (wo der Finger aufsetzte, Wischspur, Zielpunkte) liegt im
// Zustand (ctl), damit die Partie rein und wiederholbar bleibt.
import { W, H, num, mineTurn } from "./core.js";
import { sinD, cosD, PI } from "./num.js";
import { VOLLEY } from "./volley.js";
import { ELF } from "./elfer.js";
import { STOCK } from "./stock.js";
import { MURMEL } from "./murmel.js";
import { PANZER, tankPos } from "./panzer.js";

// Jede Handlung hat einen echten Bildschirmknopf (zone "button", Design Phase C, Befund Schwere 4: Bedienung ohne
// Wischen) und Tasten; Ziehen und Tippen auf dem Feld bleibt der zweite Weg. Links/rechts sind die Achse x, die der
// Host als zwei Knoepfe zeichnet; hoch/runter, Kraft und Kurve sind Halte-Knoepfe, damit kein Spiel eine y-Achse braucht.
const K = (id, kind, keys, de, en, extra) => Object.assign({ id, kind, keys, zone: "button", label: { de, en } }, extra || {});
const AX = { keys: ["ArrowLeft", "ArrowRight"] };
const UP = (de, en) => K("up", "hold", ["ArrowUp", "KeyW"], de, en), DOWN = (de, en) => K("down", "hold", ["ArrowDown", "KeyS"], de, en);
/** rt.controls je Spiel (Manifest). Reihenfolge der Knoepfe = Bits in b; die Abbildung liest sie ueber die id. */
export const CONTROLS = {
  puck: { buttons: [UP("Hoch", "Up"), DOWN("Runter", "Down")], axes: { x: AX }, pointer: { max: 1 } },
  ziegel: { buttons: [], axes: { x: AX }, pointer: { max: 1 } },
  volley: { buttons: [K("jump", "pulse", ["Space", "ArrowUp", "KeyW"], "Springen", "Jump")], axes: { x: AX }, pointer: { max: 1 } },
  kick: { buttons: [K("kick", "pulse", ["Space", "ArrowUp", "KeyW"], "KICK", "KICK")], axes: { x: AX }, pointer: { max: 1 } },
  snow: { buttons: [K("fire", "pulse", ["Space", "ArrowUp", "KeyW"], "Werfen", "Throw")], axes: { x: AX }, pointer: { max: 1 } },
  flipper: {
    buttons: [K("left", "hold", ["ArrowLeft", "KeyA", "KeyZ"], "LINKS TIPPEN", "TAP LEFT"), K("right", "hold", ["ArrowRight", "KeyD", "KeyM"], "RECHTS TIPPEN", "TAP RIGHT")],
    pointer: { max: 2 }
  },
  panzer: { buttons: [UP("Steiler", "Steeper"), DOWN("Flacher", "Flatter"), K("fire", "pulse", ["Space", "Enter"], "Feuer", "Fire")], axes: { x: AX }, pointer: { max: 1 } },
  elfer: { buttons: [UP("Kurve links", "Curve left"), DOWN("Kurve rechts", "Curve right"), K("shoot", "pulse", ["Space", "Enter"], "Schießen", "Shoot")], axes: { x: AX }, pointer: { max: 1 } },
  stock: { buttons: [UP("Stärker", "Harder"), DOWN("Sanfter", "Softer"), K("throw", "pulse", ["Space", "Enter"], "Werfen", "Throw")], axes: { x: AX }, pointer: { max: 1 } },
  murmel: {
    buttons: [UP("Stärker", "Harder"), DOWN("Sanfter", "Softer"), K("throw", "pulse", ["Space", "Enter"], "Schießen", "Shoot"), K("sl", "hold", ["KeyQ"], "Start links", "Start left"), K("sr", "hold", ["KeyE"], "Start rechts", "Start right")],
    axes: { x: AX }, pointer: { max: 1 }
  }
};

export function ctlInit() { return { down: null, pts: {}, aim: null, swipe: null, kAng: 0, kPow: 0.5, kx: null, from: W / 2 }; }
function bitAt(inp, i) { return i >= 0 && !!inp && ((inp.b | 0) >> i & 1) === 1; }
function ax(inp) { return inp && num(inp.ax) ? Math.max(-1000, Math.min(1000, inp.ax)) / 1000 : 0; }
const IDX = {};
for (const g of Object.keys(CONTROLS)) { IDX[g] = {}; CONTROLS[g].buttons.forEach((b, i) => { IDX[g][b.id] = i; }); }
/** Knopf nach id (Bit aus der Reihenfolge in CONTROLS). */
function btn(g, inp, id) { return bitAt(inp, IDX[g][id] === undefined ? -1 : IDX[g][id]); }
/** hoch/runter aus den Halte-Knoepfen: -1 hoch, +1 runter (wie frueher die y-Achse). */
function ay(g, inp) { return (btn(g, inp, "down") ? 1 : 0) - (btn(g, inp, "up") ? 1 : 0); }
function pointers(inp) { return inp && Array.isArray(inp.p) ? inp.p.filter((q) => Array.isArray(q) && q.length === 4 && q.every(num)).slice(0, 4) : []; }

/**
 * Bildet die Host-Eingabe eines Ticks auf Spieleingaben ab und ruft apply(gameInput) fuer jede.
 * S: die Seite dieses Sitzes (eigenes Bezugssystem), c: ihre Gestenerinnerung (wird veraendert).
 */
export function mapInput(g, c, S, inp, apply0, comfort) {
  const k = S.t;
  // Gemuetlich spielen (Design Phase C): ein Doppeltippen zaehlt einmal – dieselbe Tipp-Handlung innerhalb von 0,3 s
  // Spielzeit wird verworfen. Halten (Flipper, Laufen) bleibt unberuehrt.
  const apply = !comfort ? apply0 : (gi) => {
    if (!c.pulse) c.pulse = {};
    for (const key of ["kick", "jump", "fire", "shot"]) if (gi[key]) { if (c.pulse[key] !== undefined && k - c.pulse[key] < 0.3) delete gi[key]; else c.pulse[key] = k; }
    apply0(gi);
  };
  for (const [id, x, y, f] of pointers(inp)) {
    const p = { x, y }, press = (f & 2) === 2, held = (f & 1) === 1, rel = (f & 4) === 4;
    if (g === "flipper") { if (rel) delete c.pts[id]; else if (held || press) c.pts[id] = x; continue; }
    if (press) down(g, c, S, p, k, apply);
    else if (held && c.down) move(g, c, S, p, apply);
    if (rel && c.down) up(g, c, S, p, k, apply);
  }
  if (g === "flipper") {
    let l = btn(g, inp, "left"), r = btn(g, inp, "right");
    for (const id of Object.keys(c.pts)) { if (c.pts[id] < W / 2) l = true; else r = true; }
    apply({ flip: [l, r] });
    return;
  }
  keys(g, c, S, inp, apply);
}
function down(g, c, S, p, k, apply) {
  c.down = { x: p.x, y: p.y, k, path: [[p.x, p.y]], from: null, shot: null };
  if (g === "puck") apply({ x: p.x, y: p.y - 50 });
  else if (g === "ziegel") apply({ x: p.x });
  else if (g === "volley") apply({ x: p.x, jump: p.y < VOLLEY.FY - 60 });
  else if (g === "kick") apply({ x: p.x, kick: true });
  else if (g === "snow") apply({ x: p.x, fire: true });
  else if (g === "elfer" && !S.st.shooting) apply({ x: p.x });
  else if (g === "murmel") c.down.from = MURMEL.fromX(p.x);
}
function turnShot(g, c, S, p) {
  const d = c.down, D = g === "stock" ? STOCK : MURMEL, vx = (d.x - p.x) * 2.4, vy = (d.y - p.y) * 2.4, from = g === "stock" ? W / 2 : d.from;
  const sy = g === "stock" ? H - D.FROM : H / 2 + S.st.r + 80;
  d.shot = { x: from, vx, vy };
  c.aim = S.flip ? { x: W - from, y: H - sy, vx: -vx, vy: -vy } : { x: from, y: sy, vx, vy };   // die Punkte liegen im gemeinsamen Bild
}
function move(g, c, S, p, apply) {
  if (g === "puck") apply({ x: p.x, y: p.y - 50 });
  else if (g === "ziegel" || g === "volley" || g === "kick" || g === "snow") apply({ x: p.x });
  else if (g === "elfer") { if (S.st.shooting) { if (c.down.path.length < 600) c.down.path.push([p.x, p.y]); c.swipe = c.down.path; } else apply({ x: p.x }); }
  else if (g === "panzer") { const aim = { vx: (c.down.x - p.x) * 3.4, vy: (c.down.y - p.y) * 3.4 }; apply({ aim }); c.aim = aim; }
  else if ((g === "stock" || g === "murmel") && mineTurn(S)) turnShot(g, c, S, p);
}
function up(g, c, S, p, k, apply) {
  const d = c.down;
  if (g === "panzer") { apply({ fire: true }); c.aim = null; }
  if (g === "elfer" && S.st.shooting && d.path.length > 2) {
    const a = d.path[0], b = d.path[d.path.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.sqrt(dx * dx + dy * dy), dur = Math.max(0.08, k - d.k);
    if (l > 60 && dy < 0) {
      const mid = d.path[Math.floor(d.path.length / 2)], dev = ((mid[0] - a[0]) * dy - (mid[1] - a[1]) * dx) / l;   // wie weit der Wisch seitlich bog
      const v = Math.min(ELF.VMAX, l / dur * 1.6);
      apply({ shot: { vx: dx / l * v, vy: dy / l * v, c: -dev * 7 } });
    }
    c.swipe = null;
  }
  if ((g === "stock" || g === "murmel") && d.shot) { apply({ shot: d.shot }); c.aim = null; }
  c.down = null;
}
// ---------- Tastatur (neu: jede Zeigersteuerung hat eine Tastenentsprechung) ----------
function keys(g, c, S, inp, apply) {
  const x = ax(inp), y = ay(g, inp), st = S.st, fire = btn(g, inp, "jump") || btn(g, inp, "kick") || btn(g, inp, "fire") || btn(g, inp, "shoot") || btn(g, inp, "throw");
  if (g === "puck") { if (x || y) apply({ x: st.me.x + x * 300, y: st.me.y + y * 300 }); return; }
  if (g === "ziegel") { if (x) apply({ x: st.me + x * 300 }); return; }
  if (g === "volley") { if (x || fire) apply({ x: st.me.x + x * 300, jump: fire }); return; }
  if (g === "kick") { if (x || fire) apply({ x: st.c + x * 300, kick: fire }); return; }
  if (g === "snow") { if (x || fire) apply({ x: st.me.x + x * 300, fire: fire }); return; }
  if (g === "panzer") {
    // Pfeil hoch/runter: Winkel (10..85 Grad), links/rechts: Kraft; Leertaste feuert mit dem gezeigten Ziel.
    if (x || y || (fire && !c.aim)) {
      c.kAng = Math.max(10, Math.min(85, (c.kAng || 50) - y * 0.5));
      c.kPow = Math.max(0.15, Math.min(1, c.kPow + x * 0.004));
      const a = c.kAng * PI / 180, v = PANZER.VMIN + c.kPow * (PANZER.VSHOT - PANZER.VMIN);
      c.aim = { vx: cosD(a) * v, vy: -sinD(a) * v };
      apply({ aim: c.aim });
    }
    if (fire) { apply({ fire: true }); c.aim = null; }
    return;
  }
  if (g === "elfer") {
    if (st.shooting) {
      if (c.kx === null) c.kx = W / 2;
      c.kx = Math.max(W / 2 - ELF.GW / 2, Math.min(W / 2 + ELF.GW / 2, c.kx + x * 6));
      c.kAng = Math.max(-1, Math.min(1, c.kAng + y * 0.02));
      if (x || y) c.aim = { x: c.kx, y: ELF.GY };
      if (fire && st.phase === "aim") {
        const dx = c.kx - st.spot.x, dy = ELF.GY - st.spot.y, l = Math.sqrt(dx * dx + dy * dy), v = 1800, cv = c.kAng * 700;
        apply({ shot: { vx: dx / l * v - cv * 0.35, vy: dy / l * v, c: cv } }); c.aim = null; c.kx = null; c.kAng = 0;
      }
    } else if (x) apply({ x: st.k.x + x * 300 });
    return;
  }
  if (g === "stock" || g === "murmel") {
    if (!mineTurn(S)) return;
    const D = g === "stock" ? STOCK : MURMEL;
    if (g === "murmel") { if (btn(g, inp, "sl")) c.from = MURMEL.fromX(c.from - 6); if (btn(g, inp, "sr")) c.from = MURMEL.fromX(c.from + 6); }
    const used = x || y || fire || (g === "murmel" && (btn(g, inp, "sl") || btn(g, inp, "sr")));
    if (!used) return;
    c.kAng = Math.max(-0.7, Math.min(0.7, c.kAng + x * 0.01));
    c.kPow = Math.max(0, Math.min(1, c.kPow - y * 0.006));
    const lo = g === "stock" ? 300 : 500, hi = g === "stock" ? 900 : 1500, v = lo + c.kPow * (hi - lo);
    const from = g === "stock" ? W / 2 : c.from, sy = g === "stock" ? H - D.FROM : H / 2 + st.r + 80;
    const vx = sinD(c.kAng) * v, vy = -cosD(c.kAng) * v;
    c.aim = S.flip ? { x: W - from, y: H - sy, vx: -vx, vy: -vy } : { x: from, y: sy, vx, vy };
    if (fire) { apply({ shot: { x: from, vx, vy } }); c.aim = null; }
  }
}
/** Zielhilfe fuer den eigenen Panzer: Muendung im eigenen Bild. */
export function panzerMuzzle(S) { const t = tankPos(S.st.T, true); return { x: t.x, y: t.y - 22 }; }
