// Golden-Test Abreisskalender: neuer Code (src/ui/home/rotation.js) gegen den eingefrorenen alten Code
// (test/fixtures/home-golden.json, erzeugt von test/golden/gen-home.cjs aus dem Altclient, Tag pre-legacy-removal).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as R from "../src/ui/home/rotation.js";
import { searchIdeas } from "../src/ui/home/search.js";

const G = JSON.parse(fs.readFileSync(new URL("./fixtures/home-golden.json", import.meta.url), "utf8"));
const DAY = 86400000, START = Date.parse(G.start + "T00:00:00Z");

// Seit 17.11.2026 weicht die Rotation bewusst vom Altcode ab: keine Karte zweimal innerhalb von 14 Tagen (R.WINDOW).
// Erlaubt sind Abweichungen nur dort, wo der Altcode eine Wiederholung zeigte, wo er ohnehin einen Ersatz waehlte, oder
// als Folge davon am Folgetag (Art des Vortags). Jeder andere Tag bleibt gleich dem Altcode.
const baseOf = (n) => { const len = R.ROUND_SIZE; return R.roundOrder(Math.floor(n / len))[((n % len) + len) % len].id; };
function explained(old, n0, i, changed, caps = R.WEB_CAPS) {
  const rep = [...Array(R.WINDOW).keys()].some((k) => old[i - k - 1] === old[i] || old[i + k + 1] === old[i] || R.ideaOn(n0 + i - k - 1, caps).id === old[i]);
  return rep || (old[i] !== baseOf(n0 + i) && !R.calendarIdea(n0 + i)) || changed.has(i - 1);
}
for (const [name, prof] of Object.entries(G.rotation)) {
  test("Rotation " + G.days + " Tage: gleich dem Altcode ausser erklaerten Abweichungen (keine Wiederholung): " + name, () => {
    const n0 = R.dayNumber(START), changed = new Set(), bad = [];
    for (let i = 0; i < G.days; i++) {
      const got = R.ideaOn(n0 + i, prof.caps);
      if ((got && got.id) === prof.ids[i]) continue;
      changed.add(i);
      if (!explained(prof.ids, n0, i, changed, prof.caps)) bad.push(R.dayKey(n0 + i) + ": " + (got && got.id) + " statt " + prof.ids[i]);
    }
    assert.deepEqual(bad, []);
    assert.ok(changed.size < G.days * 0.12, changed.size + " Tage geaendert");
  });
}
test("Keine Karte zweimal innerhalb von 14 Tagen, nie zweimal dieselbe Art, 10 Jahre, alle Geraeteprofile (User 17.11.)", () => {
  const n0 = R.dayNumber(START);
  for (const caps of [R.WEB_CAPS, { crypto: true, channel: true, call: true }, { crypto: true, channel: true, call: false }, ...Object.values(G.rotation).map((p) => p.caps)]) {
    const dup = [];
    for (let n = n0; n < n0 + 3650; n++) {
      const a = R.ideaOn(n, caps);
      assert.ok(a, R.dayKey(n) + " ohne Karte");
      for (let k = 1; k <= R.WINDOW && n - k >= n0; k++) if (R.ideaOn(n - k, caps).id === a.id) dup.push(R.dayKey(n) + " " + a.id + " wie vor " + k + " Tagen");
      if (n > n0) assert.notEqual(R.mech(R.ideaOn(n - 1, caps)), R.mech(a), R.dayKey(n) + " gleiche Art wie Vortag");
    }
    assert.deepEqual(dup.slice(0, 5), [], dup.length + " Wiederholungen " + JSON.stringify(caps));
  }
  // der gemeldete Fall: Woche bis 17.11.2026 zeigte „Stangen Kick“ dreimal
  const wk = R.lastDays(new Date(Date.UTC(2026, 10, 17)), 6).map((x) => x.idea.id);
  assert.equal(new Set(wk).size, 6, wk.join(","));
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
  // Letzte Tage zeigen genau die Blaetter des Kalenders (seit 17.11. ohne Wiederholung, daher nicht mehr gleich dem Altcode)
  assert.deepEqual(R.lastDays(at, 7).map((x) => ({ key: x.key, id: x.idea.id })), G.lastDays.map((x) => ({ key: x.key, id: R.ideaOn(R.dayNumber(new Date(x.key))).id })));
  // Suche: dieselben Karten wie im Altcode; ein Datum ist immer ein Tag, an dem genau diese Karte im Kalender stand
  for (const s of G.search) {
    const hits = searchIdeas(s.q, at).map((h) => ({ id: h.idea.id, d: h.date ? h.date.toISOString().slice(0, 10) : null }));
    for (const h of hits) if (h.d) assert.equal(R.ideaOn(R.dayNumber(new Date(h.d))).id, h.id, s.q + " " + h.d);
    for (const g of s.hits) assert.ok(hits.some((h) => h.id === g.id), s.q + ": " + g.id + " fehlt");
  }
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

import { bundesweit } from "../src/ui/home/feiertage.js";
test("Feiertage im Kern (Auszug) gleich kalender.json fuer jeden Tag 2026-2028, beide Sprachen", () => {
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2029, 0, 1); t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    for (const l of ["de", "en"]) assert.equal(bundesweit(d, l), KAL.bundesweit(d, l), d + " " + l);
  }
});
