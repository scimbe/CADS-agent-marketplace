"use strict";
// The honest refusal of the free card (A4a1): a wish it cannot make gets the fixed reason of the server's table and at most
// one counter-proposal (alt), a catalog card that opens by its id or a genre with an editable example sentence. Nothing is
// sent by itself, "Nein danke" is as large as the other button, the catalog chips stay. The server answers are the recorded
// ones of CADS-DEMO-wrapper test/fixtures/karte-vorschlag.json (section absage, the same file as test/fixtures here; its
// test/duell-absage.test.mjs checks them field by field against lib/duell-absage.mjs). No model, no live host.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const API = "https://demos-34a13a96.bunsenbrenner.org/api/duell/";
const FX = require("../fixtures/karte-vorschlag.json").absage;
const METER = { free: 7, remaining: 7, size: 7, period: "week", pot: "free" };
const CREATE = { size: 5, remaining: 5, pot: "create", period: "ever", refundsLeft: 2, age16: true };
const ART = { game: "🕹 Spiel" };
const fx = (t) => { const f = FX.find((x) => x.t === t); assert.ok(f, "Fixture " + t); return f; };
let b;
test.before(async () => { b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); });
test.after(async () => { await b.close(); });

// the page with the stub server: /ai answers with the recorded refusal (plus meter/create, which the fixture leaves out)
async function refused(f, after) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], viewport: { width: 412, height: 915 }, locale: "de-DE" }), p = await ctx.newPage(), errs = [], sent = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await ctx.route(/^https?:/, async (r) => {
    const u = r.request().url();
    if (u.startsWith(API)) {
      const p0 = u.slice(API.length), body = JSON.parse(r.request().postData() || "null"); sent.push({ path: p0, body });
      const a = p0 === "ai/status" ? [200, { meter: METER, create: CREATE }] : p0 === "ai" ? (sent.filter((s) => s.path === "ai").length > 1 && after ? after : [f.status, { ...f.antwort, meter: METER, create: CREATE }]) : null;
      if (a) return r.fulfill({ status: a[0], contentType: "application/json", body: JSON.stringify(a[1]) });
    }
    return r.abort();
  });
  await p.goto(page);
  await p.locator("#create").tap();
  if (ART[f.art]) await p.getByRole("button", { name: ART[f.art] }).tap();
  const ta = p.getByLabel("Deine Beschreibung"); await ta.waitFor();
  await ta.fill(f.t);
  await p.getByRole("button", { name: "✨ Erschaffen" }).tap();
  await p.getByRole("button", { name: "Zurück zu deinem Satz" }).tap();   // the waiting screen ends with the reason (warten.js)
  await p.locator(".createalt").waitFor();
  return { p, ctx, errs, sent, ta, posts: () => sent.filter((s) => s.path === "ai") };
}

test("Tetris: Absage mit der steine-Katalogkarte, ein Klick oeffnet genau diese id, nichts gebucht", async () => {
  const f = fx("tetris für opa");
  assert.deepEqual(f.antwort.alt && [f.antwort.alt.kind, f.antwort.alt.id], ["katalog", "zug-steine"]);
  const { p, ctx, errs, sent } = await refused(f);
  await p.getByText("Tetris kann die freie Karte noch nicht. Dafür wird nichts abgebucht.").waitFor();
  const alt = p.locator(".createalt");
  assert.match(await alt.textContent(), /Gleiche Steine/);
  assert.equal(await p.locator(".createpv").count(), 0, "keine Vorschau, kein Flugspiel");
  // the alt card is the catalog card; the chips do not show it a second time
  assert.equal(await p.getByRole("button", { name: /→ Gleiche Steine/ }).count(), 0);
  await alt.getByRole("button", { name: "Karte öffnen" }).tap();
  assert.equal(await p.evaluate(() => window.DailyDebug.doc().i), "zug-steine");
  assert.equal(sent.filter((s) => s.path === "ai/accept").length, 0, "nichts gebucht");
  assert.equal(sent.filter((s) => s.path === "ai").length, 1);
  assert.deepEqual(errs, []); await ctx.close();
});

test("Zwei Bots: Feld mit 'Spiel du vor …' vorbefuellt und aenderbar, 0 POST vor dem Klick, dann genau einer im Genre G1", async () => {
  const f = fx("zwei bots kämpfen");
  assert.equal(f.antwort.alt.kind, "genre");
  // the second wish (the sent sentence) gets a normal answer here: a flying game as the server makes it
  const DOC = { k: "game", col: ["#ffd400", "#ff3b1d"], by: [], t: "Geisterflug", g: { seed: 4242, params: { gravity: 1800, jump: 430, gap: 140, speed: 130 }, theme: "ocean", title: "Geisterflug", emoji: "👻", look: { d: "bubbles" }, route: [{ p: "ruhig", d: { gap: 20 }, t: "ocean", e: "🐟" }] } };
  const { p, ctx, errs, posts, ta } = await refused(f, [200, { kind: "karte", options: [{ art: "game", doc: DOC }], seals: ["s2.karte.mw3abcde.AnlRQb9jJYrLILMRBtJj7yR1qlhJF0ER"], hashes: ["h".repeat(43)], cost: 1, receipt: "rc-g1", meter: METER, create: { ...CREATE, remaining: 4 } }]);
  await p.getByText("Bots gegeneinander gibt es nicht, hier spielen Menschen. Dafür wird nichts abgebucht.").waitFor();
  const field = p.getByLabel("Vorschlag, du kannst ihn ändern");
  assert.match(await field.inputValue(), /^Spiel du vor/);
  assert.equal(await field.inputValue(), f.antwort.alt.satz);
  await p.waitForTimeout(600);
  assert.equal(posts().length, 1, "nur der eigene Wunsch, der Vorschlag ist nicht gesendet");
  // "Nein danke" is as large as "Diesen Satz senden"
  const [send, no] = await Promise.all(["Diesen Satz senden", "Nein danke"].map((n) => p.getByRole("button", { name: n }).boundingBox()));
  assert.ok(Math.abs(send.width - no.width) <= 1 && Math.abs(send.height - no.height) <= 1, JSON.stringify([send, no]));
  assert.ok(no.height >= 44, "Tippflaeche");
  await field.fill(f.antwort.alt.satz + " mit Wolken");
  assert.equal(posts().length, 1, "Tippen sendet nichts");
  await p.getByRole("button", { name: "Diesen Satz senden" }).tap();
  await p.locator(".createpv").waitFor();
  assert.equal(posts().length, 2, "genau ein POST nach dem Klick");
  assert.deepEqual(posts()[1].body.input, { text: f.antwort.alt.satz + " mit Wolken", art: "game", genre: "G1" });
  assert.equal(await ta.inputValue(), f.antwort.alt.satz + " mit Wolken", "der gesendete Satz steht im eigenen Feld");
  assert.deepEqual(errs, []); await ctx.close();
});

test("A11y-Baum: Grund, Vorschlag und 'Nein danke' stehen als Text da, fuer jeden Fixture-Satz; Nein danke schliesst nur den Vorschlag", async () => {
  for (const f of FX) {
    const { p, ctx, errs, posts, ta } = await refused(f);
    const tree = await p.locator(".create").ariaSnapshot();
    assert.match(tree, /Dafür wird nichts abgebucht\./, f.t);
    assert.match(tree, /group "Stattdessen:"/, f.t);
    if (f.antwort.alt.kind === "katalog") assert.match(tree, /button "Karte öffnen"/, f.t);
    else { assert.match(tree, /button "Diesen Satz senden"/, f.t); assert.ok(tree.includes(f.antwort.alt.satz.slice(0, 40)), f.t + ": " + tree); }
    assert.match(tree, /button "Nein danke"/, f.t);
    await p.getByRole("button", { name: "Nein danke" }).tap();
    assert.equal(await p.locator(".createalt").count(), 0, f.t);
    assert.ok(await p.getByText("Dafür wird nichts abgebucht.", { exact: false }).count() >= 1, "der Grund bleibt");
    assert.ok(await ta.evaluate((e) => e === document.activeElement), "zurueck im eigenen Feld");
    assert.equal(posts().length, 1, f.t);
    assert.deepEqual(errs, [], f.t); await ctx.close();
  }
});

test("Ein nicht gesendeter Vorschlag (Krise bleibt am Geraet) gibt sein Genre nicht an den naechsten eigenen Wunsch weiter", async () => {
  const f = fx("zwei bots kämpfen");
  const { p, ctx, errs, posts, ta } = await refused(f);
  await p.getByLabel("Vorschlag, du kannst ihn ändern").fill("ich will nicht mehr leben");
  await p.getByRole("button", { name: "Diesen Satz senden" }).tap();
  assert.equal(posts().length, 1, "die Krise geht nicht hinaus");
  await ta.fill("ein Flugspiel ueber den Wolken");
  await p.getByRole("button", { name: "✨ Erschaffen" }).tap();
  await p.waitForFunction(() => document.querySelectorAll(".createalt").length > 0);
  assert.equal(posts().length, 2);
  assert.deepEqual(posts()[1].body.input, { text: "ein Flugspiel ueber den Wolken", art: "game" }, "kein Genre, das die Person nicht gesendet hat");
  assert.deepEqual(errs, []); await ctx.close();
});
