"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../src/daily.js");
const Wm = require("../src/warm.js");
const Wish = require("../src/wish.js");
const T = require("../src/texts.json");
const me = D.sanitizeProfile({ nick: "Ana" });

test("Wohlfuehlkarten: mindestens 8, jede mit eigenem Motiv, warmem Stil und Saetzen in beiden Sprachen", () => {
  const l = Wm.list();
  assert.ok(l.length >= 8);
  assert.equal(new Set(l.map((i) => i.warm)).size, l.length, "jedes Kartenbild eigen");
  for (const i of l) {
    assert.equal(i.kind, "card"); assert.equal(i.style, "herz"); assert.ok(Wm.MOTIFS.includes(i.warm), i.id);
    for (const lang of ["de", "en"]) for (const s of i[lang].lines) { assert.ok(s.length <= 70, s); assert.equal(D.cleanInput(s, 90), s, s); }
    const d = D.docFromIdea(i, me, "de"); assert.equal(d.st, "herz"); assert.deepEqual(d.col, i.col); assert.ok(Wm.is(d));
  }
});
test("Wohlfuehlkarten im Kalender: 8 Tage, keiner neben einer anderen Karte, Spiel und Kommunikation wechseln", () => {
  const days = Wm.list().filter((i) => i.on);
  assert.ok(days.length >= 8);
  for (const i of days) {
    const day = new Date("2026-" + i.on + "T12:00:00Z");
    assert.equal(D.ideaForDay(day).id, i.id);
    for (const n of [-1, 1]) assert.notEqual(D.ideaForDay(new Date(day.getTime() + n * 86400000)).kind, "card", i.on);
  }
});
test("Name des Empfaengers: vorn eingesetzt, nur ein Vorname, Wortfilter greift", () => {
  assert.equal(Wm.named("Du bist toll.", "Lea"), "Lea, du bist toll.");
  assert.equal(Wm.named("I'm proud of you.", "Lea"), "Lea, I'm proud of you.");
  assert.equal(Wm.named("Du bist toll.", ""), "Du bist toll.");
  assert.equal(Wm.name("  Lea  "), "Lea"); assert.equal(Wm.name(""), "");
  for (const bad of ["Arschloch", "@lea", "0170 123456", "lea.de/x", "<b>"]) assert.equal(Wm.name(bad), null, bad);
  assert.equal(Wm.named("Du bist toll.", "Arschloch"), "Du bist toll.", "keine versteckte Beleidigung");
  const d = Wm.cardFor(D.byId("warm-toll"), "Lea", me, "de");
  assert.match(d.x, /^Lea, ich wollte dir nur mal sagen/); assert.equal(d.n, "Ana");
});
test("Antwort: eine andere Wohlfuehlkarte, an den Absender; Link traegt Stil und Text", () => {
  const d = D.withTrail(Wm.cardFor(D.byId("warm-danke"), "Lea", me, "de"), "Ana", ["text"]);
  const r = D.parseRoute(D.docUrl(d).split("#")[1]);
  assert.equal(r.doc.st, "herz"); assert.equal(r.doc.x, d.x); assert.equal(Wm.sender(r.doc), "Ana");
  for (let k = 0; k < 20; k++) { const n = Wm.reply(r.doc, () => k / 20); assert.ok(n.warm); assert.notEqual(n.id, "warm-danke"); }
});
test("Wuerfel statt KI-Wunsch: Karte bleibt warm, Name im Text bleibt, Sticker aus dem Herz-Set", () => {
  const d = D.docFromIdea(D.byId("warm-toll"), me, "de");
  const w = Wish.apply(d, { x: "Lea, mit dir ist jeder Tag besser.", st: "neon" }, [], () => 0.5);
  assert.equal(w.st, "herz"); assert.equal(w.x, "Lea, mit dir ist jeder Tag besser.");
  const pairs = [["#ffd400", "#ff3b1d"], ["#2b4bff", "#ffe600"]], ch = Wish.dice(d, "warm-toll|1", pairs, null), r = Wish.apply(d, ch, pairs, () => 0.5);
  assert.equal(r.st, "herz"); assert.equal(r.x, d.x); assert.ok(r.sk.length && r.sk.every((s) => D.SETS.herz.includes(s.e)));
  assert.equal(Wish.local, undefined, "kein KI-Ersatz, der wie eine Antwort aussieht");
});
test("Kein Kettenbrief: keine Weiterschick-Aufforderung, kein Zaehler in Texten und Code", () => {
  const fs = require("node:fs"), path = require("node:path");
  const all = JSON.stringify(Wm.list()) + JSON.stringify(Object.keys(T.de).filter((k) => /^warm_/.test(k)).map((k) => [T.de[k], T.en[k]])) + fs.readFileSync(path.join(__dirname, "../src/warm.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.ok(!/an \d+ leute|weiterschicken|weiterleiten|send (it )?to \d+|forward this|streak|counter|z(ä|ae)hler/i.test(all));
});
