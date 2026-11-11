// The Robot's free part of a card (src/frei.js): the same rules and the same vectors as the server
// (CADS-DEMO-wrapper lib/duell-frei.mjs, test/fixtures/frei-vectors.json), the engines' own lists, the arcade's points to win.
const test = require("node:test");
const assert = require("node:assert/strict");
globalThis.Daily = require("../src/daily.js");
const F = require("../src/frei.js");
const A = require("../src/arcade2.js");

test("frei: the server's vectors give the same doc here (arcade, tool, table, the app's own kinds, junk)", () => {
  const v = require("./fixtures/frei-vectors.json");
  assert.ok(v.length >= 12);
  for (const { in: i, out } of v) assert.deepEqual(F.sanitize(i), out, JSON.stringify(i));
});

test("frei: the lists are the engines' own (house rules, arcade games), nothing the engine does not know", () => {
  assert.deepEqual(F.TABLE_RULES.skat, require("../src/skat.js").RULES);
  assert.deepEqual(F.TABLE_RULES.doko, require("../src/doko.js").RULES);
  assert.deepEqual(F.TABLE_RULES.bauernskat, require("../src/bauernskat.js").RULES);
  assert.deepEqual(F.ARCADE_GAMES.slice().sort(), Object.keys(A.GAMES).sort(), "every arcade duel, and only those");
  // daily.js keeps a table's house rules the same way (a free table card can travel as a sheet link)
  const d = Daily.sanitizeDoc({ k: "table", g: "bauernskat", col: ["#ffd400", "#ff3b1d"], by: [], fa: { r: ["kontra", "dulle", "null"] } });
  assert.deepEqual(d.fa, { r: ["null", "kontra"] });
  assert.equal(Daily.sanitizeDoc({ k: "table", g: "skat", col: ["#ffd400", "#ff3b1d"], by: [], fa: { r: ["null"] } }).fa, undefined);
});

test("arcade: a free card's points to win end the match on both sides at the same score; out of range is the game's own", () => {
  for (const g of F.ARCADE_GAMES) {
    assert.equal(A.side(g, { seed: "s", serving: true }).WIN, A.GAMES[g].rules.WIN, g + " default");
    assert.equal(A.side(g, { seed: "s", serving: true, win: 7 }).WIN, 7, g + " free");
    assert.equal(A.side(g, { seed: "s", serving: true, win: 99 }).WIN, A.GAMES[g].rules.WIN, g + " 99 is not a value");
  }
  // a whole match of two bots to 1 point: it ends after the first point (ziegel, the brick duel)
  const out = [], inn = [];
  const S = A.side("ziegel", { seed: "free", serving: true, win: 1, clock: () => 0, send: (m) => out.push(JSON.parse(JSON.stringify(m))) });
  const B = A.side("ziegel", { seed: "free", serving: false, win: 1, clock: () => 0, send: (m) => inn.push(JSON.parse(JSON.stringify(m))) });
  const bs = A.bot("ziegel", S, "a"), bb = A.bot("ziegel", B, "b");
  S.start(); B.start();
  for (let i = 0; i < 120 * 300 && !(S.over && B.over); i++) {
    bs(1 / 120); bb(1 / 120); S.tick(1 / 120); B.tick(1 / 120);
    while (out.length) B.receive(out.shift()); while (inn.length) S.receive(inn.shift());
    S.ev.length = 0; B.ev.length = 0;
  }
  assert.ok(S.over && B.over, "the match ended");
  assert.equal(Math.max(...S.score), 1); assert.deepEqual(S.score, B.score.slice().reverse());
});

test("frei: the arcade look takes the card's figure and colours, the rest of the board stays", () => {
  const m = F.arcadeLook({ e: "🧱", a: "#ff7a1a", b: "#e8d6bf", x: 1 }, { col: ["#C8FF00", "#7a1fff"], fa: { e: "🚀", w: 3 } });
  assert.deepEqual(m, { e: "🚀", a: "#c8ff00", b: "#7a1fff", x: 1 });
  assert.deepEqual(F.arcadeFa({ e: "💣", w: 0 }), {});
});
