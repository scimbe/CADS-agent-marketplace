// Bauernskat rules (src/bauernskat.js) without a table: a seeded deal, the face-up cards and the flips applied the way
// the table applies them, hands kept outside the state.
const test = require("node:test"), assert = require("node:assert/strict");
const B = require("../src/bauernskat.js");

function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
function shuffled(seed) { const r = rng(seed), d = B.DECK.slice(); for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; }
// deck[pos] by B.layout(): the truth only the reveal shows
function deal(deck) {
  const lay = B.layout();
  return { hands: lay.hands.map((ps) => ps.map((p) => deck[p])), stacks: lay.stacks.map((row) => row.map((x) => ({ up: deck[x.up], down: deck[x.down] }))) };
}
function go(s, a) { const r = B.apply(s, a); assert.ok(r.ok, JSON.stringify(a) + " -> " + r.err); return r.state; }
// What the table does on its own: open every card reveals() names.
function uncover(s, full) {
  for (const r of B.reveals(s)) s = go(s, { t: "turn", seat: r.seat, i: r.i, card: full.stacks[r.seat][r.i][r.kind] });
  return s;
}
function handLeft(s, full, seat) { const gone = new Set(s.tricks.concat(s.trick ? [s.trick] : []).flatMap((t) => t.cards.map((x) => x.card))); return full.hands[seat].filter((c) => !gone.has(c)); }
function begin(full, o = {}) { return uncover(B.start({ dealer: o.dealer || 0, rules: o.rules || [] }), full); }

test("Austeilen: 8 Hand, 4 offen, 4 verdeckt je Spieler; offene Karten stehen erst nach dem Aufdecken im Zustand, verdeckte nie", () => {
  const lay = B.layout(), all = lay.hands.flat().concat(lay.stacks.flat().flatMap((x) => [x.up, x.down]));
  assert.equal(new Set(all).size, 32); assert.equal(lay.hands[0].length, 8); assert.equal(lay.stacks[1].length, 4);
  const full = deal(shuffled(7)), s0 = B.start({ dealer: 0 });
  assert.equal(s0.phase, "deal"); assert.equal(B.reveals(s0).length, 8); assert.ok(B.reveals(s0).every((r) => r.kind === "up"));
  assert.equal(B.turn(s0), -1);
  const s = begin(full);
  assert.equal(s.phase, "declare"); assert.equal(B.turn(s), 1, "Vorhand (nicht der Geber) sagt an");
  const json = JSON.stringify(s);
  full.hands.flat().forEach((c) => assert.ok(!json.includes('"' + c + '"'), "Handkarte " + c + " steht nicht im Zustand"));
  full.stacks.flat().forEach((x) => assert.ok(!json.includes('"' + x.down + '"'), "verdeckte Karte " + x.down + " steht nicht im Zustand"));
  assert.deepEqual(B.reveals(s), []);
});

test("Ansage: Farbe oder Grand; Null nur mit Hausregel; Vorhand spielt aus", () => {
  const full = deal(shuffled(11)), s = begin(full);
  assert.deepEqual(B.actions(s, 1, []).map((a) => a.game), ["C", "S", "H", "D", "G"]);
  assert.deepEqual(B.actions(s, 0, []), []);
  assert.equal(B.apply(s, { t: "declare", seat: 1, game: "N" }).err, "game");
  assert.equal(B.apply(s, { t: "declare", seat: 0, game: "C" }).err, "turn");
  const n = begin(full, { rules: ["null"] });
  assert.ok(B.actions(n, 1, []).some((a) => a.game === "N"));
  const p = go(s, { t: "declare", seat: 1, game: "G" });
  assert.equal(p.phase, "play"); assert.equal(B.turn(p), 1);
});

// A hand-made deal for the exact cases below.
function fixed() {
  return {
    hands: [["CA", "CT", "CK", "CQ", "C9", "C8", "C7", "SA"], ["HA", "HT", "HK", "HQ", "H9", "H8", "H7", "ST"]],
    stacks: [[{ up: "CJ", down: "SK" }, { up: "DA", down: "SQ" }, { up: "DT", down: "S9" }, { up: "DK", down: "S8" }],
      [{ up: "SJ", down: "S7" }, { up: "HJ", down: "DQ" }, { up: "DJ", down: "D9" }, { up: "D8", down: "D7" }]]
  };
}

test("Bedienen: offene Stapelkarten zaehlen wie Handkarten; wer offen bedienen kann, darf nicht abwerfen", () => {
  const full = fixed();
  let s = go(begin(full), { t: "declare", seat: 1, game: "H" });
  s = go(s, { t: "play", seat: 1, card: "D8" });                               // Karo vom Stapel ausgespielt
  const legal = B.actions(s, 0, handLeft(s, full, 0)).map((a) => a.card).sort();
  assert.deepEqual(legal, ["DA", "DK", "DT"], "Karo liegt offen: nur Karo");
  assert.equal(B.apply(s, { t: "play", seat: 0, card: "CA" }).err, "follow", "offenes Karo, Handkarte abgeworfen: sofort erkennbar");
  assert.equal(B.apply(s, { t: "play", seat: 0, card: "HJ" }).err, "card", "liegt offen beim Gegner");
  assert.equal(B.apply(s, { t: "play", seat: 1, card: "HA" }).err, "turn");
});

test("Aufdecken: die verdeckte Karte unter einer gespielten offenen Karte kommt erst nach dem Stich hoch, vorher geht kein Zug", () => {
  const full = fixed();
  let s = go(begin(full), { t: "declare", seat: 1, game: "H" });
  s = go(s, { t: "play", seat: 1, card: "D8" });
  assert.deepEqual(B.reveals(s), [], "mitten im Stich bleibt sie verdeckt");
  assert.equal(s.stacks[1][3].top, null); assert.equal(s.stacks[1][3].under, true);
  s = go(s, { t: "play", seat: 0, card: "DA" });
  assert.equal(s.tricks[0].winner, 0);
  assert.deepEqual(B.reveals(s).map((r) => [r.seat, r.i, r.kind]).sort(), [[0, 1, "down"], [1, 3, "down"]]);
  assert.equal(B.apply(s, { t: "play", seat: 0, card: "CA" }).err, "flip");
  assert.deepEqual(B.actions(s, 0, handLeft(s, full, 0)), [], "kein Zug, solange aufgedeckt wird");
  assert.equal(B.auto(s, 0, handLeft(s, full, 0)), null);
  assert.equal(B.apply(s, { t: "turn", seat: 0, i: 0, card: "SK" }).err, "turn", "nur was dran ist");
  assert.equal(B.apply(s, { t: "turn", seat: 0, i: 1, card: "CJ" }).err, "turn", "eine schon offene Karte nicht");
  s = uncover(s, full);
  assert.equal(s.stacks[0][1].top, "SQ"); assert.equal(s.stacks[0][1].under, false); assert.equal(s.stacks[1][3].top, "D7");
  assert.ok(B.actions(s, 0, handLeft(s, full, 0)).some((a) => a.card === "SQ"), "die aufgedeckte Karte ist spielbar");
  s = go(s, { t: "play", seat: 0, card: "SQ" });
  s = go(s, { t: "play", seat: 1, card: "ST" });
  assert.deepEqual(B.reveals(s), [], "ein leerer Stapel wird nicht nochmal aufgedeckt");
  assert.equal(s.stacks[0][1].top, null); assert.equal(s.stacks[0][1].under, false);
});

test("Wertung: Spitzen aus allen 16 Karten des Ansagers, Schneider, Schwarz, verloren doppelt, Null 23", () => {
  const mk = (game, decl, wins, extra = {}) => ({ declarer: decl, contract: { game }, kontra: extra.kontra || 0,
    tricks: wins.map((w, i) => ({ winner: w, cards: w === decl ? [{ seat: 0, card: (extra.cards || [])[i * 2] || "C7" }, { seat: 1, card: (extra.cards || [])[i * 2 + 1] || "C8" }] : [] })) });
  const full = fixed();
  // Ansager Sitz 0 hat CJ (kein SJ): mit 1, Spiel 2; Kreuz 12 -> 24
  const allEyes = B.DECK.slice();                                         // 120 Augen in 16 Stichen
  const won = { declarer: 0, contract: { game: "C" }, kontra: 0, tricks: Array.from({ length: 16 }, (_, i) => ({ winner: i < 15 ? 0 : 1, cards: [{ seat: 0, card: allEyes[i * 2] }, { seat: 1, card: allEyes[i * 2 + 1] }] })) };
  let r = B.result(won, full);
  const e = r.eyes.declarer; assert.ok(e >= 90, "Schneider: " + e);
  assert.deepEqual(r.lines.slice(0, 2), [{ k: "with", v: 1 }, { k: "game", v: 1 }]);
  assert.equal(r.value, 12 * 3); assert.deepEqual(r.points, [36, 0]); assert.equal(r.won, true);
  const sw = Object.assign({}, won, { tricks: won.tricks.map((t) => Object.assign({}, t, { winner: 0 })) });
  r = B.result(sw, full); assert.equal(r.value, 12 * 4, "Schwarz"); assert.equal(r.eyes.declarer, 120);
  const lost = Object.assign({}, won, { tricks: won.tricks.map((t) => Object.assign({}, t, { winner: 1 })) });
  r = B.result(lost, full); assert.equal(r.won, false); assert.equal(r.value, 12 * 4); assert.deepEqual(r.points, [-96, 0]);
  const g = Object.assign({}, won, { declarer: 1, contract: { game: "G" } });   // Sitz 1: ohne CJ -> ohne 1, Spiel 2, Grand 24
  r = B.result(g, full); assert.deepEqual(r.lines[0], { k: "without", v: 1 });
  const k = Object.assign({}, won, { kontra: 2 }); r = B.result(k, full); assert.equal(r.value, 36 * 4, "Kontra und Re");
  const n = mk("N", 1, [0, 0, 1]); r = B.result(n, full); assert.equal(r.value, 23); assert.deepEqual(r.points, [0, -46]);
  const n2 = mk("N", 1, []); r = B.result(n2, full); assert.deepEqual(r.points, [0, 23]);
  // 60:60 ist verloren
  const half = { declarer: 0, contract: { game: "D" }, kontra: 0, tricks: [{ winner: 0, cards: [{ seat: 0, card: "CA" }, { seat: 1, card: "SA" }] }, { winner: 0, cards: [{ seat: 0, card: "HA" }, { seat: 1, card: "DA" }] }, { winner: 0, cards: [{ seat: 0, card: "CT" }, { seat: 1, card: "DK" }] }, { winner: 0, cards: [{ seat: 0, card: "CJ" }, { seat: 1, card: "C7" }] }] };
  r = B.result(half, full); assert.equal(r.eyes.declarer, 60); assert.equal(r.won, false);
});

test("Kontra & Re (Hausregel): Gegenspieler vor seiner ersten Karte, Ansager vor seiner zweiten", () => {
  const full = fixed();
  let s = go(begin(full, { rules: ["kontra"] }), { t: "declare", seat: 1, game: "H" });
  assert.ok(B.actions(s, 0, []).some((a) => a.t === "kontra")); assert.equal(B.apply(s, { t: "kontra", seat: 1 }).err, "kontra");
  s = go(s, { t: "kontra", seat: 0 }); s = go(s, { t: "re", seat: 1 }); assert.equal(s.kontra, 2);
  const plain = go(begin(full), { t: "declare", seat: 1, game: "H" });
  assert.equal(B.apply(plain, { t: "kontra", seat: 0 }).err, "kontra", "ohne Hausregel kein Kontra");
});

test("Null endet beim ersten Stich des Ansagers", () => {
  const full = fixed();
  let s = go(begin(full, { rules: ["null"] }), { t: "declare", seat: 1, game: "N" });
  s = go(s, { t: "play", seat: 1, card: "HA" }); s = go(s, { t: "play", seat: 0, card: "CA" });
  assert.equal(s.phase, "done"); assert.equal(B.result(s, full).points[1], -46);
});

// One whole game: each move either random among the legal ones or the Auto move, which must always be legal.
function playOut(seed, mode) {
  const full = deal(shuffled(seed)), r = rng(seed * 7 + 1), rules = seed % 3 === 0 ? ["null", "kontra"] : seed % 3 === 1 ? ["kontra"] : [];
  let s = begin(full, { dealer: seed % 2, rules }), moves = 0;
  while (!B.done(s)) {
    assert.ok(++moves < 200, "endet");
    s = uncover(s, full);
    const seat = B.turn(s), hand = handLeft(s, full, seat), acts = B.actions(s, seat, hand);
    assert.ok(acts.length, "hat einen Zug");
    const au = B.auto(s, seat, hand);
    assert.ok(au && acts.some((a) => JSON.stringify(a) === JSON.stringify(au)), "Auto-Zug ist legal: " + JSON.stringify(au));
    const other = 1 - seat;
    if (rules.includes("kontra") && r() < 0.3) { const k = B.actions(s, other, []).find((a) => a.t === "kontra" || a.t === "re"); if (k) s = go(s, k); }
    const pick = mode === "auto" ? au : acts.filter((a) => a.t !== "kontra" && a.t !== "re")[Math.floor(r() * acts.filter((a) => a.t !== "kontra" && a.t !== "re").length)];
    s = go(s, pick);
  }
  return { s, full };
}

test("500 Partien mit Zufallszuegen und Auto-Zuegen: alle enden, Auto immer legal, Pruefung sauber, 120 Augen, Punkte stimmen", () => {
  const seen = { C: 0, S: 0, H: 0, D: 0, G: 0, N: 0 };
  for (let seed = 1; seed <= 500; seed++) {
    const { s, full } = playOut(seed, seed % 2 ? "random" : "auto");
    assert.deepEqual(B.audit(s, full), [], "Partie " + seed);
    const res = B.result(s, full); seen[s.contract.game]++;
    if (s.contract.game !== "N") {
      assert.equal(s.tricks.length, 16);
      assert.equal(res.eyes.declarer + res.eyes.defenders, 120);
      assert.equal(res.won, res.eyes.declarer >= 61);
    }
    assert.equal(res.points[1 - s.declarer], 0);
    assert.equal(Math.abs(res.points[s.declarer]), res.won ? res.value : 2 * res.value);
    assert.ok(s.stacks.every((row) => row.every((x) => s.contract.game === "N" || (x.top == null && !x.under))), "alle Stapel abgespielt");
  }
  assert.ok(seen.G > 0 && seen.C + seen.S + seen.H + seen.D > 0 && seen.N > 0, JSON.stringify(seen));
});

test("Pruefung nach der Aufdeckung: nicht bedient mit einer Handkarte und gespielte Karte, die man nicht hatte, fallen auf", () => {
  const full = fixed();
  let s = go(begin(full), { t: "declare", seat: 1, game: "G" });
  s = go(s, { t: "play", seat: 1, card: "HA" });
  s = go(s, { t: "play", seat: 0, card: "CA" });          // Sitz 0 hat kein Herz: erlaubt
  assert.deepEqual(B.audit(s, full), []);
  s = uncover(s, full);
  s = go(s, { t: "play", seat: 1, card: "SA" });          // SA liegt auf der Hand von Sitz 0: das sieht erst die Pruefung
  s = go(s, { t: "play", seat: 0, card: "C7" });
  assert.deepEqual(B.audit(s, full).map((x) => [x.seat, x.why]), [[1, "notInHand"], [0, "follow"]]);
  const f2 = fixed(); f2.hands[1][7] = "C6";               // kaputtes Blatt
  assert.equal(B.audit(s, f2)[0].why, "deck");
  let t = go(begin(full), { t: "declare", seat: 1, game: "G" });
  t = go(t, { t: "play", seat: 1, card: "ST" }); t = go(t, { t: "play", seat: 0, card: "C7" });   // Sitz 0 hat SA auf der Hand
  assert.deepEqual(B.audit(t, full).map((x) => [x.seat, x.why]), [[0, "follow"]]);
});

test("Karte: im Katalog als Kartentisch, ohne Kalendertag, findbar ueber bauernskat / skat zu zweit / kartenspiel", () => {
  const D = require("../src/daily.js"), TX = require("../src/texts.json");
  const card = D.IDEAS.find((i) => i.id === "tisch-bauernskat");
  assert.ok(card); assert.equal(card.kind, "table"); assert.equal(card.table.game, "bauernskat"); assert.equal(card.on, undefined, "kein Kalendertag");
  assert.ok(card.de.t && card.de.s && card.en.t && card.en.s);
  const names = Object.fromEntries(D.KINDS.map((k) => [k, [TX.de[k], TX.en[k]]]));
  for (const q of ["bauernskat", "Bauernskat", "skat zu zweit", "kartenspiel", "card game"]) assert.ok(D.searchIdeas(q, new Date("2026-11-05T10:00:00Z"), names, { crypto: true, channel: true, call: true }).some((h) => h.idea.id === card.id), q);
  assert.ok(TX.de.tb_bauernskat && TX.en.tb_bauernskat, "Knopf im Spiele-Menue");
});
