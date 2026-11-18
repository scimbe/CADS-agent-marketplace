// Segelboot-Wellen im Hafen (nur Spiel-API). Holzboote wandern in Reihen, Wasserbomben stoppen sie.
export default {
  title: "Segelboot-Wellen im Hafen",
  controls: ["left", "right", "fire"],
  lives: 3,

  init(g) {
    return { ship: { x: g.W / 2 - 20, y: 580, w: 40, h: 30 }, bombs: [], boats: fleet(g), drift: [], effekte: [], dir: -1, cool: 0, step: 0 };
  },

  update(s, input, g) {
    const ship = s.ship;
    if (input.left) ship.x -= 4;
    if (input.right) ship.x += 4;
    ship.x = g.clamp(ship.x, 4, g.W - 44);

    if (s.cool > 0) s.cool -= 1;
    if ((input.firePressed || input.fire) && s.cool === 0 && s.bombs.length < 3) {
      s.bombs.push({ x: ship.x + 20, y: ship.y, r: 7 });
      s.cool = 14;
      g.sound("shoot");
    }
    for (const b of s.bombs) b.y -= 8;
    s.bombs = s.bombs.filter((b) => b.y >= g.TOP);

    // Holzboote: seitwaerts, am Rand umkehren und eine Reihe tiefer
    const speed = 0.5 + 0.2 * g.level + (24 - s.boats.length) * 0.04;
    let edge = false;
    for (const b of s.boats) {
      b.x += s.dir * speed;
      if ((s.dir < 0 && b.x < 6) || (s.dir > 0 && b.x + b.w > g.W - 6)) edge = true;
    }
    if (edge) { s.dir = -s.dir; for (const b of s.boats) b.y += 14; }

    // Die Flotte rueckt auch ohne Treffer langsam vor (sonst wuerde sie nie das Ufer erreichen)
    s.step += 1;
    if (s.step >= 28) { s.step = 0; for (const b of s.boats) b.y += 14; }

    // Beruehrung des Segelboots oder untere Grenze beendet die Runde
    for (const b of s.boats) {
      if (b.y + b.h >= 560 || g.hit(ship, b)) { g.gameOver(); return; }
    }

    // Treffer: Bombe versenkt das Boot, es treibt weg
    for (const bomb of s.bombs) {
      for (const b of s.boats) {
        if (!b.sunk && g.hit(bomb, b)) {
          b.sunk = true;
          bomb.y = -100;
          g.addScore(1);
          g.sound("pop");
          s.drift.push({ x: b.x, y: b.y, w: b.w, h: b.h, t: 60 });
          s.effekte.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, t: 10 });
          break;
        }
      }
    }
    s.bombs = s.bombs.filter((b) => b.y >= g.TOP);
    s.boats = s.boats.filter((b) => !b.sunk);

    for (const d of s.drift) { d.x -= 0.6; d.y += 1; d.t -= 1; }
    s.drift = s.drift.filter((d) => d.t > 0 && d.y < g.H);
    for (const e of s.effekte) e.t -= 1;
    s.effekte = s.effekte.filter((e) => e.t > 0);

    // Welle geschafft: naechste, schnellere Welle
    if (s.boats.length === 0) {
      g.nextLevel();
      g.sound("level");
      s.boats = fleet(g);
      s.dir = -1;
      s.bombs = [];
      s.step = 0;
    }
  },

  draw(s, d, g) {
    d.clear("cream");
    for (let y = 120; y < g.H; y += 60) d.line(0, y + (g.frame >> 3) % 6, g.W, y + (g.frame >> 3) % 6, "yellow", 2);
    for (const b of s.boats) d.emoji("🛶", b.x + b.w / 2, b.y + b.h / 2, 30);
    for (const t of s.drift) {
      d.rect(t.x, t.y, t.w, t.h, "red", { round: 8 });
      d.emoji("🛶", t.x + t.w / 2, t.y + t.h / 2, 20);
    }
    for (const e of s.effekte) {
      d.circle(e.x, e.y, 4 + (10 - e.t), "yellow");
      d.circle(e.x + 3, e.y - 3, 3 + (10 - e.t) / 2, "red");
    }
    for (const b of s.bombs) {
      d.circle(b.x, b.y, 11, "yellow");
      d.emoji("💧", b.x, b.y, 22);
    }
    d.emoji("⛵", s.ship.x + 20, s.ship.y + 15, 36);
  }
};

function fleet(g) {
  const out = [];
  const rows = Math.min(2 + g.level, 5);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 6; c++) out.push({ x: 20 + c * 52, y: g.TOP + 20 + r * 42, w: 34, h: 30, sunk: false });
  }
  return out;
}
