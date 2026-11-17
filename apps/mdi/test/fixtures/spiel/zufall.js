// Absichtlich kaputt: nutzt den Zufall von Math statt g.random(). Erwartung: Fehler mit Hinweis auf g.random().
const M = Math;
export default {
  title: "Wuerfler",
  controls: ["fire"],
  lives: 1,
  init() { return { v: 0 }; },
  update(s) { s.v = M["ran" + "dom"](); },
  draw(s, d) { d.clear("cream"); d.text("" + s.v, 100, 100); }
};
