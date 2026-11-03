"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../src/daily.js");
const T = require("../src/texts.json");
const day = new Date("2026-11-03T10:00:00Z");
const ALL = { crypto: true, channel: true, call: true }, NONE = { crypto: false, channel: false, call: false };
const names = Object.fromEntries(D.KINDS.map((k) => [k, [T.de[k], T.en[k]]]));
const ids = (q, c = ALL) => D.searchIdeas(q, day, names, c).map((h) => h.idea.id);

test("Suche: Gross-/Kleinschreibung und Umlaute zaehlen nicht", () => {
  assert.equal(D.fold("Rätsel"), "raetsel"); assert.equal(D.fold("SÜẞES"), D.fold("suesses")); assert.equal(D.fold("Gruppen-|Konferenz"), "gruppenkonferenz"); assert.equal(D.fold("Bau dein|Lava-Level"), "bau dein lava level");
  assert.ok(ids("geisterschicht").includes("spiel-geist"));
  assert.deepEqual(ids("konferenz"), ids("KONFERENZ"));
  assert.ok(ids("Konferenz").includes("plan-09") && ids("Konferenz").includes("plan-17"));
  assert.deepEqual(ids("Rätsel"), ids("raetsel")); assert.ok(ids("rätsel").length > 0);
  assert.deepEqual(ids("süß"), ids("suess")); assert.ok(ids("süß").includes("plan-18"));
  assert.ok(ids("flug").includes("flug-mond") && ids("flight").includes("flug-mond"), "Titel in beiden Sprachen");
});
test("Suche: Untertitel, Art und mehrere Woerter (alle muessen passen)", () => {
  assert.ok(ids("Schwerkraft").includes("spiel-mond"), "Untertitel");
  const game = ids("spiel");
  for (const i of D.IDEAS.filter((x) => x.kind === "game")) assert.ok(game.includes(i.id), "Art: " + i.id);
  assert.ok(ids("mit freunden").length > 0);
  assert.deepEqual(ids("flug mond").sort(), ids("mond flug").sort());
  assert.ok(ids("flug mond").every((id) => ids("flug").includes(id) && ids("mond").includes(id)));
});
test("Suche: leere Eingabe und Unbekanntes geben nichts", () => {
  assert.deepEqual(ids(""), []); assert.deepEqual(ids("   "), []); assert.deepEqual(ids("<>|"), []); assert.deepEqual(ids("xyzquatschwort"), []);
});
test("Suche: nicht verfuegbare Karten erscheinen nicht", () => {
  const gated = D.IDEAS.concat(D.GATED).filter((i) => (i.needs || []).length);
  assert.ok(gated.length > 0);
  for (const i of gated) {
    const q = i.de.t.replace("|", " ");
    assert.ok(!ids(q, NONE).includes(i.id), i.id);
    assert.ok(ids(q, ALL).includes(i.id), i.id);
  }
});
test("Suche: jede Karte aus ideas.json ist ueber ihren Titel findbar, neue Eintraege auch ueber tags", () => {
  for (const i of D.IDEAS.concat(D.GATED)) assert.ok(ids(i.de.t).includes(i.id), i.id);
  const neu = { id: "test-geld", kind: "turn", tags: ["PayPal", "Geld"], de: { t: "Geld|einsammeln", s: "Fürs Geschenk." }, en: { t: "Collect|money", s: "For the gift." } };
  D.IDEAS.push(neu);
  try {
    assert.deepEqual(ids("paypal").sort(), ["test-geld", "zug-sammeln"], "die echte Karte Geld einsammeln und der neue Eintrag");
    assert.ok(ids("collect money").includes("test-geld"));
    assert.equal(D.searchIdeas("paypal", day, names, ALL)[0].date, null, "noch nie dran gewesen: kein Datum");
  } finally { D.IDEAS.pop(); }
  assert.deepEqual(ids("paypal"), []);
});
test("Suche: Treffer tragen den letzten Tag, an dem die Karte dran war, neueste zuerst", () => {
  const hits = D.searchIdeas("flug", day, names, NONE), dated = hits.filter((h) => h.date);
  assert.ok(dated.length > 0);
  for (const h of dated) {
    assert.ok(D.dayNumber(h.date) < D.dayNumber(day));
    assert.equal(D.ideaForDay(h.date, NONE).id, h.idea.id);
  }
  for (let k = 1; k < hits.length; k++) assert.ok(!hits[k].date || (hits[k - 1].date && hits[k - 1].date >= hits[k].date));
  const yesterday = D.lastDays(day, 1)[0].idea;
  const own = D.searchIdeas(yesterday.de.t, day, names).find((h) => h.idea.id === yesterday.id);
  assert.equal(D.dayNumber(own.date), D.dayNumber(day) - 1);
});
