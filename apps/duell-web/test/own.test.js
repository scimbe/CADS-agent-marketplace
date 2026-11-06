"use strict";
// Own invites (own.js): the device that made a one-time link knows it again and never uses it up itself.
const test = require("node:test");
const assert = require("node:assert/strict");
const O = require("../src/own.js");

const A = "A".repeat(22), B = "B".repeat(22), C = "C".repeat(22), N = 1000000, MIN15 = 15 * 60000;

test("eigene Einladung: gemerkter Token ist meiner, ein fremder nicht", () => {
  const l = O.add([], [A], N + MIN15, N);
  assert.equal(O.mine(l, [A], N), true);
  assert.equal(O.mine(l, [B], N), false, "ein anderes Geraet (andere Liste) oder ein fremder Link tritt normal bei");
  assert.equal(O.mine([], [A], N), false);
});

test("Gruppenlink: ein eigener Token unter mehreren macht den ganzen Link zu meinem", () => {
  const l = O.add([], [A, B, C], N + MIN15, N);
  assert.equal(O.mine(l, [A, B, C], N), true);
  assert.equal(O.mine(l, ["X".repeat(22), C], N), true);
  assert.equal(l.length, 3);
});

test("abgelaufen: nach dem Ende der Einladung ist der Eintrag weg", () => {
  const l = O.add([], [A], N + MIN15, N);
  assert.equal(O.mine(l, [A], N + MIN15 - 1), true);
  assert.equal(O.mine(l, [A], N + MIN15), false);
  assert.deepEqual(O.kept(l, N + MIN15), []);
  assert.deepEqual(O.add([], [A], N - 1, N), [], "schon abgelaufen: nichts gemerkt");
});

test("klein und begrenzt: hoechstens MAX Eintraege, die neuesten bleiben, hoechstens ein Tag", () => {
  let l = [];
  for (let i = 0; i < O.MAX + 10; i++) l = O.add(l, [String(i).padStart(22, "t")], N + MIN15, N);
  assert.equal(l.length, O.MAX);
  assert.equal(O.mine(l, [String(O.MAX + 9).padStart(22, "t")], N), true);
  assert.equal(O.mine(l, ["0".padStart(22, "t")], N), false);
  const far = O.add([], [A], N + 30 * 86400000, N);
  assert.ok(far[0].exp <= N + 86400000);
});

test("gleicher Token zweimal: ein Eintrag; drop vergisst ihn", () => {
  let l = O.add([], [A], N + MIN15, N);
  l = O.add(l, [A], N + MIN15, N);
  assert.equal(l.length, 1);
  l = O.drop(l, [A], N);
  assert.equal(O.mine(l, [A], N), false);
});

test("Muell im Speicher und ungueltige Tokens zaehlen nie", () => {
  const junk = [null, 5, "x", { t: "kurz", exp: N + 1 }, { t: A }, { t: A, exp: "morgen" }, { t: B, exp: N + MIN15 }];
  assert.deepEqual(O.kept(junk, N), [{ t: B, exp: N + MIN15 }]);
  assert.equal(O.mine("kaputt", [A], N), false);
  assert.equal(O.mine(O.add([], ["<script>"], N + MIN15, N), ["<script>"], N), false);
  assert.equal(O.mine(junk, [], N), false);
});
