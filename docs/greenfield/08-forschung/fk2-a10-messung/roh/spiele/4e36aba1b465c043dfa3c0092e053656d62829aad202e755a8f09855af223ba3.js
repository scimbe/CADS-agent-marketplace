// Wuerfelspiel fuer 4 Personen am Tisch: reihum wuerfeln, wer zuerst 100 Punkte hat, gewinnt. Eine 1 setzt die Rundenpunkte auf 0.
const X = 12, W = 336, H = 130, Y0 = 60, DY = 145, ZIEL = 100, ZUEGE_MAX = 120;

export default {
  title: "Würfeln bis 100 Punkte",
  controls: ["fire"],
  lives: 1,

  init(g) {
    return { t: [0, 0, 0, 0], rund: [0, 0, 0, 0], letzt: [0, 0, 0, 0], zug: 0, zuege: 0, ende: false, sieger: -1 };
  },

  update(s, input, g) {
    if (s.ende) return;
    if (!input.firePressed) return;
    const z = s.zug;
    const r = g.randInt(1, 6);
    s.zuege += 1;
    s.letzt[z] = r;
    if (r === 1) {
      s.rund[z] = 0;
    } else {
      s.t[z] += r;
      s.rund[z] += r;
      g.addScore(r);
      g.sound("coin");
    }
    if (s.t[z] >= ZIEL) {
      s.sieger = z;
      s.ende = true;
      g.sound("win");
      g.win();
    } else if (s.zuege >= ZUEGE_MAX) {
      s.ende = true;
      g.sound("lose");
      g.gameOver();
    } else {
      s.zug = (z + 1) % 4;
    }
  },

  draw(s, d, g) {
    d.clear("cream");
    d.emoji("🎲", g.W / 2, 26, 48);
    for (let i = 0; i < 4; i++) {
      const y = Y0 + i * DY;
      const aktiv = !s.ende && s.zug === i;
      d.rect(X, y, W, H, aktiv ? "red" : "ink", { round: 14, shadow: true });
      d.rect(X + 4, y + 4, W - 8, H - 8, "cream", { round: 12 });
      d.text("Spieler " + (i + 1), X + 18, y + 26, { size: 22, color: "ink", align: "left" });
      d.text(String(s.t[i]), X + W - 18, y + 26, { size: 28, color: "ink", align: "right" });
      d.text("Runde: " + s.rund[i], X + 18, y + 72, { size: 16, color: "ink", align: "left" });
      const letzt = s.letzt[i] > 0 ? String(s.letzt[i]) : "";
      d.text("Letzter Wurf: " + letzt, X + 18, y + 102, { size: 16, color: "ink", align: "left" });
    }
    if (!s.ende) {
      d.text("Dran: Spieler " + (s.zug + 1) + ", Feuer zum Wuerfeln", g.W / 2, 634, { size: 18, color: "ink", align: "center" });
    }
    if (s.ende && s.sieger >= 0) {
      d.rect(20, 250, 320, 140, "yellow", { round: 20, shadow: true });
      d.text("Gewonnen!", g.W / 2, 300, { size: 40, color: "ink", align: "center" });
      d.text("Spieler " + (s.sieger + 1), g.W / 2, 350, { size: 40, color: "ink", align: "center" });
    }
  }
};
