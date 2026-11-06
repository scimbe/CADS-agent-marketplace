"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");

test("Start: Knopf unter dem Blatt oeffnet Wunsch (KI) oder Wuerfel (Kosmetik), ein offenes Blatt springt am neuen Tag um", async () => {
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
  const kind = await p.evaluate(() => window.DailyDebug.home().idea.kind), ai = ["game", "sound", "duel", "quest"].includes(kind);
  assert.equal(await wish.textContent(), ai ? "✨ Mit KI anpassen" : "🎲 Look würfeln", kind);
  await wish.tap();
  await p.getByRole("tab", { name: ai ? "✨ Wunsch" : "🎲 Würfel" }).and(p.locator("[aria-selected=true]")).waitFor();
  await p.getByRole("button", { name: ai ? /Wunsch anwenden|Bauen/ : "🎲 Würfeln" }).waitFor();
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

test("Wuerfel: Kosmetik ohne KI und ohne Netz, gleicher Seed gleicher Wurf, rueckgaengig; Empfaenger sieht die Karte gross", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), p = await ctx.newPage();
  const errs = [], calls = []; p.on("pageerror", (e) => errs.push(e.message));
  await ctx.route(/^https?:/, (r) => { calls.push(r.request().url()); return r.abort(); });
  const link = "#c=eyJ2IjoxLCJkIjp7ImsiOiJjYXJkIiwiY29sIjpbIiNmZmQ0MDAiLCIjZmYzYjFkIl0sImJ5IjpbXSwiaSI6InBsYW4tMDkiLCJ4IjoiSGV1dGUgMjAgVWhyLiBWaWRlbyBhbi4gS2VpbmUgQXVzcmVkZW4uIiwic3QiOiJzdGVtcGVsIiwic2siOltdfX0";
  await p.goto(page + link);
  await p.locator("#leaf.got").waitFor();
  assert.equal(await p.locator("#hero").isHidden(), true, "der Kartentext steht nur einmal da, im Bild");
  assert.equal(await p.locator("#pvcard").isVisible(), true);
  assert.equal(await p.locator("#go").textContent(), "Weiter bauen");
  assert.equal(await p.locator("#leaf .kiseal").isHidden(), true, "ohne KI kein Siegel"); assert.equal(await p.locator("#kireport").isVisible(), true, "melden kann man jedes geteilte Blatt");
  await p.locator("#wishgo").tap();
  await p.getByRole("tab", { name: "🎲 Würfel" }).and(p.locator("[aria-selected=true]")).waitFor();
  assert.equal(await p.getByRole("tab", { name: "✨ Wunsch" }).count(), 0, "kein KI-Umfaerben auf der Karte");
  const before = await p.evaluate(() => JSON.stringify(window.DailyDebug.doc()));
  calls.length = 0;
  await p.getByRole("button", { name: "🎲 Würfeln" }).tap();
  const did = p.locator(".aicount", { hasText: "Geändert" });
  await did.waitFor();
  for (const a of ["Stil", "Farbe", "Sticker"]) assert.match(await did.textContent(), new RegExp(a));
  const first = await p.evaluate(() => JSON.stringify(window.DailyDebug.doc()));
  assert.notEqual(first, before); assert.ok(!JSON.parse(first).ki, "ein Wurf ist keine KI");
  await p.getByRole("button", { name: /Rückgängig/ }).tap();
  assert.equal(await p.evaluate(() => JSON.stringify(window.DailyDebug.doc())), before, "rueckgaengig bringt das alte Blatt");
  // same sheet, same roll number -> same look on a second phone
  const n = calls.length, ctx2 = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), p2 = await ctx2.newPage(); await ctx2.route(/^https?:/, (r) => { calls.push(r.request().url()); return r.abort(); }); await p2.goto(page + link); await p2.locator("#leaf.got").waitFor(); await p2.locator("#wishgo").tap();
  await p2.getByRole("button", { name: "🎲 Würfeln" }).tap(); await p2.locator(".aicount", { hasText: "Geändert" }).waitFor();
  const a1 = JSON.parse(first), a2 = await p2.evaluate(() => window.DailyDebug.doc());
  assert.deepEqual([a2.col, a2.st, a2.sk.map((x) => x.e)], [a1.col, a1.st, a1.sk.map((x) => x.e)], "Zufall nur aus dem Seed");
  assert.equal(n, 0, "kein Netz fuer Kosmetik: " + calls.join(" "));
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
  const bar = await p.evaluate(() => { const f = document.getElementById("feat"), tr = f.querySelector(".track"); return { shown: getComputedStyle(f).display !== "none", anim: getComputedStyle(tr).animationName, hidden: Array.from(tr.querySelectorAll("[aria-hidden=true]")).filter((x) => getComputedStyle(x).display !== "none").length, all: tr.children.length }; });
  assert.ok(bar.shown); assert.equal(bar.anim, "none", "das Laufband wartet 3 s (test/e2e/a11y.e2e.js)"); assert.equal(bar.hidden, 0, "keine Kopie, solange es steht");
  await p.locator("#feat").hover();   // like a finger on it: the ticker stands still
  // the bar's button, not #go: on a day whose sheet is a meme (5 Nov) that one says "Meme bauen" too
  await p.locator("#feat").getByRole("button", { name: /Meme bauen/ }).click();
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

test("Blaettern: nach links wischen ist der naechste Tag, nach rechts der Tag davor; Einladungen mit Bild und Kreuz", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.clock.install({ time: new Date("2026-11-10T10:00:00Z") });
  await p.goto(page);
  const box = await p.locator("#leaf").boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
  const swipe = async (dx) => { await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + dx / 3, y, { steps: 3 });
    const ghost = await p.evaluate(() => document.querySelector(".ghost .dnum").textContent); await p.mouse.move(x + dx, y, { steps: 3 }); await p.mouse.up(); await p.clock.runFor(400); return ghost; };
  const day = () => p.evaluate(() => document.getElementById("dnum").textContent);
  assert.equal(await day(), "10");
  assert.equal(await swipe(-240), "11", "links: darunter liegt schon morgen"); assert.equal(await day(), "11");
  assert.equal(await swipe(240), "10", "rechts: darunter liegt der Tag davor"); assert.equal(await day(), "10");
  assert.equal(await swipe(240), "09"); assert.equal(await day(), "09");
  await p.locator("#more").click(); await p.clock.runFor(400); assert.equal(await day(), "10", "Naechster Tag geht vorwaerts");
  await p.locator("#wall").click();
  await p.getByRole("tab", { name: /Einladungen \(0\)/ }).click();
  await p.getByText("Noch keine Einladungen").waitFor();
  let gone = null; await p.route("**/api/s/**", (r) => { gone = r.request().method(); r.fulfill({ status: 204 }); });
  await p.evaluate(() => { window.Kit.store.links = [{ id: "aB3dE5gH", t: "tok", exp: Date.now() + 5 * 86400000, f: "c=eyJ2IjoxfQ", k: "card", th: "data:image/jpeg;base64,/9j/4AAQ" }]; });
  await p.locator("#shback").click(); await p.locator("#wall").click();
  await p.getByRole("tab", { name: /Einladungen \(1\)/ }).click();
  assert.equal(await p.locator(".inv img").count(), 1, "die Einladung zeigt ihr Bild");
  assert.match(await p.locator(".invdate").textContent(), /^bis \d/);
  await p.getByRole("button", { name: /Einladung bis .* löschen/ }).click();
  await p.getByText("Noch keine Einladungen").waitFor();
  assert.equal(gone, "DELETE");
  assert.deepEqual(errs, []);
  await b.close();
});
