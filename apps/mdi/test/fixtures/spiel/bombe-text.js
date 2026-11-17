// Absichtlich kaputt: Speicherbombe in einem Tick (riesiger Text). Erwartung: Fehler "speicher" sofort, kein Absturz.
export default {
  title: "Textbombe",
  controls: ["fire"],
  lives: 1,
  init() { return { n: 0 }; },
  update(s, input, g) { if (g.frame === 5) s.n = "x".repeat(2 ** 29 - 24).length; },
  draw(s, d) { d.clear("cream"); }
};
