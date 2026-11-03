"use strict";
// Business flavor: the same engine with its own catalog and look. Each phone is its own browser context, so the only
// thing that reaches the next person is the link.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium, devices } = require("playwright");
const root = path.resolve(__dirname, "../..");
const page = "file://" + path.join(root, "dist/business/index.html");
const shot = process.env.SHOT_DIR;
const hash = (u) => "#" + u.split("#")[1];
execFileSync(process.execPath, [path.join(root, "scripts/build.js"), "--flavor", "business"]);

async function setup() {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }), errs = [];
  const open = async (h) => {
    const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }); ctx.setDefaultTimeout(15000);
    const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(String(e))); await p.goto(page + (h || "")); return p;
  };
  return { b, open, errs };
}
const url = (p) => p.evaluate(() => window.DailyDebug.result().url);
const next = (p) => p.getByRole("button", { name: "Weiter", exact: true }).click();
const type = async (p, v) => { await p.locator("#panel input.field").first().fill(v); await next(p); };
const pick = async (p, v) => { await p.locator("#panel .chip", { hasText: v }).click(); await next(p); };
const send = async (p) => { await p.locator("#edmain").click(); await p.locator("#share").waitFor(); return url(p); };
const org = (u) => JSON.parse(Buffer.from(u.split("#c=")[1], "base64url").toString()).o;
const snap = (p, n) => shot ? p.screenshot({ path: shot + "/" + n + ".png" }) : null;

test("Umfrage ueber drei Geraete: Firmenfarbe reist im Link, Empfaenger stimmen ab, Stand steht auf der Karte", async () => {
  const { b, open, errs } = await setup();
  const a = await open();
  assert.equal(await a.title(), "Daily Business");
  await a.locator("#orglogo").click();
  await a.locator("#shbody input[type=color]").evaluate((e) => { e.value = "#0f766e"; });
  await a.locator("#shbody input.field").fill("acm"); await snap(a, "biz-org");
  await a.getByRole("button", { name: "Übernehmen" }).click();
  assert.equal(await a.locator("#orglogo").textContent(), "ACM"); await snap(a, "biz-home");

  await a.goto(page + "#i=biz-umfrage-lunch"); await a.locator("#go").click();
  await type(a, "Ana"); await type(a, "Wo essen wir am Freitag?");
  const opts = a.locator("#panel input.field"); await opts.nth(0).fill("Pizza"); await opts.nth(1).fill("Sushi"); await opts.nth(2).fill("Salat"); await next(a);
  await pick(a, "Sushi"); await a.getByText("Eingetragen").waitFor(); await snap(a, "biz-poll-editor");
  const one = await send(a);
  assert.deepEqual(org(one), { c: "#0f766e", n: "ACM" });
  assert.ok(one.startsWith("https://bunsenbrenner.org/business#c="), "eigener Pfad, langer Link: " + one.slice(0, 50));

  const c = await open(hash(one));
  assert.equal(await c.locator("#orglogo").textContent(), "ACM", "Empfaenger sieht die Firma des Absenders");
  assert.equal(await c.evaluate(() => getComputedStyle(document.body).getPropertyValue("--org").trim()), "#0f766e");
  assert.match(await c.locator("#from").textContent(), /Beitrag 2 von bis zu 10/);
  await snap(c, "biz-poll-received");
  await c.locator("#go").click(); await c.locator("#panel input.field").first().fill("ana");
  assert.ok(await c.getByRole("button", { name: "Weiter", exact: true }).isDisabled(), "derselbe Name stimmt nicht zweimal ab");
  await c.locator("#panel input.field").first().fill("Ben"); await next(c);
  await c.locator("#panel").getByText("Vorne: Sushi").waitFor();
  await pick(c, "Pizza"); const two = await send(c);

  const d = await open(hash(two));
  assert.deepEqual(await d.evaluate(() => window.Office.face(window.DailyDebug.home().doc, "de")), ["Wo essen wir am Freitag?", "Gleichstand: Pizza · Sushi", "2 Stimmen bisher"]);
  await snap(d, "biz-poll-standing");
  assert.deepEqual(errs, []); await b.close();
});

test("Aufgaben verteilen bis keine mehr offen ist, Agenda bietet die Webconference an", async () => {
  const { b, open, errs } = await setup();
  const a = await open("#i=biz-aufgaben"); await a.locator("#go").click();
  await type(a, "Sommerfest"); const f = a.locator("#panel input.field"); await f.nth(0).fill("Grill"); await f.nth(1).fill("Musik"); await next(a);
  let u = await send(a);
  for (const [who, job] of [["Ben", "Musik"], ["Cem", "Grill"]]) {
    const p = await open(hash(u)); await p.locator("#go").click(); await type(p, who); await pick(p, job); u = await send(p);
  }
  const r = await open(hash(u));
  assert.match(await r.locator("#from").textContent(), /Abgeschlossen/);
  await r.locator("#go").click(); await r.locator("#panel").getByText("Grill → Cem").waitFor(); await snap(r, "biz-tasks-done");

  const g = await open("#i=biz-agenda"); await g.locator("#go").click();
  await type(g, "Weekly"); await g.locator("#panel input.field").first().fill("Zahlen Q3"); await next(g); await type(g, "Ana");
  const h = await open(hash(await send(g))); await h.locator("#go").click();
  await h.getByRole("button", { name: "Webconference starten" }).waitFor(); await snap(h, "biz-agenda");
  assert.deepEqual(errs, []); await b.close();
});

test("Die Jugend-App bleibt wie sie ist und oeffnet trotzdem einen Business-Link", async () => {
  execFileSync(process.execPath, [path.join(root, "scripts/build.js")]);
  const { b, open, errs } = await setup();
  const g = await open("#i=biz-feedback-meeting");
  await g.locator("#go").click(); await type(g, "Workshop Montag");
  const link = await send(g);
  const y = await b.newPage(); y.on("pageerror", (e) => errs.push(String(e)));
  await y.goto("file://" + path.join(root, "dist/index.html") + hash(link));
  assert.equal(await y.title(), "My Daily Idea");
  assert.equal(await y.locator("#orglogo").count(), 0);
  await y.locator("#go").click(); await y.locator("#panel input[type=range]").waitFor();
  assert.deepEqual(errs, []); await b.close();
});

// Company network: only the file itself loads; every other host is refused by the proxy or silently dropped,
// WebSockets are cut, and what does come through is slow. Nothing may hang, every block is said out loud.
async function firewalled(b, mode) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), errs = [], asked = [];
  ctx.setDefaultTimeout(15000);
  await ctx.route("**/*", (r) => {
    const u = r.request().url(); if (u.startsWith("file:")) return r.continue();
    asked.push(u); return mode === "drop" ? undefined : r.abort("blockedbyclient");   // drop: no answer at all
  });
  await ctx.routeWebSocket(/.*/, (ws) => { asked.push(ws.url()); ws.close(); });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(String(e)));
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 600, downloadThroughput: 32 * 1024, uploadThroughput: 16 * 1024 });
  return { p, errs, asked };
}
for (const mode of ["refuse", "drop"]) {
  test("Firmennetz (" + mode + "): Karten laufen ohne Netz, Webconference sagt in Sekunden, dass sie gesperrt ist", async () => {
    const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
    const { p, errs, asked } = await firewalled(b, mode);
    const t0 = Date.now(); await p.goto(page); await p.locator("#go").waitFor();
    assert.ok(Date.now() - t0 < 5000, "Startseite haengt am Netz");
    assert.equal(await p.locator("#cogo").isVisible(), false); assert.equal(await p.locator("#livego").isVisible(), false);
    const t1 = Date.now();
    await p.locator("#feat button", { hasText: "Webconference" }).click();
    await p.getByText("Die Webconference ist aus diesem Netz nicht erreichbar").waitFor({ timeout: 6000 });
    assert.ok(Date.now() - t1 < 5000, "Rueckmeldung zu spaet: " + (Date.now() - t1) + " ms");
    assert.ok(asked.every((u) => u.startsWith("https://webconference.bunsenbrenner.org/")), "nur der eine Tipp geht raus: " + asked.join(" "));
    if (shot && mode === "refuse") await p.screenshot({ path: shot + "/biz-blocked.png" });
    await p.goto(page + "#i=biz-aufgaben"); await p.locator("#go").click();
    await type(p, "Umzug"); const f = p.locator("#panel input.field"); await f.nth(0).fill("Kisten"); await f.nth(1).fill("Transporter"); await next(p);
    assert.match(await send(p), /#c=/);
    assert.deepEqual(errs, []); await b.close();
  });
}
test("Firmennetz offen fuer die eigene Domain: der Tipp oeffnet die Webconference", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" });
  await ctx.route("https://webconference.bunsenbrenner.org/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>WC</title>" }));
  const p = await ctx.newPage(); await p.goto(page);
  const [tab] = await Promise.all([ctx.waitForEvent("page"), p.locator("#feat button", { hasText: "Webconference" }).click()]);
  await tab.waitForLoadState(); assert.equal(tab.url(), "https://webconference.bunsenbrenner.org/");
  assert.equal(await p.getByText("nicht erreichbar").count(), 0);
  await b.close();
});
