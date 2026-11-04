"use strict";
// KI with honest states: one way into the flight game, the queue's place, the way without AI, the seal and the report.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const API = "https://demos-34a13a96.bunsenbrenner.org/api/duell/";
let b;
test.before(async () => { b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); });
test.after(async () => { await b.close(); });

async function phone(api) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }), p = await ctx.newPage(), errs = [], sent = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await ctx.route(/^https?:/, async (r) => {
    const u = r.request().url();
    if (api && u.startsWith(API)) { const path0 = u.slice(API.length), body = JSON.parse(r.request().postData() || "null"); sent.push({ path: path0, body }); const a = api(path0, body); if (a) return r.fulfill({ status: a[0], contentType: "application/json", body: JSON.stringify(a[1]) }); }
    return r.abort();
  });
  await p.goto(page);
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
  assert.equal(doc.g.look.d, "bubbles"); assert.equal(doc.ki, undefined, "ohne KI kein KI-Siegel");
  assert.deepEqual(errs, []); await p.context().close();
});

test("Warteschlange: Platz sichtbar, Ergebnis 1:1 uebernommen, erst beim Uebernehmen bestaetigt, Siegel im Blatt; belegt aendert nichts", async () => {
  let polls = 0;
  const look = { a: "#060a2a", b: "#2a1a5e", d: "stars", e: ["👽"], p: "#9aa7c7", q: "#4d5878", f: "block", g: "#1a1a33", h: "#7a6cff", m: "✨" };
  const { p, errs, sent } = await phone((path0) => {
    if (path0 === "ai") return [202, { ticket: "tk-e2e-1", position: 3, wait: 600 }];
    if (path0 === "ai/wait") return ++polls < 2 ? [202, { ticket: "tk-e2e-1", position: 2, wait: 600 }] : [200, { kind: "wish", options: [{ changes: { look, emoji: "🛸", theme: "space", t: "Alienflug" } }], seal: "v1.vorlaeufig01", ticket: "tk-e2e-1", meter: { free: 7, remaining: 7, period: "week" } }];
    if (path0 === "ai/confirm") return [200, { seal: "v1.k1.endgueltig01", meter: { free: 7, remaining: 6, period: "week" } }];
    return null;
  });
  await openGame(p);
  await p.getByRole("tab", { name: "✨ Wunsch" }).tap();
  await p.getByLabel("Was willst du fliegen?").fill("Weltraum mit Aliens");
  await p.getByRole("button", { name: "✨ Bauen" }).tap();
  await p.getByRole("button", { name: "… KI gerade belegt (Platz 3)" }).waitFor();
  const did = p.locator(".aicount", { hasText: "Geändert" });
  await did.waitFor();
  assert.doesNotMatch(await did.textContent(), /Ohne KI/);
  await p.locator(".aicount", { hasText: "KI diese Woche: noch 6 von 7" }).waitFor();
  const doc = await p.evaluate(() => window.DailyDebug.doc());
  assert.deepEqual(doc.g.look.e, ["👽"]); assert.equal(doc.g.emoji, "🛸"); assert.equal(doc.t, "Alienflug");
  assert.deepEqual(doc.col, (await p.evaluate(() => window.DailyApp.me().colors)), "keine erzwungene Farbe, kein Zufall dazugemischt");
  assert.deepEqual(doc.ki, { k: "wish", s: "v1.k1.endgueltig01" });
  assert.deepEqual(sent.map((x) => x.path), ["ai", "ai/wait", "ai/wait", "ai/confirm"]);
  assert.equal(sent[0].body.v, 2); assert.deepEqual(sent[3].body, { device: sent[0].body.device, ticket: "tk-e2e-1" });
  // full without a queue (old server): the place if it has one, nothing changed, nothing applied from rules
  await p.route(API + "ai", (r) => r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "busy", position: 4 }) }));
  const before = JSON.stringify(await p.evaluate(() => window.DailyDebug.doc()));
  await p.getByRole("button", { name: "✨ Bauen" }).tap();
  await p.locator(".aistate", { hasText: "KI gerade belegt (Platz 4). Nichts geändert, nichts verbraucht." }).waitFor();
  assert.equal(JSON.stringify(await p.evaluate(() => window.DailyDebug.doc())), before);
  assert.deepEqual(errs, []); await p.context().close();
});

test("KI-Siegel im geteilten Blatt: 'KI' sichtbar, Melden erst nach Ja, sendet Texte und Siegel; offline freundlich", async () => {
  const { p, errs, sent } = await phone((path0) => (path0 === "report" ? [202, { ok: true }] : null));
  const hash = await p.evaluate(() => { const D = window.Daily, d = D.docFromIdea(D.IDEAS.find((x) => x.kind === "game"), D.sanitizeProfile({ nick: "Ada" }), "de"); d.g.title = "Alienflug"; d.ki = { k: "wish", s: "v1.k1.siegel0001" }; return D.docUrl(D.withTrail(d, "Ada", ["welt"])).split("#")[1]; });
  await p.evaluate((h) => { location.hash = h; }, hash);
  const seal = p.locator("#leaf .kiseal");
  await seal.waitFor();
  assert.equal(await seal.textContent(), "KI"); assert.equal(await seal.getAttribute("aria-label"), "Mit KI erstellt");
  const rep = p.locator("#kireport");
  assert.equal(await rep.textContent(), "⚑ Melden");
  await rep.tap();
  const dlg = p.getByRole("dialog", { name: "KI-Inhalt melden?" });
  await dlg.waitFor();
  assert.match(await dlg.textContent(), /Texte dieses Blatts und sein KI-Siegel/);
  await dlg.getByRole("button", { name: "Abbrechen" }).tap();
  await dlg.waitFor({ state: "detached" });
  assert.equal(sent.length, 0, "ohne Ja geht nichts raus");
  await rep.tap(); await dlg.getByRole("button", { name: "Melden" }).tap();
  await dlg.getByText("Danke. Wir sehen es uns an.").waitFor();
  assert.equal(sent.length, 1); assert.equal(sent[0].path, "report");
  assert.deepEqual(sent[0].body, { v: 1, type: "game", kind: "wish", seal: "v1.k1.siegel0001", lang: "de", content: { title: "Alienflug" } });
  assert.ok(!JSON.stringify(sent[0].body).includes("Ada"), "keine Namen aus der Spur");
  await dlg.getByRole("button", { name: "Schließen" }).tap();
  await p.context().setOffline(true);
  await rep.tap(); await dlg.getByRole("button", { name: "Melden" }).tap();
  await dlg.getByText("Gerade kein Netz. Bitte später nochmal versuchen.").waitFor();
  assert.equal(await dlg.getByRole("button", { name: "Melden" }).isEnabled(), true, "nochmal versuchen geht");
  const contrast = await p.evaluate(() => { const L = (c) => { const v = c.match(/\d+/g).slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const s = getComputedStyle(document.querySelector("#leaf .kiseal")), a = L(s.color), z = L(s.backgroundColor); return (Math.max(a, z) + 0.05) / (Math.min(a, z) + 0.05); });
  assert.ok(contrast >= 4.5, "Siegel-Kontrast " + contrast);
  assert.deepEqual(errs, []); await p.context().close();
});
