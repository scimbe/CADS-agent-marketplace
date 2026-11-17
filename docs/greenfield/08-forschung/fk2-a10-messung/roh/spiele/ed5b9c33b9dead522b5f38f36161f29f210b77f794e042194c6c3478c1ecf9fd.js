// Gummibaerchen-Schaetzspiel: 3 Runden, Tipp per Pfeiltasten, Computer schaetzt mit. Naehere Schaetzung gewinnt die Runde.
export default {
  title: "Gummibärchen-Schätzspiel",
  controls: ["up", "down", "fire"],
  lives: 1,

  init(g) {
    const glas = g.randInt(20, 80);
    return {
      runde: 1, glas, tipp: 50,
      komp: g.clamp(glas + g.randInt(-12, 12), 0, 200),
      siegSp: 0, siegKomp: 0, phase: "tipp", zaehler: 0, halten: 0,
      msg: "Schätze die Anzahl!"
    };
  },

  update(s, input, g) {
    if (s.phase === "zeigen") {
      s.zaehler -= 1;
      if (s.zaehler > 0) return;
      if (s.runde < 3) {
        s.runde += 1;
        s.glas = g.randInt(20, 80);
        s.komp = g.clamp(s.glas + g.randInt(-12, 12), 0, 200);
        s.tipp = 50;
        s.phase = "tipp";
        s.msg = "Neue Runde: Schätze!";
        return;
      }
      if (s.siegSp >= 2) { s.msg = "Gesamtsieger: du!"; g.win(); }
      else { s.msg = "Gesamtsieger: Computer"; g.gameOver(); }
      return;
    }

    const dir = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    if (dir !== 0) {
      if (s.halten % 10 === 0) s.tipp = g.clamp(s.tipp + dir, 0, 200);
      s.halten += 1;
    } else s.halten = 0;

    if (!input.firePressed) return;

    g.addScore(1);
    const p = Math.abs(s.tipp - s.glas);
    const k = Math.abs(s.komp - s.glas);
    if (p < k) { s.siegSp += 1; g.addScore(10); s.msg = "Runde an dich"; g.sound("coin"); }
    else if (k < p) { s.siegKomp += 1; s.msg = "Runde an den Computer"; g.sound("pop"); }
    else s.msg = "Gleichstand, keiner gewinnt";
    s.phase = "zeigen";
    s.zaehler = 120;
  },

  draw(s, d) {
    d.clear("cream");
    d.text("Runde " + s.runde + " von 3", 180, 80, { size: 20, align: "center" });
    d.rect(110, 120, 140, 200, "cream", { round: 12, line: true });
    for (let i = 0; i < s.glas; i++) {
      const col = i % 8, row = Math.floor(i / 8);
      d.circle(120 + col * 16, 130 + row * 16, 6, "red");
    }
    if (s.phase === "tipp") {
      d.text("Dein Tipp: " + s.tipp, 180, 380, { size: 24, align: "center" });
    } else {
      d.text("Dein Tipp: " + s.tipp + "  Computer: " + s.komp + "  Glas: " + s.glas, 180, 400, { size: 16, align: "center" });
      d.text(s.msg, 180, 430, { size: 20, align: "center" });
      if (s.runde === 3) d.text("Gesamt: " + s.siegSp + " : " + s.siegKomp, 180, 470, { size: 20, align: "center" });
    }
    d.emoji("🍬", 180, 440, 48);
  }
};
