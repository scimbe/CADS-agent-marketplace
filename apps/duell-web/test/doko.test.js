const test = require("node:test"), assert = require("node:assert/strict");
const D = require("../src/doko.js");

// Seeded shuffle of the 48 cards into four hands of 12.
function deal(seed) {
  let h = seed >>> 0 || 1; const r = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
  const d = D.DECK.slice();
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return [0, 1, 2, 3].map((s) => d.slice(s * 12, s * 12 + 12));
}
function ok(s, a) { const r = D.apply(s, a); assert.ok(r.ok, JSON.stringify(a) + " -> " + r.err); return r.state; }
function sayAll(s, vs) { for (let i = 0; i < 4; i++) { const seat = D.turn(s); s = ok(s, { t: "vorbehalt", seat, v: vs[seat] }); } return s; }
// Plays the game to the end, each seat taking its first legal card; hook(s, left) may add calls along the way.
function playOut(s, hands, hook) {
  const left = hands.map((h) => h.slice());
  while (!D.done(s)) {
    if (hook) s = hook(s, left);
    const seat = D.turn(s), play = D.actions(s, seat, left[seat]).find((a) => a.t === "play");
    s = ok(s, play); left[seat].splice(left[seat].indexOf(play.card), 1);
  }
  return s;
}
const sum = (a) => a.reduce((x, y) => x + y, 0);

test("Deck: 48 Karten mit Neunen, 240 Augen, jede Karte doppelt", () => {
  assert.equal(D.DECK.length, 48); assert.equal(sum(D.DECK.map(D.eyes)), 240);
  assert.equal(D.DECK.filter((c) => c === "HT").length, 2);
  const L = D.layout(); assert.equal(L.hands.length, 4); assert.deepEqual(L.hands[3], [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47]);
});
test("Trumpf im Normalspiel: Dulle, Damen, Buben, Karo; Herz ohne Zehn als Fehl", () => {
  assert.deepEqual(D.trumps("normal"), ["HT", "CQ", "SQ", "HQ", "DQ", "CJ", "SJ", "HJ", "DJ", "DA", "DT", "DK", "D9"]);
  assert.equal(D.trumps("normal").length * 2, 26);
  assert.deepEqual(D.trumps("karo"), D.trumps("normal"));
  assert.deepEqual(D.trumps("herz"), ["HT", "CQ", "SQ", "HQ", "DQ", "CJ", "SJ", "HJ", "DJ", "HA", "HK", "H9"]);
  assert.deepEqual(D.trumps("kreuz").slice(-4), ["CA", "CT", "CK", "C9"]);
  assert.deepEqual(D.trumps("damen"), ["CQ", "SQ", "HQ", "DQ"]); assert.deepEqual(D.trumps("buben"), ["CJ", "SJ", "HJ", "DJ"]);
  assert.deepEqual(D.trumps("fleischlos"), []);
});
test("Stichgewinner: Trumpf sticht, Fehl nur in der Farbe, gleiche Karten: die erste gewinnt (auch die Dulle)", () => {
  const T = (kind, cs) => D.trickWinner(kind, cs.map((card, i) => ({ seat: i, card })));
  assert.equal(T("normal", ["CA", "CT", "D9", "CK"]), 2);
  assert.equal(T("normal", ["CA", "SA", "HA", "CK"]), 0);
  assert.equal(T("normal", ["HT", "CQ", "HT", "D9"]), 0);
  assert.equal(T("normal", ["CT", "CA", "CA", "C9"]), 1);
  assert.equal(T("normal", ["HA", "HT", "HK", "H9"]), 1);           // the Heart Ten is trump, not a heart
  assert.equal(T("damen", ["CJ", "CA", "C9", "DQ"]), 3);            // queens solo: the jack is a plain club
  assert.equal(T("damen", ["CJ", "CK", "C9", "CT"]), 3);
  assert.equal(T("buben", ["SQ", "SK", "DJ", "SA"]), 2);
  assert.equal(T("fleischlos", ["HQ", "HJ", "HK", "CQ"]), 2);       // fleshless: A T K Q J 9
  assert.equal(T("fleischlos", ["HT", "HA", "DA", "H9"]), 1);
  assert.equal(T("herz", ["HA", "HK", "DA", "H9"]), 0);             // diamonds are plain in a heart solo
  assert.equal(T("pik", ["CA", "S9", "CT", "CK"]), 1);
});
test("Bedienen: Trumpf verlangt Trumpf, Fehl verlangt die Farbe, sonst frei", () => {
  const tr = (c) => ({ lead: 0, cards: [{ seat: 0, card: c }] });
  assert.deepEqual(D.legalCards("normal", tr("D9"), ["CA", "HQ", "SJ", "HA"]).sort(), ["HQ", "SJ"]);
  assert.deepEqual(D.legalCards("normal", tr("HA"), ["HT", "HK", "CA"]), ["HK"]);   // the Heart Ten does not follow hearts
  assert.deepEqual(D.legalCards("normal", tr("CA"), ["HT", "SA"]), ["HT", "SA"]);
  assert.deepEqual(D.legalCards("buben", tr("SQ"), ["SJ", "DQ"]), ["SJ", "DQ"]);     // no spade: anything
  assert.deepEqual(D.legalCards("normal", { lead: 0, cards: [] }, ["CA", "D9"]), ["CA", "D9"]);
});
test("Vorbehalte: reihum ab Vorhand, Solo vor Hochzeit, das erste Solo gilt, Vorhand spielt aus", () => {
  let s = D.start({ dealer: 3 });
  assert.equal(D.turn(s), 0); assert.equal(D.apply(s, { t: "vorbehalt", seat: 1, v: "gesund" }).err, "turn");
  s = sayAll(s, ["gesund", "gesund", "gesund", "gesund"]);
  assert.equal(s.phase, "play"); assert.equal(s.kind, "normal"); assert.equal(D.turn(s), 0);

  s = D.start({ dealer: 0 });
  s = sayAll(s, ["vorbehalt", "vorbehalt", "gesund", "vorbehalt"]);
  assert.equal(s.phase, "abfrage"); assert.equal(D.turn(s), 1);
  const hand = ["CQ", "CQ", "HT"];
  assert.ok(D.actions(s, 1, hand).some((a) => a.v === "hochzeit")); assert.ok(!D.actions(s, 1, ["CQ"]).some((a) => a.v === "hochzeit"));
  s = ok(s, { t: "vorbehalt", seat: 1, v: "hochzeit" });
  assert.equal(D.turn(s), 3);
  s = ok(s, { t: "vorbehalt", seat: 3, v: "buben" });
  assert.equal(s.kind, "buben"); assert.equal(s.soloist, 3); assert.equal(D.turn(s), 1);   // voluntary solo: Vorhand leads
  assert.equal(D.knownParty(s, 3), "re"); assert.equal(D.knownParty(s, 0), "kontra");

  s = sayAll(D.start({ dealer: 2 }), ["gesund", "gesund", "gesund", "vorbehalt"]);
  s = ok(s, { t: "vorbehalt", seat: 3, v: "hochzeit" });
  assert.equal(s.kind, "hochzeit"); assert.equal(s.soloist, 3);
});
test("Ansagefristen: Re bis 11 Karten, Absagen je eine Karte weniger, Erwiderung eine Karte spaeter", () => {
  let s = sayAll(D.start({ dealer: 3 }), ["gesund", "gesund", "gesund", "gesund"]);
  s = ok(s, { t: "play", seat: 0, card: "C9" }); s = ok(s, { t: "play", seat: 1, card: "C9" }); s = ok(s, { t: "play", seat: 2, card: "CK" }); s = ok(s, { t: "play", seat: 3, card: "CK" });
  // seat 2 won (first of two equal kings is 2), now holds 11: Re still fine
  assert.equal(s.trick.lead, 2);
  s = ok(s, { t: "call", seat: 2, p: "re", a: "re" });
  assert.equal(D.apply(s, { t: "call", seat: 2, p: "kontra", a: "kontra" }).err, "party");
  s = ok(s, { t: "play", seat: 2, card: "S9" }); s = ok(s, { t: "play", seat: 3, card: "S9" }); s = ok(s, { t: "play", seat: 0, card: "SK" }); s = ok(s, { t: "play", seat: 1, card: "SK" });
  // everyone holds 10 now: Kontra as a first call is too late (needs 11) but fine as a reply to Re (needs 10)
  s = ok(s, { t: "call", seat: 1, p: "kontra", a: "kontra" });
  s = ok(s, { t: "call", seat: 2, p: "re", a: "k90" });
  assert.equal(D.apply(s, { t: "call", seat: 0, p: "re", a: "k90" }).err, "late");    // nothing new to call
  assert.equal(D.apply(s, { t: "call", seat: 0, p: "re", a: "k60" }).ok, true);         // 10 cards >= 9
  assert.equal(D.apply(s, { t: "call", seat: 0, p: "re", a: "k30" }).ok, true);         // 10 >= 8
  assert.equal(D.apply(s, { t: "call", seat: 0, p: "kontra", a: "k90" }).ok, true);
  s = ok(s, { t: "play", seat: 0, card: "HA" }); s = ok(s, { t: "play", seat: 1, card: "HA" }); s = ok(s, { t: "play", seat: 2, card: "HK" }); s = ok(s, { t: "play", seat: 3, card: "HK" });
  assert.equal(D.apply(s, { t: "call", seat: 1, p: "kontra", a: "k90" }).err, "late");   // 9 cards < 10
  assert.equal(D.apply(s, { t: "call", seat: 1, p: "kontra", a: "k60" }).ok, true);    // "keine 60" directly, 9 cards suffice
  assert.equal(D.apply(s, { t: "call", seat: 2, p: "re", a: "k60" }).ok, true);
  assert.deepEqual(s.level, { re: 1, kontra: 0 });
});
test("Kein Kontra im Normalspiel ohne Re: erste Ansage braucht 11 Karten", () => {
  let s = sayAll(D.start({ dealer: 3 }), ["gesund", "gesund", "gesund", "gesund"]);
  for (const [seat, card] of [[0, "C9"], [1, "C9"], [2, "CK"], [3, "CK"], [2, "S9"], [3, "S9"], [0, "SK"], [1, "SK"]]) s = ok(s, { t: "play", seat, card });
  assert.equal(D.apply(s, { t: "call", seat: 1, p: "kontra", a: "kontra" }).err, "late");
  assert.deepEqual(D.actions(s, 1, ["HA"]).filter((a) => a.t === "call"), []);
});
test("actions bietet Ansagen auch ausser der Reihe, mit Partei aus dem eigenen Blatt", () => {
  const s = sayAll(D.start({ dealer: 3 }), ["gesund", "gesund", "gesund", "gesund"]);
  assert.deepEqual(D.actions(s, 2, ["CQ", "HA"]), [{ t: "call", seat: 2, p: "re", a: "re" }]);
  assert.deepEqual(D.actions(s, 1, ["SQ", "HA"]), [{ t: "call", seat: 1, p: "kontra", a: "kontra" }]);
  const mine = D.actions(s, 0, ["CA", "HQ", "C9"]);
  assert.deepEqual(mine.filter((a) => a.t === "play").map((a) => a.card), ["CA", "HQ", "C9"]);
});
test("Komplette Normalspiele: Punktesumme 0, Augen 240, Wertung passt zu den Augen", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const hands = deal(seed);
    if (hands.some((h) => h.filter((c) => c === "CQ").length === 2)) continue;
    let s = sayAll(D.start({ dealer: seed % 4 }), ["gesund", "gesund", "gesund", "gesund"]);
    s = playOut(s, hands);
    const r = D.result(s, { hands });
    assert.equal(r.eyes.re + r.eyes.kontra, 240); assert.equal(sum(r.points), 0);
    assert.equal(r.winner, r.eyes.re >= 121 ? "re" : "kontra");
    assert.deepEqual(D.audit(s, { hands }), [], "seed " + seed);
    if (r.winner === "kontra") assert.ok(r.lines.some((l) => l.k === "gegen_die_alten"));
    assert.equal(r.points.filter((p) => p > 0).length === 2 || r.value === 0, true);
  }
});
test("Wertung mit Ansagen: Re + keine 90 erfuellt bzw. verfehlt", () => {
  // Hands built so seat 0 (CQ x1) and seat 1 (CQ x1) are Re with almost every high trump.
  const hands = [
    ["HT", "CQ", "SQ", "HQ", "DQ", "CJ", "CA", "CA", "SA", "SA", "HA", "HA"],
    ["HT", "CQ", "SQ", "HQ", "DQ", "CJ", "SJ", "SJ", "HJ", "HJ", "DJ", "DJ"],
    ["DA", "DA", "DT", "DT", "DK", "DK", "D9", "D9", "CT", "CT", "CK", "CK"],
    ["C9", "C9", "ST", "ST", "SK", "SK", "S9", "S9", "HK", "HK", "H9", "H9"]];
  let s = sayAll(D.start({ dealer: 3 }), ["gesund", "gesund", "gesund", "gesund"]);
  s = ok(s, { t: "call", seat: 0, p: "re", a: "re" }); s = ok(s, { t: "call", seat: 1, p: "re", a: "k90" });
  s = playOut(s, hands);
  const r = D.result(s, { hands });
  assert.deepEqual(r.re, [0, 1]); assert.equal(r.winner, "re"); assert.ok(r.eyes.re >= 151, JSON.stringify(r.eyes));
  assert.equal(sum(r.points), 0);
  const k = r.lines.filter((l) => l.p === "re").map((l) => l.k);
  for (const x of ["gewonnen", "unter90", "re", "abgesagt_k90"]) assert.ok(k.includes(x), x + " in " + k);
  assert.deepEqual(D.audit(s, { hands }), []);
  // same cards, but Kontra gets 90: Re called "keine 60" and fails, Kontra wins with 90+ eyes
  const fake = JSON.parse(JSON.stringify(s)); fake.level = { re: 2, kontra: -1 };
  fake.tricks.forEach((t) => { t.winner = 2; });       // pretend Kontra took everything
  const r2 = D.result(fake, { hands });
  assert.equal(r2.winner, "kontra"); assert.ok(r2.lines.some((l) => l.k === "gegen_k60" && l.p === "kontra"));
  assert.equal(sum(r2.points), 0);
});
test("Gewinnschwellen: nur Kontra angesagt -> Re gewinnt mit 120", () => {
  const hands = deal(7);
  const s = { kind: "normal", level: { re: -1, kontra: 0 }, tricks: [{ winner: 0, eyes: 120, cards: [{ seat: 0, card: "C9" }] }, { winner: 2, eyes: 120, cards: [{ seat: 2, card: "C9" }] }] };
  const re = hands.map((h, i) => h.includes("CQ") ? i : -1).filter((i) => i >= 0);
  if (re.length !== 2) return;
  s.tricks[0].winner = re[0]; s.tricks[1].winner = [0, 1, 2, 3].find((i) => !re.includes(i));
  assert.equal(D.result(s, { hands }).winner, "re");
  s.level = { re: -1, kontra: -1 };
  assert.equal(D.result(s, { hands }).winner, "kontra");    // 120 against plain Re: Kontra
});
test("Keiner erreicht sein Ziel: kein Gewinner, Summe trotzdem 0", () => {
  const hands = deal(3); const re = hands.map((h, i) => h.includes("CQ") ? i : -1).filter((i) => i >= 0);
  if (re.length !== 2) return;
  const ko = [0, 1, 2, 3].find((i) => !re.includes(i));
  const s = { kind: "normal", level: { re: 1, kontra: 1 }, tricks: [{ winner: re[0], eyes: 125, cards: [{ seat: re[0], card: "C9" }] }, { winner: ko, eyes: 115, cards: [{ seat: ko, card: "C9" }] }] };
  const r = D.result(s, { hands });
  assert.equal(r.winner, null); assert.equal(sum(r.points), 0);
});
test("Hochzeit: Partner ist, wer zuerst einen Stich macht; Ansagen erst danach, Fristen verschoben", () => {
  const hands = [
    ["CQ", "CQ", "HT", "HT", "SQ", "SQ", "HQ", "HQ", "DQ", "DQ", "CJ", "CJ"],
    ["CA", "CA", "CT", "CT", "CK", "CK", "C9", "C9", "SA", "SA", "ST", "ST"],
    ["SK", "SK", "S9", "S9", "HA", "HA", "HK", "HK", "H9", "H9", "SJ", "SJ"],
    ["HJ", "HJ", "DJ", "DJ", "DA", "DA", "DT", "DT", "DK", "DK", "D9", "D9"]];
  let s = sayAll(D.start({ dealer: 3 }), ["vorbehalt", "gesund", "gesund", "gesund"]);
  s = ok(s, { t: "vorbehalt", seat: 0, v: "hochzeit" });
  assert.equal(s.kind, "hochzeit"); assert.equal(D.turn(s), 0);
  assert.equal(D.apply(s, { t: "call", seat: 0, p: "re", a: "re" }).err, "late");
  // Without a partner after three tricks: Karo solo of the marriage player, scored as a solo.
  s = playOut(s, hands);
  assert.equal(s.kind, "karo"); assert.equal(s.clar, 3);
  const r = D.result(s, { hands });
  assert.ok(r.solo); assert.deepEqual(r.re, [0]); assert.equal(sum(r.points), 0); assert.equal(r.winner, "re");
  assert.equal(r.points[0], -3 * r.points[1]);
  assert.ok(!r.lines.some((l) => l.k === "doppelkopf"));

  // With a partner: seat 1 leads clubs... seat 0 leads, so make seat 0 lose the first trick by leading a plain card.
  const h2 = [
    ["CQ", "CQ", "C9", "HT", "SQ", "SQ", "HQ", "HQ", "DQ", "DQ", "CJ", "CJ"],
    ["CA", "CA", "CT", "CT", "CK", "CK", "HT", "C9", "SA", "SA", "ST", "ST"],
    ["SK", "SK", "S9", "S9", "HA", "HA", "HK", "HK", "H9", "H9", "SJ", "SJ"],
    ["HJ", "HJ", "DJ", "DJ", "DA", "DA", "DT", "DT", "DK", "DK", "D9", "D9"]];
  s = sayAll(D.start({ dealer: 3 }), ["vorbehalt", "gesund", "gesund", "gesund"]);
  s = ok(s, { t: "vorbehalt", seat: 0, v: "hochzeit" });
  s = ok(s, { t: "play", seat: 0, card: "C9" }); s = ok(s, { t: "play", seat: 1, card: "CA" }); s = ok(s, { t: "play", seat: 2, card: "SK" }); s = ok(s, { t: "play", seat: 3, card: "HJ" });
  assert.equal(s.partner, 3); assert.equal(s.clar, 1);
  assert.equal(D.knownParty(s, 3), "re"); assert.equal(D.knownParty(s, 1), "kontra");
  assert.equal(D.apply(s, { t: "call", seat: 1, p: "re", a: "re" }).err, "party");
  s = ok(s, { t: "call", seat: 3, p: "re", a: "re" });         // clarified in trick 1: no shift, 11 cards still fine
  const left = h2.map((h) => h.slice()); for (const [seat, c] of [[0, "C9"], [1, "CA"], [2, "SK"], [3, "HJ"]]) left[seat].splice(left[seat].indexOf(c), 1);
  s = playOut(s, h2.map((h, i) => left[i]));
  const r2 = D.result(s, { hands: h2 });
  assert.ok(!r2.solo); assert.deepEqual(r2.re.sort(), [0, 3]); assert.equal(sum(r2.points), 0);
  assert.deepEqual(D.audit(s, { hands: h2 }), []);
});
test("Hochzeit mit Klaerungsstich im zweiten Stich verschiebt die Fristen um eine Karte", () => {
  const s = { phase: "play", kind: "hochzeit", soloist: 0, partner: 2, clar: 2, played: [2, 2, 2, 2], level: { re: -1, kontra: -1 }, claim: [null, null, null, null], calls: [], tricks: [], trick: { lead: 2, cards: [] } };
  assert.equal(D.apply(s, { t: "call", seat: 1, p: "kontra", a: "kontra" }).ok, true);   // 10 cards >= 11 - 1
  s.played = [3, 3, 3, 3];
  assert.equal(D.apply(s, { t: "call", seat: 1, p: "kontra", a: "kontra" }).err, "late");
});
test("Stille Hochzeit: wer beide Kreuz-Damen hat und gesund sagt, spielt allein und wird wie ein Solo gewertet", () => {
  const hands = [
    ["CQ", "CQ", "HT", "HT", "SQ", "SQ", "HQ", "HQ", "DQ", "DQ", "CJ", "CJ"],
    ["CA", "CA", "CT", "CT", "CK", "CK", "C9", "C9", "SA", "SA", "ST", "ST"],
    ["SK", "SK", "S9", "S9", "HA", "HA", "HK", "HK", "H9", "H9", "SJ", "SJ"],
    ["HJ", "HJ", "DJ", "DJ", "DA", "DA", "DT", "DT", "DK", "DK", "D9", "D9"]];
  let s = sayAll(D.start({ dealer: 3 }), ["gesund", "gesund", "gesund", "gesund"]);
  s = playOut(s, hands);
  const r = D.result(s, { hands });
  assert.equal(r.kind, "stille"); assert.ok(r.solo); assert.deepEqual(r.re, [0]);
  assert.equal(sum(r.points), 0); assert.equal(r.points[0], 3 * r.value * (r.winner === "re" ? 1 : -1));
});
test("Solo wird dreifach fuer den Solisten gewertet, keine Sonderpunkte", () => {
  for (const kind of ["damen", "buben", "fleischlos", "kreuz", "pik", "herz", "karo"]) {
    const hands = deal(kind.length * 31);
    let s = sayAll(D.start({ dealer: 0 }), ["gesund", "vorbehalt", "gesund", "gesund"]);
    s = ok(s, { t: "vorbehalt", seat: 1, v: kind });
    s = playOut(s, hands);
    const r = D.result(s, { hands });
    assert.ok(r.solo); assert.equal(sum(r.points), 0); assert.equal(r.points[1], -3 * r.points[0]);
    assert.ok(!r.lines.some((l) => ["doppelkopf", "fuchs", "karlchen", "gegen_die_alten"].includes(l.k)), kind);
    assert.deepEqual(D.audit(s, { hands }), [], kind);
  }
});
test("Sonderpunkte: Doppelkopf, Fuchs gefangen, Karlchen im letzten Stich", () => {
  const hands = [["CQ"], ["SQ"], ["DA"], ["CQ"]];       // only the party matters here: seats 0 and 3 are Re
  const full = { hands: hands.map((h) => h.concat(Array(11).fill("C9"))) };
  const tricks = [];
  tricks.push({ winner: 0, eyes: 44, cards: [{ seat: 0, card: "HT" }, { seat: 1, card: "CA" }, { seat: 2, card: "DA" }, { seat: 3, card: "ST" }] });
  for (let i = 0; i < 10; i++) tricks.push({ winner: 1, eyes: 17, cards: [{ seat: 1, card: "C9" }] });
  tricks.push({ winner: 3, eyes: 26, cards: [{ seat: 0, card: "D9" }, { seat: 1, card: "D9" }, { seat: 2, card: "DK" }, { seat: 3, card: "CJ" }] });
  const r = D.result({ kind: "normal", level: { re: -1, kontra: -1 }, tricks }, full);
  const re = r.lines.filter((l) => l.p === "re").map((l) => l.k);
  for (const k of ["doppelkopf", "fuchs", "karlchen"]) assert.ok(re.includes(k), k + " in " + re);
  assert.equal(sum(r.points), 0);
});
test("Audit: Nicht-Bedienen, fremde Karte, falsche Ansage und falsche Hochzeit fallen auf", () => {
  const hands = [
    ["CA", "D9", "C9", "C9", "SA", "SA", "SK", "SK", "S9", "S9", "HA", "HA"],
    ["CQ", "CT", "CT", "CK", "CK", "HK", "HK", "H9", "H9", "ST", "ST", "SJ"],
    ["CQ", "CA", "HT", "HT", "SQ", "SQ", "HQ", "HQ", "DQ", "DQ", "CJ", "CJ"],
    ["HJ", "HJ", "DJ", "DJ", "DA", "DA", "DT", "DT", "DK", "DK", "D9", "SJ"]];
  let s = sayAll(D.start({ dealer: 3 }), ["gesund", "gesund", "gesund", "gesund"]);
  s = ok(s, { t: "call", seat: 0, p: "re", a: "re" });                  // seat 0 has no Club Queen
  s = ok(s, { t: "play", seat: 0, card: "CA" });
  s = ok(s, { t: "play", seat: 1, card: "HK" });                        // has clubs: must follow
  s = ok(s, { t: "play", seat: 2, card: "C9" });                        // never had a club nine
  const why = D.audit(s, { hands }).map((x) => x.seat + ":" + x.why).sort();
  assert.deepEqual(why, ["0:ansage", "1:bedienen", "2:karte"]);
  let w = sayAll(D.start({ dealer: 3 }), ["vorbehalt", "gesund", "gesund", "gesund"]);
  w = ok(w, { t: "vorbehalt", seat: 0, v: "hochzeit" });
  assert.ok(D.audit(w, { hands }).some((x) => x.seat === 0 && x.why === "hochzeit"));
});
test("apply prueft Reihenfolge, Format und doppelte Karten und veraendert den alten Zustand nicht", () => {
  let s = sayAll(D.start({ dealer: 3 }), ["gesund", "gesund", "gesund", "gesund"]);
  const before = JSON.stringify(s);
  assert.equal(D.apply(s, { t: "play", seat: 1, card: "CA" }).err, "turn");
  assert.equal(D.apply(s, { t: "play", seat: 0, card: "C8" }).err, "card");
  assert.equal(D.apply(s, { t: "play", seat: 9, card: "CA" }).err, "format");
  assert.equal(D.apply(s, null).err, "format");
  s = ok(s, { t: "play", seat: 0, card: "CA" }); s = ok(s, { t: "play", seat: 1, card: "CA" });
  assert.equal(D.apply(s, { t: "play", seat: 2, card: "CA" }).err, "card");
  assert.equal(JSON.stringify(D.start({ dealer: 3 })) !== before, true);
  assert.equal(D.done(s), false); assert.equal(D.turn(s), 2);
});

test("Hausregeln: nur bekannte Namen, feste Reihenfolge; zweite Dulle sticht die erste nur mit Regel", () => {
  assert.deepEqual(D.rules(["nosp", "x", "dulle", "dulle"]), ["dulle", "nosp"]); assert.deepEqual(D.rules("dulle"), []);
  assert.deepEqual(D.start({ rules: ["dulle"] }).rules, ["dulle"]); assert.deepEqual(D.start().rules, []);
  const T = (kind, cs, r) => D.trickWinner(kind, cs.map((card, i) => ({ seat: i, card })), r);
  assert.equal(T("normal", ["HT", "CQ", "HT", "D9"]), 0);
  assert.equal(T("normal", ["HT", "CQ", "HT", "D9"], ["dulle"]), 2);
  assert.equal(T("normal", ["CA", "CA", "C9", "CK"], ["dulle"]), 0, "andere gleiche Karten: weiter die erste");
  assert.equal(T("damen", ["HA", "HT", "HT", "H9"], ["dulle"]), 0, "im Damensolo ist die Herz 10 keine Dulle");
});
test("Warum? am Stich: angespielt, Gewinner, Grund und wie jede Karte bedient hat", () => {
  const E = (kind, cs, r) => D.explain(kind, cs.map((card, i) => ({ seat: (i + 1) % 4, card })), r);
  const a = E("normal", ["CA", "CT", "D9", "SA"]);
  assert.deepEqual([a.led, a.win, a.seat, a.card, a.why], ["C", 2, 3, "D9", "trump"]);
  assert.deepEqual(a.plays.map((p) => p.how), ["lead", "follow", "trump", "off"]);
  assert.equal(a.order[0], "HT");
  assert.equal(E("normal", ["HA", "HK", "H9", "HK"]).why, "high");
  assert.equal(E("normal", ["HT", "CQ", "HT", "D9"]).why, "first");
  const d = E("normal", ["HT", "CQ", "HT", "D9"], ["dulle"]); assert.equal(d.why, "dulle"); assert.equal(d.win, 2);
  assert.deepEqual(E("normal", ["HA", "HT"]).plays.map((p) => p.how), ["lead", "trump"], "die Dulle bedient Herz nicht");
  assert.equal(D.explain("normal", []), null);
});
test("Hausregel ohne Sonderpunkte: kein Fuchs, Doppelkopf, Karlchen; gegen die Alten bleibt", () => {
  let found = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const hands = deal(seed);
    if (hands.some((h) => h.filter((c) => c === "CQ").length === 2)) continue;
    const run = (rules) => { let s = sayAll(D.start({ dealer: seed % 4, rules }), ["gesund", "gesund", "gesund", "gesund"]); s = playOut(s, hands); return D.result(s, { hands }); };
    const a = run([]), b = run(["nosp"]);
    assert.ok(!b.lines.some((l) => ["fuchs", "doppelkopf", "karlchen"].indexOf(l.k) >= 0));
    if (a.lines.some((l) => ["fuchs", "doppelkopf", "karlchen"].indexOf(l.k) >= 0)) found++;
    assert.equal(a.lines.some((l) => l.k === "gegen_die_alten"), b.lines.some((l) => l.k === "gegen_die_alten"));
    assert.equal(sum(b.points), 0);
  }
  assert.ok(found > 0, "ohne Regel kommen Sonderpunkte vor");
});
