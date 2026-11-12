// Feature-Teile (ADR 0001 Nachtrag 4): Register, Laden mit Pruefung, ehrliche Fehler, Laufzeit laedt vor dem Ereignis.
import test from "node:test";
import assert from "node:assert/strict";
import { createFeatParts } from "../src/app/fparts-lazy.js";
import { merge, partOf, PART_NAMES } from "../src/gen/fparts.js";
import { featureNeedParts } from "../src/app/features.js";
import { createRuntime } from "../src/app/runtime.js";
import { counter, memStorage } from "./helpers.js";

test("Register im Browser: laedt einmal, prueft Name und Modul, meldet unbekannt/fehlt/manipuliert ehrlich", async () => {
  const R = createFeatParts({ a: { file: "parts/feat-a.000000000000.js", sri: "x" } });
  let calls = 0;
  assert.equal(R.partOf("a"), null);
  await assert.rejects(R.loadFeatPart("b", () => null), { code: "teil-unbekannt" });
  await assert.rejects(R.loadFeatPart("a"), { code: "teil-fehlt" });
  await assert.rejects(R.loadFeatPart("a", async () => ({ name: "x", mod: {} })), { code: "teil-manipuliert" });
  assert.equal(R.isPartLoaded("a"), false, "nichts Falsches gemerkt");
  const loader = async (n) => { calls++; return { name: n, mod: { f: 1 } }; };
  const [m1, m2] = await Promise.all([R.loadFeatPart("a", loader), R.loadFeatPart("a", loader)]);
  assert.equal(m1, m2); assert.equal(calls, 1, "gleichzeitige Anfragen laden einmal");
  assert.deepEqual(R.partOf("a"), { f: 1 });
  await assert.rejects(R.loadFeatPart("a", () => Promise.reject(Object.assign(new Error("x"), { code: "teil-fehlt" }))).then(() => { throw Object.assign(new Error("nie"), { code: "nie" }); }), { code: "nie" }, "geladen bleibt geladen");
});

test("Statische Fassung (Node): Teile sofort da; doppelte Exporte in einem Teil sind ein Fehler", () => {
  assert.ok(PART_NAMES.includes("klang-rap"));
  assert.equal(typeof partOf("klang-rap").render, "function");
  assert.throws(() => merge("t", [{ a: 1 }, { a: 2 }]), /Export doppelt: a/);
});

test("Laufzeit: needParts laedt vor dem Ereignis (LOADING); fehlt der Teil, ehrlich PART_FAIL mit Wiederholen", async () => {
  const feats = [{ id: "fx", needParts: (ev) => (ev.type === "OPEN" ? ["nicht-da", "nicht-da"] : []) }];
  assert.deepEqual(featureNeedParts({ type: "OPEN" }, {}, feats), ["nicht-da"]);
  let asked = 0;
  const rt = createRuntime({ lang: "de", entropy: counter(), storage: memStorage(), schedule: (f) => f(), onChange: () => {},
    needFeatures: feats, loadFeat: async (n) => { asked++; return { name: n, mod: {} }; } });
  rt.dispatch({ type: "OPEN", id: "gruss" });
  assert.equal(rt.state.ctx.loading, "nicht-da", "LOADING vor dem Ereignis");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(asked, 0, "unbekannter Teil wird gar nicht erst angefragt");
  assert.ok(rt.matches("inhalt.partfail"), "ehrlicher Fehler statt Weiterlaufen ohne Teil");
  assert.equal(rt.state.ctx.partFail.reason, "teil-unbekannt");
});
