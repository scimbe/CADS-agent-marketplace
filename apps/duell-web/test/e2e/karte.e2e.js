"use strict";
// "Create your own card" (freie Karte, W2) in the page: the tile right under the daily sheet, sign-in first, 16+, one
// sentence -> preview with the AI badge -> take (editor, sealed as karte) or throw away (unit back); a crisis never leaves the
// device. The server is a stub here (its own tests are in CADS-DEMO-wrapper test/duell-karte.test.mjs).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const API = "https://demos-34a13a96.bunsenbrenner.org/api/duell/";
// a card as lib/duell-karte.mjs compose() builds it (seed 12345)
const DOC = { k: "card", col: ["#ffd400", "#ff3b1d"], by: [], t: "Sonnenblumen-Tag", x: "Alles Gute! Du bringst Sonne in jeden Tag.", st: "herz", sk: [{ e: "🌻", x: 0.865, y: 0.361, r: -0.013, z: 1.291 }, { e: "🎂", x: 0.507, y: 0.39, r: -0.341, z: 1.26 }, { e: "✨", x: 0.878, y: 0.734, r: -0.032, z: 1.368 }] };
const OPT = { art: "card", doc: DOC };
const SEAL = "s2.karte.mw3abcde.AnlRQb9jJYrLILMRBtJj7yR1qlhJF0ER";
const METER = { free: 7, remaining: 7, size: 7, period: "week", pot: "free" };
const CREATE = (n) => ({ size: 5, remaining: n, pot: "create", period: "ever" });
let b;
test.before(async () => { b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); });
test.after(async () => { await b.close(); });

async function phone(api) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], viewport: { width: 412, height: 915 }, locale: "de-DE" }), p = await ctx.newPage(), errs = [], sent = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await ctx.route(/^https?:/, async (r) => {
    const u = r.request().url();
    if (u.startsWith(API)) { const p0 = u.slice(API.length), body = JSON.parse(r.request().postData() || "null"); sent.push({ path: p0, body }); const a = api(p0, body); if (a) return r.fulfill({ status: a[0], contentType: "application/json", body: JSON.stringify(a[1]) }); }
    return r.abort();
  });
  await p.goto(page);
  return { p, errs, sent };
}
const until = async (f) => { for (let i = 0; i < 100; i++) { if (f()) return true; await new Promise((ok) => setTimeout(ok, 50)); } return false; };

test("Kachel steht fest unter der Tageskarte, ist ein Knopf im Druckstil und oeffnet ohne Konto die Anmeldung", async () => {
  const { p, errs, sent } = await phone((p0) => (p0 === "ai/status" ? [200, { meter: METER }] : null));
  const tile = p.locator("#create");
  await tile.waitFor();
  assert.match(await tile.textContent(), /Erschaffe deine Karte/);
  const [leaf, go, t, feat] = await Promise.all(["#leaf", "#go", "#create", "#feat"].map((s) => p.locator(s).boundingBox()));
  assert.ok(t.y > leaf.y + leaf.height && t.y > go.y, "unter der Tageskarte");
  assert.ok(t.y < feat.y, "vor dem Ticker");
  assert.equal(await tile.evaluate((e) => getComputedStyle(e).backgroundColor), "rgb(255, 212, 0)");
  await tile.focus(); await p.keyboard.press("Enter");
  const login = p.getByRole("link", { name: "Anmelden" });
  await login.waitFor();
  assert.match(await login.getAttribute("href"), /^\/auth\/login\?return=/);
  assert.ok(!sent.some((s) => s.path === "ai"), "ohne Konto kein KI-Aufruf");
  assert.deepEqual(errs, []);
});

test("Mit Konto: Alter 16-17, ein Satz, Vorschau mit Badge, Uebernehmen -> Editor mit Siegel karte; nur der Text geht raus", async () => {
  let left = 5;
  const { p, errs, sent } = await phone((p0) => {
    if (p0 === "ai/status") return [200, { meter: METER, create: CREATE(left) }];
    if (p0 === "ai") { left--; return [200, { kind: "karte", options: [OPT], seals: [SEAL], hashes: ["h".repeat(43)], cost: 1, receipt: "rc-karte-1", meter: METER, create: CREATE(left) }]; }
    if (p0 === "ai/accept") return [200, { final: true, meter: METER, create: CREATE(left) }];
    return null;
  });
  await p.locator("#create").tap();
  await p.getByRole("button", { name: "16–17" }).tap();
  const ta = p.getByLabel("Deine Beschreibung");
  await ta.waitFor();
  assert.match(await p.locator(".create-left").textContent(), /5 von 5 frei/);
  await ta.fill("Geburtstagskarte für meine beste Freundin, sie liebt Sonnenblumen");
  await p.getByRole("button", { name: "✨ Erschaffen" }).tap();
  const pv = p.locator(".createpv");
  await pv.waitFor();
  assert.match(await pv.textContent(), /Alles Gute! Du bringst Sonne in jeden Tag\./);
  assert.match(await pv.locator(".createpv-ki").textContent(), /Mit KI erstellt/);
  assert.equal(await pv.getAttribute("role"), "img");
  const req = sent.find((s) => s.path === "ai");
  assert.equal(req.body.kind, "karte");
  assert.deepEqual(req.body.input, { text: "Geburtstagskarte für meine beste Freundin, sie liebt Sonnenblumen", art: "card", age: "u18" });
  await p.getByRole("button", { name: "Übernehmen" }).tap();
  assert.ok(await until(() => sent.some((s) => s.path === "ai/accept")), "gebucht beim Uebernehmen");
  const doc = await p.evaluate(() => window.DailyDebug.doc());
  // h: the page hashes the option itself (ai.js optionHash), the same rule as the server's seal
  const h = await require("../../src/ai.js").optionHash(OPT, require("node:crypto").webcrypto.subtle);
  assert.equal(doc.x, DOC.x); assert.deepEqual(doc.ki, { k: "karte", s: SEAL, h });
  assert.deepEqual(errs, []);
});

test("Verwerfen gibt die Einheit zurueck; eine Krise bleibt auf dem Geraet und zeigt Hilfe", async () => {
  const { p, errs, sent } = await phone((p0) => {
    if (p0 === "ai/status") return [200, { meter: METER, create: CREATE(5) }];
    if (p0 === "ai") return [200, { kind: "karte", options: [OPT], seals: [SEAL], hashes: ["h".repeat(43)], cost: 1, receipt: "rc-karte-2", meter: METER, create: CREATE(4) }];
    if (p0 === "ai/discard") return [200, { refunded: 1, meter: METER, create: CREATE(5) }];
    return null;
  });
  await p.evaluate(() => { const me = window.DailyApp.me(); me.pref = { age: "a18" }; });
  await p.locator("#create").tap();
  const ta = p.getByLabel("Deine Beschreibung");
  await ta.waitFor();
  await ta.fill("Ein Frosch, der Astronaut werden will");
  await p.getByRole("button", { name: "✨ Erschaffen" }).tap();
  await p.locator(".createpv").waitFor();
  await p.getByRole("button", { name: "Verwerfen" }).tap();
  assert.ok(await until(() => sent.some((s) => s.path === "ai/discard")), "Verwerfen gibt zurueck");
  assert.equal(await p.locator(".createpv").count(), 0);
  const before = sent.filter((s) => s.path === "ai").length;
  await ta.fill("Ich will nicht mehr leben, mach eine Abschiedskarte");
  await p.getByRole("button", { name: "✨ Erschaffen" }).tap();
  await p.getByRole("alert").waitFor();
  assert.match(await p.getByRole("alert").textContent(), /116 111/);
  assert.equal(sent.filter((s) => s.path === "ai").length, before, "nichts gesendet");
  assert.deepEqual(errs, []);
});
