// Testspiel fuer den Bau-Worker (E2E): Boot ⛵ unten, Wolken ☁️ fallen, Feuer wirft Tropfen 💧, ein Treffer gibt Punkte,
// eine Wolke am Boot kostet ein Leben. Besteht alle Invarianten; Spielfigur und Dinge sind Emojis (Szenario-Bots).
export default {
  title: "Tropfenboot",
  controls: ["left", "right", "fire"],
  lives: 3,
  init() { return { x: 180, drops: [], clouds: [], t: 0 }; },
  update(s, input, g) {
    if (input.left) s.x = g.clamp(s.x - 4, 20, 340);
    if (input.right) s.x = g.clamp(s.x + 4, 20, 340);
    if (input.firePressed && s.drops.length < 6) { s.drops.push({ x: s.x, y: 580, r: 8 }); g.sound("shoot"); }
    s.t += 1;
    if (s.t % 40 === 0) s.clouds.push({ x: g.randInt(30, 330), y: 60, r: 18 });
    for (const d of s.drops) d.y -= 7;
    for (const c of s.clouds) c.y += 2 + g.level * 0.5;
    for (const c of s.clouds) for (const d of s.drops) if (!c.weg && !d.weg && g.hit(c, d)) { c.weg = true; d.weg = true; g.addScore(10); g.sound("pop"); }
    for (const c of s.clouds) if (!c.weg && c.y > 570 && c.x > s.x - 30 && c.x < s.x + 30) { c.weg = true; g.loseLife(); g.sound("hurt"); }
    s.drops = s.drops.filter((d) => !d.weg && d.y > 50);
    s.clouds = s.clouds.filter((c) => !c.weg && c.y < 640);
    if (g.score >= 100 * g.level) g.nextLevel();
  },
  draw(s, d) {
    d.clear("cream");
    d.emoji("⛵", s.x, 590, 40);
    for (const x of s.drops) d.emoji("💧", x.x, x.y, 16);
    for (const c of s.clouds) d.emoji("☁️", c.x, c.y, 36);
  }
};
