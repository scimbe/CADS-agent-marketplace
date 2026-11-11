"use strict";
// Catalog validator (Katalog v2, W0 point 4): the checks of the card plan's generator (karten99/gen/katalog-v2-build.js),
// run on the catalogs the app really ships (src/ideas.json and src/flavors/business/ideas.json). A new card that breaks a
// rule fails here before it reaches a calendar. Each rule is also shown to catch a broken catalog (the mutations below).
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../src/daily.js");
const DAILY = require("../src/ideas.json"), BIZ = require("../src/flavors/business/ideas.json");

// Days without any card (remembrance days). 27.01.: Holocaust-Gedenktag, no card at all (bestand.md, katalog-v2).
const GEDENK = { "01-27": "Holocaust-Gedenktag" };
// The season the calendar plans for: a day MM-DD before July lies in 2027, from July on in 2026 (like the generator).
const year = (mmdd) => (mmdd < "07" ? 2027 : 2026);
const date = (mmdd, d) => new Date(Date.UTC(year(mmdd), +mmdd.slice(0, 2) - 1, +mmdd.slice(3) + (d || 0)));
const md = (t) => String(t.getUTCMonth() + 1).padStart(2, "0") + "-" + String(t.getUTCDate()).padStart(2, "0");
const plain = (s) => String(s || "").replace(/-?\|/g, (m) => (m === "|" ? " " : "")).replace(/­/g, "").trim();
const MAX_TITLE = 28;
// Titles the shipped catalog already shares between two kinds of the same idea (a duel and its turn version and so on).
// Frozen: a new pair fails. Folded like the search (daily.js fold).
const SAME_TITLE = new Set(["de:urkunde fuer nix", "de:sei unberechenbar", "en:be unpredictable", "en:agent battle rap", "de:auktion um quatsch",
  "de:letzte socke unterm hammer", "en:last sock under the hammer", "de:kennst du mich wirklich", "en:do you really know me", "de:stimmenraetsel", "en:voice riddle"]);

// Same shape on both sides: every key, every list as long, every text filled; ids and kinds stay the same.
function sameShape(a, b, at, out) {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return out.push(at + ": Liste de/en ungleich lang");
    return a.forEach((x, i) => sameShape(x, b[i], at + "[" + i + "]", out));
  }
  if (a && typeof a === "object") {
    if (!b || typeof b !== "object") return out.push(at + ": fehlt in en");
    const ka = Object.keys(a).sort().join(), kb = Object.keys(b).sort().join();
    if (ka !== kb) return out.push(at + ": Felder de [" + ka + "] / en [" + kb + "]");
    return Object.keys(a).forEach((k) => sameShape(a[k], b[k], at + "." + k, out));
  }
  if (typeof a === "string" && (!a.trim() || typeof b !== "string" || !b.trim())) out.push(at + ": leerer Text");
}

function pruefe(cat, flavor) {
  const f = [], all = cat.ideas.concat(cat.gated || []);
  // ids: unique, link-safe (daily.js ID_RE)
  const ids = all.map((i) => i.id);
  ids.forEach((id, k) => { if (ids.indexOf(id) !== k) f.push("id doppelt: " + id); if (!/^[a-z0-9-]{1,32}$/.test(id)) f.push("id ungueltig: " + id); });
  all.forEach((i) => {
    if (!i.kind) f.push(i.id + ": ohne kind");
    for (const l of ["de", "en"]) {
      if (!i[l] || !plain(i[l].t) || !String(i[l].s || "").trim()) { f.push(i.id + ": " + l + " ohne Titel oder Unterzeile"); continue; }
      const t = plain(i[l].t);
      if (t.length > MAX_TITLE) f.push(i.id + ": Titel > " + MAX_TITLE + " Zeichen (" + l + ", " + t.length + "): " + t);
    }
    if (i.de && i.en) sameShape(i.de, i.en, i.id, f);
  });
  // titles unique per language (folded); the frozen pairs above excepted
  for (const l of ["de", "en"]) {
    const seen = {};
    all.forEach((i) => { const k = l + ":" + D.fold(i[l] && i[l].t); if (seen[k] && !SAME_TITLE.has(k)) f.push("Titel doppelt (" + l + "): " + seen[k] + " / " + i.id); seen[k] = seen[k] || i.id; });
  }
  // calendar days: valid, unique, never a remembrance day, never next to a day of the same kind
  const on = {};
  cat.ideas.forEach((i) => [].concat(i.on || []).forEach((d) => {
    if (!/^\d{2}-\d{2}$/.test(d) || md(date(d)) !== d) return f.push(i.id + ": Kalendertag ungueltig " + d);
    if (on[d]) f.push("Kalendertag doppelt " + d + ": " + on[d].id + " / " + i.id);
    on[d] = on[d] || i;
    if (GEDENK[d]) f.push(i.id + ": " + d + " ist " + GEDENK[d] + " (frei)");
  }));
  if ((cat.gated || []).some((i) => i.on)) f.push("eine Bonus-Karte (gated) mit Kalendertag");
  Object.keys(on).forEach((d) => { const n = md(date(d, 1)); if (on[n] && on[n].kind === on[d].kind) f.push("Nachbarregel " + d + " " + on[d].id + " / " + n + " " + on[n].id + " (" + on[d].kind + ")"); });
  // business: never on a Saturday or Sunday of the planned season
  if (flavor === "business") Object.keys(on).forEach((d) => { const w = date(d).getUTCDay(); if (w === 0 || w === 6) f.push("Business am Wochenende " + d + " " + on[d].id); });
  return f;
}
const clone = (x) => JSON.parse(JSON.stringify(x));

test("Katalog daily: ids/Titel eindeutig, de/en vollstaendig, Kalendertage eindeutig, Nachbarregel, Titel <= 28, Gedenktage frei", () => {
  assert.deepEqual(pruefe(DAILY, "daily"), []);
  // Katalogzaehlung nach der Regal-Bereinigung (2026-11, konzept2: 209 -> 74 = 65 daily + 8 business + die freie Karte)
  assert.equal(DAILY.ideas.length + (DAILY.gated || []).length, 66, "der echte Katalog wurde geprueft (duell-liest geparkt; 2026-11: + 2 Werkzeuge, Notizzettel und Datei rueber)");
  assert.equal(BIZ.ideas.length + (BIZ.gated || []).length, 8);
  assert.ok(DAILY.ideas.filter((i) => i.on).length >= 20);
});
test("Katalog: entfernte Karten (retired, gone) sind nicht im Regal und ohne Kalendertag, jeder Traeger ist im Regal", () => {
  const daily = new Set(DAILY.ideas.concat(DAILY.gated || []).map((i) => i.id));
  for (const c of [DAILY, BIZ]) {
    const ids = new Set(c.ideas.concat(c.gated || []).map((i) => i.id));
    for (const i of c.retired || []) {
      assert.ok(!ids.has(i.id), i.id + " noch im Regal"); assert.equal(i.on, undefined, i.id + " hat noch einen Kalendertag");
      // a parked card (round: its place in the day's round, until it is rebuilt) has no carrier; a carrier may be parked
      if (i.round >= 0) { assert.equal(i.to, undefined, i.id); continue; }
      assert.ok(ids.has(i.to) || daily.has(i.to) || (c.retired || []).some((r) => r.id === i.to && r.round >= 0), i.id + " -> " + i.to + " fehlt");   // a Business card may go into a daily one
    }
    const ret = new Set((c.retired || []).map((i) => i.id));
    for (const id of c.gone || []) { assert.ok(!ids.has(id) && !ret.has(id), id + " noch da"); }
  }
  // the retired cards keep the catalog's rules (both languages, same shape, titles), as old links still show them
  assert.deepEqual(pruefe({ ideas: DAILY.retired }, "daily").filter((e) => !/Titel doppelt/.test(e)), []);
});
test("Katalog business: dieselben Regeln, dazu kein Kalendertag am Wochenende", () => {
  assert.deepEqual(pruefe(BIZ, "business"), []);
});
test("Katalog: ids ueber daily und business hinweg eindeutig (ein Link #i= meint genau eine Karte)", () => {
  const a = new Set(DAILY.ideas.concat(DAILY.gated || []).map((i) => i.id));
  assert.deepEqual(BIZ.ideas.map((i) => i.id).filter((id) => a.has(id)), []);
});
test("Gegenprobe: jede Regel erkennt ihren Bruch", () => {
  const free = (c, d) => !c.ideas.some((i) => [].concat(i.on || []).includes(d));
  const a0 = DAILY.ideas[0], cases = [
    ["id doppelt", (c) => c.ideas.push(clone(a0))],
    ["Titel > 28", (c) => { c.ideas[0].en.t = "A Title That Is Clearly Too Long Here"; }],
    ["leerer Text", (c) => { c.ideas.find((i) => i.de.lines).en.lines[0] = " "; }],
    ["Liste de/en", (c) => { c.ideas.find((i) => i.de.lines).en.lines.push("x"); }],
    ["Felder de", (c) => { c.ideas[0].de.extra = "nur de"; }],
    ["Titel doppelt", (c) => { c.ideas[1].de.t = c.ideas[0].de.t; }],
    ["Kalendertag doppelt", (c) => { const x = c.ideas.find((i) => typeof i.on === "string"); c.ideas.find((i) => !i.on).on = x.on; }],
    ["Holocaust-Gedenktag", (c) => { c.ideas.find((i) => !i.on).on = "01-27"; }],
    ["Kalendertag ungueltig", (c) => { c.ideas.find((i) => !i.on).on = "02-30"; }],
    ["Nachbarregel", (c) => {
      const x = c.ideas.find((i) => typeof i.on === "string" && free(c, md(date(i.on, 1)))), y = c.ideas.find((i) => !i.on && i.kind === x.kind);
      y.on = md(date(x.on, 1));
    }]
  ];
  for (const [want, mut] of cases) { const c = clone(DAILY); mut(c); assert.ok(pruefe(c, "daily").some((e) => e.includes(want)), want + ": " + pruefe(c, "daily").join(" | ")); }
  const b = clone(BIZ); b.ideas[0].on = "11-21";   // Saturday 21.11.2026
  assert.ok(pruefe(b, "business").some((e) => e.startsWith("Business am Wochenende 11-21")));
  // a Monday no card has yet (11-23 is biz-wichteln's)
  const mon = ["11-30", "12-07", "12-14", "12-21", "01-11", "01-18"].find((d) => { const c = clone(BIZ); c.ideas[0].on = d; return !pruefe(c, "business").length; });
  assert.ok(mon, "ein freier Montag"); b.ideas[0].on = mon; assert.deepEqual(pruefe(b, "business"), [], "Montag geht");
});
module.exports = { pruefe };
