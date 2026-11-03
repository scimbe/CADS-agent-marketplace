"use strict";
// Data cards against a mocked proxy: the page never talks to a real API, only to /api/duell/ai/fact.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");

async function open(day, handler) {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), p = await ctx.newPage(), seen = [], errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await ctx.route("**/api/duell/ai/fact", async (route) => { const body = JSON.parse(route.request().postData()); seen.push(body); const [status, json] = handler(body, seen.length); await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(json) }); });
  await p.clock.install({ time: new Date(day + "T10:00:00Z") });
  await p.goto(page);
  return { b, p, seen, errs };
}
const strip = (p) => p.evaluate(() => JSON.stringify(window.DailyApp.ed().doc.api || null));

test("Spielkarte: Blatt antippen laedt die Frage, ein Versuch, Loesung und Quelle stehen auf der Karte", async () => {
  const { b, p, seen, errs } = await open("2027-01-13", (q) => [200, { api: "liga", date: q.date, h: "Wer steht gerade auf Platz 1 der Bundesliga?", c: ["FC A", "FC B", "FC C", "FC D"], a: 2, r: "1. FC C · 30 Punkte", src: "OpenLigaDB.de · ODbL" }]);
  try {
    assert.match(await p.locator("#hero").textContent(), /Wer führt/);
    assert.equal(await p.locator("#go").textContent(), "Tabelle holen");
    await p.locator("#go").click();
    await p.getByRole("button", { name: "FC C" }).waitFor();
    assert.deepEqual(seen[0], { api: "liga", date: "2027-01-13", lang: "de" }, "nur API, Tag und Sprache gehen raus");
    assert.equal(await p.evaluate(() => window.DailyApp.ed().doc.x), "Wer steht gerade auf Platz 1 der Bundesliga?");
    await p.getByText("Quelle: OpenLigaDB.de · ODbL").waitFor();
    await p.getByRole("button", { name: "FC A" }).click();
    await p.locator("#toast").getByText("Knapp daneben").waitFor();
    assert.deepEqual(JSON.parse(await strip(p)), { a: "liga", d: "2027-01-13", v: "✗ 1. FC C · 30 Punkte" });
    assert.ok(await p.getByRole("button", { name: "FC C" }).isDisabled(), "kein zweiter Versuch");
    await p.getByRole("button", { name: "FC B" }).click({ force: true });
    assert.match(await strip(p), /✗ 1\. FC C/, "der erste Tipp bleibt");
    assert.equal(seen.length, 1);
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test("Ausfall: ehrliche Meldung ohne erfundene Werte, Nochmal holt sie, letzter Stand ist als alt markiert", async () => {
  const { b, p, seen, errs } = await open("2027-01-15", (q, n) => (n === 1 ? [503, { error: "unavailable" }] : [200, { api: "beben", date: "2027-01-14", h: "Stärke 5,4: Colombia", v: "24 km NNW of Rioblanco, Colombia · 10:13", stale: true, src: "x" }]));
  try {
    await p.locator("#go").click();
    await p.getByText("Der Dienst antwortet gerade nicht. Ohne echte Daten zeigen wir nichts.").waitFor();
    assert.equal(await strip(p), "null", "kein Streifen ohne Daten");
    await p.getByRole("button", { name: "↻ Nochmal versuchen" }).click();
    await p.getByText("Das ist der letzte echte Stand").waitFor();
    assert.deepEqual(JSON.parse(await strip(p)), { a: "beben", d: "2027-01-14", v: "24 km NNW of Rioblanco, Colombia · 10:13" }, "Datum des echten Stands");
    assert.equal(seen.length, 2);
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test("Auswahl-Karte: erst ein Tipp auf das Land, danach gemerkt und beim naechsten Oeffnen sofort geladen", async () => {
  const { b, p, seen, errs } = await open("2027-01-07", (q) => [200, { api: "ferien", date: q.date, h: "Noch 22 Tage bis zu den Halbjahrespause", v: "Hamburg · 29.1. – 29.1.", src: "x" }]);
  try {
    await p.locator("#go").click();
    await p.getByRole("button", { name: "Hamburg", exact: true }).click();
    await p.getByText("Quelle: OpenHolidays API · ODbL").waitFor();
    await p.waitForFunction(() => window.DailyApp.ed().doc.api);
    assert.equal(seen[0].q, "HH");
    assert.equal(await p.evaluate(() => window.DailyApp.ed().doc.x), "Noch 22 Tage bis zu den Halbjahrespause");
    await p.evaluate(() => window.DailyApp.openEditor(window.Daily.docFromIdea(window.Daily.byId("api-ferien"), window.DailyApp.me(), "de"), { idea: window.Daily.byId("api-ferien") }));
    await p.waitForFunction(() => window.DailyApp.ed().doc.api);
    assert.equal(seen.length, 2); assert.equal(seen[1].q, "HH", "gemerkt, kein zweiter Tipp noetig");
    await p.clock.runFor(200);
    const ink = await p.evaluate(() => { const c = document.getElementById("stage"); const d = c.getContext("2d").getImageData(0, Math.floor(c.height * 0.85), c.width, 4).data; let dark = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 40 && d[i + 1] < 40 && d[i + 2] < 40) dark++; return dark / (d.length / 4); });
    assert.ok(ink > 0.5, "schwarzer Quellenstreifen ist gemalt: " + ink);
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});
