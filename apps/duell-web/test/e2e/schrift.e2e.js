"use strict";
// The display font Anton comes late (a slow phone): the sheet's card is drawn first with the fallback font and has to be
// drawn again once Anton is there, as the same card (src/app.js sheetDoc): a German card read in English stays English
// (#151), the own feel-good card keeps the typed name, a received feel-good card keeps its hearts.
// The font stands in the page as a data: URL; here the page's one @font-face points at a file of the same origin that the
// test holds back until it lets it through (CSP font-src gets 'self' for it). Nothing else of the page changes.
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs");
const { ensureBuilt } = require("../../scripts/ensure-build.js");
const G = require("./lib/grund.js");
ensureBuilt("");
const FONT = fs.readFileSync(path.join(__dirname, "../../node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2"));
const hash = (u) => "#" + u.split("#")[1];
const LATE = { until: "domcontentloaded" };   // the load event waits for the font

// A device whose font is held back until release(); what is drawn on the sheet is noted with the state of the font.
async function slowFont(b, lang) {
  const ctx = await G.person(b, { lang, view: "phone390", web: true });
  let release; const gate = new Promise((ok) => { release = ok; });
  await ctx.route((u) => G.isLocal(u.href) && /\/index\.html$/.test(u.pathname), async (r) => {
    const res = await r.fetch(); let html = await res.text();
    const n = html.length;
    html = html.replace(/url\(data:font\/woff2;base64,[^)]+\)/, "url(/__anton.woff2)").replace("font-src data:", "font-src data: 'self'");
    assert.ok(html.length < n, "die Schrift steht als data: URL in der Seite");
    return r.fulfill({ response: res, body: html, headers: { ...res.headers(), "content-type": "text/html; charset=utf-8" } });
  });
  await ctx.route((u) => G.isLocal(u.href) && u.pathname === "/__anton.woff2", async (r) => { await gate; return r.fulfill({ status: 200, contentType: "font/woff2", body: FONT }); });
  await ctx.addInitScript(() => {
    window.__drawn = []; window.__whAge = [];
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s) {
      if (this.canvas.closest && this.canvas.closest("#leaf")) window.__drawn.push({ s: String(s), anton: document.fonts.check("900 40px Anton") });
      return fill.apply(this, arguments);
    };
    // hearts of a received feel-good card: how long each one stood before it was taken away
    document.addEventListener("DOMContentLoaded", () => {
      const born = new WeakMap();
      new MutationObserver((ms) => ms.forEach((m) => {
        m.addedNodes.forEach((x) => { if (x.classList && x.classList.contains("wh")) born.set(x, performance.now()); });
        m.removedNodes.forEach((x) => { if (x.classList && x.classList.contains("wh")) window.__whAge.push(performance.now() - born.get(x)); });
      })).observe(document.body, { childList: true, subtree: true });
    });
  });
  ctx.release = release;
  return ctx;
}
// Let the font through, then: what the sheet drew with Anton (the last picture), and that it drew without it before.
async function afterFont(ctx, p) {
  assert.equal(await p.evaluate(() => document.fonts.check("900 40px Anton")), false, "die Schrift ist noch nicht da");
  assert.ok(await p.evaluate(() => window.__drawn.some((d) => !d.anton)), "das Blatt ist schon ohne Anton gezeichnet");
  ctx.release();
  return G.poll(() => p.evaluate(() => window.__drawn.filter((d) => d.anton).map((d) => d.s).join(" ")), (s) => s.length > 0, { what: "neu gezeichnet mit Anton" });
}
async function sent(b, id, name) {
  const ctx = await G.person(b, { lang: "de", web: true }), s = await G.open(ctx, "#i=" + id);
  if (name) await s.getByLabel("Für wen? (optional)").fill(name);
  await s.locator("#go").click();
  if (!name) await s.locator("#edmain").click();
  await s.locator("#share").waitFor();
  const u = await s.evaluate(() => window.DailyDebug.result().url);
  await ctx.close();
  return u;
}

test("Schrift kommt spaet: das Blatt wird mit Anton neu gezeichnet, dieselbe Karte in der Sprache des Lesers, Name und Herzen bleiben", async () => {
  const b = await G.launch(); try {
    // a German card read in English: after the font the picture stays English
    const spruch = await sent(b, "karte-spruch");
    const c1 = await slowFont(b, "en"), q = await G.open(c1, hash(spruch), LATE);
    const s1 = await afterFont(c1, q);
    assert.match(s1, /Not today/i, "englisch nach der Schrift: " + s1); assert.doesNotMatch(s1, /Heute/i);

    // a German feel-good card read in English: English text, the name, and the hearts stay (no new sheet, no class gone)
    const warm = await sent(b, "warm-toll", "Lea");
    const c2 = await slowFont(b, "en"), r = await G.open(c2, hash(warm), LATE);
    await r.locator("#from").filter({ hasText: "for you" }).waitFor();
    assert.equal(await r.locator("#leaf").evaluate((e) => e.classList.contains("warmin")), true);
    const s2 = await afterFont(c2, r);
    assert.match(s2, /awesome/i, "englisch: " + s2); assert.match(s2, /Lea/i); assert.doesNotMatch(s2, /\btoll\b/i);
    assert.equal(await r.locator("#leaf").evaluate((e) => e.classList.contains("warmin")), true, "das Blatt bleibt die empfangene Karte");
    assert.ok((await r.evaluate(() => window.__whAge)).every((a) => a > 2000), "keine Herzen vor ihrer Zeit weg: " + JSON.stringify(await r.evaluate(() => window.__whAge)));

    // the own feel-good card with a name typed before the font: after the font the name is still in the picture
    const c3 = await slowFont(b, "de"), o = await G.open(c3, "#i=warm-toll", LATE);
    await o.getByLabel("Für wen? (optional)").fill("Mia");
    await G.poll(() => o.evaluate(() => window.__drawn.map((d) => d.s).join(" ")), (s) => /Mia/i.test(s), { what: "Name im Bild" });
    const s3 = await afterFont(c3, o);
    assert.match(s3, /Mia/i, "der Name bleibt: " + s3);
    for (const p of [q, r, o]) assert.deepEqual(p.errs, []);
  } finally { await b.close(); }
});
