// Schlange: Die Schlange bewegt sich von selbst, Aepfel machen sie laenger. Wand oder eigener Koerper beendet das Spiel.
// Punkte: 1 je Apfel, 1 je 300 Frames Ueberleben (Ausweichen), 5 Bonuspunkte je Levelaufstieg (nach jeweils 5 Aepfeln).
const CELL = 20, COLS = 18, ROWS = 29, Y0 = 56, START_SPEED = 10, MIN_SPEED = 4, LEVEL_BONUS = 5, SURVIVE = 300;

export default {
  title: "Die Schlange sammelt Äpfel",
  controls: ["up", "down", "left", "right"],
  lives: 1,

  init(g) {
    const s = { body: [], dir: { x: 1, y: 0 }, next: { x: 1, y: 0 }, apple: { x: 0, y: 0 }, wait: 0, eaten: 0, speed: START_SPEED, age: 0 };
    s.body = [{ x: 6, y: 14 }, { x: 5, y: 14 }, { x: 4, y: 14 }];
    placeApple(s, g);
    return s;
  },

  update(s, input, g) {
    s.age += 1;
    if (s.age % SURVIVE === 0) g.addScore(1);   // Ueberleben belohnt: Ausweichen bringt Punkte
    const want = input.up ? { x: 0, y: -1 } : input.down ? { x: 0, y: 1 } : input.left ? { x: -1, y: 0 } : input.right ? { x: 1, y: 0 } : null;
    if (want && !(want.x === -s.dir.x && want.y === -s.dir.y)) s.next = { x: want.x, y: want.y };
    s.wait += 1;
    if (s.wait < s.speed) return;
    s.wait = 0;
    s.dir = { x: s.next.x, y: s.next.y };
    const head = { x: s.body[0].x + s.dir.x, y: s.body[0].y + s.dir.y };
    const crash = head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS || s.body.some((p) => p.x === head.x && p.y === head.y);
    if (crash) { g.sound("hurt"); g.loseLife(); return; }
    s.body.unshift(head);
    if (head.x === s.apple.x && head.y === s.apple.y) {
      s.eaten += 1;
      g.addScore(1);
      g.sound("coin");
      if (s.speed > MIN_SPEED) s.speed -= 1;
      if (s.eaten % 5 === 0) { g.nextLevel(); g.addScore(LEVEL_BONUS); g.sound("level"); }
      placeApple(s, g);
    } else {
      s.body.pop();
    }
  },

  draw(s, d) {
    d.clear("cream");
    d.rect(0, Y0, COLS * CELL, ROWS * CELL, "yellow", { round: 16, line: true });
    d.emoji("🍎", s.apple.x * CELL + CELL / 2, Y0 + s.apple.y * CELL + CELL / 2, 18);
    s.body.forEach((p, i) => {
      if (i === 0) d.emoji("🐍", p.x * CELL + CELL / 2, Y0 + p.y * CELL + CELL / 2, 20);
      else d.rect(p.x * CELL + 1, Y0 + p.y * CELL + 1, CELL - 2, CELL - 2, i % 2 ? "ink" : "red", { round: 6 });
    });
  }
};

function placeApple(s, g) {
  for (let tries = 0; tries < 200; tries++) {
    const a = { x: g.randInt(0, COLS - 1), y: g.randInt(0, ROWS - 1) };
    if (!s.body.some((p) => p.x === a.x && p.y === a.y)) { s.apple = a; return; }
  }
}
