// Kartenspiel gegen den Computer (Runden-Vorlage). Ablegen und Ziehen laufen ueber Cursor und Feuer, nicht ueber Tippen auf Karten.
const STUFEN = ["leicht", "mittel", "schwer"];
const MUSTER = ["Stern", "Herz", "Kreis", "Apfel"];
const EMO = ["⭐", "💗", null, "🍎"];
const MAX_ZUEGE = 30, WIEDERHOLEN = 12;

export default {
  title: "Kartenspiel gegen den Computer",
  controls: ["left", "right", "up", "down", "fire"],
  lives: 1,

  init() {
    return { phase: "menue", schwierigkeit: "mittel", hand: [], comp: [], stapel: [], ablage: null, turn: "spieler", cur: 0, halten: 0, wait: 0, hinweis: "", hinweisT: 0, zuege: 0, ergebnis: "" };
  },

  update(s, input, g) {
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    let step = false;
    if (dx === 0 && dy === 0) s.halten = 0;
    else if (s.halten <= 0) { step = true; s.halten = WIEDERHOLEN - 1; }
    else s.halten -= 1;
    if (s.hinweisT > 0) { s.hinweisT -= 1; if (s.hinweisT === 0) s.hinweis = ""; }

    if (s.phase === "menue") {
      if (step) { const i = STUFEN.indexOf(s.schwierigkeit); s.schwierigkeit = STUFEN[g.clamp(i + dx + dy, 0, 2)]; }
      if (input.firePressed) start(s, g);
      return;
    }
    if (s.phase !== "spiel") return;

    const n = s.hand.length;
    s.cur = Math.min(s.cur, n);
    if (s.turn === "computer") {
      s.wait -= 1;
      if (s.wait <= 0) computerZug(s, g);
      return;
    }
    if (step) {
      if (dx !== 0) s.cur = g.clamp(s.cur + dx, 0, n);
      if (dy > 0) s.cur = n;
      else if (dy < 0 && s.cur === n) s.cur = Math.max(0, n - 1);
    }
    if (!input.firePressed) return;
    if (s.cur < n) spielKarte(s, g, s.cur);
    else stapelZug(s, g);
  },

  draw(s, d, g) {
    d.clear("cream");
    if (s.phase === "menue") {
      d.text("Kartenspiel", 180, 150, { size: 32, align: "center" });
      d.text("gegen den Computer", 180, 190, { size: 20, align: "center" });
      d.text("Schwierigkeit", 180, 260, { size: 20, align: "center" });
      STUFEN.forEach((st, i) => d.text(st === s.schwierigkeit ? "> " + st + " <" : st, 180, 300 + i * 40, { size: 24, align: "center" }));
      d.text("Auf/Ab wählt, Feuer startet", 180, 470, { size: 16, align: "center" });
      return;
    }
    if (s.phase === "ende") {
      d.text(s.ergebnis, 180, 300, { size: 44, align: "center" });
      d.text("Züge: " + s.zuege, 180, 360, { size: 20, align: "center" });
      return;
    }
    d.text(s.turn === "spieler" ? "Du bist dran" : "Computer ist dran", 180, 70, { size: 20, align: "center" });
    const cn = s.comp.length;
    for (let i = 0; i < cn; i++) d.rect(rowX(g, cn, 44, 6, i), 100, 44, 60, "yellow", { round: 8, line: true });
    d.rect(70, 236, 64, 92, s.stapel.length > 0 ? "yellow" : "cream", { round: 8, shadow: s.stapel.length > 0, line: true });
    d.text("Stapel: " + s.stapel.length, 102, 345, { size: 16, align: "center" });
    if (s.ablage) drawCard(d, s.ablage, 226, 236, 64, 92);
    if (s.hinweisT > 0) d.text(s.hinweis, 180, 380, { size: 18, align: "center" });
    const hn = s.hand.length;
    for (let i = 0; i < hn; i++) drawCard(d, s.hand[i], rowX(g, hn, 60, 6, i), 440, 60, 88);
    if (s.turn === "spieler") {
      if (s.cur < hn) frame(d, rowX(g, hn, 60, 6, s.cur) - 4, 436, 68, 96);
      else frame(d, 66, 232, 72, 100);
    }
    d.text("Züge: " + s.zuege + " / " + MAX_ZUEGE, 180, 600, { size: 16, align: "center" });
  }
};

function start(s, g) {
  const deck = [];
  for (let m = 0; m < 4; m++) for (let w = 1; w <= 4; w++) deck.push({ m, w });
  for (let i = deck.length - 1; i > 0; i--) { const j = g.randInt(0, i); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
  const nimm = (m) => deck.splice(deck.findIndex((c) => c.m === m), 1)[0];
  const rest = () => deck.splice(g.randInt(0, deck.length - 1), 1)[0];
  s.hand = []; s.comp = [];
  for (let m = 0; m < 4; m++) s.hand.push(nimm(m));
  for (let m = 0; m < 4; m++) s.comp.push(nimm(m));
  s.hand.push(rest());
  s.comp.push(rest());
  s.ablage = rest();
  s.stapel = deck;
  s.phase = "spiel"; s.turn = "spieler"; s.cur = 0; s.halten = 0; s.wait = 0;
  s.hinweis = ""; s.hinweisT = 0; s.zuege = 0; s.ergebnis = "";
}

function passt(a, b) { return a.m === b.m || a.w === b.w; }

function spielKarte(s, g, i) {
  const c = s.hand[i];
  if (!passt(c, s.ablage)) { s.hinweis = "Passt nicht"; s.hinweisT = 60; g.sound("hurt"); return; }
  s.hand.splice(i, 1);
  s.ablage = c;
  g.addScore(10);
  g.sound("pop");
  if (s.hand.length === 0) return ende(s, g, true);
  endZug(s, g, "computer");
}

function stapelZug(s, g) {
  if (s.stapel.length === 0) {
    if (s.hand.some((c) => passt(c, s.ablage))) { s.hinweis = "Stapel ist leer"; s.hinweisT = 60; return; }
    s.hinweis = "Keine Karte passt, Zug aussetzen"; s.hinweisT = 60;
    endZug(s, g, "computer");
    return;
  }
  s.hand.push(s.stapel.pop());
  g.addScore(2);
  g.sound("coin");
  s.hinweis = "Du ziehst eine Karte"; s.hinweisT = 60;
  endZug(s, g, "computer");
}

function computerZug(s, g) {
  const idx = [];
  s.comp.forEach((c, i) => { if (passt(c, s.ablage)) idx.push(i); });
  if (idx.length > 0) {
    let pick = idx[0];
    if (s.schwierigkeit === "leicht") pick = idx[g.randInt(0, idx.length - 1)];
    else if (s.schwierigkeit === "schwer") {
      let best = -1;
      for (const i of idx) {
        const k = s.comp.filter((c) => c.m === s.comp[i].m).length;
        if (k > best) { best = k; pick = i; }
      }
    }
    const c = s.comp.splice(pick, 1)[0];
    s.ablage = c;
    s.hinweis = "Computer legt " + MUSTER[c.m] + " " + c.w; s.hinweisT = 60;
    g.sound("pop");
    if (s.comp.length === 0) return ende(s, g, false);
    endZug(s, g, "spieler");
  } else {
    if (s.stapel.length > 0) { s.comp.push(s.stapel.pop()); s.hinweis = "Computer zieht eine Karte"; }
    else s.hinweis = "Computer passt";
    s.hinweisT = 60;
    endZug(s, g, "spieler");
  }
}

function endZug(s, g, next) {
  s.zuege += 1;
  if (s.zuege >= MAX_ZUEGE) return ende(s, g, s.hand.length < s.comp.length);
  s.turn = next;
  s.cur = Math.min(s.cur, s.hand.length);
  if (next === "computer") s.wait = 40;
}

function ende(s, g, sieg) {
  s.phase = "ende";
  s.ergebnis = sieg ? "Sieg!" : "Niederlage";
  if (sieg) g.win(); else g.gameOver();
}

function rowX(g, n, w, gap, i) {
  return (g.W - (n * (w + gap) - gap)) / 2 + i * (w + gap);
}

function frame(d, x, y, w, h) {
  d.rect(x, y, w, 4, "red"); d.rect(x, y + h - 4, w, 4, "red");
  d.rect(x, y, 4, h, "red"); d.rect(x + w - 4, y, 4, h, "red");
}

function drawCard(d, c, x, y, w, h) {
  d.rect(x, y, w, h, "cream", { round: 8, line: true });
  if (c.m === 2) d.circle(x + w / 2, y + h / 2 - 10, 14, "yellow", { line: true });
  else d.emoji(EMO[c.m], x + w / 2, y + h / 2 - 10, 30);
  d.text(String(c.w), x + w / 2, y + h - 18, { size: 18, align: "center", color: "ink" });
}
