// Ball-Duell gegen den Computer: Pong mit Schlaegern links (du) und rechts (Computer).
export default {
  title: "Ball-Duell gegen den Computer",
  controls: ["up", "down"],
  lives: 1,

  init(g) {
    return { py: 330, cy: 330, cs: 3, t: 0, mine: 0, bx: 180, by: 330, vx: 3, vy: 2 };
  },

  update(s, input, g) {
    s.t += 1;
    if (input.up) s.py -= 5;
    if (input.down) s.py += 5;
    s.py = g.clamp(s.py, g.TOP + 30, g.H - 30);

    if (s.t % 120 === 0) s.cs = g.randInt(1, 6);
    if (s.cy < s.by) s.cy += s.cs; else s.cy -= s.cs;
    s.cy = g.clamp(s.cy, g.TOP + 30, g.H - 30);

    s.bx += s.vx;
    s.by += s.vy;
    if (s.by <= g.TOP + 7) { s.by = g.TOP + 7; s.vy = Math.abs(s.vy); }
    if (s.by >= g.H - 7) { s.by = g.H - 7; s.vy = -Math.abs(s.vy); }

    const ball = { x: s.bx, y: s.by, r: 7 };
    if (s.vx < 0 && g.hit(ball, { x: 12, y: s.py - 30, w: 36, h: 60 })) bounce(s, g, s.py);
    else if (s.vx > 0 && g.hit(ball, { x: 312, y: s.cy - 30, w: 36, h: 60 })) bounce(s, g, s.cy);

    if (s.bx < 0) {
      g.addScore(1);
      g.sound("lose");
      if (g.score >= 5) { g.gameOver(); return; }
      reset(s, g);
    } else if (s.bx > g.W) {
      s.mine += 1;
      g.sound("coin");
      if (s.mine >= 5) { g.win(); return; }
      reset(s, g);
    }
  },

  draw(s, d, g) {
    d.clear("cream");
    for (let y = g.TOP; y < g.H; y += 24) d.rect(178, y, 4, 12, "yellow");
    d.emoji("🏓", 30, s.py, 48);
    d.emoji("🏓", 330, s.cy, 48);
    d.circle(s.bx, s.by, 7, "red");
    d.text("Du: " + s.mine, 16, 30, { size: 20, color: "ink", align: "left" });
    d.text("Computer: " + g.score, g.W - 16, 30, { size: 20, color: "ink", align: "right" });
  }
};

function bounce(s, g, py) {
  s.vx = -s.vx;
  const sp = Math.min(Math.abs(s.vx) + 0.2, 8);
  s.vx = s.vx < 0 ? -sp : sp;
  s.vy = g.clamp((s.by - py) * 0.15, -5, 5);
}

function reset(s, g) {
  s.bx = 180;
  s.by = 330;
  s.vx = g.randInt(0, 1) === 0 ? -3 : 3;
  s.vy = g.randInt(0, 1) === 0 ? -2 : 2;
}
