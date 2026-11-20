// Wasserballon-Duell: zwei Boote am Teich, Zug um Zug am selben Geraet. Wer trifft, bekommt Punkte.
// Keine Gewalt, kein Blut: nur Wasserballons, Spritzer und Wellen.
// Der Holzsteg liegt links, damit Wuerfe zur Gegenlinie nicht zwangslaeufig an ihm zerplatzen.
const STEG = { x: 40, y: 316, w: 110, h: 14 };

export default {
  title: "Wasserballon-Duell auf dem Teich",
  controls: ["left", "right", "fire"],
  lives: 1,

  init(g) {
    return { spieler: 1, zz: 180, halten: 0, flug: null, spritz: null, treffer: [0, 0], zuege: 0 };
  },

  update(s, input, g) {
    if (s.spritz) { s.spritz.t -= 1; if (s.spritz.t <= 0) s.spritz = null; }

    if (s.flug) {
      const f = s.flug;
      f.t += 1;
      const k = f.t / 30;
      f.x = f.x0 + (f.x1 - f.x0) * k;
      f.y = f.y0 + (f.y1 - f.y0) * k;
      // Steg: der Ballon platzt, kein Punkt
      if (f.y >= STEG.y && f.y <= STEG.y + STEG.h && f.x >= STEG.x && f.x <= STEG.x + STEG.w) {
        g.sound("pop");
        endeZug(s, g, false);
        return;
      }
      if (f.t >= 30) {
        endeZug(s, g, Math.abs(f.x1 - 180) <= 30);
      }
      return;
    }

    // Zielen: Zielmarke bewegen, mit fire werfen
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dx !== 0) {
      if (s.halten % 12 === 0) s.zz = g.clamp(s.zz + 10 * dx, 20, 340);
      s.halten += 1;
    } else s.halten = 0;

    if (input.firePressed) {
      const sp = s.spieler;
      s.flug = { sp, x0: 180, y0: sp === 1 ? 150 : 490, x1: s.zz, y1: sp === 1 ? 500 : 140, t: 0, x: 180, y: sp === 1 ? 150 : 490 };
      s.halten = 0;
      g.sound("shoot");
    }
  },

  draw(s, d, g) {
    d.clear("cream");
    d.rect(10, 100, 340, 520, "cream", { round: 24, line: true });
    d.rect(STEG.x, STEG.y, STEG.w, STEG.h, "yellow", { round: 4, line: true });
    d.emoji("⛵", 180, 120, 40);
    d.emoji("🚤", 180, 520, 40);
    if (!s.flug) {
      const ziel = s.spieler === 1 ? 500 : 140;
      d.circle(s.zz, ziel, 7, "ink", { line: true });
    }
    if (s.flug) d.emoji("🎈", s.flug.x, s.flug.y, 26);
    if (s.spritz) d.emoji("💦", 180, s.spritz.y, 40);
    d.text(s.flug ? "Wurf läuft ..." : "Spieler " + s.spieler + " dran", 180, 84, { size: 20, align: "center" });
    d.text("Treffer: " + s.treffer[0] + " : " + s.treffer[1], 180, 610, { size: 18, align: "center" });
    d.text("Zug: " + s.zuege + " / 30", 180, 632, { size: 16, align: "center" });
  }
};

function endeZug(s, g, treffer) {
  const sp = s.flug.sp;
  s.flug = null;
  s.zuege += 1;
  if (treffer) {
    s.treffer[sp - 1] += 1;
    g.addScore(1);
    g.sound("hit");
    s.spritz = { y: sp === 1 ? 520 : 120, t: 40 };
    if (s.treffer[sp - 1] >= 5) { g.win(); return; }
  }
  s.spieler = 3 - sp;
  if (s.zuege >= 30) g.gameOver();
}
