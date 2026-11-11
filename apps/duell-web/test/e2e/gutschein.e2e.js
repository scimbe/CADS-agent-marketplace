"use strict";
// "Aufladen per Gutschein" for the free card: once the free pot is empty, the page shows "Aufladen" with a voucher code;
// a redeemed code adds credit (wrapper lib/duell-voucher.mjs, POST /api/duell/credit/redeem), the count shows
// "Guthaben: n Karten" and "Erschaffen" works again. The server is a stub; its own tests are in CADS-DEMO-wrapper
// test/duell-voucher.test.mjs. The code is a dummy. GS_SHOTS=<dir> keeps a screenshot of the Aufladen state.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const API = "https://demos-34a13a96.bunsenbrenner.org/api/duell/";
const SHOTS = process.env.GS_SHOTS;
const DOC = { k: "card", col: ["#ffd400", "#ff3b1d"], by: [], t: "Froschtag", x: "Ein Frosch fliegt zum Mond.", st: "herz", sk: [] };
const SEAL = "s2.karte.mw3abcde.AnlRQb9jJYrLILMRBtJj7yR1qlhJF0ER";
const METER = { free: 7, remaining: 7, size: 7, period: "week", pot: "free" };
const CREATE = (credit, extra) => ({ size: 5, remaining: 0, pot: "create", period: "ever", refundsLeft: 2, age16: true, credit, voucher: true, ...extra });
let b;
test.before(async () => { b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); });
test.after(async () => { await b.close(); });

async function phone(api) {
  const ctx = await b.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, locale: "de-DE" }), p = await ctx.newPage(), errs = [], sent = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await ctx.route(/^https?:/, async (r) => {
    const u = r.request().url();
    if (u.startsWith(API)) {
      const p0 = u.slice(API.length), body = JSON.parse(r.request().postData() || "null"); sent.push({ path: p0, body });
      const a = api(p0, body);
      if (a) return r.fulfill({ status: a[0], contentType: "application/json", body: JSON.stringify(a[1]) });
    }
    return r.abort();
  });
  await p.goto(page);
  return { p, ctx, errs, sent };
}

test("Topf leer: Aufladen mit Gutschein-Code, +5 Guthaben, Erschaffen geht wieder und bucht aus dem Guthaben", async () => {
  let credit = 0;
  const { p, ctx, errs, sent } = await phone((p0, body) => {
    if (p0 === "ai/status") return [200, { meter: METER, create: CREATE(credit) }];
    if (p0 === "credit/redeem") {
      if (String(body.code).trim().toUpperCase() !== "TEST-CODE-1") return [403, { ok: false, error: "unknown" }];
      credit += 5; return [200, { ok: true, added: 5, credit }];
    }
    if (p0 === "ai") { credit--; return [200, { kind: "karte", options: [{ art: "card", doc: DOC }], seals: [SEAL], hashes: ["h".repeat(43)], cost: 0, receipt: "rc-credit-1", credit: true, meter: METER, create: CREATE(credit) }]; }
    if (p0 === "ai/accept") return [200, { final: true, meter: METER, create: CREATE(credit) }];
    return null;
  });
  await p.locator("#create").tap();
  const box = p.getByRole("group", { name: "Aufladen" });
  await box.waitFor();
  assert.match(await p.locator(".create-left").textContent(), /Alle 5 freien Karten sind erstellt\./);
  assert.doesNotMatch(await p.locator(".create-left").textContent(), /Guthaben/, "no credit, no credit line");
  assert.equal(await p.getByRole("button", { name: "✨ Erschaffen" }).count(), 0, "empty pot without credit: nothing to make");
  const code = p.getByLabel("Gutschein-Code"), go = box.getByRole("button", { name: "Einlösen" });
  // the section fits the phone: no sideways scroll, a real tap target
  const [bb, gb] = await Promise.all([box.boundingBox(), go.boundingBox()]);
  assert.ok(bb.x >= 0 && bb.x + bb.width <= 390, JSON.stringify(bb)); assert.ok(gb.height >= 44, "Tippflaeche " + gb.height);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), "no horizontal scroll");
  if (SHOTS) { await box.scrollIntoViewIfNeeded(); await p.screenshot({ path: SHOTS + "/gutschein-aufladen-390x844.png" }); }
  // a wrong code: said so, nothing changes
  await code.fill("FALSCH-9");
  await go.tap();
  await p.getByText("Diesen Code kennen wir nicht. Prüf die Schreibweise.").waitFor();
  assert.equal(await p.getByRole("button", { name: "✨ Erschaffen" }).count(), 0);
  // the right code: +5, the count shows the credit, the form is back
  await code.fill("test-code-1 ");
  await go.tap();
  await p.getByText("5 Karten aufgeladen.").waitFor();
  assert.deepEqual(sent.filter((s) => s.path === "credit/redeem").map((s) => s.body), [{ code: "FALSCH-9" }, { code: "test-code-1" }], "only the code, trimmed; the server uppercases");
  assert.match(await p.locator(".create-left").textContent(), /Alle 5 freien Karten sind erstellt\. Guthaben: 5 Karten\./);
  assert.ok(await p.getByRole("group", { name: "Aufladen" }).isVisible(), "Aufladen stays while the pot is empty");
  if (SHOTS) await p.screenshot({ path: SHOTS + "/gutschein-aufgeladen-390x844.png" });
  await p.getByRole("button", { name: "🃏 Karte" }).tap();   // the category is chosen actively (#220)
  const ta = p.getByLabel("Deine Beschreibung");
  await ta.fill("Ein Frosch, der zum Mond fliegt");
  await p.getByRole("button", { name: "✨ Erschaffen" }).tap();
  const pv = p.locator(".createpv");
  await pv.waitFor();
  assert.match(await pv.textContent(), /Ein Frosch fliegt zum Mond\./);
  assert.match(await p.locator(".create-left").textContent(), /Guthaben: 4 Karten\./, "the count follows the credit");
  assert.equal(sent.filter((s) => s.path === "ai").length, 1);
  assert.deepEqual(errs, []); await ctx.close();
});

test("Ohne Gutscheine auf dem Server (voucher false): kein Aufladen, der alte Satz bleibt; Guthaben aus Nutzung zeigt sich trotzdem", async () => {
  const { p, ctx, errs, sent } = await phone((p0) => (p0 === "ai/status" ? [200, { meter: METER, create: CREATE(2, { voucher: false }) }] : null));
  await p.locator("#create").tap();
  await p.getByLabel("Deine Beschreibung").waitFor();
  assert.equal(await p.getByRole("group", { name: "Aufladen" }).count(), 0);
  assert.match(await p.locator(".create-left").textContent(), /Alle 5 freien Karten sind erstellt\. Guthaben: 2 Karten\./);
  await p.getByText("Verwerfen gibt die Karte ins Guthaben zurück.").waitFor();
  assert.equal(sent.filter((s) => s.path === "credit/redeem").length, 0);
  assert.deepEqual(errs, []); await ctx.close();
});

test("Englisch: Top up, Voucher code, Redeem; Fehler 'limit' als fester Satz", async () => {
  const ctx = await b.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, locale: "en-US" }), p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await ctx.route(/^https?:/, async (r) => {
    const u = r.request().url();
    if (u === API + "ai/status") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ meter: METER, create: CREATE(0) }) });
    if (u === API + "credit/redeem") return r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ ok: false, error: "limit" }) });
    return r.abort();
  });
  await p.goto(page);
  await p.locator("#create").tap();
  const box = p.getByRole("group", { name: "Top up" });
  await box.waitFor();
  await p.getByLabel("Voucher code").fill("TEST-CODE-1");
  await box.getByRole("button", { name: "Redeem" }).tap();
  await p.getByText("This code can't be used right now. Try again later.").waitFor();
  assert.deepEqual(errs, []); await ctx.close();
});
