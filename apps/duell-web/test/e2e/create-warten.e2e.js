"use strict";
// The waiting screen of the free card (src/warten.js, part "warten"): full screen at 390 x 844, its steps follow the real
// answers of the stub server one by one (sent -> place in the line -> AI at work -> checked -> card), "Abbrechen" (button
// and Escape) frees the form at once and gives a late answer back (discard), a refusal or an error ends the screen with its
// message. The stub holds every answer until the test lets it go, so each step is seen on its own. No model, no live host.
// WARTEN_SHOTS=<dir> saves pictures of the moments (start, mid, reveal, reduced motion, refusal).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium, devices } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const API = "https://demos-34a13a96.bunsenbrenner.org/api/duell/";
const SHOTS = process.env.WARTEN_SHOTS || "";
const DOC = { k: "card", col: ["#ffd400", "#ff3b1d"], by: [], t: "2048 zu zweit", x: "Schieb die Kacheln, bis die 2048 steht. Allein oder mit jemandem übers Netz.", st: "herz", sk: [{ e: "🎮", x: 0.84, y: 0.36, r: -0.1, z: 1.2 }] };
// a flying game as the server makes it (the sentence asks for a game: chip "Spiel")
const GAME = { k: "game", col: ["#ffd400", "#ff3b1d"], by: [], t: "2048 Flug", g: { seed: 2048, params: { gravity: 1800, jump: 430, gap: 140, speed: 130 }, theme: "ocean", title: "2048 Flug", emoji: "🕹", look: { d: "bubbles" }, route: [{ p: "ruhig", d: { gap: 20 }, t: "ocean", e: "🐟" }] } };
const RESULT = (rc, art) => [200, { kind: "karte", options: [art === "game" ? { art, doc: GAME } : { art: "card", doc: DOC }], seals: ["s2.karte.mw3abcde.AnlRQb9jJYrLILMRBtJj7yR1qlhJF0ER"], hashes: ["h".repeat(43)], cost: 1, receipt: rc, meter: METER, create: CREATE(4) }];
const METER = { free: 7, remaining: 7, size: 7, period: "week", pot: "free" };
const CREATE = (n) => ({ size: 5, remaining: n, pot: "create", period: "ever", refundsLeft: 2, age16: true });
const SATZ = "Ich möchte mit jemanden übers Netz oder alleine 2024 spielen";
let b;
test.before(async () => { b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true }); });
test.after(async () => { await b.close(); });

// The stub: "ai" and "queue" answer from a list of steps the test releases one by one (next()).
async function phone(steps, opt, chip) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, locale: "de-DE", ...(opt || {}) }), p = await ctx.newPage(), errs = [], sent = [];
  const gates = [];
  const next = () => { const g = gates.shift(); assert.ok(g, "keine Antwort mehr"); g(); };
  p.on("pageerror", (e) => errs.push(e.message));
  await ctx.route(/^https?:/, async (r) => {
    const u = r.request().url();
    if (u.startsWith(API)) {
      const p0 = u.slice(API.length), body = JSON.parse(r.request().postData() || "null"); sent.push({ path: p0, body });
      let a = null;
      if (p0 === "ai/status") a = [200, { meter: METER, create: CREATE(5) }];
      else if (p0 === "ai/accept") a = [200, { final: true, meter: METER, create: CREATE(4) }];
      else if (p0 === "ai/discard") a = [200, { refunded: 1, meter: METER, create: CREATE(5) }];
      else if (p0 === "ai" || p0 === "queue") { const s = steps.shift(); assert.ok(s, "unerwarteter Aufruf " + p0); await new Promise((ok) => { gates.push(ok); }); a = s; }
      if (a) return r.fulfill({ status: a[0], contentType: "application/json", body: JSON.stringify(a[1]) });
    }
    return r.abort();
  });
  await p.goto(page);
  await p.locator("#create").tap();
  await p.getByRole("button", { name: chip || "🃏 Karte" }).tap();
  const ta = p.getByLabel("Deine Beschreibung"); await ta.waitFor();
  await ta.fill(SATZ);
  // the part is asked for with the form, before the tap
  await p.waitForFunction(() => window.Parts.ready("warten"));
  await p.getByRole("button", { name: "✨ Erschaffen" }).tap();
  const ov = p.locator("#warten"); await ov.waitFor();
  return { p, ctx, errs, sent, ov, ta, next, waitingFor: async (n) => { for (let i = 0; i < 200 && gates.length < n; i++) await p.waitForTimeout(25); assert.equal(gates.length, n, "Anfrage beim Stub"); } };
}
const status = (p) => p.locator("#warten [role=status]").textContent();
const current = (p) => p.locator("#warten li[aria-current=step]").textContent();
async function shot(p, name) { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + ".png") }); }

test("Ganzflaechig, Schritte folgen den echten Stub-Antworten, Fokus bleibt im Dialog, die Karte erscheint", async () => {
  const { p, ctx, errs, sent, ov, next, waitingFor } = await phone([
    [202, { queued: true, ticket: "tk-warten-1", position: 2, etaS: 20 }],
    [202, { queued: true, ticket: "tk-warten-1", position: 0 }],
    RESULT("rc-warten-1", "game"),
  ], null, "🕹 Spiel");
  // the frame's figure is the chosen art's own (the chip's emoji), here Spiel
  assert.equal(await ov.locator(".wt-fig").textContent(), "🕹");
  // covers the whole viewport (once its own entrance, a short zoom, is over)
  await ov.evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
  const box = await ov.boundingBox();
  assert.deepEqual([box.x, box.y, box.width, box.height], [0, 0, 390, 844]);
  assert.equal(await ov.getAttribute("role"), "dialog"); assert.equal(await ov.getAttribute("aria-modal"), "true");
  assert.equal(await p.evaluate(() => document.getElementById("root").inert), true, "die Seite dahinter ist inert");
  // the sentence is there, big
  assert.match(await ov.locator(".wt-q").textContent(), /Ich möchte mit jemanden übers Netz oder alleine 2024 spielen/);
  // step 1: only sent; the stub holds the answer
  await waitingFor(1);
  assert.equal(await current(p), "Gesendet"); assert.match(await status(p), /Dein Satz ist beim Server/);
  // the cancel button is visible inside the viewport and has the focus; Tab keeps it there
  const x = p.getByRole("button", { name: "Abbrechen" }), xb = await x.boundingBox();
  assert.ok(xb.y + xb.height <= 844 && xb.height >= 44, JSON.stringify(xb));
  assert.equal(await p.evaluate(() => document.activeElement.id), "wartenx");
  await p.keyboard.press("Tab"); await p.keyboard.press("Shift+Tab");
  assert.equal(await p.evaluate(() => document.activeElement.id), "wartenx", "Fokus bleibt im Dialog");
  await p.waitForTimeout(900); await shot(p, "1-start");
  // step 2a: the server's place in the line, as a number from the answer
  next(); await p.getByText("Du bist in der Warteschlange auf Platz 2.").waitFor();
  assert.equal(await current(p), "KI baut"); assert.equal(await ov.locator(".wt-tk").textContent(), "Platz 2");
  // step 2b: running (position 0)
  await waitingFor(1); next();
  await p.getByText("Die KI baut jetzt deine Karte.", { exact: false }).waitFor();
  assert.equal(await ov.locator(".wt-tk").count(), 0);
  assert.equal(await p.locator("#warten li.ok").count(), 1, "nur 'Gesendet' ist erledigt");
  await waitingFor(1);
  await p.waitForTimeout(1200); await shot(p, "2-mitte");
  assert.ok(await ov.locator(".wt-mat b").count() >= 1, "Woerter aus dem Satz bauen die Karte");
  // step 3 + 4: the answer, checked, the card in the frame, sparks; then the screen goes into the preview
  next();
  await p.locator("#warten.wtdone .wtpv").waitFor();
  assert.match(await ov.locator(".wtpv").textContent(), /2048 Flug/);
  assert.equal(await p.locator("#warten li.ok").count(), 4);
  await p.waitForTimeout(350); await shot(p, "3-enthuellung");
  await ov.waitFor({ state: "detached" });
  assert.equal(await p.evaluate(() => document.getElementById("root").inert), false);
  const pv = p.locator(".create .createpv"); await pv.waitFor();
  await p.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("createpv"));
  assert.equal(sent.filter((s) => s.path === "queue").length, 2);
  await p.getByRole("button", { name: "Übernehmen" }).tap();
  await p.waitForFunction(() => window.DailyDebug.doc());
  assert.equal(sent.filter((s) => s.path === "ai/accept").length, 1);
  assert.equal(sent.filter((s) => s.path === "ai/discard").length, 0);
  assert.deepEqual(errs, []); await ctx.close();
});

test("Abbrechen (Escape und Knopf): Formular sofort frei, die spaete Antwort geht zurueck (discard), keine Vorschau", async () => {
  for (const how of ["Escape", "Knopf"]) {
    const { p, ctx, errs, sent, ov, ta, next, waitingFor } = await phone([
      [202, { queued: true, ticket: "tk-warten-2", position: 0 }],
      RESULT("rc-warten-2"),
    ]);
    await waitingFor(1); next();
    await p.getByText("Die KI baut jetzt deine Karte.", { exact: false }).waitFor();
    if (how === "Escape") await p.keyboard.press("Escape"); else await p.getByRole("button", { name: "Abbrechen" }).tap();
    await ov.waitFor({ state: "detached" });
    await p.getByText("Abgebrochen. Kommt die Antwort noch, geben wir sie sofort zurück", { exact: false }).waitFor();
    assert.equal(await p.getByRole("button", { name: "✨ Erschaffen" }).isEnabled(), true, how + ": das Formular ist sofort frei");
    assert.ok(await ta.evaluate((e) => e === document.activeElement), "Fokus zurueck im Satz");
    // the request still runs; its answer goes back at once
    await waitingFor(1); next();
    for (let i = 0; i < 80 && !sent.some((s) => s.path === "ai/discard"); i++) await p.waitForTimeout(50);
    assert.deepEqual(sent.filter((s) => s.path === "ai/discard").map((s) => s.body.receipt), ["rc-warten-2"], how);
    assert.equal(sent.filter((s) => s.path === "ai/accept").length, 0);
    assert.equal(await p.locator(".createpv").count(), 0, "keine Vorschau nach Abbrechen");
    assert.deepEqual(errs, [], how); await ctx.close();
  }
});

test("Absage und Fehler beenden den Schirm mit ihrer Meldung, kein haengender Spinner; zurueck zum Satz", async () => {
  const cases = [
    ["absage", [200, { kind: "karte", options: [], notyet: { what: "game", name: "2048" }, catalog: [], meter: METER, create: CREATE(5) }], "„2048“ kann die freie Karte noch nicht."],
    ["fehler", [503, { error: "down" }], "KI gerade nicht erreichbar. Nichts verbraucht."],
    ["voll", [429, { error: "busy" }], "KI gerade belegt. Nichts geändert, nichts verbraucht."],
  ];
  for (const [name, answer, text] of cases) {
    const { p, ctx, errs, sent, ov, next, waitingFor } = await phone([answer]);
    await waitingFor(1); next();
    await ov.locator("[role=alert]").filter({ hasText: text }).waitFor();
    assert.equal(await p.locator("#warten .wt-steps").isVisible(), false, name + ": die Schritte weichen der Meldung");
    assert.equal(await p.locator("#warten .wt-fly").count() + (await p.locator("#warten.wtmake").count()), 0, name + ": nichts bewegt sich weiter");
    const back = p.getByRole("button", { name: "Zurück zu deinem Satz" });
    assert.equal(await p.evaluate(() => document.activeElement.textContent), "Zurück zu deinem Satz");
    if (name === "absage") { await p.waitForTimeout(1000); await shot(p, "5-absage"); }
    await back.tap();
    await ov.waitFor({ state: "detached" });
    assert.ok(await p.locator(".create").getByText(text, { exact: false }).count() >= 1, name + ": die Meldung steht auch im Formular");
    assert.equal(sent.filter((s) => s.path === "ai/accept").length, 0);
    assert.deepEqual(errs, [], name); await ctx.close();
  }
});

test("prefers-reduced-motion: ruhige Fassung mit denselben Schritten, keine Animation, Karte ohne Verzoegerung", async () => {
  const { p, ctx, errs, ov, next, waitingFor } = await phone([
    [202, { queued: true, ticket: "tk-warten-3", position: 0 }],
    RESULT("rc-warten-3"),
  ], { reducedMotion: "reduce" });
  await waitingFor(1); next();
  await p.getByText("Die KI baut jetzt deine Karte.", { exact: false }).waitFor();
  await waitingFor(1);
  await p.waitForTimeout(1500);
  const moving = await p.evaluate(() => document.getAnimations().filter((a) => { const t = a.effect && a.effect.target; return t && t.closest && t.closest("#warten") && a.playState === "running"; }).length);
  assert.equal(moving, 0, "nichts bewegt sich");
  assert.equal(await p.locator(".wt-fly,.wt-cf").count(), 0, "keine fliegenden Woerter, kein Konfetti");
  assert.equal(await p.locator("#warten ol li").count(), 4);
  await shot(p, "4-reduzierte-bewegung");
  next();
  await ov.waitFor({ state: "detached" });
  await p.locator(".create .createpv").waitFor();
  assert.deepEqual(errs, []); await ctx.close();
});

test("Figur im Rahmen = Emoji des gewaehlten Art-Chips (Spiel, Karte, Meme, Sound, Quiz, Wie eine Karte)", async () => {
  for (const chip of ["🕹 Spiel", "🃏 Karte", "📷 Meme", "🥁 Sound", "❓ Quiz", "🧩 Wie eine Karte"]) {
    const { p, ctx, errs, ov, waitingFor } = await phone([[503, { error: "down" }]], null, chip);
    assert.equal(await ov.locator(".wt-fig").textContent(), chip.split(" ")[0], chip);
    await waitingFor(1);
    await p.keyboard.press("Escape"); await ov.waitFor({ state: "detached" });
    assert.deepEqual(errs, [], chip); await ctx.close();
  }
});
