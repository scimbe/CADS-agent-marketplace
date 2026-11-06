"use strict";
// Every card of the catalog opens without a page error, in German and in English, in the daily app and in Business:
// the sheet from its link (#i=<id>), then a tap on the main button. Parts that the tap loads (play, table, quiz …) are
// waited for, so an error inside a part counts too. A card that cannot run here (needs a call) says so and is skipped.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const dist = path.resolve(__dirname, "../../dist");
const catalog = (f) => { const c = require(f); return c.ideas.concat(c.gated || []).map((i) => i.id); };
const FLAVORS = [["daily", "index.html", catalog("../../src/ideas.json")], ["business", "business/index.html", catalog("../../src/flavors/business/ideas.json")]];

for (const [name, file, ids] of FLAVORS) for (const locale of ["de-DE", "en-US"]) {
  test("Katalog " + name + " " + locale.slice(0, 2) + ": jede Karte oeffnet ohne pageerror, der Hauptknopf hat Text", { timeout: 600000 }, async () => {
    const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
    try {
      const ctx = await b.newContext({ ...devices["Pixel 7"], locale }), p = await ctx.newPage();
      let errs = []; p.on("pageerror", (e) => errs.push(e.message));
      const bad = [], skipped = [];
      let k = 0;
      for (const id of ids) {
        // a fresh document each time (the query makes it one), so an open table or game from the card before is gone
        await p.goto("file://" + path.join(dist, file) + "?n=" + (k++) + "#i=" + id);
        const at = await p.waitForFunction((x) => {
          const h = window.DailyDebug && window.DailyDebug.home();
          if (h && h.idea && h.idea.id === x && h.note) return "sheet";
          return document.getElementById("toast").classList.contains("show") ? "toast" : false;
        }, id, { timeout: 10000 }).then((h) => h.jsonValue());
        if (at === "toast") { skipped.push(id); continue; }
        await p.locator("#go").tap({ timeout: 10000 });
        await p.waitForTimeout(250);
        // parts the tap asked for (script elements of window.DailyParts) must be loaded and have run
        await p.waitForFunction(() => window.Parts.names().every((n) => {
          const f = window.DailyParts[n].f;
          return !document.querySelector('script[src$="' + f + '"]') || window.Parts.ready(n);
        }), null, { timeout: 10000 });
        await p.waitForTimeout(150);
        const main = await p.evaluate(() => { const e = document.getElementById("edmain"); return document.getElementById("editor").hidden ? "-" : e.textContent.trim(); });
        if (errs.length || !main) bad.push(id + ": " + (errs.join(" | ") || "Hauptknopf ohne Text"));
        errs = [];
      }
      assert.deepEqual(bad, [], bad.join("\n"));
      assert.ok(skipped.length < ids.length / 4, "zu viele Karten uebersprungen: " + skipped.join(", "));
    } finally { await b.close(); }
  });
}
