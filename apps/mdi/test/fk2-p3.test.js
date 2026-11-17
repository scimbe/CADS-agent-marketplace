// Freie Karte 2, P3 (Prototyp): Content-Policy, Befunde/Fehlerarten, Code-Extraktion, Kostenbuchung mit hartem Abbruch.
// Ohne Netz, ohne Key, ohne Browser.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkPolicy } from "../scripts/fk2-p3/policy.mjs";
import { repairNotes, errorKinds, extractCode } from "../scripts/fk2-p3/befund.mjs";
import { createLedger, createLlm, usd, BudgetAbbruch } from "../scripts/fk2-p3/llm.mjs";
import { praefix } from "../scripts/fk2-p3/doku.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ref = (n) => fs.readFileSync(path.join(ROOT, "src/spiel/beispiele", n + ".js"), "utf8");

test("Policy: Referenzspiele bestehen; Waffen, Menschen und Gewaltwoerter fallen auf; Kommentare zaehlen nicht", () => {
  for (const n of ["invaders", "breakout", "snake", "rennen", "asteroids", "plattformer"]) assert.deepEqual(checkPolicy(ref(n)), [], n);
  assert.match(checkPolicy('d.emoji("🔫", 1, 1, 20)')[0], /Waffe/);
  assert.match(checkPolicy('d.emoji("🧑", 1, 1, 20)')[0], /Menschen/);
  assert.match(checkPolicy('d.emoji("👩🏽", 1, 1, 20)').join(" "), /Menschen/);
  assert.match(checkPolicy('d.text("Gegner getötet", 1, 1)')[0], /Gewalt/);
  assert.deepEqual(checkPolicy('// Blut gibt es nicht, kein 🔫\nd.text("nass!", 1, 1); d.emoji("💧", 1, 1, 20)'), []);
  assert.deepEqual(checkPolicy('d.text("Wasserbomben-Duell", 1, 1); d.emoji("🎈", 1, 1, 20)'), [], "harmloses Werfen ist erlaubt");
});

test("Befunde: Saetze mit Abhilfe und feste Fehlerarten", () => {
  const report = {
    error: { code: "zeichnen", message: 'd.rect: Farbe "blue" unbekannt – erlaubt: yellow, cream, ink, red', where: "random", frame: 3 },
    checks: { noException: { ok: false }, static: { ok: false, findings: ["Math.sin nicht erlaubt (Zeile 4)", "Operator ** nicht erlaubt (Zeile 9)"] }, inputsEffective: { ok: false, perControl: { left: true, up: false } } }
  };
  const notes = repairNotes(report, ["Policy: Emoji 🔫 nicht erlaubt"]);
  assert.match(notes[0], /Laufzeitfehler \(zeichnen.*Farbe "blue"/);
  assert.ok(notes.some((n) => /g\.sin\(grad\)/.test(n)), "Abhilfe fuer Math.sin");
  assert.ok(notes.some((n) => /Ohne Wirkung: up/.test(n)));
  assert.deepEqual(errorKinds(report, ["Policy: Emoji 🔫 nicht erlaubt"]), ["laufzeit:zeichnen:farbe", "statisch:Math.sin", "statisch:**", "invariante:inputsEffective", "policy:emoji"]);
});

test("Code-Extraktion: letzter js-Block mit export default, auch abgeschnitten; sonst null", () => {
  assert.equal(extractCode("Hier:\n```js\nexport default { a: 1 };\n```\nfertig"), "export default { a: 1 };\n");
  assert.equal(extractCode("```js\nconst x = 1;\n```\n```javascript\nexport default {};\n```"), "export default {};\n");
  assert.equal(extractCode("```js\nexport default { title: \"x\""), "export default { title: \"x\"\n");
  assert.equal(extractCode("Ich kann das nicht."), null);
});

test("Kosten: Preise des Auftrags; Reserve vor dem Aufruf, harter Abbruch ohne Request", async () => {
  assert.ok(Math.abs(usd("claude-haiku-5-5", { input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 1e6, cache_creation_input_tokens: 1e6 }) - 0.735) < 1e-9);
  assert.ok(Math.abs(usd("claude-sonnet-5-5", { input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 1e6, cache_creation_input_tokens: 1e6 }) - 14.6) < 1e-9);
  const ledger = createLedger({ cap: 0.01 });
  let sent = 0;
  const llm = createLlm({ ledger, fake: async () => { sent++; return { stop_reason: "end_turn", content: [{ type: "text", text: "{\"a\":1}" }], usage: { input_tokens: 1000, output_tokens: 1000 } }; } });
  const req = { max_tokens: 1000, system: "x", messages: [{ role: "user", content: "y" }], output_config: { format: { type: "json_schema", schema: { type: "object" } } } };
  const r = await llm.call({ role: "planer", model: "claude-haiku-5-5", req });
  assert.deepEqual(r.json, { a: 1 });
  assert.ok(Math.abs(ledger.spent - 0.0006) < 1e-12);
  await assert.rejects(llm.call({ role: "planer", model: "claude-sonnet-5-5", req: { ...req, max_tokens: 2000 } }), BudgetAbbruch);
  assert.equal(sent, 1, "der abgebrochene Aufruf ging nicht raus");
  assert.equal(ledger.reserved, 0);
});

test("Praefix: API-Kopf, Grenzen, Policy und drei Vorlagen; byte-stabil (Cache)", () => {
  const p = praefix();
  assert.equal(p, praefix());
  for (const s of ["g.hit(a, b)", "d.emoji(zeichen", "Keine Bilder, Fotos", "Content-Policy", "Vorlage invaders.js", "Vorlage snake.js", "Vorlage plattformer.js"]) assert.ok(p.includes(s), s);
  assert.ok(!p.includes("Vorlage breakout.js"));
});
