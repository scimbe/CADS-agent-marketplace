"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");

test("Start: KI-Knopf oeffnet den Wunsch, ein offenes Blatt springt am neuen Tag um", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), p = await ctx.newPage();
  await p.clock.install({ time: new Date("2026-11-01T10:00:00Z") });
  await p.goto(page);
  const day = () => p.evaluate(() => document.getElementById("dnum").textContent + "|" + document.getElementById("hero").textContent);
  const first = await day();
  assert.match(first, /^01\|/);
  await p.clock.fastForward("24:00:00");
  await p.waitForFunction((f) => document.getElementById("dnum").textContent + "|" + document.getElementById("hero").textContent !== f, first);
  assert.match(await day(), /^02\|/);
  const wish = p.locator("#wishgo");
  await wish.waitFor();
  assert.equal(await wish.textContent(), "✨ Mit KI anpassen");
  await wish.tap();
  await p.getByRole("tab", { name: "✨ Wunsch" }).and(p.locator("[aria-selected=true]")).waitFor();
  await p.getByText("Wunsch anwenden").waitFor();
  await b.close();
});
