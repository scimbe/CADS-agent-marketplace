// Absichtlich zaeh: jeder Schritt rechnet etwa 200 ms. Jeder Bot-Frame meldet Fortschritt, kein Fenster laeuft ab – die
// Pruefung wuerde aber Stunden dauern. Erwartung: die Gesamtfrist (Rahmen bzw. Host) beendet sie mit "watchdog".
const WORK = 45000000;
function work(seed) { let x = seed; for (let i = 0; i < WORK; i++) x = (x * 31 + i) % 1000003; return x; }
export default {
  title: "Zaeh",
  controls: ["fire"],
  lives: 1,
  init() { return { chk: 0 }; },
  update(s, input, g) { s.chk = work(s.chk + g.frame); },
  draw(s, d) { d.clear("cream"); }
};
