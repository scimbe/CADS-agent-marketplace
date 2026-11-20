// Raumschiff gegen platzende Felsbrocken (nur Spiel-API, keine Importe).
// Seifenblasen schiessen, grosse Felsbrocken brauchen drei Treffer, kleine einen. Ein Zusammenstoss beendet die Runde.
// Nach links 4 px je Frame, nach rechts 2 px je Frame (Ausgleich, damit ein Hin-und-her ehrlich spuerbar nach links fuehrt).
const SPEED_BASE = 1.5, SPEED_LEVEL = 0.2, COOL = 15, SHOT_SPEED = 6, POP_TIME = 12;

export default {
  title: "Raumschiff gegen platzende Felsbrocken",
  controls: ["left", "right", "fire"],
  lives: 1,

  init(g) {
    return { ship: { x: 162, y: 562, w: 36, h: 36 }, rocks: [], shots: [], pops: [], cool: 0, spawn: 30 };
  },

  update(s, input, g) {
    // Level alle 1800 Frames
    if (g.frame > 0 && g.frame % 1800 === 0) { g.nextLevel(); g.sound("level"); }

    // Schiff bewegen
    if (input.left) s.ship.x -= 4;
    if (input.right) s.ship.x += 2;
    s.ship.x = g.clamp(s.ship.x, 4, 320);

    // Schuss mit Abkuehlung (Druck oder gehalten)
    if (s.cool > 0) s.cool -= 1;
    if ((input.firePressed || input.fire) && s.cool === 0) {
      s.shots.push({ x: s.ship.x + 18, y: s.ship.y, r: 8, dead: false });
      s.cool = COOL;
      g.sound("shoot");
    }
    for (const b of s.shots) b.y -= SHOT_SPEED;

    // Felsbrocken spawnen
    s.spawn -= 1;
    if (s.spawn <= 0) {
      const big = g.random() < 0.4;
      const r = big ? 26 : 14;
      s.rocks.push({ x: g.randInt(30, g.W - 30), y: g.TOP + r, r, big, hits: big ? 3 : 1, dead: false });
      s.spawn = g.randInt(60, 90);
    }
    const speed = SPEED_BASE + SPEED_LEVEL * g.level;
    for (const r of s.rocks) r.y += speed;

    // Treffer Blase gegen Felsbrocken (jeder Treffer gibt Zwischenpunkte)
    for (const b of s.shots) {
      for (const r of s.rocks) {
        if (b.dead || r.dead) continue;
        if (g.dist(b, r) < b.r + r.r) {
          b.dead = true;
          r.hits -= 1;
          if (r.hits <= 0) {
            r.dead = true;
            g.addScore(r.big ? 30 : 10);
            s.pops.push({ x: r.x, y: r.y, t: POP_TIME });
            g.sound("pop");
          } else {
            g.addScore(2);
            g.sound("hit");
          }
        }
      }
    }

    // Zusammenstoss Schiff gegen Felsbrocken: Runde endet
    for (const r of s.rocks) {
      if (!r.dead && g.hit(s.ship, r)) { g.gameOver(); return; }
    }

    // Aufraeumen
    s.rocks = s.rocks.filter((r) => !r.dead && r.y - r.r < g.H);
    s.shots = s.shots.filter((b) => !b.dead && b.y >= g.TOP);
    for (const p of s.pops) p.t -= 1;
    s.pops = s.pops.filter((p) => p.t > 0);
  },

  draw(s, d, g) {
    d.clear("cream");
    for (const r of s.rocks) d.emoji("🪨", r.x, r.y, r.big ? 52 : 28);
    for (const b of s.shots) d.emoji("🫧", b.x, b.y, 20);
    for (const p of s.pops) d.emoji("✨", p.x, p.y, 30);
    d.emoji("🚀", s.ship.x + 18, s.ship.y + 18, 36);
  }
};
