"use strict";
// Real taps: Impressum and Datenschutz are at most two taps away from home, the editor, the finished picture and any shelf.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");

test("Rechtliches: von jedem Bildschirm in hoechstens zwei Tipps, Inhalt im App-Stil", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), p = await ctx.newPage();
  ctx.setDefaultTimeout(15000);
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(page);
  const title = () => p.locator("#shtitle").textContent();
  const shelfShows = async (t, text) => { await p.locator("#shelf").waitFor(); assert.equal(await title(), t); if (text) await p.locator("#shbody .legal").getByText(text).first().waitFor(); };

  // home: one tap
  await p.locator("#home .legalrow [data-legal=impressum]").tap();
  await shelfShows("Impressum", "Angaben nach § 5 DDG");
  // shelf: the page list is right there, a second page is one more tap
  await p.locator("#shbody .chips [data-legal=datenschutz]").tap();
  await shelfShows("Datenschutz", "Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.");
  await p.locator("#shback").tap();

  // my style: two taps
  await p.locator("#me").tap(); await p.locator("#shbody [data-legal=agb]").tap();
  await shelfShows("Nutzungsbedingungen", "5. Live-Spiele und IP-Adresse");
  // § in the shelf header: list, then a page
  await p.locator("#shlegal").tap(); await shelfShows("Rechtliches");
  await p.locator("#shbody [data-legal=lizenzen]").tap(); await shelfShows("Lizenzen", "qrcode-generator");
  await p.locator("#shback").tap();

  // editor: style button, then the page
  await p.locator("#go").tap(); await p.locator("#editor").waitFor();
  await p.locator("#edstyle").tap(); await p.locator("#shbody [data-legal=impressum]").tap();
  await shelfShows("Impressum");
  await p.locator("#shback").tap(); await p.locator("#editor").waitFor();   // back to the work, still there

  // finished picture: one tap
  await p.goto(page + "#i=quiz-chaos"); await p.locator("#go").tap(); await p.locator("#edmain").tap(); await p.locator("#share").waitFor();
  await p.locator("#done .legalrow [data-legal=datenschutz]").tap();
  await shelfShows("Datenschutz");

  // English labels follow the language switch
  await p.locator("#shback").tap(); await p.locator("#home").waitFor();
  await p.locator("#lang").tap();
  assert.equal(await p.locator("#home .legalrow [data-legal=impressum]").textContent(), "Legal notice");
  await p.locator("#home .legalrow [data-legal=datenschutz]").tap(); await shelfShows("Privacy", "13. Your rights");
  assert.deepEqual(errs, []);
  await b.close();
});
