"use strict";
// KI with honest states: one way into the flight game, the queue's place, the way without AI, the seal and the report.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const G = require("./lib/grund.js");
// The option hashes as the server computes them, fixed here and not recomputed with the page's own canonical(): sha256 over
// canonical() from CADS-DEMO-wrapper lib/duell-seal.mjs, base64url, 43 characters.
// H_WELT is the hash the live server sent with this very option (2026-11-05, "hashes"), so it also checks canonical().
const H_WISH = "DW_OmSXV_rx6BCXNzLlcYiO2vjKxt5zg3PHI0YWqxmU", H_WELT = "3tcKq21IwdMq89hVw0ASV5MnYO6RX-JkYugqLugtlsA", H_A1 = "asJ4aPWdc5Trd1BDmMIfIx2J4nDtTckXhCLKhpOleeU", H_B2 = "z11WpVDZ1RrrQn4TIOXG0sDEiqtSUPvXYbKxtqg3Alw";
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const API = "https://demos-34a13a96.bunsenbrenner.org/api/duell/";
let b;
test.before(async () => { b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); });
test.after(async () => { await b.close(); });

// o.web: from G's local web origin instead of file:// (for a test that reloads the page, see lib/grund.js webUrl)
async function phone(api, o) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), p = await ctx.newPage(), errs = [], sent = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await ctx.route(/^https?:/, async (r) => {
    const u = r.request().url();
    if (G.isLocal(u)) return r.fallback();   // the page itself (o.web)
    if (api && u.startsWith(API)) { const path0 = u.slice(API.length), body = JSON.parse(r.request().postData() || "null"); sent.push({ path: path0, body }); const a = api(path0, body); if (a) return r.fulfill({ status: a[0], contentType: "application/json", body: JSON.stringify(a[1]) }); }
    return r.abort();
  });
  await p.goto(o && o.web ? await G.webUrl("index.html") : page);
  return { p, errs, sent };
}
const openGame = (p) => p.evaluate(() => { const D = window.Daily, i = D.IDEAS.find((x) => x.kind === "game"); window.DailyApp.openEditor(D.docFromIdea(i, window.DailyApp.me(), "de"), { idea: i, tab: "Rules" }); });

test("Flugspiel: ein einziger Einstieg 'Was willst du fliegen?'; ohne Server baut die Regel-Erkennung eine Welt, ehrlich markiert, ohne Siegel", async () => {
  const { p, errs } = await phone(null);
  await openGame(p);
  await p.getByRole("tab", { name: "Regeln" }).and(p.locator("[aria-selected=true]")).waitFor();
  assert.equal(await p.locator("#panel input:not([type=range]), #panel textarea").count(), 0, "kein zweites Beschreiben-Feld in den Regeln");
  assert.equal(await p.getByRole("button", { name: /^✨ Bauen$/ }).count(), 0);
  await p.getByRole("button", { name: "✨ Was willst du fliegen?" }).tap();
  await p.getByRole("tab", { name: "✨ Wunsch" }).and(p.locator("[aria-selected=true]")).waitFor();
  await p.getByLabel("Was willst du fliegen?").fill("Unter Wasser mit Fischen");
  await p.getByRole("button", { name: "✨ Bauen" }).tap();
  const did = p.locator(".aicount", { hasText: "Geändert" });
  await did.waitFor();
  assert.match(await did.textContent(), /^Ohne KI erkannt · Geändert: .*Welt/);
  assert.equal(await p.locator(".aistate").textContent(), "KI gerade nicht erreichbar. Nichts verbraucht.");
  const doc = await p.evaluate(() => window.DailyDebug.doc());
  assert.equal(doc.g.theme, "ocean"); assert.equal(doc.g.look, undefined, "keine gewuerfelte Welt dazugemischt"); assert.equal(doc.g.route, undefined);
  assert.equal(doc.ki, undefined, "ohne KI kein KI-Siegel");
  await p.getByRole("button", { name: "🎚 Ohne KI: Regler" }).tap();
  await p.getByRole("tab", { name: "Regeln" }).and(p.locator("[aria-selected=true]")).waitFor();
  assert.deepEqual(errs, []); await p.context().close();
});

// The live answer for "Unter Wasser mit Haien, dann ein Sturm" (kind welt, 2026-11-05), key order as sent.
const WELT_OPT = { params: { gravity: 1800, flapPower: 430, pipeGap: 140, pipeSpeed: 130 }, theme: "day", title: "Hai-Abenteuer", emoji: "🐳", abschnitte: [{ physik: "schwebend", delta: { gravity: -400, flapPower: -40 }, thema: "day", emoji: "🐳" }, { physik: "sturm", delta: { pipeSpeed: 30, pipeGap: -15 }, thema: "night", emoji: "⚡" }, { physik: "schnell", delta: { pipeSpeed: 40 }, thema: "day", emoji: "🌊" }] };
const WELT = { kind: "welt", options: [WELT_OPT], seals: ["s2.welt.mw2y455c.AnlRQb9jJYrLILMRBtJj7yR1qlhJF0ER"], hashes: [H_WELT], cost: 1, receipt: "rc-wish-1", meter: { free: 7, remaining: 6, period: "week" } };
async function wishFor(p, text) { await p.getByLabel("Was willst du fliegen?").fill(text); await p.getByRole("button", { name: "✨ Bauen" }).tap(); }
// The answer shows as a preview with its AI mark first; "Übernehmen" takes it.
async function keep(p) { await p.locator(".weltpv .kitag", { hasText: "KI" }).waitFor(); await p.getByRole("button", { name: "✓ Übernehmen" }).tap(); }
const openCard = (p, tab) => p.evaluate((tb) => { const D = window.Daily, i = D.IDEAS.find((x) => x.kind === "card"); window.DailyApp.openEditor(D.docFromIdea(i, window.DailyApp.me(), "de"), { idea: i, tab: tb }); }, tab);
const sharedHash = (p, ki) => p.evaluate((k) => { const D = window.Daily, d = D.docFromIdea(D.IDEAS.find((x) => x.kind === "game"), D.sanitizeProfile({ nick: "Ada" }), "de"); d.g.title = "Alienflug"; if (k) d.ki = k; return D.docUrl(D.withTrail(d, "Ada", ["welt"])).split("#")[1]; }, ki);

test("Warteschlange nach Server-Protokoll: queue:'ticket', Platz sichtbar, /queue nur mit Ticket, Ergebnis 1:1, Siegel je Option, /ai/accept mit Beleg; belegt aendert nichts", async () => {
  let polls = 0;
  const { p, errs, sent } = await phone((path0) => {
    if (path0 === "ai") return [202, { queued: true, ticket: "tk-e2e-1", position: 3, etaS: 9 }];
    if (path0 === "queue") return ++polls < 2 ? [202, { queued: true, ticket: "tk-e2e-1", position: 2, etaS: 5 }] : [200, WELT];
    if (path0 === "ai/accept") return [200, { final: true, meter: { free: 7, remaining: 6, period: "week" } }];
    return null;
  });
  await openGame(p);
  await p.getByRole("tab", { name: "✨ Wunsch" }).tap();
  await wishFor(p, "Weltraum mit Aliens");
  await p.getByRole("button", { name: "… KI gerade belegt (Platz 3)" }).waitFor();
  await keep(p);
  const did = p.locator(".aicount", { hasText: "Geändert" });
  await did.waitFor();
  assert.doesNotMatch(await did.textContent(), /Ohne KI/);
  await p.locator(".aicount", { hasText: "KI diese Woche: noch 6 von 7" }).waitFor();
  const doc = await p.evaluate(() => window.DailyDebug.doc());
  assert.equal(doc.g.look, undefined); assert.equal(doc.g.emoji, "🐳"); assert.equal(doc.t, "Hai-Abenteuer"); assert.equal(doc.g.title, "Hai-Abenteuer");
  assert.deepEqual(doc.g.route.map((x) => x.p), ["schwebend", "sturm", "schnell"], "Strecke 1:1");
  assert.deepEqual(doc.col, (await p.evaluate(() => window.DailyApp.me().colors)), "keine erzwungene Farbe, kein Zufall dazugemischt");
  assert.deepEqual(doc.ki, { k: "welt", s: WELT.seals[0], h: H_WELT }, "Siegel und Hash der uebernommenen Option (wie vom Server)");
  while (sent.length < 4) await p.waitForTimeout(50);
  assert.deepEqual(sent.map((x) => x.path), ["ai", "queue", "queue", "ai/accept"]);
  assert.equal(sent[0].body.queue, "ticket"); assert.equal(sent[0].body.v, undefined);
  assert.deepEqual(sent[1].body, { ticket: "tk-e2e-1" });
  assert.deepEqual(sent[3].body, { device: sent[0].body.device, receipt: "rc-wish-1" });
  // full without a queue (old server): the place if it has one, nothing changed, nothing applied from rules
  await p.route(API + "ai", (r) => r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "busy", position: 4 }) }));
  const before = JSON.stringify(await p.evaluate(() => window.DailyDebug.doc()));
  await p.getByRole("button", { name: "✨ Bauen" }).tap();
  await p.locator(".aistate", { hasText: "KI gerade belegt (Platz 4). Nichts geändert, nichts verbraucht." }).waitFor();
  assert.equal(JSON.stringify(await p.evaluate(() => window.DailyDebug.doc())), before);
  assert.deepEqual(errs, []); await p.context().close();
});

test("Wunsch ohne Aenderung wird nicht abgebucht: /ai/discard statt /ai/accept", async () => {
  let n = 0;
  const { p, errs, sent } = await phone((path0) => {
    if (path0 === "ai") return [200, Object.assign({}, WELT, { receipt: "rc-same-" + ++n })];
    if (path0 === "ai/accept" || path0 === "ai/discard") return [200, { meter: { free: 7, remaining: 6, period: "week" } }];
    return null;
  });
  await openGame(p);
  await p.getByRole("tab", { name: "✨ Wunsch" }).tap();
  await wishFor(p, "Weltraum mit Aliens"); await keep(p);
  await p.locator(".aicount", { hasText: "Geändert" }).waitFor();
  await wishFor(p, "Weltraum mit Aliens"); await keep(p);
  await p.getByText("Dieser Wunsch hat nichts geändert.").waitFor();
  while (sent.length < 4) await p.waitForTimeout(50);
  assert.deepEqual(sent.map((x) => [x.path, x.body.receipt]), [["ai", undefined], ["ai/accept", "rc-same-1"], ["ai", undefined], ["ai/discard", "rc-same-2"]]);
  assert.deepEqual(errs, []); await p.context().close();
});

test("Optionen: genau ein /ai/accept je Antwort, auch bei mehreren Tipps; unberuehrte Optionen gehen per /ai/discard zurueck; Siegel der getippten Option", async () => {
  let n = 0;
  const { p, errs, sent } = await phone((path0) => {
    if (path0 === "ai") { n++; return [200, { kind: "text", options: [{ x: "Zeile A" + n }, { x: "Zeile B" + n }], seals: ["s2.text.a.sigA000" + n, "s2.text.b.sigB000" + n], cost: 1, receipt: "rc-line-" + n, meter: { free: 7, remaining: 6, period: "week" } }]; }
    if (path0 === "ai/accept" || path0 === "ai/discard") return [200, { meter: { free: 7, remaining: 6, period: "week" } }];
    return null;
  });
  await openCard(p, "Text");
  await p.locator(".txan button", { hasText: "Lob" }).tap();             // the card text needs its occasion (texte.js)
  const ask = p.getByRole("button", { name: "✨ Persönlicher Text" });
  await ask.tap(); await p.getByRole("button", { name: "Zeile A1" }).waitFor();
  await ask.tap(); await p.getByRole("button", { name: "Zeile A2" }).waitFor();          // the first answer stayed untouched
  await p.getByRole("button", { name: "Zeile B2" }).tap(); await p.getByRole("button", { name: "Zeile A2" }).tap(); await p.getByRole("button", { name: "Zeile B2" }).tap();
  await p.waitForTimeout(300);
  assert.equal(sent.filter((x) => x.path === "ai").length, 2);
  const paths = sent.map((x) => x.path + ":" + (x.body.receipt || ""));
  assert.deepEqual(paths.filter((x) => x.startsWith("ai/")).sort(), ["ai/accept:rc-line-2", "ai/discard:rc-line-1"]);
  const doc = await p.evaluate(() => window.DailyDebug.doc());
  assert.equal(doc.x, "Zeile B2"); assert.deepEqual(doc.ki, { k: "text", s: "s2.text.b.sigB0002", h: H_B2 });
  assert.deepEqual(errs, []); await p.context().close();
});

test("Zweiter Tipp waehrend die Optionen noch gehasht werden: der Knopf bleibt gesperrt, nie zwei Antwort-Saetze, kein kostenloses Uebernehmen", async () => {
  let n = 0;
  const { p, errs, sent } = await phone((path0) => {
    if (path0 === "ai") { n++; return [200, { kind: "text", options: [{ x: "Zeile A" + n }, { x: "Zeile B" + n }], seals: ["s2.text.a.sigA000" + n, "s2.text.b.sigB000" + n], cost: 1, receipt: "rc-line-" + n, meter: { free: 7, remaining: 6, period: "week" } }]; }
    if (path0 === "ai/accept" || path0 === "ai/discard") return [200, { meter: { free: 7, remaining: 6, period: "week" } }];
    return null;
  });
  // only the digest of the first answer's option is slow; the proof of work and everything else run at full speed
  await p.evaluate(() => { const d = crypto.subtle.digest.bind(crypto.subtle); crypto.subtle.digest = async (a, x) => { if (window.__slow && new TextDecoder().decode(x) === "{\"x\":\"Zeile A1\"}") await new Promise((ok) => setTimeout(ok, window.__slow)); return d(a, x); }; });
  await openCard(p, "Text");
  await p.locator(".txan button", { hasText: "Lob" }).tap();
  const ask = p.locator(".aibox button.chip:not(.aiopt)").first();
  await p.evaluate(() => { window.__slow = 1500; });
  await ask.tap();
  while (!sent.some((x) => x.path === "ai")) await p.waitForTimeout(20);
  await p.waitForTimeout(300);                                       // the answer is in, its options are being hashed
  assert.equal(await p.locator(".aiopt").count(), 0, "noch keine Optionen sichtbar");
  assert.equal(await ask.isDisabled(), true, "waehrend des Hashens bleibt der KI-Knopf gesperrt");
  await ask.dispatchEvent("click");                                  // a tap that still gets through must do nothing
  await p.getByRole("button", { name: "Zeile A1" }).waitFor();
  await p.waitForTimeout(300);
  assert.deepEqual(await p.locator(".aiopt").allTextContents(), ["Zeile A1", "Zeile B1"]);
  assert.deepEqual(sent.map((x) => x.path), ["ai"], "kein zweiter Auftrag, kein /ai/discard des laufenden Belegs");
  await p.getByRole("button", { name: "Zeile A1" }).tap();
  while (sent.length < 2) await p.waitForTimeout(20);
  assert.deepEqual(sent.map((x) => x.path + ":" + (x.body.receipt || "")), ["ai:", "ai/accept:rc-line-1"]);
  const doc = await p.evaluate(() => window.DailyDebug.doc());
  assert.equal(doc.x, "Zeile A1"); assert.deepEqual(doc.ki, { k: "text", s: "s2.text.a.sigA0001", h: H_A1 });
  assert.deepEqual(errs, []); await p.context().close();
});

test("Blatt verlassen waehrend die KI rechnet: kein Fehler, nichts landet auf einem anderen Blatt, das Ergebnis geht per /ai/discard zurueck", async () => {
  let release; const gate = new Promise((ok) => { release = ok; });
  const { p, errs, sent } = await phone(() => null);
  await p.context().route(API + "ai", async (r) => { sent.push({ path: "ai", body: JSON.parse(r.request().postData()) }); await gate; return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(WELT) }); });
  await p.context().route(API + "ai/discard", (r) => { sent.push({ path: "ai/discard", body: JSON.parse(r.request().postData()) }); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ refunded: 1 }) }); });
  await openGame(p);
  await p.getByRole("tab", { name: "✨ Wunsch" }).tap();
  await wishFor(p, "Weltraum mit Aliens");
  while (!sent.length) await p.waitForTimeout(50);
  // another sheet is open now
  await openCard(p, "Text");
  const other = await p.evaluate(() => JSON.stringify(window.DailyDebug.doc()));
  release();
  while (sent.length < 2) await p.waitForTimeout(50);
  assert.deepEqual(sent.map((x) => x.path), ["ai", "ai/discard"]); assert.equal(sent[1].body.receipt, "rc-wish-1");
  assert.equal(await p.evaluate(() => JSON.stringify(window.DailyDebug.doc())), other, "die Karte bleibt, wie sie war");
  assert.equal(await p.locator(".aicount", { hasText: "Geändert" }).count(), 0);
  assert.deepEqual(errs, []); await p.context().close();
});

test("Blatt verlassen, nach Hause: kein TypeError, wenn die Antwort spaeter kommt", async () => {
  let release; const gate = new Promise((ok) => { release = ok; });
  const { p, errs, sent } = await phone((path0) => (path0 === "ai/discard" ? [200, { refunded: 1 }] : null));
  await p.context().route(API + "ai", async (r) => { sent.push({ path: "ai" }); await gate; return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(WELT) }); });
  await openGame(p);
  await p.getByRole("tab", { name: "✨ Wunsch" }).tap();
  await wishFor(p, "Weltraum mit Aliens");
  while (!sent.length) await p.waitForTimeout(50);
  await p.evaluate(() => window.DailyApp.goHome());
  release();
  while (sent.length < 2) await p.waitForTimeout(50);
  assert.equal(sent[1].path, "ai/discard");
  assert.deepEqual(errs, []); await p.context().close();
});

test("Melden: jedes geteilte Blatt; 'KI' nur mit Siegel; Grund noetig; Body nach Server-Protokoll; einmal je Blatt; offline freundlich", async () => {
  const { p, errs, sent } = await phone((path0) => (path0 === "report" ? [202, { id: "r1" }] : null), { web: true });   // reloads below
  await p.evaluate((h) => { location.hash = h; }, await sharedHash(p, { k: "wish" }));
  const rep = p.locator("#kireport");
  await rep.waitFor();
  assert.equal(await p.locator("#leaf .kiseal").isHidden(), true, "ohne Siegel kein 'Mit KI erstellt'");
  await p.evaluate((h) => { location.hash = h; }, await sharedHash(p, { k: "wish", s: "s1.wish.k1.siegel0001" }));
  const seal = p.locator("#leaf .kiseal");
  await seal.waitFor();
  assert.equal(await seal.textContent(), "KI"); assert.equal(await seal.getAttribute("aria-label"), "Mit KI erstellt");
  assert.equal(await rep.textContent(), "⚑ Melden");
  await rep.tap();
  const dlg = p.getByRole("dialog", { name: "Blatt melden?" });
  await dlg.waitFor();
  assert.match(await dlg.textContent(), /Texte dieses Blatts und, falls es eins hat, sein KI-Siegel/);
  await dlg.getByRole("button", { name: "Abbrechen" }).tap();
  await dlg.waitFor({ state: "detached" });
  assert.equal(sent.length, 0, "ohne Ja geht nichts raus");
  await rep.tap();
  assert.equal(await dlg.getByRole("button", { name: "Melden", exact: true }).isDisabled(), true, "erst ein Grund");
  await dlg.getByRole("radio", { name: "Hass oder Hetze" }).tap();
  await p.context().setOffline(true);
  await dlg.getByRole("button", { name: "Melden", exact: true }).tap();
  await dlg.getByText("Gerade kein Netz. Bitte später nochmal versuchen.").waitFor();
  assert.equal(await dlg.getByRole("button", { name: "Melden", exact: true }).isEnabled(), true, "nochmal versuchen geht");
  await p.context().setOffline(false);
  await dlg.getByRole("button", { name: "Melden", exact: true }).tap();
  await dlg.getByText("Danke. Wir sehen es uns an.").waitFor();
  assert.equal(sent.length, 1); assert.equal(sent[0].path, "report");
  assert.deepEqual(sent[0].body, { reason: "hate", consent: true, content: { type: "game", title: "Alienflug" }, kind: "wish", seal: "s1.wish.k1.siegel0001" });
  assert.ok(!JSON.stringify(sent[0].body).includes("Ada"), "keine Namen aus der Spur");
  await dlg.getByRole("button", { name: "Schließen" }).tap();
  assert.equal(await rep.textContent(), "⚑ Gemeldet"); assert.equal(await rep.isDisabled(), true, "einmal je Blatt");
  await p.reload(); await rep.waitFor();
  assert.equal(await rep.isDisabled(), true, "auch nach dem Neuladen");
  const contrast = await p.evaluate(() => { const L = (c) => { const v = c.match(/\d+/g).slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const s = getComputedStyle(document.querySelector("#leaf .kiseal")), a = L(s.color), z = L(s.backgroundColor); return (Math.max(a, z) + 0.05) / (Math.min(a, z) + 0.05); });
  assert.ok(contrast >= 4.5, "Siegel-Kontrast " + contrast);
  assert.deepEqual(errs, []); await p.context().close();
});

test("Melden mit Options-Hash: das Blatt traegt h neben dem Siegel, die Meldung schickt es als optionHash", async () => {
  const { p, errs, sent } = await phone((path0) => (path0 === "report" ? [202, { id: "r2" }] : null));
  const h = H_WISH;
  await p.evaluate((x) => { location.hash = x; }, await sharedHash(p, { k: "wish", s: "s1.wish.k1.siegel0002", h }));
  await p.locator("#leaf .kiseal").waitFor();
  assert.deepEqual(await p.evaluate(() => window.Daily.parseRoute(location.hash).doc.ki), { k: "wish", s: "s1.wish.k1.siegel0002", h }, "h kommt durch den Link");
  await p.locator("#kireport").tap();
  const dlg = p.getByRole("dialog", { name: "Blatt melden?" });
  await dlg.getByRole("radio", { name: "Etwas anderes" }).tap();
  await dlg.getByRole("button", { name: "Melden", exact: true }).tap();
  await dlg.getByText("Danke. Wir sehen es uns an.").waitFor();
  assert.deepEqual(sent[0].body, { reason: "other", consent: true, content: { type: "game", title: "Alienflug" }, kind: "wish", seal: "s1.wish.k1.siegel0002", optionHash: h });
  assert.deepEqual(errs, []); await p.context().close();
});

test("iOS-Huelle (DuellHost.ai, Seite ohne Netz): Warteschlange, Abrechnung und Melden laufen ueber die Huelle mit ihren festen Pfaden", async () => {
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), p = await ctx.newPage(), errs = [], host = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await ctx.route(/^https?:/, (r) => r.abort());     // "duell-no-network": the page itself never reaches the server
  // the same list as apps/ios/App/Duell/DuellAi.swift (DuellAi.routes)
  const ROUTES = { "": "/ai", "/status": "/ai/status", "/interest": "/ai/interest", "/weather": "/ai/weather", "/accept": "/ai/accept", "/discard": "/ai/discard", "/queue": "/queue", "/report": "/report" };
  let polls = 0;
  await ctx.exposeFunction("hostAi", (path0, body) => {
    if (!(path0 in ROUTES)) return null;
    host.push({ path: ROUTES[path0], body: JSON.parse(body) });
    const a = path0 === "" ? [202, { queued: true, ticket: "tk-ios-1", position: 1 }] : path0 === "/queue" ? (++polls < 2 ? [202, { queued: true, ticket: "tk-ios-1", position: 0 }] : [200, WELT]) : path0 === "/report" ? [202, { id: "r1" }] : [200, { meter: { free: 7, remaining: 6, period: "week" } }];
    return { status: a[0], body: JSON.stringify(a[1]) };
  });
  await ctx.addInitScript(() => { window.DuellHost = Object.freeze({ ai: async (path0, body) => { const r = await window.hostAi(path0, body); if (!r) throw new Error("refused"); return r; } }); });
  await p.goto(page);
  await openGame(p);
  await p.getByRole("tab", { name: "✨ Wunsch" }).tap();
  await wishFor(p, "Weltraum mit Aliens"); await keep(p);
  await p.locator(".aicount", { hasText: "Geändert" }).waitFor();
  while (host.length < 4) await p.waitForTimeout(50);
  assert.deepEqual(host.map((x) => x.path), ["/ai", "/queue", "/queue", "/ai/accept"]);
  await p.evaluate((h) => { location.hash = h; }, await sharedHash(p, { k: "wish", s: "s1.wish.k1.siegel0001" }));
  await p.locator("#kireport").tap();
  const dlg = p.getByRole("dialog", { name: "Blatt melden?" });
  await dlg.getByRole("radio", { name: "Etwas anderes" }).tap();
  await dlg.getByRole("button", { name: "Melden", exact: true }).tap();
  await dlg.getByText("Danke. Wir sehen es uns an.").waitFor();
  assert.equal(host[host.length - 1].path, "/report"); assert.equal(host[host.length - 1].body.reason, "other");
  assert.deepEqual(errs, []); await ctx.close();
});

test("Wuerfel: im Text-Tab heisst die Zeilen-Taste anders als der Wuerfel; die Wurfnummer laeuft nach Schliessen und Oeffnen weiter", async () => {
  const { p, errs } = await phone(null);
  await openCard(p, "Text");
  assert.equal(await p.getByRole("button", { name: "🎲 Würfeln" }).count(), 0, "kein zweiter Knopf 'Würfeln' im Text-Tab");
  await p.getByRole("button", { name: "↻ Andere Zeile" }).waitFor();
  const look = (d) => JSON.stringify([d.col, d.st, d.sk.map((x) => x.e)]);
  await openCard(p, "Dice");
  await p.getByRole("button", { name: "🎲 Würfeln" }).tap(); await p.locator(".aicount", { hasText: "Geändert" }).waitFor();
  const first = look(await p.evaluate(() => window.DailyDebug.doc()));
  await p.evaluate(() => window.DailyApp.goHome());
  await openCard(p, "Dice");
  await p.getByRole("button", { name: "🎲 Würfeln" }).tap(); await p.locator(".aicount", { hasText: "Geändert" }).waitFor();
  assert.notEqual(look(await p.evaluate(() => window.DailyDebug.doc())), first, "nicht derselbe Wurf noch einmal");
  assert.deepEqual(errs, []); await p.context().close();
});
