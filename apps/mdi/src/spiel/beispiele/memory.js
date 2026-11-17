// Vorlage fuer Runden- und Brettspiele (Freie Karte 2, P3-Verbesserung 2): Memory mit Cursor. Zeigt die Bot-Regeln fuer
// Spiele ohne Echtzeit-Gefahr: Zwischenpunkte je Zug (nicht erst am Ende), ein Zuglimit, damit Zufallszuege in 60 s ans
// Ende kommen, Cursor mit Wiederholung beim Halten (jede Richtung wirkt sofort) und Waehlen mit Feuer bzw. Tippen.
const BILDER = ["🍕", "🍩", "🐸", "⛵", "🎈", "🌟", "🍓", "🐢"];
const SPALTEN = 4, ZEILEN = 4, ZELLE = 76, X0 = 28, Y0 = 120;
const ZUEGE = 24, WIEDERHOLEN = 12, ZEIGEN = 40;

export default {
  title: "Memory",
  controls: ["left", "right", "up", "down", "fire"],
  lives: 1,

  init(g) {
    const karten = [];
    for (const b of BILDER) { karten.push({ b, offen: false, weg: false }); karten.push({ b, offen: false, weg: false }); }
    for (let i = karten.length - 1; i > 0; i--) { const j = g.randInt(0, i); const t = karten[i]; karten[i] = karten[j]; karten[j] = t; }
    return { karten, cx: 0, cy: 0, halten: 0, wahl: [], zeigen: 0, zuege: 0, paare: 0 };
  },

  update(s, input, g) {
    // zwei offene Karten ohne Paar: kurz zeigen, dann wieder umdrehen (Eingaben warten so lange)
    if (s.zeigen > 0) {
      s.zeigen -= 1;
      if (s.zeigen === 0) { for (const i of s.wahl) s.karten[i].offen = false; s.wahl = []; }
      return;
    }
    // Cursor: sofort beim Druecken, dann alle WIEDERHOLEN Frames, solange gehalten
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0), dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      if (s.halten % WIEDERHOLEN === 0) { s.cx = g.clamp(s.cx + dx, 0, SPALTEN - 1); s.cy = g.clamp(s.cy + dy, 0, ZEILEN - 1); }
      s.halten += 1;
    } else s.halten = 0;
    if (!input.firePressed) return;
    const i = s.cy * SPALTEN + s.cx, k = s.karten[i];
    if (k.offen || k.weg) return;
    k.offen = true; s.wahl.push(i); g.sound("pop");
    if (s.wahl.length < 2) return;
    s.zuege += 1;
    const a = s.karten[s.wahl[0]], b = s.karten[s.wahl[1]];
    if (a.b === b.b) {
      a.weg = true; b.weg = true; s.wahl = []; s.paare += 1;
      g.addScore(10);                       // Zwischenpunkte je gefundenem Paar
      g.sound("coin");
      if (s.paare === BILDER.length) { g.addScore(ZUEGE - s.zuege); g.win(); return; }
    } else {
      g.addScore(1);                        // auch ein Zug ohne Paar zaehlt (Punkte entstehen beim Spielen)
      s.zeigen = ZEIGEN;
    }
    if (s.zuege >= ZUEGE) g.gameOver();     // Zuglimit: das Spiel endet sicher
  },

  draw(s, d, g) {
    d.clear("cream");
    d.text("Züge: " + s.zuege + " / " + ZUEGE, g.W / 2, 80, { size: 20, align: "center" });
    for (let i = 0; i < s.karten.length; i++) {
      const k = s.karten[i], x = X0 + (i % SPALTEN) * ZELLE, y = Y0 + Math.floor(i / SPALTEN) * ZELLE;
      if (k.weg) { d.rect(x, y, ZELLE - 8, ZELLE - 8, "cream", { round: 10, line: true }); continue; }
      d.rect(x, y, ZELLE - 8, ZELLE - 8, k.offen ? "cream" : "yellow", { round: 10, shadow: true, line: true });
      if (k.offen) d.emoji(k.b, x + (ZELLE - 8) / 2, y + (ZELLE - 8) / 2, 40);
    }
    const cx = X0 + s.cx * ZELLE - 4, cy = Y0 + s.cy * ZELLE - 4;
    d.rect(cx, cy, ZELLE, 4, "red"); d.rect(cx, cy + ZELLE - 4, ZELLE, 4, "red");
    d.rect(cx, cy, 4, ZELLE, "red"); d.rect(cx + ZELLE - 4, cy, 4, ZELLE, "red");
  }
};
