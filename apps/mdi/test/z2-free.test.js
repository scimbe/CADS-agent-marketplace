// Uebergabe an die freie Karte (Strang K): alte Katalog-id -> Parameter und zurueck; Unbekanntes -> null.
import test from "node:test";
import assert from "node:assert/strict";

test("fromFree/toFree: Karte, Variante, Titel, Wort; Fremdes wird abgelehnt", async () => {
  const auk = (await import("../src/cards/zug-auktion/card.js")).default;
  const lob = (await import("../src/cards/zug-lob/card.js")).default;
  assert.deepEqual(auk.fromFree({ k: "turn", i: "zug-deal", t: "Pizza teilen", w: "Pizzastücke" }), { spiel: "deal", title: "Pizza teilen", w: "Pizzastücke", accent: "yellow" });
  assert.deepEqual(auk.toFree({ spiel: "deal", title: "Pizza teilen", w: "Pizzastücke", accent: "red" }), { k: "turn", i: "zug-deal", t: "Pizza teilen", w: "Pizzastücke" });
  assert.deepEqual(auk.toFree({ spiel: "auktion", title: "", w: "", accent: "red" }), { k: "turn", i: "zug-auktion" });
  assert.deepEqual(lob.fromFree({ k: "turn", i: "zug-lob" }), { title: "", accent: "yellow" });
  assert.equal(lob.fromFree({ k: "turn", i: "zug-lob", w: "x" }), null, "zug-lob kennt kein Wort");
  assert.equal(lob.fromFree({ k: "duel", i: "zug-lob" }), null);
  assert.equal(lob.fromFree({ k: "turn", i: "zug-auktion" }), null);
  assert.equal(lob.fromFree({ k: "turn", i: "zug-lob", t: "schreib mir auf whatsapp" }), null, "Kontaktfilter greift, kein stiller Ersatz");
  const kreis = (await import("../src/cards/zug-kreis/card.js")).default;
  assert.equal(kreis.fromFree({ k: "turn", i: "raum-tuer" }).spiel, "tuer");
  assert.equal(kreis.toFree({ spiel: "tuer", title: "", accent: "yellow" }).i, "raum-tuer");
});
