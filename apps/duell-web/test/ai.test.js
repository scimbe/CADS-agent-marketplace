"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../src/ai.js");
const C = require("../src/core.js");
const D = require("../src/daily.js");
const pick = (n) => n - 1;

test("Lokal: jede Art liefert ohne Netz sofort Vorschlaege in beiden Sprachen, alle sauber und passend lang", () => {
  for (const lang of ["de", "en"]) {
    const line = A.local("line", D.IDEAS, lang, pick), meme = A.local("meme", D.IDEAS, lang, pick), song = A.local("lyrics", D.IDEAS, lang, pick, "Pizza");
    assert.equal(line.length, 3); assert.ok(meme.length >= 1); assert.equal(song.length, 1);
    for (const l of line) { assert.ok(C.isClean(l), l); assert.ok(D.cleanInput(l, 90), l); }
    for (const m of meme) assert.ok(D.cleanInput(m.top, 28) && D.cleanInput(m.bottom, 28), JSON.stringify(m));
    assert.equal(song[0].title, "Pizza"); assert.equal(song[0].lines.length, 4);
  }
  for (const l of ["de", "en"]) for (const h of A.HOOKS[l]) for (const s of h) assert.ok(C.isClean(s), s);
});
test("Antwort: nur 200 mit Inhalt ist Ergebnis, Kontingent und Filter sind eigene Faelle, alles andere ist sofort lokal", () => {
  assert.equal(A.verdict(200, { options: ["x"] }), "result");
  assert.equal(A.verdict(200, { options: [] }), "local");
  assert.equal(A.verdict(429, { error: "quota" }), "quota");
  assert.equal(A.verdict(429, { error: "busy" }), "local");
  assert.equal(A.verdict(429, { error: "daily-limit" }), "local");
  assert.equal(A.verdict(422, { error: "blocked" }), "blocked");
  assert.equal(A.verdict(503, { error: "llm-unavailable" }), "local");
  assert.equal(A.verdict(200, null), "local");
});
test("Keine Dark Patterns: kein Preis, kein Zeitdruck, kein Kaufknopf in den Texten", () => {
  const T = require("../src/texts.json");
  for (const l of ["de", "en"]) for (const k of Object.keys(T[l]).filter((x) => x.startsWith("ai"))) {
    assert.ok(!/€|\$|\d+[,.]\d\d|countdown|sofort|hurry|letzte chance|last chance|nur noch|läuft ab|expires/i.test(T[l][k]), k + ": " + T[l][k]);
  }
});
