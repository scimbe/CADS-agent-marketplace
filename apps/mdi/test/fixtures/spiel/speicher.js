// Absichtlich kaputt: haengt je Frame 500 Objekte an und raeumt nie auf. Erwartung: Fehler "speicher" (Zustandsgrenze).
export default {
  title: "Messie",
  controls: ["fire"],
  lives: 1,
  init() { return { junk: [] }; },
  update(s, input, g) { for (let i = 0; i < 500; i++) s.junk.push({ x: i, y: g.frame }); },
  draw(s, d) { d.clear("cream"); d.text("" + s.junk.length, 100, 100); }
};
