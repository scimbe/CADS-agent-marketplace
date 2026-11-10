"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const G = require("./lib/grund.js");
let page;
// Web route (lib/grund.js): pages here are reloaded or a device opens several pages; under file:// such a page now and then starts with an empty storage of its own.
test.before(async () => { page = await G.webUrl("index.html"); });

async function setup(motion) {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE", reducedMotion: motion || "no-preference" });
  const errs = [];
  const open = async (hash) => { const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); await p.goto(page + hash); return p; };
  return { b, open, errs };
}

test("Wohlfuehlkarte: Name rein, zwei Tipps bis Teilen; Empfaenger sieht die Karte mit Herzen und schickt eine zurueck", async () => {
  const { b, open, errs } = await setup();
  const s = await open("#i=warm-toll");
  await s.evaluate(() => { window.DailyDebug.me().nick = "Ana"; });
  assert.equal(await s.locator("#go").textContent(), "💛 Karte fertig machen");
  await s.getByLabel("Für wen? (optional)").fill("Lea");
  await s.locator("#go").click();                                                  // Tipp 1: Bild und Link
  await s.waitForFunction(() => window.DailyDebug.result() && window.DailyDebug.result().link);   // Tipp 2 teilt (Redesign W1: der Link entstand bei Fertig)
  assert.equal(await s.locator("#share").textContent(), "An Lea schicken");
  const url = await s.evaluate(() => window.DailyDebug.result().url);
  assert.match(await s.evaluate(() => window.DailyDebug.result().keep.doc.x), /^Lea, ich wollte dir nur mal sagen: Du bist toll\.$/);

  const r = await open(url.slice(url.indexOf("#")));
  await r.locator("#recvwho").filter({ hasText: "Von Ana, für dich" }).waitFor();   // Redesign W1: der Absender oben statt in #from
  assert.equal(await r.locator("#leaf").evaluate((e) => e.classList.contains("warmin")), true);
  assert.ok(await r.locator("#leaf .wh").count() > 0, "kleine Herzen steigen auf");
  assert.equal(await r.locator("#wishgo").isHidden(), true, "fremde Karte wird nicht per KI umgebaut");
  await r.locator("#go").filter({ hasText: "Antworten" }).click();
  assert.equal(await r.getByLabel("Für wen? (optional)").inputValue(), "Ana");
  assert.notEqual(await r.evaluate(() => window.DailyDebug.home().idea.id), "warm-toll");
  assert.equal(await r.locator("#go").textContent(), "💛 Karte fertig machen");
  assert.deepEqual(errs, []); await b.close();
});

test("Wohlfuehlkarte auf Deutsch geschickt, Empfaenger tippt English: der Satz steht auf Englisch, der Name bleibt", async () => {
  const { b, open, errs } = await setup();
  const s = await open("#i=warm-toll");
  await s.getByLabel("Für wen? (optional)").fill("Lea");
  await s.locator("#go").click();
  await s.waitForFunction(() => window.DailyDebug.result() && window.DailyDebug.result().link);
  const url = await s.evaluate(() => window.DailyDebug.result().url);
  const r = await open(url.slice(url.indexOf("#")));
  await r.locator("#recvwho").filter({ hasText: "für dich" }).waitFor();
  await r.evaluate(() => { const d = window.Render.draw; window.__x = []; window.Render.draw = function (c, doc) { window.__x.push(doc.x); return d.apply(this, arguments); }; });
  await r.locator("#langpick button", { hasText: "English" }).click();
  await r.locator("#recvwho").filter({ hasText: "for you" }).waitFor();
  assert.equal((await r.evaluate(() => window.__x)).pop(), "Lea, just wanted to tell you: You're awesome.");
  await r.locator("#langpick button", { hasText: "Deutsch" }).click();
  assert.equal((await r.evaluate(() => window.__x)).pop(), "Lea, ich wollte dir nur mal sagen: Du bist toll.");

  // Eine normale Spruchkarte, auf Deutsch geschickt: nach "English" zeigt auch der Editor (Remix) den englischen Satz.
  const k = await open("#i=karte-einladung");
  await k.locator("#go").click(); await k.locator("#edmain").click(); await k.locator("#share").waitFor();
  const ku = await k.evaluate(() => window.DailyDebug.result().url);
  assert.equal(await k.evaluate(() => window.DailyDebug.result().keep.doc.x), "Heute. Wir. Kein Plan.");   // karte-einladung (karte-spruch was struck, 2026-11)
  const q = await open(ku.slice(ku.indexOf("#")));
  await q.locator("#langpick button", { hasText: "English" }).click();
  await q.locator("#go").click();
  await q.waitForFunction(() => window.DailyDebug.doc());
  assert.equal(await q.evaluate(() => window.DailyDebug.doc().x), "Today. Us. No plan.");
  assert.deepEqual(errs, []); await b.close();
});
test("Wohlfuehlkarte: Beleidigung als Name wird gemeldet und nicht verschickt; Wuerfel laesst sie warm; ruhig ohne Bewegung", async () => {
  const { b, open, errs } = await setup("reduce");
  const s = await open("#i=warm-denke");
  await s.locator("#warmname").fill("Arschloch");
  await s.locator(".warmwarn").filter({ hasText: "Das lassen wir lieber weg." }).waitFor();
  await s.locator("#go").click();
  assert.equal(await s.locator("#home").isVisible(), true, "bleibt auf dem Blatt");
  await s.locator("#warmname").fill("");
  assert.equal(await s.locator("#wishgo").textContent(), "🎲 Look würfeln", "Wohlfuehlkarte: wuerfeln statt KI-Umfaerben");
  await s.locator("#wishgo").click();
  await s.getByRole("button", { name: "🎲 Würfeln" }).click();
  await s.locator(".aicount", { hasText: "Geändert" }).waitFor();
  assert.equal(await s.evaluate(() => window.DailyDebug.doc().st), "herz");
  const r = await open("#i=warm-sorry");
  await r.evaluate(() => { const D = window.Daily; location.hash = D.docUrl(window.Warm.cardFor(D.byId("warm-sorry"), "", D.sanitizeProfile({ nick: "Ben" }), "de")).split("#")[1]; });
  await r.locator("#recvwho").filter({ hasText: "Von Ben, für dich" }).waitFor();
  assert.equal(await r.locator("#leaf").evaluate((e) => getComputedStyle(e).animationName), "none");
  assert.equal(await r.locator("#leaf .wh").first().isVisible(), false);
  assert.deepEqual(errs, []); await b.close();
});
