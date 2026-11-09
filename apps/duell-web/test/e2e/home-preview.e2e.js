"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const G = require("./lib/grund.js");
let page;
// Web route (lib/grund.js): pages here are reloaded or a device opens several pages; under file:// such a page now and then starts with an empty storage of its own.
test.before(async () => { page = await G.webUrl("index.html"); });
const shot = process.env.SHOT_DIR;

test("Start: jede Art zeigt Vorschau, Funktionsleiste fuehrt zum Flugspiel und Webconference, 30 Tage laufen ohne Fehler", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), errs = [];
  for (let i = 0; i < 30; i++) {
    const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(i + ": " + e));
    await p.clock.install({ time: new Date(Date.UTC(2026, 10, 2 + i, 10)) });
    await p.goto(page); await p.clock.runFor(1200); await p.clock.resume(); await p.waitForTimeout(900);
    const s = await p.evaluate(() => { const g = document.getElementById("pvgame"), c = document.getElementById("pvcard"), v = (x) => { if (x.hidden) return 0; const d = x.getContext("2d").getImageData(0, 0, x.width, x.height).data, set = new Set(); for (let k = 0; k < d.length; k += 4000) set.add(d[k] + "," + d[k + 1]); return set.size; }; return { g: v(g), c: v(c), hero: document.getElementById("hero").textContent, over: document.documentElement.scrollWidth > innerWidth }; });
    assert.ok(!s.over, "kein Querscrollen");
    if (shot && [0, 1, 2, 6].includes(i)) await p.screenshot({ path: shot + "/tag" + i + ".png" });
    await p.close();
  }
  assert.deepEqual(errs, []);
  const p = await ctx.newPage(); await p.goto(page);
  await G.alle(p); assert.ok(await p.getByRole("button", { name: /Webconference/ }).first().isVisible());
  await p.locator("#feat").hover();   // the ticker stands still under the pointer
  await p.getByRole("button", { name: /Flugspiel/ }).click();
  await p.getByRole("tab", { name: "✨ Wunsch" }).waitFor();
  await b.close();
});
