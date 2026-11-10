"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chromium, devices } = require("playwright");
const G = require("./lib/grund.js");
let page;
test.before(async () => { page = await G.webUrl("index.html"); });

// Live on Android (10.11.): in "Selber bauen" the game drew only into the top left two thirds of its frame. The game measured
// its box once while the editor sheet was still sliding in, and only measured again on a window resize. platz.e2e.js checks
// the frame (#gamestage), not the canvas inside it.
for (const dev of ["Pixel 7", "iPhone SE"]) {
  test(`Spiel im Editor fuellt seinen Rahmen (${dev})`, async () => {
    const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
    try {
      const ctx = await b.newContext({ ...devices[dev], locale: "de-DE" }), p = await ctx.newPage(), errs = [];
      p.on("pageerror", (e) => errs.push(String(e)));
      await p.goto(page);
      await p.waitForFunction(() => document.body.getAttribute("data-state") !== "boot");
      await p.evaluate("window.DailyApp.openEditor(window.Daily.blankDoc('game', window.DailyApp.me(), 'de'), {own:true})");
      await p.waitForTimeout(1500);   // the sheet has settled
      const m = await p.evaluate(() => {
        const st = document.getElementById("gamestage"), c = st && st.querySelector("canvas"), s = st.getBoundingClientRect(), r = c.getBoundingClientRect(), cs = getComputedStyle(st);
        const iw = s.width - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth), ih = s.height - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
        return { iw, ih, cw: r.width, ch: r.height, bw: c.width, dpr: devicePixelRatio };
      });
      // the game keeps its aspect ratio: at least one side meets the box, neither sticks out
      assert.ok(Math.max(m.cw / m.iw, m.ch / m.ih) > 0.97, "Spielfeld fuellt den Rahmen nicht: " + JSON.stringify(m));
      assert.ok(m.cw <= m.iw + 1 && m.ch <= m.ih + 1, "Spielfeld ragt heraus: " + JSON.stringify(m));
      assert.ok(Math.abs(m.bw - Math.round(m.cw * Math.min(m.dpr, 3))) <= 2, "Pixelpuffer passt nicht zur Groesse: " + JSON.stringify(m));
      assert.deepEqual(errs, []);
    } finally { await b.close(); }
  });
}
