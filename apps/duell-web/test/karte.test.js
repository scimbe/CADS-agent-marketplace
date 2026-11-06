"use strict";
// "Create your own card" (freie Karte, W2): the server checks a card with a copy of sanitizeDoc (CADS-DEMO-wrapper
// lib/vendor/duell-web). Both repos hold the same fixture test/fixtures/karte-sanitize.json and check their own code against
// it, so a change here that the server copy does not have fails one side. Plus: the part, its texts, the crisis rule and the
// rules for the tile (no counter, no streak, no countdown).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const D = require("../src/daily.js");
const Ai = require("../src/ai.js");
const TX = require("../src/texts.json");

test("sanitizeDoc gibt fuer jeden Fall der gemeinsamen Fixture genau das Erwartete zurueck (Gleichheit mit der Server-Kopie)", () => {
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/karte-sanitize.json"), "utf8"));
  assert.ok(fx.cases.length >= 10);
  for (const c of fx.cases) assert.deepEqual(D.sanitizeDoc(c.in), c.out, JSON.stringify(c.in).slice(0, 80));
});

test("karte: Krisentext bleibt auf dem Geraet, Texte in beiden Sprachen, kein Zaehler und keine Frist", () => {
  assert.ok(Ai.CRISIS_KINDS.indexOf("karte") >= 0);
  assert.equal(Ai.crisis("Ich will nicht mehr leben"), true);
  const keys = Object.keys(TX.de).filter((k) => /^create_/.test(k));
  assert.ok(keys.length >= 20);
  for (const k of keys) assert.ok(TX.en[k], "en " + k);
  const all = keys.map((k) => TX.de[k] + " " + TX.en[k]).join(" ").toLowerCase();
  assert.ok(!/streak|weiterleit|forward|countdown|nur noch|only \d|beeil|hurry|kauf|buy|abo/.test(all), "kein Druck, kein Kaufappell");
  const ui = fs.readFileSync(path.join(__dirname, "../src/create-ui.js"), "utf8");
  assert.ok(!/innerHTML|eval\(|new Function|localStorage|setInterval/.test(ui), "kein HTML aus Daten, kein Zaehler im Speicher");
  assert.ok(!/photo|foto|image/i.test((ui.match(/input: function \(\) \{[^\n]*/) || [""])[0]), "nur Text geht an den Server");
});
