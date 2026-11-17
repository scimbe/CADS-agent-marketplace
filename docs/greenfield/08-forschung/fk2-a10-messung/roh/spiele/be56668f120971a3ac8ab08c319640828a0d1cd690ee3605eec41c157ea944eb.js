// Schaetzspiel (Runden-Vorlage): Gummibaerchen zaehlen, 5 Runden, Computer schaetzt mit.
const RUNDEN = 5, KI_ZEIT = 30, AUSW = 90, WIEDERHOLEN = 12;

export default {
  title: "Gummibärchen-Schätzspiel",
  controls: ["up", "down", "fire"],
  lives: 1,

  init(g) {
    return { runde: 1, glas: g.randInt(10, 60), schaetzung: 20, ki: null, gesch: null, rt: 0, halten: 0,
      punkte: 0, ki_punkte: 0, info: "Schätze, wie viele Bärchen im Glas sind!", ende: false };
  },

  update(s, input, g) {
    if (s.ende) return;
    // Zahl aendern: sofort beim Druecken, dann alle WIEDERHOLEN Frames, solange gehalten
    const dir = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    if (dir !== 0) {
      if (s.halten % WIEDERHOLEN === 0) s.schaetzung = g.clamp(s.schaetzung + dir, 0, 99);
      s.halten += 1;
    } else s.halten = 0;
    // Schaetzen: jede Bestaetigung gibt sofort 1 Punkt
    if (input.firePressed) {
      s.gesch = s.schaetzung;
      s.punkte += 1;
      g.addScore(1);
      g.sound("pop");
    }
    s.rt += 1;
    if (s.rt === KI_ZEIT && s.ki === null) s.ki = g.randInt(0, 99);
    if (s.rt >= AUSW) auswerten(s, g);
  },

  draw(s, d, g) {
    d.clear("cream");
    d.text("Runde " + s.runde + " von " + RUNDEN, g.W / 2, 90, { size: 22, align: "center" });
    d.emoji("🫙", 180, 300, 150);
    for (let i = 0; i < s.glas; i++) {
      const col = i % 8, row = Math.floor(i / 8);
      d.emoji("🐻", 128 + col * 14, 236 + row * 16, 16);
    }
    d.text("Deine Schätzung: " + s.schaetzung, g.W / 2, 130, { size: 22, align: "center" });
    d.text("Computer: " + (s.ki === null ? "schätzt noch ..." : s.ki), g.W / 2, 162, { size: 18, align: "center" });
    d.text(s.gesch === null ? "Du bist dran" : "Geschätzt, warte auf Auswertung", g.W / 2, 500, { size: 18, align: "center" });
    d.text("Hoch/runter: ändern, Feuer: schätzen", g.W / 2, 530, { size: 16, align: "center" });
    d.text("Du " + s.punkte + "  :  Computer " + s.ki_punkte, g.W / 2, 565, { size: 22, align: "center" });
    d.text(s.info, g.W / 2, 605, { size: 14, align: "center" });
  }
};

function auswerten(s, g) {
  const dSp = s.gesch === null ? 999 : Math.abs(s.gesch - s.glas);
  const dKi = Math.abs(s.ki - s.glas);
  let txt = "Glas: " + s.glas + ". ";
  if (dSp < dKi) { s.punkte += 10; g.addScore(10); txt += "Du bist näher dran (+10)."; }
  else if (dKi < dSp) { s.ki_punkte += 10; txt += "Computer ist näher dran (+10)."; }
  else { s.punkte += 5; g.addScore(5); s.ki_punkte += 5; txt += "Gleichstand (je +5)."; }
  s.info = txt;
  if (s.runde >= RUNDEN) {
    s.ende = true;
    if (s.punkte > s.ki_punkte) g.win(); else g.gameOver();
    return;
  }
  s.runde += 1;
  s.glas = g.randInt(10, 60);
  s.gesch = null;
  s.ki = null;
  s.rt = 0;
  s.halten = 0;
  g.sound("level");
}
