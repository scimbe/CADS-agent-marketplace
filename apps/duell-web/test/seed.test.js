"use strict";
// Random only from the seed (rule against dark patterns): bot face, "Roll a rival" and the bot's hand in Mind read
// read their chance from the sheet's seed, never from Math.random or the clock (I13 of the editor concept).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const D = require("../src/daily.js");
const Duel = require("../src/duel.js");
const DD = require("../src/duel.json");
const src = (f) => fs.readFileSync(path.join(__dirname, "../src", f), "utf8");
function noRandom(fn) { const r = Math.random, now = Date.now; Math.random = () => { throw new Error("Math.random"); }; Date.now = () => { throw new Error("Date.now"); }; try { return fn(); } finally { Math.random = r; Date.now = now; } }

test("Bot-Gesicht (blasen.js, Reiter Foto): gleicher Name, gleiches Blatt, gleicher Tipp = gleiches Gesicht; der naechste Tipp ein anderes", () => {
  const doc = { k: "photo", i: "foto-x" };
  const a = noRandom(() => D.botSeed("Mira", doc, 1)), b = noRandom(() => D.botSeed("Mira", doc, 1));
  assert.equal(a, b); assert.notEqual(a, D.botSeed("Mira", doc, 2)); assert.notEqual(a, D.botSeed("Ben", doc, 1));
  assert.equal(D.botSeed("Mira", { k: "photo" }, 0), D.botSeed("Mira", { k: "photo" }, 0), "eigene Karte ohne Id: Art statt Id");
  assert.ok(Number.isInteger(a) && a >= 0);
  assert.match(src("blasen.js"), /R\.botFace\(D\.botSeed\(A\.me\(\)\.nick, ed\(\)\.doc, ed\(\)\.bots\)/);   // the photo tab, since R4 in the part blasen assert.match(src("app.js"), /R\.botFace\(D\.botSeed\(me\.nick, ed\.doc, 0\)/);
});
test("Gegner wuerfeln (modes.js:113): n-ter Wurf eines Seeds gibt immer denselben Gegner, Werte 0-100, Name und Emoji aus den Listen", () => {
  const L = DD.rivals.de, E = DD.emoji, seen = new Set();
  for (let n = 1; n <= 30; n++) {
    const r = noRandom(() => Duel.rival(4242, n, L, E));
    assert.deepEqual(r, Duel.rival(4242, n, L, E)); assert.ok(L.includes(r.n) && E.includes(r.e));
    for (const k of ["r", "c", "p"]) assert.ok(Number.isInteger(r[k]) && r[k] >= 0 && r[k] <= 100);
    seen.add(JSON.stringify(r));
  }
  assert.ok(seen.size > 20, "verschiedene Wuerfe geben verschiedene Gegner");
  assert.notDeepEqual(Duel.rival(1, 1, L, E), Duel.rival(2, 1, L, E));
  assert.match(src("modes.js"), /Duel\.rival\(d\.seed, ed\.rolls,/);
});
test("Mind (modes.js:236): die Hand des Bots kommt aus dem Seed des Blatts; gleiche Zuege, gleiche Antworten", () => {
  const doc = Duel.sanitize({ k: "duel", m: "mind", seed: 77, a: { n: "A", e: "🐸", r: 50, c: 50, p: 50 }, b: { n: "B", e: "🤖", r: 50, c: 70, p: 50 } }, { k: "duel" });
  const play = () => noRandom(() => { const rnd = Duel.rng(doc), hist = [], out = []; for (const i of [0, 1, 2, 0, 0, 1, 2, 2]) { out.push(Duel.mindHand(hist, doc.b.c, rnd())); hist.push(i); } return out; });
  const a = play(); assert.deepEqual(a, play());
  assert.ok(a.every((h) => h >= 0 && h <= 2));
  assert.match(src("modes.js"), /Duel\.mindHand\(hist, d\.b\.c, rnd\(\)\)/);
});
test("Wohlfuehlkarte zurueck (warm.js) und Bot-Spiele (arcade-ui.js): aus dem Seed, nicht aus Math.random", () => {
  const Wm = require("../src/warm.js");
  const doc = { k: "card", i: Wm.list()[0].id, n: "Ana", x: "Du bist toll" };
  const a = noRandom(() => Wm.answer(doc));
  assert.equal(a, Wm.answer(doc)); assert.notEqual(a.id, doc.i); assert.ok(a.warm);
  // Redesign W1: the reply fits the card that came (catalog field re), so another sender gets the same fitting card
  assert.equal(new Set(["A", "B", "C", "D", "E", "F", "G", "H"].map((n) => Wm.answer(Object.assign({}, doc, { n })).id)).size, 1, "Bezug zum Inhalt, nicht zum Namen");
  assert.ok(Wm.answers(doc).map((x) => x.id).includes(a.id));
  assert.doesNotMatch(src("warm.js").replace(/\/\/[^\n]*/g, ""), /Math\.random/);
  const arc = src("arcade-ui.js").replace(/\/\/[^\n]*/g, "");
  assert.match(arc, /"bot\|" \+ g \+ "\|" \+ \(Kit\.store\.arcN = /); assert.match(arc, /fresh\(seed \+ "\|" \+ \+\+round\)/);
  for (const l of arc.split("\n").filter((x) => /Math\.random/.test(x))) assert.match(l, /P\.add|rnd\(a, b\)|d\[i\] =/, "nur Partikel und Rauschen: " + l.trim().slice(0, 80));
});
test("Kein Math.random mehr in app.js, modes.js und blasen.js (auch nicht beim Ersatzblatt eines Tages ohne Idee)", () => {
  for (const f of ["app.js", "modes.js", "blasen.js"]) assert.doesNotMatch(src(f).replace(/\/\/[^\n]*/g, ""), /Math\.random/, f);
  for (const f of ["app.js", "blasen.js"]) assert.doesNotMatch(src(f), /botFace\([^)]*Date\.now/, "das Bot-Gesicht haengt nicht an der Uhr");
});
