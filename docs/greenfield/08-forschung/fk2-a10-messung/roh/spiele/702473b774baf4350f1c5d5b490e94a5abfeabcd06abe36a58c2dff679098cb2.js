// Rennspiel aus der Vogelperspektive: zwei Spuren, Autos kommen entgegen, Ueberholen zaehlt Punkte.
const TOP_Y = 520;

export default {
  title: "Überholen auf der Autobahn",
  controls: ["left", "right"],
  lives: 1,

  init(g) {
    return { lane: 1, x: 260, cars: [], dichte: 0.035, ueberholt: 0 };
  },

  update(s, input, g) {
    if (input.left) s.lane = 0;
    if (input.right) s.lane = 1;
    const tx = s.lane === 0 ? 100 : 260;
    const dx = tx - s.x;
    s.x += Math.sign(dx) * Math.min(6, Math.abs(dx));

    if (g.frame > 0 && g.frame % 300 === 0) s.dichte = g.random() < 0.5 ? 0.008 : 0.035;
    if (g.frame % 30 === 0) g.addScore(1);

    for (const c of s.cars) c.y += 3;

    for (const c of s.cars) {
      if (!c.gez && c.lane !== s.lane && c.y > TOP_Y + 35) {
        c.gez = true;
        s.ueberholt += 1;
        g.addScore(1);
        g.sound("pop");
      }
    }

    for (const c of s.cars) {
      if (c.lane === s.lane && Math.abs(c.y - TOP_Y) < 70) {
        s.cars = [];
        g.sound("hurt");
        g.loseLife();
        return;
      }
    }

    if (s.cars.length < 30) {
      for (const lane of [0, 1]) {
        if (g.random() < s.dichte) s.cars.push({ x: lane === 0 ? 100 : 260, y: -80, lane, gez: false });
      }
    }
    s.cars = s.cars.filter((c) => c.y <= g.H + 80);
  },

  draw(s, d, g) {
    d.clear("cream");
    d.rect(40, 48, 120, 592, "yellow", { round: 8 });
    d.rect(200, 48, 120, 592, "yellow", { round: 8 });
    for (const c of s.cars) d.emoji("🚙", c.x, c.y, 34);
    d.emoji("🏎️", s.x, TOP_Y, 36);
    d.text("Ueberholt: " + s.ueberholt, 352, 30, { size: 18, align: "right" });
  }
};
