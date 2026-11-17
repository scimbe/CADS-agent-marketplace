// Waechter "an Spielen nichts verlieren" (Auftrag des Users ueber den Integrator): Jede Karte des alten Regals (ideas) und
// jede eingeklappte Variante (retired) ist im neuen Register einer Karte oder Variante zugeordnet – ueber die Karten-id,
// manifest.legacy, variants[].id oder variants[].legacy – und laesst sich oeffnen (Vorschau ueber den Vertrag ohne Fehler,
// dieselbe Regel wie test/preview.test.js). Die Liste "gone" hatte schon im Altcode keinen Code; sie wird nur
// dokumentiert und nicht geprueft.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CARDS, LEGACY, VARIANTS, cardOf, loadCard } from "../src/cards/index.js";
import { previewNode } from "../src/app/game.js";

const K = JSON.parse(fs.readFileSync(new URL("./fixtures/alt-katalog.json", import.meta.url), "utf8"));

/** alte id -> { card, variant } oder null */
function zuordnung(id) {
  if (Object.prototype.hasOwnProperty.call(CARDS, id)) return { card: id, variant: null };
  if (Object.prototype.hasOwnProperty.call(LEGACY, id)) return LEGACY[id];
  if (Object.prototype.hasOwnProperty.call(VARIANTS, id)) return { card: VARIANTS[id].card, variant: id };
  return null;
}
function paramsOf(card, variantId) {
  const p = {}, props = (card.manifest.params && card.manifest.params.properties) || {};
  for (const [k, v] of Object.entries(props)) p[k] = JSON.parse(JSON.stringify(v.default === undefined ? null : v.default));
  const v = variantId && (card.manifest.variants || []).find((x) => x.id === variantId);
  return v ? { ...p, ...v.params } : p;
}

test("Fixture stammt aus dem Altbaum und ist vollstaendig (64 Regal, 84 eingeklappt, 37 ohne Code)", () => {
  assert.match(K.herkunft, /^Altbaum @ pre-legacy-removal \([0-9a-f]{40}\)/);
  assert.deepEqual([K.ideas.length, K.retired.length, K.gone.length], [64, 84, 37]);
  assert.equal(new Set([...K.ideas, ...K.retired, ...K.gone]).size, 64 + 84 + 37, "keine doppelte id");
});

for (const [teil, liste] of [["Regal", K.ideas], ["eingeklappt", K.retired]]) {
  test(`jede ${teil}-Karte des Altkatalogs (${liste.length}) ist einer Karte oder Variante zugeordnet`, () => {
    const fehlt = liste.filter((id) => !zuordnung(id));
    assert.deepEqual(fehlt, [], "ohne Zuordnung (an Spielen ginge etwas verloren)");
  });
  test(`jede zugeordnete ${teil}-Karte ist im Register und laesst sich oeffnen (Vorschau de/en ohne Fehler)`, async () => {
    const kaputt = [];
    for (const id of liste) {
      const z = zuordnung(id);
      if (!z) continue; // meldet der Test davor
      try {
        assert.ok(cardOf(z.card), "nicht im Register");
        const card = await loadCard(z.card);
        if (z.variant) assert.ok((card.manifest.variants || []).some((v) => v.id === z.variant), "Variante fehlt im Manifest");
        for (const lang of ["de", "en"]) {
          const n = previewNode(card, paramsOf(card, z.variant), lang, {});
          assert.ok(n && typeof n === "object" && typeof n.t === "string", "keine Anzeigeliste");
        }
      } catch (e) { kaputt.push(id + " -> " + z.card + (z.variant ? "/" + z.variant : "") + ": " + e.message); }
    }
    assert.deepEqual(kaputt, []);
  });
}

test("gone (nur dokumentiert): ids ohne Code schon im Altbaum", () => {
  // keine Pruefung der Zuordnung; nur, dass die Liste nicht mit Regal oder eingeklappten Karten vermischt ist
  for (const id of K.gone) assert.equal(K.ideas.includes(id) || K.retired.includes(id), false, id);
});
