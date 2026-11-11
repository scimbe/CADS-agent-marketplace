"use strict";
// The Robot (window.FreeFromCard) and the Magic (window.Magic), src/robot-ui.js, at 390x844. A deck card becomes a free card
// through the free card's refine step; the server is a stub here that changes the base it got (its own tests:
// CADS-DEMO-wrapper test/duell-robot.test.mjs). Screenshots go to SHOTS (default: the system's temp folder).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { chromium } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const API = "https://demos-34a13a96.bunsenbrenner.org/api/duell/";
const SHOTS = process.env.SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), "robot-shots-"));
const SEAL = "s2.karte.mw3abcde.AnlRQb9jJYrLILMRBtJj7yR1qlhJF0ER";
const METER = { free: 7, remaining: 7, size: 7, period: "week", pot: "free" };
const CREATE = (n) => ({ size: 5, remaining: n, pot: "create", period: "ever", refundsLeft: 2, age16: true });
let b;
test.before(async () => { b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); });
test.after(async () => { await b.close(); });

// change(base, text, n) -> [doc, note?]: what the stub server makes of the base (n: the round)
async function phone(change, hash) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "de-DE" }), p = await ctx.newPage(), errs = [], sent = [];
  ctx.setDefaultTimeout(20000);
  p.on("pageerror", (e) => errs.push(e.message));
  let left = 5, n = 0;
  await ctx.route(/^https?:/, async (r) => {
    const u = r.request().url();
    if (!u.startsWith(API)) return r.abort();
    const p0 = u.slice(API.length), body = JSON.parse(r.request().postData() || "null"); sent.push({ path: p0, body });
    const ok = (j) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(j) });
    if (p0 === "ai/status") return ok({ meter: METER, create: CREATE(left) });
    if (p0 === "ai") {
      const [doc, note] = change(body.input.base, body.input.text, n++);
      if (!doc) return ok({ kind: "karte", options: [], notyet: { what: "same", name: "" }, catalog: [], meter: METER, create: CREATE(left) });
      left--;
      return ok({ kind: "karte", options: [{ art: "x", doc, ki: { k: "karte", s: SEAL, h: "h".repeat(43), o: "o".repeat(22) } }], seals: [SEAL], hashes: ["h".repeat(43)], cost: 1, receipt: "rc-robot-" + n, meter: METER, create: CREATE(left), ...(note ? { note } : {}) });
    }
    if (p0 === "ai/accept" || p0 === "ai/discard") return ok({ final: true, meter: METER, create: CREATE(left) });
    return r.abort();
  });
  await p.goto(page + (hash || ""));
  return { p, errs, sent };
}
const until = async (f) => { for (let i = 0; i < 200; i++) { if (f()) return true; await new Promise((ok) => setTimeout(ok, 50)); } return false; };
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, "robot-" + name + ".png") });
async function ask(p, text) {
  const ta = p.locator("#robottext"); await ta.waitFor();
  await ta.fill(text);
  await p.locator("#robot").getByRole("button", { name: "✨ Anpassen" }).tap();
  try { await p.locator("#robotpv").waitFor(); } catch (e) { throw new Error("kein Ergebnis: " + await p.locator("#robot").textContent()); }
}

test("Zug-Karte 'Worauf einigen wir uns?': Magie füllt die 5 Optionen, Robot passt zweimal an, Übernehmen -> eigene freie Karte", async () => {
  const { p, errs, sent } = await phone((base, text, n) => [Object.assign({}, base, { t: n === 0 ? "Wohin am Samstag?" : "Wohin am Sonntag?", s: "Fünf Ideen, ihr wählt." })], "#i=zug-einig");
  await p.locator("#go").click();
  await p.locator("#panel input.tlist").first().waitFor();
  const doc0 = await p.evaluate(() => window.DailyDebug.doc());
  // Magic: the five empty entries, on the device, from the card's seed; nothing goes out
  assert.equal(await p.evaluate((d) => window.Magic.can(d, document.getElementById("panel")), doc0), true);
  const filled = await p.evaluate((d) => window.Magic.fill(d, document.getElementById("panel")), doc0);
  assert.equal(filled, 5);
  const vals = await p.locator("#panel input.tlist").evaluateAll((fs) => fs.map((f) => f.value));
  assert.equal(vals.length, 5); assert.equal(new Set(vals).size, 5, "fünf verschiedene: " + vals); assert.ok(vals.every(Boolean));
  await p.waitForFunction(() => document.getElementById("edmain").getAttribute("aria-disabled") === "false");
  assert.equal(await p.evaluate((d) => window.Magic.can(d, document.getElementById("panel")), doc0), false, "nichts mehr offen: keine Magie");
  assert.ok(!sent.some((s) => s.path === "ai"), "Magie ohne KI und ohne Netz");
  await shot(p, "1-magie-einig");
  // Robot: the card stays visible above the sheet
  assert.equal(await p.evaluate((d) => window.FreeFromCard.can(d), doc0), true);
  await p.evaluate((d) => window.FreeFromCard.open(d), doc0);
  await p.locator("#robot").waitFor();
  assert.match(await p.locator("#robot label").first().textContent(), /Wie soll die Karte anders werden\?/);
  const [stage, sheet] = await Promise.all([p.locator("#stagewrap").boundingBox(), p.locator("#robot").boundingBox()]);
  assert.ok(stage && stage.height > 40 && stage.y + 40 < sheet.y, "die Karte bleibt über dem Robot sichtbar");
  await shot(p, "2-robot-offen");
  await ask(p, "Für unseren Ausflug am Samstag");
  const r1 = sent.filter((s) => s.path === "ai")[0].body;
  assert.equal(r1.kind, "karte"); assert.equal(r1.input.from, "zug-einig"); assert.equal(r1.input.base.i, "zug-einig"); assert.equal(r1.input.text, "Für unseren Ausflug am Samstag");
  assert.ok(!("art" in r1.input), "die Art kommt vom Server aus der Basis");
  assert.match(await p.locator("#robotpv").textContent(), /Wohin am Samstag\?/);
  await shot(p, "3-robot-runde1");
  // round two: the last result is the base, no deck id any more (it is a free card now); the first one goes back
  await ask(p, "Lieber Sonntag");
  const r2 = sent.filter((s) => s.path === "ai")[1].body;
  assert.equal(r2.input.from, undefined); assert.equal(r2.input.base.t, "Wohin am Samstag?");
  assert.ok(await until(() => sent.some((s) => s.path === "ai/discard")), "die nicht genommene erste Runde geht zurück");
  assert.match(await p.locator("#robotpv").textContent(), /Wohin am Sonntag\?/);
  await shot(p, "4-robot-runde2");
  await p.locator("#robot").getByRole("button", { name: "Übernehmen" }).tap();
  assert.ok(await until(() => sent.some((s) => s.path === "ai/accept")), "gebucht beim Übernehmen");
  await p.waitForFunction(() => { const d = window.DailyDebug.doc(); return d && d.t === "Wohin am Sonntag?"; });
  const doc = await p.evaluate(() => window.DailyDebug.doc());
  assert.equal(doc.i, "zug-einig"); assert.equal(doc.ki.k, "karte"); assert.equal(doc.ki.s, SEAL);
  assert.equal(await p.locator("#robot").count(), 0);
  await shot(p, "5-eigene-freie-karte");
  assert.deepEqual(errs, []);
});

test("Flugspiel: Robot macht aus dem Deck-Spiel eine freie Karte, zweite Runde, Übernehmen -> Editor mit Siegel", async () => {
  const { p, errs, sent } = await phone((base, text, n) => [{ ...base, g: { ...base.g, title: n === 0 ? "Mondflug" : "Mondflug bei Nacht", emoji: "🚀", theme: n === 0 ? base.g.theme : "night" } }], "#i=spiel-lava");
  await p.locator("#go").click();
  await p.waitForFunction(() => window.DailyDebug.doc() && window.DailyDebug.doc().k === "game");
  const doc0 = await p.evaluate(() => window.DailyDebug.doc());
  await p.evaluate((d) => window.FreeFromCard.open(d), doc0);
  await ask(p, "Ein Flug zum Mond mit einer Rakete");
  assert.equal(sent.filter((s) => s.path === "ai")[0].body.input.from, "spiel-lava");
  await ask(p, "Und bei Nacht");
  assert.equal(sent.filter((s) => s.path === "ai")[1].body.input.base.g.title, "Mondflug");
  await shot(p, "6-flug-runde2");
  await p.locator("#robot").getByRole("button", { name: "Übernehmen" }).tap();
  await p.waitForFunction(() => { const d = window.DailyDebug.doc(); return d && d.g && d.g.title === "Mondflug bei Nacht"; });
  const doc = await p.evaluate(() => window.DailyDebug.doc());
  assert.equal(doc.k, "game"); assert.equal(doc.g.emoji, "🚀"); assert.equal(doc.ki.k, "karte");
  await shot(p, "7-flug-uebernommen");
  assert.deepEqual(errs, []);
});

test("Nichts geändert kostet nichts und sagt es; nicht Umsetzbares wird mit festem Text gesagt", async () => {
  const { p, errs } = await phone((base, text) => (/gleich/.test(text) ? [null] : [{ ...base, t: "Weltraum-Ziegel", col: ["#c8ff00", "#7a1fff"], fa: { e: "🚀", w: 2 } }, ["skip:tempo"]]), "");
  await p.evaluate(() => window.FreeFromCard.open(window.Daily.docFromIdea(window.Daily.byId("arcade-ziegel"), window.DailyApp.me(), "de")));
  const ta = p.locator("#robottext"); await ta.waitFor();
  await ta.fill("Alles soll gleich bleiben"); await p.locator("#robot").getByRole("button", { name: "✨ Anpassen" }).tap();
  await p.locator("#robot").getByText(/Daran hat sich nichts geändert/).waitFor();
  await ask(p, "Im Weltraum, bis 2 Punkte, und viel schneller");
  assert.match(await p.locator(".robotskip").textContent(), /Das kann diese Karte noch nicht: anderes Tempo\./);
  await shot(p, "8-arcade-vorschau");
  // taken: kept on this device and opened as the arcade duel with its title, figure and points to win
  await p.locator("#robot").getByRole("button", { name: "Übernehmen" }).tap();
  await p.locator(".arcwin").waitFor();
  assert.match(await p.locator(".arcwin").textContent(), /Wer zuerst 2 Punkte hat, gewinnt\./);
  assert.ok(await p.getByText("Weltraum-Ziegel").first().isVisible());
  const kept = await p.evaluate(() => window.Kit.store.frei);
  assert.equal(kept.length, 1); assert.deepEqual(kept[0].fa, { e: "🚀", w: 2 }); assert.equal(kept[0].ki.k, "karte");
  await shot(p, "9-arcade-menue");
  // against the bot with the card's own values: the match ends at 2
  await p.evaluate(() => { window.__arcadeSeed = "robot-e2e"; });
  await p.getByRole("button", { name: /Gegen den Bot/ }).tap();
  await p.locator(".arccv").waitFor();
  await shot(p, "10-arcade-spiel");
  assert.deepEqual(errs, []);
});

test("Bauernskat: die Hausregel der freien Karte wird die Wahl am Tisch (r= im Link), Notizzettel wird auf dem Gerät behalten", async () => {
  const { p, errs } = await phone((base) => (base.k === "table" ? [{ ...base, t: "Opas Runde", fa: { r: ["null"] } }, ["skip:spieler"]] : [{ ...base, t: "Einkauf", fa: { v: "karo", x: "Brot, Milch, Äpfel" } }]), "");
  await p.evaluate(() => window.FreeFromCard.open(window.Daily.docFromIdea(window.Daily.byId("tisch-bauernskat"), window.DailyApp.me(), "de")));
  await ask(p, "Wie bei Opa, mit Null, und zu dritt");
  assert.match(await p.locator(".robotskip").textContent(), /mehr oder andere Mitspielende/);
  await shot(p, "11-bauernskat-vorschau");
  await p.locator("#robot").getByRole("button", { name: "Übernehmen" }).tap();
  await p.waitForFunction(() => window.Kit.store.tbRules && JSON.stringify(window.Kit.store.tbRules.bauernskat) === '["null"]');
  await p.waitForTimeout(400); await shot(p, "12-bauernskat-tisch");
  // the note tool (PR #221 brings its screen): the free card is kept with its look and text
  await p.evaluate(() => { if (window.TableUI && window.TableUI.close) window.TableUI.close(); });
  await p.evaluate(() => window.FreeFromCard.open({ k: "tool", i: "notizzettel", col: ["#ffd400", "#ff3b1d"], by: [], t: "Notizzettel" }));
  await ask(p, "Ein karierter Einkaufszettel");
  await p.locator("#robot").getByRole("button", { name: "Übernehmen" }).tap();
  await p.waitForFunction(() => (window.Kit.store.frei || []).some((d) => d.k === "tool"));
  const note = await p.evaluate(() => window.Kit.store.frei.find((d) => d.k === "tool"));
  assert.deepEqual(note.fa, { v: "karo", x: "Brot, Milch, Äpfel" }); assert.equal(note.t, "Einkauf");
  assert.deepEqual(errs, []);
});

test("ohne Konto: der Robot zeigt den Weg zur Anmeldung, kein KI-Aufruf; can() ist ehrlich", async () => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "de-DE" }), p = await ctx.newPage(), errs = [], sent = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await ctx.route(/^https?:/, (r) => { const u = r.request().url(); if (u.startsWith(API)) { sent.push(u); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ meter: METER }) }); } return r.abort(); });
  await p.goto(page);
  assert.equal(await p.evaluate(() => window.FreeFromCard.can(null)), false);
  assert.equal(await p.evaluate(() => window.FreeFromCard.can({ k: "nope" })), false);
  await p.evaluate(() => window.FreeFromCard.open(window.Daily.docFromIdea(window.Daily.byId("zug-einig"), window.DailyApp.me(), "de")));
  await p.locator("#robot").getByRole("button", { name: "Anmelden" }).waitFor();
  assert.ok(!sent.some((u) => /\/ai$/.test(u)));
  assert.deepEqual(errs, []);
  await ctx.close();
});
