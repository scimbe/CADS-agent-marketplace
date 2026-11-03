"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");

test("Letzte Tage: Karte suchen, Treffer antippen, ihr Blatt liegt oben; ohne Treffer ein Hinweis", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.clock.install({ time: new Date("2026-11-03T10:00:00Z") });
  await p.goto(page);
  await p.locator("#past").tap();
  const q = p.getByRole("searchbox", { name: /Karte suchen/ });
  await q.waitFor();
  assert.equal(await p.locator("#shbody .day").count(), 7, "ohne Suchwort die letzte Woche");

  await q.fill("xyzquatsch");
  await p.getByText("Nichts gefunden").waitFor();
  assert.equal(await p.locator("#shbody .day").count(), 0);

  await q.fill("KONFERENZ");
  const hit = p.locator("#shbody .day", { hasText: "Gruppen- Konferenz" });
  await hit.waitFor();
  const shown = await hit.locator("b").textContent();
  await hit.tap();
  await p.locator("#home").waitFor();
  assert.equal(await p.locator("#hero").textContent(), "Gruppen-Konferenz");
  assert.equal(await p.locator("#dnum").textContent(), shown, "das Blatt traegt den Tag, an dem die Karte dran war");

  await p.locator("#past").tap();
  await p.getByRole("searchbox").fill("Rätsel");
  assert.ok(await p.locator("#shbody .day").count() > 0, "Umlaut in der Eingabe");
  await p.getByRole("searchbox").fill("raetsel");
  assert.ok(await p.locator("#shbody .day").count() > 0, "ae statt ä");
  assert.deepEqual(errs, []);
  await b.close();
});
