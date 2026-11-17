// Katze auf den Daechern: Jump and Run ueber Daecher, Fischgraeten sammeln, Luecken sind toedlich.
const GRAV = 0.5, CAT = 26, CATX = 60, SPRUNG = -9, BOOST = 14;

export default {
  title: "Katze auf den Dächern",
  controls: ["fire"],
  lives: 1,

  init(g) {
    return {
      cat: { x: CATX, y: 534, vy: 0, ground: true, boost: 0 },
      roofs: [{ x: 0, y: 560, w: 360 }],
      bones: [{ x: 180, y: 538, r: 11 }],
      scroll: 2
    };
  },

  update(s, input, g) {
    const c = s.cat;

    // Sprung und Hochhalten (langer Druck springt hoeher)
    if (input.firePressed && c.ground) {
      c.vy = SPRUNG; c.boost = BOOST; c.ground = false; g.sound("jump");
    } else if (input.fire && c.boost > 0 && c.vy < 0) {
      c.vy -= 0.45; c.boost -= 1;
    } else {
      c.boost = 0;
    }

    // Schwerkraft und Bewegung
    const feet = c.y + CAT;
    c.vy = Math.min(c.vy + GRAV, 12);
    c.y += c.vy;
    c.ground = false;
    if (c.vy >= 0) {
      for (const r of s.roofs) {
        if (feet <= r.y + 0.01 && c.y + CAT >= r.y && c.x + CAT > r.x && c.x < r.x + r.w) {
          c.y = r.y - CAT; c.vy = 0; c.ground = true; c.boost = 0;
          break;
        }
      }
    }

    // Neue Daecher und Graeten rechts anlegen
    let last = 0;
    for (const r of s.roofs) if (r.x + r.w > last) last = r.x + r.w;
    while (last < g.W + 20) {
      const x = last + g.randInt(50, 95);
      const w = g.randInt(90, 170);
      const y = g.randInt(440, 580);
      s.roofs.push({ x, y, w });
      if (g.random() < 0.5) s.bones.push({ x: x + w / 2, y: y - 22, r: 11 });
      last = x + w;
    }

    // Scrollen nach links
    const sc = 2 + 0.3 * g.level;
    for (const r of s.roofs) r.x -= sc;
    for (const b of s.bones) b.x -= sc;
    s.roofs = s.roofs.filter((r) => r.x + r.w >= 0);

    // Graeten einsammeln
    const katze = { x: c.x, y: c.y, w: CAT, h: CAT };
    s.bones = s.bones.filter((b) => {
      if (g.hit(katze, b)) { g.addScore(1); g.sound("coin"); return false; }
      return b.x > -20;
    });

    // Level alle 600 Frames
    if (g.frame > 0 && g.frame % 600 === 0) { g.nextLevel(); g.sound("level"); }

    // Fallen in eine Luecke
    if (c.y > g.H) { g.sound("hurt"); g.loseLife(); }
  },

  draw(s, d, g) {
    d.clear("cream");
    for (const r of s.roofs) d.rect(r.x, r.y, r.w, 24, "yellow", { round: 8, line: true });
    for (const b of s.bones) d.emoji("🐟", b.x, b.y, 22);
    d.emoji("🐱", s.cat.x + CAT / 2, s.cat.y + CAT / 2, 28);
  }
};
