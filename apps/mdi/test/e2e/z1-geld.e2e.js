// Geld einsammeln mit bestaetigtem 18+ (P1-Konto) gegen den falschen Wrapper (test/e2e/lib/fakewrapper.mjs, Antwortformen
// aus test/fixtures/wrapper-konto.json): Lea meldet sich an (16+); ohne 18+ ist die Karte gesperrt; nach der
// Bestaetigung in Mein Stil kehrt sie zur Karte zurueck; Name, Zweck, 4 Personen, 37,50 € mit Anteilszeile; der Link geht
// an Tom (angemeldet, 18+), der den PayPal-Knopf mit dem richtigen Anteil sieht; eine dritte Person ohne Konto sieht keinen
// Knopf. Je Bildschirm axe (WCAG 2.2 AA), kein Ueberlauf, keine Seitenfehler, keine Anfrage an fremde Hosts.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, VIEWS, act, axe, noOverflow, waitScreen, screen } from "./lib/grund.mjs";
import { fakeWrapper, APP } from "./lib/fakewrapper.mjs";
import { pickMode } from "./lib/scenarios.mjs";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

async function openApp(fw, { view = "phone390", path = "/duell" } = {}) {
  const ctx = await b.newContext({ ...VIEWS[view], locale: "de-DE", colorScheme: "light" });
  ctx.setDefaultTimeout(15000);
  await fw.attach(ctx);
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e));
  p.on("console", (m) => { if (m.type() === "error" && !/^Failed to load resource: the server responded with a status of (401|403|404|409|410|429|503)/.test(m.text())) errs.push("console " + m.text()); });
  await p.addInitScript(() => { document.addEventListener("securitypolicyviolation", (e) => console.error("CSP " + e.violatedDirective + " " + e.blockedURI)); });
  await p.goto(APP + path);
  await p.locator("header.bar").waitFor();
  return { ctx, p, errs };
}
async function viaGate(p, fw, what, act0) {
  const n = fw.state.log.filter((l) => l === "GATE " + what).length;
  await act0();
  for (let i = 0; i < 200 && fw.state.log.filter((l) => l === "GATE " + what).length === n; i++) await p.waitForTimeout(25);
  assert.ok(fw.state.log.filter((l) => l === "GATE " + what).length > n, "Gate nicht erreicht: " + what);
}
/** Anmelden ueber Mein Stil (16+ vor dem Gate), zurueck angemeldet; optional 18+ dort bestaetigen. */
async function signIn(p, fw, email, { age18 = false } = {}) {
  fw.state.next = email;
  await act(p, "stil"); await p.locator("main.s-stil-start").waitFor();
  await p.locator("#k-age16").check();
  await viaGate(p, fw, "/gate/start", () => act(p, "login"));
  await p.locator('section.konto[data-konto="angemeldet"]').waitFor();
  await p.locator('[data-sync="ok"]').waitFor();
  if (age18) {
    await act(p, "age18"); await p.locator('[data-act="age18"][aria-pressed="true"]').waitFor();
    for (let i = 0; i < 40 && !fw.profileOf(email).a18; i++) await p.waitForTimeout(50);
    assert.ok(fw.profileOf(email).a18, email + ": 18+ beim Server");
  }
  await act(p, "done"); await p.locator("main.s-shelf").waitFor();
}
const main = (p) => p.locator("main");
async function fillLabel(p, label, v) { await main(p).getByLabel(label, { exact: true }).fill(v); await p.waitForTimeout(220); }
async function next(p) { await p.waitForTimeout(220); const g = main(p).locator('[data-act="go-step"]').first(); assert.equal(await g.isDisabled(), false, (await main(p).locator(".w-why").allTextContents()).join(" ")); await g.click(); await p.waitForTimeout(60); }
async function checks(p, name, found) { found.push(...(await axe(p, name))); if (!(await noOverflow(p))) found.push(name + ": waagerechter Ueberlauf"); }

async function startCard(p) {
  await act(p, "open-zug-sammeln"); await waitScreen(p, "card-view");
  await pickMode(p, "de", "link"); await act(p, "go");
  if ((await screen(p)) === "card-play-cover") await act(p, "cover-ok");
  await waitScreen(p, "card-play-turn");
}

for (const view of ["phone390", "desk1280"]) {
  test("Geld einsammeln ohne 18+ (" + view + "): angemeldet ohne 18+ und ohne Konto gesperrt – kein Namensfeld, kein PayPal-Knopf", async () => {
    const fw = fakeWrapper(), found = [];
    const A = await openApp(fw, { view });
    await signIn(A.p, fw, "lea@example.org");
    await startCard(A.p);
    assert.equal(await main(A.p).locator("input.field").count(), 0, "ohne 18+ kein PayPal-Name");
    assert.match(await main(A.p).innerText(), /PayPal-Link zeigen wir ab 18/);
    assert.equal(await main(A.p).locator(".chip", { hasText: "Ich bin 18 oder älter" }).count(), 1, "Bestaetigung angeboten");
    await checks(A.p, "gesperrt-angemeldet", found);
    const C = await openApp(fw, { view });
    await startCard(C.p);
    assert.equal(await main(C.p).locator("input.field").count(), 0);
    await checks(C.p, "gesperrt-ohne-konto", found);
    assert.deepEqual(found, []);
    assert.deepEqual([...A.errs, ...C.errs], [], "Seitenfehler oder CSP-Verstoss");
    await A.ctx.close(); await C.ctx.close();
  });
}

for (const view of ["phone390", "desk1280"]) {
  test("Geld einsammeln mit 18+ (" + view + "): ohne 18+ gesperrt, nach Bestaetigung in Mein Stil zurueck zur Karte mit Name, Anteil und PayPal-Knopf beim Empfaenger", async () => {
    const fw = fakeWrapper(), found = [];
    const A = await openApp(fw, { view });
    await signIn(A.p, fw, "lea@example.org");
    // ohne 18+: Hinweis, Bestaetigungsknopf, kein Namensfeld
    await startCard(A.p);
    assert.equal(await main(A.p).locator("input.field").count(), 0, "ohne 18+ kein PayPal-Name");
    assert.match(await main(A.p).innerText(), /PayPal-Link zeigen wir ab 18/);
    await checks(A.p, "01-18plus-fehlt", found);
    // 18+ in Mein Stil bestaetigen und zur Karte zurueckkehren
    await act(A.p, "back"); await A.p.locator("main.s-card-view, main.s-shelf").first().waitFor();
    if (await A.p.locator("main.s-card-view").count()) await act(A.p, "back");
    await act(A.p, "stil"); await A.p.locator("main.s-stil-start").waitFor();
    await act(A.p, "age18"); await A.p.locator('[data-act="age18"][aria-pressed="true"]').waitFor();
    for (let i = 0; i < 60 && !(fw.profileOf("lea@example.org") || {}).a18; i++) await A.p.waitForTimeout(50);
    assert.ok(fw.profileOf("lea@example.org").a18, "18+ beim Server");
    await act(A.p, "done"); await A.p.locator("main.s-shelf").waitFor();
    await startCard(A.p);
    await main(A.p).getByLabel("PayPal.me-Name (Konto ab 18)", { exact: true }).waitFor();
    await checks(A.p, "02-name", found);
    await fillLabel(A.p, "PayPal.me-Name (Konto ab 18)", "leaSammelt"); await next(A.p);
    await fillLabel(A.p, "Wofür ist das Geld?", "Pizza-Abend"); await next(A.p);
    await main(A.p).getByRole("button", { name: "4 👤", exact: true }).click(); await next(A.p);
    await fillLabel(A.p, "Wie viel ist es zusammen? (Euro)", "37,50");
    await main(A.p).getByText("37,50 € geteilt durch 4 · 9,37 € pro Person · Rest 2 ct übernimmt, wer sammelt").waitFor();
    await checks(A.p, "03-betrag", found);
    await next(A.p);
    await waitScreen(A.p, "card-play-send");
    await A.p.locator("#linkfield").waitFor({ state: "attached" });
    const u = await A.p.locator("#linkfield").inputValue(), hash = u.slice(u.indexOf("#"));

    // Tom: angemeldet, 18+ -> PayPal-Knopf mit Anteil
    const B = await openApp(fw, { view });
    await signIn(B.p, fw, "tom@example.org", { age18: true });
    await B.p.goto(APP + "/duell" + hash); await B.p.locator("header.bar").waitFor();
    await waitScreen(B.p, "receive-show"); await act(B.p, "accept");
    await waitScreen(B.p, "card-play-turn");
    const pay = main(B.p).locator('a[href^="https://paypal.me/"]');
    await pay.waitFor();
    assert.equal(await pay.getAttribute("href"), "https://paypal.me/leaSammelt/9.37EUR");
    assert.match(await pay.innerText(), /9,37 € mit PayPal zahlen/i);
    assert.equal(await pay.getAttribute("rel"), "noopener noreferrer");
    assert.match(await main(B.p).innerText(), /Pizza-Abend: 9,37 € pro Person an paypal\.me\/leaSammelt/);
    await checks(B.p, "04-zahlen", found);

    // dritte Person ohne Konto: kein Knopf
    const C = await openApp(fw, { view, path: "/duell" + hash });
    await waitScreen(C.p, "receive-show"); await act(C.p, "accept"); await waitScreen(C.p, "card-play-turn");
    assert.equal(await main(C.p).locator('a[href^="https://paypal.me/"]').count(), 0, "ohne 18+ kein PayPal-Knopf");
    await checks(C.p, "05-ohne-konto", found);

    assert.deepEqual(found, []);
    assert.deepEqual([...A.errs, ...B.errs, ...C.errs], [], "Seitenfehler oder CSP-Verstoss");
    await A.ctx.close(); await B.ctx.close(); await C.ctx.close();
  });
}

test("Geld einsammeln: 18+ direkt in der Karte bestaetigen, Rueckkehr in denselben Zug", async () => {
  const fw = fakeWrapper();
  const A = await openApp(fw);
  await signIn(A.p, fw, "lea@example.org");
  await startCard(A.p);
  await main(A.p).locator(".chip", { hasText: "Ich bin 18 oder älter" }).click();
  for (let i = 0; i < 60 && !(fw.profileOf("lea@example.org") || {}).a18; i++) await A.p.waitForTimeout(50);
  assert.ok(fw.profileOf("lea@example.org").a18, "18+ aus der Karte beim Server gespeichert");
  await main(A.p).getByLabel("PayPal.me-Name (Konto ab 18)", { exact: true }).waitFor();
  assert.equal(await screen(A.p), "card-play-turn", "zurueck im Zug ohne Umweg");
  await A.ctx.close();
});
