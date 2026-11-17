// Referenzspiel 6 (nur Spiel-API): Huepfen von Plattform zu Plattform bis zur Fahne, Muenzen sammeln, Krabben meiden.
const GRAV = 0.5, JUMP = -10.5, FLOOR = 610;

export default {
  title: "Fahnen-Huepfer",
  controls: ["left", "right", "up"],
  lives: 3,

  init(g) {
    const s = { me: { x: 30, y: FLOOR - 30, w: 22, h: 30, vx: 0, vy: 0, ground: true }, plats: [], coins: [], crabs: [], flag: { x: 0, y: 0, w: 24, h: 30 }, safe: 0 };
    build(s, g);
    return s;
  },

  update(s, input, g) {
    const me = s.me;
    me.vx = input.left ? -3 : input.right ? 3 : 0;
    if (input.up && me.ground) { me.vy = JUMP; me.ground = false; g.sound("jump"); }
    me.vy = Math.min(me.vy + GRAV, 12);
    const oldBottom = me.y + me.h;
    me.x = g.clamp(me.x + me.vx, 0, g.W - me.w);
    me.y += me.vy;
    me.ground = false;
    if (me.vy >= 0) {
      for (const p of s.plats) {
        const over = me.x + me.w > p.x && me.x < p.x + p.w;
        if (over && oldBottom <= p.y && me.y + me.h >= p.y) { me.y = p.y - me.h; me.vy = 0; me.ground = true; }
      }
    }
    if (s.safe > 0) s.safe -= 1;

    for (const c of s.crabs) {
      c.x += c.vx;
      if (c.x < c.min || c.x + c.w > c.max) c.vx = -c.vx;
      if (s.safe === 0 && g.hit(me, c)) { g.sound("hurt"); g.loseLife(); respawn(s); return; }
    }
    for (const c of s.coins) if (!c.got && g.hit(me, c)) { c.got = true; g.addScore(10); g.sound("coin"); }
    s.coins = s.coins.filter((c) => !c.got);
    if (g.hit(me, s.flag)) { g.addScore(50); g.nextLevel(); g.sound("level"); build(s, g); return; }
    if (me.y > g.H) { g.sound("hurt"); g.loseLife(); respawn(s); }
  },

  draw(s, d) {
    d.clear("cream");
    for (const p of s.plats) d.rect(p.x, p.y, p.w, p.h, "yellow", { round: 8, shadow: true, line: true });
    for (const c of s.coins) d.circle(c.x + c.w / 2, c.y + c.h / 2, c.w / 2, "yellow", { line: true });
    for (const c of s.crabs) d.emoji("🦀", c.x + c.w / 2, c.y + c.h / 2, 26);
    d.emoji("🚩", s.flag.x + 12, s.flag.y + 15, 30);
    if (s.safe === 0 || (s.safe >> 2) % 2 === 0) d.rect(s.me.x, s.me.y, s.me.w, s.me.h, "red", { round: 8, line: true });
  }
};

function build(s, g) {
  s.plats = [{ x: 0, y: FLOOR, w: g.W, h: 30 }];
  s.coins = []; s.crabs = [];
  let cx = 60;
  for (let row = 1; row <= 5; row++) {
    const w = g.randInt(90, 140), y = FLOOR - row * 92;
    cx = g.clamp(cx + g.randInt(-110, 110), w / 2 + 4, g.W - w / 2 - 4);
    const p = { x: cx - w / 2, y, w, h: 16 };
    s.plats.push(p);
    s.coins.push({ x: p.x + w / 2 - 8, y: y - 30, w: 16, h: 16, got: false });
    if (row >= 2 && row <= 1 + g.level) s.crabs.push({ x: p.x + 4, y: y - 22, w: 26, h: 22, vx: 0.8 + 0.2 * g.level, min: p.x, max: p.x + p.w });
  }
  s.crabs.push({ x: g.W - 60, y: FLOOR - 22, w: 26, h: 22, vx: -(1 + 0.2 * g.level), min: 0, max: g.W });
  const top = s.plats[s.plats.length - 1];
  s.flag = { x: top.x + top.w / 2 - 12, y: top.y - 30, w: 24, h: 30 };
  respawn(s);
}
function respawn(s) {
  s.me.x = 30; s.me.y = FLOOR - 30; s.me.vx = 0; s.me.vy = 0; s.me.ground = true; s.safe = 60;
}
