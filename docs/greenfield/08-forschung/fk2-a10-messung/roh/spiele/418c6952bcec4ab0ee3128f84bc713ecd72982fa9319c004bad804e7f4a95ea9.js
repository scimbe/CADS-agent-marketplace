// Mau Mau gegen den Computer (nur Spiel-API, keine Importe). Runde: 5 Karten je Seite, passende Karte nach Farbe oder Rang.
// Jede Steuerung und jeder Tipp zeigt sofort eine Rueckmeldung (s.msg), damit nichts wirkungslos bleibt.
const RANKS = ["7", "8", "9", "10", "U", "O", "K", "A"];
const SUITS = ["♥", "♦", "♣", "♠"];
const ZUGLIMIT = 30, WARTE = 40, HALTEN = 12;

export default {
  title: "Mau Mau gegen den Computer",
  controls: ["left", "right", "up", "down", "fire"],
  lives: 1,

  init(g) {
    const deck = [];
    for (let f = 0; f < 4; f++) for (let r = 0; r < 8; r++) deck.push({ r, f });
    shuffle(deck, g);
    const hand = [], comp = [];
    for (let i = 0; i < 5; i++) { hand.push(deck.pop()); comp.push(deck.pop()); }
    const ablage = deck.pop();
    return { hand, comp, stapel: deck, ablage, cx: 0, zone: 0, halten: 0, phase: "du", warte: 0, zuegeS: 0, zuegeC: 0, ende: "", msg: "", msgT: 0, tasten: 0 };
  },

  update(s, input, g) {
    if (s.msgT > 0) { s.msgT -= 1; if (s.msgT === 0) s.msg = ""; }
    if (s.phase === "comp") {
      s.warte -= 1;
      if (s.warte <= 0) computerZug(s, g);
      return;
    }
    if (input.left || input.right || input.up || input.down) s.tasten += 1;
    if (input.up) s.zone = 1;
    else if (input.down) s.zone = 0;
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dx !== 0 && s.zone === 0) {
      if (s.halten % HALTEN === 0) s.cx = g.clamp(s.cx + dx, 0, s.hand.length - 1);
      s.halten += 1;
    } else s.halten = 0;
    if (!input.firePressed || s.ende) return;
    if (s.zone === 0) spielerKarte(s, g);
    else spielerStapel(s, g);
  },

  draw(s, d, g) {
    d.clear("cream");
    const n = s.comp.length;
    const sp = Math.min(50, 300 / Math.max(1, n));
    for (let i = 0; i < n; i++) d.rect(20 + i * sp, 90, 46, 64, "ink", { round: 6 });
    d.text("Computer: " + n + " Karten", 20, 70, { size: 16 });

    if (s.zone === 1) d.rect(114, 294, 58, 76, "red", { round: 8 });
    d.rect(120, 300, 46, 64, "yellow", { round: 6, line: true });
    d.text(String(s.stapel.length), 143, 322, { size: 16, align: "center" });
    cardDraw(d, s.ablage, 180, 300);
    d.text(s.phase === "du" ? "Du am Zug" : "Computer am Zug", 180, 250, { size: 18, align: "center" });
    d.text("Züge: du " + s.zuegeS + " / " + ZUGLIMIT + ", Computer " + s.zuegeC, 180, 390, { size: 14, align: "center" });
    if (s.msg) d.text(s.msg, 180, 420, { size: 14, align: "center" });

    const hn = s.hand.length;
    const hsp = Math.min(50, 300 / Math.max(1, hn));
    for (let i = 0; i < hn; i++) {
      const x = 20 + i * hsp;
      if (s.zone === 0 && i === s.cx) d.rect(x - 3, 497, 52, 70, "red", { round: 8 });
      cardDraw(d, s.hand[i], x, 500);
    }
    d.text("Deine Karten", 20, 476, { size: 18 });

    if (s.ende) {
      d.rect(50, 230, 260, 70, "yellow", { round: 10, line: true });
      d.text(s.ende, 180, 262, { size: 20, align: "center" });
    }
  }
};

function shuffle(deck, g) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = g.randInt(0, i);
    const t = deck[i];
    deck[i] = deck[j];
    deck[j] = t;
  }
}

function passt(c, a) {
  return c.r === a.r || c.f === a.f;
}

function sag(s, text) {
  s.msg = text;
  s.msgT = 60;
}

function cardDraw(d, c, x, y) {
  const farbe = c.f === 0 || c.f === 1 ? "red" : "ink";
  d.rect(x, y, 46, 64, "cream", { round: 6, line: true });
  d.text(RANKS[c.r], x + 6, y + 8, { size: 14, color: "ink" });
  d.text(SUITS[c.f], x + 23, y + 30, { size: 22, color: farbe, align: "center" });
}

function spielerKarte(s, g) {
  const c = s.hand[s.cx];
  if (!c) return;
  if (!passt(c, s.ablage)) { sag(s, "Passt nicht zur Ablage"); return; }
  s.hand.splice(s.cx, 1);
  s.ablage = c;
  s.zuegeS += 1;
  s.msg = "";
  s.msgT = 0;
  g.addScore(5);
  g.sound("pop");
  if (s.hand.length === 0) {
    s.ende = "Du hast gewonnen";
    g.addScore(20);
    g.sound("win");
    g.win();
    return;
  }
  s.cx = g.clamp(s.cx, 0, s.hand.length - 1);
  if (s.zuegeS >= ZUGLIMIT) { s.ende = "Zuglimit erreicht"; g.gameOver(); return; }
  s.phase = "comp";
  s.warte = WARTE;
}

function spielerStapel(s, g) {
  if (s.hand.some((c) => passt(c, s.ablage))) { sag(s, "Du hast eine passende Karte"); return; }
  if (s.stapel.length === 0) { sag(s, "Stapel ist leer"); return; }
  s.zuegeS += 1;
  s.hand.push(s.stapel.pop());
  s.msg = "";
  s.msgT = 0;
  g.sound("pop");
  if (s.zuegeS >= ZUGLIMIT) { s.ende = "Zuglimit erreicht"; g.gameOver(); return; }
  s.phase = "comp";
  s.warte = WARTE;
}

function computerZug(s, g) {
  const idx = [];
  for (let i = 0; i < s.comp.length; i++) if (passt(s.comp[i], s.ablage)) idx.push(i);
  if (idx.length > 0) {
    const i = g.random() < 0.7 ? idx[0] : idx[g.randInt(0, idx.length - 1)];
    s.ablage = s.comp.splice(i, 1)[0];
    s.zuegeC += 1;
    g.sound("pop");
    if (s.comp.length === 0) { s.ende = "Computer hat gewonnen"; g.gameOver(); return; }
  } else {
    if (s.stapel.length > 0) s.comp.push(s.stapel.pop());
    s.zuegeC += 1;
  }
  if (s.zuegeC >= ZUGLIMIT) { s.ende = "Zuglimit erreicht"; g.gameOver(); return; }
  s.phase = "du";
}
