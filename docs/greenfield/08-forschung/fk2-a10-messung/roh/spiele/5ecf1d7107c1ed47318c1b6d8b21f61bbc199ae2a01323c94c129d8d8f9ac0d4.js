// Raumschiff und schwebende Felsbrocken: Seifenblasen zerplatzen Felsbrocken, Beruehrung beendet die Runde.
export default {
  title: "Raumschiff und schwebende Felsbrocken",
  controls: ["left", "right", "fire"],
  lives: 1,

  init(g) {
    return { ship: { x: 160, y: 590, w: 40, h: 30 }, bubbles: [], rocks: [], parts: [] };
  },

  update(s, input, g) {
    const ship = s.ship;
    if (input.left) ship.x -= 4;
    if (input.right) ship.x += 4;
    ship.x = g.clamp(ship.x, 0, 320);

    if (input.firePressed && s.bubbles.length < 3) {
      s.bubbles.push({ x: ship.x + 20, y: 580, r: 8, hit: false });
      g.sound("shoot");
    }
    for (const b of s.bubbles) b.y -= 6;

    // grosse Felsbrocken erscheinen von oben
    if (g.frame % (g.level >= 2 ? 40 : 50) === 0) {
      s.rocks.push({ x: g.randInt(28, g.W - 28), y: g.TOP - 20, r: 28, big: true, vx: 0 });
    }
    for (const r of s.rocks) {
      r.y += r.big ? 0.8 : 1.2;
      r.x += r.vx;
    }

    // Treffer Blase gegen Felsbrocken
    const alive = [];
    for (const r of s.rocks) {
      let hit = false;
      for (const b of s.bubbles) {
        if (!b.hit && g.hit({ x: b.x, y: b.y, r: b.r }, { x: r.x, y: r.y, r: r.r })) { b.hit = true; hit = true; break; }
      }
      if (!hit) { alive.push(r); continue; }
      for (let i = 0; i < 6; i++) s.parts.push({ x: r.x + g.randInt(-12, 12), y: r.y + g.randInt(-12, 12), t: 8 });
      if (r.big) {
        alive.push({ x: r.x - 12, y: r.y, r: 14, big: false, vx: -0.5 });
        alive.push({ x: r.x + 12, y: r.y, r: 14, big: false, vx: 0.5 });
        g.addScore(10);
        g.sound("pop");
      } else {
        g.addScore(20);
        g.sound("coin");
      }
    }
    s.rocks = alive.filter((r) => r.y <= g.H);
    s.bubbles = s.bubbles.filter((b) => !b.hit && b.y >= g.TOP);

    // Level alle 100 Punkte
    while (g.score >= g.level * 100) g.nextLevel();

    for (const p of s.parts) p.t -= 1;
    s.parts = s.parts.filter((p) => p.t > 0);

    // Beruehrung mit dem Raumschiff beendet die Runde
    const shipC = { x: ship.x + 20, y: ship.y + 15, r: 16 };
    for (const r of s.rocks) {
      if (g.hit(shipC, { x: r.x, y: r.y, r: r.r })) { g.sound("hurt"); g.loseLife(); return; }
    }
  },

  draw(s, d, g) {
    d.clear("cream");
    for (const b of s.bubbles) d.circle(b.x, b.y, b.r, "yellow", { line: true });
    for (const r of s.rocks) d.emoji("🌑", r.x, r.y, r.big ? 60 : 30);
    for (const p of s.parts) d.circle(p.x, p.y, 3, "yellow");
    d.emoji("🚀", s.ship.x + 20, s.ship.y + 15, 36);
  }
};
