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
    // home -> My style: the link, with the fixed address; offline a friendly line with it instead of a browser error
    await p.goto("file://" + path.join(dist, "index.html"));
    await p.locator("#me").tap();
    const s = p.getByRole("link", { name: "Impressum, Datenschutz, Nutzungsbedingungen" });
    await s.waitFor();
    assert.equal(await s.getAttribute("href"), "https://demos-34a13a96.bunsenbrenner.org/duell/impressum");
    assert.equal(await s.getAttribute("target"), "_blank");
    await ctx.setOffline(true);
    await s.click();
    await p.getByText("Die Seiten stehen unter https://demos-34a13a96.bunsenbrenner.org/duell/impressum").first().waitFor();
    assert.equal(ctx.pages().length, 1, "offline no new tab");
    await ctx.setOffline(false);
    // the finished picture: one tap
    await p.goto("file://" + path.join(dist, "index.html") + "#i=quiz-chaos"); await p.locator("#go").tap(); await p.locator("#edmain").tap(); await p.locator("#share").waitFor();
    const a = p.locator("#done #legal");
    assert.equal(await a.textContent(), "Impressum · Datenschutz");
    assert.equal(await a.getAttribute("href"), "https://demos-34a13a96.bunsenbrenner.org/duell/impressum");
    assert.ok(await a.isVisible(), "visible on the finished picture");
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
