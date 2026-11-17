// Die Apfel-Schlange: Schlange auf einem Raster, jeder Apfel macht sie laenger und schneller.
// Raender sind verbunden. Beisst der Kopf in den eigenen Koerper, endet das Spiel.
// Zeitlimit: nach 2400 Frames (40 s) endet die Runde mit dem Punktestand.
const CELL = 20, COLS = 18, ROWS = 29, Y0 = 56, LIMIT = 2400;
const START_APPLE = { x: 9, y: 14 };

export default {
  title: "Die Apfel-Schlange",
  controls: ["up", "down", "left", "right"],
  lives: 1,

  init(g) {
    const s = { body: [], dir: { x: 1, y: 0 }, next: { x: 1, y: 0 }, apple: { x: 0, y: 0 }, wait: 0, eaten: 0, alter: 0 };
    reset(s, g);
    return s;
  },

  update(s, input, g) {
    s.alter += 1;
    if (s.alter >= LIMIT) { g.gameOver(); return; }

    const want = input.up ? { x: 0, y: -1 } : input.down ? { x: 0, y: 1 } : input.left ? { x: -1, y: 0 } : input.right ? { x: 1, y: 0 } : null;
    if (want && !(want.x === -s.dir.x && want.y === -s.dir.y)) s.next = { x: want.x, y: want.y };

    s.wait += 1;
    if (s.wait < Math.max(4, 9 - g.level)) return;
    s.wait = 0;

    s.dir = { x: s.next.x, y: s.next.y };
    const hx = (s.body[0].x + s.dir.x + COLS) % COLS;
    const hy = (s.body[0].y + s.dir.y + ROWS) % ROWS;
    const eat = hx === s.apple.x && hy === s.apple.y;
    const teil = eat ? s.body : s.body.slice(0, -1);
    if (teil.some((p) => p.x === hx && p.y === hy)) {
      g.sound("hurt");
      g.loseLife();
      reset(s, g);
      return;
    }
    s.body.unshift({ x: hx, y: hy });
    if (eat) {
      g.addScore(10);
      g.sound("coin");
      s.eaten += 1;
      g.nextLevel();
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
      d.emoji(i === 0 ? "🐍" : "🟢", p.x * CELL + CELL / 2, Y0 + p.y * CELL + CELL / 2, 18);
    });
  }
};

function reset(s, g) {
  s.body = [{ x: 6, y: 14 }, { x: 5, y: 14 }, { x: 4, y: 14 }];
  s.dir = { x: 1, y: 0 };
  s.next = { x: 1, y: 0 };
  s.wait = 0;
  s.eaten = 0;
  s.alter = 0;
  s.apple = { x: START_APPLE.x, y: START_APPLE.y };
}

function placeApple(s, g) {
  for (let tries = 0; tries < 200; tries++) {
    const a = { x: g.randInt(0, COLS - 1), y: g.randInt(0, ROWS - 1) };
    if (!s.body.some((p) => p.x === a.x && p.y === a.y)) { s.apple = a; return; }
  }
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!s.body.some((p) => p.x === x && p.y === y)) { s.apple = { x, y }; return; }
    }
  }
}
