"use strict";
// The free card: the category is chosen actively (no preselected chip), a game its genre first ("Welche Art?": only what the
// server builds, wrapper lib/duell-karte.mjs GENRE_ENGINE G1/G2), then "Wer spielt?" (only what that game offers, the rest
// visibly off with its reason). What is not built yet stands as "Bald" and says so plainly. User report 11.11.2026: "2024
// spielen" (the number-sliding puzzle) became a flying game. The server is a stub (its answers as the wrapper's
// test/duell-karte-spielwunsch.test.mjs checks them). Phone 390x844; screenshots to SHOTS when set.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const API = "https://demos-34a13a96.bunsenbrenner.org/api/duell/";
const SEAL = "s2.karte.mw3abcde.AnlRQb9jJYrLILMRBtJj7yR1qlhJF0ER";
const METER = { free: 7, remaining: 7, size: 7, period: "week", pot: "free" };
const CREATE = (n) => ({ size: 5, remaining: n, pot: "create", period: "ever", refundsLeft: 2, age16: true });
const FLY = { k: "game", col: ["#ffd400", "#ff3b1d"], by: [], t: "Feierabend", g: { seed: 4242, params: { gravity: 1800, jump: 430, gap: 140, speed: 130 }, theme: "sunset", title: "Feierabend", emoji: "🦆", look: { d: "bubbles" }, route: [{ p: "ruhig", d: { gap: 20 }, t: "sunset", e: "🌅" }] } };
const shot = async (p, name) => { if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, name + ".png"), fullPage: false }); };
let b;
test.before(async () => { b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); });
test.after(async () => { await b.close(); });

async function phone(api) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, locale: "de-DE" }), p = await ctx.newPage(), errs = [], sent = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await ctx.route(/^https?:/, async (r) => {
    const u = r.request().url();
    if (u.startsWith(API)) { const p0 = u.slice(API.length), body = JSON.parse(r.request().postData() || "null"); sent.push({ path: p0, body }); const a = api(p0, body, sent); if (a) return r.fulfill({ status: a[0], contentType: "application/json", body: JSON.stringify(a[1]) }); }
    return r.abort();
  });
  await p.goto(page);
  await p.locator("#create").tap();
  await p.getByLabel("Deine Beschreibung").waitFor();
  return { p, ctx, errs, sent, posts: () => sent.filter((s) => s.path === "ai") };
}
const status = (p0) => (p0 === "ai/status" ? [200, { meter: METER, create: CREATE(5) }] : null);
const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test("Keine Kategorie vorgewaehlt: Feld und Erschaffen warten mit 'Erst Kategorie waehlen'; Spiel braucht seine Art; Bald sagt ehrlich nein", async () => {
  const { p, ctx, errs, posts } = await phone(status);
  const ta = p.getByLabel("Deine Beschreibung"), go = p.getByRole("button", { name: "✨ Erschaffen" });
  const arts = p.getByRole("group", { name: "Was soll es werden?" });
  assert.equal(await arts.locator("[aria-pressed=true]").count(), 0, "kein Chip vorgewaehlt");
  assert.ok(await ta.isDisabled()); assert.ok(await go.isDisabled());
  await p.getByText("Erst Kategorie wählen").waitFor();
  await shot(p, "1-ohne-kategorie");
  await arts.getByRole("button", { name: "🕹 Spiel" }).tap();
  await p.getByText("Erst die Art des Spiels wählen").waitFor();
  assert.ok(await ta.isDisabled());
  const genre = p.getByRole("group", { name: "Welche Art?" });
  assert.deepEqual(await genre.getByRole("button").allTextContents(), ["✈️ Fliegen", "🏃 Jump & Run"], "nur, was der Server baut");
  // what is not built yet: muted, a tap says so plainly, with the closest catalog card; nothing is sent
  const soon = p.getByRole("group", { name: "Bald:" });
  assert.deepEqual(await soon.getByRole("button").allTextContents(), ["♟️ Strategie", "🔢 Zahlen schieben", "🏎 Rennen", "🎲 Karten & Brett", "📏 Schätzen", "🎭 Wählen & Bluffen", "🎚 Skala"]);
  await soon.getByRole("button", { name: "🔢 Zahlen schieben" }).tap();
  await p.getByText("„Zahlen schieben“ gibt es noch nicht.").waitFor();
  await p.getByRole("button", { name: /→ Gleiche/ }).waitFor();
  await shot(p, "2-spiel-bald");
  await soon.getByRole("button", { name: "🏎 Rennen" }).tap();
  await p.getByText("„Rennen“ gibt es noch nicht.").waitFor();
  await p.getByRole("button", { name: "→ ✈️ Fliegen" }).tap();
  // the genre chosen: the field opens, with an example of that genre; "Wer spielt?" shows only what the flight offers
  const g1 = p.getByRole("group", { name: "Welche Art?" }).getByRole("button", { name: "✈️ Fliegen" });
  assert.equal(await g1.getAttribute("aria-pressed"), "true");
  assert.ok(await ta.isEnabled()); assert.ok(await go.isEnabled());
  assert.equal(await ta.getAttribute("placeholder"), "Ein Drache fliegt durch die Nacht");
  const mode = p.getByRole("group", { name: "Wer spielt?" });
  assert.deepEqual(await mode.getByRole("button").allTextContents(), ["🙂 Allein", "🤖 Bot", "⚔️ Duell"]);
  assert.ok(await mode.getByRole("button", { name: "🤖 Bot" }).isDisabled(), "kein Bot-Gegner fuer das Flugspiel");
  await p.getByText("Bot: einen Bot-Gegner gibt es für dieses Spiel noch nicht.").waitFor();
  await mode.getByRole("button", { name: "⚔️ Duell" }).tap();
  await p.getByText(/Duell per Link: Die andere Person fliegt gegen deinen Geist\. Live über WebRTC gibt es für Fliegen noch nicht\./).waitFor();
  assert.ok(await noHScroll(p), "kein Querscrollen bei 390");
  await shot(p, "3-fliegen-duell");
  assert.equal(posts().length, 0, "nichts gesendet");
  assert.deepEqual(errs, []); await ctx.close();
});

test("Satz ohne Spiel: Flugspiel mit Hinweis, 'Lieber Jump & Run' schickt denselben Satz im Genre G2 und gibt die erste Karte zurueck", async () => {
  const { p, ctx, errs, sent, posts } = await phone((p0, body, all) => {
    if (p0 === "ai/status") return [200, { meter: METER, create: CREATE(5) }];
    if (p0 === "ai") return all.filter((s) => s.path === "ai").length === 1 ? [200, { kind: "karte", options: [{ art: "game", doc: FLY }], seals: [SEAL], hashes: ["h".repeat(43)], cost: 1, receipt: "rc-1", note: ["engine:flug"], meter: METER, create: CREATE(4) }]
      : [200, { kind: "karte", options: [], notyet: { what: "game", name: "" }, catalog: [], meter: METER, create: CREATE(5) }];
    if (p0 === "ai/discard") return [200, { meter: METER, create: CREATE(5) }];
    return null;
  });
  await p.getByRole("button", { name: "🕹 Spiel" }).tap();
  await p.getByRole("button", { name: "✈️ Fliegen" }).tap();
  await p.getByLabel("Deine Beschreibung").fill("Ganz entspannt nach Feierabend");
  await p.getByRole("button", { name: "✨ Erschaffen" }).tap();
  await p.locator(".createpv").waitFor();
  await p.getByText("Dein Satz nennt kein bestimmtes Spiel, daraus wurde ein Flugspiel.").waitFor();
  await shot(p, "4-hinweis-flug");
  assert.deepEqual(posts()[0].body.input, { text: "Ganz entspannt nach Feierabend", art: "game", genre: "G1" });
  await p.getByRole("button", { name: "Lieber 🏃 Jump & Run" }).tap();
  await p.getByText("Dieses Spiel gibt es noch nicht", { exact: false }).waitFor();
  assert.deepEqual(posts()[1].body.input, { text: "Ganz entspannt nach Feierabend", art: "game", genre: "G2", fest: true });
  assert.ok(sent.some((s) => s.path === "ai/discard" && s.body.receipt === "rc-1"), "die erste Karte geht zurueck");
  assert.equal(await p.getByRole("group", { name: "Welche Art?" }).getByRole("button", { name: "🏃 Jump & Run" }).getAttribute("aria-pressed"), "true", "der Chip folgt");
  assert.deepEqual(errs, []); await ctx.close();
});

test("Klarer Widerspruch zum Genre: Rueckfrage mit beiden, 'Fliegen behalten' sendet fest; nichts still umgebaut", async () => {
  const { p, ctx, errs, posts } = await phone((p0) => {
    if (p0 === "ai/status") return [200, { meter: METER, create: CREATE(5) }];
    if (p0 === "ai") return [200, { kind: "karte", options: [], notyet: { what: "genre", name: "G2", chosen: "G1" }, catalog: [], meter: METER, create: CREATE(5) }];
    return null;
  });
  await p.getByRole("button", { name: "🕹 Spiel" }).tap();
  await p.getByRole("button", { name: "✈️ Fliegen" }).tap();
  await p.getByLabel("Deine Beschreibung").fill("Endless Runner über Brücken");
  await p.getByRole("button", { name: "✨ Erschaffen" }).tap();
  await p.getByText("Dein Satz klingt nach Jump & Run, gewählt ist Fliegen. Was soll es werden? Dafür wird nichts abgebucht.").waitFor();
  await shot(p, "5-rueckfrage");
  await p.getByRole("button", { name: "Fliegen behalten" }).tap();
  for (let i = 0; i < 40 && posts().length < 2; i++) await p.waitForTimeout(50);
  assert.deepEqual(posts()[1].body.input, { text: "Endless Runner über Brücken", art: "game", genre: "G1", fest: true });
  assert.deepEqual(errs, []); await ctx.close();
});

test("Die letzte Wahl ist nur ein markierter Vorschlag, nie still gewaehlt", async () => {
  const { p, ctx, errs } = await phone((p0) => (p0 === "ai/status" ? [200, { meter: METER, create: CREATE(5) }] : p0 === "ai" ? [200, { kind: "karte", options: [], notyet: { what: "game", name: "Zahlenspiel" }, catalog: ["zug-steine"], meter: METER, create: CREATE(5) }] : null));
  await p.getByRole("button", { name: "🕹 Spiel" }).tap();
  await p.getByRole("button", { name: "✈️ Fliegen" }).tap();
  await p.getByLabel("Deine Beschreibung").fill("Ich möchte mit jemanden übers Netz oder alleine 2024 spielen");
  await p.getByRole("button", { name: "✨ Erschaffen" }).tap();
  await p.getByText("„Zahlenspiel“ kann die freie Karte noch nicht.", { exact: false }).waitFor();
  assert.equal(await p.locator(".createpv").count(), 0, "kein Flugspiel");
  await shot(p, "6-zahlenspiel");
  // the choice is kept on the device; opened again (same page, no reload under file://) it is only a marked suggestion
  assert.deepEqual(await p.evaluate(() => window.Kit.store.createLast), { art: "game", genre: "G1" });
  await p.locator("#shback").tap();
  await p.locator("#create").tap();
  await p.getByLabel("Deine Beschreibung").waitFor();
  const spiel = p.getByRole("group", { name: "Was soll es werden?" }).getByRole("button", { name: "🕹 Spiel" });
  assert.equal(await spiel.getAttribute("aria-pressed"), "false");
  assert.match(await spiel.getAttribute("class"), /\bsug\b/);
  assert.ok(await p.getByLabel("Deine Beschreibung").isDisabled());
  assert.deepEqual(errs, []); await ctx.close();
});
