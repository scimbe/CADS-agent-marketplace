// Absichtlich kaputt: Zustand ausserhalb von s (Modulvariable). Bots spielen voraus und Neustarts teilen ihn.
// Erwartung: deterministic oder restartWorks schlaegt fehl.
let hidden = 0;
export default {
  title: "Leck",
  controls: ["left", "right"],
  lives: 3,
  init() { return { x: 100 + hidden }; },
  update(s, input, g) {
    hidden += 1;
    if (input.left) s.x -= 2;
    if (input.right) s.x += 2;
    if (hidden % 97 === 0) g.addScore(1);
    if (hidden % 400 === 0) g.loseLife();
  },
  draw(s, d) { d.clear("cream"); d.circle(s.x, 300, 10, "red"); }
};
