// Referenzspiel 4 (nur Spiel-API): Rennwagen auf der Landstrasse, Baustellen ausweichen, Muenzen sammeln.
const ROAD_X = 40, ROAD_W = 280;

export default {
  title: "Landstrassen-Rennen",
  controls: ["left", "right"],
  lives: 3,

  init(g) {
    return { car: { x: g.W / 2 - 16, y: 540, w: 32, h: 52 }, things: [], dist: 0, safe: 0, gap: 40 };
  },

  update(s, input, g) {
    const car = s.car, speed = 4 + g.level;
    if (input.left) car.x -= 5;
    if (input.right) car.x += 5;
    car.x = g.clamp(car.x, ROAD_X + 4, ROAD_X + ROAD_W - car.w - 4);
    if (s.safe > 0) s.safe -= 1;

    s.dist += speed;
    if (g.frame % 30 === 29) g.addScore(1);
    if (g.frame % 900 === 899) { g.nextLevel(); g.sound("level"); }

    s.gap -= 1;
    if (s.gap <= 0) {
      const coin = g.random() < 0.35;
      const w = coin ? 26 : 50;
      s.things.push({ x: g.randInt(ROAD_X + 4, ROAD_X + ROAD_W - w - 4), y: g.TOP - 40, w, h: coin ? 26 : 34, coin });
      s.gap = g.randInt(22, 50) - g.level * 2;
    }
    for (const t of s.things) t.y += speed;
    for (const t of s.things) {
      if (t.y > 9000 || !g.hit(t, car)) continue;
      if (t.coin) { g.addScore(5); g.sound("coin"); t.y = 9999; }
      else if (s.safe === 0) { s.safe = 60; t.y = 9999; g.sound("hurt"); g.loseLife(); }
    }
    s.things = s.things.filter((t) => t.y < g.H + 20);
  },

  draw(s, d, g) {
    d.clear("yellow");
    d.rect(ROAD_X, g.TOP, ROAD_W, g.H - g.TOP, "ink");
    const off = s.dist % 60;
    for (let y = g.TOP - 60 + off; y < g.H; y += 60) d.rect(g.W / 2 - 3, y, 6, 30, "cream");
    for (const t of s.things) {
      if (t.coin) d.circle(t.x + t.w / 2, t.y + t.h / 2, t.w / 2, "yellow", { line: true });
      else d.emoji("🚧", t.x + t.w / 2, t.y + t.h / 2, 40);
    }
    if (s.safe === 0 || (g.frame >> 2) % 2 === 0) {
      const c = s.car;
      d.rect(c.x, c.y, c.w, c.h, "red", { round: 10, shadow: true, line: true });
      d.rect(c.x + 6, c.y + 10, c.w - 12, 12, "cream", { round: 4 });
      d.rect(c.x + c.w / 2 - 2, c.y + 26, 4, 22, "yellow");
    }
  }
};
