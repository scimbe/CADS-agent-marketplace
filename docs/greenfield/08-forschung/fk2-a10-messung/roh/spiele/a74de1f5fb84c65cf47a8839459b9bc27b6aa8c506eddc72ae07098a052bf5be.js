// Memory mit 12 Karten (6 Paare), Cursor mit Richtungen, Feuer waehlt. Keine Uhr, nur Zuglimit.
const BILDER = ["🌞", "🌸", "⭐", "❤️", "🏠", "⚽"];
const SPALTEN = 4, ZEILEN = 3, ZELLE = 80, KARTE = 68, X0 = 26, Y0 = 150;
const ZUEGE = 24, WIEDERHOLEN = 12, ZEIGEN = 40;

export default {
  title: "Memory mit 12 bunten Karten",
  controls: ["left", "right", "up", "down", "fire"],
  lives: 1,

  init(g) {
    const karten = [];
    for (const b of BILDER) {
      karten.push({ b, offen: false, paar: false });
      karten.push({ b, offen: false, paar: false });
    }
    for (let i = karten.length - 1; i > 0; i--) {
      const j = g.randInt(0, i);
      const t = karten[i]; karten[i] = karten[j]; karten[j] = t;
    }
    return { karten, cx: 0, cy: 0, halten: 0, wahl: [], zeigen: 0, zuege: 0, paare: 0, fertig: false };
  },

  update(s, input, g) {
    if (s.fertig) return;
    // zwei offene Karten ohne Paar kurz zeigen, dann wieder verdecken
    if (s.zeigen > 0) {
      s.zeigen -= 1;
      if (s.zeigen === 0) {
        for (const i of s.wahl) s.karten[i].offen = false;
        s.wahl = [];
      }
      return;
    }
    // Cursor: sofort beim Druecken, dann alle WIEDERHOLEN Frames solange gehalten
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      if (s.halten % WIEDERHOLEN === 0) {
        s.cx = g.clamp(s.cx + dx, 0, SPALTEN - 1);
        s.cy = g.clamp(s.cy + dy, 0, ZEILEN - 1);
      }
      s.halten += 1;
    } else s.halten = 0;

    if (!input.firePressed) return;
    const i = s.cy * SPALTEN + s.cx;
    const k = s.karten[i];
    if (k.offen || k.paar) return;
    k.offen = true;
    s.wahl.push(i);
    g.sound("pop");
    if (s.wahl.length < 2) return;

    s.zuege += 1;
    const a = s.karten[s.wahl[0]], b = s.karten[s.wahl[1]];
    if (a.b === b.b) {
      a.paar = true; b.paar = true;
      s.wahl = [];
      s.paare += 1;
      g.addScore(10);
      g.sound("coin");
      if (s.paare === BILDER.length) {
        s.fertig = true;
        g.addScore(Math.max(0, ZUEGE - s.zuege));
        g.win();
        return;
      }
    } else {
      g.addScore(1);
      s.zeigen = ZEIGEN;
    }
    if (s.zuege >= ZUEGE) g.gameOver();
  },

  draw(s, d, g) {
    d.clear("cream");
    d.text("Züge: " + s.zuege + " / " + ZUEGE, g.W / 2, 90, { size: 20, align: "center" });
    for (let i = 0; i < s.karten.length; i++) {
      const k = s.karten[i];
      const x = X0 + (i % SPALTEN) * ZELLE, y = Y0 + Math.floor(i / SPALTEN) * ZELLE;
      if (k.paar) d.rect(x, y, KARTE, KARTE, "cream", { round: 10, line: true });
      else d.rect(x, y, KARTE, KARTE, k.offen ? "cream" : "yellow", { round: 10, shadow: true, line: true });
      if (k.offen || k.paar) d.emoji(k.b, x + KARTE / 2, y + KARTE / 2, 40);
    }
    if (!s.fertig) {
      const cx = X0 + s.cx * ZELLE - 6, cy = Y0 + s.cy * ZELLE - 6;
      d.rect(cx, cy, KARTE + 12, 4, "red");
      d.rect(cx, cy + KARTE + 8, KARTE + 12, 4, "red");
      d.rect(cx, cy, 4, KARTE + 12, "red");
      d.rect(cx + KARTE + 8, cy, 4, KARTE + 12, "red");
    } else {
      d.text("Glückwunsch, schön gemacht!", g.W / 2, g.H / 2, { size: 22, color: "ink", align: "center" });
    }
  }
};
