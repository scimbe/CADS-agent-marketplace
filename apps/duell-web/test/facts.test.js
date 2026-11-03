"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../src/daily.js");
const F = require("../src/facts.js");
const W = require("../src/wish.js");
const me = D.sanitizeProfile({ nick: "Mira", emoji: "🐙", colors: ["#2b4bff", "#ffe600"], set: "essen" });
const API = D.IDEAS.filter((i) => i.api);
const GAME = ["quiz", "hauptstadt", "waermste", "tiere", "band", "geld", "strom", "liga"];
const PAIRS = [["#ffd400", "#ff3b1d"], ["#2b4bff", "#ffe600"]];

test("Katalog: 14 Datenkarten, jede mit Quelle, DE und EN, Knopf, Kalendertag im Januar, nie zwei Tage nacheinander", () => {
  assert.equal(API.length, 14);
  assert.deepEqual(API.map((i) => i.api).sort(), Object.keys(F.SRC).sort(), "jede Quelle genau eine Karte");
  for (const i of API) {
    assert.equal(i.kind, "card", i.id);
    for (const L of [i.de, i.en]) { assert.ok(L.t.includes("|") && L.s && L.go && L.go.length <= 16 && L.lines.length, i.id); assert.ok(L.s.length <= 45, i.id + " Untertitel"); }
    assert.match(i.on, /^01-\d\d$/, i.id);
    assert.ok(F.SRC[i.api].c.length <= 60, i.id);
    assert.ok(D.ideaStrings(i).every((s) => !/agent/i.test(s)), "Bot statt Agent");
  }
  const days = API.map((i) => Number(i.on.slice(3))).sort((a, b) => a - b);
  for (let k = 1; k < days.length; k++) assert.ok(days[k] - days[k - 1] >= 2, "dazwischen liegt immer ein anderes Blatt");
});
test("Kalender: Spiele und Mitteil-Karten wechseln sich ab, am Tag steht genau die Datenkarte", () => {
  const order = API.slice().sort((a, b) => a.on.localeCompare(b.on));
  let swaps = 0;
  for (let k = 1; k < order.length; k++) if (GAME.includes(order[k].api) !== GAME.includes(order[k - 1].api)) swaps++;
  assert.ok(swaps >= 11, "abwechselnd bis auf das Ende: " + swaps);
  for (const i of API) {
    const day = new Date(Date.UTC(2027, 0, Number(i.on.slice(3)))), got = D.ideaForDay(day, { crypto: true });
    assert.equal(got.id, i.id);
    for (const n of [-1, 1]) assert.notEqual(D.ideaForDay(new Date(day.getTime() + n * 86400000), { crypto: true }).kind, "card", "Nachbartag ist keine Karte");
  }
});
test("Streifen: nur bekannte Quelle, gueltiges Datum, kurze saubere Zeile; Quelle kommt nie aus dem Link", () => {
  const d = D.sanitizeDoc({ k: "card", x: "Hallo", api: { a: "liga", d: "2027-01-13", v: "1. FC Beispiel · 30 Punkte", src: "gefaelscht" } });
  assert.deepEqual(d.api, { a: "liga", d: "2027-01-13", v: "1. FC Beispiel · 30 Punkte" });
  assert.equal(F.credit(d.api), "OpenLigaDB.de · ODbL");
  for (const bad of [{ a: "nope", d: "2027-01-13" }, { a: "__proto__", d: "2027-01-13" }, { a: "liga", d: "morgen" }, null, "liga"]) assert.equal(D.sanitizeDoc({ k: "card", api: bad }).api, undefined, JSON.stringify(bad));
  assert.equal(D.sanitizeDoc({ k: "card", api: { a: "liga", d: "2027-01-13", v: "x".repeat(200) } }).api.v.length, 60);
  assert.equal(D.sanitizeDoc({ k: "card", api: { a: "liga", d: "2027-01-13", v: "fuck" } }).api.v, undefined, "Filter wirkt");
  const both = D.sanitizeDoc({ k: "card", api: { a: "beben", d: "2027-01-15" }, w: { p: "Hamburg", d: "2027-01-15", hi: 3, lo: 1 } });
  assert.equal(both.w, undefined, "Datenkarte zeigt kein Wetter darunter");
  assert.equal(D.sanitizeDoc({ k: "photo", api: { a: "liga", d: "2027-01-13" } }).api, undefined, "nur Karten tragen einen Streifen");
});
test("Wunsch und Link: die KI kann den Streifen nicht aendern, der Link traegt ihn mit", () => {
  const d = D.sanitizeDoc({ k: "card", x: "Hallo", col: PAIRS[0], api: { a: "strom", d: "2027-01-29", v: "✓ 61 % erneuerbar" } });
  const n = W.apply(d, { x: "Neu", api: { a: "quiz", v: "erfunden" }, v: "erfunden" }, PAIRS, () => 0.5);
  assert.deepEqual(n.api, d.api); assert.equal(n.x, "Neu");
  const r = D.parseRoute(D.docUrl(d).split("#")[1]);
  assert.deepEqual(r.doc.api, d.api);
  assert.deepEqual(D.changedAreas(D.sanitizeDoc({ k: "card", x: "Hallo", col: PAIRS[0] }), d), ["text"]);
});
test("Antwort des Servers: nur vollstaendige Antworten zaehlen, sonst ehrliche Meldung", () => {
  assert.equal(F.verdict(200, { api: "liga", h: "Wer?", c: ["A", "B"], a: 1 }, "liga"), "ok");
  assert.equal(F.verdict(200, { api: "beben", h: "Stärke 5,4" }, "beben"), "ok");
  assert.equal(F.verdict(200, { api: "liga", h: "Wer?", c: ["A"], a: 0 }, "liga"), "fail");
  assert.equal(F.verdict(200, { api: "liga", h: "Wer?", c: ["A", "B"], a: 5 }, "liga"), "fail");
  assert.equal(F.verdict(200, { api: "quiz", h: "x" }, "liga"), "fail", "Antwort fuer eine andere Karte");
  assert.equal(F.verdict(200, { api: "liga", h: "" }, "liga"), "fail");
  assert.deepEqual([404, 422, 429, 503, 500].map((s) => F.verdict(s, {}, "liga")), ["none", "blocked", "busy", "fail", "fail"]);
});
test("Ein Versuch: richtig oder falsch, der Streifen zeigt immer die echte Loesung", () => {
  const j = { c: ["Köln", "Hamburg", "Kiel"], a: 1, r: "Hamburg 9,3 °C · Stand 11:30" };
  assert.deepEqual(F.answer(j, 1), { right: true, v: "✓ Hamburg 9,3 °C · Stand 11:30" });
  assert.deepEqual(F.answer(j, 0), { right: false, v: "✗ Hamburg 9,3 °C · Stand 11:30" });
  assert.equal(F.answer({ c: ["Lima", "Quito"], a: 0 }, 1).v, "✗ Lima");
  assert.equal(F.label(["cola", "Cola", "Cola"], "en"), "Cola"); assert.equal(F.label(["HH", "Hamburg"], "en"), "Hamburg");
});
test("Docs: eine Datenkarte startet mit ihrem Platzhalter und ohne Streifen", () => {
  for (const i of API) { const d = D.docFromIdea(i, me, "de"); assert.equal(d.x, i.de.lines[0]); assert.equal(d.api, undefined); }
});
