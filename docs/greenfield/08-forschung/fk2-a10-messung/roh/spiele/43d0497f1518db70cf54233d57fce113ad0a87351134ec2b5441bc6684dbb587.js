// Mau Mau gegen den Computer (Runden-Kartenspiel, nur Spiel-API, keine Importe).
const FARBEN = ["🍎", "🍋", "🍀", "🌟"];
const ZIEL = 100, ZUEGE_MAX = 60, ZEIT_MAX = 2400, PAUSE = 120, WARTE = 40;

export default {
  title: "Mau Mau gegen den Computer",
  controls: ["left", "right", "up", "down", "fire"],
  lives: 1,

  init(g) {
    const s = { runde: 0, pts: 0, zuege: 0, msg: "", sieger: "", rest: 0, halten: 0, rich: 0, zog: false };
    deal(s, g);
    return s;
  },

  update(s, input, g) {
    // Zeit- und Zuglimit gelten immer, auch ohne Eingabe (Spielende ist sicher erreichbar)
    if (g.frame >= ZEIT_MAX || s.zuege >= ZUEGE_MAX) { g.gameOver(); return; }
    if (s.phase === "ende") {
      if (s.rest > 0) s.rest -= 1;
      else if (input.firePressed) deal(s, g);
      return;
    }
    if (s.phase === "comp") { computerZug(s, g); return; }
    spielerZug(s, input, g);
  },

  draw(s, d, g) {
    d.clear("cream");
    d.text("Du: " + s.pts + " Punkte", 12, 62, { size: 18, color: "ink" });
    d.text("Runde " + s.runde + " · Züge " + s.zuege + "/" + ZUEGE_MAX, 348, 62, { size: 13, color: "ink", align: "right" });
    d.text("Computer: " + s.comp.length + " Karten", 12, 84, { size: 14, color: "ink" });
    const nc = s.comp.length, spc = Math.min(48, Math.floor(330 / Math.max(1, nc)));
    for (let i = 0; i < nc; i++) d.rect(12 + i * spc, 96, 40, 56, "red", { round: 6, line: true });

    d.rect(90, 200, 70, 80, "red", { round: 8, line: true });
    d.text("Stapel " + s.stack.length, 125, 290, { size: 12, color: "ink", align: "center" });
    const top = s.disc[s.disc.length - 1];
    d.rect(200, 200, 70, 80, "cream", { round: 8, line: true });
    d.text(String(top.w), 214, 216, { size: 18, color: "ink" });
    d.emoji(FARBEN[top.f], 235, 250, 34);
    d.text("Ablage", 235, 290, { size: 12, color: "ink", align: "center" });

    d.text(s.msg, 180, 320, { size: 14, color: "ink", align: "center" });
    if (s.phase === "ende") {
      d.text(s.sieger === "du" ? "Du gewinnst die Runde!" : "Computer gewinnt die Runde.", 180, 360, { size: 20, color: "red", align: "center" });
      d.text("Punkte: " + s.pts, 180, 392, { size: 18, color: "ink", align: "center" });
      if (s.rest === 0) d.text("Feuer: nächste Runde", 180, 420, { size: 14, color: "ink", align: "center" });
    }

    d.text("Deine Karten", 12, 444, { size: 14, color: "ink" });
    const n = s.hand.length, sp = Math.min(56, Math.floor(340 / Math.max(1, n)));
    for (let i = 0; i < n; i++) {
      const c = s.hand[i], x = 12 + i * sp, y = 470;
      d.rect(x, y, 50, 96, "cream", { round: 8, line: true });
      d.text(String(c.w), x + 8, y + 20, { size: 18, color: "ink" });
      d.emoji(FARBEN[c.f], x + 25, y + 60, 28);
    }
    if (n > 0) {
      const x = 12 + s.cur * sp, y = 470;
      d.rect(x - 3, y - 3, 56, 3, "red"); d.rect(x - 3, y + 96, 56, 3, "red");
      d.rect(x - 3, y - 3, 3, 102, "red"); d.rect(x + 50, y - 3, 3, 102, "red");
    }
    d.text("Links/Rechts wählen · Feuer legt ab · Hoch/Runter zieht", 180, 600, { size: 11, color: "ink", align: "center" });
  }
};

function passt(a, b) {
  return a.f === b.f || a.w === b.w;
}

function shuffle(list, g) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = g.randInt(0, i);
    const t = list[i]; list[i] = list[j]; list[j] = t;
  }
}

function deal(s, g) {
  const deck = [];
  for (let f = 0; f < 4; f++) for (let w = 1; w <= 7; w++) deck.push({ f, w });
  shuffle(deck, g);
  s.hand = deck.splice(0, 5);
  s.comp = deck.splice(0, 5);
  s.disc = [deck.pop()];
  s.stack = deck;
  s.runde += 1;
  s.cur = 0; s.halten = 0; s.rich = 0; s.zog = false; s.wait = 0;
  s.phase = "du";
  s.rest = 0; s.sieger = "";
  s.msg = "Lege eine passende Karte ab oder zieh.";
}

function ziehen(s, g, wer) {
  if (s.stack.length === 0 && s.disc.length > 1) {
    const alt = s.disc;
    const top = alt.pop();
    s.stack = alt;
    s.disc = [top];
    shuffle(s.stack, g);
  }
  if (s.stack.length === 0) return;
  const c = s.stack.pop();
  if (wer === "du") s.hand.push(c); else s.comp.push(c);
}

function pruefe(s, g) {
  if (s.pts >= ZIEL) g.win();
  else if (s.zuege >= ZUEGE_MAX) g.gameOver();
}

function ende(s, g, wer) {
  s.phase = "ende";
  s.sieger = wer;
  s.rest = PAUSE;
  if (wer === "du") { s.pts += 20; g.addScore(20); g.sound("win"); }
  else g.sound("lose");
  pruefe(s, g);
}

function spielerZug(s, input, g) {
  const n = s.hand.length;
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir !== 0) {
    if (dir !== s.rich || s.halten >= 12) { s.cur = g.clamp(s.cur + dir, 0, Math.max(0, n - 1)); s.halten = 0; }
    s.halten += 1;
  } else s.halten = 0;
  s.rich = dir;

  const top = s.disc[s.disc.length - 1];
  if (input.firePressed) {
    const c = s.hand[s.cur];
    if (c && passt(c, top)) {
      s.hand.splice(s.cur, 1);
      s.disc.push(c);
      s.pts += 5; g.addScore(5); g.sound("pop");
      s.msg = "Gut gelegt! Computer ist am Zug.";
      s.cur = g.clamp(s.cur, 0, Math.max(0, s.hand.length - 1));
      s.zuege += 1;
      if (s.hand.length === 0) ende(s, g, "du");
      else { s.phase = "comp"; s.wait = 0; pruefe(s, g); }
      return;
    }
    s.msg = "Passt nicht: gleiche Farbe oder Wert nötig.";
  }

  if ((input.up || input.down) && !s.zog) {
    if (s.hand.some((c) => passt(c, top))) {
      s.msg = "Du hast eine passende Karte, also nicht ziehen.";
    } else {
      ziehen(s, g, "du");
      s.msg = "Du ziehst eine Karte. Computer ist am Zug.";
      s.zuege += 1;
      s.phase = "comp"; s.wait = 0;
      pruefe(s, g);
    }
  }
  s.zog = !!(input.up || input.down);
}

function computerZug(s, g) {
  s.wait += 1;
  if (s.wait < WARTE) return;
  const top = s.disc[s.disc.length - 1];
  const idx = [];
  for (let i = 0; i < s.comp.length; i++) if (passt(s.comp[i], top)) idx.push(i);
  if (idx.length > 0) {
    const i = g.random() < 0.7 ? idx[0] : idx[g.randInt(0, idx.length - 1)];
    s.disc.push(s.comp.splice(i, 1)[0]);
    g.addScore(1); g.sound("pop");
    s.msg = "Computer legt eine Karte ab.";
    s.zuege += 1;
    if (s.comp.length === 0) { ende(s, g, "comp"); return; }
  } else {
    ziehen(s, g, "comp");
    g.addScore(1);
    s.msg = "Computer zieht eine Karte.";
    s.zuege += 1;
  }
  s.phase = "du"; s.wait = 0;
  pruefe(s, g);
}
