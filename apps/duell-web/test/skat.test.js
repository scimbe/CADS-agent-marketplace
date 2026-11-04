const test = require("node:test"), assert = require("node:assert/strict");
const S = require("../src/skat.js");

// dealer 2: Forehand 0, Middlehand 1, Rearhand 2
const go = (s, a) => { const r = S.apply(s, a); assert.ok(r.ok, JSON.stringify(a) + " -> " + r.err); return r.state; };
const no = (s, a, err) => { const r = S.apply(s, a); assert.equal(r.ok, false, JSON.stringify(a)); if (err) assert.equal(r.err, err); };
function seq(s, list) { return list.reduce((x, a) => go(x, a), s); }
// A finished game built by hand: the declarer wins the tricks made of `mine`, seat (d+1)%3 the rest.
function finished(contract, opt) {
  const d = opt.d == null ? 0 : opt.d, s = S.start({ dealer: 2 });
  const down = opt.down || [], mine = opt.mine || [], rest = S.DECK.filter((c) => mine.indexOf(c) < 0 && down.indexOf(c) < 0);
  const tricks = [];
  for (let i = 0; i < mine.length; i += 3) tricks.push({ lead: d, cards: mine.slice(i, i + 3).map((c, k) => ({ seat: (d + k) % 3, card: c })), winner: d });
  for (let i = 0; i < rest.length; i += 3) tricks.push({ lead: (d + 1) % 3, cards: rest.slice(i, i + 3).map((c, k) => ({ seat: (d + 1 + k) % 3, card: c })), winner: (d + 1) % 3 });
  return Object.assign(s, { phase: "done", declarer: d, bid: Object.assign(s.bid, { v: opt.bid || 18, ask: null }), pickedUp: !contract.hand, pushed: !contract.hand,
    contract: Object.assign({ hand: false, schneider: false, schwarz: false, ouvert: false }, contract), tricks: tricks, trick: null, next: -1 });
}
function fullFor(d, hand, skatOrPushed, pickedUp) {
  const hands = [[], [], []]; hands[d] = hand;
  return pickedUp ? { hands, skat: skatOrPushed, pushed: skatOrPushed } : { hands, skat: skatOrPushed };
}
// cards with exactly the given eyes for the declarer's tricks (multiples of 3 cards)
const HIGH = ["CA", "SA", "HA", "DA", "CT", "ST", "HT", "DT", "CK", "SK", "HK", "DK"];   // 4*11+4*10+4*4 = 100

test("Deck, Augen und Reizwerte stimmen mit der ISkO", () => {
  assert.equal(S.DECK.length, 32); assert.equal(new Set(S.DECK).size, 32);
  assert.equal(S.eyes(S.DECK), 120);
  assert.deepEqual(S.BIDS.slice(0, 20), [18, 20, 22, 23, 24, 27, 30, 33, 35, 36, 40, 44, 45, 46, 48, 50, 54, 55, 59, 60]);
  assert.equal(S.BIDS[S.BIDS.length - 1], 264);       // Grand ouvert with 4
  const l = S.layout(); assert.equal(l.hands.length, 3); assert.deepEqual(l.skat, [30, 31]);
  assert.equal(new Set(l.hands.flat().concat(l.skat)).size, 32);
});

test("Reizen: Mittelhand sagt Vorhand, Vorhand haelt, Mittelhand passt, Hinterhand passt -> Vorhand spielt", () => {
  let s = S.start({ dealer: 2 });
  assert.equal(S.turn(s), 1);
  no(s, { t: "bid", seat: 0, v: 18 }, "turn"); no(s, { t: "bid", seat: 1, v: 19 }, "value");
  s = seq(s, [{ t: "bid", seat: 1, v: 18 }]); assert.equal(S.turn(s), 0);
  s = seq(s, [{ t: "hold", seat: 0 }, { t: "bid", seat: 1, v: 20 }, { t: "hold", seat: 0 }, { t: "pass", seat: 1 }]);
  assert.equal(S.turn(s), 2); no(s, { t: "bid", seat: 2, v: 20 }, "value");
  s = seq(s, [{ t: "pass", seat: 2 }]);
  assert.equal(s.phase, "skat"); assert.equal(s.declarer, 0); assert.equal(s.bid.v, 20);
});

test("Reizen: Mittelhand passt sofort, Hinterhand reizt Vorhand und uebernimmt", () => {
  let s = seq(S.start({ dealer: 2 }), [{ t: "pass", seat: 1 }]);
  assert.equal(S.turn(s), 2);
  s = seq(s, [{ t: "bid", seat: 2, v: 18 }, { t: "hold", seat: 0 }, { t: "bid", seat: 2, v: 23 }, { t: "pass", seat: 0 }]);
  assert.equal(s.phase, "skat"); assert.equal(s.declarer, 2); assert.equal(s.bid.v, 23);
});

test("Reizen: Vorhand passt auf Mittelhand, Hinterhand reizt weiter Mittelhand", () => {
  let s = seq(S.start({ dealer: 2 }), [{ t: "bid", seat: 1, v: 18 }, { t: "pass", seat: 0 }]);
  assert.equal(S.turn(s), 2);
  s = seq(s, [{ t: "bid", seat: 2, v: 20 }, { t: "hold", seat: 1 }, { t: "pass", seat: 2 }]);
  assert.equal(s.declarer, 1); assert.equal(s.bid.v, 20);
});

test("Reizen: Mittel- und Hinterhand passen, Vorhand darf spielen oder einpassen", () => {
  let s = seq(S.start({ dealer: 2 }), [{ t: "pass", seat: 1 }, { t: "pass", seat: 2 }]);
  assert.equal(S.turn(s), 0);
  assert.deepEqual(S.actions(s, 0, []).map((a) => a.t + (a.v || "")), ["bid18", "pass"]);
  const played = go(s, { t: "bid", seat: 0, v: 18 }); assert.equal(played.declarer, 0); assert.equal(played.phase, "skat");
  const thrown = go(s, { t: "pass", seat: 0 });
  assert.ok(S.done(thrown)); assert.equal(thrown.passedOut, true);
  assert.deepEqual(S.result(thrown, {}).points, [0, 0, 0]);
});

test("Skat aufnehmen, druecken, ansagen; Hand-Bedingungen der ISkO", () => {
  const base = seq(S.start({ dealer: 2 }), [{ t: "bid", seat: 1, v: 18 }, { t: "pass", seat: 0 }, { t: "pass", seat: 2 }]);
  // Hand: predictions allowed, ouvert only together with schwarz
  no(base, { t: "declare", seat: 1, game: "C", hand: true, ouvert: true, schneider: true }, "ouvert");
  no(base, { t: "declare", seat: 1, game: "C", hand: true, schwarz: true }, "schwarz");
  no(base, { t: "declare", seat: 1, game: "C", hand: false }, "hand");
  const hand = go(base, { t: "declare", seat: 1, game: "G", hand: true, schneider: true });
  assert.equal(hand.phase, "play"); assert.equal(S.turn(hand), 0, "Vorhand spielt aus");
  // with the skat: pick up, push (cards stay hidden), then announce; no predictions
  let s = go(base, { t: "pickup", seat: 1 }); assert.equal(s.phase, "push");
  no(s, { t: "declare", seat: 1, game: "C", hand: false }, "action");
  s = go(s, { t: "push", seat: 1 }); assert.equal(JSON.stringify(s).includes("pushed\":true"), true);
  no(s, { t: "declare", seat: 1, game: "C", hand: true }, "hand");
  no(s, { t: "declare", seat: 1, game: "C", hand: false, schneider: true }, "hand");
  const ouv = go(s, { t: "declare", seat: 1, game: "N", hand: false, ouvert: true });
  assert.equal(ouv.phase, "show"); assert.equal(S.turn(ouv), 1);
  const cards = ["C7", "C8", "C9", "S7", "S8", "S9", "H7", "H8", "D7", "D8"];
  const shown = go(ouv, { t: "show", seat: 1, cards }); assert.deepEqual(shown.open, cards); assert.equal(shown.phase, "play");
});

test("Ein ungueltiges Null (Wert unter dem Reizwert) kann nicht angesagt werden", () => {
  let s = seq(S.start({ dealer: 2 }), [{ t: "bid", seat: 1, v: 36 }, { t: "pass", seat: 0 }, { t: "pass", seat: 2 }]);
  no(s, { t: "declare", seat: 1, game: "N", hand: true }, "overbid");             // Null Hand 35 < 36
  go(s, { t: "declare", seat: 1, game: "N", hand: true, ouvert: true });           // Null ouvert Hand 59
  assert.ok(!S.actions(s, 1, []).some((a) => a.t === "declare" && a.game === "N" && !a.ouvert));
});

test("Trumpf und Stichgewinner in Farbspiel, Grand und Null", () => {
  const tr = (game, cards) => S.trickWinner(game, cards.map((c, i) => ({ seat: i, card: c })));
  assert.equal(tr("C", ["CA", "CT", "DJ"]), 2, "Karo-Bube ist Trumpf im Kreuzspiel");
  assert.equal(tr("C", ["HJ", "SJ", "CJ"]), 2, "Bubenreihenfolge Kreuz Pik Herz Karo");
  assert.equal(tr("H", ["SA", "SK", "S7"]), 0); assert.equal(tr("H", ["SA", "SK", "H7"]), 2);
  assert.equal(tr("S", ["ST", "SA", "DA"]), 1, "Zehn unter Ass");
  assert.equal(tr("G", ["CA", "CT", "HA"]), 0, "abgeworfene Farbe sticht nicht");
  assert.equal(tr("G", ["CA", "DJ", "CT"]), 1, "im Grand sind nur Buben Trumpf");
  assert.equal(S.isTrump("G", "CA"), false); assert.equal(S.isTrump("D", "DA"), true); assert.equal(S.isTrump("N", "CJ"), false);
  assert.equal(tr("N", ["CJ", "CT", "CQ"]), 2, "Null: A K D B 10 9 8 7, Bube ist Farbe");
  assert.equal(tr("N", ["CT", "CJ", "C9"]), 1);
});

test("Bedienen: actions bietet nur bedienbare Karten, Buben gehoeren zum Trumpf", () => {
  let s = seq(S.start({ dealer: 2 }), [{ t: "bid", seat: 1, v: 18 }, { t: "pass", seat: 0 }, { t: "pass", seat: 2 }, { t: "declare", seat: 1, game: "H", hand: true }]);
  s = go(s, { t: "play", seat: 0, card: "HA" });
  const legal = S.actions(s, 1, ["CJ", "C7", "S8"]).map((a) => a.card);
  assert.deepEqual(legal, ["CJ"], "Herz ausgespielt: Bube muss bedienen");
  assert.deepEqual(S.actions(s, 1, ["C7", "S8"]).map((a) => a.card), ["C7", "S8"]);
  no(s, { t: "play", seat: 2, card: "C7" }, "turn"); no(s, { t: "play", seat: 1, card: "HA" }, "twice");
});

test("ISkO-Beispiel: mit 2 Spiel 3 Kreuz = 36", () => {
  const hand = ["CJ", "SJ", "DJ", "CA", "CT", "CK", "C9", "HA", "SA", "D7"], skat = ["H7", "H8"];
  const s = finished({ game: "C" }, { mine: HIGH.slice(0, 6).concat(["S9", "S8", "S7"]), down: skat, bid: 36 });   // 63 eyes
  const r = S.result(s, fullFor(0, hand, skat, true));
  assert.equal(r.eyes.declarer, 64); assert.equal(r.value, 36); assert.equal(r.won, true);
  assert.deepEqual(r.points, [36, 0, 0]); assert.deepEqual(r.list, [86, 0, 0]);
  assert.deepEqual(r.lines.slice(0, 2), [{ k: "with", v: 2 }, { k: "game", v: 1 }]);
});

test("Grand Hand mit 4 und Schneider: (4+1+1+1)*24 = 168", () => {
  const hand = ["CJ", "SJ", "HJ", "DJ", "CA", "CT", "SA", "ST", "HA", "HT"], skat = ["D7", "D8"];
  const s = finished({ game: "G", hand: true }, { mine: HIGH.slice(0, 9).concat(["CK", "SK", "HK"]).filter((c, i, a) => a.indexOf(c) === i), down: skat });
  const r = S.result(s, fullFor(0, hand, skat, false));
  assert.ok(r.eyes.declarer >= 90); assert.equal(r.value, 168); assert.equal(r.won, true);
});

test("Null ouvert Hand = 59, verloren -118; Null endet beim ersten Stich des Alleinspielers", () => {
  const won = finished({ game: "N", hand: true, ouvert: true }, { mine: [], down: ["C7", "C8"], bid: 18 });
  const r = S.result(won, { hands: [[], [], []], skat: ["C7", "C8"] });
  assert.equal(r.value, 59); assert.deepEqual(r.points, [59, 0, 0]);
  const lost = finished({ game: "N", hand: false }, { mine: ["CA", "CK", "CQ"], down: ["C7", "C8"] });
  const r2 = S.result(lost, { hands: [[], [], []], skat: ["H7", "H8"], pushed: ["C7", "C8"] });
  assert.equal(r2.value, 23); assert.deepEqual(r2.points, [-46, 0, 0]); assert.deepEqual(r2.list, [-96, 40, 40]);
  // live: the soloist takes the first trick, the game stops there
  let s = seq(S.start({ dealer: 2 }), [{ t: "pass", seat: 1 }, { t: "pass", seat: 2 }, { t: "bid", seat: 0, v: 18 }, { t: "declare", seat: 0, game: "N", hand: true }]);
  s = seq(s, [{ t: "play", seat: 0, card: "CA" }, { t: "play", seat: 1, card: "C7" }, { t: "play", seat: 2, card: "C8" }]);
  assert.ok(S.done(s)); assert.equal(s.tricks.length, 1);
});

test("Verloren mit 60 Augen, Schneider des Alleinspielers zaehlt mit", () => {
  const hand = ["CJ", "CA", "CT", "CK", "CQ", "C9", "C8", "C7", "SA", "D7"], skat = ["H7", "H8"];
  // exactly 60: lost
  const s60 = finished({ game: "C" }, { mine: ["CA", "SA", "HA", "DA", "CT", "SK", "DJ", "D9", "D8"], down: skat });
  const r60 = S.result(s60, fullFor(0, hand, skat, true));
  assert.equal(r60.eyes.declarer, 60); assert.equal(r60.won, false); assert.equal(r60.value, 24); assert.deepEqual(r60.points, [-48, 0, 0]);
  // 30 or fewer: the soloist is schneider, one more multiplier
  const s29 = finished({ game: "C" }, { mine: ["CA", "SA", "D7", "D9", "D8", "S9"], down: skat });
  const r29 = S.result(s29, fullFor(0, hand, skat, true));
  assert.equal(r29.eyes.declarer, 22); assert.equal(r29.value, 36); assert.deepEqual(r29.points, [-72, 0, 0]);
  // no trick at all: schneider and schwarz
  const s0 = finished({ game: "C" }, { mine: [], down: skat });
  assert.equal(S.result(s0, fullFor(0, hand, skat, true)).value, 48);
});

test("Schneider angesagt, aber nicht erreicht: verloren mit den angesagten Stufen, ohne Extra fuer eigenen Schneider", () => {
  const hand = ["CJ", "SJ", "CA", "CT", "CK", "CQ", "C9", "C8", "C7", "SA"], skat = ["H7", "H8"];
  const s = finished({ game: "C", hand: true, schneider: true }, { mine: ["CA", "SA", "HA", "DA", "CT", "ST", "HT"], down: skat });
  // mit 2, Spiel, Hand, Schneider, angesagt = 6 * 12 = 72, lost doubled
  const r = S.result(s, fullFor(0, hand, skat, false));
  assert.ok(r.eyes.declarer >= 61 && r.eyes.declarer < 90); assert.equal(r.won, false); assert.equal(r.value, 72); assert.deepEqual(r.points, [-144, 0, 0]);
  const weak = finished({ game: "C", hand: true, schneider: true }, { mine: ["D7", "D8", "D9"], down: skat });
  assert.equal(S.result(weak, fullFor(0, hand, skat, false)).value, 72, "eigener Schneider bringt keine weitere Stufe");
  // Schwarz announced and made: with 2, game, hand, schneider, said, schwarz, said = 8 * 12 = 96
  const all = finished({ game: "C", hand: true, schneider: true, schwarz: true }, { mine: S.DECK.filter((c) => skat.indexOf(c) < 0), down: skat });
  const ra = S.result(all, fullFor(0, hand, skat, false)); assert.equal(ra.won, true); assert.equal(ra.value, 96);
});

test("Ueberreizt (ISkO 5.4.2): 36 gereizt, Herz Hand ohne 2, Kreuz-Bube im Skat -> verloren 40, doppelt 80", () => {
  const hand = ["HJ", "DJ", "HA", "HT", "HK", "HQ", "H9", "H8", "SA", "CA"], skat = ["CJ", "D7"];
  const s = finished({ game: "H", hand: true }, { mine: HIGH.slice(0, 8), down: skat, bid: 36 });
  const r = S.result(s, fullFor(0, hand, skat, false));
  assert.equal(r.overbid, true); assert.equal(r.won, false); assert.equal(r.value, 40); assert.deepEqual(r.points, [-80, 0, 0]);
  // without the jack in the skat it is ohne 2 hand = 40 and won
  const ok = S.result(s, fullFor(0, hand, ["D7", "D8"], false)); assert.equal(ok.won, true); assert.equal(ok.value, 40);
});

test("Spitzen werden aus Blatt und Skat gezaehlt, mit und ohne", () => {
  assert.deepEqual(S.tops("C", ["CJ", "SJ", "HJ", "DJ", "CA", "CT", "C9"]), { with: true, n: 6 });
  assert.deepEqual(S.tops("C", ["HJ", "DJ"]), { with: false, n: 2 });
  assert.deepEqual(S.tops("G", ["CJ", "SJ", "HJ", "DJ"]), { with: true, n: 4 });
  assert.deepEqual(S.tops("D", []), { with: false, n: 11 });
});

// A whole hand through apply(): bidding, skat, every card checked, then result and audit.
function deal(seed) {
  let x = seed; const r = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const d = S.DECK.slice(); for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  const L = S.layout(); return { hands: L.hands.map((h) => h.map((p) => d[p])), skat: L.skat.map((p) => d[p]) };
}
function playOut(s, hands, pick) {
  const h = hands.map((x) => x.slice());
  while (!S.done(s)) {
    const seat = S.turn(s), acts = S.actions(s, seat, h[seat]);
    const a = pick ? pick(acts, h[seat]) : acts[0];
    s = go(s, a); if (a.t === "play") h[seat].splice(h[seat].indexOf(a.card), 1);
  }
  return s;
}
test("Komplette Spiele ueber apply(): Augen 120, Wertung, Audit sauber", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const full = deal(seed), game = ["C", "S", "H", "D", "G"][seed % 5];
    let s = seq(S.start({ dealer: 2 }), [{ t: "bid", seat: 1, v: 18 }, { t: "pass", seat: 0 }, { t: "pass", seat: 2 }, { t: "pickup", seat: 1 }, { t: "push", seat: 1 }]);
    const twelve = full.hands[1].concat(full.skat), pushed = twelve.slice(10), hands = full.hands.slice(); hands[1] = twelve.slice(0, 10);
    s = go(s, { t: "declare", seat: 1, game, hand: false });
    s = playOut(s, hands);
    assert.equal(s.tricks.length, 10);
    const all = Object.assign({ pushed }, full), r = S.result(s, all);
    assert.equal(r.eyes.declarer + r.eyes.defenders, 120);
    assert.ok(r.points[1] !== 0 && r.points[0] === 0 && r.points[2] === 0);
    assert.ok(r.won ? r.points[1] === r.value : r.points[1] === -2 * r.value);
    assert.deepEqual(S.audit(s, all), [], "seed " + seed);
  }
});

test("Audit findet Nichtbedienen, fremde Karten, falsch Gedruecktes und falsches Offenlegen", () => {
  const full = deal(7);
  let s = seq(S.start({ dealer: 2 }), [{ t: "bid", seat: 1, v: 18 }, { t: "pass", seat: 0 }, { t: "pass", seat: 2 }, { t: "declare", seat: 1, game: "G", hand: true }]);
  // seat 0 leads, seat 1 renounces on purpose if it can
  const h = full.hands.map((x) => x.slice());
  const lead = h[0][0]; s = go(s, { t: "play", seat: 0, card: lead }); h[0].shift();
  const led = S.suitOf("G", lead), can = h[1].filter((c) => S.suitOf("G", c) === led), cant = h[1].filter((c) => S.suitOf("G", c) !== led);
  if (can.length && cant.length) {
    s = go(s, { t: "play", seat: 1, card: cant[0] });
    assert.ok(S.audit(s, full).some((v) => v.seat === 1 && v.why === "follow"));
  }
  // a card nobody was dealt to seat 2
  const s2 = seq(S.start({ dealer: 2 }), [{ t: "bid", seat: 1, v: 18 }, { t: "pass", seat: 0 }, { t: "pass", seat: 2 }, { t: "declare", seat: 1, game: "G", hand: true },
    { t: "play", seat: 0, card: full.hands[0][0] }, { t: "play", seat: 1, card: full.hands[2][0] }]);
  assert.ok(S.audit(s2, full).some((v) => v.seat === 1 && v.why === "notInHand"));
  // pushed cards that were neither in hand nor skat
  const s3 = seq(S.start({ dealer: 2 }), [{ t: "bid", seat: 1, v: 18 }, { t: "pass", seat: 0 }, { t: "pass", seat: 2 }, { t: "pickup", seat: 1 }, { t: "push", seat: 1 }, { t: "declare", seat: 1, game: "C", hand: false }]);
  assert.ok(S.audit(s3, Object.assign({ pushed: full.hands[0].slice(0, 2) }, full)).some((v) => v.why === "pushed"));
  // a hand game but the reveal says something was pushed
  const s4 = seq(S.start({ dealer: 2 }), [{ t: "bid", seat: 1, v: 18 }, { t: "pass", seat: 0 }, { t: "pass", seat: 2 }, { t: "declare", seat: 1, game: "C", hand: true }]);
  assert.ok(S.audit(s4, Object.assign({ pushed: full.skat }, full)).some((v) => v.why === "hand"));
  // ouvert: what was laid open must be the real hand
  const s5 = seq(S.start({ dealer: 2 }), [{ t: "bid", seat: 1, v: 18 }, { t: "pass", seat: 0 }, { t: "pass", seat: 2 }, { t: "declare", seat: 1, game: "N", hand: true, ouvert: true },
    { t: "show", seat: 1, cards: full.hands[0] }]);
  assert.ok(S.audit(s5, full).some((v) => v.seat === 1 && v.why === "open"));
  assert.deepEqual(S.audit(seq(S.start({ dealer: 2 }), [{ t: "bid", seat: 1, v: 18 }, { t: "pass", seat: 0 }, { t: "pass", seat: 2 }, { t: "declare", seat: 1, game: "N", hand: true, ouvert: true },
    { t: "show", seat: 1, cards: full.hands[1] }]), full), []);
});

test("Offenes Blatt wird sofort geprueft: Alleinspieler muss bedienen, Gegner koennen keine offene Karte spielen", () => {
  const mine = ["C7", "C8", "C9", "S7", "S8", "S9", "H7", "H8", "D7", "D8"];
  let s = seq(S.start({ dealer: 2 }), [{ t: "bid", seat: 1, v: 18 }, { t: "pass", seat: 0 }, { t: "pass", seat: 2 }, { t: "declare", seat: 1, game: "N", hand: true, ouvert: true }, { t: "show", seat: 1, cards: mine }]);
  no(s, { t: "play", seat: 0, card: "C7" }, "open");
  s = go(s, { t: "play", seat: 0, card: "CA" });
  no(s, { t: "play", seat: 1, card: "S7" }, "open"); no(s, { t: "play", seat: 1, card: "CA" }, "twice");
  go(s, { t: "play", seat: 1, card: "C9" });
});

test("Zustand bleibt reines JSON und apply veraendert ihn nie", () => {
  const s = S.start({ dealer: 0 }), before = JSON.stringify(s);
  assert.equal(S.forehand(0), 1); assert.equal(S.turn(s), 2, "Geber 0: Mittelhand ist Sitz 2");
  S.apply(s, { t: "bid", seat: 2, v: 18 }); assert.equal(JSON.stringify(s), before);
  assert.deepEqual(JSON.parse(before), s);
  no(s, null, "action"); no(s, { t: "fly", seat: 2 }, "action");
});

test("Hausregel Ramsch: alle passen, nur Buben sind Trumpf, meiste Augen verlieren, Skat an den letzten Stich", () => {
  assert.deepEqual(S.rules(["kontra", "ramsch", "bock"]), ["ramsch", "kontra"]);
  const passAll = [{ t: "pass", seat: 1 }, { t: "pass", seat: 2 }, { t: "pass", seat: 0 }];
  assert.equal(seq(S.start({ dealer: 2 }), passAll).passedOut, true, "ohne Regel: neu geben");
  for (let seed = 1; seed <= 30; seed++) {
    const full = deal(seed);
    let s = seq(S.start({ dealer: 2, rules: ["ramsch"] }), passAll);
    assert.equal(s.phase, "play"); assert.equal(s.contract.ramsch, true); assert.equal(S.turn(s), 0); assert.equal(s.declarer, -1);
    assert.ok(!S.actions(s, 1, full.hands[1]).some((a) => a.t === "kontra"));
    s = playOut(s, full.hands);
    const r = S.result(s, full), last = s.tricks[9].winner;
    assert.equal(r.seatEyes.reduce((a, b) => a + b, 0), 120);
    assert.ok(r.seatEyes[last] >= S.eyes(full.skat));
    if (r.durchmarsch >= 0) assert.deepEqual(r.points.filter((p) => p), [120]);
    else { const top = Math.max(...r.seatEyes); assert.deepEqual(r.losers, [0, 1, 2].filter((i) => r.seatEyes[i] === top)); r.losers.forEach((i) => assert.equal(r.points[i], -top)); }
    assert.deepEqual(r.list, r.points); assert.deepEqual(S.audit(s, full), [], "seed " + seed);
  }
});
test("Hausregel Kontra/Re: Gegner vor der ersten eigenen Karte, Alleinspieler vor der zweiten; jedes verdoppelt", () => {
  const start = (rules) => seq(S.start({ dealer: 2, rules }), [{ t: "bid", seat: 1, v: 18 }, { t: "pass", seat: 0 }, { t: "pass", seat: 2 }, { t: "declare", seat: 1, game: "C", hand: true }]);
  no(start([]), { t: "kontra", seat: 0 }, "kontra");
  let s = start(["kontra"]);
  assert.ok(S.actions(s, 2, []).some((a) => a.t === "kontra"), "auch ausser der Reihe");
  assert.ok(!S.actions(s, 1, []).some((a) => a.t === "kontra"));
  no(s, { t: "re", seat: 1 }, "kontra");
  s = go(s, { t: "play", seat: 0, card: "C7" });
  no(s, { t: "kontra", seat: 0 }, "kontra");                       // already played a card
  s = go(s, { t: "kontra", seat: 2 }); assert.equal(s.kontra, 1);
  no(s, { t: "kontra", seat: 2 }, "kontra");
  s = go(s, { t: "play", seat: 1, card: "C8" }); s = go(s, { t: "re", seat: 1 }); assert.equal(s.kontra, 2);
  const r1 = S.start({ dealer: 2, rules: ["kontra"] });
  const base = finished({ game: "C", hand: true }, { mine: HIGH.slice(0, 9).concat(["CJ", "SJ", "HJ"]) });
  const plain = S.result(base, fullFor(0, ["CJ", "SJ"], ["S7", "S8"], false));
  const dbl = S.result(Object.assign({}, base, { rules: r1.rules, kontra: 2 }), fullFor(0, ["CJ", "SJ"], ["S7", "S8"], false));
  assert.equal(dbl.value, plain.value * 4); assert.ok(dbl.lines.some((l) => l.k === "re" && l.v === 4));
});
test("Warum? im Skat: Bube ist Trumpf, Fehl nur in der Farbe", () => {
  const E = (g, cs) => S.explain(g, cs.map((card, i) => ({ seat: i, card })));
  const a = E("H", ["CA", "DJ", "C7"]); assert.deepEqual([a.led, a.win, a.why], ["C", 1, "trump"]); assert.deepEqual(a.plays.map((p) => p.how), ["lead", "trump", "follow"]);
  assert.deepEqual(E("G", ["SA", "ST", "HA"]).plays.map((p) => p.how), ["lead", "follow", "off"]);
  assert.equal(E("N", ["SJ", "SA", "ST"]).win, 1); assert.deepEqual(E("N", ["SJ"]).order, []);
});
