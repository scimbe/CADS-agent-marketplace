// Ueberhol-Rennen: Spielauto wechselt zwischen zwei Spuren, andere Autos kommen von vorne.
// Start auf der rechten Spur, damit Links-Wechsel von Anfang an moeglich ist.
const LANES = [110, 250];
const PY = 520;

export default {
  title: "Überhol-Rennen auf der Autobahn",
  controls: ["left", "right", "up", "down"],
  lives: 5,

  init(g) {
    return { lane: 1, v: 4, sw: 12, cars: [], tick: 0, next: 90, safe: 0, off: 0 };
  },

  update(s, input, g) {
    s.sw += 1;
    if ((input.left || input.right) && s.sw >= 12) {
      const want = input.left ? 0 : 1;
      if (want !== s.lane) { s.lane = want; s.sw = 0; }
    }
    if (input.up) s.v = Math.min(8, s.v + 0.1);
    if (input.down) s.v = Math.max(2, s.v - 0.1);
    s.off += s.v;

    s.tick += 1;
    if (s.tick >= s.next) {
      s.tick = 0;
      s.next = 90 + g.randInt(0, 30);
      // Zufaellige Spur; meist die Spur neben dem Spielauto, damit Ueberholen moeglich ist
      let li = g.randInt(0, 1);
      if (li === s.lane && g.random() < 0.7) li = 1 - li;
      s.cars.push({ li, x: LANES[li], y: g.TOP - 40, passed: false, gone: false });
    }

    if (s.safe > 0) s.safe -= 1;
    const pl = { x: LANES[s.lane] - 20, y: PY - 30, w: 40, h: 60 };
    for (const c of s.cars) {
      if (c.gone) continue;
      c.y += 0.5 * s.v + 0.1 * g.level;
      if (!c.passed && c.y > PY + 60) {
        c.passed = true;
        if (c.li !== s.lane) { g.addScore(1); g.sound("pop"); }
        continue;
      }
      if (!c.passed && s.safe === 0 && g.hit(pl, { x: c.x - 18, y: c.y - 28, w: 36, h: 56 })) {
        c.gone = true;
        s.v = 2;
        s.safe = 60;
        g.sound("hurt");
        g.loseLife();
      }
    }
    s.cars = s.cars.filter((c) => !c.gone && c.y < g.H + 40);

    if (g.frame > 0 && g.frame % 600 === 0) { g.nextLevel(); g.sound("level"); }
  },

  draw(s, d, g) {
    d.clear("cream");
    d.rect(40, g.TOP, 280, g.H - g.TOP, "ink");
    d.rect(40, g.TOP, 4, g.H - g.TOP, "yellow");
    d.rect(316, g.TOP, 4, g.H - g.TOP, "yellow");
    for (let y = g.TOP - 60 + (s.off % 60); y < g.H; y += 60) d.rect(178, y, 4, 36, "yellow");
    for (const c of s.cars) d.emoji("🚙", c.x, c.y, 36);
    const px = LANES[s.lane];
    if (s.safe > 0) {
      const col = (s.safe >> 2) % 2 === 0 ? "red" : "cream";
      d.rect(px - 24, PY - 34, 48, 68, col, { round: 12 });
    }
    d.emoji("🏎️", px, PY, 40);
  }
};
