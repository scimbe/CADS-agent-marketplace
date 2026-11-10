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
const CREATE = (n, extra) => ({ size: 5, remaining: n, pot: "create", period: "ever", refundsLeft: 2, age16: true, ...extra });
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
  // the ticker lives behind "Alle Karten" since the new start (#185, redesign wave 1); where it shows, the tile comes first
  if (feat) assert.ok(t.y < feat.y, "vor dem Ticker");
  assert.equal(await tile.evaluate((e) => getComputedStyle(e).backgroundColor), "rgb(255, 212, 0)");
  await tile.focus(); await p.keyboard.press("Enter");
  // without an account one short step (11 Nov): the 16+ tick of this tap, "Anmelden", and back straight into the making
  const login = p.getByRole("button", { name: "Anmelden" });
  await login.waitFor();
  assert.equal(await p.getByLabel("Deine Beschreibung").count(), 0, "kein Formular ohne Konto");
  await login.click(); await p.locator(".crneed", { hasText: "Ich bin 16 oder älter" }).waitFor();
  assert.equal(await p.evaluate(() => document.activeElement.id), "create16", "ohne Haken: der Fokus auf dem Haken");
  await p.getByLabel("Ich bin 16 oder älter.").check();
  const [nav] = await Promise.all([p.waitForRequest((r) => /\/auth\/login\?return=/.test(r.url())), login.click()]);
  assert.equal(new URL(nav.url()).searchParams.get("return"), "/duell?go=erschaffen", "Rueckweg ins Erschaffen");
  assert.ok(!sent.some((s) => s.path === "ai"), "ohne Konto kein KI-Aufruf");
  assert.deepEqual(errs, []);
});

test("Mit Konto und 16+-Erklaerung: ein Satz, Vorschau mit Badge, Uebernehmen -> Editor mit Siegel karte; nur der Text geht raus", async () => {
  let left = 5;
  const { p, errs, sent } = await phone((p0) => {
    if (p0 === "ai/status") return [200, { meter: METER, create: CREATE(left) }];
    if (p0 === "ai") { left--; return [200, { kind: "karte", options: [OPT], seals: [SEAL], hashes: ["h".repeat(43)], cost: 1, receipt: "rc-karte-1", meter: METER, create: CREATE(left) }]; }
    if (p0 === "ai/accept") return [200, { final: true, meter: METER, create: CREATE(left) }];
    return null;
  });
  await p.locator("#create").tap();
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
  assert.deepEqual(req.body.input, { text: "Geburtstagskarte für meine beste Freundin, sie liebt Sonnenblumen", art: "card" }, "kein Alter im Request: der Server liest 18+ aus dem Kontoprofil");
  await p.getByRole("button", { name: "Übernehmen" }).tap();
  assert.ok(await until(() => sent.some((s) => s.path === "ai/accept")), "gebucht beim Uebernehmen");
  // the editor opens a moment after the accept (create-ui.js: setTimeout 0 after the receipt is settled)
  await p.waitForFunction(() => window.DailyDebug.doc());
  const doc = await p.evaluate(() => window.DailyDebug.doc());
  // h: the page hashes the option itself (ai.js optionHash), the same rule as the server's seal
  const h = await require("../../src/ai.js").optionHash(OPT, require("node:crypto").webcrypto.subtle);
  assert.equal(doc.x, DOC.x); assert.deepEqual(doc.ki, { k: "karte", s: SEAL, h });
  // a free card is whole as it comes: "Fertig" is not locked behind "Erst was ändern"
  await p.locator("#edmain").waitFor();
  assert.equal(await p.locator("#edmain").getAttribute("aria-disabled"), "false");
  assert.equal(await p.locator("#edwhy").textContent(), "");
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

// W3: game, quiz and an ability of an existing card (here: Termin finden), as lib/duell-karte.mjs compose() builds them
const W3 = {"game":{"k":"game","col":["#ffd400","#ff3b1d"],"by":[],"t":"Tiefsee-Sturm","g":{"seed":4242,"params":{"gravity":1800,"jump":430,"gap":140,"speed":130},"theme":"ocean","title":"Tiefsee-Sturm","emoji":"🐠","look":{"d":"bubbles"},"route":[{"p":"ruhig","d":{"gravity":-200,"gap":20,"speed":-20},"t":"ocean","e":"🐟"},{"p":"sturm","d":{"gap":-15,"speed":30},"t":"night","e":"⚡"},{"p":"schnell","d":{"speed":40},"t":"ocean","e":"🐳"}]}},"quiz":{"k":"turn","col":["#ff6a1f","#1b2bd8"],"by":[],"t":"Unser Sonnensystem","g":"quiz","seed":4242,"q":"","f":"bolt","pk":{"t":"Unser Sonnensystem","m":"l","q":[["Welcher Planet ist der Sonne am nächsten?","Merkur","Venus","Mars","Erde"],["Welcher Planet ist der größte?","Jupiter","Saturn","Neptun","Erde"],["Wie heißt der rote Planet?","Mars","Venus","Uranus","Merkur"]]}},"faehigkeit":{"k":"turn","col":["#ff4fa3","#0a7f55"],"by":[],"i":"zug-termin","t":"Grillabend","s":"Termine antippen, alle stimmen ab.","g":"termin","seed":4242,"q":"","f":"star"}};
test("W3: Spiel, Quiz und eine vorhandene Kartenart (Termin) kommen als Vorschau und oeffnen sich als echte Karte", async () => {
  for (const [art, doc, label, shows] of [["game", W3.game, "🕹 Spiel", /🐠 Tiefsee-Sturm.*🐟 → ⚡ → 🐳/], ["quiz", W3.quiz, "❓ Quiz", /3 Fragen.*Merkur|3 Fragen.*nächsten/], ["faehigkeit", W3.faehigkeit, "🧩 Wie eine Karte", /Termine antippen.*nutzt: Wann könnt ihr alle\?/]]) {
    const { p, errs, sent } = await phone((p0) => {
      if (p0 === "ai/status") return [200, { meter: METER, create: CREATE(5) }];
      if (p0 === "ai") return [200, { kind: "karte", options: [{ art, doc }], seals: [SEAL], hashes: ["h".repeat(43)], cost: 1, receipt: "rc-" + art, meter: METER, create: CREATE(4) }];
      if (p0 === "ai/accept") return [200, { final: true, meter: METER, create: CREATE(4) }];
      return null;
    });
    await p.evaluate(() => { window.DailyApp.me().pref = { age: "a18" }; });
    await p.locator("#create").tap();
    await p.getByRole("button", { name: label }).tap();
    const ta = p.getByLabel("Deine Beschreibung");
    await ta.waitFor();
    await ta.fill("Beschreibung für " + art);
    await p.getByRole("button", { name: "✨ Erschaffen" }).tap();
    const pv = p.locator(".createpv");
    await pv.waitFor();
    assert.match((await pv.textContent()).replace(/\s+/g, " "), shows, art);
    assert.equal(sent.find((s) => s.path === "ai").body.input.art, art);
    await p.getByRole("button", { name: "Übernehmen" }).tap();
    assert.ok(await until(() => sent.some((s) => s.path === "ai/accept")), art + " gebucht");
    await p.waitForFunction(() => window.DailyDebug.doc());
    const got = await p.evaluate(() => window.DailyDebug.doc());
    assert.equal(got.k, doc.k, art); assert.equal(got.ki.k, "karte", art);
    if (art === "faehigkeit") assert.equal(got.i, "zug-termin");
    if (art === "game") {   // the game says it was made by AI (AI Act Art. 50), like a world (welt.e2e.js)
      await p.locator("#edmain").waitFor(); await p.locator("#edmain").tap();
      await p.locator("#game:not([hidden])").waitFor();
      assert.equal(await p.locator("#gki").isVisible(), true, "KI-Zeichen im Spiel"); assert.equal(await p.locator("#gki").textContent(), "KI");
    }
    assert.deepEqual(errs, [], art);
    await p.context().close();
  }
});

test("Ethik-Audit: ohne 16+-Erklaerung kein Formular; Notschalter sagt freundlich ab; Verwerfen-Regel steht vor dem Erstellen", async () => {
  for (const [extra, want] of [[{ age16: false }, /ab 16.*Mein Stil/], [{ off: true }, /gerade nicht verfügbar/]]) {
    const { p, errs, sent } = await phone((p0) => (p0 === "ai/status" ? [200, { meter: METER, create: CREATE(5, extra) }] : null));
    await p.locator("#create").tap();
    // the shelf first shows "…" while /status is asked
    await p.waitForFunction(() => { const b = document.querySelector("#shbody .note"); return b && b.textContent !== "…"; });
    assert.match((await p.locator("#shbody").innerText()).replace(/\s+/g, " "), want);
    assert.equal(await p.getByLabel("Deine Beschreibung").count(), 0, "kein Formular");
    assert.ok(!sent.some((s) => s.path === "ai"));
    assert.deepEqual(errs, []);
    await p.context().close();
  }
  const { p } = await phone((p0) => (p0 === "ai/status" ? [200, { meter: METER, create: CREATE(5) }] : null));
  await p.locator("#create").tap();
  await p.getByLabel("Deine Beschreibung").waitFor();
  assert.match(await p.locator("#shbody").innerText(), /Verwerfen gibt die Karte zurück – noch 2×/);
  await p.context().close();
});

test("Kein Alkohol auf Karten: der Server laesst das Getraenk weg (note drinks), die Vorschau sagt es einmal; ohne note kein Hinweis", async () => {
  for (const note of [["drinks", "days:14", "people:4", "money18", "nosend", "async", "duel", "chars:20", "x:9"], "drinks", undefined]) {
    const doc = { k: "card", col: ["#ffd400", "#ff3b1d"], by: [], t: "Chorprobe", x: "Chorprobe am Freitag, danach gemütliches Beisammensein.", st: "herz", sk: [] };
    const { p, errs } = await phone((p0) => {
      if (p0 === "ai/status") return [200, { meter: METER, create: CREATE(5) }];
      if (p0 === "ai") return [200, { kind: "karte", options: [{ art: "card", doc }], seals: [SEAL], hashes: ["h".repeat(43)], cost: 1, receipt: "rc-drink", meter: METER, create: CREATE(4), ...(note ? { note } : {}) }];
      return null;
    });
    await p.locator("#create").tap();
    const ta = p.getByLabel("Deine Beschreibung"); await ta.waitFor();
    await ta.fill("Einladung zur Chorprobe, danach Punsch");
    await p.getByRole("button", { name: "✨ Erschaffen" }).tap();
    await p.locator(".createpv").waitFor();
    const hint = p.getByText("Getränke mit Alkohol nennen wir auf Karten nicht, weil sie auch Jugendliche erreichen.");
    assert.equal(await hint.count(), note ? 1 : 0, String(note));
    // the limits of the ability, once each; an unknown code shows nothing
    assert.equal(await p.getByText("Diese Karte plant höchstens 14 Tage im Voraus.").count(), Array.isArray(note) ? 1 : 0);
    assert.equal(await p.getByText("Diese Karte schafft bis zu 4 Personen.").count(), Array.isArray(note) ? 1 : 0);
    assert.equal(await p.getByText("Geld sammeln geht erst ab 18, deshalb plant diese Karte das Geschenk ohne Geld.").count(), Array.isArray(note) ? 1 : 0);
    assert.equal(await p.getByText("Die App schreibt niemandem selbst: Du teilst den Link.").count(), Array.isArray(note) ? 1 : 0);
    assert.equal(await p.getByText("Diese Karte läuft per Link, ein Zug nach dem anderen, nicht gleichzeitig live.").count(), Array.isArray(note) ? 1 : 0);
    assert.equal(await p.getByText("Ein Duell zu zweit bringt sein eigenes Spiel mit, dein Thema steht nicht auf der Karte.").count(), Array.isArray(note) ? 1 : 0);
    assert.equal(await p.getByText("Jeder Eintrag hat höchstens 20 Zeichen.").count(), Array.isArray(note) ? 1 : 0);
    assert.equal(await p.locator(".createpv ~ p.note, p.note").filter({ hasText: "x:9" }).count(), 0);
    assert.deepEqual(errs, []); await p.context().close();
  }
});

test("Art Spiel mit genanntem Spiel (Dart, Doppelkopf): kein Flugspiel, ehrlich noch nicht, Katalogkarte oeffnet sich, nichts gebucht", async () => {
  for (const [name, catalog, tile] of [["Dart", [], null], ["Kartenspiel", ["tisch-doko"], /Doppel ?kopf/i]]) {
    const { p, errs, sent } = await phone((p0) => {
      if (p0 === "ai/status") return [200, { meter: METER, create: CREATE(5) }];
      if (p0 === "ai") return [200, { kind: "karte", options: [], notyet: { what: "game", name }, catalog, meter: METER, create: CREATE(5) }];
      return null;
    });
    await p.locator("#create").tap();
    await p.getByRole("button", { name: "🕹 Spiel" }).tap();
    const ta = p.getByLabel("Deine Beschreibung"); await ta.waitFor();
    await ta.fill(name === "Dart" ? "Erstelle ein Dart Spiel" : "Doppelkopf-Runde");
    await p.getByRole("button", { name: "✨ Erschaffen" }).tap();
    await p.getByText("„" + name + "“ kann die freie Karte noch nicht.", { exact: false }).waitFor();
    assert.equal(await p.locator(".createpv").count(), 0, "no preview, no flying game");
    assert.equal(sent.filter((x) => x.path === "ai/accept").length, 0, "nothing booked");
    if (!tile) assert.equal(await p.getByText("Im Katalog gibt es dafür noch keine Karte.").count(), 1);
    else { await p.getByRole("button", { name: tile }).first().tap(); await p.waitForTimeout(400); }
    assert.deepEqual(errs, [], name); await p.context().close();
  }
});

test("Merkmal fehlt (Zu- und Absagen sammeln): ehrlich noch nicht, aehnliche Katalogkarte, nichts gebucht", async () => {
  const { p, errs, sent } = await phone((p0) => {
    if (p0 === "ai/status") return [200, { meter: METER, create: CREATE(5) }];
    if (p0 === "ai") return [200, { kind: "karte", options: [], notyet: { what: "feature", name: "Zu- und Absagen sammeln" }, catalog: ["zug-termin"], meter: METER, create: CREATE(5) }];
    return null;
  });
  await p.locator("#create").tap();
  await p.getByRole("button", { name: "🧩 Wie eine Karte" }).tap();
  const ta = p.getByLabel("Deine Beschreibung"); await ta.waitFor();
  await ta.fill("Einladung, alle sollen zu- oder absagen");
  await p.getByRole("button", { name: "✨ Erschaffen" }).tap();
  await p.getByText("Zu- und Absagen sammeln kann die freie Karte noch nicht. Dafür wird nichts abgebucht.").waitFor();
  await p.getByText("Ähnlich im Katalog:").waitFor();
  assert.equal(await p.locator(".createpv").count(), 0); assert.equal(sent.filter((x) => x.path === "ai/accept").length, 0);
  assert.deepEqual(errs, []); await p.context().close();
});
