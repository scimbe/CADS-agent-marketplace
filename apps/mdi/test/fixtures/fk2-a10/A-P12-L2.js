// Bunte Memory-Karten: 6 Paare gemalter Symbole, 12 verdeckte Karten. Feuer dreht um, Cursor mit Richtungen.
// Spielende: Zuglimit, Zeitlimit oder Ruhezeit nach dem Finale (Text bleibt sichtbar).
const BILDER = ["🌞", "🌸", "⛵", "🐸", "🍓", "🎈"];
const SPALTEN = 3, ZEILEN = 4, ZELLE = 76, KARTE = 68, X0 = 28, Y0 = 120;
const ZUEGE = 24, WIEDERHOLEN = 12, ZEIGEN = 120, DAUER = 2400, RUHE = 900;

export default {
  title: "Bunte Memory-Karten",
  controls: ["left", "right", "up", "down", "fire"],
  lives: 1,

  init(g) {
    const s = { karten: [], cx: 0, cy: 0, halten: 0, wahl: [], zeigen: 0, zuege: 0, paare: 0, fertig: false, dauer: 0, ruhe: 0 };
    mische(s, g);
    return s;
  },

  update(s, input, g) {
    if (s.fertig) {
      s.ruhe += 1;
      if (input.firePressed) { mische(s, g); return; }
      if (s.ruhe >= RUHE) g.gameOver();
      return;
    }
    s.dauer += 1;
    if (s.dauer >= DAUER) { g.gameOver(); return; }
    // zwei offene Karten ohne Paar: kurz zeigen, dann wieder verdecken
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
    if (k.offen || k.weg) return;
    k.offen = true;
    s.wahl.push(i);
    g.sound("pop");
    if (s.wahl.length < 2) return;

    s.zuege += 1;
    const a = s.karten[s.wahl[0]], b = s.karten[s.wahl[1]];
    if (a.b === b.b) {
      a.weg = true; b.weg = true;
      s.wahl = [];
      s.paare += 1;
      g.addScore(10);
      g.sound("coin");
      if (s.paare === BILDER.length) { s.fertig = true; s.ruhe = 0; return; }
    } else {
      g.addScore(1);
      s.zeigen = ZEIGEN;
    }
    if (s.zuege >= ZUEGE) g.gameOver();
  },

  draw(s, d, g) {
    d.clear("cream");
    d.text("Züge: " + s.zuege + " / " + ZUEGE, g.W / 2, 64, { size: 20, align: "center" });
    for (let i = 0; i < s.karten.length; i++) {
      const k = s.karten[i];
      const x = X0 + (i % SPALTEN) * ZELLE, y = Y0 + Math.floor(i / SPALTEN) * ZELLE;
      if (k.weg) { d.rect(x, y, KARTE, KARTE, "cream", { round: 10, line: true }); continue; }
      d.rect(x, y, KARTE, KARTE, k.offen ? "cream" : "yellow", { round: 10, shadow: true, line: true });
      if (k.offen) d.emoji(k.b, x + KARTE / 2, y + KARTE / 2, 40);
    }
    if (!s.fertig) {
      const cx = X0 + s.cx * ZELLE - 4, cy = Y0 + s.cy * ZELLE - 4;
      d.rect(cx, cy, ZELLE, 4, "red"); d.rect(cx, cy + ZELLE - 4, ZELLE, 4, "red");
      d.rect(cx, cy, 4, ZELLE, "red"); d.rect(cx + ZELLE - 4, cy, 4, ZELLE, "red");
    } else {
      d.text("Gut gemacht", g.W / 2, 90, { size: 28, align: "center" });
      d.text("Neue Runde mit Feuer", g.W / 2, 470, { size: 20, align: "center" });
    }
  }
};

function mische(s, g) {
  const karten = [];
  for (const b of BILDER) {
    karten.push({ b, offen: false, weg: false });
    karten.push({ b, offen: false, weg: false });
  }
  for (let i = karten.length - 1; i > 0; i--) {
    const j = g.randInt(0, i);
    const t = karten[i]; karten[i] = karten[j]; karten[j] = t;
  }
  s.karten = karten;
  s.cx = 0; s.cy = 0; s.halten = 0; s.wahl = []; s.zeigen = 0;
  s.zuege = 0; s.paare = 0; s.fertig = false; s.dauer = 0; s.ruhe = 0;
}
