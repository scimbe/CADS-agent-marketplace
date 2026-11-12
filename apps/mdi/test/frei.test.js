// Strang K: freie Karte, KI-Dienst, Deck, KI-Bild. Portiert aus den alten Tests (ai.test, deck.test, kibild.test,
// warten.test, frei.test mit frei-vectors.json) und gegen die Aufnahmen des echten Servers (test/fixtures/wrapper-frei.json,
// scripts/record-frei.mjs). Kein Netz: der Transport ist ein Doppel von api.raw.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import * as A from "../src/broker/ai.js";
import { createDeck, sane, cidOf, USE_MS, VOTE_MS } from "../src/broker/deck.js";
import { createBild, bildVerdict } from "../src/broker/bild.js";
import { sanitizeDoc, artOk, kindOk, targetOf, freiParams, freiDoc, freeIdOf, previewOf, SOON, MODES, PAIRS } from "../src/features/frei/doc.js";
import { FREI_TEXTS, ft } from "../src/features/frei/texts.js";
import { cardOf } from "../src/features/frei/chart.js";

const REC = JSON.parse(fs.readFileSync(new URL("./fixtures/wrapper-frei.json", import.meta.url), "utf8"));
const rec = (n) => { const e = REC.exchanges.find((x) => x.name === n); if (!e) throw new Error("Aufnahme fehlt: " + n); return e.res; };
const subtle = crypto.webcrypto.subtle;
/** api.raw-Doppel: Antworten der Reihe nach, merkt sich, was gesendet wurde */
function fakeApi(answers) {
  const sent = [];
  return { sent, raw: async (method, path, body) => { sent.push({ method, path, body }); const a = answers.shift(); if (!a) throw new Error("keine Antwort mehr fuer " + path); return a.error ? { ok: false, error: a.error } : { status: a.status, body: a.body === undefined ? null : a.body }; } };
}
const DEV = "ab".repeat(16);
const ASK = { kind: "karte", input: { art: "card", text: "Geburtstagskarte für Lea" }, device: DEV, lang: "de" };
const ai = (answers, o = {}) => { const api = fakeApi(answers); return { api, c: A.createAi({ api, subtle, sleep: async () => {}, proofBits: 0, ...o }) }; };

// ---------------------------------------------------------------- Alt-Orakel ai.test.js
test("Antwort: nur 200 mit Inhalt ist Ergebnis; Warteschlange, Kontingent, Filter, belegt und aus sind eigene Faelle", () => {
  assert.equal(A.verdict(200, { options: ["x"] }), "result");
  assert.equal(A.verdict(200, { options: [] }), "off", "leeres Ergebnis ist kein Ergebnis und kein Ersatz");
  assert.equal(A.verdict(202, { ticket: "t-123", position: 2 }), "queued");
  assert.equal(A.verdict(202, {}), "off", "ohne Ticket keine Warteschlange");
  assert.equal(A.verdict(429, { error: "quota" }), "quota");
  assert.equal(A.verdict(429, { error: "busy" }), "busy");
  assert.equal(A.verdict(429, { error: "daily-limit" }), "busy");
  assert.equal(A.verdict(422, { error: "blocked" }), "blocked");
  assert.equal(A.verdict(503, { error: "llm-unavailable" }), "off");
  assert.equal(A.verdict(200, null), "off");
  assert.equal(A.place({ position: 3 }), 3); assert.equal(A.place({ queue: { position: 7 } }), 7);
  assert.equal(A.place({ position: -1 }), 0); assert.equal(A.place({ position: "x" }), 0); assert.equal(A.place(null), 0);
  // freie Karte: eigene Codes des Servers (lib/duell-ai.mjs act) bekommen eigene, feste Texte
  assert.equal(A.verdict(401, { error: "login" }), "login");
  assert.equal(A.verdict(403, { error: "age16" }), "age16");
  assert.equal(A.verdict(403, { error: "account-paused" }), "modpause");
  assert.equal(A.verdict(429, { error: "throttled" }), "paused");
  assert.equal(A.verdict(503, { error: "karte-off" }), "karteoff");
  assert.equal(A.verdict(200, { options: [], notyet: { what: "game" } }), "notyet");
});

test("Adapter, Warteschlange: Platz wird gemeldet, gewartet wird nur mit Ticket an /queue, Ergebnis mit Siegel je Option und Beleg", async () => {
  const { api, c } = ai([
    { status: 202, body: { queued: true, ticket: "tk-0001", position: 3, etaS: 9 } },
    { status: 202, body: { queued: true, ticket: "tk-0001", position: 0, etaS: 2 } },
    { status: 200, body: { options: ["A", "B"], seals: ["s1.line.abc.sigA0000", "<x>"], cost: 1, receipt: "rc-0001.x" } },
    { status: 200, body: { final: true } }
  ]);
  const phases = [];
  const r = await c.ask(ASK, (s, n) => phases.push(s + ":" + n));
  assert.deepEqual(phases, ["send:0", "line:3", "make:0", "check:0"], "Platz 0 = laeuft gerade (KI baut), danach Pruefung hier");
  assert.deepEqual(api.sent.slice(1, 3).map((x) => [x.path, x.body]), [["/api/duell/queue", { ticket: "tk-0001" }], ["/api/duell/queue", { ticket: "tk-0001" }]], "beim Warten geht weder Text noch Geraet nochmal raus");
  assert.equal(api.sent[0].body.queue, "ticket"); assert.equal(api.sent[0].body.device, DEV); assert.equal(api.sent[0].body.kind, "karte");
  assert.equal(r.how, "result"); assert.deepEqual(r.seals, ["s1.line.abc.sigA0000", ""]); assert.equal(r.receipt, "rc-0001.x");
  assert.equal(await c.accept(DEV, r.receipt), true);
  assert.deepEqual(api.sent[3], { method: "POST", path: "/api/duell/ai/accept", body: { device: DEV, receipt: "rc-0001.x" } });
  assert.equal(await c.accept(DEV, ""), false, "ohne Beleg nichts abzurechnen");
});

test("Adapter, ehrliche Zustaende: belegt mit Platz, zu lange gewartet -> belegt (Ticket verfaellt), Ticket weg -> aus, offline -> aus", async () => {
  let r = (await ai([{ status: 429, body: { error: "busy", position: 4 } }]).c.ask(ASK));
  assert.deepEqual([r.how, r.position, r.options.length], ["busy", 4, 0]);
  r = await ai([{ status: 409, body: { error: "pending" } }]).c.ask(ASK);
  assert.equal(r.how, "busy", "eine Anfrage je Person: belegt, nicht kaputt");
  let clock = 0; const q = ai([{ status: 202, body: { ticket: "tk-0002", position: 5 } }, { status: 202, body: { ticket: "tk-0002", position: 2 } }, { status: 200, body: {} }], { sleep: async (ms) => { clock += ms; }, now: () => clock, waitMax: 900 });
  r = await q.c.ask(ASK);
  assert.deepEqual([r.how, r.position], ["busy", 2]); assert.deepEqual(q.api.sent.map((x) => x.path), ["/api/duell/ai", "/api/duell/queue"], "kein /cancel: den gibt es auf dem Server nicht");
  r = await ai([{ status: 202, body: { ticket: "tk-0003", position: 1 } }, { status: 404, body: { error: "ticket" } }]).c.ask(ASK);
  assert.equal(r.how, "off");
  r = await ai([{ error: "netz" }]).c.ask(ASK);
  assert.deepEqual([r.how, r.options.length], ["off", 0]);
  r = await ai([{ error: "nicht-hier" }]).c.ask(ASK);
  assert.equal(r.how, "nicht-hier", "ohne Server (file://) ehrlich: hier nicht");
  const bad = await ai([{ status: 200, body: { options: ["x"], seals: ["<script>"], receipt: "../ x" } }]).c.ask(ASK);
  assert.deepEqual(bad.seals, [""]); assert.equal(bad.receipt, "", "fremde Zeichen in Siegel und Beleg fallen weg");
});

test("Adapter, Abbrechen in der Schlange: das Warten hoert sofort auf, nichts wird mehr abgefragt; spaetes Ergebnis geht zurueck", async () => {
  let here = true;
  const q = ai([{ status: 202, body: { ticket: "tk-0004", position: 2 } }, { status: 200, body: { options: ["A"], receipt: "rc-0004" } }], { sleep: async () => { here = false; } });
  const r = await q.c.ask(ASK, () => {}, () => here);
  assert.equal(r.how, "gone"); assert.deepEqual(r.options, []); assert.equal(q.api.sent.length, 1);
  // abgebrochen, waehrend das Ergebnis schon unterwegs war: sofort discard (wie "Verwerfen"), nichts gezeigt
  let alive = true;
  const late = ai([{ status: 200, body: { options: [{ art: "card" }], seals: ["s2.karte.abc.defgh"], receipt: "rc-0005" } }, { status: 200, body: {} }]);
  const p = late.c.ask(ASK, (s) => { if (s === "send") alive = false; }, () => alive);
  const r2 = await p;
  assert.equal(r2.how, "gone");
  assert.deepEqual(late.api.sent[1], { method: "POST", path: "/api/duell/ai/discard", body: { device: DEV, receipt: "rc-0005" } });
});

test("Krise: auf dem Geraet erkannt, nichts gesendet, eigene Hilfe; nur fuer die Arten, die auch der Server prueft", async () => {
  for (const s of ["Ich will nicht mehr leben", "ich ritze mich", "keinen Bock mehr zu leben", "1ch w1ll st3rb3n", "I want to die", "Selbstmord"]) assert.equal(A.crisis(s), true, s);
  for (const s of ["Ich lach mich tot", "Kürbis schnitzen", "Geburtstagskarte für Oma"]) assert.equal(A.crisis(s), false, s);
  const q = ai([]);
  const r = await q.c.ask({ ...ASK, input: { art: "card", text: "ich will nicht mehr leben" } });
  assert.equal(r.how, "crisis"); assert.equal(q.api.sent.length, 0, "nichts verlaesst das Geraet");
  assert.deepEqual(A.CRISIS_KINDS, ["plan", "liste", "quiz", "welt", "text", "karte"]);
  assert.match(ft("de", "aiCrisis"), /116 111/); assert.match(ft("en", "aiCrisis"), /116 111|116 123|Childline|help/i);
});

test("Meldung: Grund, Texte, Typ und Siegel wie im Server-Protokoll; Hash nur neben Siegel und genau 43 Zeichen", () => {
  const h = "Y-feMaAnaOXUrB2BxPv3vUTgMan0NNfOQmA6jhDp_Tc", ki = { k: "karte", s: "s2.karte.abc.defgh", h };
  assert.deepEqual(A.reportBody({ type: "card", t: "Hi" }, ki, "harm", "Ab3dEf7h"), { reason: "harm", consent: true, content: { type: "card", t: "Hi" }, kind: "karte", seal: "s2.karte.abc.defgh", optionHash: h, link: "Ab3dEf7h" });
  assert.equal(A.reportBody({ type: "card" }, ki, "spam"), null, "nur Gruende, die der Server kennt");
  assert.equal(A.reportBody({ type: "card" }, { k: "karte", h }, "harm").optionHash, undefined, "ohne Siegel kein Hash");
  for (const bad of [h.slice(1), h + "A", h.slice(1) + "+", 42]) assert.equal(A.reportBody({}, { ...ki, h: bad }, "harm").optionHash, undefined, String(bad));
  assert.equal(A.reportBody({}, ki, "harm", "../x").link, undefined);
  assert.deepEqual(A.REASONS, ["harm", "sex", "hate", "private", "wrong", "other"]);
  for (const l of ["de", "en"]) for (const r of A.REASONS) assert.ok(FREI_TEXTS[l]["kiWhy_" + r], l + " kiWhy_" + r);
});

test("Keine Dark Patterns: kein Preis, kein Zeitdruck, kein Kaufknopf, keine Rangliste in den Texten", () => {
  for (const l of ["de", "en"]) for (const [k, v] of Object.entries(FREI_TEXTS[l])) {
    if (/^(ai|ki|create_|deck_|mod_|credit_|frei_)/.test(k)) assert.ok(!/€|\$|\d+[,.]\d\d|countdown|hurry|letzte chance|last chance|läuft ab|expires|streak|rangliste|leaderboard|bestenliste|weiterleiten|forward this/i.test(v), k + ": " + v);
  }
  assert.match(FREI_TEXTS.de.credit_note, /nicht kaufbar, nicht übertragbar und nicht auszahlbar/);
});

test("Nachweis: gefundene Zahl hat die verlangten Nullbits", async () => {
  const p = await A.solve(DEV, 12, subtle), h = crypto.createHash("sha256").update(DEV + ":" + p).digest();
  assert.equal(h[0], 0); assert.equal(h[1] >> 4, 0);
});

const VEC = [
  ["Zeile A", "\"Zeile A\"", "hcGrPTYbZsK9tsaqzwSGUoKzFUrwVK8Mn0PqSXYdi6s"],
  [{ changes: { t: "Alienflug", theme: "space", emoji: "🛸", look: { d: "bubbles", sky: "#0b1020" } } }, "{\"changes\":{\"emoji\":\"🛸\",\"look\":{\"d\":\"bubbles\",\"sky\":\"#0b1020\"},\"t\":\"Alienflug\",\"theme\":\"space\"}}", "Y-feMaAnaOXUrB2BxPv3vUTgMan0NNfOQmA6jhDp_Tc"],
  [{ b: 1, a: [1, "ä", null, true], "Ä": 2, Z: 0, "\"q\\": "Zeile\nzwei" }, "{\"\\\"q\\\\\":\"Zeile\\nzwei\",\"Z\":0,\"a\":[1,\"ä\",null,true],\"b\":1,\"Ä\":2}", "AqF9AIRLXl9TdSAYN7CXkWCNzBmIwePnlNl2YhSNMcs"],
  [{ x: 0.1, y: 1e21, z: -0, w: 12.50 }, "{\"w\":12.5,\"x\":0.1,\"y\":1e+21,\"z\":0}", "WfF_3Rk2ObrCP9aV5PP1pO-5_c_WS8RNMoKXj6oQJeQ"],
  [{ top: "Wenn der Montag", bottom: "schon wieder ruft 😅" }, "{\"bottom\":\"schon wieder ruft 😅\",\"top\":\"Wenn der Montag\"}", "LuRmOaagKwV8izpFzGCMhVmQ9aSI_4Eez8n6-toAMSo"]
];
test("Options-Hash: kanonisches JSON mit sortierten Schluesseln, SHA-256 base64url, feste Vektoren wie der Server", async () => {
  for (const [opt, canon, h] of VEC) { assert.equal(A.canonical(opt), canon); assert.equal(await A.optionHash(opt, subtle), h); }
  assert.equal(await A.optionHash({ Z: 0, "Ä": 2, a: [1, "ä", null, true], "\"q\\": "Zeile\nzwei", b: 1, u: undefined }, subtle), VEC[2][2]);
  assert.equal(A.canonical([undefined, 1]), "[null,1]");
  assert.equal(await A.optionHash("x", undefined), "", "ohne crypto.subtle kein h, kein Fehler");
});

// ---------------------------------------------------------------- Aufnahmen des echten Servers
test("Server-Aufnahmen: Erfolg mit Siegel des Decks (o), Absage mit Gegenvorschlag, Genre-Rueckfrage, Krise, Login, 16+, Kontingent, aus", async () => {
  const one = async (n) => (await ai([rec(n)]).c.ask(ASK));
  const ok = await ai([rec("karte-ok-card")]).c.ask(ASK);
  assert.equal(ok.how, "result"); assert.ok(ok.receipt); assert.equal(ok.options[0].art, "card");
  assert.match(ok.options[0].ki.o, /^[A-Za-z0-9_-]{22}$/, "Ersteller-Kennung vom Deck");
  const doc = sanitizeDoc(ok.options[0].doc);
  assert.ok(artOk("card", ok.options[0].art) && kindOk("card", doc));
  const t = await one("karte-absage-tetris");
  assert.equal(t.how, "notyet"); assert.equal(t.reason, "tetris"); assert.equal(t.alt.kind, "katalog"); assert.deepEqual(t.catalog, ["zug-steine"]);
  const g = await one("karte-genre-frage");
  assert.deepEqual(g.notyet, { what: "genre", name: "G2", chosen: "G1" });
  assert.equal((await one("karte-noch-nicht-spiel")).notyet.what, "game");
  const k = await ai([rec("karte-krise")]).c.ask({ ...ASK, input: { art: "card", text: "harmlos fuer den Client" } });
  assert.deepEqual([k.how, k.why], ["blocked", "crisis"], "Krise vom Server: eigene Hilfe, nie Servertext");
  assert.equal((await one("karte-anonym")).how, "login");
  assert.equal((await one("karte-ohne-16")).how, "age16");
  assert.equal((await one("karte-kein-kontingent")).how, "quota");
  assert.equal((await one("karte-aus")).how, "karteoff");
  assert.equal((await one("karte-absage-sound")).reason, "sound");
  // Warteschlange: 202 Ticket -> 202 -> 200
  const q = await ai([rec("karte-warteschlange"), rec("karte-queue-202"), rec("karte-queue-fertig")]).c.ask(ASK);
  assert.equal(q.how, "result");
  for (const n of ["karte-ok-game", "karte-ok-lauf", "karte-ok-quiz", "karte-ok-faehigkeit", "karte-ok-meme"]) {
    const r = rec(n), o = r.body.options[0], d = sanitizeDoc(o.doc);
    const asked = n === "karte-ok-lauf" ? "game" : o.art;
    assert.ok(d && artOk(asked, o.art) && kindOk(o.art, d), n + ": Art und Doc passen");
  }
  // Texte fuer jede Antwort, die keine Karte bringt, existieren in beiden Sprachen
  for (const how of ["crisis", "blocked", "quota", "busy", "paused", "age16", "age", "modpause", "karteoff", "login", "bad", "nicht-hier", "notyet", "off"]) for (const l of ["de", "en"]) assert.ok(!/^\[/.test((await import("../src/features/frei/view.js")).refusalText({ how, notyet: {}, reason: "" }, l)), how + " " + l);
});

test("KI-Arten fuer alle Karten: line liefert Vorschlaege mit Siegel; unbekannte Art geht nie raus", async () => {
  const r = await ai([rec("ki-line")]).c.ask({ kind: "line", input: { text: "Du schaffst das", style: "druck" }, device: DEV, lang: "de" });
  assert.equal(r.how, "result"); assert.equal(r.options.length, 3); assert.ok(r.seals.every(Boolean));
  const q = ai([]); assert.equal((await q.c.ask({ kind: "gibtsnicht", input: {}, device: DEV })).how, "off"); assert.equal(q.api.sent.length, 0);
  assert.deepEqual(A.KINDS, ["karte", "wish", "line", "meme", "lyrics", "plan", "liste", "quiz", "welt", "text", "anlass"]);
});

// ---------------------------------------------------------------- Alt-Orakel deck.test.js (mit echter Signatur des Servers)
function deckApi(deckBody, extra = {}) {
  return { raw: async (m, p, b) => {
    if (p === "/api/duell/deck/key") return { status: 200, body: rec("deck-key").body };
    if (p === "/api/duell/deck") return { status: 200, body: deckBody };
    if (extra[p]) return extra[p](b);
    return { status: 404, body: null };
  } };
}
test("Deck: echte Ed25519-Signatur des Servers gilt; falsche Signatur, fremde Felder, aeltere Version aendern nichts", async () => {
  const good = rec("deck-mit-karte").body;
  const d = createDeck({ api: deckApi(good), sanitize: sanitizeDoc, subtle });
  const r = await d.load();
  assert.equal(r.ok, true, JSON.stringify(r.why)); assert.equal(r.deck.cards.length, 1); assert.equal(r.deck.cards[0].cid, cidOf(good.cards[0].doc.ki));
  const tampered = JSON.parse(JSON.stringify(good)); tampered.cards[0].doc.x = "Anders";
  const d2 = createDeck({ api: deckApi(tampered), sanitize: sanitizeDoc, subtle });
  assert.deepEqual([(await d2.load()).ok, (await d2.load()).why], [false, "signatur"]);
  const nosig = { ...good }; delete nosig.sig;
  assert.equal((await createDeck({ api: deckApi(nosig), sanitize: sanitizeDoc, subtle }).load()).why, "signatur");
  // aeltere Version nach einer neueren: bleibt bei der neueren (eigener Schluessel, wie im alten Test)
  const keys = crypto.generateKeyPairSync("ed25519"), pubRaw = keys.publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const kid = crypto.createHash("sha256").update(pubRaw).digest("base64url").slice(0, 8);
  const deckOf = (v, cards) => { const body = { v, at: "2026-11-06T00:00:00.000Z", kid, cards, revoked: [] }; return { ...body, sig: crypto.sign(null, Buffer.from(A.canonical(body)), keys.privateKey).toString("base64url") }; };
  let cur = deckOf(5, good.cards);
  const api = { raw: async (m, p) => (p.endsWith("/key") ? { status: 200, body: { kid, alg: "Ed25519", pub: Buffer.from(pubRaw).toString("base64url") } } : { status: 200, body: cur }) };
  const d3 = createDeck({ api, sanitize: sanitizeDoc, subtle });
  assert.equal((await d3.load()).ok, true);
  cur = deckOf(4, []);
  const old = await d3.load();
  assert.deepEqual([old.ok, old.why, d3.deck.v, d3.deck.cards.length], [false, "aelter", 5, 1]);
  // eine Karte, deren cid nicht zum Siegel passt, oder ein widerrufenes Siegel faellt weg
  assert.equal(sane({ v: 1, cards: [{ cid: "X".repeat(22), doc: good.cards[0].doc }] }, sanitizeDoc).cards.length, 0);
  assert.equal(sane({ v: 1, cards: good.cards, revoked: [good.cards[0].cid] }, sanitizeDoc).cards.length, 0);
  // ein Geraet ohne Ed25519 bekommt kein Deck
  assert.equal((await createDeck({ api: deckApi(good), sanitize: sanitizeDoc, subtle: null }).load()).why, "signatur");
});

test("Widerruf: Status ist fail-closed – Fehler, Muell, fremde ID, kein Netz -> unknown; unbekannt beim Server -> blocked; ok gilt 30 s", async () => {
  let now = 1000, answer = null, asked = 0;
  const api = { raw: async (m, p) => { asked++; return typeof answer === "function" ? answer(p) : answer; } };
  const d = createDeck({ api, sanitize: sanitizeDoc, subtle, now: () => now });
  const cid = rec("deck-status-ok").body.c;
  for (const [a, why] of [[{ status: 503, body: { error: "unavailable" } }, "503"], [{ status: 200, body: { c: cid, st: "vielleicht" } }, "unbekanntes Wort"], [{ status: 200, body: { c: "X".repeat(22), st: "ok" } }, "Antwort einer anderen Karte"], [{ ok: false, error: "netz" }, "kein Netz"]]) {
    answer = a; assert.equal(await d.status(cid), "unknown", why);
  }
  answer = { status: 200, body: rec("deck-status-gesperrt").body }; assert.equal(await d.status(cid), "blocked");
  answer = { status: 200, body: rec("deck-status-unbekannt").body }; assert.equal(await d.status(rec("deck-status-unbekannt").body.c), "blocked", "eine Karte, die niemand uebernommen hat, bleibt zu");
  answer = { status: 200, body: rec("deck-status-ok").body }; assert.equal(await d.status(cid), "ok");
  asked = 0; assert.equal(await d.status(cid), "ok"); assert.equal(asked, 0, "ok gilt 30 s");
  now += 31000; await d.status(cid); assert.equal(asked, 1, "nach 30 s fragt es wieder");
  assert.equal(await d.status("kaputt"), "unknown");
  // Remix: die id kommt aus fr
  assert.equal(freeIdOf({ fr: cid, ki: { k: "karte", h: "a".repeat(43) } }), cid);
  assert.equal(freeIdOf({ ki: { k: "karte", s: "s2.x" } }), "", "eine freie Karte ohne id bleibt zu");
});

test("Nutzung und Daumen: nur mit Login und Token; done erst nach 20 s mit Handlung; Daumen erst nach dem Oeffnen und 10 s", async () => {
  let now = 0; const sent = [];
  const ki = rec("deck-mit-karte").body.cards[0].doc.ki;
  const mk = (login) => createDeck({ now: () => now, sanitize: sanitizeDoc, subtle, api: { raw: async (m, p, b) => { sent.push([p, b]); if (p === "/api/duell/deck/use") return !login ? { status: 401, body: { error: "login" } } : b.ev === "start" ? { status: 200, body: rec("deck-use-start").body } : { status: 204, body: null }; if (p === "/api/duell/deck/vote") return { status: 204, body: null }; return { status: 404 }; } } });
  const anon = mk(false);
  assert.deepEqual(await anon.useStart(ki), { ok: false, login: true });
  assert.equal(await anon.vote(ki, 1), "nicht-geoeffnet");
  const d = mk(true);
  assert.equal((await d.useStart(ki)).ok, true);
  assert.deepEqual(Object.keys(sent[sent.length - 1][1]).sort(), ["ev", "ki"], "nur Siegel und Ereignis, kein Geraet");
  assert.deepEqual(Object.keys(sent[sent.length - 1][1].ki).sort(), ["h", "k", "s"]);
  assert.equal(await d.vote(ki, 1), "zu-frueh");
  now = VOTE_MS; assert.equal(await d.vote(ki, 1), "ok");
  assert.equal(await d.useDone(ki, true), false, "vor 20 s zaehlt nichts");
  now = USE_MS; assert.equal(await d.useDone(ki, false), false, "ohne Handlung zaehlt nichts");
  assert.equal(await d.useDone(ki, true), true);
  assert.equal(await d.useDone(ki, true), false, "einmal je Oeffnen");
});

test("Meine freien Karten: Status, Guthaben (nur echte Nutzung und Aufnahme), Moderation; ohne Login ehrlich", async () => {
  const d = createDeck({ sanitize: sanitizeDoc, subtle, api: { raw: async () => ({ status: 200, body: rec("deck-me").body }) } });
  const m = await d.mine();
  assert.equal(m.ok, true); assert.deepEqual(m.cards.map((c) => c.st), ["deck"]); assert.equal(m.credit.balance, 5); assert.deepEqual(m.credit.items.map((x) => x.reason).sort(), ["deck", "use"]);
  const a = createDeck({ sanitize: sanitizeDoc, subtle, api: { raw: async () => ({ status: 401, body: rec("deck-me-anonym").body }) } });
  assert.deepEqual(await a.mine(), { ok: false, error: "login" });
  for (const s of ["privat", "pruefung", "deck", "pausiert", "gesperrt", "entfernt"]) for (const l of ["de", "en"]) assert.ok(FREI_TEXTS[l]["deck_st_" + s], l + " deck_st_" + s);
});

// ---------------------------------------------------------------- Alt-Orakel kibild.test.js
test("KI-Bild: jede Absage hat einen festen Text; nur echte Zustaende; Kontobild nur mit Guthaben; Abbrechen gibt in der Schlange zurueck", async () => {
  assert.equal(bildVerdict(202, { job: "abcdefgh" }), "queued");
  assert.equal(bildVerdict(422, rec("bild-krise").body), "crisis");
  assert.equal(bildVerdict(402, rec("bild-avatar-ohne-guthaben").body), "credit");
  assert.equal(bildVerdict(402, { error: "quota" }), "quota");
  assert.equal(bildVerdict(422, { error: "refused", reason: "brand" }), "refused");
  assert.equal(bildVerdict(422, { error: "blocked" }), "blocked");
  assert.equal(bildVerdict(429, { error: "busy", position: 3 }), "busy");
  assert.equal(bildVerdict(429, { error: "daily-cap" }), "daily");
  assert.equal(bildVerdict(500, null), "off");
  for (const k of ["kb_busy", "kb_blocked", "kb_credit", "kb_quota", "kb_login", "kb_age16", "kb_off", "kb_daycap", "kb_throttled", "kb_paused", "kb_offline", "kb_timeout", "kb_unsafe", "kb_failed"]) for (const l of ["de", "en"]) assert.ok(FREI_TEXTS[l][k], l + " " + k);
  for (const k of ["kb_timeout", "kb_unsafe", "kb_failed", "kb_busy"]) assert.match(FREI_TEXTS.de[k], /nichts gekostet/);
  // Ablauf gegen die Aufnahmen: Status, Auftrag, fertig (Bild als data:-URL ueber api.image)
  const phases = [], seq = [rec("bild-auftrag"), { status: 200, body: { state: "generating", etaS: 3 } }, rec("bild-job-fertig")];
  const api = { raw: async () => seq.shift(), image: async (url) => ({ ok: /^\/duell\/bild\/[A-Za-z0-9_-]{22}\.png$/.test(url), url: "data:image/png;base64," + rec("bild-datei").base64 }) };
  const b = createBild({ api, sleep: async () => {} });
  const r = await b.make({ use: "card", text: "Ein Fuchs, der Pizza liefert", style: "comic" }, (s) => phases.push(s));
  assert.equal(r.how, "done"); assert.match(r.dataUrl, /^data:image\/png;base64,iVBOR/); assert.deepEqual(phases, ["send", "generating"]);
  const st = await createBild({ api: { raw: async () => rec("bild-status") } }).status();
  assert.deepEqual([st.login, st.free.left, st.can.avatar, st.why.avatar], [true, 3, false, "credit"]);
  assert.equal((await createBild({ api: { raw: async () => rec("bild-status-anonym") } }).status()).login, false);
  // Krise: nichts gesendet
  const none = { raw: async () => { throw new Error("darf nicht senden"); } };
  assert.equal((await createBild({ api: none }).make({ use: "card", text: "ich will nicht mehr leben" })).how, "crisis");
  // Abbrechen: cancel an den Server
  const calls = []; const seq2 = [rec("bild-auftrag"), { status: 200, body: { cancelled: true, refunded: true } }];
  let alive = true;
  const r2 = await createBild({ api: { raw: async (m, p) => { calls.push(p); return seq2.shift(); } }, sleep: async () => {} }).make({ use: "card", text: "Ein Fuchs" }, () => { alive = false; }, () => alive);
  assert.deepEqual([r2.how, r2.refunded], ["gone", true]); assert.deepEqual(calls, ["/api/duell/bild", "/api/duell/bild/cancel"]);
});

// ---------------------------------------------------------------- Alt-Orakel warten.test.js
test("Warten: nur echte Zustaende (gesendet, Platz N, KI baut, Pruefung, fertig), kein Prozent, kein Countdown, beide Sprachen", async () => {
  const src = fs.readFileSync(new URL("../src/features/frei/view.js", import.meta.url), "utf8");
  assert.ok(!/%|percent|progress|countdown|Math\.random/i.test(src.replace(/\/\/.*$/gm, "")));
  for (const k of ["create_wait_h", "create_wait_cancel", "create_wait_back", "create_wait_s_send", "create_wait_s_make", "create_wait_s_check", "create_wait_s_ready", "create_wait_send", "create_wait_line", "create_wait_place", "create_wait_make", "create_wait_check", "create_wait_ready", "create_wait_cancelled"]) for (const l of ["de", "en"]) assert.ok(FREI_TEXTS[l][k], l + " " + k);
});

// ---------------------------------------------------------------- Alt-Orakel frei.test.js / Docs
test("Docs: Bereinigung wie ein fremder Link; Art und Kind muessen passen; Arcade/Tool/Tisch sind nicht Sache dieses Bereinigers", () => {
  const V = JSON.parse(fs.readFileSync(new URL("./fixtures/frei-vectors.json", import.meta.url), "utf8")).vectors;
  for (const v of V) {
    const out = sanitizeDoc(v.in);
    if (!v.in || typeof v.in !== "object") assert.equal(out, null, "Muell");
    else if (["arcade", "tool", "table", "sound", "quest"].includes(v.in.k)) assert.equal(out, null, "nicht diese Art: " + v.in.k + " (Adapter der Stränge A/T)");
    else if (v.out === null) assert.equal(out, null, JSON.stringify(v.in));
    else { for (const k of ["k", "t", "s", "x", "y", "st", "i"]) if (v.out[k] !== undefined) assert.deepEqual(out[k], v.out[k], k + " " + JSON.stringify(v.in)); }
  }
  assert.equal(sanitizeDoc({ k: "card", t: "  A\u0000b <script> ", x: "x".repeat(200), col: ["#FFD400", "#ff3b1d"], evil: 1 }).t, "A b script");
  assert.equal(sanitizeDoc({ k: "card", x: "x".repeat(200) }).x.length, 90);
  assert.equal(sanitizeDoc({ k: "turn", t: "ohne Fähigkeit" }), null, "Zug ohne Katalogkarte und ohne Fragen ist kein Doc");
  assert.ok(artOk("game", "lauf")); assert.ok(!artOk("card", "game")); assert.ok(!artOk("game", "card"));
  assert.ok(!kindOk("quiz", { k: "turn" })); assert.ok(kindOk("quiz", { k: "turn", pk: {} })); assert.ok(!kindOk("card", { k: "game" }));
  assert.ok(!kindOk("faehigkeit", { k: "turn" }), "Fähigkeit ohne Katalogkarte");
});

test("Abbildung auf Karten: card/meme -> Karte frei (Siegel reist mit), Spiele -> Flug/Lauf von Strang L, fehlt -> ehrlich", () => {
  const o = rec("karte-ok-card").body.options[0], doc = { ...sanitizeDoc(o.doc), ki: o.ki };
  const t = targetOf(doc, cardOf);
  assert.equal(t.cardId, "frei"); assert.equal(t.params.hash, o.ki.h); assert.equal(t.params.owner, o.ki.o); assert.equal(t.params.palette, "gelb"); assert.deepEqual(t.params.stickers, ["🌻", "🎂", "✨"]);
  const back = freiDoc(t.params);
  assert.deepEqual([back.k, back.t, back.x, back.st, back.col, back.ki.h], ["card", doc.t, doc.x, doc.st, PAIRS[0], o.ki.h], "Robot: zurueck in die Form, die der Server liest");
  const meme = sanitizeDoc(rec("karte-ok-meme").body.options[0].doc);
  assert.deepEqual([freiParams(meme).kind, freiParams(meme).top, freiParams(meme).bottom], ["meme", "Wenn du sagst", "Heute kein Leckerli"]);
  const game = sanitizeDoc(rec("karte-ok-game").body.options[0].doc);
  const tg = targetOf(game, cardOf);
  if (cardOf("flug") && cardOf("flug").fromFree) assert.equal(tg.cardId, "flug"); else assert.deepEqual(tg, { missing: "flug" }, "ohne Karte von Strang L ehrlich: fehlt");
  const quiz = sanitizeDoc(rec("karte-ok-quiz").body.options[0].doc);
  assert.equal(previewOf(quiz).n, 4);
  const cap = sanitizeDoc(rec("karte-ok-faehigkeit").body.options[0].doc);
  assert.equal(previewOf(cap).uses, "zug-termin");
  assert.ok(cardOf("frei").manifest && typeof cardOf("frei").fromFree === "function");
});

test("Kategorie, Genre, Wer spielt, Bald: wie im Altcode; kein Bot fuer G1/G2", () => {
  assert.deepEqual(Object.keys(MODES), ["G1", "G2"]);
  for (const g of ["G1", "G2"]) assert.deepEqual(MODES[g], { allein: true, bot: false, duell: true });
  assert.deepEqual(SOON.map((x) => x[0]), ["strategie", "schieben", "rennen", "brett", "schaetzen", "bluff", "skala"]);
  for (const l of ["de", "en"]) for (const k of ["create_art_card", "create_art_meme", "create_art_game", "create_art_quiz", "create_art_faehigkeit", "create_genre_G1", "create_genre_G2", "create_mode_allein", "create_mode_bot", "create_mode_duell", "create_mode_bot_off", "create_mode_duell_G1", "create_mode_duell_G2", ...SOON.map((x) => "create_soon_" + x[0])]) assert.ok(FREI_TEXTS[l][k], l + " " + k);
  assert.deepEqual(Object.keys(FREI_TEXTS.de).sort(), Object.keys(FREI_TEXTS.en).sort(), "de und en haben dieselben Schluessel");
});
