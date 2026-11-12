// Golden gegen das Alt-Orakel: test/fixtures/dart-golden.json entstand mit gen-dart-golden.cjs aus alt:src/dart.js
// (Tag pre-legacy-removal). Gleicher Seed und gleiche Eingaben ergeben dieselben Treffer – in der Engine und ueber die
// Karte (card.step mit pub.seed = Fixture-Seed, eine Aufnahme je Zug, Bert ueber {t:"bert"}).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as D from "../src/engines/dart/dart.js";
import card from "../src/cards/spiel-dart/card.js";
import { rng } from "../src/contract/sdk.js";

const G = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/dart-golden.json"), "utf8"));
const r9 = (v) => Math.round(v * 1e9) / 1e9;
function frozen(g) {
  return { turns: g.turns.map((t) => ({ p: t.p, pts: t.pts, bust: t.bust, out: t.out, d: t.d.map((h) => [h.n, h.m, h.p, r9(h.x), r9(h.y)]) })),
    k: g.k, over: g.over, win: g.win, capped: g.capped, left: g.left, next: g.next, total: g.total };
}
function expected(c) { return { turns: c.turns, k: c.k, over: c.over, win: c.win, capped: c.capped, left: c.left, next: c.next, total: c.total }; }

test("Fixture: mindestens 40 Faelle, alle Spielarten, Bust, Double-Out, Cap, Unentschieden, Bert", () => {
  assert.match(G.herkunft, /pre-legacy-removal/);
  assert.ok(G.cases.length >= 40, String(G.cases.length));
  const s = G.cases.map((c) => c.s);
  for (const m of "abcd") assert.ok(s.some((x) => x[0] === m), "Spielart " + m);
  assert.ok(G.cases.some((c) => c.turns.some((t) => t.bust)), "Bust");
  assert.ok(G.cases.some((c) => c.capped), "Cap");
  assert.ok(G.cases.some((c) => c.over && c.win === -1), "Unentschieden");
  assert.ok(G.cases.some((c) => c.s[1] === "b" && c.over), "Bert");
  assert.ok(G.cases.some((c) => c.turns.some((t) => t.out && t.d[t.d.length - 1][1] === 2)), "Double-Out");
});

test("Engine: jeder Treffer wie im Altcode (n, m, p, x, y), Stand, Ende, Sieger", () => {
  for (const c of G.cases) assert.deepEqual(frozen(D.sim(c.seed, c.s)), expected(c), c.name);
});

test("Karte: dieselben Treffer ueber card.step, Aufnahme fuer Aufnahme, mit Bert ueber {t:\"bert\"}", () => {
  for (const c of G.cases) {
    const bot = c.s[1] === "b";
    let st = card.init({ rng: rng("golden"), params: { spiel: c.s[0] } });
    st = { pub: { ...st.pub, seed: c.seed }, priv: st.priv };
    let at = 2;
    c.cuts.forEach((n, i) => {
      const seat = card.status(st).turn;
      assert.equal(seat, bot ? 0 : i % 2, c.name + " Sitz " + i);
      const g = D.sim(c.seed, st.pub.s[0] + (bot ? "b" : "l") + st.pub.s.slice(2) + c.s.slice(at, at + 5 * n));
      const input = { t: "turn", seat, d: c.s.slice(at, at + 5 * n), c: Math.min(999, g.turns.filter((t) => t.p === seat).pop().pts) };
      assert.ok(card.accepts(card.observe(st, seat), seat, input), c.name + " accepts " + i);
      st = card.step(st, input); at += 5 * n;
      if (bot && i === 0 && !card.status(st).over) {
        assert.deepEqual(card.moves(card.observe(st, 1), 1), [{ t: "bert", seat: 1 }]);
        st = card.step(st, { t: "bert", seat: 1 });
      }
    });
    assert.equal(st.pub.s, c.s, c.name + " Darts-Zeichenkette");
    const g = D.sim(st.pub.seed, st.pub.s);
    assert.deepEqual(frozen(g), expected(c), c.name);
    const status = card.status(st);
    assert.equal(status.over, c.over, c.name); assert.equal(status.winner, c.over ? c.win : -1, c.name);
  }
});
