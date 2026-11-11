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
  assert.ok(!/streak|weiterleit|forward|countdown|nur noch|only \d|beeil|hurry|\b(kauf\w*|buy|abo|abonnier\w*)\b/.test(all), "kein Druck, kein Kaufappell");
  const ui = fs.readFileSync(path.join(__dirname, "../src/create-ui.js"), "utf8");
  assert.ok(!/innerHTML|eval\(|new Function|localStorage|setInterval/.test(ui), "kein HTML aus Daten, kein Zaehler im Speicher");
  assert.ok(!/photo|foto|image/i.test((ui.match(/input: function \(\) \{[^\n]*/) || [""])[0]), "nur Text geht an den Server");
});

test("W3: jede Art hat Knopf und Beispiele in beiden Sprachen; die Vorschau nimmt nur Arten, die ein Link traegt", () => {
  for (const art of ["card", "meme", "game", "quiz", "faehigkeit"]) for (const l of ["de", "en"]) {
    assert.ok(TX[l]["create_art_" + art], l + " create_art_" + art);
    assert.equal((TX[l][art === "card" ? "create_ex" : "create_ex_" + art] || "").split("|").length, 3, l + " Beispiele " + art);
  }
  const ui = fs.readFileSync(path.join(__dirname, "../src/create-ui.js"), "utf8");
  assert.ok(!/arcade/.test(ui.match(/var KIND_OF = \{[^}]*\}/)[0]), "arcade nie");
});

test("W4: das Siegel einer freien Karte behaelt den Ersteller-Tag o, aber nur neben einem Siegel und nur in der richtigen Form", () => {
  const ki = { k: "karte", s: "s2.karte.abc." + "S".repeat(32), h: "H".repeat(43), o: "O".repeat(22) };
  assert.deepEqual(D.sanitizeKi(ki), ki);
  assert.equal(D.sanitizeKi({ k: "karte", o: "O".repeat(22) }).o, undefined, "ohne Siegel kein Tag");
  assert.equal(D.sanitizeKi({ ...ki, o: "<b>" }).o, undefined);
  assert.equal(D.sanitizeDoc({ k: "card", x: "Hi", ki }).ki.o, "O".repeat(22));
});

test("docUrl: bei einer freien Karte faellt der Hash h zuletzt weg, bei anderen Karten wie bisher zuerst", () => {
  const q = (i) => ["Frage " + i + " " + "ä".repeat(10), "Antwort " + "ö".repeat(30), "Falsch eins " + i, "Falsch zwei " + i, "Falsch drei " + i];
  const big = { k: "turn", g: "quiz", seed: 1, q: "", f: "bolt", t: "T".repeat(40), s: "S".repeat(70), by: [{ n: "Lea", w: ["text"] }], pk: { t: "Quiz", m: "l", q: [1, 2, 3, 4].map(q) } };
  assert.ok(D.sanitizeDoc(big).pk, "the pack is valid");
  const ki = { s: "s2.karte.abc." + "S".repeat(32), h: "H".repeat(43) };
  const dec = (u) => JSON.parse(Buffer.from(u.split("#c=")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")).d;
  const free = dec(D.docUrl({ ...big, ki: { k: "karte", ...ki } })), other = dec(D.docUrl({ ...big, ki: { k: "welt", ...ki } }));
  assert.equal(free.ki.h, ki.h, "Hash bleibt"); assert.equal(free.s, undefined, "dafuer faellt s"); assert.equal(other.ki.h, undefined, "andere Karten wie bisher");
});

test("Review: Vorschau-CSS steckt im Teil, nicht im Kern; falsche Art wird abgelehnt; Platzhalter ohne Namen", () => {
  const core = fs.readFileSync(path.join(__dirname, "../src/style.css"), "utf8"), ui = fs.readFileSync(path.join(__dirname, "../src/create-ui.js"), "utf8");
  assert.ok(!/\.createpv/.test(core), "kein .createpv im Kern"); assert.ok(/\.createpv\{/.test(ui), "im Teil");
  assert.match(ui, /!artOk\(state\.art, opt\.art\) \|\| !kindOk\(opt\.art, doc\)/);
  // the art may change only from game to lauf (the server's second engine for a runner wish), never anything else
  const artOk = new Function("return " + ui.match(/function artOk\(asked, art\) \{[^}]*\}/)[0])();
  assert.ok(artOk("game", "lauf") && artOk("card", "card")); assert.ok(!artOk("game", "card") && !artOk("lauf", "game") && !artOk("card", "lauf"));
  assert.ok(!/Lea|Sam\b/.test(TX.de.create_ph + TX.en.create_ph));
  assert.ok(TX.de.create_bad && TX.en.create_bad);
});

test("KI-Zeichen im Spiel: der Spielzustand traegt ki.k karte wie welt, eine fremde Art faellt weg; eine Karte als Spiel nimmt es mit", () => {
  const C = require("../src/core.js");
  const P = require("../src/playable.js");
  const base = { v: 1, seed: 7, params: { gravity: 1800, jump: 430, gap: 140, speed: 130 }, theme: "day", title: "Tiefsee", emoji: "🐠" };
  const s = "s1.karte.abc.defgh";
  assert.deepEqual(C.sanitizeState({ ...base, ki: { k: "karte", s } }).ki, { k: "karte", s });
  assert.deepEqual(C.sanitizeState({ ...base, ki: { k: "welt", s } }).ki, { k: "welt", s });
  assert.equal(C.sanitizeState({ ...base, ki: { k: "fremd", s } }).ki, undefined);
  assert.equal(C.sanitizeState({ ...base, ki: { k: "karte" } }).ki, undefined, "ohne Siegel kein Zeichen");
  const doc = { k: "card", x: "Hallo Welt", col: ["#111111", "#ffd400"], ki: { k: "karte", s } };
  assert.deepEqual(P.fromDoc(doc, { emoji: "🙂" }).ki, { k: "karte", s });
  assert.equal(P.fromDoc({ ...doc, ki: undefined }, { emoji: "🙂" }).ki, undefined);
});
