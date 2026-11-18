// Referenzspiel 1 (nur Spiel-API, keine Importe): Segelboote ziehen in Reihen heran, das Floss wirft Wasserbomben.
// Die Boote werfen Kanonenkugeln aufs Holz des Flosses. Keine Gewalt gegen Menschen.
export default {
  title: "Segel-Invaders",
  controls: ["left", "right", "fire"],
  lives: 3,

  init(g) {
    return { raft: { x: g.W / 2 - 20, y: 580, w: 40, h: 28 }, bombs: [], balls: [], boats: fleet(g, 1), dir: 1, cool: 0, safe: 0 };
  },

  update(s, input, g) {
    const raft = s.raft;
    if (input.left) raft.x -= 4;
    if (input.right) raft.x += 4;
    raft.x = g.clamp(raft.x, 4, g.W - raft.w - 4);
    if (s.cool > 0) s.cool -= 1;
    if (s.safe > 0) s.safe -= 1;
    if ((input.firePressed || input.fire) && s.cool === 0 && s.bombs.length < 3) {
      s.bombs.push({ x: raft.x + raft.w / 2, y: raft.y, r: 7 });
      s.cool = 14;
      g.sound("shoot");
    }
    for (const b of s.bombs) b.y -= 8;
    s.bombs = s.bombs.filter((b) => b.y > g.TOP);

    // Flotte: seitwaerts, am Rand eine Reihe tiefer und kehrt um
    const speed = 0.5 + 0.2 * g.level + (24 - s.boats.length) * 0.04;
    let edge = false;
    for (const b of s.boats) { b.x += s.dir * speed; if (b.x < 6 || b.x + b.w > g.W - 6) edge = true; }
    if (edge) { s.dir = -s.dir; for (const b of s.boats) { b.x += s.dir * speed; b.y += 14; } }

    for (const bomb of s.bombs) {
      for (const boat of s.boats) {
        if (!boat.sunk && g.hit(bomb, boat)) { boat.sunk = true; bomb.y = -100; g.addScore(10 * g.level); g.sound("pop"); break; }
      }
    }
    s.boats = s.boats.filter((b) => !b.sunk);
    s.bombs = s.bombs.filter((b) => b.y > g.TOP);

    if (s.boats.length > 0 && g.random() < 0.012 + 0.006 * g.level) {
      const b = s.boats[g.randInt(0, s.boats.length - 1)];
      s.balls.push({ x: b.x + b.w / 2, y: b.y + b.h, r: 5 });
    }
    for (const c of s.balls) c.y += 2.5 + 0.4 * g.level;
    s.balls = s.balls.filter((c) => c.y < g.H + 10);
    if (s.safe === 0 && s.balls.some((c) => g.hit(c, raft))) {
      s.balls = [];
      s.safe = 60;
      g.sound("hurt");
      g.loseLife();
    }

    if (s.boats.some((b) => b.y + b.h >= raft.y)) { g.gameOver(); return; }
    if (s.boats.length === 0) { g.nextLevel(); g.sound("level"); s.boats = fleet(g, g.level); s.balls = []; }
  },

  draw(s, d, g) {
    d.clear("cream");
    for (let y = 120; y < g.H; y += 60) d.line(0, y + (g.frame >> 3) % 6, g.W, y + (g.frame >> 3) % 6, "yellow", 2);
    for (const b of s.boats) d.emoji("⛵", b.x + b.w / 2, b.y + b.h / 2, 30);
    for (const c of s.balls) d.circle(c.x, c.y, c.r, "ink");
    for (const b of s.bombs) d.circle(b.x, b.y, b.r, "yellow", { line: true });
    if (s.safe === 0 || (g.frame >> 2) % 2 === 0) {
      d.rect(s.raft.x, s.raft.y + 10, s.raft.w, s.raft.h - 10, "red", { round: 6, shadow: true, line: true });
      d.rect(s.raft.x + s.raft.w / 2 - 3, s.raft.y, 6, 12, "ink");
    }
  }
};

function fleet(g, level) {
  const out = [];
  const rows = Math.min(3 + level - 1, 5);
  for (let r = 0; r < rows; r++) for (let c = 0; c < 6; c++) out.push({ x: 20 + c * 52, y: g.TOP + 20 + r * 42, w: 34, h: 30, sunk: false });
  return out;
}
