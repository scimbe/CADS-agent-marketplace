// Ueberhol-Rennen: Rennwagen auf zwei Spuren, fremde Autos ueberholen, Zusammenstoss beendet die Fahrt.
export default {
  title: "Überhol-Rennen auf der Autobahn",
  controls: ["left", "right"],
  lives: 3,

  init(g) {
    return { me: { x: 250, y: 520, w: 40, h: 60 }, cars: [], ueberholt: 0, road: 0 };
  },

  update(s, input, g) {
    if (input.left) s.me.x -= 6;
    if (input.right) s.me.x += 6;
    s.me.x = g.clamp(s.me.x, 70, 250);

    const tempo = 4 + 0.4 * Math.floor(s.ueberholt / 10);
    s.road = (s.road + tempo) % 60;

    const pl = s.me.x < 160 ? 0 : 1;
    if (g.frame >= 30 && g.random() < 0.03) {
      // Meist auf der anderen Spur, damit Ueberholen moeglich ist; manchmal auf der eigenen Spur.
      const lane = g.random() < 0.75 ? 1 - pl : pl;
      s.cars.push({ x: lane === 0 ? 70 : 250, y: -60, w: 40, h: 60, lane, counted: false });
    }

    for (const c of s.cars) {
      c.y += tempo;
      if (g.hit(s.me, c)) { g.sound("lose"); g.gameOver(); return; }
      if (!c.counted && c.y > s.me.y + s.me.h && c.lane !== pl) {
        c.counted = true;
        s.ueberholt += 1;
        g.addScore(1);
        g.sound("pop");
        if (s.ueberholt % 10 === 0) g.nextLevel();
      }
    }
    s.cars = s.cars.filter((c) => c.y < g.H);
  },

  draw(s, d, g) {
    d.clear("cream");
    d.rect(40, g.TOP, 280, g.H - g.TOP, "ink");
    for (let y = g.TOP - 60 + s.road; y < g.H; y += 60) d.rect(176, y, 8, 30, "yellow");
    for (const c of s.cars) d.emoji("🚙", c.x + 20, c.y + 30, 50);
    d.emoji("🏎️", s.me.x + 20, s.me.y + 30, 56);
    d.text("Überholt: " + s.ueberholt, 20, 30, { size: 22, color: "ink", align: "left" });
  }
};
