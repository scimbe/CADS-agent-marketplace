// Referenzspiel 2 (nur Spiel-API): Schlaeger, Ball, Steinmauer. Feuer startet den Ball (sonst nach 3 Sekunden).
export default {
  title: "Mauerbrecher",
  controls: ["left", "right", "fire"],
  lives: 3,

  init(g) {
    return { pad: { x: g.W / 2 - 35, y: 590, w: 70, h: 14 }, ball: { x: g.W / 2, y: 580, r: 7, vx: 0, vy: 0 }, stuck: true, wait: 0, bricks: wall(g, 1) };
  },

  update(s, input, g) {
    const pad = s.pad, ball = s.ball;
    if (input.left) pad.x -= 6;
    if (input.right) pad.x += 6;
    pad.x = g.clamp(pad.x, 0, g.W - pad.w);

    if (s.stuck) {
      ball.x = pad.x + pad.w / 2; ball.y = pad.y - ball.r - 1;
      s.wait += 1;
      if (input.firePressed || input.fire || s.wait > 180) {
        const speed = 4.5 + 0.5 * g.level;
        s.stuck = false; s.wait = 0; ball.vx = (g.random() - 0.5) * 4; ball.vy = -speed;
        g.sound("jump");
      }
      return;
    }

    // in kleinen Schritten bewegen, damit der Ball nicht durch Steine tunnelt
    for (let k = 0; k < 4; k++) {
      ball.x += ball.vx / 4; ball.y += ball.vy / 4;
      if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); }
      if (ball.x + ball.r > g.W) { ball.x = g.W - ball.r; ball.vx = -Math.abs(ball.vx); }
      if (ball.y - ball.r < g.TOP) { ball.y = g.TOP + ball.r; ball.vy = Math.abs(ball.vy); }
      if (ball.vy > 0 && g.hit(ball, pad)) {
        const off = (ball.x - (pad.x + pad.w / 2)) / (pad.w / 2);
        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        ball.vx = off * speed * 0.8; ball.vy = -Math.sqrt(Math.max(1, speed * speed - ball.vx * ball.vx));
        g.sound("hit");
      }
      const b = s.bricks.find((x) => g.hit(ball, x));
      if (b) {
        s.bricks = s.bricks.filter((x) => x !== b);
        ball.vy = -ball.vy;
        g.addScore(5 * g.level);
        g.sound("pop");
      }
    }
    if (ball.y - ball.r > g.H) { s.stuck = true; g.sound("hurt"); g.loseLife(); }
    if (s.bricks.length === 0) { g.nextLevel(); g.sound("level"); s.bricks = wall(g, g.level); s.stuck = true; }
  },

  draw(s, d) {
    d.clear("cream");
    for (const b of s.bricks) d.rect(b.x, b.y, b.w, b.h, b.row % 2 === 0 ? "red" : "yellow", { round: 6, line: true });
    d.rect(s.pad.x, s.pad.y, s.pad.w, s.pad.h, "ink", { round: 7, shadow: true });
    d.circle(s.ball.x, s.ball.y, s.ball.r, "red", { line: true });
  }
};

function wall(g, level) {
  const out = [], rows = Math.min(3 + level, 7);
  for (let r = 0; r < rows; r++) for (let c = 0; c < 6; c++) out.push({ x: 8 + c * 58, y: g.TOP + 30 + r * 26, w: 52, h: 18, row: r });
  return out;
}
