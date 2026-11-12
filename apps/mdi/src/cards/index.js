// Kartenregister: alle Karten erfuellen denselben Vertrag; der Host kennt nur diese Schnittstelle.
import gruss from "./gruss/card.js";
import bluff from "./bluff/card.js";
import frei from "./frei/card.js"; // Strang K: freie Karte (eine Zeile, bis Strang F das Register erzeugt)
import * as V from "../gen/validators.js";
import { CODE_HASH } from "../gen/codehash.js";

const VALIDATE = { gruss: V.params_gruss, bluff: V.params_bluff, frei: V.params_frei };
export const CARDS = { gruss, bluff, frei };
export const ORDER = ["gruss", "bluff"];
export function cardOf(id) { return Object.prototype.hasOwnProperty.call(CARDS, id) ? CARDS[id] : null; }
export function validParams(id, p) { const f = VALIDATE[id]; return !!f && f(p) === true; }
export function codeHash(id) { return CODE_HASH[id]; }
/** Modi aus dem Manifest abgeleitet – keine Kartensonderlogik (A3). */
export function modesOf(card) {
  const m = card.manifest;
  if (m.mode === "static") return ["link", "live"];
  const out = ["alone"];
  // Bot und Live sprechen in D0 ein Zwei-Parteien-Protokoll (ein Partner); mehr Sitze erst mit Gruppen (KONZEPT §4)
  if (m.players.max === 2) out.push("bot", "link", "live");
  else if (m.players.max > 2) out.push("link");
  return out;
}
