// Schlange: Aepfel fressen, Wand oder eigener Koerper beendet das Spiel. Steuerung: Pfeile oder Wischen.
const CELL = 20, COLS = 18, ROWS = 29, Y0 = 56;

export default {
  title: "Die Schlange sucht Aepfel",
  controls: ["up", "down", "left", "right"],
  lives: 1,

  init(g) {
    const s = { body: [], dir: { x: 1, y: 0 }, next: { x: 1, y: 0 }, apple: { x: 0, y: 0 }, wait: 0 };
    reset(s, g);
    return s;
  },

  update(s, input, g) {
    const want = input.up ? { x: 0, y: -1 } : input.down ? { x: 0, y: 1 } : input.left ? { x: -1, y: 0 } : input.right ? { x: 1, y: 0 } : null;
    if (want && !(want.x === -s.dir.x && want.y === -s.dir.y)) s.next = want;
    s.wait += 1;
    if (s.wait < Math.max(4, 9 - Math.floor(g.frame / 600))) return;
    s.wait = 0;
    s.dir = { x: s.next.x, y: s.next.y };
    const head = { x: s.body[0].x + s.dir.x, y: s.body[0].y + s.dir.y };
    const crash = head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS || s.body.some((p) => p.x === head.x && p.y === head.y);
    if (crash) { g.sound("hurt"); g.gameOver(); return; }
    s.body.unshift(head);
    if (head.x === s.apple.x && head.y === s.apple.y) {
      g.addScore(1); g.sound("coin");
      placeApple(s, g);
    } else {
      s.body.pop();
    }
  },

  draw(s, d) {
    d.clear("cream");
    d.rect(0, Y0, COLS * CELL, ROWS * CELL, "yellow", { round: 16, line: true });
    d.emoji("🍎", s.apple.x * CELL + CELL / 2, Y0 + s.apple.y * CELL + CELL / 2, 18);
    for (let i = 1; i < s.body.length; i++) {
      const p = s.body[i];
      d.rect(p.x * CELL + 1, Y0 + p.y * CELL + 1, CELL - 2, CELL - 2, "ink", { round: 6 });
    }
    const h = s.body[0];
    d.emoji("🐍", h.x * CELL + CELL / 2, Y0 + h.y * CELL + CELL / 2, 22);
  }
};

function reset(s, g) {
  s.body = [{ x: 6, y: 14 }, { x: 5, y: 14 }, { x: 4, y: 14 }];
  s.dir = { x: 1, y: 0 };
  s.next = { x: 1, y: 0 };
  s.wait = 0;
  placeApple(s, g);
}

function placeApple(s, g) {
  for (let tries = 0; tries < 200; tries++) {
    const a = { x: g.randInt(0, COLS - 1), y: g.randInt(0, ROWS - 1) };
    if (!s.body.some((p) => p.x === a.x && p.y === a.y)) { s.apple = a; return; }
  }
}
