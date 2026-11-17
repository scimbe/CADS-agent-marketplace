// Wuerfelspiel fuer 4 Spieler am selben Geraet, Zug fuer Zug. Zwei Wuerfel, Summe als Punkte.
// Eine 1 mit einer anderen Zahl zaehlt nicht. Wer zuerst 100 Punkte hat, gewinnt.
const DICE = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const LAMPS = [[30, 140], [80, 170], [130, 132], [180, 178], [230, 132], [280, 170], [330, 140], [55, 188]];
const SCHIRME = [60, 180, 300];
const ZIEL = 100, ZEIT = 60, ZUEGE_MAX = 40;

export default {
  title: "Würfeln bis 100 am Tisch",
  controls: ["fire"],
  lives: 1,

  init(g) {
    return { namen: ["Spieler 1", "Spieler 2", "Spieler 3", "Spieler 4"], scores: [0, 0, 0, 0], cur: 0, phase: "wurf", timer: 0, w1: 0, w2: 0, zuege: 0, sieger: -1 };
  },

  update(s, input, g) {
    if (s.phase === "ende") return;
    if (s.phase === "zeige") {
      s.timer -= 1;
      if (s.timer > 0) return;
      if (s.zuege >= ZUEGE_MAX) { g.gameOver(); return; }
      s.cur = (s.cur + 1) % 4;
      s.phase = "wurf";
      return;
    }
    if (!input.firePressed) return;
    s.w1 = g.randInt(1, 6);
    s.w2 = g.randInt(1, 6);
    s.zuege += 1;
    s.phase = "zeige";
    s.timer = ZEIT;
    if ((s.w1 === 1 || s.w2 === 1) && s.w1 !== s.w2) return;
    const summe = s.w1 + s.w2;
    s.scores[s.cur] += summe;
    g.addScore(summe);
    g.sound("coin");
    if (s.scores[s.cur] >= ZIEL) {
      s.sieger = s.cur;
      s.phase = "ende";
      g.sound("win");
      g.win();
    }
  },

  draw(s, d, g) {
    d.clear("cream");
    d.rect(0, 580, g.W, 60, "yellow");
    for (const [x, y] of LAMPS) d.emoji("🏮", x, y, 30);
    for (const x of SCHIRME) d.emoji("⛱️", x, 600, 40);
    for (let i = 0; i < 4; i++) {
      const x0 = 6 + i * 88, aktiv = i === s.cur && s.phase !== "ende";
      d.rect(x0, 50, 84, 58, aktiv ? "yellow" : "cream", { round: 10, line: true });
      d.text(s.namen[i], x0 + 42, 64, { size: 13, color: "ink", align: "center" });
      d.text(String(s.scores[i]), x0 + 42, 84, { size: 20, color: "red", align: "center" });
      if (aktiv) d.text("am Zug", x0 + 42, 100, { size: 11, color: "ink", align: "center" });
    }
    if (s.zuege > 0) {
      d.emoji(DICE[s.w1 - 1], 130, 390, 80);
      d.emoji(DICE[s.w2 - 1], 230, 390, 80);
      d.text("Augen", 180, 325, { size: 20, color: "ink", align: "center" });
    }
    d.text("Am Zug: " + s.namen[s.cur], 180, 445, { size: 14, color: "ink", align: "center" });
    d.rect(30, 470, 300, 120, "red", { round: 20, shadow: true });
    d.text("Würfeln", 180, 520, { size: 32, color: "cream", align: "center" });
    if (s.phase === "ende") {
      d.rect(40, 250, 280, 100, "yellow", { round: 16, shadow: true, line: true });
      d.text("Sieg: " + s.namen[s.sieger], 180, 290, { size: 26, color: "ink", align: "center" });
    }
  }
};
