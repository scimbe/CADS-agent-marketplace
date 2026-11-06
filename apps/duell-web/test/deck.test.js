"use strict";
// src/deck.js (part "deck"): the community deck of free cards. The daily rotation stays as it is (snapshot), a deck
// entry is only data checked like a link, the signature is checked with the server's key, an older version or a broken
// signature changes nothing, a revoked seal is marked, and use and thumbs go out only with a login and a token.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const C = require("../src/core.js");
const D = require("../src/daily.js");
const T = require("../src/texts.json");
const code = fs.readFileSync(path.join(__dirname, "../src/deck.js"), "utf8");

const h16 = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
// Snapshot of the daily rotation. A deliberate catalog change updates these numbers in the same commit; the deck never does.
const ROUND_N = 130, ROUND_IDS = "1d3bbb326a301d35", DAYS_400 = "1dd28b2466a0aadd";
const roundNow = () => [D.ROUND.length, h16(D.ROUND.map((i) => i.id).join(",")), h16(D.lastDays(new Date("2027-01-01T12:00:00Z"), 400).map((d) => d.key + ":" + (d.idea && d.idea.id)).join(","))];

function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return "[" + v.map((x) => canonical(x === undefined ? null : x)).join(",") + "]";
  return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}
const keys = crypto.generateKeyPairSync("ed25519"), pubRaw = keys.publicKey.export({ format: "der", type: "spki" }).subarray(-32);
const kid = crypto.createHash("sha256").update(pubRaw).digest("base64url").slice(0, 8);
const card = (x, h) => ({ k: "card", x, st: "druck", col: ["#ffd400", "#ff3b1d"], by: [], ki: { k: "karte", s: "s2.karte.abc." + "A".repeat(32), h } });
const H1 = "a".repeat(43), H2 = "b".repeat(43);
function deckOf(v, cards, revoked = [], key = keys.privateKey) {
  const body = { v, at: "2026-11-06T00:00:00.000Z", kid, cards, revoked };
  return { ...body, sig: crypto.sign(null, Buffer.from(canonical(body)), key).toString("base64url") };
}

function load(fetchImpl, store = {}, extra = {}) {
  const posts = [], listeners = {};
  const w = {
    Kit: { t: (k) => k, store, save() {}, loc: () => "de-DE", toast() {}, sfx: { tap() {} } }, Daily: D, DuellCore: C, DailyTexts: { de: {}, en: {} },
    DeckTexts: { de: { deck_title: "Community-Karten" }, en: { deck_title: "Community cards" } },
    crypto: crypto.webcrypto, navigator: { onLine: true }, TextEncoder, atob, btoa, setTimeout: (f, ms) => setTimeout(f, Math.min(ms, 5)), Promise, Date, JSON, Object, Array, Math, Uint8Array, String, Number, Error,
    document: { addEventListener: (e, f) => { listeners[e] = f; }, createElement: () => ({}), head: { appendChild() {} } },
    fetch: async (url, opt) => { if (opt && opt.method === "POST") posts.push({ url, opt, body: JSON.parse(opt.body) }); return fetchImpl(url, opt); },
  };
  Object.assign(w, extra);
  w.window = w;
  vm.runInNewContext(code, w);
  return { Deck: w.Deck, w, posts, listeners };
}
const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o });
const server = (state) => async (url) => {
  if (url.endsWith("/deck/key")) return json({ kid, alg: "Ed25519", pub: Buffer.from(pubRaw).toString("base64url") });
  if (url.endsWith("/deck")) return json(state.deck);
  if (url.endsWith("/deck/use")) return state.login ? json({ t: "abc.def" }) : json({ error: "login" }, 401);
  return json({}, 204);
};

test("Tagesrotation: ROUND und 400 Tage lastDays unveraendert (Snapshot), auch mit geladenem Deck", async () => {
  assert.deepEqual(roundNow(), [ROUND_N, ROUND_IDS, DAYS_400]);
  const st = { deck: deckOf(3, [{ cid: H1.slice(0, 22), doc: card("Sternfang", H1) }]) };
  const { Deck } = load(server(st));
  await Deck.load(true);
  assert.equal(Deck.list().length, 1);
  assert.deepEqual(roundNow(), [ROUND_N, ROUND_IDS, DAYS_400], "the deck never enters the daily rotation");
});

test("Deck: Signatur gilt, gleiche Version ist auf jedem Geraet gleich; falsche Signatur, aeltere Version, fremde Felder aendern nichts", async () => {
  const entries = [{ cid: H1.slice(0, 22), doc: card("Sternfang", H1) }, { cid: H2.slice(0, 22), doc: card("Wolkenrennen", H2) }];
  const st = { deck: deckOf(5, entries) };
  const a = load(server(st)), b = load(server(st));
  await a.Deck.load(true); await b.Deck.load(true);
  assert.equal(a.Deck.version(), 5);
  assert.equal(JSON.stringify(a.Deck.list()), JSON.stringify(b.Deck.list()), "two devices, one version, the same cards in the same order");
  assert.equal(a.Deck.list().map((e) => e.doc.x).join("|"), "Sternfang|Wolkenrennen");
  assert.equal(a.Deck.list()[0].doc.ki.k, "karte", "the AI mark stays on every deck card");
  const other = crypto.generateKeyPairSync("ed25519").privateKey;
  st.deck = deckOf(9, [entries[0]], [], other);
  await a.Deck.load(true); assert.equal(a.Deck.version(), 5, "bad signature: ignored");
  st.deck = { ...deckOf(5, entries), v: 6 };
  await a.Deck.load(true); assert.equal(a.Deck.version(), 5, "changed after signing: ignored");
  st.deck = deckOf(4, [entries[0]]);
  await a.Deck.load(true); assert.equal(a.Deck.list().length, 2, "older version: ignored");
  st.deck = deckOf(7, [{ cid: H1.slice(0, 22), doc: { ...card("Sternfang", H1), onload: "alert(1)", html: "<b>x</b>" } }, { cid: "X".repeat(22), doc: card("falsche id", H2) }]);
  await a.Deck.load(true);
  assert.equal(a.Deck.version(), 7);
  assert.equal(a.Deck.list().map((e) => e.cid).join("|"), H1.slice(0, 22), "cid must be the seal's hash");
  assert.equal(a.Deck.list()[0].doc.onload, undefined); assert.equal(a.Deck.list()[0].doc.html, undefined);
  st.deck = { v: 8, kid, cards: entries, revoked: [] };
  await a.Deck.load(true); assert.equal(a.Deck.version(), 7, "no signature: refused");
  st.deck = deckOf(2 ** 40, entries);
  await a.Deck.load(true); assert.equal(a.Deck.version(), 7, "an absurd version cannot lock out every later deck");
  // a device that cannot check Ed25519 takes no deck at all, signed or not
  const old = load(server({ deck: deckOf(5, entries) }), {}, { crypto: { getRandomValues: () => {} } });
  await old.Deck.load(true);
  assert.equal(old.Deck.version(), -1); assert.equal(old.Deck.list().length, 0);
});

test("Block: die naechste Version ohne die Karte, ihr Siegel als widerrufen markiert, Suche findet sie nicht mehr", async () => {
  const st = { deck: deckOf(1, [{ cid: H1.slice(0, 22), doc: card("Sternfang mit Mond", H1) }]) };
  const { Deck } = load(server(st));
  await Deck.load(true);
  assert.equal(Deck.search("mond").length, 1);
  st.deck = deckOf(2, [], [H1.slice(0, 22)]);
  await Deck.load(true);
  assert.equal(Deck.list().length, 0); assert.equal(Deck.search("mond").length, 0);
  const badge = { hidden: true, textContent: "KI", title: "", setAttribute(k, v) { this[k] = v; } };
  Deck.seen(card("Sternfang mit Mond", H1), badge);
  assert.equal(badge.textContent, "deck_revoked"); assert.equal(badge.hidden, false);
});

test("Nutzung und Daumen: nur mit Login und Token, nur Siegel und Hash, kein Geraet; ohne Login hoert es auf", async () => {
  const st = { deck: deckOf(1, [{ cid: H1.slice(0, 22), doc: card("Sternfang", H1) }]), login: false };
  let x = load(server(st));
  x.Deck.seen(card("Sternfang", H1));
  await new Promise((r) => setTimeout(r, 20));
  x.Deck.seen(card("Andere", H2));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(x.posts.length, 1, "after a 401 nothing more is sent");
  assert.equal(await x.Deck.vote(card("Sternfang", H1), -1), false, "no token, no thumb");
  st.login = true; x = load(server(st));
  x.Deck.seen(card("Sternfang", H1));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(JSON.stringify(x.posts[0].body), JSON.stringify({ ki: { k: "karte", s: card("", H1).ki.s, h: H1 }, ev: "start" }));
  assert.equal(x.posts[0].opt.credentials, "same-origin");
  assert.equal(await x.Deck.vote(card("Sternfang", H1), -1), true);
  assert.deepEqual(Object.keys(x.posts[1].body).sort(), ["ki", "t", "v"]);
  assert.ok(x.posts.every((p) => !/device|aiDev/.test(JSON.stringify(p.body))));
  assert.ok(x.posts.every((p) => /\/api\/duell\/(deck|mod)\//.test(p.url)));
  x.Deck.seen({ k: "card", x: "ohne Siegel", st: "druck", col: ["#000000", "#ffffff"], by: [] });
  assert.equal(x.posts.length, 2, "a sheet that is no free card sends nothing");
});

test("Nutzung: nur eine Handlung auf dem Blatt nach 20 s zaehlt; wer vorher weggeht oder ausserhalb tippt, zaehlt nicht", async () => {
  const st = { deck: deckOf(1, []), login: true };
  let now = 1000;
  const clock = { now: () => now };
  const on = (inSheet) => ({ target: { closest: () => (inSheet ? {} : null) } });
  const x = load(server(st), {}, { Date: Object.assign(function () {}, { now: clock.now }) });
  x.Deck.seen(card("Sternfang", H1));
  await new Promise((r) => setTimeout(r, 20));
  now += 25000;
  x.listeners.pointerdown(on(false));
  assert.equal(x.posts.filter((p) => p.body.ev === "done").length, 0, "a tap outside the sheet (shelf, back) is no use");
  x.Deck.seen({ k: "card", x: "andere Seite", st: "druck", col: ["#000000", "#ffffff"], by: [] });
  x.listeners.pointerdown(on(true));
  assert.equal(x.posts.filter((p) => p.body.ev === "done").length, 0, "the free card is gone: nothing counts");
  const y = load(server(st), {}, { Date: Object.assign(function () {}, { now: clock.now }) });
  y.Deck.seen(card("Sternfang", H1));
  await new Promise((r) => setTimeout(r, 20));
  y.listeners.pointerdown(on(true));
  assert.equal(y.posts.filter((p) => p.body.ev === "done").length, 0, "before 20 s: not yet");
  now += 21000;
  y.listeners.keydown(on(true));
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(y.posts.filter((p) => p.body.ev === "done").length, 1, "after 20 s and a tap on the sheet: one use");
  y.listeners.keydown(on(true));
  assert.equal(y.posts.filter((p) => p.body.ev === "done").length, 1, "once");
});

test("Texte: deck_, mod_, credit_ in beiden Sprachen; keine Rangliste, kein Zaehler, kein Weiterleiten", () => {
  const ks = Object.keys(T.de).filter((k) => /^(deck|mod|credit)_/.test(k));
  assert.ok(ks.length >= 40);
  for (const k of ks) assert.ok(T.en[k], "en " + k);
  const all = ks.map((k) => T.de[k] + " " + T.en[k]).join(" ") + code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.ok(!/rangliste|ranking|leaderboard|bestenliste|streak|weiterleiten|weiterschicken|forward this|z(ä|ae)hler|counter|platz \d|top ?\d/i.test(all));
  assert.match(T.de.credit_note, /nicht kaufbar, nicht übertragbar und nicht auszahlbar/);
  for (const k of ["mod_ground", "mod_appeal_until", "mod_court", "mod_auto", "mod_manual"]) assert.ok(T.de[k] && T.en[k], k);
});
