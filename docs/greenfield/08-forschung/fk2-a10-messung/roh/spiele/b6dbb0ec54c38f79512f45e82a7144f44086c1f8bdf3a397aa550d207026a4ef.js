// Wasserballon-Duell: zwei Boote am Teich, Zug fuer Zug auf einem Geraet. Treffer aufs Segel zaehlt einen Punkt.
const YS = [500, 250], V = 10, G = 0.15, LIFE = 90, ZUGE = 30, TREFFER = 5;

function fresh() {
  return { x: [20, 300], y: [YS[0], YS[1]], wer: 0, zug: 0, treffer: [0, 0], ang: [60, 60], acool: 0, ballon: null, pop: null, kippen: [0, 0], ende: 0 };
}
function reset(s) {
  const f = fresh();
  for (const k of Object.keys(f)) s[k] = f[k];
}

export default {
  title: "Wasserballon-Duell auf dem Teich",
  controls: ["left", "right", "up", "down", "fire"],
  lives: 1,

  init() {
    return fresh();
  },

  update(s, input, g) {
    if (s.ende !== 0) { if (input.firePressed) reset(s); return; }
    for (let i = 0; i < 2; i++) if (s.kippen[i] > 0) s.kippen[i] -= 1;
    if (s.pop) { s.pop.t -= 1; if (s.pop.t <= 0) s.pop = null; }
    if (s.ballon) { flight(s, g); return; }

    const w = s.wer;
    if (input.left) s.x[w] = g.clamp(s.x[w] - 4, 0, g.W - 40);
    if (input.right) s.x[w] = g.clamp(s.x[w] + 4, 0, g.W - 40);
    if (input.up || input.down) {
      if (s.acool === 0) { s.ang[w] = g.clamp(s.ang[w] + (input.up ? 1 : -1), 20, 70); s.acool = 6; }
      else s.acool -= 1;
    } else s.acool = 0;

    if (input.firePressed) {
      const dir = w === 0 ? 1 : -1, a = s.ang[w];
      s.ballon = { x: s.x[w] + (dir > 0 ? 40 : 0), y: YS[w] + 8, vx: dir * V * g.cos(a), vy: -V * g.sin(a), n: 0 };
      s.zug += 1;
      g.sound("shoot");
    }
  },

  draw(s, d, g) {
    d.clear("cream");
    d.rect(10, 60, 340, 570, "yellow", { round: 16, line: true });
    d.text("Treffer " + s.treffer[0] + " : " + s.treffer[1] + "   Zug " + s.zug + " / " + ZUGE, g.W / 2, 74, { size: 18, align: "center", color: "ink" });
    d.text("Am Zug: Spieler " + (s.wer + 1), g.W / 2, 98, { size: 18, align: "center", color: "ink" });

    for (let i = 0; i < 2; i++) {
      const bx = s.x[i], by = YS[i];
      d.emoji("⛵", bx + 20, by + 15, 36);
      if (s.kippen[i] > 0) d.line(bx - 4, by + 24, bx + 44, by + (s.kippen[i] > 15 ? 4 : 28), "red", 3);
    }

    if (!s.ballon && s.ende === 0) {
      const w = s.wer, dir = w === 0 ? 1 : -1, a = s.ang[w];
      const tx = s.x[w] + (dir > 0 ? 40 : 0), ty = YS[w] + 8;
      d.line(tx, ty, tx + dir * 60 * g.cos(a), ty - 60 * g.sin(a), "red", 3);
      d.text(a + "°", tx + dir * 20, ty - 70, { size: 16, align: "center", color: "red" });
    }

    if (s.ballon) d.emoji("🎈", s.ballon.x, s.ballon.y, 22);
    if (s.pop) {
      d.circle(s.pop.x, s.pop.y, 4 + (20 - s.pop.t) * 1.2, "yellow", { line: true });
      d.emoji("💦", s.pop.x, s.pop.y, 28);
    }

    if (s.ende === 1 || s.ende === 2) {
      d.emoji("🎉", g.W / 2, 330, 80);
      d.text("Spieler " + s.ende + " gewinnt!", g.W / 2, 400, { size: 24, align: "center", color: "ink" });
      d.text("fire: neues Duell", g.W / 2, 440, { size: 16, align: "center", color: "ink" });
    } else if (s.ende === 3) {
      d.text("Zuglimit erreicht", g.W / 2, 400, { size: 24, align: "center", color: "ink" });
      d.text("fire: neues Duell", g.W / 2, 440, { size: 16, align: "center", color: "ink" });
    }
  }
};

function flight(s, g) {
  const b = s.ballon, w = s.wer, t = 1 - w;
  b.n += 1;
  b.vy += G;
  b.x += b.vx;
  b.y += b.vy;
  if (g.hit({ x: b.x, y: b.y, r: 6 }, { x: s.x[t] + 20, y: YS[t] + 4, r: 14 })) {
    s.treffer[w] += 1;
    g.addScore(1);
    g.sound("pop");
    s.pop = { x: b.x, y: b.y, t: 20 };
    s.kippen[t] = 30;
    s.ballon = null;
    s.wer = t;
    if (s.treffer[w] >= TREFFER) { s.ende = w + 1; g.win(); return; }
  } else if (b.n >= LIFE || b.y >= g.H - 30 || b.x < -20 || b.x > g.W + 20) {
    s.ballon = null;
    s.wer = t;
  } else return;
  if (s.zug >= ZUGE) { s.ende = 3; g.gameOver(); }
}
