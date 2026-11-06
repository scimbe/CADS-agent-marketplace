"use strict";
// W0 layout and language: two columns from 900 px and on a phone held sideways (H2, N7), dark tokens for the sheet and
// for Business (M8), the language choice on a received invitation and on every layer, with the open view redrawn (i18n #6),
// and a third language that is nothing but data.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const biz = "file://" + path.resolve(__dirname, "../../dist/business/index.html");

async function open(url, o) {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext(Object.assign({ viewport: { width: 390, height: 844 }, locale: "de-DE", hasTouch: true }, o)), p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.clock.install({ time: new Date("2026-11-05T10:00:00Z") });
  if (o && o.init) await p.addInitScript(o.init);
  await p.goto(url);
  return { b, p, errs };
}
const box = (p, sel) => p.locator(sel).boundingBox();
// WCAG contrast of an element's text against the first solid background up its tree
const contrast = (p, sel) => p.evaluate((s) => {
  const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number), lum = (c) => { const v = rgb(c).slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const e = document.querySelector(s); let bg = e;
  while (bg && (rgb(getComputedStyle(bg).backgroundColor)[3] === 0 || getComputedStyle(bg).backgroundColor === "transparent")) bg = bg.parentElement;
  const a = lum(getComputedStyle(e).color), c = lum(getComputedStyle(bg || document.body).backgroundColor);
  return { ratio: (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05), bg: lum(getComputedStyle(bg || document.body).backgroundColor) };
}, sel);

for (const [w, h] of [[1024, 768], [740, 360], [915, 412]]) {
  test("Layout " + w + "x" + h + ": Blatt links, Knoepfe rechts; im Editor Vorschau links, Tabs und Hauptknopf rechts und ganz sichtbar", async () => {
    const { b, p, errs } = await open(page, { viewport: { width: w, height: h } });
    await p.locator("#go").waitFor();
    const pad = await box(p, "#pad"), go = await box(p, "#go");
    assert.ok(pad.x + pad.width <= go.x + 1, "Blatt links neben dem Hauptknopf");
    assert.ok(go.y + go.height <= h && pad.y + pad.height <= h + 1, "nichts unter dem Rand");
    await p.locator("#go").click();
    await p.locator("#edmain").waitFor();
    const st = await box(p, "#stagewrap"), panel = await box(p, "#panel"), main = await box(p, "#edmain");
    assert.ok(st.x + st.width <= panel.x + 1, "Vorschau links neben dem Panel");
    assert.ok(main.y >= 0 && main.y + main.height <= h, "Hauptknopf ganz sichtbar: " + JSON.stringify(main));
    assert.ok(panel.height >= 80, "das Panel behaelt Platz: " + panel.height);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errs, []);
    await b.close();
  });
}

test("Layout: Hochformat bleibt eine Spalte; ein Spiel quer sagt ehrlich, dass es hochkant laeuft", async () => {
  const { b, p } = await open(page, { viewport: { width: 390, height: 844 } });
  const pad = await box(p, "#pad"), go = await box(p, "#go");
  assert.ok(go.y >= pad.y + pad.height - 1, "Hauptknopf unter dem Blatt");
  // An upright phone whose WebView reports a short viewport (Android shell, open keyboard) is not "sideways".
  await p.setViewportSize({ width: 411, height: 380 });
  assert.equal(await p.evaluate(() => getComputedStyle(document.getElementById("home")).display), "flex", "schmal bleibt einspaltig");
  await p.setViewportSize({ width: 740, height: 360 });
  await p.evaluate(() => { document.getElementById("home").hidden = true; document.getElementById("game").hidden = false; });
  const hint = await p.evaluate(() => getComputedStyle(document.getElementById("game"), "::after").content);
  assert.match(hint, /Bitte das Gerät hochkant halten/);
  await b.close();
});

test("Dunkelmodus: Kalenderblatt dunkel mit AA-Kontrast, hell bleibt hell; Business mit dunklen Tokens", async () => {
  const dark = await open(page, { colorScheme: "dark" });
  await dark.p.locator("#hero span").first().waitFor();
  const d = await contrast(dark.p, ".teaser"), dn = await contrast(dark.p, ".dnum");
  assert.ok(d.bg < 0.05, "Blatt dunkel"); assert.ok(d.ratio >= 4.5 && dn.ratio >= 4.5, JSON.stringify([d, dn]));
  assert.equal(await dark.p.evaluate(() => getComputedStyle(document.documentElement).colorScheme), "light dark");
  await dark.b.close();
  const light = await open(page, { colorScheme: "light" });
  await light.p.locator("#hero span").first().waitFor();
  const l = await contrast(light.p, ".teaser"); assert.ok(l.bg > 0.8 && l.ratio >= 4.5, JSON.stringify(l));
  await light.b.close();
  for (const cs of ["dark", "light"]) {
    const x = await open(biz, { colorScheme: cs });
    await x.p.locator("#hero span").first().waitFor();
    const t = await contrast(x.p, ".teaser"), hero = await contrast(x.p, "#hero span"), tool = await contrast(x.p, "#tools button");
    assert.ok(cs === "dark" ? t.bg < 0.05 : t.bg > 0.8, cs + " Blatt");
    for (const r of [t, hero, tool]) assert.ok(r.ratio >= 4.5, cs + " " + JSON.stringify(r));
    await x.p.locator("#go").click(); await x.p.locator("#edmain").waitFor();
    const tab = await contrast(x.p, "#tabs button[aria-selected=true]"); assert.ok(tab.ratio >= 4.5, cs + " Tab " + JSON.stringify(tab));
    assert.deepEqual(x.errs, []);
    await x.b.close();
  }
});

test("Einladung: Sprachwahl vor dem ersten Tipp, Wechsel zeichnet Blatt und Editor neu, auch im Editor erreichbar", async () => {
  const { b, p, errs } = await open(page + "#i=zug-termin", { viewport: { width: 328, height: 568 } });
  const pick = p.getByRole("group", { name: "Sprache wählen" });
  await pick.waitFor();
  const de = await p.locator("#go").textContent();
  await pick.getByRole("button", { name: "English", exact: true }).click();
  await p.getByRole("group", { name: "Choose language" }).waitFor();
  assert.notEqual(await p.locator("#go").textContent(), de);
  assert.equal(await p.locator("#from").textContent(), "Sent to you. Make it yours.", "die Zeile der Einladung wechselt mit");
  assert.equal(await p.evaluate(() => document.documentElement.lang), "en");
  assert.equal(await p.getByRole("button", { name: "English", exact: true }).getAttribute("aria-pressed"), "true");
  await p.locator("#go").click();
  const sw = p.locator("#edlang");
  await sw.waitFor();
  const tabsEn = await p.locator("#tabs").textContent(), titleEn = await p.locator("#edtitle").textContent();
  const r = await sw.boundingBox(); assert.ok(r.width >= 44 && r.height >= 44 && r.x + r.width <= 328, "44 px und im Bild: " + JSON.stringify(r));
  assert.equal(await sw.getAttribute("aria-label"), "Switch language: Deutsch");
  await sw.click();
  await p.waitForFunction((x) => document.getElementById("tabs").textContent !== x, tabsEn);
  assert.notEqual(await p.locator("#edtitle").textContent(), titleEn, "Titel neu");
  assert.equal(await p.evaluate(() => document.documentElement.lang), "de");
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem("daily.v1")).lang), "de", "die Wahl bleibt");
  await p.locator("#edback").click();
  assert.equal(await p.locator("#langpick").isVisible(), true, "zurueck auf der Einladung, die Wahl steht noch da");
  assert.deepEqual(errs, []);
  await b.close();
});

test("Eigenes Blatt ohne Einladung: keine Sprachwahl im Blatt und im Editor (die Leiste oben hat sie)", async () => {
  const { b, p } = await open(page);
  await p.locator("#go").waitFor();
  assert.equal(await p.locator("#langpick").isVisible(), false);
  await p.locator("#go").click(); await p.locator("#edmain").waitFor();
  assert.equal(await p.locator("#edlang").isVisible(), false);
  await b.close();
});

test("Ebenen: Kartentisch und Arcade haben die Sprachwahl sichtbar und zeichnen sich neu", async () => {
  const { b, p, errs } = await open(page);
  await p.evaluate(() => window.Parts.use("table", () => window.TableUI.open("bauernskat")));
  const bot = p.locator(".tbov .btn.hot").first();
  await bot.waitFor(); assert.match(await bot.textContent(), /Gegen den Bot/);
  const sw = p.locator(".tbov .livelang");
  assert.equal(await p.evaluate(() => { const e = document.querySelector(".tbov .livelang"), r = e.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === e; }), true, "nicht verdeckt");
  await sw.click();
  await p.locator(".tbov .btn.hot", { hasText: "Play the bot" }).waitFor();
  await p.locator(".tbov .liveback").click();
  await p.evaluate(() => window.Parts.use("play", () => window.ArcadeUI.menu("puck")));
  const asw = p.locator(".arcbar .langbtn");
  await asw.waitFor(); assert.equal(await asw.textContent(), "EN");
  assert.equal(await p.evaluate(() => { const e = document.querySelector(".arcbar .langbtn"), r = e.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === e; }), true, "nicht verdeckt");
  await p.locator(".arcov .btn.hot", { hasText: "Against the bot" }).waitFor();
  await asw.click();
  await p.locator(".arcov .btn.hot", { hasText: "Gegen den Bot" }).waitFor();
  assert.deepEqual(errs, []);
  await b.close();
});

test("Dritte Sprache als reine Daten: ein Block in den Texten, der Knopf geht DE, EN, TR, Luecken auf Deutsch", async () => {
  // As if texts.json had a "tr" block: the data script's DailyTexts gets one more language before the app reads it.
  const init = () => { let v; Object.defineProperty(window, "DailyTexts", { configurable: true, get() { return v; }, set(x) { x.tr = { brand: "Günün Fikri", lang_to: "Dil değiştir: {l}" }; v = x; } }); };
  const { b, p, errs } = await open(page + "#i=zug-termin", { init });
  await p.locator("#langpick").waitFor();
  assert.deepEqual(await p.locator("#langpick button").allTextContents(), ["Deutsch", "English", "Türkçe"]);
  await p.getByRole("button", { name: "Türkçe" }).click();
  assert.equal(await p.evaluate(() => document.documentElement.lang), "tr");
  assert.equal(await p.locator("#brand").textContent(), "Günün Fikri");
  assert.equal(await p.locator("#more").textContent(), "Nächster Tag", "noch nicht uebersetzt: Deutsch");
  assert.equal(await p.locator("#lang").textContent(), "TR");
  await p.locator("#lang").click();
  assert.equal(await p.evaluate(() => document.documentElement.lang), "de", "nach TR wieder DE");
  await p.locator("#go").click(); await p.locator("#edmain").waitFor();
  assert.deepEqual(errs, []);
  await b.close();
});
