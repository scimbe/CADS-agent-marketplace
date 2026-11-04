"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../src/ai.js");
const T = require("../src/texts.json");
const t = (k, o) => T.de[k].replace(/\{(\w+)\}/g, (m, x) => o[x]);

// A fake server: a list of answers in order, and what the page sent.
function fake(answers) {
  const sent = [];
  return { sent, send: async (path, body) => { sent.push({ path, body }); const a = answers.shift(); if (a instanceof Error) throw a; return a; } };
}
const ASK = { kind: "wish", input: { type: "game", wish: "Weltraum" }, device: "ab".repeat(16), proof: "x", lang: "de" };

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
});

test("Adapter, alter Server (v1): Ergebnis direkt, ohne Ticket nichts zu bestaetigen, Version 2 wird nur angekuendigt", async () => {
  const s = fake([{ status: 200, json: { kind: "wish", options: [{ changes: { theme: "space" } }], meter: { free: 3, remaining: 2 } } }]);
  const metered = [], c = A.client({ send: s.send, keep: (j) => metered.push(j && j.meter) });
  const r = await c.ask(ASK);
  assert.equal(r.how, "result"); assert.deepEqual(r.options, [{ changes: { theme: "space" } }]); assert.equal(r.ticket, ""); assert.equal(r.seal, "");
  assert.equal(s.sent[0].path, ""); assert.equal(s.sent[0].body.v, 2); assert.equal(s.sent[0].body.kind, "wish");
  assert.deepEqual(metered, [{ free: 3, remaining: 2 }], "der Zaehler kommt aus jeder Antwort");
  assert.equal(await c.confirm(ASK.device, r.ticket), ""); assert.equal(s.sent.length, 1, "kein /confirm ohne Ticket");
});

test("Adapter, Warteschlange: Platz wird gemeldet, gewartet wird mit Ticket, Ergebnis mit Siegel; Bestaetigen bucht ab", async () => {
  const s = fake([
    { status: 202, json: { ticket: "tk-0001", position: 3, wait: 100 } },
    { status: 202, json: { ticket: "tk-0001", position: 1, wait: 99999 } },
    { status: 200, json: { options: ["A"], seal: "v1.k1.abcdef0123", ticket: "tk-0001" } },
    { status: 200, json: { meter: { free: 7, remaining: 6, period: "week" }, seal: "v1.k1.final0000" } }
  ]);
  const slept = [], places = [];
  const c = A.client({ send: s.send, sleep: async (ms) => { slept.push(ms); }, now: () => 0 });
  const r = await c.ask(ASK, (n) => places.push(n));
  assert.deepEqual(places, [3, 1]); assert.deepEqual(slept, [500, 5000], "Pause aus der Antwort, aber begrenzt");
  assert.deepEqual(s.sent.slice(1, 3).map((x) => [x.path, x.body.ticket, x.body.device]), [["/wait", "tk-0001", ASK.device], ["/wait", "tk-0001", ASK.device]]);
  assert.ok(!("input" in s.sent[1].body), "beim Warten geht der Text nicht nochmal raus");
  assert.equal(r.how, "result"); assert.equal(r.seal, "v1.k1.abcdef0123"); assert.equal(r.ticket, "tk-0001");
  assert.equal(await c.confirm(ASK.device, r.ticket), "v1.k1.final0000");
  assert.deepEqual(s.sent[3], { path: "/confirm", body: { device: ASK.device, ticket: "tk-0001" } });
});

test("Adapter, ehrliche Zustaende: belegt mit Platz, zu lange gewartet -> belegt und abgemeldet, offline -> aus, nie ein Ersatz", async () => {
  let r = await A.client({ send: fake([{ status: 429, json: { error: "busy", position: 4 } }]).send }).ask(ASK);
  assert.deepEqual([r.how, r.position, r.options.length], ["busy", 4, 0]);
  let clock = 0; const s = fake([{ status: 202, json: { ticket: "tk-0002", position: 5 } }, { status: 202, json: { ticket: "tk-0002", position: 2 } }, { status: 200, json: {} }]);
  r = await A.client({ send: s.send, sleep: async (ms) => { clock += ms; }, now: () => clock, waitMax: 2000 }).ask(ASK);
  assert.deepEqual([r.how, r.position], ["busy", 2]); assert.equal(s.sent[2].path, "/cancel", "die Seite meldet sich aus der Schlange ab");
  r = await A.client({ send: fake([new Error("offline")]).send }).ask(ASK);
  assert.deepEqual([r.how, r.options.length], ["off", 0]);
  r = await A.client({ send: fake([{ status: 503, json: { error: "ai-off" } }]).send }).ask(ASK);
  assert.deepEqual([r.how, r.options.length], ["off", 0]);
  const bad = await A.client({ send: fake([{ status: 200, json: { options: ["x"], seal: "<script>", ticket: "../../x" } }]).send }).ask(ASK);
  assert.equal(bad.seal, ""); assert.equal(bad.ticket, "", "fremde Zeichen in Siegel und Ticket fallen weg");
});

test("Zaehler: immer sichtbar als Zeile, Woche oder gesamt, ohne Streak und ohne Countdown", () => {
  assert.equal(A.count(null, t), T.de.aiCountNew);
  assert.equal(A.count({ free: 7, remaining: 5, period: "week" }, t), "KI diese Woche: noch 5 von 7");
  assert.equal(A.count({ free: 3, remaining: 1 }, t), "Noch 1 von 3 KI-Versuchen gratis");
  assert.match(T.de.aiBusyAt.replace("{n}", 2), /^KI gerade belegt \(Platz 2\)/); assert.match(T.en.aiBusyAt, /place \{n\}/);
  assert.equal(T.de.aiNoAi, "Ohne KI erkannt");
});

test("Meldung: nur Texte, Typ und Siegel; kein Foto, keine Spur, keine Raetsel eines Kanals", () => {
  const doc = { k: "quest", t: "Schatz", s: "Grab", x: "Hallo", q0: "Geheimfrage", h0: "abc", c: ["Z2VoZWlt"], by: [{ n: "Ada", w: ["text"] }], ki: { k: "wish", s: "v1.abcdefgh" }, col: ["#111111", "#222222"] };
  const b = A.reportBody(doc, "de"), j = JSON.stringify(b);
  assert.deepEqual(b, { v: 1, type: "quest", kind: "wish", seal: "v1.abcdefgh", lang: "de", content: { t: "Schatz", s: "Grab", x: "Hallo" } });
  assert.ok(!/Geheimfrage|Z2VoZWlt|Ada/.test(j));
  assert.deepEqual(A.reportBody({ k: "game", g: { title: "Alienflug" }, ki: { k: "wish" } }, "en").content, { title: "Alienflug" });
  assert.equal(A.reportBody({ k: "card", w: { p: "Hamburg" } }, "de").content.w, undefined, "Wetterzahlen sind keine KI-Texte");
});

test("Keine Dark Patterns: kein Preis, kein Zeitdruck, kein Kaufknopf in den Texten", () => {
  for (const l of ["de", "en"]) for (const k of Object.keys(T[l]).filter((x) => /^(ai|ki|dice)/.test(x))) {
    assert.ok(!/€|\$|\d+[,.]\d\d|countdown|sofort|hurry|letzte chance|last chance|nur noch|läuft ab|expires|streak/i.test(T[l][k]), k + ": " + T[l][k]);
  }
});
test("Nachweis: gefundene Zahl hat die verlangten Nullbits", async () => {
  const { createHash, webcrypto } = require("node:crypto"), dev = "ab".repeat(16);
  const p = await A.solve(dev, 12, webcrypto.subtle), h = createHash("sha256").update(dev + ":" + p).digest();
  assert.equal(h[0], 0); assert.equal(h[1] >> 4, 0);
});
