// Absichtlich kaputt: versucht an die App zu kommen (parent/top/document). Im Worker gibt es nichts davon.
// Erwartung: sauberer Fehler "exception", nichts erreicht die App.
export default {
  title: "Ausbrecher",
  controls: ["fire"],
  lives: 1,
  init() { return { n: 0 }; },
  update(s) {
    s.n += 1;
    if (s.n === 5) parent.document.body.textContent = "gekapert";
  },
  draw(s, d) { d.clear("cream"); d.text("" + s.n, 100, 100); }
};
