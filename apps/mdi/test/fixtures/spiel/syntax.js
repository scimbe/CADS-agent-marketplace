// Absichtlich kaputt: Syntaxfehler (fehlende Klammer). Erwartung: Fehler "syntax".
export default {
  title: "Tippfehler",
  controls: ["fire"],
  lives: 1,
  init() { return { v: 0 },
  update(s) { s.v += 1; },
  draw(s, d) { d.clear("cream"); }
};
