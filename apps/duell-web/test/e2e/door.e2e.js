"use strict";
// Advent door from both sides: made and sent on 6 December, opened by someone else with one tap.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");

const PAGE = "file://" + path.resolve(__dirname, "../../dist/index.html");
const shots = process.env.DOOR_SHOTS;
let b;
test.before(async () => { b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); });
test.after(async () => { await b.close(); });

async function phone(opt) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE", ...opt }), p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await ctx.route(/^https?:/, (r) => r.abort());          // no server: the wish answers with the local rules
  await ctx.addInitScript("try{localStorage.setItem('daily.v1',JSON.stringify({muted:true,me:{nick:'Ada'}}))}catch(e){}");
  await p.clock.install({ time: new Date("2026-12-06T10:00:00Z") });
  return { p, errs };
}
async function makeDoor() {
  const { p, errs } = await phone();
  await p.goto(PAGE);
  assert.match(await p.textContent("#hero"), /Adventstürchen/, "am 6. Dezember ist das Türchen das Tagesblatt");
  await p.click("#go");
  await p.getByRole("tab", { name: "Türchen" }).and(p.locator("[aria-selected=true]")).waitFor();
  assert.equal(await p.locator("#panel .chip.on").textContent(), "6", "vorbelegt mit dem heutigen Tag");
  await p.locator("#panel .chip", { hasText: /^7$/ }).click();
  await p.getByRole("tab", { name: "Text" }).click();
  await p.locator("#panel textarea").fill("Für dich: heißer Kakao und gute Laune!");
  await p.getByRole("tab", { name: "✨ Wunsch" }).click();
  await p.getByRole("button", { name: "Sehr weihnachtlich" }).click();
  if (!(await p.evaluate(() => window.DailyDebug.doc().sk.length))) await p.getByText("Wunsch anwenden").click();   // while a tip only fills the field
  await p.waitForFunction(() => window.DailyDebug.doc().sk.length > 0);
  const doc = await p.evaluate(() => window.DailyDebug.doc());
  assert.equal(doc.nr, 7); assert.equal(doc.st, "advent"); assert.equal(doc.x, "Für dich: heißer Kakao und gute Laune!"); assert.ok(doc.sk.length >= 1);
  if (shots) await p.screenshot({ path: path.join(shots, "d1-editor.png") });
  assert.equal(await p.textContent("#edmain"), "Türchen verschicken");
  await p.click("#edmain");
  await p.locator("#done").waitFor();
  const url = await p.evaluate(() => window.DailyDebug.result().url);
  assert.deepEqual(errs, []);
  await p.context().close();
  return { url, doc };
}

test("Adventstuerchen: gestalten, verschicken, beim Empfaenger zu, ein Tipp oeffnet es mit Animation", async () => {
  const { url, doc } = await makeDoor();
  const { p, errs } = await phone();
  await p.goto(PAGE + url.slice(url.indexOf("#")));
  const door = p.locator("#door");
  await door.waitFor();
  assert.equal(await p.textContent("#door .dnr"), "7");
  assert.equal(await p.getAttribute("#door .dshut", "aria-label"), "Türchen 7 öffnen");
  assert.equal(await p.textContent("#door .dhint"), "Tippen zum Öffnen");
  assert.match(await p.textContent("#door .dfrom"), /Ada/);
  assert.equal(await p.locator("#door canvas").isVisible(), false, "vor dem Tipp ist nichts vom Inhalt zu sehen");
  assert.equal(await p.locator("#door .dafter").isVisible(), false);
  if (shots) await p.screenshot({ path: path.join(shots, "d2-zu.png") });
  await p.click("#door .dshut");
  await p.clock.runFor(100);
  const mid = await p.evaluate(() => getComputedStyle(document.querySelector("#door .dleaf.l")).transform);
  assert.notEqual(mid, "none", "die Fluegel schwingen auf");
  await p.clock.runFor(800);
  assert.ok(await p.locator("#door.open canvas").isVisible());
  const ink = await p.evaluate(() => { const c = document.querySelector("#door canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, s = new Set(); for (let i = 0; i < d.length; i += 400) s.add(d[i] + "," + d[i + 1] + "," + d[i + 2]); return s.size; });
  assert.ok(ink > 20, "die Karte ist gemalt: " + ink);
  assert.equal(await p.textContent("#door .dmsg"), doc.x, "die Botschaft steht auch als Text da");
  assert.equal(await p.textContent("#door .dafter .note"), "Gedacht für den 7. Dezember.", "frueh geoeffnet: nur ein Hinweis, keine Sperre");
  if (shots) { await p.clock.runFor(1000); await p.screenshot({ path: path.join(shots, "d3-offen.png") }); }
  await p.getByRole("button", { name: "Eigenes Türchen machen" }).click();
  await p.getByRole("tab", { name: "Türchen" }).and(p.locator("[aria-selected=true]")).waitFor();
  assert.equal(await door.count(), 0);
  const mine = await p.evaluate(() => window.DailyDebug.doc());
  assert.equal(mine.nr, 6); assert.equal(mine.st, "advent"); assert.notEqual(mine.x, doc.x, "ein neues Türchen, nicht das fremde");
  assert.deepEqual(errs, []);
  await p.context().close();
});

test("Adventstuerchen: mit reduzierter Bewegung nur Ueberblenden, Weiter fuehrt zum Blatt; normale Karte kommt ohne Tuer", async () => {
  const { url } = await makeDoor();
  const { p, errs } = await phone({ reducedMotion: "reduce" });
  await p.goto(PAGE + url.slice(url.indexOf("#")));
  await p.locator("#door .dshut").focus(); await p.keyboard.press("Enter");
  await p.locator("#door.open").waitFor();
  assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector("#door .dleaf.l")).transform), "none", "kein Schwingen");
  assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector("#door .dhint")).animationName), "none");
  await p.getByRole("button", { name: "Weiter" }).click();
  assert.equal(await p.locator("#door").count(), 0);
  assert.equal(await p.locator("#home").isVisible(), true);
  const card = await p.evaluate(() => window.Daily.docUrl({ k: "card", x: "Nur eine Karte", col: ["#ffd400", "#ff3b1d"], st: "druck", sk: [], by: [] }));
  await p.goto("about:blank"); await p.goto(PAGE + card.slice(card.indexOf("#")));
  await p.locator("#home").waitFor();
  assert.equal(await p.locator("#door").count(), 0, "nur Türchen kommen geschlossen");
  assert.deepEqual(errs, []);
  await p.context().close();
});
