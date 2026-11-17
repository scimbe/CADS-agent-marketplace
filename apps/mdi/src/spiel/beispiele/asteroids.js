// Referenzspiel 5 (nur Spiel-API): Ein Blasenschiff treibt durchs All und zerplatzt Felsbrocken mit Seifenblasen.
// Links/rechts drehen, hoch = Schub, Feuer = Blase. Raender fuehren auf die andere Seite.
export default {
  title: "Blasen-Asteroiden",
  controls: ["left", "right", "up", "fire"],
  lives: 3,

  init(g) {
    return { ship: { x: g.W / 2, y: 360, r: 12, a: -90, vx: 0, vy: 0 }, bubbles: [], rocks: field(g, 1), cool: 0, safe: 90 };
  },

  update(s, input, g) {
    const sh = s.ship;
    if (input.left) sh.a -= 5;
    if (input.right) sh.a += 5;
    if (input.up) { sh.vx += g.cos(sh.a) * 0.15; sh.vy += g.sin(sh.a) * 0.15; }
    sh.vx *= 0.99; sh.vy *= 0.99;
    sh.x = wrap(sh.x + sh.vx, g.W); sh.y = wrapY(sh.y + sh.vy, g);
    if (s.cool > 0) s.cool -= 1;
    if (s.safe > 0) s.safe -= 1;
    if ((input.firePressed || input.fire) && s.cool === 0) {
      s.bubbles.push({ x: sh.x + g.cos(sh.a) * 14, y: sh.y + g.sin(sh.a) * 14, r: 5, vx: g.cos(sh.a) * 6 + sh.vx, vy: g.sin(sh.a) * 6 + sh.vy, life: 50 });
      s.cool = 10;
      g.sound("shoot");
    }
    for (const b of s.bubbles) { b.x = wrap(b.x + b.vx, g.W); b.y = wrapY(b.y + b.vy, g); b.life -= 1; }
    for (const r of s.rocks) { r.x = wrap(r.x + r.vx, g.W); r.y = wrapY(r.y + r.vy, g); }

    const born = [];
    for (const b of s.bubbles) {
      const r = s.rocks.find((x) => !x.gone && g.hit(b, x));
      if (!r) continue;
      r.gone = true; b.life = 0;
      g.addScore(r.r > 20 ? 5 : r.r > 12 ? 10 : 20);
      g.sound("pop");
      if (r.r > 12) for (const dir of [-1, 1]) born.push({ x: r.x, y: r.y, r: r.r * 0.6, vx: r.vy * dir * 1.3, vy: -r.vx * dir * 1.3, gone: false });
    }
    s.bubbles = s.bubbles.filter((b) => b.life > 0);
    s.rocks = s.rocks.filter((r) => !r.gone).concat(born);

    if (s.safe === 0 && s.rocks.some((r) => g.hit(r, sh))) {
      g.sound("hurt"); g.loseLife();
      sh.x = g.W / 2; sh.y = 360; sh.vx = 0; sh.vy = 0; s.safe = 90;
    }
    if (s.rocks.length === 0) { g.nextLevel(); g.sound("level"); s.rocks = field(g, g.level); s.safe = 60; }
  },

  draw(s, d, g) {
    d.clear("ink");
    for (const r of s.rocks) d.emoji("🪨", r.x, r.y, r.r * 2);
    for (const b of s.bubbles) d.circle(b.x, b.y, b.r, "cream", { line: true });
    const sh = s.ship;
    if (s.safe === 0 || (g.frame >> 2) % 2 === 0) {
      d.circle(sh.x, sh.y, sh.r, "yellow", { line: true });
      d.line(sh.x, sh.y, sh.x + g.cos(sh.a) * 20, sh.y + g.sin(sh.a) * 20, "red", 5);
    }
  }
};

function wrap(v, max) { return v < 0 ? v + max : v >= max ? v - max : v; }
function wrapY(v, g) { const h = g.H - g.TOP; return v < g.TOP ? v + h : v >= g.H ? v - h : v; }
function field(g, level) {
  const out = [];
  for (let i = 0; i < 2 + level; i++) {
    // vom Rand ungefaehr auf die Mitte zu, damit Nichtstun nicht sicher ist
    const x = g.randInt(0, 1) === 0 ? 20 : g.W - 20, y = g.randInt(g.TOP + 20, g.H - 20), sp = 0.8 + g.random() * 0.8;
    const dx = g.W / 2 - x, dy = 360 - y, len = g.dist({ x, y }, { x: g.W / 2, y: 360 });
    out.push({ x, y, r: 28, vx: dx / len * sp + (g.random() - 0.5) * 0.4, vy: dy / len * sp + (g.random() - 0.5) * 0.4, gone: false });
  }
  return out;
}
