"use strict";
// W0 operating fixes: a locked main button looks locked and says why, the main action never hides below the fold,
// titles wrap instead of "…", tap targets of at least 44 px, Escape and the ✕ top left on every level.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");
const G = require("./lib/grund.js");
let page;
let biz;
// Web route (lib/grund.js): pages here are reloaded or a device opens several pages; under file:// such a page now and then starts with an empty storage of its own.
test.before(async () => { page = await G.webUrl("index.html"); biz = await G.webUrl("business/index.html"); });

async function setup(w, h, locale) {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, locale: locale || "de-DE" }), errs = [];
  ctx.setDefaultTimeout(15000);
  const open = async (u) => { const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(String(e))); await p.goto(u); return p; };
  return { b, open, errs };
}
const inView = (p, sel) => p.locator(sel).evaluate((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight + 0.5; });
const height = (p, sel) => p.locator(sel).evaluate((e) => e.getBoundingClientRect().height);

test("Gesperrter Hauptknopf: sichtbar gesperrt, Grund in aria-live, Tippen springt zum offenen Feld; Weiter im Footer, Vorschau hoechstens 38 %", async () => {
  const { b, open, errs } = await setup(328, 568);
  const p = await open(page + "#i=zug-einig"); await p.locator("#go").click();
  const main = p.locator("#edmain");
  await p.waitForFunction(() => document.getElementById("edmain").textContent === "Weiter");
  assert.equal(await main.getAttribute("aria-disabled"), "true");
  assert.ok(await inView(p, "#edmain"), "Hauptknopf ohne Scrollen sichtbar bei 328x568");
  assert.equal(await p.locator("#panel").getByRole("button", { name: "Weiter", exact: true }).count(), 0, "kein zweites Weiter im Eingabefeld");
  // locked, but readable (editor E1, WCAG 1.4.3): full opacity, dashed frame on paper instead of a faded button
  assert.equal(Number(await main.evaluate((e) => getComputedStyle(e).opacity)), 1); assert.equal(await main.evaluate((e) => getComputedStyle(e).borderStyle), "dashed");
  assert.equal(await main.evaluate((e) => getComputedStyle(e).cursor), "not-allowed");
  assert.equal(await p.locator("#edwhy").getAttribute("aria-live"), "polite");
  assert.match(await p.locator("#edwhy").textContent(), /^Noch offen: \S/);
  assert.ok(await height(p, "#stagewrap") <= 0.38 * 568 + 1, "Vorschau <= 38 %: " + await height(p, "#stagewrap"));
  await main.click({ force: true });
  await p.waitForFunction(() => { const a = document.activeElement; return a && a.closest("#panel") && a.tagName === "INPUT" && !a.value; });
  assert.ok(await inView(p, "#edmain"));
  const fields = p.locator("#panel input.field");
  for (let i = 0; i < await fields.count(); i++) await fields.nth(i).fill(["Pizza", "Pasta", "Sushi", "Curry", "Tacos"][i] || "x" + i);
  await p.waitForFunction(() => document.getElementById("edmain").getAttribute("aria-disabled") === "false");
  assert.equal(await p.locator("#edwhy").textContent(), "");
  const before = await p.locator("#panel").textContent();
  await main.click();
  await p.waitForFunction((t) => document.getElementById("panel").textContent !== t, before);   // the footer's Weiter took the step
  // an own blank card: "Fertig" locked with the reason, not a pseudo button named after the reason
  const o = await open(page); await o.locator("#own").click(); await o.locator("#shbody .mech").first().click();
  await o.waitForFunction(() => document.getElementById("edmain").getAttribute("aria-disabled") === "true");
  assert.equal(await o.locator("#edmain").textContent(), "Fertig");
  assert.equal(await o.locator("#edwhy").textContent(), "Erst was ändern");
  assert.deepEqual(errs, []);
  await b.close();
});

test("Titel: Zeilenhoehe 1.15, zweizeilig statt \"…\", Bindestrich-Titel ueber plainTitle", async () => {
  const { b, open, errs } = await setup(360, 740);
  for (const [id, want] of [["duell-ssp", "Dein Agent gegen meinen"], ["raum-tuer", "Türsteher"], ["plan-28", "Winter-Tunnel"]]) {
    const p = await open(page + "#i=" + id); await p.locator("#go").click();
    const t = p.locator("#edtitle"); await p.waitForFunction(() => document.getElementById("edtitle").textContent);
    assert.equal(await t.textContent(), want);
    const m = await t.evaluate((e) => { const s = getComputedStyle(e); return { lh: parseFloat(s.lineHeight) / parseFloat(s.fontSize), ov: s.textOverflow, cut: e.scrollHeight > e.clientHeight + 3 || e.scrollWidth > e.clientWidth + 1 }; });
    assert.ok(Math.abs(m.lh - 1.15) < 0.01, id + " line-height " + m.lh);
    assert.notEqual(m.ov, "ellipsis"); assert.equal(m.cut, false, id + " abgeschnitten");
    await p.close();
  }
  assert.deepEqual(errs, []);
  await b.close();
});

test("Tippflaechen >= 44 px: Funktionsleiste, Regler, Kartentisch, Einladung entfernen, Zusammen-bauen-Leiste, Firmenlogo", async () => {
  const { b, open, errs } = await setup(360, 800);
  const p = await open(page);
  const feat = await p.locator("#feat button").evaluateAll((l) => l.filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect().height));   // the ticker copies show only while it runs
  assert.ok(feat.length && feat.every((h) => h >= 44), "Funktionsleiste " + feat);
  const g = await open(page + "#i=spiel-lava"); await g.locator("#go").click();
  await g.getByRole("tab", { name: /Regeln/ }).click();
  const sl = await g.locator("#panel .slide input").evaluateAll((l) => l.map((e) => e.getBoundingClientRect().height));
  assert.ok(sl.length && sl.every((h) => h >= 44), "Regler " + sl);
  // rules that only show in their state: read from the style sheet as the page has it
  const rule = await p.evaluate(() => {
    const probe = (html, sel) => { const d = document.createElement("div"); d.innerHTML = html; document.body.appendChild(d); const e = d.querySelector(sel), r = e.getBoundingClientRect(); d.remove(); return r.height; };
    return {
      invx: probe('<div class="inv"><div class="invcell"><button></button><button class="invx">✕</button></div></div>', ".invx"),
      coleave: parseFloat(getComputedStyle(document.getElementById("coleave")).minHeight),
      seat: probe('<div class="tbseat"><button class="btn">x</button></div>', ".btn"),
      auto: probe('<button class="tbauto">x</button>', ".tbauto")
    };
  });
  assert.ok(rule.invx >= 44 && rule.coleave >= 44 && rule.seat >= 44 && rule.auto >= 44, JSON.stringify(rule));
  const bz = await open(biz);
  const logo = await bz.locator("#orglogo").evaluate((e) => ({ w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height, t: e.textContent }));
  assert.ok(logo.w >= 44 && logo.h >= 44, JSON.stringify(logo)); assert.notEqual(logo.t, "·");
  assert.deepEqual(errs, []);
  await b.close();
});

test("Escape schliesst wie das ✕ (Editor, Regal, Fertig-Seite, Kartentisch mit Nachfrage); ✕ oben links mit Namen, auch EN", async () => {
  const { b, open, errs } = await setup(360, 740);
  const p = await open(page + "#i=karte-spruch");   // a fixed card: today's card may be a game on a layer
  const state = () => p.evaluate(() => document.body.dataset.state);
  await p.locator("#go").click(); await p.locator("#editor:not([hidden])").waitFor();
  await p.keyboard.press("Escape"); await p.waitForFunction(() => document.body.dataset.state === "home");
  await p.locator("#past").click(); await p.locator("#shelf:not([hidden])").waitFor();
  await p.keyboard.press("Escape"); assert.equal(await state(), "home");
  await p.goto(page + "#i=karte-spruch"); await p.locator("#go").click(); await p.locator("#edmain").click(); await p.locator("#share").waitFor();
  const x = await p.locator("#dback").evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, n: e.getAttribute("aria-label") }; });
  assert.ok(x.l < 20 && x.t < 20 && x.w >= 44 && x.h >= 44 && x.n === "Schließen", JSON.stringify(x));
  await p.keyboard.press("Escape"); await p.waitForFunction(() => document.body.dataset.state === "home");
  // the card table: ✕ top left with a name; the first Escape asks, the second leaves
  await p.evaluate(() => window.Parts.use("table", function () {})); await p.waitForFunction(() => window.TableUI);
  await p.evaluate(() => window.TableUI.open("bauernskat")); await p.locator(".tbov .liveback").waitFor();
  const lb = await p.locator(".tbov .liveback").evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, w: r.width, n: e.getAttribute("aria-label") }; });
  assert.ok(lb.l < 20 && lb.w >= 44 && lb.n === "Schließen", JSON.stringify(lb));
  await p.keyboard.press("Escape");
  assert.equal(await p.locator(".tbov").count(), 1, "erst nachfragen");
  await p.locator("#toast").getByText("Noch einmal Esc").waitFor();
  await p.keyboard.press("Escape"); await p.locator(".tbov").waitFor({ state: "detached" });
  // typing: Escape leaves the field first, the work stays
  await p.locator("#own").click(); await p.locator("#shbody .mech").first().click(); await p.locator("#editor:not([hidden])").waitFor();
  const f = p.locator("#panel .field").first(); await f.fill("Hallo"); await f.focus();
  await p.keyboard.press("Escape"); assert.equal(await state(), "editor");
  await p.keyboard.press("Escape"); await p.waitForFunction(() => document.body.dataset.state === "home");
  const e = await open(page + "#i=karte-spruch"); await e.locator("#lang").click(); await e.locator("#go").click(); await e.locator("#edmain").click(); await e.locator("#share").waitFor();
  assert.equal(await e.locator("#dback").getAttribute("aria-label"), "Close");
  assert.deepEqual(errs, []);
  await b.close();
});
