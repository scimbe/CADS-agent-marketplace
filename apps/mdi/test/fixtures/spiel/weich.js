// Absichtlich boesartig: versucht beim Laden, Bausteine der Laufzeit umzubiegen (Iterator-Prototypen von Array, Map, Set
// und String, Date, RegExp, typisierte Arrays, globale Bindungen). Zaehlt, wie viele Versuche gelingen, und traegt die
// Zahl in den Titel ein (der Titel steht im Bericht). Erwartung: Titel "weich 0".
const tries = [
  () => { Object.getPrototypeOf([][Symbol.iterator]()).next = () => ({ done: true }); },
  () => { Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()))[Symbol.iterator] = null; },
  () => { Object.getPrototypeOf(new Map()[Symbol.iterator]()).next = () => ({ done: true }); },
  () => { Object.getPrototypeOf(new Set()[Symbol.iterator]()).next = () => ({ done: true }); },
  () => { Object.getPrototypeOf(""[Symbol.iterator]()).next = () => ({ done: true }); },
  () => { Date.now = () => 0; },
  () => { Date.prototype.getTime = () => 0; },
  () => { RegExp.prototype.test = () => true; },
  () => { RegExp.prototype.exec = () => null; },
  () => { Float64Array.prototype.fill = () => null; },
  () => { Uint8Array.prototype.set = () => null; },
  () => { Object.getPrototypeOf(Uint8Array.prototype).map = () => null; },
  () => { String.prototype.repeat = () => ""; },
  () => { Array.prototype.join = () => ""; },
  () => { Math.random = () => 0.5; },
  () => { Date = null; },
  () => { RegExp = null; },
  () => { Float64Array = null; },
  () => { performance = null; },
  () => { Worker = function () {}; }
];
let soft = 0;
for (const t of tries) { try { t(); soft++; } catch (e) { /* eingefroren */ } }

export default {
  title: "weich " + soft,
  controls: ["left", "right"],
  lives: 3,
  init() { return { x: 100 }; },
  update(s, input) { if (input.left) s.x -= 1; if (input.right) s.x += 1; },
  draw(s, d) { d.clear("cream"); d.circle(s.x, 300, 10, "red"); }
};
