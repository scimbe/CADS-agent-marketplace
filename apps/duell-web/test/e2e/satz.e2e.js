"use strict";
// Satz zu Formular (MVP 3): a sentence in, the card filled after a visible check. The server is mocked with answers in
// the exact shape of CADS-DEMO-wrapper kinds plan/liste; the date is fixed to Thursday 5.11.2026 in Berlin, so the dates
// the page computes are known here. Time from opening the card to the share screen is measured with typing at a human pace.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium, devices } = require("playwright");
const root = path.resolve(__dirname, "../..");
const page = "file://" + path.join(root, "dist/index.html");
const API = "https://demos-34a13a96.bunsenbrenner.org/api/duell/";
const shot = process.env.SHOT_DIR;
const NOW = new Date("2026-11-05T12:00:00+01:00");
const hash = (u) => "#" + u.split("#")[1];
const H = "vDMtxRFE7esJZs-TyEzH75ZZMZ1-6dy7EJb5z2NHUnk";
const blank = { wochentage: [], tageszeiten: [], uhrzeit: "", dauer_min: 0, zeitraum: "offen", ort: "offen", mitbringen: [], budget_eur: 0, thema: "", ideen: [], regeltext: "" };
const plan = (o) => Object.assign({ art: "termin" }, blank, o);
// The live answers of 5.11.2026 (scratchpad probe), unchanged.
const LIVE_PLAN = plan({ art: "einladung", titel: "Grillabend", wochentage: ["sa"], tageszeiten: ["abends"], zeitraum: "naechstes_wochenende", ort: "zuhause", mitbringen: ["salat"] });
const LIVE_LIST = { art: "einkauf", titel: "Grillabend", personen: 8, vegetarisch: 2, aufgaben: [], posten: [
  { n: "Bratwurst", kat: "fleisch_fisch", m: "pro_person", e: "stueck", veg: false }, { n: "Gemuese", kat: "obst_gemuese", m: "nach_bedarf", e: "kg", veg: true },
  { n: "Brötchen", kat: "backwaren", m: "pro_person", e: "stueck", veg: true }, { n: "Grillsoße", kat: "gewuerze_saucen", m: "fix", e: "flasche", veg: true },
  { n: "Holzkohle", kat: "sonstiges", m: "fix", e: "packung", veg: true }, { n: "Grillzange", kat: "haushalt", m: "fix", e: "stueck", veg: true },
  { n: "Salat", kat: "obst_gemuese", m: "nach_bedarf", e: "bund", veg: true }, { n: "Käse", kat: "milch_kaese", m: "nach_bedarf", e: "g", veg: true },
  { n: "Getränke", kat: "getraenke", m: "pro_person", e: "l", veg: true }, { n: "Servietten", kat: "haushalt", m: "fix", e: "packung", veg: true }] };

let b;
test.before(async () => { b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); });
test.after(async () => { await b.close(); });

// answers: satz -> [status, option or body]. Each AI call gets its own receipt; accept and discard are counted.
async function phone(answers, o = {}) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE", timezoneId: "Europe/Berlin" }), errs = [], sent = [];
  ctx.setDefaultTimeout(15000);
  await ctx.clock.setFixedTime(NOW);
  const me = Object.assign({ nick: "Mia" }, o.me || {});
  await ctx.addInitScript("try{localStorage.setItem('daily.v1',JSON.stringify({muted:true,me:" + JSON.stringify(me) + ",aiDev:'0123456789abcdef0123456789abcdef',aiProof:'e2e'}))}catch(e){}");
  let n = 0;
  await ctx.route(/^https?:/, async (r) => {
    const u = r.request().url();
    if (answers && u.startsWith(API)) {
      const p0 = u.slice(API.length), body = JSON.parse(r.request().postData() || "null"); sent.push({ path: p0, body });
      const meter = { free: 7, remaining: 6, period: "week" };
      if (p0 === "ai/accept" || p0 === "ai/discard") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ meter }) });
      if (p0 === "ai") {
        const a = answers(body.input);
        await new Promise((ok) => setTimeout(ok, o.ms == null ? 1500 : o.ms));         // about the server's p50 (PR #94: plan 1.5 s, liste 3.1 s)
        if (!a) return r.abort();
        if (a[0] !== 200) return r.fulfill({ status: a[0], contentType: "application/json", body: JSON.stringify(a[1]) });
        n++; return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ kind: body.kind, options: [a[1]], seals: ["s2." + body.kind + ".e2e" + n + ".sigsigsig"], hashes: [H], cost: 1, receipt: "rc-satz-" + n, meter }) });
      }
    }
    return r.abort();
  });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
  await p.goto((o.page || page) + (o.hash || ""));
  return { p, errs, sent, ctx };
}
const typeIn = (p, s) => p.locator(".satz input.field").first().pressSequentially(s, { delay: 45 });
async function ask(p, s) {
  await p.getByRole("button", { name: "✨ Aus einem Satz" }).tap();
  await typeIn(p, s);
  await p.getByRole("button", { name: "✨ Vorschlag" }).tap();
  await p.locator(".satzrev .satzki").waitFor();
}
const take = (p) => p.locator(".satzrev").getByRole("button", { name: "Übernehmen" }).tap();
const next = (p) => p.evaluate(() => window.DailyApp.ed().next);
const slotsOf = (p) => p.evaluate(() => { const n = window.DailyApp.ed().next; return n ? window.Turns.moves(n)[0][0][1].map((s) => window.Turns.slotText(s, "de")) : null; });
const snap = async (p, name) => { if (!shot) return; await p.waitForTimeout(400); await p.screenshot({ path: path.join(shot, "wb2-satzform-" + name + ".png") }); };
const waitSent = async (sent, path0) => { for (let i = 0; i < 100 && !sent.some((x) => x.path === path0); i++) await new Promise((ok) => setTimeout(ok, 30)); return sent.filter((x) => x.path === path0); };

test("Termin aus einem Satz: Regeln von der KI, Termine von der App, gepruefte Uebernahme mit Siegel; Oeffnen bis Teilen unter 30 s; .ics fuer den fuehrenden Termin", async () => {
  const { p, errs, sent, ctx } = await phone(() => [200, LIVE_PLAN], { hash: "#i=zug-termin" });
  const t0 = Date.now();
  await p.locator("#go").tap();
  await ask(p, "Grillen bei mir nächsten Samstagabend, bringt Salat mit");
  const rev = p.locator(".satzrev");
  assert.match(await rev.locator(".satzki").textContent(), /^✨ KI-Vorschlag · Siegel ✓ vDMtxRFE$/);
  assert.equal(await rev.locator(".note").first().textContent(), "Erkannt: Sa · abends · nächstes Wochenende · bei mir · Bringt mit: Salat");
  assert.deepEqual(await rev.locator(".chip.on").allTextContents(), ["Sa 7.11., 18 Uhr", "Sa 14.11., 18 Uhr"]);
  await snap(p, "termin-pruefen");
  assert.equal((await waitSent(sent, "ai/accept")).length, 0, "vor dem Uebernehmen nichts abgebucht");
  await take(p);
  await p.getByText("Fertig. Schick es in die Gruppe.").waitFor();      // complete, so the step went on by itself
  assert.deepEqual(await slotsOf(p), ["Sa 7.11., 18 Uhr", "Sa 14.11., 18 Uhr"]);
  await p.locator("#edmain").tap(); await p.locator("#share").waitFor();
  const ms = Date.now() - t0;
  console.log("# Termin: Oeffnen -> Teilen " + ms + " ms, 4 Taps (Aus einem Satz, Vorschlag, Uebernehmen, Senden)");
  assert.ok(ms < 30000, "Oeffnen bis Teilen " + ms + " ms");
  const ai = sent.filter((x) => x.path === "ai");
  assert.equal(ai.length, 1); assert.deepEqual(ai[0].body.input, { art: "einladung", satz: "Grillen bei mir nächsten Samstagabend, bringt Salat mit" });
  assert.deepEqual((await waitSent(sent, "ai/accept")).map((x) => x.body.receipt), ["rc-satz-1"]);
  const url = await p.evaluate(() => window.DailyDebug.result().url), doc = await p.evaluate(() => window.DailyDebug.doc());
  assert.equal(doc.t, "Grillabend"); assert.equal(doc.s, "bei mir · Bringt mit: Salat"); assert.deepEqual(doc.ki, { k: "plan", s: "s2.plan.e2e1.sigsigsig", h: H });
  await snap(p, "termin-teilen");
  // the person who gets the link: the KI badge on the card, the calendar file for the date that leads
  const q = await ctx.newPage(); q.on("pageerror", (e) => errs.push(e.message)); await q.goto(page + hash(url));
  await q.locator("#leaf .kiseal:not([hidden])").waitFor(); await q.locator("#go").tap();
  await q.getByRole("button", { name: "📅 In den Kalender (.ics)" }).tap();
  await q.waitForFunction(() => window.SatzUI && window.SatzUI.last);
  const ics = await q.evaluate(() => window.SatzUI.last);
  assert.match(ics, /DTSTART:20261107T180000\r\nDTEND:20261107T190000\r\nSUMMARY:Grillabend\r\n/);
  assert.equal(await q.locator("#panel .chips").nth(1).getByRole("button", { name: "Vielleicht" }).count(), 1, "die Abstimmung darunter ist unveraendert");
  await snap(q, "termin-empfang");
  assert.deepEqual(errs, []); await ctx.close();
});

test("Einkaufszettel aus Anlass: Posten von der KI, Mengen aus der Regeltabelle, Profil-Haushalt als abwaehlbarer Chip, fuegt sich in die Liste; unter 30 s", async () => {
  const { p, errs, sent, ctx } = await phone((i) => [200, /Grill/.test(i.satz) ? LIVE_LIST : null], { hash: "#i=zug-einkauf", me: { nick: "Mia", pref: { hh: 3, age: "a18" } } });
  const t0 = Date.now();
  await p.locator("#go").tap();
  await p.locator("#panel .shopadd input.field").fill("Senf"); await p.locator("#panel .shopadd input.field").press("Enter");   // already on the list by hand
  await p.getByRole("button", { name: "✨ Aus einem Satz" }).tap();
  await p.locator(".satz .pfuse .chip").waitFor();
  assert.deepEqual(await p.locator(".satz .pfuse .chip").allTextContents(), ["3 Pers."]);
  await typeIn(p, "Grillabend für 8, 2 vegetarisch");
  await p.getByRole("button", { name: "✨ Vorschlag" }).tap();
  const rev = p.locator(".satzrev"); await rev.locator(".satzki").waitFor();
  assert.equal(await rev.locator(".satzn").textContent(), "8 Personen · davon 2 vegetarisch", "die Zahl aus dem Satz vor dem Profil");
  const rows = await rev.locator(".chip.on").allTextContents();
  assert.deepEqual(rows.slice(0, 3), ["12× Bratwurst", "Gemuese (nach Bedarf)", "16× Brötchen"]); assert.ok(rows.includes("Getränke 8 l"));
  await rev.getByRole("button", { name: "Grillzange" }).tap();                 // one change: the tongs are there already
  await snap(p, "einkauf-pruefen");
  await take(p);
  await p.locator("#panel .shoprow").filter({ hasText: "12× Bratwurst" }).waitFor();
  const labels = await p.evaluate(() => window.Turns.shopRows(window.Turns.moves(window.DailyApp.ed().next)[0][0]).map((r) => r.label));
  assert.equal(labels[0], "Senf"); assert.ok(labels.includes("16× Brötchen") && labels.includes("Getränke 8 l") && !labels.includes("Grillzange"));
  await p.locator("#edmain").tap(); await p.locator("#share").waitFor();
  const ms = Date.now() - t0;
  console.log("# Einkauf: Oeffnen -> Teilen " + ms + " ms, 1 Aenderung");
  assert.ok(ms < 30000);
  const ai = sent.filter((x) => x.path === "ai");
  assert.deepEqual(ai[0].body.input, { art: "einkauf", satz: "Grillabend für 8, 2 vegetarisch", ctx: "Haushalt 3 Personen" });
  assert.deepEqual(await p.evaluate(() => window.DailyDebug.doc().ki.k), "liste"); assert.equal(await p.evaluate(() => window.DailyDebug.doc().t), "Grillabend");
  await snap(p, "einkauf-teilen");
  assert.deepEqual(errs, []); await ctx.close();
});

test("Profil-Chip abgewaehlt: geht nicht mit und rechnet nicht mit; ohne Zahl im Satz zaehlt der Haushalt", async () => {
  const PF = { art: "einkauf", titel: "Pfannkuchen", personen: 0, vegetarisch: 0, aufgaben: [], posten: [{ n: "Mehl", kat: "trockenwaren", m: "pro_person", e: "g", veg: true }, { n: "Eier", kat: "milch_kaese", m: "pro_person", e: "stueck", veg: true }] };
  const { p, errs, sent, ctx } = await phone(() => [200, PF], { hash: "#i=zug-einkauf", me: { nick: "Mia", pref: { hh: 3, age: "a18" } }, ms: 200 });
  await p.locator("#go").tap();
  await ask(p, "Pfannkuchen zum Frühstück");
  assert.equal(await p.locator(".satzn").textContent(), "3 Personen");
  assert.deepEqual(await p.locator(".satzrev .chip.on").allTextContents(), ["Mehl 300 g", "3× Eier"]);
  await p.locator(".satz .pfuse .chip").tap();
  await p.getByRole("button", { name: "✨ Vorschlag" }).tap();
  await p.locator(".satzrev .satzki").waitFor();
  assert.equal(await p.locator(".satzn").textContent(), "4 Personen (angenommen)");
  const ai = sent.filter((x) => x.path === "ai");
  assert.equal(ai[0].body.input.ctx, "Haushalt 3 Personen"); assert.equal(ai[1].body.input.ctx, undefined);
  assert.deepEqual((await waitSent(sent, "ai/discard")).map((x) => x.body.receipt), ["rc-satz-1"], "die erste Antwort blieb unberuehrt und geht zurueck");
  assert.deepEqual(errs, []); await ctx.close();
});

test("Wichteln aus einem Satz: Namen bleiben auf dem Handy und fuellen die Liste, Budget/Thema/Ideen auf die Karte", async () => {
  const W = plan({ art: "wichteln", titel: "Bücherwichteln", budget_eur: 15, thema: "Bücher", ideen: ["buch", "selbstgemacht"], regeltext: "Jeder schenkt ein Buch bis 15 Euro." });
  const { p, errs, sent, ctx } = await phone(() => [200, W], { hash: "#i=zug-wichteln" });
  const t0 = Date.now();
  await p.locator("#go").tap();
  await ask(p, "Wichteln mit Anna, Ben, Carla und Dana, 15 Euro, Thema Bücher");
  assert.deepEqual(sent.filter((x) => x.path === "ai")[0].body.input, { art: "wichteln", satz: "Wichteln mit [Name], [Name], [Name], [Name], 15 Euro, Thema Bücher" });
  assert.ok(!JSON.stringify(sent).includes("Anna"), "kein Name geht raus");
  assert.deepEqual(await p.locator(".satzrev .chip.on").allTextContents(), ["Buch", "Selbstgemachtes", "Anna", "Ben", "Carla", "Dana"]);
  await snap(p, "wichteln-pruefen");
  await take(p);
  await p.locator("#edmain:not(.wait)").waitFor();
  await p.locator("#edmain").tap(); await p.locator("#share").waitFor();
  console.log("# Wichteln: Oeffnen -> Teilen " + (Date.now() - t0) + " ms");
  assert.ok(Date.now() - t0 < 30000);
  const doc = await p.evaluate(() => window.DailyDebug.doc());
  assert.equal(doc.t, "Bücherwichteln"); assert.equal(doc.s, "Budget 15 € · Bücher · Buch, Selbstgemachtes");
  assert.deepEqual(await p.evaluate(() => window.Turns.moves(window.DailyDebug.result().keep.next || window.DailyApp.ed().next)[0][0].filter(Boolean)), ["Anna", "Ben", "Carla", "Dana"]);
  assert.deepEqual(errs, []); await ctx.close();
});

test("Ohne Netz: der Termin-Satz wird lokal gelesen (ehrlich 'Ohne KI erkannt', ohne Siegel, nichts abgebucht); die Liste bleibt von Hand", async () => {
  const { p, errs, sent, ctx } = await phone(() => null, { hash: "#i=zug-termin", ms: 0 });
  await p.locator("#go").tap();
  await ask(p, "Bandprobe Montag oder Mittwoch ab 18 Uhr, drei Stunden");
  assert.equal(await p.locator(".aistate").textContent(), "KI gerade nicht erreichbar. Nichts verbraucht.");
  assert.equal(await p.locator(".satzrev .satzki").textContent(), "⚙ Ohne KI erkannt");
  assert.deepEqual(await p.locator(".satzrev .chip.on").allTextContents(), ["Mo 9.11., 18 Uhr", "Mi 11.11., 18 Uhr", "Mo 16.11., 18 Uhr", "Mi 18.11., 18 Uhr"]);
  await snap(p, "termin-ohne-ki");
  await take(p); await p.getByText("Fertig. Schick es in die Gruppe.").waitFor();
  const doc = await p.evaluate(() => window.DailyDebug.doc());
  assert.equal(doc.ki, undefined); assert.equal(doc.t, "Bandprobe");
  assert.equal(sent.filter((x) => x.path.startsWith("ai/")).length, 0);
  assert.deepEqual(errs, []); await ctx.close();
});

test("Krise: der zentrale Hinweis aus ai.js (aiCrisis), lokal erkannt geht nichts raus; 422 crisis zeigt nie den Servertext; kind_ok sagt ehrlich nein; Verwerfen gibt die Aktion zurueck", async () => {
  const T = require("../../src/texts.json");
  const { p, errs, sent, ctx } = await phone((i) => /ritze/.test(i.satz) ? [422, { error: "blocked", why: "crisis", help: "SERVERTEXT" }]
    : /Mutprobe/.test(i.satz) ? [422, { error: "blocked", why: "kind_ok" }] : [200, LIVE_PLAN], { hash: "#i=zug-termin", ms: 0 });
  await p.locator("#go").tap();
  await ask(p, "Grillen am Samstag").catch(() => {});
  await p.locator(".satzrev").getByRole("button", { name: "Verwerfen" }).tap();
  assert.deepEqual((await waitSent(sent, "ai/discard")).map((x) => x.body.receipt), ["rc-satz-1"]);
  const f = p.locator(".satz input.field").first(), asked = () => sent.filter((x) => x.path === "ai").length;
  await f.fill("Ich will nicht mehr leben"); await p.getByRole("button", { name: "✨ Vorschlag" }).tap();
  await p.locator(".aistate", { hasText: "116 111" }).waitFor();
  assert.equal(await p.locator(".aistate").textContent(), T.de.aiCrisis, "der eine Krisenhinweis der Seite");
  assert.equal(asked(), 1, "lokal erkannt: der Satz verlaesst das Handy nicht");
  await snap(p, "krise");
  await f.fill("Ich ritze am Samstag"); await p.getByRole("button", { name: "✨ Vorschlag" }).tap();
  await waitSent(sent, "ai"); for (let i = 0; i < 100 && asked() < 2; i++) await p.waitForTimeout(30);
  await p.locator(".aistate", { hasText: "116 111" }).waitFor();
  assert.equal(await p.locator(".aistate").textContent(), T.de.aiCrisis); assert.equal(await p.getByText("SERVERTEXT").count(), 0, "nie der Text des Servers");
  await f.fill("Mutprobe am Samstag"); await p.getByRole("button", { name: "✨ Vorschlag" }).tap();
  await p.locator(".aistate", { hasText: T.de.aiKind }).waitFor();
  assert.equal(await p.locator(".satzrev").count(), 0); assert.equal(await next(p), null);
  assert.equal(sent.filter((x) => x.path === "ai/accept").length, 0);
  assert.deepEqual(errs, []); await ctx.close();
});

test("Review B2 #1: ein Datum im Satz ('am 12.11.') wird der Termin, mit und ohne KI", async () => {
  const { p, errs, sent, ctx } = await phone((i) => /KI/.test(i.satz) ? [200, plan({ titel: "Treffen", uhrzeit: "19:00" })] : null, { hash: "#i=zug-termin", ms: 0 });
  await p.locator("#go").tap();
  await ask(p, "Treffen am 12.11. um 19 Uhr KI");
  assert.match(await p.locator(".satzrev .note").first().textContent(), /^Erkannt: Do 12\.11\. · 19:00$/);
  assert.deepEqual(await p.locator(".satzrev .chip.on").allTextContents(), ["Do 12.11., 19 Uhr"]);
  await take(p);
  await p.locator("#panel .chips").first().waitFor();
  assert.deepEqual(await slotsOf(p) || await p.evaluate(() => window.DailyApp.ed().pre && window.DailyApp.ed().pre.slots.map((s) => window.Turns.slotText(s, "de"))), ["Do 12.11., 19 Uhr"]);
  await p.evaluate(() => { const D = window.Daily, i = D.byId("zug-termin"); window.DailyApp.openEditor(D.docFromIdea(i, window.DailyApp.me(), "de"), { idea: i }); });
  await ask(p, "Treffen am 12.11. um 19 Uhr");      // no network: the local rules
  assert.equal(await p.locator(".satzrev .satzki").textContent(), "⚙ Ohne KI erkannt");
  assert.deepEqual(await p.locator(".satzrev .chip.on").allTextContents(), ["Do 12.11., 19 Uhr"]);
  assert.deepEqual(errs, []); await ctx.close();
});

test("Review B2 #2: Namensliste mit Gruppenwort: kein Name geht raus, die Namen fuellen trotzdem die Liste", async () => {
  const W = plan({ art: "wichteln", titel: "Wichteln", budget_eur: 10 });
  const { p, errs, sent, ctx } = await phone(() => [200, W], { hash: "#i=zug-wichteln", ms: 0 });
  await p.locator("#go").tap();
  await ask(p, "Wichteln mit Jorinde, Kasimir, Wendelin und Familie, 10 Euro");
  assert.equal(sent.filter((x) => x.path === "ai")[0].body.input.satz, "Wichteln mit [Name], [Name], [Name], Familie, 10 Euro");
  assert.ok(!/Jorinde|Kasimir|Wendelin/.test(JSON.stringify(sent)), "kein Name geht raus");
  assert.deepEqual(await p.locator(".satzrev .chip.on").allTextContents(), ["Jorinde", "Kasimir", "Wendelin"]);
  assert.deepEqual(errs, []); await ctx.close();
});

test("Review B2 #3: ohne Auswahl ist Uebernehmen aus, nichts wird abgebucht; Verwerfen gibt die Aktion zurueck", async () => {
  const { p, errs, sent, ctx } = await phone(() => [200, LIVE_PLAN], { hash: "#i=zug-termin", ms: 0 });
  await p.locator("#go").tap();
  await ask(p, "Grillen bei mir nächsten Samstagabend");
  const rev = p.locator(".satzrev"), btn = rev.getByRole("button", { name: "Übernehmen" });
  for (const c of await rev.locator(".chips .chip").all()) await c.tap();
  assert.equal(await rev.locator(".chip.on").count(), 0);
  assert.equal(await btn.isDisabled(), true, "nichts gewaehlt: Uebernehmen aus");
  await btn.evaluate((b) => b.click());
  await p.waitForTimeout(300);
  assert.equal(sent.filter((x) => x.path === "ai/accept").length, 0, "nichts abgebucht");
  assert.equal(await next(p), null, "nichts uebernommen");
  await rev.locator(".chips .chip").first().tap();
  assert.equal(await btn.isDisabled(), false, "wieder einer gewaehlt: Uebernehmen an");
  await rev.locator(".chips .chip").first().tap();
  await rev.getByRole("button", { name: "Verwerfen" }).tap();
  assert.deepEqual((await waitSent(sent, "ai/discard")).map((x) => x.body.receipt), ["rc-satz-1"]);
  assert.equal(sent.filter((x) => x.path === "ai/accept").length, 0);
  assert.deepEqual(errs, []); await ctx.close();
});

/* Acceptance (concept, MVP 3: over 70 % taken with at most one change). Twelve sentences from the golden set
   (CADS-DEMO-wrapper test/fixtures/duell-golden.json). The answers are the shapes the golden checks demand; plan-09 is
   the real miss of both golden runs (morgens missing). Each case says what the person wants and which taps get there;
   the test checks the card really holds that and counts the taps. */
const T = (s) => s;      // the date texts the page shows
const CASES = [
  { id: "plan-01", satz: "Fußballtraining jeden Dienstag und Donnerstag abends", opt: plan({ titel: "Fußballtraining", wochentage: ["di", "do"], tageszeiten: ["abends"] }), want: (s) => s.length >= 2 && s.every((x) => /^(Di|Do) .*18 Uhr$/.test(x)) },
  { id: "plan-02", satz: "Elternabend nächste Woche, irgendwann nachmittags, eine Stunde", opt: plan({ titel: "Elternabend", tageszeiten: ["nachmittags"], zeitraum: "naechste_woche", dauer_min: 60 }), want: (s) => s.length >= 2 && s.every((x) => /\b(9|1[0-5])\.11\., 15 Uhr$/.test(x)) },
  { id: "plan-06", satz: "Kaffee mit Oma diesen Sonntag nachmittag", opt: plan({ titel: "Kaffee mit Oma", wochentage: ["so"], tageszeiten: ["nachmittags"], zeitraum: "dieses_wochenende" }), add: 1, want: (s) => s.includes(T("So 8.11., 15 Uhr")) },
  { id: "plan-07", satz: "Bandprobe Montag oder Mittwoch ab 18 Uhr, drei Stunden", opt: plan({ titel: "Bandprobe", wochentage: ["mo", "mi"], uhrzeit: "18:00", dauer_min: 180 }), want: (s) => s.length >= 2 && s.every((x) => /^(Mo|Mi) .*18 Uhr$/.test(x)) },
  { id: "plan-09", satz: "Laufen gehen im Park am Samstagmorgen", opt: plan({ titel: "Laufen im Park", wochentage: ["sa"], ort: "park" }), want: (s) => s.length >= 2 && s.every((x) => /^Sa .*10 Uhr$/.test(x)), taps: 3 },
  { id: "plan-10", satz: "Arzttermin in zwei Wochen am Freitag vormittags", opt: plan({ titel: "Arzttermin", wochentage: ["fr"], tageszeiten: ["vormittags"], zeitraum: "in_zwei_wochen" }), add: 1, want: (s) => s.includes(T("Fr 20.11., 10 Uhr")) },
  { id: "plan-11", satz: "Spieleabend im nächsten Monat, freitags oder samstags", opt: plan({ art: "einladung", titel: "Spieleabend", wochentage: ["fr", "sa"], tageszeiten: ["abends"], zeitraum: "naechsten_monat" }), want: (s) => s.length === 5 && s.every((x) => /^(Fr|Sa) .*\.12\., 18 Uhr$/.test(x)) },
  { id: "plan-13", satz: "Grillparty bei mir nächsten Samstag ab 17 Uhr, bringt Salat mit", opt: plan({ art: "einladung", titel: "Grillparty", wochentage: ["sa"], uhrzeit: "17:00", zeitraum: "naechstes_wochenende", ort: "zuhause", mitbringen: ["salat"] }), want: (s) => s.includes(T("Sa 14.11., 17 Uhr")) && s.length >= 2 },
  { id: "liste-01", list: true, satz: "Grillabend für 8, 2 vegetarisch", opt: LIVE_LIST, want: (l) => l.includes("12× Bratwurst") && l.includes("16× Brötchen") },
  { id: "liste-02", list: true, satz: "Spaghetti Bolognese für 4", opt: { art: "einkauf", titel: "Spaghetti Bolognese", personen: 4, vegetarisch: 0, aufgaben: [], posten: [{ n: "Spaghetti", kat: "trockenwaren", m: "pro_person", e: "g", veg: true }, { n: "Hackfleisch", kat: "fleisch_fisch", m: "pro_person", e: "g", veg: false }, { n: "Tomaten", kat: "konserven", m: "pro_person", e: "dose", veg: true }, { n: "Zwiebel", kat: "obst_gemuese", m: "fix", e: "stueck", veg: true }, { n: "Parmesan", kat: "milch_kaese", m: "nach_bedarf", e: "g", veg: true }] }, want: (l) => l.includes("Spaghetti 400 g") && l.includes("Hackfleisch 800 g") },
  { id: "liste-08", list: true, satz: "Frühstück für 2 am Sonntag", opt: { art: "einkauf", titel: "Sonntagsfrühstück", personen: 2, vegetarisch: 0, aufgaben: [], posten: [{ n: "Brötchen", kat: "backwaren", m: "pro_person", e: "stueck", veg: true }, { n: "Butter", kat: "milch_kaese", m: "fix", e: "packung", veg: true }, { n: "Marmelade", kat: "suesses_snacks", m: "fix", e: "glas", veg: true }, { n: "Eier", kat: "milch_kaese", m: "pro_person", e: "stueck", veg: true }] }, want: (l) => l.includes("4× Brötchen") && l.includes("2× Eier") },
  { id: "liste-14", list: true, satz: "Picknick für 4 im Park", opt: { art: "einkauf", titel: "Picknick", personen: 4, vegetarisch: 0, aufgaben: [], posten: [{ n: "Baguette", kat: "backwaren", m: "pro_person", e: "stueck", veg: true }, { n: "Äpfel", kat: "obst_gemuese", m: "pro_person", e: "stueck", veg: true }, { n: "Grillkohle", kat: "sonstiges", m: "fix", e: "packung", veg: true }, { n: "Wasser", kat: "getraenke", m: "pro_person", e: "flasche", veg: true }] }, drop: "Grillkohle", want: (l) => !l.some((x) => /Grillkohle/.test(x)) && l.includes("8× Baguette") }
];

test("Abnahme: ueber 70 % der Vorschlaege mit hoechstens 1 Aenderung uebernommen (12 Saetze aus dem Golden-Set), jeder unter 30 s", async () => {
  const by = Object.fromEntries(CASES.map((c) => [c.satz, c.opt]));
  const { p, errs, ctx } = await phone((i) => [200, by[i.satz]], { ms: 1500 });
  const rows = [];
  for (const c of CASES) {
    await p.evaluate((g) => { const D = window.Daily, i = D.byId(g); window.DailyApp.openEditor(D.docFromIdea(i, window.DailyApp.me(), "de"), { idea: i }); }, c.list ? "zug-einkauf" : "zug-termin");
    const t0 = Date.now();
    await ask(p, c.satz);
    let taps = c.taps || 0;
    if (c.drop) { await p.locator(".satzrev").getByRole("button", { name: c.drop }).tap(); taps++; }
    await take(p);
    let got;
    if (c.list) {
      await p.locator("#panel .shoprow").first().waitFor();
      got = await p.evaluate(() => window.Turns.shopRows(window.Turns.moves(window.DailyApp.ed().next)[0][0]).map((r) => r.label));
    } else {
      if (c.add) {      // one date only: one more day tapped for the poll (the next day of the same time), then on
        await p.locator("#panel .chips").nth(1).locator(".chip:not(.on)").first().tap(); taps++;
        await p.getByRole("button", { name: "Weiter", exact: true }).tap();
      }
      await p.getByText("Fertig. Schick es in die Gruppe.").waitFor();
      got = await slotsOf(p);
    }
    const ok = c.want(got), ms = Date.now() - t0;
    rows.push({ id: c.id, ok, taps, ms, took: ok && taps <= 1 });
    assert.ok(ms < 30000, c.id + " " + ms + " ms");
    if (c.id === "plan-09") assert.equal(ok, false, "plan-09 bleibt ein ehrlicher Fehlgriff (18 statt morgens)");
    else assert.ok(ok, c.id + ": " + JSON.stringify(got));
  }
  const rate = rows.filter((r) => r.took).length / rows.length;
  console.log("# Abnahme: " + rows.map((r) => r.id + (r.took ? " ✓" : " ✗") + " " + r.taps + "Ae " + r.ms + "ms").join(" | "));
  console.log("# Abnahme: " + rows.filter((r) => r.took).length + "/" + rows.length + " = " + Math.round(rate * 1000) / 10 + " % mit <= 1 Aenderung");
  assert.ok(rate > 0.7, "Quote " + rate);
  assert.deepEqual(errs, []); await ctx.close();
});

test("Business: Aufgabenliste fuers Event aus einem Satz, Fristen vom Event-Tag zurueckgerechnet, wird ein Abhak-Link mit .ics", async () => {
  execFileSync(process.execPath, [path.join(root, "scripts/build.js"), "--flavor", "business"]);
  const A = { art: "aufgaben", titel: "Sommerfest", personen: 0, vegetarisch: 0, posten: [], aufgaben: [
    { was: "Raum buchen", frist: "2_wochen_vorher", wer: "" }, { was: "Location anfragen", frist: "2_wochen_vorher", wer: "" }, { was: "Einladungen verschicken", frist: "2_wochen_vorher", wer: "" }, { was: "Catering bestellen", frist: "1_woche_vorher", wer: "" },
    { was: "Deko besorgen", frist: "3_tage_vorher", wer: "" }, { was: "Aufbauen", frist: "am_tag", wer: "" }, { was: "Fotos teilen", frist: "danach", wer: "" }] };
  const { p, errs, sent, ctx } = await phone(() => [200, A], { page: "file://" + path.join(root, "dist/business/index.html"), hash: "#i=biz-aufgaben-event" });
  const t0 = Date.now();
  await p.locator("#go").tap();
  await ask(p, "Sommerfest der Firma am 12.12.");
  assert.equal(sent.filter((x) => x.path === "ai")[0].body.input.art, "aufgaben");
  assert.equal(await p.locator(".satzrev input[type=date]").inputValue(), "2026-12-12");
  assert.deepEqual(await p.locator(".satzrev .chip.on").allTextContents(), ["Raum buchen · bis Sa 28.11.", "Einladungen verschicken · bis Sa 28.11.", "Catering bestellen · bis Sa 5.12.", "Deko besorgen · bis Mi 9.12.", "Aufbauen · bis Sa 12.12.", "Fotos teilen · bis So 13.12."]);
  assert.equal(await p.locator(".satzrev .note", { hasText: "weggelassen" }).textContent(), "1 weggelassen: keine Orte oder Kontakte im Link.", "'Location' nimmt die Liste nicht: gesehen = gesendet");
  await snap(p, "aufgaben-pruefen");
  const btn = p.locator(".satzrev").getByRole("button", { name: "Übernehmen" }), chips = await p.locator(".satzrev .chips .chip").all();
  for (const c of chips) await c.tap();
  assert.equal(await btn.isDisabled(), true, "Review B2 #3: keine Aufgabe gewaehlt, Uebernehmen aus");
  await btn.evaluate((b) => b.click()); await p.waitForTimeout(200);
  assert.equal(sent.filter((x) => x.path === "ai/accept").length, 0, "nichts abgebucht ohne Aufgabe");
  for (const c of chips) await c.tap();
  await take(p);
  await p.locator("#panel .shoprow").filter({ hasText: "Raum buchen" }).waitFor();
  await p.locator("#edmain").tap(); await p.locator("#share").waitFor();
  console.log("# Aufgaben: Oeffnen -> Teilen " + (Date.now() - t0) + " ms");
  assert.ok(Date.now() - t0 < 30000);
  const doc = await p.evaluate(() => window.DailyDebug.doc());
  assert.equal(doc.g, "todo"); assert.equal(doc.t, "Sommerfest"); assert.equal(doc.ki.k, "liste");
  assert.deepEqual((await waitSent(sent, "ai/accept")).map((x) => x.body.receipt), ["rc-satz-1"], "abgebucht erst nach dem Uebernehmen, nicht zurueckgegeben beim Wechsel");
  assert.equal(sent.filter((x) => x.path === "ai/discard").length, 0);
  assert.deepEqual(errs, []); await ctx.close();
});
