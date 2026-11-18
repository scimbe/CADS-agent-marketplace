// UX-Messung (test/e2e/lib/ux-mass.mjs): Woerter, Saetze und LIX (Bjoernsson) selbst gezaehlt, Gate-Modus ohne stillen Rueckfall.
import test from "node:test";
import assert from "node:assert/strict";
import { woerter, saetze, lix, gateModus, verstoesse, ZIELE } from "./e2e/lib/ux-mass.mjs";

test("woerter: Buchstaben- und Ziffernfolgen, Bindestrich-Woerter als eins, Emoji und Zeichen zaehlen nicht", () => {
  assert.deepEqual(woerter("Egal, überrasch mich 🎲"), ["Egal", "überrasch", "mich"]);
  assert.deepEqual(woerter("E-Mail an dein Konto – 1 von 3"), ["E-Mail", "an", "dein", "Konto", "1", "von", "3"]);
  assert.deepEqual(woerter("„Ja, so bauen“"), ["Ja", "so", "bauen"]);
  assert.deepEqual(woerter("  ⛵ · ›"), []);
});

test("saetze: Satzzeichen zaehlen, ein Block ohne Satzzeichen am Ende ist ein Satz", () => {
  assert.equal(saetze("Ein Satz reicht. Danach fragen wir kurz nach."), 2);
  assert.equal(saetze("Weiter"), 1);
  assert.equal(saetze("Ehrlich gesagt: das geht nicht"), 2);
  assert.equal(saetze("z. B. Die Boote"), 3);   // Abkuerzungen zaehlen wie bei LIX ueblich mit
  assert.equal(saetze("🎲"), 0);
});

test("lix: W/S + 100*L/W, lang = mehr als 6 Buchstaben", () => {
  // 4 Woerter, 1 Satz, 0 lange: 4
  assert.equal(lix("Das ist ein Haus."), 4);
  // 1 Wort, 1 Satz, 1 langes: 1 + 100 = 101
  assert.equal(lix("Zusammenfassung"), 101);
  // Bloecke: "Was soll es werden?" (4 W, 1 S, 0 L) + "Weiter" (1 W, 1 S, 0 L): 5/2 + 0 = 2,5
  assert.equal(lix(["Was soll es werden?", "Weiter"]), 2.5);
  // "Noch nichts wird gebaut oder abgebucht." 6 W, 1 S, lang: abgebucht (9) = 1 -> 6 + 16,67 = 22,7
  assert.equal(lix("Noch nichts wird gebaut oder abgebucht."), 22.7);
  // Umlaute und ß sind Buchstaben: "Glücksspiel" hat 11
  assert.equal(lix("Glücksspiel"), 101);
  assert.equal(lix([]), null);
  assert.equal(lix(["🎲"]), null);
});

test("gateModus: bericht als Standard, streng auf Wunsch, alles andere bricht ab", () => {
  assert.equal(gateModus({}), "bericht");
  assert.equal(gateModus({ UX_GATE: "" }), "bericht");
  assert.equal(gateModus({ UX_GATE: "streng" }), "streng");
  assert.throws(() => gateModus({ UX_GATE: "aus" }), /bericht oder streng/);
});

test("verstoesse: jede Messgroesse gegen ihr Ziel", () => {
  const gut = { taps: 3, entscheidungen: 1, woerter: 12, lix: 30, tippflaeche: 44, zuKlein: [], axe: [], kacheln: 4, kachelnVorlesen: 4, frage: true, vorlesen: true };
  assert.deepEqual(verstoesse(gut), []);
  const v = verstoesse({ ...gut, taps: 8, entscheidungen: 2, woerter: 13, lix: 30.1, tippflaeche: 24, zuKlein: [{ act: "k-link", name: "Ändern" }], axe: ["x"], kachelnVorlesen: 0, vorlesen: false });
  assert.equal(v.length, 8, v.join(" | "));
  assert.equal(ZIELE.taps, 3); assert.equal(ZIELE.woerter, 12); assert.equal(ZIELE.lix, 30); assert.equal(ZIELE.tippflaeche, 44);
});
