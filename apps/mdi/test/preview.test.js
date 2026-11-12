// Vorschau fuer jede Kartenart ueber ihren Vertrag (Integrator-Auftrag, Befund Strang A: Echtzeitkarten stuerzten im Regal ab).
// Die Regel liegt in src/app/game.js previewNode (Strang F, dieselbe wie fuer die Thumbnails); hier: deckt sie alle Arten ab?
// Alle Karten des Registers und die Testkarten des Fundaments (fx-zug = Zugvertrag v0.2, fx-rt = Echtzeit) liefern eine
// Anzeigeliste; Echtzeit ergibt eine Canvas-Liste nach festen Ticks Bot gegen Bot, deterministisch.
import test from "node:test";
import assert from "node:assert/strict";
import { CARDS } from "../src/cards/index.js";
import { previewNode as gPreview } from "../src/app/game.js";
const previewNode = (card, params, vctx) => gPreview(card, params, vctx.lang, {}); // eine Regel: G.previewNode (Strang F)
import fxZug from "./fixtures/cards/fx-zug/card.js";
import fxRt from "./fixtures/cards/fx-rt/card.js";

function defaults(card) { const p = card.manifest.params, o = {}; for (const [k, v] of Object.entries((p && p.properties) || {})) o[k] = v.default; return o; }
const all = { ...CARDS, "fx-zug": fxZug, "fx-rt": fxRt };

for (const [id, card] of Object.entries(all)) {
  test("Vorschau ueber den Vertrag: " + id + " (" + card.manifest.mode + ")", () => {
    const n = previewNode(card, defaults(card), { lang: "de", preview: true });
    assert.ok(n && typeof n === "object" && typeof n.t === "string", id + ": Anzeigeliste");
    if (card.manifest.mode === "realtime") assert.equal(n.t, "canvas");
    assert.deepEqual(previewNode(card, defaults(card), { lang: "de", preview: true }), n, "deterministisch");
  });
}
