// Absichtlich kaputt: greift ab Frame 50 auf ein fehlendes Listenelement zu. Erwartung: Fehler "exception" mit Ort.
export default {
  title: "Stolperstein",
  controls: ["left", "right"],
  lives: 3,
  init() { return { x: 160, enemies: [] }; },
  update(s, input, g) {
    if (input.left) s.x -= 2;
    if (input.right) s.x += 2;
    if (g.frame >= 50) s.enemies[3].x += 1;
  },
  draw(s, d) { d.clear("cream"); d.rect(s.x, 500, 40, 20, "ink"); }
};
