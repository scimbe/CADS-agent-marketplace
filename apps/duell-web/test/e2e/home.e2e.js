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

test("Wunsch: ein Tipp auf eine Idee wendet sie sofort an und aendert das ganze Blatt; Empfaenger sieht die Karte gross", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.route("**/api/**", (r) => r.abort());   // kein Server: die festen Regeln antworten
  await p.goto(page + "#c=eyJ2IjoxLCJkIjp7ImsiOiJjYXJkIiwiY29sIjpbIiNmZmQ0MDAiLCIjZmYzYjFkIl0sImJ5IjpbXSwiaSI6InBsYW4tMDkiLCJ4IjoiSGV1dGUgMjAgVWhyLiBWaWRlbyBhbi4gS2VpbmUgQXVzcmVkZW4uIiwic3QiOiJzdGVtcGVsIiwic2siOltdfX0");
  await p.locator("#leaf.got").waitFor();
  assert.equal(await p.locator("#hero").isHidden(), true, "der Kartentext steht nur einmal da, im Bild");
  assert.equal(await p.locator("#pvcard").isVisible(), true);
  assert.equal(await p.locator("#go").textContent(), "Weiter bauen");
  await p.locator("#wishgo").tap();
  const tip = p.getByRole("button", { name: "Mach es gruseliger" });
  await tip.waitFor();
  const order = await p.evaluate(() => { const pn = document.getElementById("panel"), at = (x) => [...pn.querySelectorAll("*")].indexOf(x); return { field: at(pn.querySelector("textarea")), go: at([...pn.querySelectorAll("button")].find((x) => /Wunsch anwenden/.test(x.textContent))), tip: at([...pn.querySelectorAll("button")].find((x) => x.textContent === "Mach es gruseliger")) }; });
  assert.ok(order.field < order.go && order.go < order.tip, "Feld, gleich darunter Anwenden, dann die Ideen: " + JSON.stringify(order));
  await tip.tap();
  const did = p.locator(".aicount", { hasText: "Geändert" });
  await did.waitFor();
  const txt = await did.textContent();
  for (const a of ["Stil", "Farbe", "Sticker"]) assert.match(txt, new RegExp(a), "ein Tipp aendert alles ohne Text: " + txt);
  assert.equal(await p.locator("#panel textarea").inputValue(), "Mach es gruseliger");
  assert.deepEqual(errs, []);
  await b.close();
});

test("Welt: ein Thema im Welt-Tab ersetzt die gebaute Welt eines Spiels sichtbar", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const p = await (await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" })).newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(page);
  await p.evaluate(() => { const D = window.Daily, i = D.IDEAS.find((x) => x.kind === "game" && x.game.look); window.DailyApp.openEditor(D.docFromIdea(i, window.DailyApp.me(), "de"), { idea: i }); });
  await p.getByRole("tab", { name: "Welt" }).tap();
  assert.equal(await p.locator("#panel .chip.on").count(), 0, "eine gebaute Welt ist keines der Themen");
  const sky = () => p.evaluate(() => { const c = document.getElementById("demo"), d = c.getContext("2d").getImageData(4, 4, 1, 1).data; return [d[0], d[1], d[2]].join(); });
  const before = await sky();
  await p.getByRole("button", { name: "Lava" }).tap(); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => [window.DailyApp.ed().doc.g.theme, !!window.DailyApp.ed().doc.g.look].join()), "lava,false");
  assert.notEqual(await sky(), before, "der Himmel wechselt");
  assert.equal(await p.locator("#panel .chip.on").textContent(), "Lava");
  assert.deepEqual(errs, []);
  await b.close();
});

test("Fensterebene: Kreuz schliesst, Merken legt die Arbeit auf die Wand und oeffnet sie wieder; Laufband nur mit Platz", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(page);
  const bar = await p.evaluate(() => { const f = document.getElementById("feat"), tr = f.querySelector(".track"); return { shown: getComputedStyle(f).display !== "none", anim: getComputedStyle(tr).animationName, hidden: tr.querySelectorAll("[aria-hidden=true]").length, all: tr.children.length }; });
  assert.ok(bar.shown); assert.equal(bar.anim, "ticker"); assert.equal(bar.hidden * 2, bar.all, "zweite Kopie nur fuers Auge");
  await p.getByRole("button", { name: /Meme bauen/ }).click();
  await p.locator("#editor").waitFor();
  assert.equal(await p.locator("#edback").getAttribute("aria-label"), "Schließen"); assert.equal(await p.locator("#edback").textContent(), "✕");
  await p.locator("#edsave").click();
  assert.equal(await p.locator("#edsave").getAttribute("aria-pressed"), "true");
  await p.locator("#edback").click(); await p.locator("#home").waitFor();
  await p.locator("#wall").click();
  await p.locator(".wallgrid button").first().click();
  await p.getByRole("button", { name: "Wieder öffnen" }).click();
  await p.locator("#editor").waitFor();
  assert.equal(await p.locator("#edsave").textContent(), "♥", "die geoeffnete Arbeit ist als gemerkt erkannt");
  await p.locator("#edsave").click(); assert.equal(await p.locator("#edsave").textContent(), "♡");
  await p.setViewportSize({ width: 375, height: 640 });
  assert.equal(await p.evaluate(() => getComputedStyle(document.getElementById("feat")).display), "none", "kurzer Bildschirm: Laufband aus");
  assert.deepEqual(errs, []);
  await b.close();
});
