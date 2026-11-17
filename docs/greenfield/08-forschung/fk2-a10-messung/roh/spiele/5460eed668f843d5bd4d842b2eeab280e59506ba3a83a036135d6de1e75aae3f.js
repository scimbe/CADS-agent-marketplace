// Pong-Tennis: Schlaeger links (du) gegen Computer-Schlaeger rechts. Ball prallt ab, wer verpasst, gibt einen Punkt ab.
// Zeitlimit: nach 1140 Frames endet die Partie, wer mehr Punkte hat, gewinnt.
const PX = 40, CX = 320, PH = 90, BR = 8, SPEED = 4, ZEIT = 1140;

export default {
  title: "Pong-Tennis gegen den Computer",
  controls: ["up", "down"],
  lives: 1,

  init(g) {
    return { py: 320, cy: 320, off: 0, t: 0, bx: 180, by: 320, vx: g.randInt(0, 1) === 0 ? SPEED : -SPEED, vy: g.randInt(-2, 2), me: 0, cpu: 0 };
  },

  update(s, input, g) {
    if (input.up) s.py -= 5;
    if (input.down) s.py += 5;
    s.py = g.clamp(s.py, 60, 600);

    s.t += 1;
    if (s.t % 60 === 0) s.off = g.randInt(-40, 40);
    const step = g.clamp(s.by + s.off - s.cy, -3, 3);
    s.cy = g.clamp(s.cy + step, 60, 600);

    s.bx += s.vx;
    s.by += s.vy;
    if (s.by <= 56) { s.by = 56; s.vy = Math.abs(s.vy); }
    if (s.by >= 632) { s.by = 632; s.vy = -Math.abs(s.vy); }

    if (s.vx < 0 && s.bx <= 48 && Math.abs(s.by - s.py) <= 50) {
      s.vx = SPEED; s.bx = 48; g.addScore(1); g.sound("hit");
    } else if (s.vx > 0 && s.bx >= 312 && Math.abs(s.by - s.cy) <= 50) {
      s.vx = -SPEED; s.bx = 312; g.sound("hit");
    }

    if (s.bx < 0) {
      s.cpu += 1; g.sound("hurt"); serve(s, g, SPEED);
    } else if (s.bx > 360) {
      s.me += 1; g.addScore(5); g.sound("coin"); serve(s, g, -SPEED);
    }

    if (s.cpu >= 7) { g.gameOver(); return; }
    if (s.me >= 7) { g.win(); return; }
    if (g.frame >= ZEIT) {
      if (s.me > s.cpu) g.win(); else g.gameOver();
    }
  },

  draw(s, d) {
    d.clear("cream");
    d.line(180, 56, 180, 632, "yellow", 2);
    d.text(String(s.me), 150, 28, { size: 24, color: "ink", align: "center" });
    d.text(String(s.cpu), 210, 28, { size: 24, color: "ink", align: "center" });
    d.emoji("🏓", PX, s.py, 40);
    d.emoji("🤖", CX, s.cy, 40);
    d.emoji("🎾", s.bx, s.by, 20);
  }
};

function serve(s, g, vx) {
  s.bx = 180; s.by = 320; s.vx = vx; s.vy = g.randInt(-2, 2);
}
