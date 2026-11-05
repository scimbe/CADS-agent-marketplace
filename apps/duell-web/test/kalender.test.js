"use strict";
// Part "daten" (src/kalender.js + src/kalender.json): public holidays per Land 2026-2028, school holidays 2026/27.
const test = require("node:test");
const assert = require("node:assert/strict");
const K = require("../src/kalender.js");
const data = require("../src/kalender.json");
const gen = require("../scripts/kalender-daten.js");

test("Datei = Skript (node scripts/kalender-daten.js), Quelle und Lizenzhinweis stehen drin", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(gen.build())), data);
  for (const k of ["feiertage", "ferien", "lizenz"]) assert.ok(data.quelle[k] && data.quelle[k].length > 20, k);
  assert.match(data.quelle.ferien, /kmk\.org/);
  assert.equal(Object.keys(K.laender()).length, 16);
  assert.deepEqual(K.jahre(), [2026, 2027, 2028]); assert.deepEqual(K.schuljahre(), ["2026/27"]);
});
test("Ostern (Gauss) und bewegliche Feiertage stimmen mit festen Daten", () => {
  assert.deepEqual([2026, 2027, 2028].map((y) => new Date(gen.easter(y)).toISOString().slice(0, 10)), ["2026-04-05", "2027-03-28", "2028-04-16"]);
  const d = (l, y, k) => K.feiertage(l, y, "de").filter((h) => h.k === k).map((h) => h.d)[0];
  assert.equal(d("BY", "2026", "karfreitag"), "2026-04-03"); assert.equal(d("NW", "2027", "himmelfahrt"), "2027-05-06");
  assert.equal(d("HE", "2028", "fronleichnam"), "2028-06-15"); assert.equal(d("SN", "2026", "busstag"), "2026-11-18");
  assert.equal(d("SN", "2027", "busstag"), "2027-11-17"); assert.equal(d("SN", "2028", "busstag"), "2028-11-22");
  assert.equal(d("BB", "2027", "pfingstsonntag"), "2027-05-16");
});
test("Feiertage je Land: Anzahl ganzes Land 2026 und Besonderheiten", () => {
  const n = (l, y) => K.feiertage(l, y, "de").filter((h) => !h.teil).length;
  // 9 everywhere; BW/BY/NW/RP/SL Allerheiligen ...; the counts as in the Laender laws for 2026
  assert.deepEqual(Object.fromEntries(Object.keys(K.laender()).map((l) => [l, n(l, "2026")])),
    { BW: 12, BY: 12, BE: 10, BB: 12, HB: 10, HH: 10, HE: 10, MV: 11, NI: 10, NW: 11, RP: 11, SL: 12, SN: 11, ST: 11, SH: 10, TH: 11 });
  assert.ok(K.feiertage("BE", "2028", "de").some((h) => h.d === "2028-06-17"), "Berlin 17.06.2028 einmalig");
  assert.ok(!K.feiertage("BE", "2027", "de").some((h) => h.d.endsWith("06-17")));
  const by = K.feiertage("BY", "2026", "en").find((h) => h.k === "mariae");
  assert.deepEqual([by.teil, by.name], [true, "Assumption Day"], "Mariä Himmelfahrt in Bayern nur teilweise");
  assert.equal(K.feiertage("XX", "2026", "de"), null); assert.equal(K.feiertage("BY", "2031", "de"), null);
});
test("Ferien 2026/27 laut KMK: Stichproben, jede Spanne geordnet und im Schuljahr", () => {
  assert.deepEqual(K.ferien("NW", "2026/27", "de").map((r) => r.von + ".." + r.bis + " " + r.k),
    ["2026-10-17..2026-10-31 herbst", "2026-12-23..2027-01-06 weihnachten", "2027-03-22..2027-04-03 ostern", "2027-05-18..2027-05-18 pfingsten", "2027-07-19..2027-08-31 sommer"]);
  assert.equal(K.ferien("BY", "2026/27", "en").find((r) => r.k === "sommer").bis, "2027-09-13");
  for (const l of Object.keys(K.laender())) {
    const f = K.ferien(l, "2026/27", "de");
    assert.ok(f.some((r) => r.k === "sommer") && f.some((r) => r.k === "weihnachten"), l);
    f.forEach((r, i) => { assert.ok(r.von <= r.bis && r.von >= "2026-08-01" && r.bis <= "2027-09-30", l + " " + r.von); if (i) assert.ok(f[i - 1].bis < r.von, l + " geordnet"); });
  }
  assert.equal(K.ferien("NW", "2027/28", "de"), null);
});
test("Ein Tag und Arbeitstage: Feiertag, Ferien, Wochenende; unbekanntes Jahr ist null (Karte zeigt 'Daten fehlen')", () => {
  assert.deepEqual(K.tag("2026-10-03", "HE", "de"), { feiertag: "Tag der Deutschen Einheit", ferien: "", wochenende: true });
  assert.deepEqual(K.tag("2026-10-30", "BE", "de"), { feiertag: "", ferien: "Herbstferien", wochenende: false });
  assert.deepEqual(K.tag("2026-12-28", "HH", "en"), { feiertag: "", ferien: "Christmas holidays", wochenende: false });
  assert.equal(K.tag("2026-08-15", "BY", "de").feiertag, "", "nur teilweise -> kein Feiertag fuer das ganze Land");
  assert.equal(K.arbeitstage("2026-12-21", "2027-01-08", "NW"), 13);   // 15 weekdays minus 25.12. and 01.01. (26.12. is a Saturday)
  assert.equal(K.arbeitstage("2026-12-21", "2027-01-08", "BY"), 12, "Bayern zusaetzlich Heilige Drei Koenige");
  assert.equal(K.tag("2031-01-01", "BY", "de"), null); assert.equal(K.tag("2026-13-01", "BY", "de"), null);
  assert.equal(K.arbeitstage("2028-12-28", "2029-01-03", "BY"), null);
});
