"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("./lib/grund.js");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");

test("Webconference-Knopf oeffnet die Konferenz im App-Look mit den eigenen Farben", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), p = await ctx.newPage();
  await p.addInitScript(() => {
    localStorage.setItem("daily.v1", JSON.stringify({ me: { colors: ["#2b59ff", "#ffd400"] } }));
    window.__opened = []; window.open = (u) => { window.__opened.push(u); return {}; };
  });
  await p.goto(page);
  await G.alle(p); await p.locator("#feat .lane").hover(); await p.locator("#feat .lane button:not([aria-hidden])", { hasText: "Webconference" }).click();
  assert.deepEqual(await p.evaluate(() => window.__opened), ["https://webconference.bunsenbrenner.org/?look=daily&a=2b59ff&b=ffd400"]);
  await b.close();
});
