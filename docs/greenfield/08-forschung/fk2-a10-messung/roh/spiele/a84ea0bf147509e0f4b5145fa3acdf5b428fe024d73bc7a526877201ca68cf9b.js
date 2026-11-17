// Seifenblasen-Raumschiff: Blasen platzen Felsen. Ein Felsen am Schiff beendet die Runde.
// Rekord-Anzeige fehlt: Die Spiel-API speichert nichts ueber die Runde hinaus.
const SPARK = ["yellow", "red", "ink"];

export default {
  title: "Seifenblasen-Raumschiff",
  controls: ["left", "right", "fire"],
  lives: 1,

  init() {
    return { ship: { x: 170, y: 580, w: 36, h: 30 }, bubbles: [], rocks: [], sparks: [], cool: 0 };
  },

  update(s, input, g) {
    const ship = s.ship;
    if (input.left) ship.x -= 4;
    if (input.right) ship.x += 4;
    ship.x = g.clamp(ship.x, 0, g.W - ship.w);

    if (s.cool > 0) s.cool -= 1;
    if ((input.firePressed || input.fire) && s.cool === 0 && s.bubbles.length < 4) {
      s.bubbles.push({ x: ship.x + ship.w / 2, y: ship.y - 20, r: 8 });
      s.cool = 10;
      g.sound("shoot");
    }
    for (const b of s.bubbles) b.y -= 6;
    s.bubbles = s.bubbles.filter((b) => b.y >= g.TOP);

    if (g.frame % 45 === 0 || g.random() < 0.01) {
      const r = g.randInt(0, 1) === 0 ? 12 : 22;
      s.rocks.push({ x: g.randInt(20, 340), y: g.TOP - 20, r, dead: false });
    }
    const v = Math.min(4, 1.5 + 0.01 * g.frame);
    for (const r of s.rocks) r.y += v;

    for (const b of s.bubbles) {
      for (const r of s.rocks) {
        if (!r.dead && g.dist(b, r) < b.r + r.r) {
          b.dead = true;
          r.dead = true;
          g.addScore(1);
          g.sound("pop");
          for (let k = 0; k < 8; k++) {
            const a = k * 45;
            s.sparks.push({ x: r.x, y: r.y, dx: g.cos(a) * 2.5, dy: g.sin(a) * 2.5, r: 3, c: SPARK[k % 3], t: 20 });
          }
          break;
        }
      }
    }
    s.bubbles = s.bubbles.filter((b) => !b.dead);
    s.rocks = s.rocks.filter((r) => !r.dead && r.y - r.r <= g.H);

    for (const r of s.rocks) {
      const cx = g.clamp(r.x, ship.x, ship.x + ship.w);
      const cy = g.clamp(r.y, ship.y, ship.y + ship.h);
      const dx = r.x - cx, dy = r.y - cy;
      if (dx * dx + dy * dy < r.r * r.r) {
        g.sound("hurt");
        g.loseLife();
        return;
      }
    }

    for (const sp of s.sparks) { sp.x += sp.dx; sp.y += sp.dy; sp.t -= 1; }
    s.sparks = s.sparks.filter((sp) => sp.t > 0);

    if (g.frame > 0 && g.frame % 600 === 0) { g.nextLevel(); g.sound("level"); }
  },

  draw(s, d) {
    d.clear("cream");
    for (const r of s.rocks) d.emoji("🌑", r.x, r.y, r.r * 2 + 8);
    // Bereite Blase am Bug, solange keine Blase unterwegs ist
    if (s.bubbles.length === 0 && s.cool === 0) d.emoji("🫧", s.ship.x + s.ship.w / 2, s.ship.y - 20, 22);
    for (const b of s.bubbles) d.emoji("🫧", b.x, b.y, 22);
    for (const sp of s.sparks) d.circle(sp.x, sp.y, sp.r, sp.c);
    d.emoji("🚀", s.ship.x + 18, s.ship.y + 15, 36);
  }
};
