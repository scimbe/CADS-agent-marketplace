"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../src/daily.js");
const W = require("../src/wish.js");
const me = { emoji: "🐙", nick: "M", colors: ["#2b4bff", "#ffe600"], set: "tiere" };
const PAIRS = [["#ffd400", "#ff3b1d"], ["#2b4bff", "#ffe600"]];
const rand = () => 0.5;
const of = (k) => D.docFromIdea(D.IDEAS.find((i) => i.kind === k), me, "de");

test("Anfrage: nur Typ, Wunsch, Grundidee und Texte; kein Bild, keine Sticker, keine Spur", () => {
  const d = of("photo"), r = W.request(d, "lustiger", "Idee");
  assert.deepEqual(Object.keys(r).sort(), ["idea", "now", "type", "wish"]);
  assert.deepEqual(Object.keys(r.now).sort(), ["bpm", "st", "x", "y"]);
  assert.deepEqual(Object.keys(W.request(of("game"), "x").now), ["title"]);
});
test("Anwenden: nur Felder des Typs wirken, Ergebnis ist bereinigt, Original bleibt unberuehrt", () => {
  const d = of("card"), before = JSON.stringify(d);
  const n = W.apply(d, { x: "Neu", st: "neon", palette: 1, stickers: ["🐸"], gravity: 2000, bpm: 150, y: "weg" }, PAIRS, rand);
  assert.equal(n.x, "Neu"); assert.equal(n.st, "neon"); assert.deepEqual(n.col, PAIRS[1]); assert.equal(n.sk.length, 1);
  assert.equal(n.y, undefined); assert.equal(n.bpm, undefined); assert.equal(n.g, undefined);
  assert.equal(JSON.stringify(d), before);
  const g = W.apply(of("game"), { gravity: 99999, theme: "lava", emoji: "🚀", title: "Lava", x: "weg" }, PAIRS, rand);
  assert.equal(g.g.params.gravity, 2600, "Bereinigung klemmt auch ohne Server"); assert.equal(g.g.theme, "lava"); assert.equal(g.x, undefined);
  const s = W.apply(of("sound"), { bpm: 150, k: "x-x-x-x-x-x-x-x-", palette: 0 }, PAIRS, rand);
  assert.equal(s.bpm, 150); assert.equal(s.p.k, "x-x-x-x-x-x-x-x-");
  assert.equal(W.apply(d, { st: "kaputt" }, PAIRS, rand).st, "druck", "unbekannter Stil faellt zurueck");
});
test("Lokal: jede Mechanik aendert sichtbar etwas ohne Server", () => {
  for (const k of W.KINDS) {
    const d = of(k), n = W.apply(d, W.local(d, "viel schwerer und schnell", "de", () => 1), [PAIRS[0], PAIRS[1]], rand);
    assert.ok(D.changedAreas(d, n).length, k);
  }
});
test("Wetter: Wunsch kann die Zahlen nie aendern, kaputte Werte fallen weg, Text bleibt daneben frei", () => {
  const w = { p: "Hamburg", d: "2026-11-02", hi: 12, lo: 7, rn: 40, c: 61 }, d = D.sanitizeDoc({ k: "card", x: "Hallo", col: ["#ffd400", "#ff3b1d"], w });
  assert.deepEqual(d.w, w);
  const n = W.apply(d, { x: "Neu", w: { hi: 99 }, hi: 99, lo: 99, rn: 99 }, PAIRS, rand);
  assert.deepEqual(n.w, w); assert.equal(n.x, "Neu");
  assert.equal(D.sanitizeDoc({ k: "card", w: { p: "x", d: "kaputt", hi: 1, lo: 1 } }).w, undefined);
  assert.equal(D.sanitizeDoc({ k: "card", w: { p: "fuck", d: "2026-11-02", hi: 1, lo: 1 } }).w, undefined);
  assert.equal(D.sanitizeDoc({ k: "card", w: { p: "x", d: "2026-11-02", hi: "viel", lo: 1 } }).w, undefined);
  assert.equal(D.changedAreas(D.sanitizeDoc({ k: "card" }), d).includes("text"), true);
});
test("Grenze: Duell und Geheimkanal haben keinen Wunsch, ihre Texte gehen nicht an den Server", () => {
  assert.deepEqual([...W.KINDS].sort(), D.KINDS.filter((k) => k !== "duel" && k !== "quest").sort());
  assert.match(require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/app.js"), "utf8"), /W\.KINDS\.indexOf\(ed\.doc\.k\) >= 0 \? \["Wish"\] : \[\]/);
});
