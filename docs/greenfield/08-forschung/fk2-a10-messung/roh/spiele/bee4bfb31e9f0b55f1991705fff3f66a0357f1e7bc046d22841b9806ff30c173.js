// Wuerfelrunde fuer vier am Tisch: Reihum wuerfeln, 1 setzt die Rundenpunkte auf 0, 6 gibt einen Bonuswurf.
const FIG = ["🐸", "🐢", "🍓", "🎈"];
const NAMEN = ["Person 1", "Person 2", "Person 3", "Person 4"];
const ZIEL = 100, ZUGLIMIT = 200;

export default {
  title: "Würfelrunde für vier am Tisch",
  controls: ["fire"],
  lives: 1,

  init(g) {
    return {
      spieler: [0, 1, 2, 3].map(() => ({ total: 0, turn: 0 })),
      aktuell: 0, sieger: -1, bonus: false, zuege: 0, wurf: 0
    };
  },

  update(s, input, g) {
    if (s.sieger !== -1 || !input.firePressed) return;
    const v = g.randInt(1, 6);
    const p = s.spieler[s.aktuell];
    s.zuege += 1;
    s.wurf = v;
    if (v === 1) {
      p.total -= p.turn; p.turn = 0; s.bonus = false;
      g.sound("pop");
      s.aktuell = (s.aktuell + 1) % 4;
    } else if (v === 6) {
      p.total += 6; p.turn += 6; s.bonus = true;
      g.addScore(6); g.sound("coin");
    } else {
      p.total += v; p.turn = 0; s.bonus = false;
      g.addScore(v); g.sound("coin");
      s.aktuell = (s.aktuell + 1) % 4;
    }
    if (p.total >= ZIEL) { s.sieger = s.spieler.indexOf(p); g.win(); return; }
    if (s.zuege >= ZUGLIMIT) g.gameOver();
  },

  draw(s, d, g) {
    d.clear("cream");
    for (let i = 0; i < 4; i++) {
      const y = 60 + i * 62, p = s.spieler[i];
      if (i === s.aktuell && s.sieger === -1) d.rect(16, y - 4, 328, 62, "red", { round: 14 });
      d.rect(20, y, 320, 54, "yellow", { round: 12, line: true });
      d.emoji(FIG[i], 52, y + 27, 36);
      d.text(NAMEN[i], 84, y + 20, { size: 20, color: "ink", align: "left" });
      d.text(String(p.total), 332, y + 20, { size: 20, color: "ink", align: "right" });
    }
    d.text(s.wurf > 0 ? String(s.wurf) : "-", 180, 390, { size: 64, color: "ink", align: "center" });
    d.rect(60, 470, 240, 80, "red", { round: 20, shadow: true });
    d.text("Würfeln", 180, 500, { size: 28, color: "cream", align: "center" });
    if (s.sieger >= 0) d.text("Person " + (s.sieger + 1) + " gewinnt", 180, 590, { size: 24, color: "red", align: "center" });
    else d.text("Dran: " + NAMEN[s.aktuell], 180, 590, { size: 20, color: "ink", align: "center" });
  }
};
