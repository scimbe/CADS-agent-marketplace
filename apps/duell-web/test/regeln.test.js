"use strict";
// Part regler: the flight game's sliders in named steps (src/regeln.js, src/regler.json).
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core.js");
const R = require("../src/regeln.js");
const N = require("../src/regler.json");

test("Stufen: fuenf je Regler, aufsteigend, in den Grenzen von RANGES, die mittlere ist der Standard", () => {
  assert.deepEqual(R.KEYS, Object.keys(C.RANGES));
  for (const k of R.KEYS) {
    const s = R.steps(k), g = C.RANGES[k];
    assert.equal(s.length, R.N); assert.equal(s[0], g[0]); assert.equal(s[4], g[1]); assert.equal(s[2], g[2], k + " Mitte = Standard");
    for (let i = 1; i < s.length; i++) assert.ok(s[i] > s[i - 1], k + " aufsteigend");
    for (let i = 0; i < R.N; i++) { assert.equal(R.level(k, R.value(k, i)), i, k + " Stufe " + i + " hin und zurueck"); assert.deepEqual(C.sanitizeParams({ [k]: R.value(k, i) })[k], R.value(k, i), "gueltig"); }
    assert.equal(R.value(k, 99), g[1]); assert.equal(R.value(k, -3), g[0]); assert.equal(R.value(k, "x"), g[0]);
  }
});
test("Alte Werte: ein Blatt mit Zwischenwert zeigt die naechste Stufe und bleibt unveraendert, bis man schiebt", () => {
  // the lava level of the catalog: 2100 / 480 / 125 / 165 (golden link game:spiel-lava)
  assert.equal(R.level("gravity", 2100), 3); assert.equal(R.level("jump", 480), 3); assert.equal(R.level("gap", 125), 1); assert.equal(R.level("speed", 165), 3);
  assert.equal(R.level("speed", 130), 2); assert.equal(R.level("gravity", 900), 0);
});
test("Namen statt Zahlen: jede Stufe hat ein Wort in de und en, kein Wort ist eine Zahl", () => {
  for (const l of ["de", "en"]) for (const k of R.KEYS) for (let i = 0; i < R.N; i++) {
    const w = N[l]["rg_" + k + i]; assert.ok(w, l + " " + k + i); assert.doesNotMatch(w, /\d/);
  }
  assert.deepEqual(Object.keys(N.de).sort(), Object.keys(N.en).sort());
});
