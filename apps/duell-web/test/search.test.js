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
test("Suche: Einkaufszettel ueber deutsche und englische Woerter und Tags", () => {
  for (const q of ["einkauf", "Einkaufszettel", "EINKAUFSLISTE", "shopping", "shopping list", "liste", "mitbringen", "WG"]) assert.ok(ids(q).includes("zug-einkauf"), q);
  assert.deepEqual(ids("einkaufszettel"), ["zug-einkauf"]);
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
    assert.equal(D.searchIdeas("paypal", day, names, ALL).find((h) => h.idea.id === "test-geld").date, null, "noch nie dran gewesen: kein Datum");
  } finally { D.IDEAS.pop(); }
  assert.deepEqual(ids("paypal"), ["zug-sammeln"]);
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
test("Suche: Fuellwoerter wie fuer/mit/for muessen nicht auf der Karte stehen, allein bleiben sie Suchwort", () => {
  assert.deepEqual(ids("Geld für PayPal"), ids("geld paypal"));
  assert.deepEqual(ids("game for the moon"), ids("game moon"));
  assert.ok(ids("mit").length > 0, "nur Fuellwort: wird normal gesucht");
});
test("Tags: Filter fuer die KI-Vorschlaege (Wortliste, Jugendschutz, Marken, Laenge, doppelt)", () => {
  const Tg = require("../scripts/tags.js");
  for (const bad of ["Bier", "Trinkspiel", "casino abend", "Dating", "hurensohn", "TikTok", "Spaß", "fun", "a", "vier wörter sind zu viel", "x".repeat(29)]) assert.equal(Tg.cleanTag(bad), "", bad);
  for (const ok of ["Geschenk für Oma", "Weinen", "schwein", "Mathe lernen!"]) assert.ok(Tg.cleanTag(ok), ok);
  const idea = { id: "x", kind: "turn", tags: ["wg"], de: { t: "Geld|einsammeln", s: "Fürs Geschenk." }, en: { t: "Collect|money", s: "For the gift." } };
  assert.deepEqual(Tg.filterTags(idea, { de: ["geburtstag", "Geburtstagsfeier", "geschenk", "WG", "oma", "bier"], en: ["birthday", "money", "flatmates"] }),
    ["wg", "geburtstagsfeier", "oma", "birthday", "flatmates"], "bestehende zuerst, dann in Reihenfolge; im Titel, in einem laengeren Tag oder doppelt: raus");
});
test("Tags: fast jede Karte hat mindestens 5, keine mehr als 30; alle sauber, kurz, keine doppelt", () => {
  const Tg = require("../scripts/tags.js"), biz = require("../src/flavors/business/ideas.json"), all = D.IDEAS.concat(D.GATED, biz.ideas);
  // A card that another branch adds gets its tags in the next nightly run; until then it is found by title.
  assert.ok(all.filter((i) => (i.tags || []).length >= 5).length >= all.length * 0.9);
  for (const i of all) {
    const tags = i.tags || [];
    assert.ok(tags.length <= 30, i.id);
    assert.equal(new Set(tags.map(D.fold)).size, tags.length, i.id);
    for (const t of tags) assert.equal(Tg.cleanTag(t), t, i.id + ": " + t);
  }
});
// The cards a person means, not the words on them: each query is only found through the tags (checked without them).
const EVERYDAY = [["Geschenk für Oma", "zug-gutschein"], ["Mathe lernen", "zug-abfragen"], ["Grillabend", "zug-einkauf"], ["Geburtstag", "zug-kerzen"],
  ["Klassenfahrt", "raum-erklaeren"], ["Weihnachten", "zug-wichteln"], ["krank", "warm-besserung"], ["Bewerbung", "warm-daumen"], ["Versöhnung", "raum-sorry"],
  ["Fernbeziehung", "zug-umschlag"], ["Regentag", "raum-finger"], ["birthday party", "zug-kerzen"]];
const OFFICE = [["Teammeeting", "biz-agenda"], ["Abschied", "biz-sammeln-geschenk"], ["Mittagessen", "biz-umfrage-lunch"]];
function withoutTags(list, fn) {
  const saved = list.map((i) => i.tags);
  list.forEach((i) => delete i.tags);
  try { return fn(); } finally { list.forEach((i, k) => { if (saved[k]) i.tags = saved[k]; }); }
}
test("Suche: 15 Alltagsanfragen finden die passende Karte, und zwar ueber die Tags", () => {
  assert.equal(EVERYDAY.length + OFFICE.length, 15);
  for (const [q, id] of EVERYDAY) {
    assert.ok(ids(q).includes(id), q + " -> " + id);
    assert.ok(!withoutTags(D.IDEAS, () => ids(q)).includes(id), q + ": ohne Tags nicht gefunden");
  }
  const biz = require("../src/flavors/business/ideas.json").ideas, saved = D.IDEAS.splice(0, D.IDEAS.length, ...biz);
  try {
    for (const [q, id] of OFFICE) {
      assert.ok(ids(q).includes(id), "Business: " + q + " -> " + id);
      assert.ok(!withoutTags(D.IDEAS, () => ids(q)).includes(id), q + ": ohne Tags nicht gefunden");
    }
  } finally { D.IDEAS.splice(0, D.IDEAS.length, ...saved); }
  assert.equal(D.IDEAS.length, saved.length);
});
