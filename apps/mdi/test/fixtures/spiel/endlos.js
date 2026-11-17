// Absichtlich kaputt: ab Frame 30 eine Endlosschleife in update. Erwartung: Watchdog beendet den Worker.
export default {
  title: "Endlos",
  controls: ["left", "right"],
  lives: 1,
  init() { return { x: 100 }; },
  update(s, input, g) {
    if (input.left) s.x -= 2;
    if (input.right) s.x += 2;
    if (g.frame > 30) { let i = 0; while (i >= 0) i = (i + 1) % 7; }
  },
  draw(s, d) { d.clear("cream"); d.circle(s.x, 300, 10, "red"); }
};
