// Langsam, aber legitim: jeder Schritt rechnet deterministisch etwa 2 ms (unter dem Budget p95 4 ms). Sonst ein gueltiges
// Fangspiel. Die Phasen Eingaben/Determinismus/Neustart brauchen damit mehrere Sekunden ohne Bot-Frame.
// Erwartung: kein Watchdog; die Abnahme scheitert hoechstens an checks.performance (bei ueberlasteter Maschine).
const WORK = 450000;
function work(seed) { let x = seed; for (let i = 0; i < WORK; i++) x = (x * 31 + i) % 1000003; return x; }
export default {
  title: "Schnecke",
  controls: ["left", "right", "fire"],
  lives: 1,
  init(g) { return { x: 160, coin: { x: 100, y: g.TOP, r: 10 }, chk: 0 }; },
  update(s, input, g) {
    s.chk = work(s.chk + g.frame);
    if (input.left) s.x -= 6;
    if (input.right) s.x += 6;
    if (input.firePressed) s.x = g.W / 2;
    s.x = g.clamp(s.x, 0, g.W - 60);
    s.coin.y += 6;
    if (g.hit(s.coin, { x: s.x, y: 580, w: 60, h: 16 })) { g.addScore(1); s.coin = { x: g.randInt(20, 340), y: g.TOP, r: 10 }; }
    else if (s.coin.y > g.H) { g.loseLife(); s.coin = { x: g.randInt(20, 340), y: g.TOP, r: 10 }; }
  },
  draw(s, d) { d.clear("cream"); d.circle(s.coin.x, s.coin.y, 10, "yellow", { line: true }); d.rect(s.x, 580, 60, 16, "red"); }
};
