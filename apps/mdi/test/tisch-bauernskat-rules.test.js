// Portiert aus alt:test/bauernskat.test.js (Tag pre-legacy-removal), Alt-Orakel: Faelle unveraendert, nur Modulrahmen neu.
import test from "node:test";
import assert from "node:assert/strict";
import B from "../src/engines/tisch/bauernskat.js";
// Bauernskat rules (src/bauernskat.js) without a table: a seeded deal, the face-up cards and the flips applied the way
// the table applies them; the face-down cards stay outside the state until their turn.

function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
function shuffled(seed) { const r = rng(seed), d = B.DECK.slice(); for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; }
// deck[pos] by B.layout(): the truth only the reveal shows
function deal(deck) {
  const lay = B.layout();
  return { hands: [[], []], stacks: lay.stacks.map((row) => row.map((x) => ({ up: deck[x.up], down: deck[x.down] }))) };
}
function go(s, a) { const r = B.apply(s, a); assert.ok(r.ok, JSON.stringify(a) + " -> " + r.err); return r.state; }
// What the table does on its own: open every card reveals() names.
function uncover(s, full) {
  for (const r of B.reveals(s)) s = go(s, { t: "turn", seat: r.seat, i: r.i, card: full.stacks[r.seat][r.i][r.kind] });
  return s;
}
function begin(full, o = {}) { return uncover(B.start({ dealer: o.dealer || 0, rules: o.rules || [] }), full); }

test("Austeilen: 8 Stapel je Spieler (verdeckt + offen), keine Hand; offene Karten erst nach dem Aufdecken im Zustand, verdeckte nie", () => {
  const lay = B.layout(), all = lay.stacks.flat().flatMap((x) => [x.up, x.down]);
  assert.equal(new Set(all).size, 32); assert.deepEqual(lay.hands, [[], []]); assert.equal(lay.stacks[1].length, 8);
  const full = deal(shuffled(7)), s0 = B.start({ dealer: 0 });
  assert.equal(s0.phase, "deal"); assert.equal(B.reveals(s0).length, 16); assert.ok(B.reveals(s0).every((r) => r.kind === "up"));
  assert.equal(B.turn(s0), -1);
  const s = begin(full);
  assert.equal(s.phase, "declare"); assert.equal(B.turn(s), 1, "Vorhand (nicht der Geber) sagt an");
  const json = JSON.stringify(s);
  full.stacks.flat().forEach((x) => { assert.ok(json.includes('"' + x.up + '"')); assert.ok(!json.includes('"' + x.down + '"'), "verdeckte Karte " + x.down + " steht nicht im Zustand"); });
  assert.deepEqual(B.reveals(s), []);
});

test("Ansage: Farbe oder Grand; Null nur mit Hausregel; Vorhand spielt aus", () => {
  const full = deal(shuffled(11)), s = begin(full);
  assert.deepEqual(B.actions(s, 1).map((a) => a.game), ["C", "S", "H", "D", "G"]);
  assert.deepEqual(B.actions(s, 0), []);
  assert.equal(B.apply(s, { t: "declare", seat: 1, game: "N" }).err, "game");
  assert.equal(B.apply(s, { t: "declare", seat: 0, game: "C" }).err, "turn");
  const n = begin(full, { rules: ["null"] });
  assert.ok(B.actions(n, 1).some((a) => a.game === "N"));
  const p = go(s, { t: "declare", seat: 1, game: "G" });
  assert.equal(p.phase, "play"); assert.equal(B.turn(p), 1);
});

// A hand-made deal for the exact cases below: stacks [up, down].
function fixed() {
  const st = (pairs) => pairs.map(([up, down]) => ({ up, down }));
  return { hands: [[], []], stacks: [
    st([["CA", "CQ"], ["CT", "C9"], ["CK", "C8"], ["DA", "C7"], ["DT", "SQ"], ["DK", "S9"], ["SA", "S8"], ["CJ", "SK"]]),
    st([["HA", "H9"], ["HT", "H8"], ["HK", "H7"], ["HQ", "ST"], ["SJ", "S7"], ["HJ", "DQ"], ["DJ", "D9"], ["D8", "D7"]])] };
}

test("Bedienen ueber alle offenen Karten: nur die oberste offene Karte eines eigenen Stapels, Farbe muss bedient werden", () => {
  const full = fixed();
  let s = go(begin(full), { t: "declare", seat: 1, game: "H" });
  s = go(s, { t: "play", seat: 1, card: "D8" });
  assert.deepEqual(B.actions(s, 0).map((a) => a.card).sort(), ["DA", "DK", "DT"], "Karo liegt offen: nur Karo");
  assert.equal(B.apply(s, { t: "play", seat: 0, card: "CA" }).err, "follow");
  assert.equal(B.apply(s, { t: "play", seat: 0, card: "HJ" }).err, "card", "liegt beim Gegner");
  assert.equal(B.apply(s, { t: "play", seat: 0, card: "C7" }).err, "card", "verdeckt: nicht spielbar");
  assert.equal(B.apply(s, { t: "play", seat: 1, card: "HA" }).err, "turn");
});

test("Aufdecken: die verdeckte Karte unter einer gespielten Karte kommt erst nach dem Stich hoch, vorher geht kein Zug", () => {
  const full = fixed();
  let s = go(begin(full), { t: "declare", seat: 1, game: "H" });
  s = go(s, { t: "play", seat: 1, card: "D8" });
  assert.deepEqual(B.reveals(s), [], "mitten im Stich bleibt sie verdeckt");
  assert.equal(s.stacks[1][7].top, null); assert.equal(s.stacks[1][7].under, true);
  s = go(s, { t: "play", seat: 0, card: "DA" });
  assert.equal(s.tricks[0].winner, 0);
  assert.deepEqual(B.reveals(s).map((r) => [r.seat, r.i, r.kind]).sort(), [[0, 3, "down"], [1, 7, "down"]]);
  assert.equal(B.apply(s, { t: "play", seat: 0, card: "CA" }).err, "flip");
  assert.deepEqual(B.actions(s, 0), [], "kein Zug, solange aufgedeckt wird");
  assert.equal(B.auto(s, 0), null);
  assert.equal(B.apply(s, { t: "turn", seat: 0, i: 0, card: "CQ" }).err, "turn", "nur was dran ist");
  assert.equal(B.apply(s, { t: "turn", seat: 0, i: 3, card: "CA" }).err, "turn", "eine schon offene Karte nicht");
  s = uncover(s, full);
  assert.equal(s.stacks[0][3].top, "C7"); assert.equal(s.stacks[0][3].under, false); assert.equal(s.stacks[1][7].top, "D7");
  assert.ok(B.actions(s, 0).some((a) => a.card === "C7"), "die aufgedeckte Karte ist spielbar");
  s = go(s, { t: "play", seat: 0, card: "C7" });
  s = go(s, { t: "play", seat: 1, card: "D7" });
  assert.deepEqual(B.reveals(s), [], "ein leerer Stapel wird nicht nochmal aufgedeckt");
  assert.equal(s.stacks[0][3].top, null); assert.equal(s.stacks[0][3].under, false);
});

test("Wertung: Spitzen aus allen 16 Karten des Ansagers, Schneider, Schwarz, verloren doppelt, 60:60, Null 23", () => {
  const mk = (game, decl, wins) => ({ declarer: decl, contract: { game }, kontra: 0, tricks: wins.map((w) => ({ winner: w, cards: [{ seat: 0, card: "C7" }, { seat: 1, card: "C8" }] })) });
  const full = fixed(), D = B.DECK;
  const won = { declarer: 0, contract: { game: "C" }, kontra: 0, tricks: Array.from({ length: 16 }, (_, i) => ({ winner: i < 15 ? 0 : 1, cards: [{ seat: 0, card: D[i * 2] }, { seat: 1, card: D[i * 2 + 1] }] })) };
  let r = B.result(won, full);
  assert.ok(r.eyes.declarer >= 90);
  assert.deepEqual(r.lines.slice(0, 2), [{ k: "with", v: 1 }, { k: "game", v: 1 }], "Sitz 0: CJ ja, SJ nein (SK liegt verdeckt, zaehlt mit)");
  assert.equal(r.value, 12 * 3); assert.deepEqual(r.points, [36, 0]); assert.equal(r.won, true);
  const sw = Object.assign({}, won, { tricks: won.tricks.map((t) => Object.assign({}, t, { winner: 0 })) });
  r = B.result(sw, full); assert.equal(r.value, 12 * 4, "Schwarz"); assert.equal(r.eyes.declarer, 120);
  const lost = Object.assign({}, won, { tricks: won.tricks.map((t) => Object.assign({}, t, { winner: 1 })) });
  r = B.result(lost, full); assert.equal(r.won, false); assert.equal(r.value, 12 * 4); assert.deepEqual(r.points, [-96, 0]);
  r = B.result(Object.assign({}, won, { declarer: 1, contract: { game: "G" } }), full); assert.deepEqual(r.lines[0], { k: "without", v: 1 });
  r = B.result(Object.assign({}, won, { kontra: 2 }), full); assert.equal(r.value, 36 * 4, "Kontra und Re");
  r = B.result(mk("N", 1, [0, 0, 1]), full); assert.equal(r.value, 23); assert.deepEqual(r.points, [0, -46]);
  r = B.result(mk("N", 1, []), full); assert.deepEqual(r.points, [0, 23]);
  const half = { declarer: 0, contract: { game: "D" }, kontra: 0, tricks: [[["CA", "SA"]], [["HA", "DA"]], [["CT", "DK"]], [["CJ", "C7"]]].map(([[a, b]]) => ({ winner: 0, cards: [{ seat: 0, card: a }, { seat: 1, card: b }] })) };
  r = B.result(half, full); assert.equal(r.eyes.declarer, 60); assert.equal(r.won, false, "60:60 ist verloren");
});

test("Kontra & Re (Hausregel): Gegenspieler vor seiner ersten Karte, Ansager vor seiner zweiten", () => {
  const full = fixed();
  let s = go(begin(full, { rules: ["kontra"] }), { t: "declare", seat: 1, game: "H" });
  assert.ok(B.actions(s, 0).some((a) => a.t === "kontra")); assert.equal(B.apply(s, { t: "kontra", seat: 1 }).err, "kontra");
  s = go(s, { t: "kontra", seat: 0 }); s = go(s, { t: "re", seat: 1 }); assert.equal(s.kontra, 2);
  assert.equal(B.apply(go(begin(full), { t: "declare", seat: 1, game: "H" }), { t: "kontra", seat: 0 }).err, "kontra", "ohne Hausregel kein Kontra");
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
    const seat = B.turn(s), acts = B.actions(s, seat).filter((a) => a.t !== "kontra" && a.t !== "re");
    assert.ok(acts.length, "hat einen Zug");
    const au = B.auto(s, seat);
    assert.ok(au && acts.some((a) => JSON.stringify(a) === JSON.stringify(au)), "Auto-Zug ist legal: " + JSON.stringify(au));
    if (rules.includes("kontra") && r() < 0.3) { const k = B.actions(s, 1 - seat).find((a) => a.t === "kontra" || a.t === "re"); if (k) s = go(s, k); }
    s = go(s, mode === "auto" ? au : acts[Math.floor(r() * acts.length)]);
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
      assert.ok(s.stacks.every((row) => row.every((x) => x.top == null && !x.under)), "alle Stapel abgespielt");
    }
    assert.equal(res.points[1 - s.declarer], 0);
    assert.equal(Math.abs(res.points[s.declarer]), res.won ? res.value : 2 * res.value);
  }
  assert.ok(seen.G > 0 && seen.C + seen.S + seen.H + seen.D > 0 && seen.N > 0, JSON.stringify(seen));
});

test("Pruefung nach der Aufdeckung: eine Karte, die nicht so lag, faellt auf; ein kaputtes Blatt auch", () => {
  const full = fixed();
  let s = go(begin(full), { t: "declare", seat: 1, game: "G" });
  s = go(s, { t: "play", seat: 1, card: "HA" }); s = go(s, { t: "play", seat: 0, card: "CA" });
  assert.deepEqual(B.audit(s, full), []);
  const swapped = fixed(); [swapped.stacks[0][0].up, swapped.stacks[1][0].up] = ["HA", "CA"];   // the deal says otherwise
  assert.ok(B.audit(s, swapped).some((x) => x.why === "notInHand" || x.why === "stack"));
  const broken = fixed(); broken.stacks[1][7].down = "C6";
  assert.equal(B.audit(s, broken)[0].why, "deck");
});

