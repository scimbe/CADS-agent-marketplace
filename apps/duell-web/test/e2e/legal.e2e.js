"use strict";
// Legal pages are static pages of the gallery (scripts/build.js -> dist/legal/, served at /duell/<page>): the app links them
// from home with their fixed address; each page links all others, the other language and back to the app, without script.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const dist = path.resolve(__dirname, "../../dist");

test("Rechtliches: Link auf der Startseite mit fester Adresse; statische Seiten mit Inhalt, Querverweisen und Sprachwechsel", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), p = await ctx.newPage();
  ctx.setDefaultTimeout(15000);
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await ctx.route(/^https?:/, (r) => r.abort());
  try {
    await p.goto("file://" + path.join(dist, "index.html"));
    const a = p.locator("#home #legal");
    await a.waitFor();
    assert.equal(await a.textContent(), "Impressum · Datenschutz");
    assert.equal(await a.getAttribute("href"), "https://demos-34a13a96.bunsenbrenner.org/duell/impressum");
    assert.equal(await a.getAttribute("target"), "_blank");
    assert.ok(await a.isVisible(), "visible on home");
    // the static pages (as the server sends them): content, links to all pages, other language, no script
    for (const [file, text] of [["impressum.html", "Angaben nach § 5 DDG"], ["datenschutz.html", "12. Freie Karte und Community-Karten"], ["agb.html", "10. Moderation, Sperre und Beschwerde"], ["en/datenschutz.html", "13. Your rights"], ["en/agb.html", "Warnings (strikes)"]]) {
      await p.goto("file://" + path.join(dist, "legal", file));
      await p.getByText(text).first().waitFor();
      assert.equal(await p.locator("script").count(), 0, file);
      for (const q of ["impressum", "datenschutz", "agb", "barrierefreiheit", "lizenzen"]) assert.ok(await p.locator('a[href="' + q + '"]').count(), file + " -> " + q);
    }
    await p.goto("file://" + path.join(dist, "legal/lizenzen.html"));
    for (const n of ["Anton", "qrcode-generator", "Noto Emoji", "Kartendeck"]) await p.getByText(n).first().waitFor();
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});
