// Dieselbe Bot-Partie wie ARC.botHash auf der Pruefseite, hier in Node (Vergleichswert fuer den Determinismus-Test).
import { cardOf } from "../../../src/cards/index.js";
import { defaults } from "../../../src/contract/fields.js";
export function botHash(id, seed, n) {
  const c = cardOf(id); let st = c.init({ params: defaults(c.manifest.params), seed, players: ["bot", "bot"] });
  for (let i = 0; i < n && !c.status(st).over; i++) st = c.step(st, [{ b: 0 }, { b: 0 }]).state;
  return c.hash(st);
}
