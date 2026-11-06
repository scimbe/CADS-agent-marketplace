// The Auto player (doko.auto / skat.auto): for many seeded deals every move it makes must be one the rules offer, must
// be accepted by apply(), and the finished hand must pass the audit with the real hands. Same state, same move.
const test = require("node:test"), assert = require("node:assert/strict");
const D = require("../src/doko.js"), S = require("../src/skat.js");

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function deal(R, seed) {
  const r = rng(seed), d = R.DECK.slice();
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  const hands = []; for (let s = 0; s < R.SEATS; s++) hands.push(d.slice(s * R.HAND, (s + 1) * R.HAND));
  return { hands, skat: d.slice(R.SEATS * R.HAND) };
}
const same = (a, b) => JSON.stringify(Object.assign({}, a, { cards: a.cards && a.cards.slice().sort() })) === JSON.stringify(Object.assign({}, b, { cards: b.cards && b.cards.slice().sort() }));
// One auto move: it is offered by actions() (push: two of the seat's cards), apply() takes it, and it is deterministic.
function autoStep(R, s, seat, hand) {
  const a = R.auto(s, seat, hand);
  assert.ok(a, "auto has a move in phase " + s.phase);
  assert.deepEqual(R.auto(JSON.parse(JSON.stringify(s)), seat, hand.slice()), a, "deterministic");
  if (a.t === "push") { assert.equal(a.cards.length, 2); assert.notEqual(a.cards[0], a.cards[1]); a.cards.forEach((c) => assert.ok(hand.includes(c))); }
  else assert.ok(R.actions(s, seat, hand).some((x) => same(x, a)), "offered: " + JSON.stringify(a));
  const r = R.apply(s, a); assert.ok(r.ok, JSON.stringify(a) + " -> " + r.err);
  return { a, s: r.state };
}

test("Doppelkopf: Auto spielt 300 gemischte Spiele regelgerecht zu Ende (auch nach Vorbehalt: Hochzeit oder Solo)", () => {
  let solos = 0, weddings = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const full = deal(D, seed), hands = full.hands.map((h) => h.slice());
    let s = D.start({ dealer: seed % 4 });
    const reserving = seed % 3 === 0 ? (s.dealer + 1 + (seed % 4)) % 4 : -1;    // every third deal one seat says "Vorbehalt" by hand
    for (let n = 0; n < 200 && !D.done(s); n++) {
      const seat = D.turn(s);
      if (s.phase === "vorbehalt" && seat === reserving) { s = D.apply(s, { t: "vorbehalt", seat, v: "vorbehalt" }).state; continue; }
      const r = autoStep(D, s, seat, hands[seat]); s = r.s;
      if (r.a.t === "play") hands[seat].splice(hands[seat].indexOf(r.a.card), 1);
    }
    assert.ok(D.done(s), "seed " + seed + " ended");
    assert.ok(s.calls.length === 0, "Auto never calls");
    assert.deepEqual(D.audit(s, full), [], "seed " + seed);
    const res = D.result(s, full); assert.equal(res.points.reduce((a, b) => a + b, 0), 0);
    if (s.say.includes("hochzeit")) weddings++; else if (s.kind !== "normal") solos++;
  }
  assert.ok(solos > 0 && weddings > 0, "solos " + solos + ", marriages " + weddings);
});

test("Doppelkopf: Auto spielt immer die schwaechste erlaubte Karte", () => {
  let s = D.start({ dealer: 3 });
  for (let i = 0; i < 4; i++) s = D.apply(s, { t: "vorbehalt", seat: D.turn(s), v: "gesund" }).state;
  // seat 0 leads: plain cards before trumps, the lowest first
  assert.deepEqual(D.auto(s, 0, ["CQ", "HT", "SA", "C9", "DA"]), { t: "play", seat: 0, card: "C9" });
  s = D.apply(s, { t: "play", seat: 0, card: "SA" }).state;
  // spades led: must follow with the lower spade; without spades the weakest other card (no trump wasted)
  assert.deepEqual(D.auto(s, 1, ["ST", "S9", "CQ"]), { t: "play", seat: 1, card: "S9" });
  assert.deepEqual(D.auto(s, 1, ["CQ", "HK", "DJ"]), { t: "play", seat: 1, card: "HK" });
  assert.equal(D.auto(s, 2, ["S9"]), null, "not this seat's turn");
});

test("Skat: Auto passt, sagt Hand an, drueckt, legt offen und spielt 300 gemischte Spiele regelgerecht zu Ende", () => {
  const seen = { hand: 0, push: 0, show: 0, out: 0 };
  for (let seed = 1; seed <= 300; seed++) {
    const full = deal(S, seed), hands = full.hands.map((h) => h.slice()), variant = seed % 4;
    let s = S.start({ dealer: seed % 3 }), pushed = [];
    const mh = S.middlehand(s.dealer);
    for (let n = 0; n < 200 && !S.done(s); n++) {
      const seat = S.turn(s);
      // by hand: Middlehand bids 18 (variant 0 leaves everyone on Auto: passed out); then the declarer picks up (1)
      // or announces ouvert from the hand (2), or Auto does all of it (3: a hand game)
      if (variant && s.phase === "bid" && seat === mh && s.bid.v === 0) { s = S.apply(s, { t: "bid", seat, v: 18 }).state; continue; }
      if (variant === 1 && s.phase === "skat") { s = S.apply(s, { t: "pickup", seat }).state; hands[seat] = hands[seat].concat(full.skat); continue; }
      if (variant === 2 && s.phase === "skat") { s = S.apply(s, { t: "declare", seat, game: "G", hand: true, schneider: true, schwarz: true, ouvert: true }).state; continue; }
      const r = autoStep(S, s, seat, hands[seat]); s = r.s;
      if (r.a.t === "play") hands[seat].splice(hands[seat].indexOf(r.a.card), 1);
      if (r.a.t === "push") { pushed = r.a.cards; hands[seat] = hands[seat].filter((c) => !pushed.includes(c)); seen.push++; }
      if (r.a.t === "show") seen.show++;
      if (r.a.t === "declare" && r.a.hand) seen.hand++;
    }
    assert.ok(S.done(s), "seed " + seed + " ended");
    if (s.passedOut) { seen.out++; continue; }
    const f = Object.assign({}, full, s.pickedUp ? { pushed } : {});
    assert.deepEqual(S.audit(s, f), [], "seed " + seed);
    assert.ok(S.result(s, f).points);
  }
  assert.ok(seen.hand && seen.push && seen.show && seen.out, JSON.stringify(seen));
});

test("Skat: Auto spielt immer die schwaechste erlaubte Karte", () => {
  let s = S.start({ dealer: 2 });
  s = S.apply(s, { t: "bid", seat: 1, v: 18 }).state; s = S.apply(s, { t: "pass", seat: 0 }).state; s = S.apply(s, { t: "pass", seat: 2 }).state;
  s = S.apply(s, { t: "declare", seat: 1, game: "H", hand: true }).state;
  assert.deepEqual(S.auto(s, 0, ["CA", "C7", "HJ", "H7"]), { t: "play", seat: 0, card: "C7" });
  s = S.apply(s, { t: "play", seat: 0, card: "CA" }).state;
  assert.deepEqual(S.auto(s, 1, ["CT", "C8", "H9"]), { t: "play", seat: 1, card: "C8" });
  assert.deepEqual(S.auto(s, 1, ["HA", "DT", "D7"]), { t: "play", seat: 1, card: "D7" });   // no clubs: no trump wasted
});
