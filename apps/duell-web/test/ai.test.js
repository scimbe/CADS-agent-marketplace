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

test("Adapter, alter Server: Ergebnis direkt, ohne Beleg nichts abzurechnen; neu ist nur das Feld queue, das der alte Server ignoriert", async () => {
  const s = fake([{ status: 200, json: { kind: "wish", options: [{ changes: { theme: "space" } }], meter: { free: 3, remaining: 2 } } }]);
  const metered = [], c = A.client({ send: s.send, keep: (j) => metered.push(j && j.meter) });
  const r = await c.ask(ASK);
  assert.equal(r.how, "result"); assert.deepEqual(r.options, [{ changes: { theme: "space" } }]); assert.equal(r.receipt, ""); assert.deepEqual(r.seals, [""]);
  assert.equal(s.sent[0].path, ""); assert.deepEqual(s.sent[0].body, Object.assign({}, ASK, { queue: "ticket" }), "kein v:2, nur queue:'ticket' (Server-Protokoll)");
  assert.deepEqual(metered, [{ free: 3, remaining: 2 }], "der Zaehler kommt aus jeder Antwort");
  assert.equal(await c.accept(ASK.device, r.receipt), false); assert.equal(await c.discard(ASK.device, r.receipt), false);
  assert.equal(s.sent.length, 1, "ohne Beleg kein /accept und kein /discard");
});

test("Pfade wie im Server-Protokoll: /api/duell/ai, /queue daneben, /ai/accept, /ai/discard, /report daneben", () => {
  const api = "https://h.example/api/duell/config";
  assert.equal(A.endpoint(api, ""), "https://h.example/api/duell/ai");
  assert.equal(A.endpoint(api, "/queue"), "https://h.example/api/duell/queue");
  assert.equal(A.endpoint(api, "/accept"), "https://h.example/api/duell/ai/accept");
  assert.equal(A.endpoint(api, "/discard"), "https://h.example/api/duell/ai/discard");
  assert.equal(A.endpoint(api, "/report"), "https://h.example/api/duell/report");
  assert.equal(A.endpoint(api, "/weather"), "https://h.example/api/duell/ai/weather");
  assert.equal(A.endpoint(api, "/relay-grant"), "https://h.example/api/duell/relay-grant", "Datei rueber: Relais-Grant neben der KI");
});

test("Adapter, Warteschlange: Platz wird gemeldet, gewartet wird nur mit Ticket an /queue, Ergebnis mit Siegel je Option und Beleg", async () => {
  const s = fake([
    { status: 202, json: { queued: true, ticket: "tk-0001", position: 3, etaS: 9 } },
    { status: 202, json: { queued: true, ticket: "tk-0001", position: 0, etaS: 2 } },
    { status: 200, json: { options: ["A", "B"], seals: ["s1.line.abc.sigA0000", "<x>"], cost: 1, receipt: "rc-0001.x" } },
    { status: 200, json: { final: true, meter: { free: 7, remaining: 6, period: "week" } } }
  ]);
  const places = [], metered = [];
  const c = A.client({ send: s.send, sleep: async () => {}, now: () => 0, keep: (j) => metered.push(j && j.meter) });
  const r = await c.ask(ASK, (n) => places.push(n));
  assert.deepEqual(places, [3, 0], "Platz 0 = laeuft gerade, die Seite zeigt dann 'denkt nach'");
  assert.deepEqual(s.sent.slice(1, 3), [{ path: "/queue", body: { ticket: "tk-0001" } }, { path: "/queue", body: { ticket: "tk-0001" } }], "beim Warten geht weder Text noch Geraet nochmal raus");
  assert.equal(r.how, "result"); assert.deepEqual(r.seals, ["s1.line.abc.sigA0000", ""]); assert.equal(r.receipt, "rc-0001.x");
  assert.equal(await c.accept(ASK.device, r.receipt), true);
  assert.deepEqual(s.sent[3], { path: "/accept", body: { device: ASK.device, receipt: "rc-0001.x" } });
  assert.deepEqual(metered.pop(), { free: 7, remaining: 6, period: "week" });
  const d = fake([{ status: 200, json: { refunded: 1, meter: { free: 7, remaining: 7 } } }]);
  assert.equal(await A.client({ send: d.send }).discard(ASK.device, "rc-0001.x"), true);
  assert.deepEqual(d.sent, [{ path: "/discard", body: { device: ASK.device, receipt: "rc-0001.x" } }]);
});

test("Adapter, ehrliche Zustaende: belegt mit Platz, zu lange gewartet -> belegt ohne Abmelden (Ticket verfaellt), Ticket weg -> aus, offline -> aus", async () => {
  let r = await A.client({ send: fake([{ status: 429, json: { error: "busy", position: 4 } }]).send }).ask(ASK);
  assert.deepEqual([r.how, r.position, r.options.length], ["busy", 4, 0]);
  r = await A.client({ send: fake([{ status: 409, json: { error: "pending" } }]).send }).ask(ASK);
  assert.equal(r.how, "busy", "eine Anfrage je Person: belegt, nicht kaputt");
  let clock = 0; const s = fake([{ status: 202, json: { ticket: "tk-0002", position: 5 } }, { status: 202, json: { ticket: "tk-0002", position: 2 } }, { status: 200, json: {} }]);
  r = await A.client({ send: s.send, sleep: async (ms) => { clock += ms; }, now: () => clock, waitMax: 900 }).ask(ASK);
  assert.deepEqual([r.how, r.position], ["busy", 2]); assert.deepEqual(s.sent.map((x) => x.path), ["", "/queue"], "kein /cancel: den gibt es auf dem Server nicht");
  r = await A.client({ send: fake([{ status: 202, json: { ticket: "tk-0003", position: 1 } }, { status: 404, json: { error: "ticket" } }]).send, sleep: async () => {} }).ask(ASK);
  assert.equal(r.how, "off");
  r = await A.client({ send: fake([new Error("offline")]).send }).ask(ASK);
  assert.deepEqual([r.how, r.options.length], ["off", 0]);
  r = await A.client({ send: fake([{ status: 503, json: { error: "ai-off" } }]).send }).ask(ASK);
  assert.deepEqual([r.how, r.options.length], ["off", 0]);
  const bad = await A.client({ send: fake([{ status: 200, json: { options: ["x"], seals: ["<script>"], receipt: "../ x" } }]).send }).ask(ASK);
  assert.deepEqual(bad.seals, [""]); assert.equal(bad.receipt, "", "fremde Zeichen in Siegel und Beleg fallen weg");
});

test("Adapter, Blatt verlassen: das Warten hoert sofort auf, nichts wird mehr abgefragt", async () => {
  let here = true; const s = fake([{ status: 202, json: { ticket: "tk-0004", position: 2 } }, { status: 200, json: { options: ["A"], receipt: "rc-0004" } }]);
  const r = await A.client({ send: s.send, sleep: async () => { here = false; } }).ask(ASK, null, () => here);
  assert.equal(r.how, "gone"); assert.deepEqual(r.options, []); assert.equal(s.sent.length, 1);
});

test("Zaehler: immer sichtbar als Zeile, Woche oder gesamt, ohne Streak und ohne Countdown", () => {
  assert.equal(A.count(null, t), T.de.aiCountNew);
  assert.equal(A.count({ free: 7, remaining: 5, period: "week" }, t), "KI diese Woche: noch 5 von 7");
  assert.equal(A.count({ free: 3, remaining: 1 }, t), "Noch 1 von 3 KI-Versuchen gratis");
  assert.match(T.de.aiBusyAt.replace("{n}", 2), /^KI gerade belegt \(Platz 2\)/); assert.match(T.en.aiBusyAt, /place \{n\}/);
  assert.equal(T.de.aiNoAi, "Ohne KI erkannt");
});

test("Meldung: Grund, Texte, Typ und Siegel wie im Server-Protokoll; kein Foto, keine Spur, keine Raetsel eines Kanals", () => {
  const doc = { k: "quest", t: "Schatz", s: "Grab", x: "Hallo", q0: "Geheimfrage", h0: "abc", c: ["Z2VoZWlt"], by: [{ n: "Ada", w: ["text"] }], ki: { k: "wish", s: "s1.wish.abc.defgh" }, col: ["#111111", "#222222"] };
  const b = A.reportBody(doc, "harm", "Ab3dEf7h"), j = JSON.stringify(b);
  assert.deepEqual(b, { reason: "harm", consent: true, kind: "wish", seal: "s1.wish.abc.defgh", link: "Ab3dEf7h", content: { type: "quest", t: "Schatz", s: "Grab", x: "Hallo" } });
  assert.ok(!/Geheimfrage|Z2VoZWlt|Ada/.test(j));
  assert.deepEqual(A.reportBody({ k: "game", g: { title: "Alienflug" }, ki: { k: "wish" } }, "other").content, { type: "game", title: "Alienflug" });
  assert.equal(A.reportBody({ k: "card", w: { p: "Hamburg" } }, "wrong").content.w, undefined, "Wetterzahlen sind keine Texte");
  assert.deepEqual(A.reportBody({ k: "card", x: "Hi" }, "sex"), { reason: "sex", consent: true, content: { type: "card", x: "Hi" } }, "auch ein Blatt ohne KI ist meldbar");
  assert.equal(A.reportBody(doc, "spam"), null, "nur Gruende, die der Server kennt");
  assert.equal(A.reportBody(doc, "harm", "../x").link, undefined);
  assert.deepEqual(A.REASONS, ["harm", "sex", "hate", "private", "wrong", "other"]);
  for (const l of ["de", "en"]) for (const r of A.REASONS) assert.ok(T[l]["kiWhy_" + r], l + " kiWhy_" + r);
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

// Fixed vectors, computed with canonical() from CADS-DEMO-wrapper lib/duell-seal.mjs and node:crypto sha256 base64url.
const VEC = [
  ["Zeile A", "\"Zeile A\"", "hcGrPTYbZsK9tsaqzwSGUoKzFUrwVK8Mn0PqSXYdi6s"],
  [{ changes: { t: "Alienflug", theme: "space", emoji: "🛸", look: { d: "bubbles", sky: "#0b1020" } } },
    "{\"changes\":{\"emoji\":\"🛸\",\"look\":{\"d\":\"bubbles\",\"sky\":\"#0b1020\"},\"t\":\"Alienflug\",\"theme\":\"space\"}}", "Y-feMaAnaOXUrB2BxPv3vUTgMan0NNfOQmA6jhDp_Tc"],
  [{ b: 1, a: [1, "ä", null, true], "Ä": 2, Z: 0, "\"q\\": "Zeile\nzwei" },
    "{\"\\\"q\\\\\":\"Zeile\\nzwei\",\"Z\":0,\"a\":[1,\"ä\",null,true],\"b\":1,\"Ä\":2}", "AqF9AIRLXl9TdSAYN7CXkWCNzBmIwePnlNl2YhSNMcs"],
  [{ x: 0.1, y: 1e21, z: -0, w: 12.50 }, "{\"w\":12.5,\"x\":0.1,\"y\":1e+21,\"z\":0}", "WfF_3Rk2ObrCP9aV5PP1pO-5_c_WS8RNMoKXj6oQJeQ"],
  [{ top: "Wenn der Montag", bottom: "schon wieder ruft 😅" }, "{\"bottom\":\"schon wieder ruft 😅\",\"top\":\"Wenn der Montag\"}", "LuRmOaagKwV8izpFzGCMhVmQ9aSI_4Eez8n6-toAMSo"]
];
test("Options-Hash: kanonisches JSON mit sortierten Schluesseln, SHA-256 base64url, feste Vektoren wie der Server", async () => {
  for (const [opt, canon, h] of VEC) {
    assert.equal(A.canonical(opt), canon);
    assert.equal(await A.optionHash(opt, crypto.subtle), h);
    assert.equal(h.length, 43);
  }
  // key order and undefined do not matter, any other change does
  assert.equal(await A.optionHash({ Z: 0, "Ä": 2, a: [1, "ä", null, true], "\"q\\": "Zeile\nzwei", b: 1, u: undefined }, crypto.subtle), VEC[2][2]);
  assert.equal(A.canonical([undefined, 1]), "[null,1]");
  assert.notEqual(await A.optionHash({ top: "Wenn der Montag", bottom: "schon wieder ruft 😅 " }, crypto.subtle), VEC[4][2]);
  assert.equal(await A.optionHash("x", undefined), "", "ohne crypto.subtle kein h, kein Fehler");
});
test("Meldung: optionHash nur neben einem Siegel und nur mit genau 43 base64url-Zeichen; alte Blaetter ohne h bleiben gleich", () => {
  const h = VEC[1][2], ki = { k: "wish", s: "s1.wish.abc.defgh", h };
  assert.equal(A.reportBody({ k: "game", ki }, "harm").optionHash, h);
  assert.equal(A.reportBody({ k: "game", ki: { k: "wish", h } }, "harm").optionHash, undefined, "ohne Siegel kein Hash");
  for (const bad of [h.slice(1), h + "A", h.slice(1) + "+", h.slice(1) + "=", 42]) assert.equal(A.reportBody({ k: "game", ki: { ...ki, h: bad } }, "harm").optionHash, undefined, String(bad));
  assert.equal("optionHash" in A.reportBody({ k: "game", ki: { k: "wish", s: "s1.wish.abc.defgh" } }, "harm"), false);
});

test("loginReturn: der Login fuehrt zur Seite des eigenen Builds zurueck, nur als Pfad; ohne Flavor zu /duell", () => {
  const biz = require("../src/flavors/business/flavor.json");
  assert.equal(A.loginReturn(biz), "/duell/business");
  assert.equal(A.loginReturn(undefined), "/duell");
  assert.equal(A.loginReturn({ id: "x" }), "/duell");
  assert.equal(A.loginReturn({ shareBase: "https://bunsenbrenner.org/business" }), "/business");
  for (const bad of ["https://host/", "https://host", "http://host/duell/business/", "//evil.example/x", "https://host//evil.example", "javascript:alert(1)", 42, null]) {
    assert.equal(A.loginReturn({ shareBase: bad }), "/duell", String(bad));
  }
});
