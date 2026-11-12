// Golden-Test Abreisskalender: neuer Code (src/ui/home/rotation.js) gegen den eingefrorenen alten Code
// (test/fixtures/home-golden.json, erzeugt von test/golden/gen-home.cjs aus dem Altclient, Tag pre-legacy-removal).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as R from "../src/ui/home/rotation.js";

const G = JSON.parse(fs.readFileSync(new URL("./fixtures/home-golden.json", import.meta.url), "utf8"));
const DAY = 86400000, START = Date.parse(G.start + "T00:00:00Z");

for (const [name, prof] of Object.entries(G.rotation)) {
  test("Rotation " + G.days + " Tage gleich dem Altcode: " + name, () => {
    const diff = [];
    for (let n = 0; n < G.days; n++) {
      const got = R.ideaForDay(new Date(START + n * DAY), prof.caps);
      if ((got && got.id) !== prof.ids[n]) diff.push(new Date(START + n * DAY).toISOString().slice(0, 10) + ": " + (got && got.id) + " statt " + prof.ids[n]);
    }
    assert.deepEqual(diff.slice(0, 10), [], diff.length + " Abweichungen");
  });
}
test("Rotation zweites Fenster 2031 gleich dem Altcode", () => {
  const s = Date.parse(G.far.start + "T00:00:00Z");
  assert.deepEqual(G.far.ids.map((_, n) => R.ideaForDay(new Date(s + n * DAY)).id), G.far.ids);
});
test("Rundenreihenfolgen gleich dem Altcode", () => {
  for (const r of G.rounds) assert.deepEqual(R.roundOrder(r.r).map((i) => i.id), r.ids, "Runde " + r.r);
});
test("Regeln: keine Wiederholung in der Runde, nie zweimal dieselbe Art, Kalenderkarten nur an ihren Tagen", () => {
  const n0 = R.dayNumber(START);
  for (let n = n0; n < n0 + G.days; n++) {
    const a = R.ideaOn(n), b = R.ideaOn(n + 1);
    assert.notEqual(R.mech(a), R.mech(b), R.dayKey(n) + " und folgender Tag: gleiche Art " + R.mech(a));
    if (a.on) assert.ok([].concat(a.on).includes(R.dayKey(n).slice(5)), a.id + " ausserhalb seiner Tage");
  }
  for (const r of [0, 1, 2]) { const ids = R.roundOrder(r).map((i) => i.id); assert.equal(new Set(ids).size, ids.length, "Runde " + r + " ohne Wiederholung"); assert.equal(ids.length, R.ROUND_SIZE); }
});
test("Letzte Tage und Suche gleich dem Altcode", () => {
  const at = new Date(Date.UTC(2026, 10, 11));
  assert.deepEqual(R.lastDays(at, 7).map((x) => ({ key: x.key, id: x.idea.id })), G.lastDays);
  for (const s of G.search) assert.deepEqual(R.searchIdeas(s.q, at).map((h) => ({ id: h.idea.id, d: h.date ? h.date.toISOString().slice(0, 10) : null })), s.hits, s.q);
});
test("Adventstuer-Nummer gleich dem Altcode", () => {
  for (const d of G.doors) assert.equal(R.doorNumber(new Date(d.d + "T12:00:00Z")), d.n, d.d);
});

import * as I from "../src/ui/home/intent.js";
import * as KAL from "../src/ui/home/kalender.js";
test("Ein Satz -> Absicht und Karten gleich dem Altcode (start.js understand)", () => {
  const at = new Date(Date.UTC(2026, 10, 11));
  for (const x of G.intents) {
    const r = I.understand(x.s, { date: at });
    assert.deepEqual({ intent: r.intent, name: r.name, who: r.who, top: r.top.map((t) => ({ id: t.idea.id, exact: t.exact })), missing: r.missing },
      { intent: x.intent, name: x.name, who: x.who, top: x.top, missing: x.missing }, x.s);
  }
});
test("Feiertage: bundesweit, je Land, Teilgebiet, fehlendes Jahr ehrlich null", () => {
  assert.equal(KAL.bundesweit("2026-12-25"), "1. Weihnachtstag");
  assert.equal(KAL.bundesweit("2026-11-01"), "");
  assert.equal(KAL.tag("2026-11-01", "BY").feiertag, "Allerheiligen");
  assert.equal(KAL.tag("2026-11-01", "HH").feiertag, "");
  assert.equal(KAL.tag("2026-06-04", "SN").feiertag, "", "nur in Teilen von Sachsen");
  assert.equal(KAL.tag("2029-01-01", "BY"), null);
  assert.equal(KAL.tag("2026-10-20", "BE").ferien, "Herbstferien");
  assert.equal(KAL.arbeitstage("2026-12-21", "2026-12-27", "BE"), 4, "Mo-Do, 25. Feiertag, Wochenende");
});
