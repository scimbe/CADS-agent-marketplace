"use strict";
// Community deck of free cards (src/deck.js) against a stand-in server with a real Ed25519 key: two devices see the same
// cards of one version; a free card's use and a thumb go out only after the waiting time with a token; a block takes the
// card out of the next version and marks its seal; a paused account sees the reasons and objects.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium, devices } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const API = "https://demos-34a13a96.bunsenbrenner.org/api/duell/";

function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return "[" + v.map((x) => canonical(x === undefined ? null : x)).join(",") + "]";
  return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}
const keys = crypto.generateKeyPairSync("ed25519"), pubRaw = keys.publicKey.export({ format: "der", type: "spki" }).subarray(-32);
const kid = crypto.createHash("sha256").update(pubRaw).digest("base64url").slice(0, 8);
const H1 = "S".repeat(43), H2 = "W".repeat(43);
const card = (t, x, h) => ({ k: "card", t, x, st: "druck", col: ["#ffd400", "#ff3b1d"], by: [], ki: { k: "karte", s: "s2.karte.mh1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", h } });
const C1 = card("Sternfang", "Wer zuerst den Stern fängt, gewinnt.", H1), C2 = card("Wolkenrennen", "Puste die Wolke ins Ziel.", H2);
function signed(v, cards, revoked = []) {
  const body = { v, at: "2026-11-06T10:00:00.000Z", kid, cards: cards.map((d) => ({ cid: d.ki.h.slice(0, 22), doc: d })), revoked };
  return { ...body, sig: crypto.sign(null, Buffer.from(canonical(body)), keys.privateKey).toString("base64url") };
}
const PAUSE = { nid: "nidPause01", at: "2026-11-06T09:00:00.000Z", type: "pause", scope: "account", facts: { cards: ["x"], by: "human" }, ground: "terms:community-cards", automated: { detected: false, decided: false }, until: "2026-11-20T09:00:00.000Z", redress: ["appeal", "court"], appealUntil: "2027-05-08T09:00:00.000Z" };
const HIDDEN = { nid: "nidHidden1", at: "2026-11-06T08:00:00.000Z", type: "card-hidden", scope: "card", cid: "x", facts: { down: 9, share: 0.75, why: "thumbs" }, ground: "terms:community-cards", automated: { detected: true, decided: true }, redress: ["appeal", "court"], appealUntil: "2027-05-08T08:00:00.000Z" };

let b;
test.before(async () => { b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); });
test.after(async () => { await b.close(); });

async function device(state, dev) {
  const ctx = await b.newContext({ ...devices[dev || "Pixel 7"], locale: "de-DE" }), p = await ctx.newPage(), errs = [], sent = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.clock.install({ time: new Date("2026-11-06T12:00:00Z") });
  await ctx.route(/^https?:/, async (r) => {
    const u = r.request().url();
    if (!u.startsWith(API)) return r.abort();
    const p0 = u.slice(API.length), body = JSON.parse(r.request().postData() || "null");
    sent.push({ path: p0, body, method: r.request().method() });
    const j = (s, o) => r.fulfill({ status: s, contentType: "application/json", body: o === undefined ? "" : JSON.stringify(o) });
    if (p0 === "deck") return j(200, state.deck);
    if (p0 === "deck/key") return j(200, { kid, alg: "Ed25519", pub: Buffer.from(pubRaw).toString("base64url") });
    if (p0 === "deck/use") return body.ev === "start" ? j(200, { t: "mh1.ABCDEFGHIJKLMNOPQRSTUV" }) : j(204);
    if (p0 === "deck/vote") return j(204);
    if (p0 === "deck/me") return j(200, { cards: [{ cid: "Sxxxxx", st: "pruefung" }], credit: { balance: state.balance === undefined ? 2 : state.balance, items: [{ cid: "Sxxxxx", reason: "use", n: 2, at: "2026-11-05T00:00:00.000Z", revoked: false }], transferable: false, purchasable: false, payable: false, abo: { offered: false } }, mod: { st: state.st || "ok" } });
    if (p0 === "mod/me") return j(200, { st: state.st || "ok", until: state.st === "paused" ? PAUSE.until : undefined, notices: state.notices || [] });
    if (p0 === "mod/appeal") return j(202, { nid: body.nid });
    return r.abort();
  });
  await p.goto(page);
  return { p, errs, sent, ctx };
}
const openDeck = async (p) => {
  await p.locator("#past").tap();
  await p.getByRole("button", { name: "Community-Karten" }).tap();
  await p.locator("#shtitle", { hasText: "Community-Karten" }).waitFor();
};

test("Deck: zwei Geraete sehen dieselbe Version gleich; Suche findet Deck-Karten; die Tagesrotation bleibt", async () => {
  const state = { deck: signed(4, [C1, C2]) };
  const a = await device(state), c = await device(state, "iPhone 13");
  const today = await a.p.evaluate(() => window.Daily.ideaForDay(new Date()).id);
  for (const d of [a, c]) await openDeck(d.p);
  for (const d of [a, c]) await d.p.locator(".decklist .day").nth(1).waitFor();
  const la = await a.p.locator(".decklist .day span").allTextContents(), lc = await c.p.locator(".decklist .day span").allTextContents();
  assert.deepEqual(la, ["Sternfang", "Wolkenrennen"]); assert.deepEqual(lc, la, "same version, same cards, same order");
  assert.equal(await a.p.evaluate(() => window.Deck.version()), 4);
  // the browser checks Ed25519 itself: a deck signed with another key (or changed after signing) is refused
  const other = crypto.generateKeyPairSync("ed25519").privateKey, fake = signed(9, [C1]);
  state.deck = { ...fake, sig: crypto.sign(null, Buffer.from(canonical((({ sig, ...x }) => x)(fake))), other).toString("base64url") };
  assert.equal(await a.p.evaluate(() => window.Deck.load(true).then(() => window.Deck.version())), 4, "forged signature refused in the browser");
  state.deck = { ...signed(4, [C1, C2]), v: 10 };
  assert.equal(await a.p.evaluate(() => window.Deck.load(true).then(() => window.Deck.version())), 4, "changed after signing refused");
  assert.equal(await a.p.evaluate(async () => { const k = await crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"]); return !!k; }), true, "this browser has Ed25519");
  state.deck = signed(4, [C1, C2]);
  assert.equal(await a.p.evaluate(() => window.Daily.ideaForDay(new Date()).id), today, "the day's card stays the same");
  await a.p.evaluate(() => window.DailyApp.goHome());
  await a.p.locator("#past").tap();
  await a.p.getByRole("searchbox").fill("wolke");
  const hit = a.p.locator("#shbody .day", { hasText: "Wolkenrennen" });
  await hit.waitFor();
  await hit.tap();
  await a.p.locator("#home").waitFor();
  assert.match(await a.p.locator("#from").textContent(), /Community-Karten/);
  assert.equal(await a.p.locator(".kiseal").first().isVisible(), true, "AI mark on the deck card");
  assert.deepEqual(a.errs, []); assert.deepEqual(c.errs, []);
  await a.ctx.close(); await c.ctx.close();
});

test("Nutzung zaehlt erst nach 20 s mit Handlung, Daumen nur nach dem Oeffnen; Block nimmt die Karte raus und markiert das Siegel", async () => {
  const state = { deck: signed(1, [C1]) };
  const { p, errs, sent, ctx } = await device(state);
  await openDeck(p);
  await p.locator(".decklist .day", { hasText: "Sternfang" }).waitFor();
  assert.equal(await p.getByRole("button", { name: "Gefällt mir nicht" }).count(), 0, "no thumbs before opening");
  assert.equal(await p.locator(".decklist .deckrow").first().getByRole("button", { name: "Melden", exact: true }).count(), 1, "report is there without thumbs");
  await p.locator(".decklist .day", { hasText: "Sternfang" }).tap();
  await p.locator("#home").waitFor();
  await p.clock.runFor(500);
  assert.deepEqual(sent.filter((s) => s.path === "deck/use").map((s) => s.body.ev), ["start"]);
  assert.deepEqual(Object.keys(sent.find((s) => s.path === "deck/use").body).sort(), ["ev", "ki"]);
  await p.clock.runFor(21000);
  assert.equal(sent.filter((s) => s.body && s.body.ev === "done").length, 0, "no use without doing something");
  await p.locator("#hero").click();
  await p.clock.runFor(100);
  await p.waitForTimeout(100);
  const done = sent.find((s) => s.body && s.body.ev === "done");
  assert.ok(done, "a use after 20 s and a tap"); assert.equal(done.body.t, "mh1.ABCDEFGHIJKLMNOPQRSTUV");
  await p.evaluate(() => window.Deck.shelf());
  // report next to the thumbs, same kind of button (chip), in the same row
  const row = p.locator(".decklist .deckrow").first();
  const kinds = await row.locator("button.chip").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
  assert.deepEqual(kinds, ["Gefällt mir", "Gefällt mir nicht", "Melden"], "report as visible as the thumbs");
  await p.getByRole("button", { name: "Gefällt mir nicht" }).tap();
  await p.clock.runFor(200);
  await p.waitForTimeout(100);
  const v = sent.find((s) => s.path === "deck/vote");
  assert.deepEqual([v.body.v, v.body.t, v.body.ki.h], [-1, "mh1.ABCDEFGHIJKLMNOPQRSTUV", H1]);
  state.deck = signed(2, [], [H1.slice(0, 22)]);
  await p.clock.runFor(6 * 60 * 1000);
  await p.evaluate(() => window.Deck.shelf());
  await p.locator(".decklist .empty").waitFor();
  await p.waitForFunction(() => window.Deck.version() === 2);
  await p.evaluate((d) => window.DailyApp.sheet({ date: new Date(), doc: window.Daily.sanitizeDoc(d), note: "x" }), C1);
  await p.locator(".kiseal", { hasText: "Siegel widerrufen" }).first().waitFor();
  assert.ok(sent.every((s) => !/aiDev|device/.test(JSON.stringify(s.body || {}))), "no device id");
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("Melden an jeder Community-Karte: ⚑ in der Zeile oeffnet die Karte und den Melde-Dialog, auch ohne Daumen", async () => {
  const state = { deck: signed(1, [C1]) };
  const { p, errs, ctx } = await device(state);
  await openDeck(p);
  const rp = p.locator(".decklist .deckrow").first().getByRole("button", { name: "Melden", exact: true });
  await rp.waitFor();
  assert.equal(await rp.isVisible(), true);
  await rp.tap();
  await p.locator("#home").waitFor();
  await p.locator("dialog.kidlg[open]").waitFor();
  assert.match(await p.locator("#from").textContent(), /Community-Karten/, "the deck card is open behind the dialog");
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("Pausiertes Konto: Begruendung mit Grundlage, automatisch, Frist; Widerspruch geht an den Server, Guthaben ohne Kauf", async () => {
  const state = { deck: signed(1, [C1]), st: "paused", notices: [HIDDEN, PAUSE], balance: 1 };
  const { p, errs, sent, ctx } = await device(state);
  await openDeck(p);
  await p.getByText("Dein Konto ist bis").waitFor();
  const body = await p.locator("#shbody").innerText();
  assert.match(body, /Guthaben: 1 freie Karte\n/, "singular for 1"); assert.match(body, /nicht kaufbar, nicht übertragbar und nicht auszahlbar/);
  assert.match(body, /Konto pausiert/); assert.match(body, /9 Konten haben „Gefällt mir nicht“ gewählt \(75 % der Stimmen\)/);
  assert.match(body, /Automatisch erkannt und entschieden/); assert.match(body, /Von einem Menschen entschieden/, "a pause is a human's decision");
  assert.match(body, /Nutzungsbedingungen, Abschnitt „Community-Karten“/);
  assert.match(body, /Widerspruch möglich bis/); assert.match(body, /Gericht/);
  assert.match(body, /in Prüfung/); assert.doesNotMatch(body, /\b\d+ (Spieler|Nutzungen|mal gespielt)/, "no count of players");
  await p.getByRole("button", { name: "Widersprechen" }).first().tap();
  await p.getByLabel("Was sollen wir wissen?").fill("Das war eine Gruppe aus meiner Klasse.");
  await p.getByRole("button", { name: "Widerspruch senden" }).tap();
  await p.getByText("Dein Widerspruch ist angekommen").waitFor();
  const ap = sent.find((s) => s.path === "mod/appeal");
  assert.deepEqual(ap.body, { nid: PAUSE.nid, text: "Das war eine Gruppe aus meiner Klasse." });
  assert.deepEqual(errs, []);
  await ctx.close();
});
