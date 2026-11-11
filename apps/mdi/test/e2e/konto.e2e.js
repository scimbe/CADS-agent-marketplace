// P1 Konto & Login (Web) gegen einen falschen Wrapper auf dem Host der Seite (test/e2e/lib/fakewrapper.mjs):
// anonym -> Anmelde-Hinweis; 16+-Haken vor dem Gate; zurueck vom Gate angemeldet, Profil mit 16+ angelegt;
// Mein Stil bearbeitet, gesichert und nach Neuladen (ohne Geraetespeicher) vom Server zurueck; Gutschein falsch/richtig;
// Moderationshinweis mit Widerspruch; Daten herunterladen; Abmelden. Dazu axe (WCAG 2.2 AA) je Bildschirm, kein Ueberlauf,
// keine CSP-Verstoesse, keine Anfrage an einen anderen Host.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, VIEWS, act, axe, noOverflow, shotsDir } from "./lib/grund.mjs";
import { fakeWrapper, APP, VOUCHER } from "./lib/fakewrapper.mjs";
import { fakeShellScript } from "./lib/fakeshell.mjs";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

async function openApp(fw, { view = "phone390", lang = "de", scheme = "light", path = "/duell" } = {}) {
  const ctx = await b.newContext({ ...VIEWS[view], locale: lang === "de" ? "de-DE" : "en-GB", colorScheme: scheme, acceptDownloads: true });
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
const konto = (p) => p.locator("section.konto").getAttribute("data-konto");
async function waitKonto(p, s) { await p.locator('section.konto[data-konto="' + s + '"]').waitFor(); }
// Seite verlaesst sich selbst Richtung Gate: warten, bis das Gate den Aufruf gesehen hat, dann auf die zurueckgekehrte Seite
async function viaGate(p, fw, what, act0) {
  const n = fw.state.log.filter((l) => l === "GATE " + what).length;
  await act0();
  for (let i = 0; i < 200 && fw.state.log.filter((l) => l === "GATE " + what).length === n; i++) await p.waitForTimeout(25);
  assert.ok(fw.state.log.filter((l) => l === "GATE " + what).length > n, "Gate nicht erreicht: " + what);
}
const login = (p, fw) => viaGate(p, fw, "/gate/start", () => act(p, "login"));
async function shot(p, name) { const d = shotsDir(); if (d) await p.screenshot({ path: d + "/konto-" + name + ".png", fullPage: true }); }
async function checks(p, name, found) { found.push(...(await axe(p, name))); if (!(await noOverflow(p))) found.push(name + ": waagerechter Ueberlauf"); await shot(p, name); }

test("anonym -> Anmelde-Hinweis, 16+ vor dem Gate, angemeldet zurueck; Profil mit 16+ angelegt; Stil gespeichert und vom Server neu geladen; Abmelden", async () => {
  const fw = fakeWrapper(), found = [];
  const { ctx, p, errs } = await openApp(fw);
  await act(p, "stil");
  await p.locator("main.s-stil-start").waitFor();
  await waitKonto(p, "anonym");
  assert.match(await p.locator('[data-k="ki"]').innerText(), /KI diese Woche: noch 7 von 7/);
  await checks(p, "01-anonym", found);
  // ohne Haken: kein Sprung zum Gate, Hinweis per alert, Fokus bleibt auf der Seite
  await act(p, "login");
  await p.getByText("Bitte zuerst bestätigen: Ich bin 16 oder älter.").waitFor();
  assert.ok(!fw.state.log.some((l) => l.startsWith("GATE")), "ohne 16+ geht niemand zum Gate");
  await checks(p, "02-16plus-fehlt", found);
  await p.locator("#k-age16").check();
  await login(p, fw);
  assert.ok(fw.state.log.includes("GATE /gate/start"), "ueber /auth/login zum Gate: " + fw.state.log.join(", "));
  assert.ok(fw.state.log.includes("GET /auth/login"));
  // zurueck: ?go=konto oeffnet Mein Stil, Konto angemeldet, Profil mit 16+ angelegt
  await p.locator("main.s-stil-start").waitFor();
  await waitKonto(p, "angemeldet");
  await p.locator('[data-sync="ok"]').waitFor();
  const pr = fw.profileOf("lea@example.org");
  assert.ok(pr && pr.c, "Profil mit 16+-Tag angelegt: " + JSON.stringify(pr));
  assert.equal(new URL(p.url()).search, "", "?go= ist aus der Adresse entfernt");
  await checks(p, "03-angemeldet", found);
  // Stil aendern, Fertig -> gesichert
  await p.locator("#k-nick").fill("Oma Gisela");
  await p.locator('[aria-labelledby="lbl-emoji"] [data-v="🦄"]').click();
  await p.locator('[aria-labelledby="lbl-colors"] [role="radio"]').nth(3).click();
  await act(p, "done");
  await p.locator("main.s-shelf").waitFor();
  for (let i = 0; i < 50 && fw.profileOf("lea@example.org").p.me.nick !== "Oma Gisela"; i++) await p.waitForTimeout(50);
  assert.deepEqual(fw.profileOf("lea@example.org").p.me, { nick: "Oma Gisela", emoji: "🦄", colors: ["#14c872", "#ff3da5"], set: "tiere" });
  // Neu laden OHNE Geraetespeicher: der Stil kommt vom Server zurueck
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.locator("header.bar").waitFor();
  await act(p, "stil"); await waitKonto(p, "angemeldet");
  await p.locator('[data-sync="ok"]').waitFor();
  assert.equal(await p.locator("#k-nick").inputValue(), "Oma Gisela");
  assert.equal(await p.locator('[aria-labelledby="lbl-emoji"] [data-v="🦄"]').getAttribute("aria-checked"), "true");
  assert.match(await p.locator('[data-k="on"]').innerText(), /Angemeldet als 🦄 Oma Gisela/);
  assert.equal(await p.locator("header .icon.me").count(), 0, "Kopf zeigt im Stil kein zweites Stil-Symbol");
  // 18+ (eigene Angabe)
  await act(p, "age18");
  await p.locator('[data-act="age18"][aria-pressed="true"]').waitFor();
  for (let i = 0; i < 40 && !fw.profileOf("lea@example.org").a18; i++) await p.waitForTimeout(50);
  assert.ok(fw.profileOf("lea@example.org").a18, "18+ beim Server");
  // Konto & Daten: gespeichert, Download, Abmelden
  await act(p, "daten"); await p.locator("main.s-stil-daten").waitFor();
  assert.match(await p.locator('[data-k="where"]').innerText(), /In deinem Konto/);
  await p.locator('[data-k="mod-none"]').waitFor();
  await checks(p, "04-daten", found);
  const [dl] = await Promise.all([p.waitForEvent("download"), act(p, "export")]);
  assert.equal(dl.suggestedFilename(), "my-daily-idea-daten.json");
  const data = JSON.parse(await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8")));
  assert.equal(data.server.profil.me.nick, "Oma Gisela"); assert.equal(data.server.ab18, true);
  await viaGate(p, fw, "/gate/logout", () => act(p, "logout"));
  assert.ok(fw.state.log.includes("GATE /gate/logout"));
  await p.locator("main.s-stil-start").waitFor();
  await waitKonto(p, "anonym");
  assert.equal(fw.state.sessions.size, 0, "Sitzung beim Gate beendet");
  assert.deepEqual(found, []);
  assert.deepEqual(errs, []);
  assert.deepEqual(ctx._blocked || [], [], "keine Anfrage an einen anderen Host");
  await ctx.close();
});

test("16+-Pruefung: angemeldet ohne Aussage -> kein stilles Anlegen; erst mit Haken wird das Profil angelegt", async () => {
  const fw = fakeWrapper(); fw.state.next = "tom@example.org";
  const { ctx, p, errs } = await openApp(fw);
  // anmelden, ohne dass dieses Geraet einen Versuch kennt (z. B. Login aus einer anderen Demo)
  await p.goto("https://bunsenbrenner.org/gate/start?host=x&return=%2Fduell");
  await p.locator("header.bar").waitFor();
  await act(p, "stil"); await waitKonto(p, "angemeldet");
  await p.locator('[data-sync="need16"]').waitFor();
  assert.equal(fw.profileOf("tom@example.org"), null, "nichts angelegt");
  await act(p, "create");
  await p.getByText("Bitte zuerst bestätigen: Ich bin 16 oder älter.").waitFor();
  assert.equal(fw.profileOf("tom@example.org"), null);
  await p.locator("#k-age16").check();
  await act(p, "create");
  await p.locator('[data-sync="ok"]').waitFor();
  assert.ok(fw.profileOf("tom@example.org").c);
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("Gutschein: falscher Code sagt es, richtiger laedt auf und das Guthaben kommt vom Server", async () => {
  const fw = fakeWrapper(), found = [];
  const { ctx, p, errs } = await openApp(fw);
  await act(p, "stil"); await waitKonto(p, "anonym");
  assert.equal(await p.locator("#k-voucher").count(), 0, "ohne Konto kein Gutscheinfeld");
  await p.locator("#k-age16").check();
  await login(p, fw);
  await waitKonto(p, "angemeldet");
  assert.match(await p.locator('[data-k="credit"]').innerText(), /Guthaben: keins/);
  await p.locator("#k-voucher").fill("FALSCH-1234");
  await act(p, "redeem");
  await p.getByText("Diesen Code kennen wir nicht. Prüf die Schreibweise.").waitFor();
  await checks(p, "05-gutschein-falsch", found);
  await p.locator("#k-voucher").fill(VOUCHER.toLowerCase());
  await p.locator("#k-voucher").press("Enter");
  await p.getByText("5 Karten aufgeladen.").waitFor();
  await p.locator('[data-k="credit"]', { hasText: "Guthaben: 5 freie Karten" }).waitFor();
  assert.equal(await p.locator("#k-voucher").inputValue(), "");
  await checks(p, "06-gutschein-ok", found);
  assert.deepEqual(found, []); assert.deepEqual(errs, []);
  await ctx.close();
});

test("Moderation: Hinweise lesen und widersprechen; Geraete-Code verbinden (ohne Konto) und falscher Code", async () => {
  const fw = fakeWrapper(), found = [];
  fw.notices("lea@example.org");
  const { ctx, p, errs } = await openApp(fw);
  await act(p, "stil"); await p.locator("#k-age16").check();
  await login(p, fw);
  await waitKonto(p, "angemeldet");
  await act(p, "daten"); await p.locator(".mod-item").first().waitFor();
  assert.equal(await p.locator(".mod-item").count(), 2);
  assert.match(await p.locator(".notices").innerText(), /Verwarnung \(Strike\)[\s\S]*Regel: Gewalt, Mobbing oder Selbstverletzung\./);
  const nid = await p.locator(".mod-item").nth(1).getAttribute("data-nid");
  await p.locator('[data-act="appeal-' + nid + '"]').click();
  await p.locator("main.s-stil-widerspruch").waitFor();
  await act(p, "appeal-send");
  await p.getByText("Schreib kurz, warum du widersprichst.").waitFor();
  await p.locator("#k-appeal").fill("Die Karte war ein Witz unter Freunden.");
  await checks(p, "07-widerspruch", found);
  await act(p, "appeal-send");
  await p.locator("main.s-stil-daten").waitFor();
  await p.getByText("Dein Widerspruch ist angekommen. Ein Mensch entscheidet.").waitFor();
  await p.locator('[data-nid="' + nid + '"] [data-k="appeal-state"]').waitFor();
  await checks(p, "08-daten-hinweise", found);
  // Geraete-Code: neuer Code (angemeldet), dann auf einem zweiten Geraet ohne Konto verbinden
  await act(p, "code-new");
  await p.locator("#k-code").waitFor();
  const code = (await p.locator("#k-code").innerText()).trim();
  assert.match(code, /^([0-9a-f]{4}-){7}[0-9a-f]{4}$/);
  const B = await openApp(fw);
  await act(B.p, "stil"); await waitKonto(B.p, "anonym"); await act(B.p, "daten");
  await B.p.locator("#k-code-in").fill("abc"); await act(B.p, "code-join");
  await B.p.getByText("Der Code hat 32 Zeichen aus 0–9 und a–f.").waitFor();
  await B.p.locator("#k-code-in").fill(code.toUpperCase()); await act(B.p, "code-join");
  await B.p.locator("#k-code").waitFor();
  await act(B.p, "done"); await B.p.locator('[data-k="on"], .ok').first().waitFor();
  assert.match(await B.p.locator("section.konto").innerText(), /Verbunden per Geräte-Code/);
  assert.deepEqual(found, []); assert.deepEqual(errs, []); assert.deepEqual(B.errs, []);
  await B.ctx.close(); await ctx.close();
});

test("Ehrlich bei Ausfall: Anmeldedienst weg -> Hinweis und Nochmal; Seite ohne Server (Datei) -> kein Login-Versprechen", async () => {
  const fw = fakeWrapper({ gate: "down" });
  const { ctx, p, errs } = await openApp(fw);
  await act(p, "stil"); await waitKonto(p, "fehler");
  await p.getByText("Der Anmeldedienst ist gerade nicht erreichbar.").waitFor();
  fw.state.gate = "up";
  await act(p, "retry"); await waitKonto(p, "anonym");
  assert.deepEqual(errs, []);
  await ctx.close();
  const F = await open(b, { view: "phone390" });
  await act(F.p, "stil"); await waitKonto(F.p, "fehler");
  await F.p.getByText("Anmelden geht im Browser auf der Seite von My Daily Idea. Hier bleibt alles auf diesem Gerät.").waitFor();
  assert.equal(await F.p.locator('[data-act="login"], [data-act="retry"]').count(), 0, "kein Knopf, der nichts tun kann");
  assert.deepEqual(F.ctx._blocked || [], [], "von file:// kein Netz");
  assert.deepEqual(F.errs, []);
  await F.ctx.close();
});

test("App-Huelle: Anmelden ueber die Konto-Bruecke (kein Gate, kein Cookie), Profil gesichert, Abmelden ueber die Huelle", async () => {
  const fw = fakeWrapper(), found = [];
  const ctx = await b.newContext({ ...VIEWS.phone390, locale: "de-DE" });
  ctx.setDefaultTimeout(15000);
  await fw.attach(ctx);
  await ctx.addInitScript(fakeShellScript());
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e));
  p.on("console", (m) => { if (m.type() === "error" && !/^Failed to load resource: the server responded with a status of (401|403|404|409|410|429|503)/.test(m.text())) errs.push("console " + m.text()); });
  await p.goto(APP + "/duell");
  await p.locator("header.bar").waitFor();
  await act(p, "stil"); await waitKonto(p, "anonym");
  assert.equal(await p.getByText("Anmelden geht im Browser", { exact: false }).count(), 0, "in der App kein Verweis auf den Browser");
  await p.locator("#k-age16").check();
  await act(p, "login");
  await waitKonto(p, "angemeldet");
  await p.locator('[data-sync="ok"]').waitFor();
  await checks(p, "20-app-angemeldet", found);
  assert.ok(!fw.state.log.some((l) => l.startsWith("GATE") || l === "GET /auth/login"), "kein Gate: " + fw.state.log.join(", "));
  assert.deepEqual((await ctx.cookies(APP)).filter((c) => c.name === "ct_gate_session"), [], "kein Gate-Cookie");
  const pr = fw.profileOf("lea@example.org");
  assert.ok(pr && pr.c, "Profil des Kontos mit 16+ angelegt (ueber Bearer)");
  assert.equal(await p.evaluate(() => Object.keys(window.DuellHost).join()), "account", "die Seite sieht nur die Funktion, kein Token");
  await act(p, "logout");
  await waitKonto(p, "anonym");
  assert.equal(fw.state.bearers.size, 0, "Token bei der Huelle verworfen");
  assert.deepEqual(found, []); assert.deepEqual(errs, []);
  await ctx.close();
});

for (const o of [{ lang: "en", scheme: "dark", view: "phone390" }, { lang: "de", scheme: "light", view: "desk1280" }]) {
  test("axe ohne Verstoesse in Mein Stil (" + o.view + "/" + o.lang + "/" + o.scheme + "), grosse Schrift und einfache Sprache", async () => {
    const fw = fakeWrapper(), found = [];
    fw.notices("lea@example.org");
    const { ctx, p, errs } = await openApp(fw, o);
    await act(p, "stil"); await waitKonto(p, "anonym");
    await p.locator('[aria-labelledby="lbl-fs"] [data-v="sg"]').click();
    assert.equal(await p.evaluate(() => document.documentElement.style.fontSize), "137.5%");
    await act(p, "easy");
    await checks(p, "09-gross-" + o.view + "-" + o.lang + "-" + o.scheme, found);
    await p.locator("#k-age16").check();
    await login(p, fw);
    await waitKonto(p, "angemeldet"); await p.locator('[data-sync="ok"]').waitFor();
    await checks(p, "10-angemeldet-" + o.view + "-" + o.lang + "-" + o.scheme, found);
    await act(p, "daten"); await p.locator(".mod-item").first().waitFor();
    await checks(p, "11-daten-" + o.view + "-" + o.lang + "-" + o.scheme, found);
    await act(p, "done"); await act(p, "done"); await p.locator("main.s-shelf").waitFor();
    assert.equal(await p.evaluate(() => document.documentElement.style.fontSize), "137.5%", "Schrift bleibt (Geraet)");
    await checks(p, "12-regal-gross-" + o.view, found);
    assert.deepEqual(found, []); assert.deepEqual(errs, []);
    await ctx.close();
  });
}
