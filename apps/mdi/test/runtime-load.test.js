// Nachladen vor einem Ereignis (Regression nach #281): Das Ereignis geht nach erfolgreichem Laden nie verloren, auch nicht
// bei schnellen Folgeereignissen; Reihenfolge bleibt. Abgedeckt fuer GO, OPEN und LINK mit verzoegert ladendem Teil.
import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "../src/app/runtime.js";
import { createFeatParts } from "../src/app/fparts-lazy.js";
import { encode } from "../src/app/link.js";
import { counter, memStorage } from "./helpers.js";

const tick = () => new Promise((r) => setTimeout(r, 0));
function rig(needOn) {
  const FPR = createFeatParts({ "x-ui": { file: "parts/feat-x-ui.000000000000.js", sri: "x" } });
  const gates = [];
  const loadFeat = (n) => new Promise((ok) => gates.push(() => ok({ name: n, mod: { ok: true } })));
  const feats = [{ id: "fx", needParts: (ev) => (needOn.includes(ev.type) ? ["x-ui"] : []) }];
  const rt = createRuntime({ lang: "de", entropy: counter("a"), storage: memStorage(), schedule: (f) => f(), onChange: () => {}, clearUrl: () => {},
    needFeatures: feats, featParts: FPR, loadFeat });
  return { rt, release: async () => { await tick(); while (gates.length) gates.shift()(); await tick(); await tick(); } };
}
const leaf = (rt) => { for (const p of ["inhalt.card.play.turn", "inhalt.card.play.over", "inhalt.card.play.cover", "inhalt.card.view", "inhalt.shelf", "inhalt.card.play.wait", "inhalt.partfail"]) if (rt.matches(p)) return p; return "?"; };

test("GO mit verzoegert ladendem Teil startet die Partie (auch mit schnellem Folgeereignis waehrend des Ladens)", async () => {
  const { rt, release } = rig(["GO"]);
  rt.dispatch({ type: "OPEN", id: "bluff" }); rt.dispatch({ type: "MODE", mode: "alone" });
  assert.equal(leaf(rt), "inhalt.card.view");
  rt.dispatch("GO");
  assert.equal(rt.state.ctx.loading, "x-ui");
  const lv = rt.state.ctx.level;
  rt.dispatch({ type: "LEVEL", level: lv === 1 ? 3 : 1 });   // Folgeereignis waehrend des Ladens: darf GO nicht ueberholen (LEVEL gilt nur in card.view)
  await release();
  assert.ok(rt.matches("inhalt.card.play"), "Partie laeuft: " + leaf(rt));
  assert.equal(rt.state.ctx.loading, null, "Ladezeile wieder weg");
  assert.equal(rt.state.ctx.level, lv, "GO kam zuerst; LEVEL danach trifft die laufende Partie nicht");
});

test("OPEN mit verzoegert ladendem Teil oeffnet die Karte", async () => {
  const { rt, release } = rig(["OPEN"]);
  rt.dispatch({ type: "OPEN", id: "gruss" });
  assert.equal(leaf(rt), "inhalt.shelf");
  await release();
  assert.equal(leaf(rt), "inhalt.card.view");
  assert.equal(rt.state.ctx.cardId, "gruss");
});

test("LINK mit verzoegert ladendem Teil zeigt den Empfang", async () => {
  const { rt, release } = rig(["LINK"]);
  const { cardOf } = await import("../src/cards/index.js");
  const g = cardOf("gruss"), p = (await import("../src/app/game.js")).paramsOf({ cardId: "gruss", params: {} });
  rt.link(encode("card", { c: "gruss", v: g.manifest.version, p }));
  assert.ok(!rt.matches("inhalt.receive"), "erst nach dem Laden");
  await release();
  assert.ok(rt.matches("inhalt.receive"), "Empfang: " + JSON.stringify(rt.state.value));
});
