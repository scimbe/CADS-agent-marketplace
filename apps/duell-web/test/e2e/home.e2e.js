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
  await p.locator("#more").click(); await p.clock.runFor(400);
  assert.match(await day(), /^03\|/, "abreissen blaettert zum naechsten Tag");
  await p.locator("#more").click(); await p.clock.runFor(400);
  assert.match(await day(), /^04\|/);
  const wish = p.locator("#wishgo");
  await wish.waitFor();
  assert.equal(await wish.textContent(), "✨ Mit KI anpassen");
  await wish.tap();
  await p.getByRole("tab", { name: "✨ Wunsch" }).and(p.locator("[aria-selected=true]")).waitFor();
  await p.getByText("Wunsch anwenden").waitFor();
  await b.close();
});

test("Start: beim Ziehen liegt darunter das echte naechste Blatt, ausgegraut, und genau das kommt nach dem Abreissen", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.clock.install({ time: new Date("2026-11-01T10:00:00Z") });
  await p.goto(page);
  const box = await p.locator("#leaf").boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
  for (let i = 0; i < 4; i++) {
    await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 60, y, { steps: 4 });
    const g = await p.evaluate(() => {
      const s = document.querySelector("#pad .u1 .ghost"), pv = s.querySelector(".pv:not([hidden]) canvas:not([hidden])"), css = getComputedStyle(s);
      let ink = 0;
      if (pv) { const d = pv.getContext("2d").getImageData(0, 0, pv.width, pv.height).data, set = new Set(); for (let k = 0; k < d.length; k += 4000) set.add(d[k] + "," + d[k + 1]); ink = set.size; }
      return { day: s.querySelector(".dnum").textContent + "|" + s.querySelector(".hero").textContent, grey: css.filter, op: Number(css.opacity), ink, ids: s.querySelectorAll("[id]").length + (s.id ? 1 : 0) };
    });
    assert.match(g.grey, /grayscale/); assert.ok(g.op < 1, "ausgegraut"); assert.equal(g.ids, 0, "keine doppelten IDs");
    assert.ok(g.ink > 3, "das Vorschaubild des naechsten Tages ist gemalt: " + g.day);
    await p.mouse.move(x + 200, y, { steps: 4 }); await p.mouse.up(); await p.clock.runFor(400);
    const now = await p.evaluate(() => document.getElementById("dnum").textContent + "|" + document.getElementById("hero").textContent);
    assert.equal(now, g.day, "das Blatt nach dem Abreissen ist das Blatt aus der Vorschau");
  }
  assert.deepEqual(errs, []);
  await b.close();
});
