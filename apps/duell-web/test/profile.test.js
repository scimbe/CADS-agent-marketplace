"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../src/profile.js");
const D = require("../src/daily.js");

const TH = "data:image/jpeg;base64,AAAA", PNG = "data:image/png;base64,AAAA";
const card = (id, ts) => ({ id, ts, k: "card", th: TH });
const me = { nick: "Mira", emoji: "🐸", colors: ["#ffd400", "#ff3b1d"], set: "tiere" };

test("Code: 32 Hex-Zeichen, lesbar in Vierergruppen, Eingabe verzeiht Grossbuchstaben und Striche", () => {
  const c = P.newCode(new Uint8Array(16).fill(171));
  assert.equal(c, "ab".repeat(16));
  assert.equal(P.fmtCode(c), "abab-abab-abab-abab-abab-abab-abab-abab");
  assert.equal(P.parseCode(" ABAB-abab abab-ABAB-abab-abab-abab-abab "), c);
  for (const bad of ["", "abc", "z".repeat(32), "ab".repeat(17), null]) assert.equal(P.parseCode(bad), null, String(bad));
});

test("Packen: Fotos und Eintraege ohne Art bleiben auf dem Geraet, nur JPEG bis zur Grenze, KI-Geraet nur beim Code", () => {
  const s = { me, wall: [card("a", 3), { id: "b", ts: 2, k: "photo", th: TH }, { id: "c", ts: 1, th: TH }, { id: "d", ts: 4, k: "card", th: PNG }, { id: "e", ts: 5, k: "game", th: "data:image/jpeg;base64," + "A".repeat(P.THUMB_MAX) }],
    saved: [{ id: "quiz-chaos", ts: 9 }, { id: "quiz-chaos", ts: 8 }, { id: "NO", ts: 1 }], aiDev: "d".repeat(32), aiProof: "1a", links: [{ id: "x", t: "secret" }], aiMeter: { remaining: 2 } };
  const code = P.pack(s, "code");
  assert.deepEqual(code.wall.map((e) => e.id), ["a"]);
  assert.deepEqual(code.saved, [{ id: "quiz-chaos", ts: 9 }]);
  assert.deepEqual(code.ai, { dev: "d".repeat(32), proof: "1a" });
  assert.deepEqual(Object.keys(code).sort(), ["ai", "me", "saved", "wall"], "no links, no delete tokens, no meter");
  assert.equal(P.pack(s, "account").ai, undefined);
  const big = { wall: Array.from({ length: 30 }, (_, i) => ({ id: "x" + i, ts: i, k: "card", th: "data:image/jpeg;base64," + "A".repeat(29000) })) };
  const w = P.pack(big, "code").wall;
  assert.ok(w.length < 30 && w.length > 10, "size limit keeps the newest");
  assert.equal(w[0].ts, 29);
});

test("Abgleich: Erstverbindung uebernimmt den Stil vom Server, beide Waende werden vereinigt", () => {
  const s = { me: { ...me, nick: "Neu" }, wall: [card("a", 1)], saved: [], aiDev: "a".repeat(32) };
  const remote = { me, wall: [card("b", 2)], saved: [{ id: "quiz", ts: 3 }], ai: { dev: "b".repeat(32), proof: "x" } };
  const ch = P.merge(s, remote, null, "code");
  assert.equal(ch.me.nick, "Mira");
  assert.deepEqual(ch.wall.map((e) => e.id), ["b", "a"]);
  assert.deepEqual(ch.saved, [{ id: "quiz", ts: 3 }]);
  assert.equal(ch.aiDev, "b".repeat(32), "the code shares one AI allowance");
  assert.deepEqual(P.merge(s, null, null, "code"), {}, "empty server: nothing changes here, the device is written up");
  assert.equal(P.merge(s, remote, null, "account").aiDev, undefined);
});

test("Abgleich: lokal geaenderter Stil gewinnt, Loeschen auf einem Geraet loescht ueberall, Neues bleibt", () => {
  const before = { me, wall: [card("a", 1), card("b", 2)], saved: [{ id: "x", ts: 1 }] };
  const base = P.snapshot(P.pack(before, "code"));
  const local = { me: { ...me, emoji: "🦖" }, wall: [card("b", 2), card("c", 3), { id: "p", ts: 4, k: "photo", th: TH }], saved: [{ id: "x", ts: 1 }] };   // a deleted here, c new, p a photo
  const remote = { me: { ...me, nick: "Andere" }, wall: [card("a", 1), card("b", 2), card("d", 5)], saved: [] };                              // d new there, x removed there
  const ch = P.merge(local, remote, base, "code");
  assert.equal(ch.me, undefined, "my own change is not overwritten");
  assert.deepEqual(ch.wall.map((e) => e.id), ["d", "p", "c", "b"]);
  assert.deepEqual(ch.saved, []);
  const same = P.merge(before, P.pack(before, "code"), base, "code");
  assert.deepEqual(same, {}, "nothing to do when both sides agree");
  const theirs = P.merge(before, { ...P.pack(before, "code"), me: { ...me, nick: "Andere" } }, base, "code");
  assert.equal(theirs.me.nick, "Andere", "unchanged here: the other device's style arrives");
});

test("Wand: die Art der Kreation bleibt beim Bereinigen erhalten", () => {
  assert.deepEqual(D.sanitizeWall([{ id: "own", ts: 1, th: TH, k: "photo" }, { id: "own", ts: 2, th: TH, k: "Bad!" }]), [{ id: "own", ts: 1, th: TH, k: "photo" }, { id: "own", ts: 2, th: TH }]);
});

test("Texte: Abschnitt in beiden Sprachen, gleiche Schluessel, kein Druck, Altersgrenze und Fotos klar benannt", () => {
  const T = require("../src/texts.json");
  const keys = (l) => Object.keys(T[l]).filter((k) => k.startsWith("ac_")).sort();
  assert.deepEqual(keys("de"), keys("en"));
  assert.ok(keys("de").length >= 30);
  assert.match(T.de.ac_16, /16/); assert.match(T.en.ac_16, /16/);
  assert.match(T.de.ac_what, /Fotos bleiben auf dem Gerät/); assert.match(T.en.ac_what, /Photos stay on the device/);
  for (const l of ["de", "en"]) for (const k of keys(l)) assert.ok(!/€|\$|countdown|hurry|letzte chance|nur noch/i.test(T[l][k]), k);
});

test("Look-Cookie: nur auf bunsenbrenner.org, nur zwei Farben als Kleinbuchstaben-Hex, sonst Standardfarben", () => {
  const P = require("../src/core.js"), tail = "; Domain=bunsenbrenner.org; Path=/; Max-Age=86400; Secure; SameSite=Lax";
  assert.equal(P.lookCookie(["#2B4BFF", "#ffe600"], "demos-34a13a96.bunsenbrenner.org"), "ct_look=daily.2b4bff.ffe600" + tail);
  assert.equal(P.lookCookie(null, "bunsenbrenner.org"), "ct_look=daily.ffd400.ff3b1d" + tail);
  assert.equal(P.lookCookie(["#fff", "red"], "a.bunsenbrenner.org"), "ct_look=daily.ffd400.ff3b1d" + tail);
  assert.equal(P.lookCookie(['#2b4bff"; Domain=x', "#ffe600"], "a.bunsenbrenner.org"), "ct_look=daily.ffd400.ff3b1d" + tail);
  for (const h of ["", "127.0.0.1", "localhost", "evilbunsenbrenner.org", "bunsenbrenner.org.evil.com"]) assert.equal(P.lookCookie(["#2b4bff", "#ffe600"], h), null, h);
});

test("Vom Server: Wand und Gemerktes werden geprueft wie auf dem Geraet, Fotowerke und Unsinn kommen nicht in den Speicher", () => {
  const s = { me, wall: [], saved: [] };
  const remote = { me, wall: [card("own", 5), { id: "own", ts: 6, k: "photo", th: TH }, { id: "own", ts: "x", k: "card", th: TH }, { id: "own", ts: 7, k: "card", th: PNG }, null],
    saved: [{ id: "quiz-chaos", ts: 1 }, { id: "Bad Id!", ts: 2 }, { id: "x", ts: "3" }], ai: { dev: "5e".repeat(16), proof: { evil: 1 } } };
  const ch = P.merge(s, remote, null, "code");
  assert.deepEqual(ch.wall, [card("own", 5)]);
  assert.deepEqual(ch.saved, [{ id: "quiz-chaos", ts: 1 }]);
  assert.equal(ch.aiDev, "5e".repeat(16)); assert.equal(ch.aiProof, undefined);
});
