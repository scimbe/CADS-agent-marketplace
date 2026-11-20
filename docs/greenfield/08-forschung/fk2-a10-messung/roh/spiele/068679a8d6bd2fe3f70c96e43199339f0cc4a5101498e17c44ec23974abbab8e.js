// Tennis gegen den Computer: Echtzeit-Pong. Der Computer steuert links, der Spieler rechts.
// Punkte: jeder Schlag des Spielers gibt 1 Punkt, jeder gewonnene Ballwechsel 5 Punkte.
// Zeitlimit: nach 1190 Frames (ca. 20 s) endet die Partie, wer mehr Ballwechsel gewonnen hat, gewinnt.
export default {
  title: "Tennis gegen den Computer",
  controls: ["up", "down"],
  lives: 1,

  init(g) {
    return { bx: 180, by: 340, vx: g.randInt(0, 1) ? 3 : -3, vy: g.randInt(0, 1) ? 2 : -2, serve: 30, py: 280, cpy: 280, comp: 0, mine: 0, rally: 0, off: 0 };
  },

  update(s, input, g) {
    if (g.frame >= 1190) {
      if (s.mine > s.comp) g.win(); else g.gameOver();
      return;
    }
    const top = g.TOP + 4, bottom = g.H - 84;
    s.py = g.clamp(s.py + (input.down ? 5 : 0) - (input.up ? 5 : 0), top, bottom);
    if (s.serve > 0) {
      s.serve -= 1;
      return;
    }
    // Computer: zielt auf den Ball mit Zufallsversatz, Tempo steigt mit den Ballwechseln
    const tempo = Math.min(2.5 + 0.25 * s.rally, 6);
    const diff = s.by + s.off - 40 - s.cpy;
    s.cpy = g.clamp(s.cpy + Math.max(-tempo, Math.min(tempo, diff)), top, bottom);

    s.bx += s.vx;
    s.by += s.vy;
    if (s.by < g.TOP + 6) { s.by = g.TOP + 6; s.vy = Math.abs(s.vy); }
    else if (s.by > g.H - 16) { s.by = g.H - 16; s.vy = -Math.abs(s.vy); }

    // Schlag links (Computer)
    if (s.vx < 0 && s.bx - 10 <= 34 && s.bx + 10 >= 20 && s.by + 10 >= s.cpy && s.by - 10 <= s.cpy + 80) {
      s.bx = 44;
      hit(s, g, s.cpy);
    }
    // Schlag rechts (Spieler): jeder Schlag gibt einen Punkt
    if (s.vx > 0 && s.bx + 10 >= 326 && s.bx - 10 <= 340 && s.by + 10 >= s.py && s.by - 10 <= s.py + 80) {
      s.bx = 316;
      hit(s, g, s.py);
      g.addScore(1);
      g.sound("hit");
    }

    // Ballwechsel an den Wand hinter einem Schlaeger
    if (s.bx < 0) {
      s.mine += 1;
      g.addScore(5);
      g.sound("coin");
      if (s.mine >= 11) { g.win(); return; }
      reset(s, g, -1);
      return;
    }
    if (s.bx > g.W) {
      s.comp += 1;
      g.sound("lose");
      if (s.comp >= 11) { g.gameOver(); return; }
      reset(s, g, 1);
    }
  },

  draw(s, d, g) {
    d.clear("cream");
    d.line(180, 110, 180, 620, "ink", 2);
    d.text(String(s.comp), 150, 90, { size: 28, color: "ink", align: "center" });
    d.text(String(s.mine), 210, 90, { size: 28, color: "red", align: "center" });
    d.emoji("🏓", 27, s.cpy + 40, 40);
    d.emoji("🏓", 333, s.py + 40, 40);
    d.emoji("🎾", s.bx, s.by, 24);
  }
};

function hit(s, g, paddleY) {
  s.vx = s.vx > 0 ? Math.min(7, s.vx + 0.1) : Math.max(-7, s.vx - 0.1);
  s.vx = -s.vx;
  s.vy = g.clamp(s.vy + (s.by - (paddleY + 40)) / 12, -6, 6);
  s.rally += 1;
  const amp = Math.max(2, 12 - s.rally);
  s.off = g.randInt(-amp, amp);
}

function reset(s, g, dir) {
  s.bx = 180;
  s.by = 340;
  s.vx = dir * 4;
  s.vy = g.randInt(0, 1) ? 2 : -2;
  s.serve = 30;
  s.rally = 0;
  s.off = 0;
}
