"use strict";
const { ensureBuilt } = require("../../scripts/ensure-build.js");
// Business flavor: the same engine with its own catalog and look. Each phone is its own browser context, so the only
// thing that reaches the next person is the link.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const G = require("./lib/grund.js");
const root = path.resolve(__dirname, "../..");
let page;
// Web route (lib/grund.js): pages here are reloaded or a device opens several pages; under file:// such a page now and then starts with an empty storage of its own.
test.before(async () => { page = await G.webUrl("business/index.html"); });
const shot = process.env.SHOT_DIR;
const hash = (u) => "#" + u.split("#")[1];
ensureBuilt("business");   // dist as npm run test:e2e built it; a build only after an edit

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
  assert.ok(one.startsWith("https://demos-34a13a96.bunsenbrenner.org/duell/business/#c="), "eigener Pfad, langer Link: " + one.slice(0, 50));

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
  ensureBuilt("");
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
// file:// on purpose: the app from its bundle in a company network (throttled, every host blocked); one document, the
// second goto only changes the hash (lib/grund.js: the web route is for reloads and several pages).
const FILE = "file://" + path.join(root, "dist/business/index.html");
for (const mode of ["refuse", "drop"]) {
  test("Firmennetz (" + mode + "): Karten laufen ohne Netz, Webconference sagt in Sekunden, dass sie gesperrt ist", async () => {
    const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
    const { p, errs, asked } = await firewalled(b, mode);
    const t0 = Date.now(); await p.goto(FILE); await p.locator("#go").waitFor();
    assert.ok(Date.now() - t0 < 5000, "Startseite haengt am Netz");
    assert.equal(await p.locator("#cogo").isVisible(), false); assert.equal(await p.locator("#livego").isVisible(), false);
    const t1 = Date.now();
    await G.alle(p); await p.locator("#feat .lane").hover(); await p.locator("#feat .lane button:not([aria-hidden])", { hasText: "Webconference" }).click();
    await p.getByText("Die Webconference ist aus diesem Netz nicht erreichbar").waitFor({ timeout: 6000 });
    assert.ok(Date.now() - t1 < 5000, "Rueckmeldung zu spaet: " + (Date.now() - t1) + " ms");
    // besides the tap only the picture of the day's card (KI-Bild, thumbs.e2e.js), which the blocked net simply leaves out
    const pic = /^https:\/\/demos-34a13a96\.bunsenbrenner\.org\/duell\/img\/biz-[a-z0-9-]+\.jpg$/;
    assert.ok(asked.every((u) => u.startsWith("https://webconference.bunsenbrenner.org/") || pic.test(u)), "nur der eine Tipp geht raus: " + asked.join(" "));
    assert.ok(asked.filter((u) => pic.test(u)).length <= 1, "hoechstens das eine Bild");
    if (shot && mode === "refuse") await p.screenshot({ path: shot + "/biz-blocked.png" });
    await p.goto(FILE + "#i=biz-aufgaben"); await p.locator("#go").click();
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
  await G.alle(p); await p.locator("#feat .lane").hover();
  const [tab] = await Promise.all([ctx.waitForEvent("page"), p.locator("#feat .lane button:not([aria-hidden])", { hasText: "Webconference" }).click()]);
  await tab.waitForLoadState(); assert.equal(tab.url(), "https://webconference.bunsenbrenner.org/");
  assert.equal(await p.getByText("nicht erreichbar").count(), 0);
  await b.close();
});

// ---------- Stufe 2: Onboarding, Feedback-Auswertung, Folgetermin (part "biz"), with a mocked AI server ----------
const API = "https://demos-34a13a96.bunsenbrenner.org/api/duell/";
const METER = { free: 7, remaining: 6, period: "week" };
async function phoneApi(b, api) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, locale: "de-DE" }), errs = [], sent = [];
  ctx.setDefaultTimeout(15000);
  await ctx.route(/^https?:/, async (r) => {
    const u = r.request().url();
    if (G.isLocal(u)) return r.fallback();   // the page itself (web route)
    if (u.startsWith(API)) { const p0 = u.slice(API.length), body = JSON.parse(r.request().postData() || "null"); sent.push({ path: p0, body }); const a = api && api(p0, body); if (a) return r.fulfill({ status: a[0], contentType: "application/json", body: JSON.stringify(a[1]) }); }
    return r.abort();
  });
  const open = async (h) => { const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(String(e))); await p.goto(page + (h || "")); return p; };
  return { ctx, open, errs, sent };
}
const until = async (f) => { for (let i = 0; i < 100 && !f(); i++) await new Promise((ok) => setTimeout(ok, 50)); };

test("Onboarding: Startdatum + Rolle -> feste Checkliste mit Fristen; KI ergaenzt Aufgaben, sichtbar vor dem Uebernehmen, mit Siegel; ohne KI geht es auch", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const OPT = { art: "aufgaben", titel: "Onboarding Vertrieb", personen: 0, vegetarisch: 0, posten: [], aufgaben: [
    { was: "CRM-Zugang einrichten", frist: "1_woche_vorher", wer: "" }, { was: "Kundenliste übergeben", frist: "danach", wer: "" },
    { was: "Begrüßung und Rundgang", frist: "am_tag", wer: "" }, { was: "Produktschulung buchen", frist: "3_tage_vorher", wer: "" }] };
  const { ctx, open, errs, sent } = await phoneApi(b, (p0) => p0 === "ai" ? [200, { kind: "liste", options: [OPT], seals: ["s2.liste.k1.onboard0001"], hashes: [], cost: 1, receipt: "rc-ob-1", meter: METER }] : p0 === "ai/accept" ? [200, { final: true, meter: METER }] : null);
  const a = await open("#i=biz-onboarding");
  await a.locator("#go").click();
  await a.getByLabel("Erster Arbeitstag").waitFor();
  assert.equal(await a.locator(".bizlist li").count(), 8, "die feste Vorlage steht sofort da");
  const day1 = await a.getByLabel("Erster Arbeitstag").inputValue();
  assert.equal(new Date(day1 + "T00:00:00Z").getUTCDay(), 1, "Vorschlag: ein Montag");
  await a.getByLabel("Erster Arbeitstag").fill("2026-12-07"); await a.getByLabel("Erster Arbeitstag").dispatchEvent("change");
  await a.locator(".bizlist li", { hasText: "Begrüßung und Rundgang" }).getByText("bis Mo 7.12.").waitFor();
  await a.locator(".bizlist li", { hasText: "Arbeitsplatz und Technik bestellen" }).getByText("bis Mo 23.11.").waitFor();
  await a.getByLabel("Rolle (ohne Namen)").fill("Vertrieb");
  await snap(a, "wb2-business-onboard");
  await a.getByRole("button", { name: "✨ Aufgaben für die Rolle ergänzen" }).click();
  const opt = a.locator(".aiopt"); await opt.waitFor();
  assert.equal(await opt.innerText(), "✨ +3 Aufgaben übernehmen:\n• CRM-Zugang einrichten\n• Kundenliste übergeben\n• Produktschulung buchen", "vollstaendig sichtbar, Doppeltes faellt weg");
  await opt.scrollIntoViewIfNeeded(); await snap(a, "wb2-business-onboard-ki");
  assert.equal(await a.locator(".bizlist li.ki").count(), 0, "nichts uebernommen, bevor man tippt");
  await opt.click();
  await a.locator(".bizlist li.ki").nth(2).waitFor();
  await a.locator(".bizlist li", { hasText: "CRM-Zugang einrichten" }).getByText("bis Mo 30.11.").waitFor();
  await a.getByRole("button", { name: "Streichen: Kundenliste übergeben" }).click();
  assert.equal(await a.locator(".bizlist li.ki").count(), 2);
  await until(() => sent.some((x) => x.path === "ai/accept"));
  const ask = sent.find((x) => x.path === "ai").body;
  assert.equal(ask.kind, "liste"); assert.equal(ask.input.art, "aufgaben");
  assert.equal(ask.input.satz, "Erste Wochen im neuen Team vorbereiten, Rolle: Vertrieb", "nur die Rolle, kein Name, kein Datum");
  assert.deepEqual(sent.find((x) => x.path === "ai/accept").body.receipt, "rc-ob-1");
  await a.locator("#edmain").filter({ hasText: "Checkliste anlegen" }).click();
  await a.locator("#panel .shoprow").first().waitFor();
  const doc = await a.evaluate(() => window.DailyDebug.doc());
  assert.equal(doc.t, "Onboarding: Vertrieb"); assert.equal(doc.g, "todo");
  assert.equal(doc.ki.k, "liste"); assert.equal(doc.ki.s, "s2.liste.k1.onboard0001", "KI-Anteil traegt das Siegel"); assert.match(doc.ki.h, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await a.locator("#panel .shoprow").count(), 10);
  await snap(a, "wb2-business-onboard-list");
  const u = await send(a);
  const r = await open(hash(u));
  assert.equal(await r.locator("#leaf .kiseal").isVisible(), true, "Empfaenger sieht 'KI'");
  await snap(r, "wb2-business-onboard-received");
  // without a server: the plan alone, no seal
  await ctx.unroute(/^https?:/); await ctx.route(/^https?:/, (x) => (G.isLocal(x.request().url()) ? x.fallback() : x.abort()));
  const o = await open("#i=biz-onboarding"); await o.locator("#go").click();
  await o.getByRole("button", { name: "✨ Aufgaben für die Rolle ergänzen" }).click();
  await o.locator(".aistate").getByText("KI gerade nicht erreichbar. Nichts verbraucht.").waitFor();
  await o.locator("#edmain").filter({ hasText: "Checkliste anlegen" }).click(); await o.locator("#panel .shoprow").first().waitFor();
  assert.equal(await o.locator("#panel .shoprow").count(), 8);
  assert.equal((await o.evaluate(() => window.DailyDebug.doc())).ki, undefined);
  assert.deepEqual(errs, []); await b.close();
});

const NOTES = ["Zu lang ohne Pause", "Ziel war unklar", "Gute Praxisbeispiele", "Pausen fehlten", "Mehr Zeit für Fragen"];
const fbLink = (p, notes) => p.evaluate((n) => {
  const D = window.Daily, Tn = window.Turns, i = D.byId("biz-feedback-workshop");
  let d = D.docFromIdea(i, window.DailyApp.me(), "de"); d.seed = 4242;
  d = Tn.play(d, ["Workshop Montag"], 0);
  n.forEach((x, k) => { d = Tn.play(d, [1 + (k % 5), [x]], 0); });
  return "#" + D.docUrl(d).split("#")[1];
}, notes);
test("Feedback: ab 5 Notizen 3 Themen + 1 Vorschlag; Notizen gemischt und ohne Namen raus, Betriebsrat-Hinweis, Retro-Agenda mit Siegel; alter Server ehrlich", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  let answer = { art: "feedback", titel: "Workshop", themen: ["Zeitrahmen", "Praxisbezug", "Zielklarheit"], vorschlag: "Beim nächsten Mal Ziel und Pausen gleich zu Beginn festlegen.", posten: [], aufgaben: [] };
  const { open, errs, sent } = await phoneApi(b, (p0) => p0 === "ai" ? [200, { kind: "liste", options: [answer], seals: ["s2.liste.k1.feedback001"], hashes: [], cost: 1, receipt: "rc-fb-" + sent.length, meter: METER }] : /^ai\/(accept|discard)$/.test(p0) ? [200, { meter: METER }] : null);
  const s = await open();
  const four = await open(await fbLink(s, NOTES.slice(0, 4))); await four.locator("#go").click();
  await four.getByText("✨ Auswertung ab 5 Notizen · bisher 4").waitFor();
  assert.equal(await four.getByRole("button", { name: /3 Themen/ }).count(), 0);
  const a = await open(await fbLink(s, NOTES)); await a.locator("#go").click();
  await a.getByText("Nur Themen, nie Personen.", { exact: false }).waitFor();
  assert.match(await a.locator(".bizbox").innerText(), /Betriebsrat/);
  await a.getByRole("button", { name: "✨ 3 Themen + 1 Vorschlag" }).click();
  const opt = a.locator(".aiopt"); await opt.waitFor();
  assert.equal(await opt.innerText(), "1. Zeitrahmen\n2. Praxisbezug\n3. Zielklarheit\n→ Beim nächsten Mal Ziel und Pausen gleich zu Beginn festlegen.");
  await opt.scrollIntoViewIfNeeded(); await snap(a, "wb2-business-feedback-ki");
  const ask = sent.find((x) => x.path === "ai").body;
  assert.equal(ask.input.art, "feedback");
  assert.deepEqual(ask.input.notizen.slice().sort(), NOTES.slice().sort(), "genau die Notizen, sonst nichts");
  assert.notDeepEqual(ask.input.notizen, NOTES, "gemischt");
  assert.deepEqual(Object.keys(ask.input).sort(), ["art", "notizen"], "kein Thema-Titel, keine Noten, keine Namen");
  await opt.click();
  await a.locator(".bizseal").getByText("✨ Mit KI erstellt · Siegel").waitFor();
  await a.getByRole("button", { name: "Kopieren" }).scrollIntoViewIfNeeded(); await snap(a, "wb2-business-feedback-result");
  await a.getByRole("button", { name: "Als Retro-Agenda weitergeben" }).click();
  await a.getByText("Eingetragen").waitFor();
  const doc = await a.evaluate(() => window.DailyDebug.doc());
  assert.equal(doc.ki.s, "s2.liste.k1.feedback001"); assert.match(doc.ki.h, /^[A-Za-z0-9_-]{43}$/, "Options-Hash fuers Melden");
  const u = await send(a);
  const r = await open(hash(u));
  assert.deepEqual(await r.evaluate(() => window.Office.face(window.DailyDebug.home().doc, "de")), ["Retro: Workshop Montag", "1. Zeitrahmen (Moderation)", "2. Praxisbezug (Moderation)", "3. Zielklarheit (Moderation)"]);
  assert.equal(await r.locator("#leaf .kiseal").isVisible(), true);
  await snap(r, "wb2-business-retro-received");
  // a server without art feedback answers with a shopping list; a quoting answer is dropped too: said, and given back AT
  // ONCE (Review B2, Befund 4): no button to tap, the discard goes out without a tap, so closing the app loses nothing
  for (const [bad, say] of [[{ art: "einkauf", titel: "x", personen: 0, vegetarisch: 0, posten: [{ n: "Brot", kat: "backwaren", m: "fix", e: "stueck", veg: true }], aufgaben: [] }, "noch nicht auswerten"],
    [{ ...answer, themen: ["Zeitrahmen", "Pausen fehlten", "Zielklarheit"] }, "zitiert"]]) {
    answer = bad; const n0 = sent.length;
    const c = await open(await fbLink(s, NOTES)); await c.locator("#go").click();
    await c.getByRole("button", { name: "✨ 3 Themen + 1 Vorschlag" }).click();
    await c.locator(".aistate", { hasText: say }).waitFor();
    assert.equal(await c.locator(".aiopt").count(), 0, "nothing to take: " + say);
    await until(() => sent.slice(n0).some((x) => x.path === "ai/discard"));
    const back = sent.slice(n0).filter((x) => x.path === "ai/discard");
    assert.equal(back.length, 1, "zurueckgegeben ohne Antippen: " + say); assert.match(back[0].body.receipt, /^rc-fb-/);
    assert.equal(await c.locator(".bizseal").count(), 0);
    await c.close();
  }
  // a crisis in a note: the page's one crisis line (aiCrisis, ai.js), also for "Ich kann nicht mehr." alone; nothing is sent
  answer = { art: "feedback", titel: "W", themen: ["Zeitrahmen", "Praxisbezug", "Zielklarheit"], vorschlag: "Ziel zu Beginn klären.", posten: [], aufgaben: [] };
  for (const note of ["Ich will nicht mehr leben", "Ich kann nicht mehr."]) {
    const n0 = sent.length;
    const k = await open(await fbLink(s, [...NOTES.slice(0, 4), note])); await k.locator("#go").click();
    await k.locator(".bizhelp").getByText("Klingt, als ginge es dir gerade nicht gut.", { exact: false }).waitFor();
    assert.match(await k.locator(".bizhelp").innerText(), /116 111.*0800 111 0 111/);
    await k.getByRole("button", { name: "✨ 3 Themen + 1 Vorschlag" }).click();
    await k.locator(".aistate[role=alert]").waitFor();
    assert.equal(sent.slice(n0).filter((x) => x.path === "ai").length, 0, "nothing sent: " + note);
    await k.close();
  }
  // a work topic is no crisis: no help line, the evaluation goes out
  const w = await open(await fbLink(s, [...NOTES.slice(0, 4), "Burnout-Thema ansprechen"])); await w.locator("#go").click();
  await w.getByRole("button", { name: "✨ 3 Themen + 1 Vorschlag" }).click(); await w.locator(".aiopt").waitFor();
  assert.equal(await w.locator(".bizhelp").count(), 0);
  assert.deepEqual(errs, []); await b.close();
});

test("Folgetermin aus dem Protokoll: offene Aufgaben werden ohne KI zur Agenda-Karte, Betriebsrat-Hinweis, kein Aufruf nach draussen", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const { open, errs, sent } = await phoneApi(b, () => null);
  const payload = { t: "Weekly", i: [["Angebot schicken", "Ana", 0], ["Raum buchen", "", 0], ["Budget prüfen", "Ben", 0]] };
  const a = await open("#todo=" + Buffer.from(JSON.stringify(payload)).toString("base64url"));
  await a.locator("#panel .shoprow").first().waitFor();
  await a.getByRole("button", { name: "🗓 Agenda-Link aus offenen Aufgaben" }).waitFor();
  assert.match(await a.locator(".bizbox").innerText(), /Ohne KI, nur aus dieser Liste\. Gibt es einen Betriebsrat/);
  // Review B2, Befund 5: one place for the next meeting; the list's own text chip "🗓 Folgetermin" is gone, its text stays as "copy"
  assert.equal(await a.getByRole("button", { name: "🗓 Folgetermin", exact: true }).count(), 0, "kein zweiter Folgetermin-Knopf");
  assert.equal(await a.locator(".bizbox").getByRole("button", { name: "Tagesordnung kopieren" }).count(), 1);
  await a.locator(".bizbox").scrollIntoViewIfNeeded(); await snap(a, "wb2-business-folgetermin");
  await a.getByRole("button", { name: "🗓 Agenda-Link aus offenen Aufgaben" }).click();
  await a.getByText("Eingetragen").waitFor();
  const u = await send(a);
  const r = await open(hash(u));
  assert.deepEqual(await r.evaluate(() => window.Office.face(window.DailyDebug.home().doc, "de")), ["Folgetermin: Weekly", "1. Ana: Angebot schicken (Moderation)", "2. Raum buchen (Moderation)", "3. Ben: Budget prüfen (Moderation)"]);
  assert.equal(await r.locator("#leaf .kiseal").isVisible(), false, "ohne KI kein Siegel");
  await r.locator("#go").click(); await r.getByRole("button", { name: "Webconference starten" }).waitFor();
  await snap(r, "wb2-business-folgetermin-agenda");
  assert.deepEqual(sent, [], "nichts an den KI-Server");
  assert.deepEqual(errs, []); await b.close();
});

// Daily Business has no free card (feats without f_create): no deck part in dist, no button under "Vergangene", no deck request.
test("Business ohne freie Karte: kein Teil deck im dist, kein Knopf Community-Karten, keine Abfrage von deck, deck/me, mod/me", async () => {
  const fs = require("node:fs");
  assert.ok(!fs.readdirSync(path.join(root, "dist/business/parts")).some((f) => f.startsWith("deck.")), "dist/business/parts ohne deck");
  const { b, open, errs } = await setup(), asked = [];
  try {
    const p = await open();
    p.on("request", (r) => { if (/^https?:/.test(r.url())) asked.push(r.url()); });
    assert.equal(await p.evaluate(() => "deck" in window.DailyParts), false);
    await p.locator("#past").tap();
    await p.locator("#pastq").waitFor();
    await p.locator("#pastq").fill("stern");
    assert.equal(await p.getByRole("button", { name: "Community-Karten" }).count(), 0);
    await p.waitForTimeout(300);
    assert.deepEqual(asked.filter((u) => /\/api\/duell\/(deck|mod)/.test(u)), []);
    assert.notEqual(await p.locator("#toast").textContent(), "Dieser Teil fehlt gerade. Bitte die Seite neu laden.");
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test("Ohne Server (ADR 0005): kein Teil stimme im Business-Build, keine Daumen, kein Request darauf oder an die Statistik", async () => {
  const dir = path.join(root, "dist/business/parts"), files = require("node:fs").readdirSync(dir);
  assert.ok(files.length > 5 && !files.some((f) => /^stimme\./.test(f)), files.join(" "));
  assert.ok(!/"stimme":|vote_q|root\.Stimme/.test(require("node:fs").readFileSync(path.join(root, "dist/business/index.html"), "utf8")), "nicht im Manifest, nicht im Kern");
  // no cards in Business: no weather part, its words neither in the core, no Mal & Rat part; My style and the report dialog are there
  assert.ok(!files.some((f) => /^(wetter|malen|dart)\./.test(f)) && files.some((f) => /^stil\./.test(f)) && files.some((f) => /^melden\./.test(f)), files.join(" "));
  assert.ok(!/"wetter":|"wx[A-Z]/.test(require("node:fs").readFileSync(path.join(root, "dist/business/index.html"), "utf8")), "kein Wetter im Business-Kern");
  assert.ok(!/"malen":/.test(require("node:fs").readFileSync(path.join(root, "dist/business/index.html"), "utf8")), "Mal & Rat nicht im Business-Manifest");
  assert.ok(!/"dart":/.test(require("node:fs").readFileSync(path.join(root, "dist/business/index.html"), "utf8")), "Dart nicht im Business-Manifest");
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), asked = [], errs = [];
  ctx.on("request", (r) => { if (/\/parts\/stimme\.|\/api\/duell\/stat/.test(r.url())) asked.push(r.url()); });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(page); await p.waitForFunction(() => document.body.getAttribute("data-state") !== "boot");
  await p.waitForTimeout(500);
  assert.equal(await p.locator("#votes").isHidden(), true);
  assert.deepEqual(await p.evaluate(() => window.Parts.names().filter((n) => n === "stimme")), [], "das Vorladen im Web (parts.js) kennt ihn nicht");
  assert.deepEqual(asked, []); assert.deepEqual(errs, []);
  await b.close();
});

// #164 locks the main button with a dashed frame on paper (core style.css); the flavor's .press{border:0} took the frame's
// width away, so the locked button read as plain text. Locked: a visible dashed frame in the org colour, text and frame
// readable (WCAG 1.4.3 text >= 4.5:1, 1.4.11 frame >= 3:1 against the button and the page), axe clean.
const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number);
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
test("Gesperrter Hauptknopf im Business-Flavor: gestrichelter Rahmen in der Firmenfarbe, lesbar, axe ohne Verstoesse", async () => {
  const AXE = require("node:fs").readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  const { b, open, errs } = await setup();
  const p = await open("#i=biz-umfrage-lunch"); await p.locator("#go").click();
  const main = p.locator("#edmain");
  await p.waitForFunction(() => document.getElementById("edmain").textContent === "Weiter");
  assert.equal(await main.getAttribute("aria-disabled"), "true");
  const look = () => main.evaluate((e) => { const s = getComputedStyle(e); return { w: ["Top", "Right", "Bottom", "Left"].map((k) => parseFloat(s["border" + k + "Width"])), st: s.borderTopStyle, bc: s.borderTopColor, bg: s.backgroundColor, fg: s.color, op: s.opacity, page: getComputedStyle(document.querySelector(".foot") || document.body).backgroundColor, org: getComputedStyle(document.body).getPropertyValue("--org").trim() }; });
  const s = await look(); await snap(p, "biz-press-wait");
  assert.ok(s.w.every((w) => w > 0), "Rahmenbreite > 0: " + s.w);
  assert.equal(s.st, "dashed"); assert.equal(Number(s.op), 1);
  assert.deepEqual(rgb(s.bc), rgb(await p.evaluate((h) => { const d = document.createElement("i"); d.style.color = h; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; }, s.org)), "Rahmen in der Firmenfarbe");
  assert.ok(ratio(s.fg, s.bg) >= 4.5, "Text " + ratio(s.fg, s.bg).toFixed(2));
  assert.ok(ratio(s.bc, s.bg) >= 3 && ratio(s.bc, s.page) >= 3, "Rahmen " + ratio(s.bc, s.bg).toFixed(2) + " / " + ratio(s.bc, s.page).toFixed(2));
  await p.addScriptTag({ content: AXE });
  const v = await p.evaluate(() => window.axe.run(document.getElementById("editor"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })
    .then((r) => r.violations.map((x) => x.id + ": " + x.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", "))));
  assert.deepEqual(v, []);
  // open again: the filled button of the flavor, no frame
  await p.locator("#panel input.field").first().fill("Ana");
  await p.waitForFunction(() => document.getElementById("edmain").getAttribute("aria-disabled") === "false");
  const o = await look();
  assert.deepEqual(o.w, [0, 0, 0, 0]); assert.deepEqual(rgb(o.bg), rgb(s.bc));
  assert.deepEqual(errs, []); await b.close();
});
