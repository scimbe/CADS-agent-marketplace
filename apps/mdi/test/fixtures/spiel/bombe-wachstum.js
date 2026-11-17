// Absichtlich kaputt: Speicher waechst in einer Schleife innerhalb eines Ticks (keine einzelne Massen-Operation).
// Erwartung: der Renderer stoesst an die Heap-Grenze des Sandbox-Browsers, runGame meldet "absturz" (fail closed).
export default {
  title: "Wachstum",
  controls: ["fire"],
  lives: 1,
  init() { return { n: 0 }; },
  update(s, input, g) { if (g.frame === 5) { const a = []; for (let i = 0; i < 4e7; i++) a.push({ i, t: "y" + i }); s.n = a.length; } },
  draw(s, d) { d.clear("cream"); }
};
