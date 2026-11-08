"use strict";
// Dart (spiel-dart, src/dart.js): which field a point is, the 301 rules with bust and double out, the same hits from the
// same seed and inputs, a hand-made link with wrong points counted again, Bert's game, and the size of the link.
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../src/daily.js");
const Tn = require("../src/turns.js");
const C = require("../src/core.js");
const M = require("../src/dart.js");
const me = { emoji: "🐙", nick: "Ana", colors: ["#2b4bff", "#ffe600"], set: "tiere" };
const idea = D.IDEAS.find((i) => i.id === "spiel-dart");
const fresh = (seed) => Tn.fresh(D.docFromIdea(idea, me, "de"), seed);
const through = (d) => { const r = D.parseRoute("#" + D.docUrl(d).split("#")[1]); assert.equal(r.type, "doc"); return r.doc; };
const sc = (x, y) => { const s = M.score(x, y); return [s.n, s.m, s.p]; };
// a point on the board at angle a (degrees clockwise from the top) and radius r
const at = (a, r) => [Math.sin(a * Math.PI / 180) * r, -Math.cos(a * Math.PI / 180) * r];
// The input that lands dart number k exactly on (x, y): t = 0 and straight power, the aim corrected by this dart's wobble and
// scatter (what a perfect hand would do; the quantised aim misses by at most half a thousandth of the radius).
function onto(seed, k, x, y) { const h = M.hand(seed, k), w = M.wobble(h, 0); return M.dart(x - w[0] - h.sx, y - w[1] - h.sy, 32, 0); }
// fields to aim at by name: "T20", "D16", "S5" (outer single), "B" bullseye, "25", "0" beside the board
function spot(f) {
  if (f === "B") return [0, 0]; if (f === "25") return M.centre(25, "o"); if (f === "0") return [1.2, 0.4];
  return M.centre(+f.slice(1), { T: "t", D: "d", S: "s" }[f[0]]);
}
// a string of darts from field names, dart numbers counted from k0
function throws(seed, k0, fields) { return fields.map((f, i) => { const p = spot(f); return M.enc(onto(seed, k0 + i, p[0], p[1])); }).join(""); }
const play = (d, s, claim) => Tn.play(d, [[s, claim == null ? M.claimed(M.sim(d.seed, s)) : claim]], 100);

test("Katalog: Karte spiel-dart vom Typ turn, ohne needs, per Link, in der Suche unter dart, darts und pfeile", () => {
  assert.equal(idea.kind, "turn"); assert.equal(idea.turn.g, "dart"); assert.ok(!idea.needs, "ohne needs: die freie Karte darf sie waehlen (capCheck)");
  assert.ok(!idea.live && idea.kind !== "arcade", "in der Faehigkeiten-Liste (kind turn, nicht live)");
  assert.equal(D.plainTitle(idea.de.t), "Dart im Wohnzimmer"); assert.equal(idea.de.s, "Drei Pfeile. Dann bist du dran.");
  assert.equal(D.plainTitle(idea.en.t), "Darts in the living room");
  for (const q of ["dart", "Darts", "pfeile", "dartscheibe", "dartboard"]) assert.ok(D.searchIdeas(q, new Date("2026-11-08T10:00:00Z")).some((h) => h.idea.id === "spiel-dart"), q);
  assert.ok(Tn.GAMES.dart && Tn.IDS.includes("dart") && Tn.GAMES.dart.part === "dart");
});

test("Feld und Ring fuer feste Punkte: Bull, Bull 25, T20, D16, Rand und daneben", () => {
  assert.deepEqual(sc(0, 0), [25, 2, 50], "Bullseye (zaehlt als Double)");
  assert.deepEqual(sc(0, 0.06), [25, 1, 25], "Bull 25");
  assert.deepEqual(sc(0, -0.606), [20, 3, 60], "T20");
  assert.deepEqual(sc(...at(234, 0.976)), [16, 2, 32], "D16 unten links");
  assert.deepEqual(sc(...at(90, 0.45)), [6, 1, 6], "Single 6 rechts");
  assert.deepEqual(sc(...at(180, 0.8)), [3, 1, 3], "Single 3 unten");
  assert.deepEqual(sc(0, -0.999), [20, 2, 40], "innen am Rand: noch D20");
  assert.deepEqual(sc(0, -1.001), [0, 0, 0], "aussen am Rand: daneben");
  assert.deepEqual(sc(1.2, 0.4), [0, 0, 0], "daneben");
  // the rings at their edges (mm of a tournament board, the double's outer edge is 170 mm)
  assert.deepEqual(sc(0, -98.9 / 170), [20, 1, 20]); assert.deepEqual(sc(0, -99.1 / 170), [20, 3, 60]);
  assert.deepEqual(sc(0, -106.9 / 170), [20, 3, 60]); assert.deepEqual(sc(0, -107.1 / 170), [20, 1, 20]);
  assert.deepEqual(sc(0, -161.9 / 170), [20, 1, 20]); assert.deepEqual(sc(0, -162.1 / 170), [20, 2, 40]);
  assert.deepEqual(sc(0, -6.3 / 170), [25, 2, 50]); assert.deepEqual(sc(0, -6.4 / 170), [25, 1, 25]); assert.deepEqual(sc(0, -16 / 170), [20, 1, 20]);
  // the segment edges at 9° and 18° k + 9°: just either side of the edge between 20 and 1, and between 11 and 8
  assert.deepEqual(sc(...at(8.9, 0.5)), [20, 1, 20]); assert.deepEqual(sc(...at(9.1, 0.5)), [1, 1, 1]);
  assert.deepEqual(sc(...at(350.9, 0.5)), [5, 1, 5]); assert.deepEqual(sc(...at(351.1, 0.5)), [20, 1, 20]);
  assert.deepEqual(sc(...at(260.9, 0.3)), [8, 1, 8]); assert.deepEqual(sc(...at(261.1, 0.3)), [11, 1, 11]);
  // every field's middle, as the list "Aim at" and Bert aim at it
  M.ORDER.forEach((n, i) => {
    assert.deepEqual(sc(...at(18 * i, 0.5)), [n, 1, n], "Zahl " + n + " bei " + 18 * i + "°");
    for (const [r, m] of [["s", 1], ["i", 1], ["t", 3], ["d", 2]]) assert.deepEqual(sc(...M.centre(n, r)), [n, m, n * m], r + n);
  });
  // the board needs no Math.sin: the table of sin 9° k agrees with it
  for (let j = 0; j < 40; j++) assert.ok(Math.abs(M.sd(j) - Math.sin(j * 9 * Math.PI / 180)) < 1e-15, "sin " + 9 * j);
});

test("Wurf: Kraft zu stark fliegt hoch, zu schwach tief; die Hand zittert je Moment anders, der Seed streut", () => {
  const seed = 4242, k = 3, h = M.hand(seed, k), w = M.wobble(h, 0), aim = [0 - w[0] - h.sx, -0.606 - w[1] - h.sy];
  const hit = (p, t) => M.land(seed, k, M.dart(aim[0], aim[1], p, t == null ? 0 : t));
  assert.deepEqual([hit(32).n, hit(32).m], [20, 3], "gerade: T20");
  assert.ok(hit(63).y < hit(32).y - 0.3 && hit(0).y > hit(32).y + 0.3, "zu stark hoeher, zu schwach tiefer");
  assert.notDeepEqual([hit(63).n, hit(63).m], [20, 3], "zu stark: ueber das Triple hinaus"); assert.notDeepEqual([hit(0).n, hit(0).m], [20, 3], "zu schwach: darunter");
  const spots = new Set(); for (let t = 0; t < M.STEPS; t++) { const x = hit(32, t); assert.ok(Math.hypot(x.x - hit(32).x, x.y - hit(32).y) <= 2 * M.WOB + 1e-9); spots.add(Math.round(x.x * 1e4) + "," + Math.round(x.y * 1e4)); }
  assert.ok(spots.size > 50, "die Hand wandert: " + spots.size + " Stellen");
  const other = M.hand(seed + 1, k); assert.notDeepEqual([h.sx, h.sy, h.ph], [other.sx, other.sy, other.ph], "anderer Seed, andere Hand");
  // between two moments the screen draws the line between them; at a whole moment it is that moment
  assert.deepEqual(M.wobble(h, 5), M.wobble(h, 5.0)); const a = M.wobble(h, 5), b = M.wobble(h, 6), m = M.wobble(h, 5.5);
  assert.ok(Math.abs(m[0] - (a[0] + b[0]) / 2) < 1e-12 && Math.abs(m[1] - (a[1] + b[1]) / 2) < 1e-12);
});

test("301 Double-Out: Ausmachen nur mit Double, Bust bei unter null, bei 1 und bei null ohne Double; Einsteiger ohne Double-Out", () => {
  const seed = 777;
  // 301: 60 60 60 | (B) 20 20 20 | 60 60 21 (left 40) | ... | D20 checks out
  let s = "al" + throws(seed, 0, ["T20", "T20", "T20"]);
  let g = M.sim(seed, s); assert.deepEqual([g.left, g.turns[0].pts, g.over], [[121, 301], 180, false]);
  s += throws(seed, 3, ["S20", "S20", "S20"]); g = M.sim(seed, s); assert.deepEqual(g.left, [121, 241]);
  s += throws(seed, 6, ["T20", "T19", "S2"]); g = M.sim(seed, s); assert.deepEqual(g.left, [2, 241]);
  // B: nothing; A on 2: S2 (to 0, not a double) is a bust, the turn ends after that dart
  s += throws(seed, 9, ["0", "0", "0"]); g = M.sim(seed, s);
  s += throws(seed, 12, ["S2"]); g = M.sim(seed, s);
  let t = g.turns[g.turns.length - 1]; assert.deepEqual([t.bust, t.d.length, t.pts, g.left[0], g.partial], [true, 1, 0, 2, false], "0 ohne Double: ueberworfen, zurueck auf 2");
  s += throws(seed, 13, ["S1", "S1", "S1"]); g = M.sim(seed, s);
  s += throws(seed, 16, ["S1"]); g = M.sim(seed, s); t = g.turns[g.turns.length - 1];
  assert.deepEqual([t.bust, t.d.length, g.left[0]], [true, 1, 2], "Rest 1 ist im Double-Out ein Bust");
  s += throws(seed, 17, ["S1", "S1", "S1"]); g = M.sim(seed, s);
  s += throws(seed, 20, ["S5"]); g = M.sim(seed, s); t = g.turns[g.turns.length - 1];
  assert.deepEqual([t.bust, g.left[0]], [true, 2], "unter null: Bust");
  s += throws(seed, 21, ["S1", "S1", "S1"]); g = M.sim(seed, s);
  s += throws(seed, 24, ["0", "D1"]); g = M.sim(seed, s); t = g.turns[g.turns.length - 1];
  assert.deepEqual([t.out, g.over, g.win, g.left[0], t.d.length], [true, true, 0, 0, 2], "D1 auf 2: ausgecheckt");
  assert.ok(!M.sim(seed, s + throws(seed, 26, ["S1"])).extra === false, "nach dem Ende kein Pfeil mehr");
  // the bullseye counts as a double: 50 left, bull out
  let b = "al" + throws(seed, 0, ["T20", "T20", "T20"]) + throws(seed, 3, ["0", "0", "0"]) + throws(seed, 6, ["T19", "T14", "S1"]);   // 301-180-57-42-1 = 21
  assert.equal(M.sim(seed, b).left[0], 21);
  b += throws(seed, 9, ["0", "0", "0"]) + throws(seed, 12, ["S1", "D10"]); g = M.sim(seed, b); assert.deepEqual([g.over, g.win], [true, 0], "21: S1, D10");
  let bull = "al" + throws(seed, 0, ["T20", "T20", "T17"]) + throws(seed, 3, ["0", "0", "0"]) + throws(seed, 6, ["T20", "S10", "B"]);   // 301-171 = 130, -70 = 60? 130-60-10-50 = 10
  g = M.sim(seed, bull); assert.equal(g.left[0], 10);
  let bo = "al" + throws(seed, 0, ["T20", "T20", "T20"]) + throws(seed, 3, ["0", "0", "0"]) + throws(seed, 6, ["T20", "T19", "S4"]) + throws(seed, 9, ["0", "0", "0"]);   // 301-180-121 = 0? -> 301-180=121, 121-60-57-4 = 0 -> S4 to 0 is a bust
  g = M.sim(seed, bo); assert.deepEqual([g.left[0], g.turns[2].bust], [121, true], "ueberworfen: zurueck auf den Stand vor der Aufnahme");
  bo += throws(seed, 12, ["T20", "S11", "B"]); g = M.sim(seed, bo); assert.deepEqual([g.over, g.win, M.field(g.turns[4].d[2], "de")], [true, 0, "Bullseye"], "Bullseye macht aus");
  // beginners: no double out, under zero is still a bust
  let e = "bl" + throws(seed, 0, ["T20", "T20", "T20"]) + throws(seed, 3, ["0", "0", "0"]) + throws(seed, 6, ["T20", "T20", "S5"]);   // 121-125 < 0
  g = M.sim(seed, e); assert.deepEqual([g.left[0], g.turns[2].bust, g.turns[2].d.length], [121, true, 3]);
  e += throws(seed, 9, ["0", "0", "0"]) + throws(seed, 12, ["T20", "T20", "S1"]); g = M.sim(seed, e);
  assert.deepEqual([g.over, g.win, g.left[0]], [true, 0, 0], "Einsteiger: S1 auf 1 macht aus");
  assert.deepEqual(M.sim(seed, "al" + throws(seed, 0, ["T20", "T20", "T20"]) + throws(seed, 3, ["0", "0", "0"]) + throws(seed, 6, ["T20", "T20", "S1"])).left[0], 121, "Double-Out: Rest 0 mit S1 ist Bust");
});

test("Nach zehn Runden entscheidet der Stand; Rund um die Uhr; hoechste Punktzahl in drei Runden", () => {
  const seed = 99;
  let s = "al", k = 0;
  for (let r = 0; r < 20; r++) { s += throws(seed, k, r % 2 ? ["S1", "S1", "S1"] : ["S5", "S5", "S5"]); k += 3; }
  let g = M.sim(seed, s); assert.deepEqual([g.over, g.capped, g.win, g.left], [true, true, 0, [301 - 150, 301 - 30]], "nach 10 Runden: weniger Rest gewinnt");
  assert.equal(M.ok([s + throws(seed, k, ["S1", "S1", "S1"]), 3], fresh(seed), []), false, "danach kein Zug mehr");
  // Around the Clock: 1, 2, 3 in order; a hit on the wrong number does not count, a double or triple of the right one does
  let a = "cl" + throws(seed, 0, ["S1", "S3", "D2"]);
  g = M.sim(seed, a); assert.deepEqual([g.next[0], g.turns[0].pts], [3, 2]);
  a += throws(seed, 3, ["S1", "S2", "S3"]); g = M.sim(seed, a); assert.equal(g.next[1], 4);
  let full = "cl", kk = 0;
  for (let n = 1; n <= 20; n += 3) { const f = [n, n + 1, n + 2].map((x) => (x <= 20 ? "S" + x : "0")); full += throws(seed, kk, f); kk += 3; if (n + 2 >= 20) break; full += throws(seed, kk, ["0", "0", "0"]); kk += 3; }
  g = M.sim(seed, full); assert.deepEqual([g.over, g.win, g.next[0]], [true, 0, 21], "rundum: 1 bis 20");
  // highest score: three rounds each
  let hs = "dl", kh = 0;
  for (let r = 0; r < 6; r++) { hs += throws(seed, kh, r % 2 ? ["T19", "T19", "T19"] : ["T20", "T20", "T20"]); kh += 3; }
  g = M.sim(seed, hs); assert.deepEqual([g.over, g.capped, g.win, g.total], [true, false, 0, [540, 513]]);
  assert.equal(M.sim(seed, "dl" + throws(seed, 0, ["T20", "T20", "T20"])).over, false);
});

test("Determinismus: gleicher Seed und gleiche Eingaben ergeben dieselben Treffer, auf jedem Weg durch den Link", () => {
  const ins = [];
  const r = C.mulberry32(5);
  for (let i = 0; i < 60; i++) ins.push(M.dart((r() - 0.5) * 2, (r() - 0.5) * 2, r() * 63, r() * 63));
  const s = "dl" + ins.slice(0, 18).map(M.enc).join("");
  const a = M.sim(31337, s), b = M.sim(31337, s);
  assert.deepEqual(a, b);
  assert.deepEqual(M.sim(31337, s).turns.map((t) => t.d.map((h) => [h.n, h.m, h.p])), b.turns.map((t) => t.d.map((h) => [h.n, h.m, h.p])));
  assert.notDeepEqual(M.sim(31338, s).turns.map((t) => t.d.map((h) => h.x)), a.turns.map((t) => t.d.map((h) => h.x)), "anderer Seed, andere Treffer");
  // encoding round trip
  ins.forEach((d) => assert.deepEqual(M.dec(M.enc(d))[0], d));
  // through real links, turn by turn: the receiving phone gets the same hits as the throwing one
  let d = fresh(123456), k = 0, played = "dl";
  for (let turn = 0; turn < 6; turn++) {
    const add = ins.slice(k, k + 3).map(M.enc).join(""); k += 3; played += add;
    const n = play(d, played); assert.ok(n, "Zug " + turn); d = through(n);
    const g = M.gameOf(d, Tn.moves(d)); assert.deepEqual(g.turns.map((t) => t.d.map((h) => [h.x, h.y])), M.sim(123456, played).turns.map((t) => t.d.map((h) => [h.x, h.y])));
  }
  assert.ok(Tn.state(d).over, "nach drei Runden je Person aus"); assert.match(Tn.result(d, "de").h, /gewinnt|Unentschieden/);
  // Bert throws the same on every phone: his darts come from the seed and the state, not from a clock
  const bot = "ab" + throws(777, 0, ["T20", "T20", "T20"]);
  assert.deepEqual(M.sim(777, bot).turns[1].d.map((h) => h.d), M.sim(777, bot).turns[1].d.map((h) => h.d));
  assert.equal(M.sim(777, bot).turns.length, 2, "nach meiner Aufnahme wirft Bert sofort seine");
});

test("Manipulierter Link: falsche Punkte werden nachgerechnet und korrigiert, veraenderte Wuerfe gelten nicht", () => {
  const seed = 2026, d0 = fresh(seed), s = "al" + throws(seed, 0, ["T20", "S5", "S1"]);
  const real = M.sim(seed, s).turns[0].pts; assert.equal(real, 66);
  // the thrower's phone claims 180: the move stays (its darts are fine), the points are counted again from the darts
  const forged = through(play(d0, s, 180));
  assert.equal(Tn.moves(forged).length, 1, "der Zug bleibt");
  const face = Tn.face(forged, "de");
  assert.deepEqual(face.slice(1), ["Spieler 1: 235 Rest · Spieler 2: 301 Rest", "Spieler 1: T20 · 5 · 1 = 66 Punkte", "Im Link standen 180 Punkte, nachgerechnet sind es 66."]);
  assert.equal(M.gameOf(forged, Tn.moves(forged)).left[0], 235, "gezaehlt wird, was die Pfeile treffen");
  const honest = through(play(d0, s)); assert.equal(Tn.face(honest, "de").length, 3, "ehrlicher Link: kein Hinweis");
  assert.equal(Tn.face(through(play(d0, s, 180)), "en")[3], "The link said 180 points; counted again it is 66.");
  // a hand-made move: claims taken apart from the darts never count, broken darts or a rewritten past are no move
  const raw = (v) => { const x = JSON.parse(JSON.stringify(d0)); x.q = Tn.seal([[v]], seed); return through(x); };
  assert.equal(Tn.moves(raw([s, 999])).length, 1);
  assert.equal(Tn.moves(raw([s, 1000])).length, 0, "Behauptung ausserhalb 0..999");
  assert.equal(Tn.moves(raw([s.slice(0, -1), 66])).length, 0, "halber Pfeil");
  assert.equal(Tn.moves(raw([s.slice(0, -6), 66])).length, 0, "zwei Pfeile ohne Bust: die Aufnahme ist nicht fertig");
  assert.equal(Tn.moves(raw([s + throws(seed, 3, ["S1"]), 66])).length, 0, "ein Pfeil zu viel");
  assert.equal(Tn.moves(raw(["xl" + s.slice(2), 66])).length, 0, "kein Spiel");
  assert.equal(Tn.play(d0, [[s + throws(seed, 3, ["S1", "S1", "S1"]), 66]], 100), null, "zwei Aufnahmen auf einmal als neuer Zug");
  assert.equal(Tn.moves(raw([s + throws(seed, 3, ["S1", "S1", "S1"]), 66])).length, 1, "ein gelesener Link mit zwei Aufnahmen ist ein Spielstand (snap)");
  // B's answer has to keep A's darts as they were
  const b1 = s + throws(seed, 3, ["S20", "S20", "S20"]), ok = Tn.play(honest, [[b1, 60]], 100);
  assert.ok(ok, "B antwortet");
  const other = "al" + throws(seed, 0, ["T20", "T20", "T20"]) + throws(seed, 3, ["S20", "S20", "S20"]);
  assert.equal(Tn.play(honest, [[other, 60]], 100), null, "As Wuerfe umgeschrieben: kein Zug");
  // the score is never read from the link: a changed dart is a changed hit, counted as such
  const changed = s.slice(0, 2) + throws(seed, 0, ["0"]) + s.slice(8);
  const g2 = M.sim(seed, changed); assert.equal(g2.turns[0].pts, 6); assert.equal(Tn.face(through(play(d0, changed, 66)), "de")[3], "Im Link standen 66 Punkte, nachgerechnet sind es 6.");
  // in the result the correction stands too
  let r = "dl"; for (let t = 0; t < 6; t++) r += throws(seed, t * 3, ["T20", "T20", "T20"]);
  let doc = d0; for (let t = 0; t < 6; t++) doc = through(Tn.play(doc, [[r.slice(0, 2 + 18 * (t + 1)), t === 5 ? 9 : 180]], 100));
  const res = Tn.result(doc, "de"); assert.equal(res.h, "Unentschieden!"); assert.equal(res.lines[res.lines.length - 1], "Im Link standen 9 Punkte, nachgerechnet sind es 180.");
});

test("Gegen Bert: ein Zug mit allen eigenen Wuerfen, Bert rechnet jedes Handy gleich nach, nur fertige Spiele", () => {
  const seed = 5150;
  // my darts one by one, as the screen takes them: after a bust or the end no further dart of mine is thrown
  let s = "ab", g = M.sim(seed, s);
  while (!g.over) { s += throws(seed, g.k, ["T20"]); g = M.sim(seed, s); }
  // only my darts are in the string; Bert's come from seed and state
  assert.ok(g.over); assert.equal((s.length - 2) / 6, g.turns.filter((t) => t.p === 0).reduce((a, t) => a + t.d.length, 0));
  const d = through(play(fresh(seed), s)); assert.ok(Tn.state(d).over);
  const res = Tn.result(d, "de"); assert.match(res.h, /^(Du schlägst Bert!|Bert gewinnt\. Revanche\?|Unentschieden!)$/);
  assert.match(res.lines[1], /^Du: \d+ Rest · Bert \(Bot\): \d+ Rest$/);
  assert.equal(Tn.play(fresh(seed), [["ab" + throws(seed, 0, ["T20", "T20", "T20"]), 180]], 100), null, "kein halbes Spiel gegen Bert im Link");
  // Bert never adapts: the same aim for the same standing, whoever leads
  assert.deepEqual(M.aimFor({ kind: "x01", mode: "a", left: [301, 40] }, 1), { n: 20, r: "d" });
  assert.deepEqual(M.aimFor({ kind: "x01", mode: "a", left: [2, 40] }, 1), { n: 20, r: "d" });
  assert.deepEqual(M.aimFor({ kind: "x01", mode: "a", left: [0, 41] }, 1), { n: 1, r: "s" });
  assert.deepEqual(M.aimFor({ kind: "x01", mode: "a", left: [0, 50] }, 1), { n: 25, r: "b" });
  assert.deepEqual(M.aimFor({ kind: "atc", next: [1, 7] }, 1), { n: 7, r: "s" });
  assert.equal(Tn.who("dart"), "link");
});

test("Link: ein volles Spiel (zehn Runden je Person, drei Pfeile) passt in den Link, und Bert-Spiele auch", () => {
  let d = fresh(4294967295), s = "al";
  for (let t = 0; t < 20; t++) { s += throws(4294967295, t * 3, ["S1", "S1", "S1"]); const n = Tn.play(d, [[s, 3]], 100); assert.ok(n, "Zug " + t); const u = D.docUrl(n), f = u.split("#c=")[1]; assert.ok(f.length <= C.MAX_FRAGMENT, t + ": " + f.length); d = through(n); }
  assert.ok(Tn.state(d).over); assert.equal(s.length, M.MAXLEN);
  assert.ok(D.docUrl(d).split("#c=")[1].length <= C.MAX_FRAGMENT);
  assert.equal(M.sim(1, s + "AAAAAA"), null, "laenger als ein volles Spiel: kein Spiel");
});

test("Texte: de und en mit denselben Schluesseln, Ansage wie \"Triple 20, 60 Punkte\"", () => {
  const J = require("../src/dart.json");
  assert.deepEqual(Object.keys(J.text.de).sort(), Object.keys(J.text.en).sort()); assert.equal(J.quips.de.length, J.quips.en.length);
  const h = M.score(0, -0.606);
  assert.equal(M.spoken(h, "de"), "Triple 20, 60 Punkte"); assert.equal(M.spoken(h, "en"), "Triple 20, 60 points");
  assert.equal(M.spoken(M.score(0, 0), "de"), "Bullseye, 50 Punkte"); assert.equal(M.spoken(M.score(2, 2), "de"), "Daneben, 0 Punkte");
  assert.equal(M.spoken(M.score(...at(18, 0.5)), "de"), "Single 1, 1 Punkt"); assert.equal(M.spoken(M.score(...at(234, 0.976)), "en"), "Double 16, 32 points");
  assert.equal(M.short(h, "de"), "T20"); assert.equal(M.short(M.score(0, 0), "de"), "Bull");
});
