// Eingaben als Daten (ADR 0001 b): Tasten, Zeiger und Bildschirmknoepfe werden je Tick zu einem Input abgetastet:
//   { b: Bitmaske nach controls.buttons, ax/ay: -1000..1000, p: [[id, x, y, f]] }  (nur Ganzzahlen)
// f: bit0 unten, bit1 seit dem letzten Tick gedrueckt, bit2 seit dem letzten Tick losgelassen.
// "pulse"-Knoepfe sind genau im naechsten Tick nach dem Druecken gesetzt (auch wenn schon wieder losgelassen),
// "hold"-Knoepfe solange gedrueckt. Zeiger sind in logischen Koordinaten der Karte (Letterbox umgerechnet).
// Rein und ohne DOM: der Browser-Teil (rt-stage.js) ruft key()/pointer()/button() mit fertigen Werten.

export const AXIS = 1000;

/** Letterbox: logische Flaeche w×h in einen Kasten cw×ch einpassen. */
export function fitView(view, cw, ch) {
  const k = view.fit === "width" ? cw / view.w : Math.min(cw / view.w, ch / view.h);
  return { k, ox: (cw - view.w * k) / 2, oy: view.fit === "width" ? 0 : (ch - view.h * k) / 2, w: view.w * k, h: view.h * k };
}
/** Bildschirmpunkt (relativ zum Kasten) -> logische Ganzzahlkoordinaten. */
export function toWorld(fit, px, py) { return [Math.round((px - fit.ox) / fit.k), Math.round((py - fit.oy) / fit.k)]; }

/**
 * @param {object} controls  manifest.rt.controls
 * @param {{w:number,h:number}} view
 */
export function createSampler(controls, view) {
  const buttons = controls.buttons || [], axes = controls.axes || {}, maxP = controls.pointer ? controls.pointer.max : 0;
  const held = new Set(), keysDown = new Set();       // Knopf-ids gehalten / Tastencodes gedrueckt
  const pulse = new Set();                            // Knopf-ids seit dem letzten Tick gedrueckt
  const sources = new Map();                          // Knopf-id -> Set von Quellen (Taste, Zeiger, Bildschirmknopf)
  const ptr = new Map();                              // Zeiger-id -> { x, y, f, sx, sy, swiped }
  const swipeMin = Math.round(view.h * 0.06);
  function press(id, src) {
    let s = sources.get(id); if (!s) sources.set(id, (s = new Set()));
    if (!s.size) { held.add(id); pulse.add(id); }
    s.add(src);
  }
  function release(id, src) { const s = sources.get(id); if (!s) return; s.delete(src); if (!s.size) held.delete(id); }
  function inZone(zone, x) { return zone === "any" || (zone === "left" && x < view.w / 2) || (zone === "right" && x >= view.w / 2); }
  return {
    /** Taste (KeyboardEvent.code). Liefert true, wenn die Taste zur Karte gehoert (dann preventDefault). */
    key(code, down) {
      let used = false;
      if (down && keysDown.has(code)) return buttons.some((b) => b.keys.includes(code)) || Object.values(axes).some((a) => a.keys.includes(code)); // Tastenwiederholung
      if (down) keysDown.add(code); else keysDown.delete(code);
      for (const b of buttons) if (b.keys.includes(code)) { used = true; if (down) press(b.id, "k:" + code); else release(b.id, "k:" + code); }
      for (const a of Object.values(axes)) if (a.keys.includes(code)) used = true;
      return used;
    },
    /** Grosse Tipp-Taste des Hosts (controls.screenKey): wirkt wie ein Tippen auf die Buehne, also auf alle zone-"any"-Knoepfe. */
    tap(down) { for (const b of buttons) if (b.zone === "any") { if (down) press(b.id, "t:key"); else release(b.id, "t:key"); } },
    /** Bildschirmknopf des Hosts (zone "button"). */
    button(id, down) { if (!buttons.some((b) => b.id === id)) return; if (down) press(id, "s:" + id); else release(id, "s:" + id); },
    /** Zeiger in logischen Koordinaten: type "down" | "move" | "up" | "cancel". */
    pointer(type, id, x, y) {
      if (type === "down") {
        if (ptr.size >= Math.max(1, maxP) && !ptr.has(id)) return;
        ptr.set(id, { x, y, f: 3, sx: x, sy: y, swiped: null });
        for (const b of buttons) if (b.zone !== "button" && b.zone !== "none" && inZone(b.zone, x)) press(b.id, "p:" + id);
      } else if (type === "move") {
        const q = ptr.get(id); if (!q) return;
        q.x = x; q.y = y;
        for (const b of buttons) if (b.swipe && q.swiped !== b.id) {
          const dx = x - q.sx, dy = y - q.sy;
          const hit = (b.swipe === "down" && dy > swipeMin) || (b.swipe === "up" && -dy > swipeMin) || (b.swipe === "left" && -dx > swipeMin) || (b.swipe === "right" && dx > swipeMin);
          if (hit) { q.swiped = b.id; press(b.id, "w:" + id); }
        }
      } else {
        const q = ptr.get(id); if (!q) return;
        q.x = x; q.y = y; q.f = (q.f & 2) | 4; // losgelassen (ggf. im selben Tick gedrueckt)
        for (const b of buttons) { release(b.id, "p:" + id); release(b.id, "w:" + id); }
      }
    },
    /** Eingabe fuer den naechsten Tick; setzt Impulse und Zeigerflanken zurueck. */
    sample() {
      let b = 0;
      buttons.forEach((btn, i) => { if ((btn.kind === "hold" && held.has(btn.id)) || (btn.kind === "pulse" && pulse.has(btn.id))) b |= 1 << i; });
      pulse.clear();
      const out = { b };
      for (const name of ["x", "y"]) {
        const a = axes[name]; if (!a) continue;
        const neg = a.keys[0] && keysDown.has(a.keys[0]), pos = a.keys[1] && keysDown.has(a.keys[1]);
        const v = (pos ? AXIS : 0) - (neg ? AXIS : 0);
        if (v) out["a" + name] = v;
      }
      if (maxP && ptr.size) {
        out.p = [...ptr.entries()].sort((a, c) => a[0] - c[0]).map(([id, q]) => [id, q.x, q.y, (q.f & 4) ? (q.f & 2) | 4 : 1 | (q.f & 2)]);
        for (const [id, q] of [...ptr.entries()]) { if (q.f & 4) ptr.delete(id); else q.f = 1; }
      }
      return out;
    },
    /** Alles loslassen (Pause, Fokusverlust): keine haengenden Tasten. */
    reset() { held.clear(); pulse.clear(); keysDown.clear(); sources.clear(); ptr.clear(); },
    /** fuer a11y: welche Knoepfe zeichnet der Host als echte Bildschirmknoepfe */
    screenButtons() { return buttons.filter((x) => x.zone === "button"); }
  };
}
