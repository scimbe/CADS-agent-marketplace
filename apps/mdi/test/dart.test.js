// Dart (spiel-dart), portiert aus alt:test/dart.test.js (Alt-Orakel). Regelrelevante Faelle 1:1; Faelle zu Katalog,
// Doc-Links (Tn.play/through/docUrl), DOM und Build stehen im PR unter "nicht portiert" bzw. sind in Karten- und
// Vertragstests (dart-card.test.js) neu abgebildet.
import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/engines/dart/dart.js";
import { mulberry32 } from "../src/engines/seed32/seed32.js";

const sc = (x, y) => { const s = M.score(x, y); return [s.n, s.m, s.p]; };
const at = (a, r) => [Math.sin(a * Math.PI / 180) * r, -Math.cos(a * Math.PI / 180) * r];
function onto(seed, k, x, y) { const h = M.hand(seed, k); return M.dart(x - h.sx, y - h.sy, M.MID); }
function spot(f) {
  if (f === "B") return [0, 0]; if (f === "25") return M.centre(25, "o"); if (f === "0") return [1.2, 0.4];
  return M.centre(+f.slice(1), { T: "t", D: "d", S: "s" }[f[0]]);
}
function throws(seed, k0, fields) { return fields.map((f, i) => { const p = spot(f); return M.enc(onto(seed, k0 + i, p[0], p[1])); }).join(""); }
const NAMES = ["Ana", "Ben"];
// Was ein Geraet ohne eigenen Speicher zu einem Zug sieht (alt Tn.face/Tn.result auf einem dritten Handy)
const sight = (seed, v, own) => M.counted(seed, v, own || null);
const faceOf = (seed, s, claim, names, lang = "de", own) => M.face(sight(seed, [s, claim === undefined || claim === null ? M.claimed(M.sim(seed, s)) : claim, names || NAMES], own), lang);
function person(seed, mode, pr, bot) {
  let s = M.head(mode, bot);
  for (let i = 0; i < 400; i++) {
    const g = M.sim(seed, s); if (g.over) return g;
    const p = g.partial ? g.turns[g.turns.length - 1].p : g.turns.length % 2, aim = M.aimFor(g, p), c = M.centre(aim.n, aim.r), u = mulberry32(seed * 131 + g.k)();
    s += M.enc(M.dart(c[0], c[1], u < pr ? M.MID : u < (1 + pr) / 2 ? M.MID - 1 : M.MID + 1));
  }
  throw new Error("kein Ende");
}
function share(aimAt, p, f, N) { let n = 0; for (let i = 0; i < N; i++) if (f(M.land(31000 + i, i % 60, M.dart(aimAt[0], aimAt[1], p)))) n++; return n / N; }
function fieldName(at) { return at.r === "d" ? "D" + at.n : at.r === "t" ? "T" + at.n : at.n === 25 ? "B" : "S" + at.n; }

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
  assert.deepEqual(sc(0, -98.9 / 170), [20, 1, 20]); assert.deepEqual(sc(0, -99.1 / 170), [20, 3, 60]);
  assert.deepEqual(sc(0, -106.9 / 170), [20, 3, 60]); assert.deepEqual(sc(0, -107.1 / 170), [20, 1, 20]);
  assert.deepEqual(sc(0, -161.9 / 170), [20, 1, 20]); assert.deepEqual(sc(0, -162.1 / 170), [20, 2, 40]);
  assert.deepEqual(sc(0, -6.3 / 170), [25, 2, 50]); assert.deepEqual(sc(0, -6.4 / 170), [25, 1, 25]); assert.deepEqual(sc(0, -16 / 170), [20, 1, 20]);
  assert.deepEqual(sc(...at(8.9, 0.5)), [20, 1, 20]); assert.deepEqual(sc(...at(9.1, 0.5)), [1, 1, 1]);
  assert.deepEqual(sc(...at(350.9, 0.5)), [5, 1, 5]); assert.deepEqual(sc(...at(351.1, 0.5)), [20, 1, 20]);
  assert.deepEqual(sc(...at(260.9, 0.3)), [8, 1, 8]); assert.deepEqual(sc(...at(261.1, 0.3)), [11, 1, 11]);
  M.ORDER.forEach((n, i) => {
    assert.deepEqual(sc(...at(18 * i, 0.5)), [n, 1, n], "Zahl " + n + " bei " + 18 * i + "°");
    for (const [r, m] of [["s", 1], ["i", 1], ["t", 3], ["d", 2]]) assert.deepEqual(sc(...M.centre(n, r)), [n, m, n * m], r + n);
  });
  for (let j = 0; j < 40; j++) assert.ok(Math.abs(M.sd(j) - Math.sin(j * 9 * Math.PI / 180)) < 1e-15, "sin " + 9 * j);
});

test("Wurf: Kraft in 9 Stufen, zu stark fliegt hoch, zu schwach tief; der Moment aendert nichts, der Seed streut", () => {
  const seed = 4242, k = 3, h = M.hand(seed, k), aim = [0 - h.sx, -0.606 - h.sy];
  const hit = (p) => M.land(seed, k, M.dart(aim[0], aim[1], p));
  assert.deepEqual([hit(M.MID).n, hit(M.MID).m], [20, 3], "gerade: T20");
  assert.ok(hit(8).y < hit(M.MID).y - 0.2 && hit(0).y > hit(M.MID).y + 0.2, "zu stark hoeher, zu schwach tiefer");
  assert.notDeepEqual([hit(8).n, hit(8).m], [20, 3]); assert.notDeepEqual([hit(0).n, hit(0).m], [20, 3]);
  assert.deepEqual(Object.keys(M.dec(M.enc(M.dart(0, 0, 4)))[0]).sort(), ["ax", "ay", "p"]);
  assert.equal(M.dec("AAAAS"), null, "Stufe 18 gibt es nicht"); assert.deepEqual(M.dec("AAAAJ")[0], { ax: 0, ay: 0, p: 0, f: 1 }, "9..17: Regler");
  const other = M.hand(seed + 1, k); assert.notDeepEqual([h.sx, h.sy, h.ph], [other.sx, other.sy, other.ph], "anderer Seed, andere Hand");
  assert.deepEqual(M.wobble(h, 5), M.wobble(h, 5.0)); const a = M.wobble(h, 5), b = M.wobble(h, 6), m = M.wobble(h, 5.5);
  assert.ok(Math.abs(m[0] - (a[0] + b[0]) / 2) < 1e-12 && Math.abs(m[1] - (a[1] + b[1]) / 2) < 1e-12);
});

test("Verteilung ueber 1000 seeded Wuerfe: Kneipenniveau, T20 10-20 %, Segment 20 60-75 %", () => {
  const N = 1000, T20 = M.centre(20, "t");
  const t20 = share(T20, M.MID, (h) => h.n === 20 && h.m === 3, N), s20 = share(T20, M.MID, (h) => h.n === 20, N);
  assert.ok(t20 >= 0.10 && t20 <= 0.20, "T20 " + t20); assert.ok(s20 >= 0.60 && s20 <= 0.75, "Segment 20 " + s20);
  const bull = share(M.centre(25, "b"), M.MID, (h) => h.n === 25 && h.m === 2, N); assert.ok(bull >= 0.04 && bull <= 0.14, "Bullseye " + bull);
  const d16 = share(M.centre(16, "d"), M.MID, (h) => h.n === 16 && h.m === 2, N); assert.ok(d16 >= 0.12 && d16 <= 0.26, "D16 " + d16);
  const s7 = share(M.centre(7, "s"), M.MID, (h) => h.n === 7, N); assert.ok(s7 >= 0.6 && s7 <= 0.8, "Segment 7 " + s7);
  assert.ok(share(T20, M.MID + 2, (h) => h.n === 20 && h.m === 3, N) < t20 && share(T20, M.MID - 2, (h) => h.n === 20 && h.m === 3, N) < t20);
  const xs = []; for (let i = 0; i < N; i++) xs.push(M.hand(500 + i, i % 60).sx);
  const sd = Math.sqrt(xs.reduce((a, v) => a + v * v, 0) / N) * 170; assert.ok(sd > 13 && sd < 17.5, "sd " + sd.toFixed(1) + " mm");
});

test("Kein Exploit: die Kraft pendelt ohne Saettigung, ein kurzer Tipp gibt keine feste Stufe, starke Kraft mit tieferem Zielen bringt nichts", () => {
  const seen = new Set(); for (let ms = 0; ms < 10000; ms += M.SWING) seen.add(M.swing(2, ms));
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  for (const ms of [5000, 10000, 30000]) { const c = new Set(); for (let i = 0; i < 16; i++) c.add(M.swing(0, ms + i * M.SWING)); assert.equal(c.size, 9, "pendelt weiter bei " + ms); }
  assert.ok(M.swing(0, 60000) < 8 || M.swing(0, 60000 + M.SWING) < 8, "keine Saettigung");
  const starts = new Set(); for (let k = 0; k < 60; k++) starts.add(M.hand(77, k).lv); assert.ok(starts.size >= 8, "Startstufen " + starts.size);
  assert.ok(M.QUICK >= 100);
  const T20 = M.centre(20, "t"), base = share(T20, M.MID, (h) => h.n === 20 && h.m === 3, 1000);
  for (const p of [0, 8]) { const aim = [T20[0], T20[1] + (p - M.MID) * M.POWER]; assert.ok(Math.abs(share(aim, p, (h) => h.n === 20 && h.m === 3, 1000) - base) < 0.005, "Stufe " + p); }
});

test("Mensch gegen Bert bei normaler Spielweise 40-60 %, und wer beginnt, hat keinen festen Vorteil", () => {
  const N = 300;
  for (const mode of ["a", "b", "c", "d"]) {
    let w = 0, l = 0; for (let i = 0; i < N; i++) { const g = person(60000 + i, mode, 0.6, true); if (g.win === 0) w++; else if (g.win === 1) l++; }
    const x = w / (w + l); assert.ok(x >= 0.4 && x <= 0.6, mode + ": Mensch " + x.toFixed(2));
  }
  for (const mode of ["a", "c"]) {
    let w = 0, l = 0; for (let i = 0; i < N; i++) { const g = person(80000 + i, mode, 0.6, false); if (g.win === 0) w++; else if (g.win === 1) l++; }
    const x = w / (w + l); assert.ok(x >= 0.4 && x <= 0.6, mode + ": Beginner " + x.toFixed(2));
  }
});

test("301 Double-Out: Ausmachen nur mit Double, Bust bei unter null, bei 1 und bei null ohne Double; Einsteiger ohne Double-Out", () => {
  const seed = 777;
  let s = "al" + throws(seed, 0, ["T20", "T20", "T20"]);
  let g = M.sim(seed, s); assert.deepEqual([g.left, g.turns[0].pts, g.over], [[121, 301], 180, false]);
  s += throws(seed, 3, ["S20", "S20", "S20"]); g = M.sim(seed, s); assert.deepEqual(g.left, [121, 241]);
  s += throws(seed, 6, ["T20", "T19", "S2"]); g = M.sim(seed, s); assert.deepEqual(g.left, [2, 241]);
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
  assert.deepEqual([t.out, g.over, g.left[0], t.d.length], [true, false, 0, 2], "D1 auf 2: ausgecheckt, B hat noch seine Aufnahme");
  s += throws(seed, 26, ["S1", "S1", "S1"]); g = M.sim(seed, s); assert.deepEqual([g.over, g.win], [true, 0], "gleich viele Aufnahmen, dann ist Schluss");
  assert.equal(M.sim(seed, s + throws(seed, 29, ["S1"])).extra, true, "nach dem Ende kein Pfeil mehr");
  let b = "al" + throws(seed, 0, ["T20", "T20", "T20"]) + throws(seed, 3, ["0", "0", "0"]) + throws(seed, 6, ["T19", "T14", "S1"]);
  assert.equal(M.sim(seed, b).left[0], 21);
  b += throws(seed, 9, ["0", "0", "0"]) + throws(seed, 12, ["S1", "D10"]) + throws(seed, 14, ["0", "0", "0"]); g = M.sim(seed, b); assert.deepEqual([g.over, g.win], [true, 0], "21: S1, D10");
  const bull = "al" + throws(seed, 0, ["T20", "T20", "T17"]) + throws(seed, 3, ["0", "0", "0"]) + throws(seed, 6, ["T20", "S10", "B"]);
  g = M.sim(seed, bull); assert.equal(g.left[0], 10);
  let bo = "al" + throws(seed, 0, ["T20", "T20", "T20"]) + throws(seed, 3, ["0", "0", "0"]) + throws(seed, 6, ["T20", "T19", "S4"]) + throws(seed, 9, ["0", "0", "0"]);
  g = M.sim(seed, bo); assert.deepEqual([g.left[0], g.turns[2].bust], [121, true], "ueberworfen: zurueck auf den Stand vor der Aufnahme");
  bo += throws(seed, 12, ["T20", "S11", "B"]) + throws(seed, 15, ["0", "0", "0"]); g = M.sim(seed, bo); assert.deepEqual([g.over, g.win, M.field(g.turns[4].d[2], "de")], [true, 0, "Bullseye"], "Bullseye macht aus");
  let both = "al" + throws(seed, 0, ["T20", "T20", "T20"]) + throws(seed, 3, ["T20", "T20", "T20"]) + throws(seed, 6, ["T20", "T19", "S2"]) + throws(seed, 9, ["T20", "T19", "S2"]);
  both += throws(seed, 12, ["0", "0", "D1"]) + throws(seed, 15, ["D1"]); g = M.sim(seed, both); assert.deepEqual([g.over, g.win], [true, 1], "B braucht weniger Pfeile");
  let e = "bl" + throws(seed, 0, ["T20", "T20", "T20"]) + throws(seed, 3, ["0", "0", "0"]) + throws(seed, 6, ["T20", "T20", "S5"]);
  g = M.sim(seed, e); assert.deepEqual([g.left[0], g.turns[2].bust, g.turns[2].d.length], [121, true, 3]);
  e += throws(seed, 9, ["0", "0", "0"]) + throws(seed, 12, ["T20", "T20", "S1"]) + throws(seed, 15, ["0", "0", "0"]); g = M.sim(seed, e);
  assert.deepEqual([g.over, g.win, g.left[0]], [true, 0, 0], "Einsteiger: S1 auf 1 macht aus");
  assert.deepEqual(M.sim(seed, "al" + throws(seed, 0, ["T20", "T20", "T20"]) + throws(seed, 3, ["0", "0", "0"]) + throws(seed, 6, ["T20", "T20", "S1"])).left[0], 121, "Double-Out: Rest 0 mit S1 ist Bust");
});

test("Nach zwoelf Runden entscheidet der Stand; Rund um die Uhr mit gleich vielen Aufnahmen; hoechste Punktzahl in drei Runden", () => {
  const seed = 99;
  let s = "al", k = 0;
  for (let r = 0; r < 2 * M.ROUNDS; r++) { s += throws(seed, k, r % 2 ? ["S1", "S1", "S1"] : ["S5", "S5", "S5"]); k += 3; }
  let g = M.sim(seed, s); assert.deepEqual([g.over, g.capped, g.win, g.left], [true, true, 0, [301 - 180, 301 - 36]], "nach 12 Runden: weniger Rest gewinnt");
  assert.equal(M.ok([s + throws(seed, k, ["S1", "S1", "S1"]), 3, NAMES], seed, null, false), false, "danach kein Zug mehr");
  let a = "cl" + throws(seed, 0, ["S1", "S3", "D2"]);
  g = M.sim(seed, a); assert.deepEqual([g.next[0], g.turns[0].pts], [3, 2]);
  a += throws(seed, 3, ["S1", "S2", "S3"]); g = M.sim(seed, a); assert.equal(g.next[1], 4);
  let full = "cl", kk = 0;
  for (let n = 1; n <= 20; n += 3) { const f = [n, n + 1, n + 2].map((x) => (x <= 20 ? "S" + x : "0")); full += throws(seed, kk, f); kk += 3; if (n + 2 >= 20) break; full += throws(seed, kk, ["0", "0", "0"]); kk += 3; }
  g = M.sim(seed, full); assert.deepEqual([g.over, g.next[0]], [false, 21], "A ist rundum, B wirft seine Aufnahme dieser Runde noch");
  g = M.sim(seed, full + throws(seed, kk, ["0", "0", "0"])); assert.deepEqual([g.over, g.win], [true, 0], "rundum: 1 bis 20");
  let hs = "dl", kh = 0;
  for (let r = 0; r < 6; r++) { hs += throws(seed, kh, r % 2 ? ["T19", "T19", "T19"] : ["T20", "T20", "T20"]); kh += 3; }
  g = M.sim(seed, hs); assert.deepEqual([g.over, g.capped, g.win, g.total], [true, false, 0, [540, 513]]);
  assert.equal(M.sim(seed, "dl" + throws(seed, 0, ["T20", "T20", "T20"])).over, false);
});

test("Determinismus: gleicher Seed und gleiche Eingaben ergeben dieselben Treffer", () => {
  const ins = [], r = mulberry32(5);
  for (let i = 0; i < 60; i++) ins.push(M.dart((r() - 0.5) * 2, (r() - 0.5) * 2, r() * 8));
  const s = "dl" + ins.slice(0, 18).map(M.enc).join("");
  const a = M.sim(31337, s), b = M.sim(31337, s);
  assert.deepEqual(a, b);
  assert.notDeepEqual(M.sim(31338, s).turns.map((t) => t.d.map((h) => h.x)), a.turns.map((t) => t.d.map((h) => h.x)), "anderer Seed, andere Treffer");
  ins.forEach((d) => assert.deepEqual(M.dec(M.enc(d))[0], d));
  // Zug fuer Zug: jede Aufnahme setzt die vorige fort (alt: ueber echte Links; hier ok() wie beim Lesen eines Links)
  let prev = null, played = "dl";
  for (let turn = 0; turn < 6; turn++) {
    played += ins.slice(turn * 3, turn * 3 + 3).map(M.enc).join("");
    const v = [played, M.claimed(M.sim(123456, played)), NAMES];
    assert.ok(M.ok(v, 123456, prev, true), "Zug " + turn); prev = v;
  }
  assert.ok(M.sim(123456, played).over, "nach drei Runden je Person aus");
  assert.match(M.result(sight(123456, prev), "de").h, /gewinnt|Unentschieden/);
  const bot = "ab" + throws(777, 0, ["T20", "T20", "T20"]);
  assert.deepEqual(M.sim(777, bot).turns[1].d.map((h) => h.d), M.sim(777, bot).turns[1].d.map((h) => h.d));
  assert.equal(M.sim(777, bot).turns.length, 2, "nach meiner Aufnahme wirft Bert sofort seine");
});

test("Manipulierter Zug: falsche Punkte werden nachgerechnet und korrigiert, veraenderte Wuerfe gelten nicht", () => {
  const seed = 2026, s = "al" + throws(seed, 0, ["T20", "S5", "S1"]);
  assert.equal(M.sim(seed, s).turns[0].pts, 66);
  assert.ok(M.ok([s, 180, NAMES], seed, null, true), "der Zug bleibt");
  assert.deepEqual(faceOf(seed, s, 180).slice(1), ["Ana: noch 235 · Ben: noch 301", "Ana: T20 · 5 · 1 = 66 Punkte", "Im Link standen 180 Punkte, nachgerechnet sind es 66."]);
  assert.equal(faceOf(seed, s, 180, ["", ""])[1], "Spieler 1: noch 235 · Spieler 2: noch 301", "ohne Spitznamen");
  assert.equal(faceOf(seed, s).length, 3, "ehrlicher Zug: kein Hinweis");
  assert.equal(faceOf(seed, s, 180, NAMES, "en")[3], "The link said 180 points; counted again it is 66.");
  const read = (v) => M.ok(v.length === 2 ? v.concat([NAMES]) : v, seed, null, false);
  assert.equal(read([s, 66, ["<b>x</b>", ""]]), false, "Name nur durch den Filter");
  assert.equal(read([s, 66, ["Ana"]]), false, "zwei Namen");
  assert.equal(read([s, 999]), true);
  assert.equal(read([s, 1000]), false, "Behauptung ausserhalb 0..999");
  assert.equal(read([s.slice(0, -1), 66]), false, "halber Pfeil");
  assert.equal(read([s.slice(0, -5), 66]), false, "zwei Pfeile ohne Bust: die Aufnahme ist nicht fertig");
  assert.equal(read([s + throws(seed, 3, ["S1"]), 66]), false, "ein Pfeil zu viel");
  assert.equal(read(["xl" + s.slice(2), 66]), false, "kein Spiel");
  assert.equal(M.ok([s + throws(seed, 3, ["S1", "S1", "S1"]), 66, NAMES], seed, null, true), false, "zwei Aufnahmen auf einmal als neuer Zug");
  assert.equal(read([s + throws(seed, 3, ["S1", "S1", "S1"]), 66]), true, "ein gelesener Link mit zwei Aufnahmen ist ein Spielstand (snap)");
  const prev = [s, 66, NAMES], b1 = s + throws(seed, 3, ["S20", "S20", "S20"]);
  assert.equal(M.ok([b1, 60, ["Eve", "Ben"]], seed, prev, true), false, "As Name bleibt");
  assert.ok(M.ok([b1, 60, NAMES], seed, prev, true), "B antwortet");
  const other = "al" + throws(seed, 0, ["T20", "T20", "T20"]) + throws(seed, 3, ["S20", "S20", "S20"]);
  assert.equal(M.ok([other, 60, NAMES], seed, prev, true), false, "As Wuerfe umgeschrieben: kein Zug");
  const changed = s.slice(0, 2) + throws(seed, 0, ["0"]) + s.slice(7);
  assert.equal(M.sim(seed, changed).turns[0].pts, 6); assert.equal(faceOf(seed, changed, 66)[3], "Im Link standen 66 Punkte, nachgerechnet sind es 6.");
  let r = "dl"; for (let t = 0; t < 6; t++) r += throws(seed, t * 3, ["T20", "T20", "T20"]);
  const res = M.result(sight(seed, [r, 9, NAMES]), "de"); assert.equal(res.h, "Unentschieden!"); assert.equal(res.lines[res.lines.length - 1], "Im Link standen 9 Punkte, nachgerechnet sind es 180.");
});

test("Gegen Bert: alle eigenen Wuerfe, Bert rechnet jedes Geraet gleich nach, nur fertige Spiele", () => {
  const seed = 5150;
  let s = "ab", g = M.sim(seed, s);
  while (!g.over) { s += throws(seed, g.k, ["T20"]); g = M.sim(seed, s); }
  assert.ok(g.over); assert.equal((s.length - 2) / 5, g.turns.filter((t) => t.p === 0).reduce((a, t) => a + t.d.length, 0));
  assert.ok(M.ok([s, M.claimed(g), ["", ""]], seed, null, true));
  const res = M.result(sight(seed, [s, M.claimed(g), ["", ""]]), "de"); assert.match(res.h, /^(Du schlägst Bert!|Bert gewinnt\. Revanche\?|Unentschieden!)$/);
  assert.match(res.lines[1], /^Du: noch \d+ · Bert \(Bot\): noch \d+$/);
  assert.equal(M.ok(["ab" + throws(seed, 0, ["T20", "T20", "T20"]), 180, ["", ""]], seed, null, true), false, "kein halbes Spiel gegen Bert");
  assert.deepEqual(M.aimFor({ kind: "x01", mode: "a", left: [301, 40] }, 1), { n: 20, r: "d" });
  assert.deepEqual(M.aimFor({ kind: "x01", mode: "a", left: [2, 40] }, 1), { n: 20, r: "d" });
  assert.deepEqual(M.aimFor({ kind: "x01", mode: "a", left: [0, 41] }, 1), { n: 1, r: "s" });
  assert.deepEqual(M.aimFor({ kind: "x01", mode: "a", left: [0, 50] }, 1), { n: 25, r: "b" });
  assert.deepEqual(M.aimFor({ kind: "atc", next: [1, 7] }, 1), { n: 7, r: "s" });
});

test("Ein volles Spiel hat genau MAXLEN Zeichen; laenger ist kein Spiel", () => {
  let s = "al";
  for (let t = 0; t < 2 * M.ROUNDS; t++) s += throws(4294967295, t * 3, ["S1", "S1", "S1"]);
  assert.ok(M.sim(4294967295, s).over); assert.equal(s.length, M.MAXLEN);
  assert.equal(M.sim(1, s + "AAAAA"), null, "laenger als ein volles Spiel: kein Spiel");
});

test("Texte: de und en mit denselben Schluesseln, Ansage wie \"Triple 20, 60 Punkte\"", () => {
  const J = M.DATA;
  assert.deepEqual(Object.keys(J.text.de).sort(), Object.keys(J.text.en).sort()); assert.equal(J.quips.de.length, J.quips.en.length);
  const h = M.score(0, -0.606);
  assert.equal(M.spoken(h, "de"), "Triple 20, 60 Punkte"); assert.equal(M.spoken(h, "en"), "Triple 20, 60 points");
  assert.equal(M.spoken(M.score(0, 0), "de"), "Bullseye, 50 Punkte"); assert.equal(M.spoken(M.score(2, 2), "de"), "Daneben, 0 Punkte");
  assert.equal(M.spoken(M.score(...at(18, 0.5)), "de"), "Single 1, 1 Punkt"); assert.equal(M.spoken(M.score(...at(234, 0.976)), "en"), "Double 16, 32 points");
  assert.equal(M.short(h, "de"), "T20"); assert.equal(M.short(M.score(0, 0), "de"), "Bull");
});

test("Eigene Wuerfe nicht umschreibbar: gezaehlt wird der eigene Stand, wenn der Link nicht weitergeht", () => {
  const seed = 31, a1 = "al" + throws(seed, 0, ["T20", "S5", "S1"]), b1 = a1 + throws(seed, 3, ["S20", "S20", "S20"]);
  const forged = "al" + throws(seed, 0, ["0", "0", "0"]) + throws(seed, 3, ["S20", "S20", "S20"]);
  assert.equal(M.trust(a1, [b1, 60, NAMES], seed), true, "B hat nur angehaengt");
  assert.equal(M.trust(a1, [forged, 60, NAMES], seed), false, "As Pfeile umgeschrieben");
  assert.equal(M.trust(b1, [a1, 66, NAMES], seed), true, "ein frueherer Link desselben Spiels (eigene Geschichte)");
  assert.equal(M.trust("", [forged, 60, NAMES], seed), true, "nichts gesendet: nichts zu vergleichen");
  const more = b1 + throws(seed, 6, ["0", "0", "0"]) + throws(seed, 9, ["S20", "S20", "S20"]);
  assert.equal(M.trust(a1, [more, 0, NAMES], seed), false, "mehr als eine Aufnahme angehaengt");
  let s = "al"; for (let i = 0; i < 400; i++) { const g = M.sim(seed, s); if (g.over) break; const p = g.partial ? g.turns[g.turns.length - 1].p : g.turns.length % 2; if (!p) { s += throws(seed, g.k, ["0"]); continue; } const aim = M.aimFor(g, 1), c = M.centre(aim.n, aim.r); s += throws(seed, g.k, [c[1] < -0.9 || aim.r === "d" ? "D" + aim.n : aim.r === "t" ? "T" + aim.n : aim.n === 25 ? "B" : "S" + aim.n]); }
  const made = M.sim(seed, s); assert.ok(made.over && made.win === 1, "erfundener Sieg von B");
  assert.match(M.result(sight(seed, [s, 0, NAMES]), "de").h, /^Ben gewinnt!$/);
  const w = sight(seed, [s, 0, NAMES], { s: a1, n: ["Ana", ""] });
  assert.equal(w.foreign, true); assert.equal(w.v[0], a1); assert.equal(w.g.over, false, "kein Ende");
  const f = M.face(w, "de"); assert.equal(f[1], "Ana (du): noch 235 · Gegner: noch 301"); assert.equal(f[f.length - 1], "Dieser Link passt nicht zu deinem letzten Wurf. Gewertet wird dein eigener Stand.");
  let mine = "al"; for (let i = 0; i < 400; i++) { const g = M.sim(seed, mine); if (g.over) break; const p = g.partial ? g.turns[g.turns.length - 1].p : g.turns.length % 2; const aim = M.aimFor(g, p); mine += throws(seed, g.k, [p ? "0" : fieldName(aim)]); }
  assert.equal(M.sim(seed, mine).win, 0);
  const r = M.result(sight(seed, [s, 0, NAMES], { s: mine, n: ["Ana", "Ben"] }), "de");
  assert.equal(r.h, "Ana gewinnt!"); assert.match(r.lines[1], /^Ben \(du\): /); assert.equal(r.lines[r.lines.length - 1], "Dieser Link passt nicht zu deinem letzten Wurf. Gewertet wird dein eigener Stand.");
  const okw = sight(seed, [b1, 60, NAMES], { s: a1, n: ["Ana", ""] }); assert.equal(okw.foreign, false); assert.equal(M.face(okw, "de").length, 3);
  let ext = a1; for (let i = 0; i < 400; i++) { const g = M.sim(seed, ext); if (g.over) break; const p = g.partial ? g.turns[g.turns.length - 1].p : g.turns.length % 2; if (!p) { ext += throws(seed, g.k, ["0"]); continue; } ext += throws(seed, g.k, [fieldName(M.aimFor(g, 1))]); }
  assert.ok(M.sim(seed, ext).over && M.sim(seed, ext).win === 1);
  const ex = sight(seed, [ext, 0, ["Ana", "Ben"]], { s: a1, n: ["Ana", ""] }); assert.equal(ex.g.over, false); assert.equal(M.face(ex, "de").pop(), "Dieser Link passt nicht zu deinem letzten Wurf. Gewertet wird dein eigener Stand.");
  assert.equal(M.face(sight(seed, [b1, 60, ["Verlierer", "Ben"]], { s: a1, n: ["Ana", ""] }), "de")[1], "Ana (du): noch 235 · Ben: noch 241");
  for (const fake of ["Ana", "ΑΝΑ", "ᴀna", "ɑna"]) {
    const td = sight(seed, [b1, 60, ["", fake]], { s: a1, n: ["Ana", ""] });
    assert.equal(M.face(td, "de")[1], "Ana (du): noch 235 · Gegner: noch 241", fake);
    assert.deepEqual(td.v[2], ["Ana", ""], fake);
  }
});

test("Spitznamen: jede Schrift, aber eine je Name; Vergleich ueber ein Skelett; keine versteckten Zeichen", () => {
  for (const n of ["Ελένη", "Олег", "محمد", "지민", "Zoë", "Ana", "山田はな", "ᎠᎪᎳ"]) assert.equal(M.nameOk(n), true, n);
  for (const n of ["Du", "du", "DU", "Bert", "Bert (Bot)", "Spieler 1", "Spieler 2", "You", "Player 1", "Player 2", "Ꭰu", "Dս", "Ⅾu", "Ⅾᥙ", "Ᏼert", "Bеrt", "Вert", "B3rt",
    "Bот", "ꓓu", "ｄｕ", "Du.", "D u", "Spie1er 2", "Bot", "B0t"]) assert.equal(M.nameOk(n), false, n);
  assert.equal(M.foldName("Ꭰu"), "du"); assert.equal(M.foldName("Dս"), "du"); assert.equal(M.foldName("Ᏼert"), "bert"); assert.equal(M.foldName("Ꭺnna"), "anna");
  for (const n of ["Аnna", "Ꭺnna", "Annaα", "Олегx"]) assert.equal(M.nameOk(n), false, "gemischt: " + n);
  for (const n of ["Ꭺnna", "Аnna", "ANNA", "Ａｎｎａ", "Ánna", "4nna", "ꓮnna"]) assert.equal(M.namesOk(["Anna", n]), false, n);
  assert.equal(M.namesOk(["Anna", "Ben"]), true); assert.equal(M.namesOk(["Олег", "Ελένη"]), true); assert.equal(M.namesOk(["", ""]), true);
  for (const n of ["‮ana", "an​a", "ana⁦", "﻿ana", "an­a", "Anna⠀", "ㅤ", "Duㅤ", "an⁡a", "a\u0007na"]) assert.equal(M.nameOk(n), false, JSON.stringify(n));
  assert.equal(M.plainName("A⠀nㅤna‍"), "Anna");
  assert.equal(M.myName("‮Ben​", "Ana"), "Ben"); assert.equal(M.myName("Ana", "Аna"), ""); assert.equal(M.myName("Du", ""), ""); assert.equal(M.myName("Ᏼert", ""), ""); assert.equal(M.myName("지민", "Ana"), "지민");
  const seed = 8, a1 = "al" + throws(seed, 0, ["S1", "S1", "S1"]), b1 = a1 + throws(seed, 3, ["S1", "S1", "S1"]), prev = [a1, 3, ["Anna", ""]];
  for (const n of ["Du", "Bert", "Spieler 1", "Аnna", "Anna", "Ꭺnna", "‮ben"]) assert.equal(M.ok([b1, 3, ["Anna", n]], seed, prev, true), false, "B heisst " + JSON.stringify(n));
  assert.equal(M.ok([b1, 3, ["Ben", "Ben"]], seed, prev, true), false, "A umbenannt"); assert.ok(M.ok([b1, 3, ["Anna", "Олег"]], seed, prev, true));
  assert.equal(M.who(M.sim(seed, b1), 1, "de", ["Anna", "Be​n"]), "Ben");
});

test("Skelett aus Review 3: Grossbuchstaben vor dem Kleinschreiben, Kapitaelchen, Cherokee", () => {
  const sk = { "ΑΝΝΑ": "anna", "ᴅᴜ": "du", "ɑnna": "anna", "ᏴᎬᏒᎢ": "bert", "ВОТ": "bot", "ΜΕ": "me", "Ꭰu": "du", "Dս": "du", "ꓓu": "du", "Ⅾu": "du", "Bеrt": "bert", "Ᏼert": "bert",
    "ɢʀɪɴ": "grin", "ʙᴇʀᴛ": "bert", "Ꮢ": "r", "Дu": "du" };
  for (const [n, f] of Object.entries(sk)) assert.equal(M.foldName(n), f, n);
  for (const n of ["ᴅᴜ", "ᏴᎬᏒᎢ", "ВОТ", "ΜΕ", "ʙᴇʀᴛ", "Ꭰu", "Dս", "ꓓu", "Ⅾu", "Bеrt", "Ᏼert", "Дu", "Du⠀", "ㅤ", "Anna‍", "Gegner", "Opponent"]) assert.equal(M.nameOk(n), false, n);
  for (const n of ["ΑΝΝΑ", "ɑnna", "ᴀnna"]) { assert.equal(M.namesOk(["Anna", n]), false, n); assert.equal(M.namesOk(["ANNA", n]), false, n); }
  for (const n of ["Ελένη", "Олег", "محمد", "지민", "Zoë", "李小龍", "さくら", "José María", "Anne-Marie", "O'Neil", "Дмитрий"]) assert.equal(M.nameOk(n), true, n);
});

test("Meine Seite steht fest: \"(du)\" und zuerst, auch wenn ein Doppelgaenger-Name durchrutscht", () => {
  const seed = 77, a1 = "al" + throws(seed, 0, ["T20", "T20", "T20"]), b1 = a1 + throws(seed, 3, ["S1", "S1", "S1"]);
  assert.equal(M.namesOk(["Ana", "Ана"]), true);
  assert.match(M.face(sight(seed, [b1, 3, ["Ana", "Ана"]], { s: a1, n: ["Ana", ""] }), "de")[1], /^Ana \(du\): noch 121 · /);
  assert.equal(M.face(sight(seed, [b1, 3, ["Ana", "Ben"]], { s: b1, n: ["Ana", "Ben"] }), "en")[1], "Ben (you): 298 to go · Ana: 121 to go");
  let r = "dl"; for (let t = 0; t < 6; t++) r += throws(seed, t * 3, t % 2 ? ["S1", "S1", "S1"] : ["T20", "T20", "T20"]);
  assert.equal(M.result(sight(seed, [r, 3, ["Ana", "Ben"]], { s: r.slice(0, 2 + 15 * 5), n: ["Ana", ""] }), "de").h, "Du gewinnst!", "mein Sieg: ohne Namen");
  assert.equal(M.result(sight(seed, [r, 3, ["Ana", "Ben"]], { s: r, n: ["Ana", "Ben"] }), "de").h, "Ana gewinnt!");
  assert.equal(M.face(sight(seed, [b1, 3, ["Ana", "Ben"]]), "de")[1], "Ana: noch 121 · Ben: noch 298");
});

test("Review 4: keine Klammern, keine Markierungswoerter als Wort im Namen; eigener Sieg heisst \"Du gewinnst!\"", () => {
  for (const n of ["Anna (du)", "Anna(du)", "Du (du)", "Gegner (du)", "Anna (you)", "Anna [du]", "Anna {du}", "Anna Du", "Du-Anna", "Anna you", "AnnaDu", "AnnaYou"]) assert.equal(M.nameOk(n), false, n);
  for (const n of ["Duncan", "Dustin", "Duc", "Dulce", "Duygu", "Dumitru", "Youssef", "Younes", "Yousra", "Pandu", "Kudu", "DuBois", "McDonald",
    "Anna", "Robert", "Albert", "Erich", "Melanie", "Ελένη", "José María", "O'Neil", "Anne-Marie"]) assert.equal(M.nameOk(n), true, n);
  const seed = 12, a1 = "al" + throws(seed, 0, ["S1", "S1", "S1"]), b1 = a1 + throws(seed, 3, ["S1", "S1", "S1"]), prev = [a1, 3, ["Anna", ""]];
  for (const n of ["Anna (du)", "Du (du)"]) assert.equal(M.ok([b1, 3, ["Anna", n]], seed, prev, true), false, n);
  let r = "dl"; for (let t = 0; t < 6; t++) r += throws(seed, t * 3, t % 2 ? ["S1", "S1", "S1"] : ["T20", "T20", "T20"]);
  const mine = { s: r.slice(0, 2 + 15 * 5), n: ["Anna", ""] }, v = [r, 3, ["Anna", "Ben"]];
  assert.equal(M.result(sight(seed, v, mine), "de").h, "Du gewinnst!"); assert.equal(M.result(sight(seed, v, mine), "en").h, "You win!");
  assert.match(M.result(sight(seed, v, mine), "de").lines[1], /^Anna \(du\): \d+ Punkte · Ben: \d+ Punkte$/);
  assert.equal(M.result(sight(seed, v, { s: r, n: ["Anna", "Ben"] }), "de").h, "Anna gewinnt!", "der Gegner gewinnt: sein Name bleibt");
});

test("Regler ohne Timing wirft mit derselben Unsicherheit wie das Pendel: 1 von 5 eine Stufe weniger, 1 von 5 eine mehr", () => {
  const T20 = M.centre(20, "t"), N = 3000;
  const d = M.dart(0, 0, 4, true); assert.deepEqual(M.dec(M.enc(d))[0], d); assert.equal(M.dec(M.enc(M.dart(0, 0, 4)))[0].f, undefined);
  const c = { "-1": 0, 0: 0, 1: 0 }; for (let k = 0; k < N; k++) c[M.shake(99, k)]++;
  assert.ok(Math.abs(c[-1] / N - 0.2) < 0.03 && Math.abs(c[1] / N - 0.2) < 0.03 && Math.abs(c[0] / N - 0.6) < 0.03, JSON.stringify(c));
  assert.equal(M.level(99, 5, { p: 4 }), 4, "Pendel: die Stufe, die es zeigte"); assert.equal(M.level(99, 5, { p: 8, f: 1 }) <= 8, true);
  let slider = 0, swing = 0;
  for (let i = 0; i < N; i++) {
    const s = 41000 + i, k = i % 60;
    if (((x) => x.n === 20 && x.m === 3)(M.land(s, k, M.dart(T20[0], T20[1], M.MID, true)))) slider++;
    const u = mulberry32(s * 7 + k)(), p = u < 0.6 ? M.MID : u < 0.8 ? M.MID - 1 : M.MID + 1;
    if (((x) => x.n === 20 && x.m === 3)(M.land(s, k, M.dart(T20[0], T20[1], p)))) swing++;
  }
  assert.ok(Math.abs(slider - swing) / N < 0.02, "T20 Regler " + (slider / N).toFixed(3) + " / Pendel " + (swing / N).toFixed(3));
  let w = 0, l = 0;
  for (let i = 0; i < 300; i++) {
    let st = "cl";
    for (let j = 0; j < 400; j++) {
      const g = M.sim(i + 90000, st); if (g.over) { if (g.win === i % 2) w++; else if (g.win >= 0) l++; break; }
      const p = g.partial ? g.turns[g.turns.length - 1].p : g.turns.length % 2, aim = M.aimFor(g, p), cc = M.centre(aim.n, aim.r), u = mulberry32((i + 90000) * 131 + g.k)();
      st += M.enc(p === (i % 2) ? M.dart(cc[0], cc[1], M.MID, true) : M.dart(cc[0], cc[1], u < 0.6 ? M.MID : u < 0.8 ? M.MID - 1 : M.MID + 1));
    }
  }
  assert.ok(w / (w + l) >= 0.4 && w / (w + l) <= 0.6, "Regler gegen Pendel " + w + ":" + l);
});
