"use strict";
// KI-Bilder auf Wunsch (src/kibild.js): what the server's answers mean, the steps shown, what a link and a report carry.
// The server side is CADS-DEMO-wrapper lib/duell-bild.mjs (its own tests: test/duell-bild.test.mjs).
const test = require("node:test");
const assert = require("node:assert/strict");
const K = require("../src/kibild.js");
const D = require("../src/daily.js");
const TX = require("../src/kibild.json");

const REF = "AbCdEfGhIjKlMnOpQrStUv.png";

test("Antworten: jede Absage hat einen festen Text, busy sagt Platz, Wartezeit und wann nochmal", () => {
  assert.equal(K.errorText(202, { job: "x" }), null);
  assert.deepEqual(K.errorText(429, { error: "busy", position: 3, etaS: 41, retryS: 15 }), { key: "kb_busy", vars: { n: 3, s: 41, r: 15 } });
  for (const r of ["sexual", "minors", "hate", "gore", "violence", "weapons", "real_person", "brand", "drugs", "youth", "contact"]) assert.equal(K.errorText(422, { error: "refused", reason: r }).key, "kb_no_" + r);
  assert.equal(K.errorText(422, { error: "refused", reason: "whatever" }).key, "kb_no_other");
  assert.equal(K.errorText(422, { error: "blocked" }).key, "kb_blocked");
  assert.equal(K.errorText(422, { error: "blocked", why: "crisis" }).key, "aiCrisis");
  assert.equal(K.errorText(402, { error: "credit" }).key, "kb_credit");
  assert.equal(K.errorText(402, { error: "quota" }).key, "kb_quota");
  assert.equal(K.errorText(500, null).key, "kb_offline");
  // every key the part names exists in both languages
  const keys = new Set(["kb_busy", "kb_blocked", "kb_credit", "kb_quota", "kb_login", "kb_age16", "kb_off", "kb_daycap", "kb_throttled", "kb_paused", "kb_offline", "kb_timeout", "kb_unsafe", "kb_failed"].concat(["sexual", "minors", "hate", "gore", "violence", "weapons", "real_person", "brand", "drugs", "youth", "contact", "other"].map((r) => "kb_no_" + r)));
  for (const l of ["de", "en"]) for (const k of keys) assert.ok(TX[l][k], l + " " + k);
  assert.deepEqual(Object.keys(TX.de).sort(), Object.keys(TX.en).sort(), "de und en haben dieselben Texte");
  assert.match(TX.de.kb_again_cost, /kostet wieder/);
  assert.match(TX.de.kb_note, /nie ein Foto/);
});

test("Schritte: nur echte Zustaende des Auftrags; Fehler sagen, dass nichts gekostet hat", () => {
  assert.deepEqual(["queued", "generating", "checking", "done", "failed"].map((s) => K.step({ state: s })), [1, 2, 3, 4, -1]);
  assert.equal(K.failText("timeout"), "kb_timeout");
  assert.equal(K.failText("unsafe"), "kb_unsafe");
  for (const k of ["kb_timeout", "kb_unsafe", "kb_failed", "kb_busy"]) assert.match(TX.de[k], /nichts gekostet/);
});

test("Link: nur die Id des Bildes, nie Bytes; sanitizeDoc kennt gi.p und gi.l und wirft Fremdes weg", () => {
  assert.equal(K.refOf("https://demos-34a13a96.bunsenbrenner.org/duell/bild/" + REF), REF);
  assert.equal(K.refOf("https://evil.example/x.png"), "");
  const doc = K.apply(K.apply({ k: "card", col: ["#ffd400", "#ff3b1d"], by: [], x: "Hallo", st: "druck", sk: [] }, "card", REF), "logo", REF.replace("png", "jpg"));
  assert.deepEqual(doc.gi, { p: REF, l: REF.replace("png", "jpg") });
  const s = D.sanitizeDoc(doc);
  assert.deepEqual(s.gi, doc.gi);
  assert.equal(D.sanitizeDoc({ ...doc, gi: { p: "data:image/png;base64,AAAA", l: "https://x/y.png" } }).gi, undefined);
  assert.equal(D.sanitizeDoc({ ...doc, gi: { p: "../../etc/passwd.png" } }).gi, undefined);
  // the picture costs the link about 60 characters, never the picture itself; the link opens with the same ids
  const a = D.docUrl(D.sanitizeDoc({ ...doc, gi: undefined })), b = D.docUrl(s);
  assert.ok(b.length - a.length < 120, "Link waechst um " + (b.length - a.length));
  assert.deepEqual(D.parseRoute(new URL(b).hash).doc.gi, doc.gi);
  assert.equal(K.apply(doc, "card", "nope.png"), doc, "eine fremde Referenz aendert nichts");
});

test("Melden: Grund, kind bild, die Id; nie der Satz, nie das Bild", () => {
  const b = K.reportBody(REF, "sex", "s2.bild.mw3abc.AnlRQb9jJYrLILMRBtJj7yR1qlhJF0ER");
  assert.deepEqual(b, { reason: "sex", kind: "bild", consent: true, content: { bild: REF.split(".")[0] }, option: { bild: REF.split(".")[0] }, seal: "s2.bild.mw3abc.AnlRQb9jJYrLILMRBtJj7yR1qlhJF0ER" });
  assert.equal(K.reportBody(REF, "nope"), null);
  assert.equal(K.reportBody("x.png", "sex"), null);
  assert.equal(K.reportBody(REF, "other", "s2.karte.x.y").seal, undefined, "nur ein Bild-Siegel");
});
