"use strict";
// The Guthaben view (create-ui.js, part erschaffen): free cards, credit, what credit is for and the voucher, as a dialog over
// whatever is open. Ways in: My style's account card ("Guthaben & Aufladen"), the line "Guthaben: n · Aufladen" under the
// free card's count (also while free cards are left), the address #aufladen and window.Guthaben.open() (a stand-in until
// the part is there). Signed out it shows the sign-in first; the way back (?go=aufladen) opens it again. The start page
// asks nothing for it; the view asks /ai/status when it opens. The server is a stub (its own tests: CADS-DEMO-wrapper
// test/duell-voucher.test.mjs); the codes are dummies. GH_SHOTS=<dir> keeps screenshots at 390x844.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const API = "https://demos-34a13a96.bunsenbrenner.org/api/duell/";
const SHOTS = process.env.GH_SHOTS;
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const METER = { free: 7, remaining: 7, size: 7, period: "week", pot: "free" };
const CREATE = (left, credit, extra) => ({ size: 5, remaining: left, pot: "create", period: "ever", refundsLeft: 2, age16: true, credit, voucher: true, ...extra });
let b;
test.before(async () => { b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); });
test.after(async () => { await b.close(); });

async function phone(api, opts) {
  const o = opts || {};
  const ctx = await b.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, locale: o.locale || "de-DE" }), p = await ctx.newPage(), errs = [], sent = [];
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
  await p.goto(page + (o.at || ""));
  return { p, ctx, errs, sent };
}
// A stub with an account: a voucher TEST-CODE-1 adds 5 cards; others are unknown.
function account(left, start) {
  const s = { credit: start || 0 };
  s.api = (p0, body) => {
    if (p0 === "ai/status") return [200, { meter: METER, create: CREATE(left, s.credit) }];
    if (p0 === "credit/redeem") {
      if (String(body.code).trim().toUpperCase() !== "TEST-CODE-1") return [403, { ok: false, error: "unknown" }];
      s.credit += 5; return [200, { ok: true, added: 5, credit: s.credit }];
    }
    return null;
  };
  return s;
}
const statusCalls = (sent) => sent.filter((s) => s.path === "ai/status").length;

test("Mein Stil (Konto-Karte): 'Guthaben & Aufladen' oeffnet den Dialog; /ai/status erst beim Oeffnen, nie auf der Startseite", async () => {
  const s = account(3, 2), { p, ctx, errs, sent } = await phone(s.api);
  await p.locator("#go").waitFor();
  assert.equal(await p.evaluate(() => typeof window.Guthaben.open), "function", "window.Guthaben.open gibt es schon vor dem Teil");
  await p.waitForTimeout(600);
  assert.equal(statusCalls(sent), 0, "die Startseite fragt nichts fuer das Guthaben");
  await p.locator("#me").tap();
  const entry = p.locator("#accredit");
  await entry.waitFor();
  assert.equal(await entry.textContent(), "Guthaben & Aufladen");
  await entry.scrollIntoViewIfNeeded(); await entry.tap();
  const dlg = p.getByRole("dialog", { name: "Guthaben" });
  await dlg.waitFor();
  await dlg.getByText("3 von 5").waitFor();
  assert.equal(statusCalls(sent), 1, "einmal beim Oeffnen");
  assert.match(await dlg.locator(".ghnums").textContent(), /Freie Karten3 von 5Guthaben2 Karten/);
  for (const x of ["Wofür das Guthaben ist", "Eigene Karten, wenn die freien aufgebraucht sind", "KI-Bilder, zum Beispiel dein Avatar", "Dateien weiterreichen (für zahlende Konten)"]) await dlg.getByText(x).waitFor();
  assert.ok(await dlg.getByLabel("Gutschein-Code").isVisible());
  assert.equal(await p.locator("#ghpaid").isHidden(), true, "bezahlte Pakete: noch aus");
  // fits the phone; the focus is in the dialog
  const bb = await dlg.locator(".ghbox").boundingBox();
  assert.ok(bb.x >= 0 && bb.x + bb.width <= 390 && bb.y >= 0, JSON.stringify(bb));
  assert.ok(await p.evaluate(() => document.getElementById("ghsheet").contains(document.activeElement)), "Fokus im Dialog");
  // axe on the dialog
  await p.addScriptTag({ content: AXE });
  const v = await p.evaluate(() => window.axe.run(document.getElementById("ghsheet"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }).then((r) => r.violations.map((x) => x.id + ": " + x.nodes.map((n) => n.target.join(" ")).join(", "))));
  assert.deepEqual(v, []);
  if (SHOTS) await p.screenshot({ path: SHOTS + "/guthaben-profil-390x844.png" });
  // Escape closes, the focus is back on the entry
  await p.keyboard.press("Escape");
  await dlg.waitFor({ state: "detached" });
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.id), "accredit");
  assert.ok(await p.locator("#shelf").isVisible(), "Mein Stil bleibt offen");
  assert.deepEqual(errs, []); await ctx.close();
});

test("Freie Karte mit 3 freien: Zeile 'Guthaben: 0 · Aufladen' -> Dialog, Gutschein einloesen (+5), schliessen, die Zaehlung zeigt das Guthaben", async () => {
  const s = account(3, 0), { p, ctx, errs, sent } = await phone(s.api);
  await p.locator("#create").tap();
  const line = p.locator("#ghline");
  await line.waitFor();
  assert.equal(await line.textContent(), "Guthaben: 0 · Aufladen");
  assert.match(await p.locator(".create-left").textContent(), /3 von 5 frei/);
  assert.equal(await p.getByRole("group", { name: "Aufladen" }).count(), 0, "im Erschaffen noch kein Aufladen-Kasten (freie Karten da)");
  assert.ok((await line.boundingBox()).height >= 44, "Tippflaeche");
  await line.tap();
  const dlg = p.getByRole("dialog", { name: "Guthaben" });
  await dlg.getByText("3 von 5").waitFor();
  const code = dlg.getByLabel("Gutschein-Code"), go = dlg.getByRole("button", { name: "Einlösen" });
  await code.fill("FALSCH-9"); await go.tap();
  await dlg.getByText("Diesen Code kennen wir nicht. Prüf die Schreibweise.").waitFor();
  await code.fill("test-code-1 "); await code.press("Enter");
  await dlg.getByText("5 Karten aufgeladen.").waitFor();
  assert.match(await dlg.locator(".ghnums").textContent(), /Guthaben5 Karten/);
  assert.deepEqual(sent.filter((x) => x.path === "credit/redeem").map((x) => x.body), [{ code: "FALSCH-9" }, { code: "test-code-1" }]);
  assert.equal(await p.locator("#createcode").count(), 0, "eine Formularlogik, kein doppeltes Feld");
  if (SHOTS) await p.screenshot({ path: SHOTS + "/guthaben-aufgeladen-390x844.png" });
  await dlg.getByRole("button", { name: "Schließen" }).tap();
  await dlg.waitFor({ state: "detached" });
  await p.locator("#ghline", { hasText: "Guthaben: 5 · Aufladen" }).waitFor();
  assert.match(await p.locator(".create-left").textContent(), /3 von 5 frei Guthaben: 5 Karten\./);
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.id), "ghline", "Fokus zurueck auf die (neu gezeichnete) Zeile");
  assert.deepEqual(errs, []); await ctx.close();
});

test("#aufladen: beim Start und per hashchange; die Adresse bleibt sauber; Tab bleibt im Dialog", async () => {
  const s = account(0, 1, null), { p, ctx, errs, sent } = await phone(s.api, { at: "#aufladen" });
  const dlg = p.getByRole("dialog", { name: "Guthaben" });
  await dlg.getByText("0 von 5").waitFor();
  assert.match(await dlg.locator(".ghnums").textContent(), /Guthaben1 Karte$/);
  assert.equal(await p.evaluate(() => location.hash), "");
  assert.ok(await p.locator("#home").isVisible(), "darunter die Tageskarte");
  if (SHOTS) await p.screenshot({ path: SHOTS + "/guthaben-link-390x844.png" });
  // Tab around: the focus never leaves the dialog
  for (let i = 0; i < 6; i++) { await p.keyboard.press("Tab"); assert.ok(await p.evaluate(() => document.getElementById("ghsheet").contains(document.activeElement)), "Tab " + i); }
  await p.keyboard.press("Shift+Tab");
  assert.ok(await p.evaluate(() => document.getElementById("ghsheet").contains(document.activeElement)));
  await p.keyboard.press("Escape"); await dlg.waitFor({ state: "detached" });
  // another part sets the address (tools' "Guthaben aufladen"): the view opens over the sheet
  await p.evaluate(() => { location.hash = "#aufladen"; });
  await dlg.getByText("0 von 5").waitFor();
  assert.equal(statusCalls(sent), 2, "je Oeffnen einmal");
  // window.Guthaben.open() from code: one dialog at a time
  await p.evaluate(() => window.Guthaben.open({ from: "test" }));
  await p.waitForTimeout(300);
  assert.equal(await p.locator("#ghsheet").count(), 1);
  assert.deepEqual(errs, []); await ctx.close();
});

test("Abgemeldet: der Dialog zeigt erst die Anmeldung (16+), Rueckweg ?go=aufladen oeffnet ihn wieder", async () => {
  let ctx, p, errs;
  ({ p, ctx, errs } = await phone((p0) => (p0 === "ai/status" ? [200, { meter: METER }] : null), { at: "#aufladen" }));
  const dlg = p.getByRole("dialog", { name: "Guthaben" });
  await dlg.getByText("Guthaben und Aufladen gibt es mit Konto. Nach dem Anmelden geht es hier weiter.").waitFor();
  assert.equal(await dlg.getByLabel("Gutschein-Code").count(), 0, "ohne Konto kein Code-Feld");
  const login = dlg.getByRole("button", { name: "Anmelden" });
  await login.tap();
  await dlg.getByRole("alert").getByText("Bitte zuerst bestätigen: Ich bin 16 oder älter.").waitFor();
  assert.equal(await p.evaluate(() => document.activeElement.id), "gh16");
  if (SHOTS) await p.screenshot({ path: SHOTS + "/guthaben-abgemeldet-390x844.png" });
  await dlg.getByLabel("Ich bin 16 oder älter.").check();
  const [nav] = await Promise.all([p.waitForRequest((r) => /\/auth\/login\?return=/.test(r.url())), login.click()]);
  assert.equal(new URL(nav.url()).searchParams.get("return"), "/duell?go=aufladen", "Rueckweg in die Guthaben-Ansicht");
  assert.deepEqual(errs, []); await ctx.close();
  // back from the sign-in with the account
  const s = account(5, 0);
  ({ p, ctx, errs } = await phone(s.api, { at: "?go=aufladen" }));
  await p.getByRole("dialog", { name: "Guthaben" }).getByText("5 von 5").waitFor();
  assert.doesNotMatch(await p.evaluate(() => location.search), /go=/);
  assert.deepEqual(errs, []); await ctx.close();
});

test("Englisch, monatlicher Topf, Gutscheine aus: Credit, 'this month', ohne Feld der feste Satz", async () => {
  const api = (p0) => (p0 === "ai/status" ? [200, { meter: METER, create: CREATE(2, 0, { period: "month", resetAt: "2026-12-01T00:00:00.000Z", voucher: false }) }] : null);
  const { p, ctx, errs } = await phone(api, { locale: "en-US", at: "#aufladen" });
  const dlg = p.getByRole("dialog", { name: "Credit" });
  await dlg.getByText("2 of 5 this month").waitFor();
  await dlg.getByText("New free cards from 1 December.").waitFor();
  await dlg.getByText("What credit is for").waitFor();
  await dlg.getByText("Redeeming isn't possible right now. Try again later.").waitFor();
  assert.equal(await dlg.getByLabel("Voucher code").count(), 0);
  assert.equal(await dlg.getByRole("button", { name: "Close" }).count(), 1);
  assert.deepEqual(errs, []); await ctx.close();
});
