"use strict";
// Languages as data (i18n #3, #4, #5, #6, #11): numbers, plurals, money and dates follow the language, and a further
// language is one more block of data that falls back to German wherever it has no text yet.
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core.js");
const Tn = require("../src/turns.js");
require("../src/office.js");
const P = require("../src/protokoll.js");
const DATA = require("../src/turn.json");
const TEXTS = require("../src/texts.json");

test("Zahlen und Geld: Komma in de, Punkt in en, Euro vor dem Betrag in en", () => {
  assert.equal(C.num(1.234, 2, "de"), "1,23"); assert.equal(C.num(1.234, 2, "en"), "1.23");
  assert.equal(C.num(2.5, null, "de"), "2,5"); assert.equal(C.num(12000, 1, "de"), "12000,0", "keine Tausenderpunkte in Sekunden");
  assert.equal(C.money(500, "de"), "5 €"); assert.equal(C.money(500, "en"), "€5");
  assert.equal(C.money(11000, "de"), "110 €"); assert.equal(C.money(937, "de"), "9,37 €"); assert.equal(C.money(937, "en"), "€9.37");
  assert.equal(Tn.moneyLine(3000, 3, "en"), "€30 split by 3 · €10 per person");
});

test("Plural ueber Intl.PluralRules: 1 Stimme, 2 Stimmen; fehlt die Form, gilt der Grundtext", () => {
  const de = Tn.T("de"), en = Tn.T("en"), f = (b, k, n, l) => C.form(b, k, n, l).replace("{n}", n);
  assert.equal(f(de, "off_count", 1, "de"), "1 Stimme bisher"); assert.equal(f(de, "off_count", 2, "de"), "2 Stimmen bisher");
  assert.equal(f(en, "off_count", 1, "en"), "1 vote so far"); assert.equal(f(en, "off_count", 0, "en"), "0 votes so far");
  assert.equal(f(de, "blk_score", 1, "de"), "1 Punkt"); assert.equal(f(en, "left", 1, "en"), "1 coin left");
  assert.equal(C.form(de, "sec", 1, "de"), de.sec, "ohne _one bleibt der Text");
  assert.equal(C.plural("uk", 3), "few", "Sprachen mit mehr Formen bekommen ihre Kategorie");
  for (const l of ["de", "en"]) {
    assert.match(TEXTS[l].cc_wrong_one, /\{n\}/); assert.match(TEXTS[l].cc_wrong, /\{n\}/);
    for (const k of ["lang_to", "lang_pick", "rotate"]) assert.ok(TEXTS[l][k], l + " " + k);
  }
});

test("Datum: EN liest 5/11 wie die Anzeige (en-GB) als 5. November, eindeutiges 11/14 bleibt der 14.", () => {
  const at = new Date(2026, 10, 4, 10).getTime(), iso = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
  assert.equal(iso(P.dueDay("by 5/11", at, "en")), "2026-11-05");
  assert.equal(iso(P.dueDay("by 11/14", at, "en")), "2026-11-14");
  assert.equal(iso(P.dueDay("bis 5.11.", at, "de")), "2026-11-05");
});

test("Dritte Sprache als reine Daten: eigener Block, Luecken aus Deutsch, eigene Spalte in Wortpaaren", () => {
  assert.deepEqual(C.langsOf(TEXTS), ["de", "en"]); assert.deepEqual(C.langsOf(DATA.text), ["de", "en"]);
  DATA.text.tr = { wet_done: "Tamam!" };          // what adding Turkish to turn.json would be: a block, nothing in the code
  try {
    const tr = Tn.T("tr");
    assert.equal(tr.wet_done, "Tamam!");
    assert.equal(tr.wet_fail, Tn.T("de").wet_fail, "noch nicht uebersetzt: Deutsch");
    assert.equal(C.column(DATA.text, "tr"), 2);
    assert.equal(C.pick("Ja|Yes|Evet", C.column(DATA.text, "tr")), "Evet");
    assert.equal(C.pick("Ja|Yes", C.column(DATA.text, "tr")), "Ja", "ein Paar ohne dritte Spalte: Deutsch");
    assert.equal(C.locale("tr"), "tr"); assert.match(C.money(500, "tr"), /^€5$|^5 €$/, "Geld ueber Intl, ohne Code fuer die Sprache");
  } finally { delete DATA.text.tr; }
  assert.equal(Tn.T("xx"), Tn.T("de"), "unbekannte Sprache: Deutsch");
});
