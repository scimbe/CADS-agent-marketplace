// Absichtlich kaputt: Speicherbombe in einem Tick (riesige Liste fuellen). Erwartung: Fehler "speicher" sofort, kein Absturz.
export default {
  title: "Listenbombe",
  controls: ["fire"],
  lives: 1,
  init() { return { n: 0 }; },
  update(s, input, g) { if (g.frame === 5) s.n = new Array(2 ** 30).fill(0).length; },
  draw(s, d) { d.clear("cream"); }
};
