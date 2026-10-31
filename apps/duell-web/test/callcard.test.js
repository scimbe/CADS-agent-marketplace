"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/callcard.js");

const NOW = 1000000;
const qs = [{ q: "Mein Lieblingsessen?", a: "Käsespätzle" }, { q: "Wie heißt mein Kater?", a: "Mütze" }, { q: "Wo war ich im Urlaub?", a: "Am Meer" }];
const card = () => C.create({ qs, nick: "Ada", emoji: "🐙", col: ["#2b4bff", "#ffe600"] }, NOW, () => 0.42);
const right = ["käsespätzle", " MUTZE ", "am meer!"];

test("Antworten stehen nirgends im Link, nur kurze Tags", () => {
  const c = card(), raw = Buffer.from(C.encode(c), "base64url").toString();
  for (const w of ["sespätzle", "Mütze", "Meer"]) assert.ok(!raw.includes(w), w);
  assert.ok(c.q.every((e) => e.h >= 0 && e.h <= 0xffff && !("a" in e)));
});
test("Keine Karte ohne 3 Fragen und Antworten, keine Telefonnummern, Adressen, Handles", () => {
  assert.equal(C.create({ qs: qs.slice(0, 2) }, NOW), null);
  for (const bad of ["Ruf an: 0171 2345678", "+49 40 123456", "mail an a@b.de", "https://x.de", "Wohne in 20095", "arschloch"]) {
    assert.equal(C.create({ qs: [{ q: bad, a: "x" }, qs[1], qs[2]] }, NOW), null, bad);
    assert.equal(C.create({ qs: [{ q: "Frage?", a: bad }, qs[1], qs[2]] }, NOW), null, bad);
  }
});
test("Link hin und zurueck, kaputte oder gefaelschte Links werden nichts", () => {
  const c = card(); assert.deepEqual(C.decode(C.encode(c)), c);
  const e = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  for (const bad of ["", "x", "%%%", e({ v: 2 }), e({ ...c, q: c.q.slice(1) }), e({ ...c, id: "<b>" }), e({ ...c, col: ["red", "url(x)"] }), e({ ...c, q: [{ t: "<img src=x>", h: 1 }, c.q[1], c.q[2]] }), e({ ...c, q: [{ t: "Tel 0171 2345678", h: 1 }, c.q[1], c.q[2]] }), e({ ...c, q: [{ t: "ok", h: 70000 }, c.q[1], c.q[2]] }), "A".repeat(2000)]) assert.equal(C.decode(bad), null);
  assert.equal(C.decode(e({ ...c, n: "<script>" })).n.includes("<"), false);
});
test("Antworten: Gross/Klein, Umlaute, Satzzeichen zaehlen nicht", () => {
  assert.equal(C.score(card(), right), 3); assert.equal(C.score(card(), ["", "", ""]), 0); assert.equal(C.score(card(), ["kasespatzle", "x", "y"]), 1);
});
test("Mehrfachversuche: nach 3 falschen ist Schluss, auch eine richtige Antwort hilft dann nicht", () => {
  const c = card(), book = {}, bad = ["a", "b", "c"];
  assert.deepEqual(C.answer(c, bad, book, NOW), { state: "wrong", hit: 0, left: 2 });
  assert.equal(C.answer(c, bad, book, NOW).state, "wrong");
  assert.equal(C.answer(c, bad, book, NOW).state, "locked");
  assert.equal(C.answer(c, right, book, NOW).state, "locked");
  assert.equal(C.tries(book, c.id), 3);
});
test("Einmalig: bestanden ist verbraucht", () => {
  const c = card(), book = {};
  assert.equal(C.answer(c, right, book, NOW).state, "passed");
  assert.equal(C.answer(c, right, book, NOW).state, "used");
});
test("Abgelaufen: nach 10 Minuten zaehlt nichts mehr, auch nicht die richtige Antwort", () => {
  const c = card(), book = {};
  assert.equal(c.x, NOW + 10 * 60 * 1000);
  assert.equal(C.answer(c, right, book, c.x).state, "expired");
  assert.equal(C.tries(book, c.id), 0);
});
test("Annehmen nur durch Tippen: keine Nachricht und keine Zeit fuehrt zu angenommen", () => {
  const g = C.gate();
  assert.equal(g.tap("accept"), false, "ohne Anfrage nichts anzunehmen"); assert.equal(g.state(), "wait");
  assert.ok(g.request("Ben", NOW)); assert.equal(g.state(), "asked"); assert.equal(g.who(), "Ben");
  for (let i = 0; i < 5; i++) { g.request("Ben", NOW); g.tick(NOW + 1000); }
  assert.equal(g.state(), "asked");
  assert.ok(g.tap("accept")); assert.equal(g.state(), "accepted");
});
test("Abgelehnt: bleibt abgelehnt, weitere Anfragen und Tippen aendern nichts", () => {
  const g = C.gate(); g.request("Ben", NOW); assert.ok(g.tap("decline"));
  assert.equal(g.request("Ben", NOW), false); assert.equal(g.tap("accept"), false); assert.equal(g.state(), "declined");
});
test("Keine Antwort: nach einer Minute abgelehnt, nie angenommen", () => {
  const g = C.gate(); g.request("Ben", NOW);
  assert.equal(g.tick(NOW + C.ASK_MS - 1), false); assert.ok(g.tick(NOW + C.ASK_MS)); assert.equal(g.state(), "declined"); assert.equal(g.tap("accept"), false);
});
test("Blockieren geht immer, auch ohne Anfrage und nach Annehmen", () => {
  for (const setup of [(g) => g, (g) => { g.request("B", NOW); }, (g) => { g.request("B", NOW); g.tap("accept"); }, (g) => { g.request("B", NOW); g.tap("decline"); }]) {
    const g = C.gate(); setup(g); assert.ok(g.tap("block")); assert.equal(g.state(), "blocked"); assert.equal(g.request("B", NOW), false); assert.equal(g.tap("accept"), false);
  }
});
test("Warten laeuft ab", () => { const g = C.gate(); assert.ok(g.expire()); assert.equal(g.request("B", NOW), false); });
test("Frames: nur die drei Handlungen, kein Text", () => {
  assert.deepEqual(C.parseFrame(C.frame("req", "Ben")), { a: "req", n: "Ben" }); assert.equal(C.parseFrame(C.frame("ok")).a, "ok");
  for (const bad of ["", "{", "null", '{"v":1,"t":"cc","a":"accept"}', '{"v":1,"t":"ops"}', '{"v":2,"t":"cc","a":"ok"}', JSON.stringify({ v: 1, t: "cc", a: "req", n: "x".repeat(300) })]) assert.equal(C.parseFrame(bad), null, bad);
  assert.equal(C.parseFrame(JSON.stringify({ v: 1, t: "cc", a: "req", n: "<b>x" })).n.includes("<"), false);
  assert.deepEqual(Object.keys(C.parseFrame(JSON.stringify({ v: 1, t: "cc", a: "ok", n: "Hallo du", text: "frei" }))).sort(), ["a", "n"]);
  assert.equal(C.parseFrame(JSON.stringify({ v: 1, t: "cc", a: "ok", n: "Hallo" })).n, "");
});
