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
import * as B from "../src/cards/spiel-dart/board.js";
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

// Eingabe aus der Altkodierung eines Pfeils (wie das form-Widget aim + power sie liefert)
// Flaechenpunkt = Altraster - 728 (Zielflaeche ±1.32 Radien wie alt dart-ui.js); Pfeile ausserhalb kann keine Oberflaeche
// zielen (alt px() begrenzt ebenso) – solche Faelle gehen nur als Schnappschuss (handgebauter Link) und werden so geprueft.
function dartIn(seat, chars) { const d = D.dec(chars)[0], x = { t: "dart", seat, a: { aim: [d.ax - B.OFF, d.ay - B.OFF], power: d.p } }; if (d.f) x.f = 1; return x; }
function reachable(c) { return D.dec(c.s.slice(2)).every((d) => [d.ax, d.ay].every((v) => v - B.OFF >= 0 && v - B.OFF <= B.SIZE)); }

test("Karte: dieselben Treffer ueber card.step, Pfeil fuer Pfeil, mit Bert ueber {t:\"bert\"}; Schnappschuss gleichwertig", () => {
  let viaUi = 0, viaSnap = 0;
  for (const c of G.cases) {
    const bot = c.s[1] === "b";
    if (!reachable(c)) {
      viaSnap++;
      let s2 = card.init({ rng: rng("golden"), params: { spiel: c.s[0] } }); s2 = { pub: { ...s2.pub, seed: c.seed }, priv: s2.priv };
      const snap = { t: "snap", seat: 0, a: { d: c.s.slice(2), b: bot, n: ["", ""] } };
      assert.ok(card.accepts(card.observe(s2, 0), 0, snap), c.name + " snap (ausserhalb der Zielflaeche)");
      const st2 = card.step(s2, snap);
      assert.deepEqual(frozen(D.sim(st2.pub.seed, st2.pub.s)), expected(c), c.name);
      continue;
    }
    viaUi++;
    let st = card.init({ rng: rng("golden"), params: { spiel: c.s[0] } });
    st = { pub: { ...st.pub, seed: c.seed }, priv: st.priv };
    const log = [];
    let at = 2;
    c.cuts.forEach((n, i) => {
      for (let j = 0; j < n; j++) {
        const seat = card.status(st).turn;
        assert.equal(seat, bot ? 0 : i % 2, c.name + " Sitz " + i + "/" + j);
        const input = dartIn(seat, c.s.slice(at, at + 5));
        assert.ok(card.accepts(card.observe(st, seat), seat, input), c.name + " accepts " + i + "/" + j);
        st = card.step(st, input); log.push(input); at += 5;
      }
      if (bot && i === 0 && !card.status(st).over) {
        assert.deepEqual(card.moves(card.observe(st, 1), 1)[0], { t: "bert", seat: 1 });
        assert.deepEqual(card.bot(card.observe(st, 1), 1, { level: 2, seed: "x" }), { t: "bert", seat: 1 });
        st = card.step(st, { t: "bert", seat: 1 }); log.push({ t: "bert", seat: 1 });
      }
    });
    assert.equal(st.pub.s, c.s, c.name + " Darts-Zeichenkette");
    const g = D.sim(st.pub.seed, st.pub.s);
    assert.deepEqual(frozen(g), expected(c), c.name);
    const status = card.status(st);
    assert.equal(status.over, c.over, c.name); assert.equal(status.winner, c.over ? c.win : -1, c.name);
    // Schnappschuss aus dem Log und aus dem Zustand ergeben denselben Zustand
    for (const snap of [card.compact(log), card.compact(log, st)]) {
      assert.equal(snap.length, 1);
      let s2 = card.init({ rng: rng("golden"), params: { spiel: c.s[0] } }); s2 = { pub: { ...s2.pub, seed: c.seed }, priv: s2.priv };
      assert.ok(card.accepts(card.observe(s2, 0), 0, snap[0]), c.name + " snap");
      assert.deepEqual(card.step(s2, snap[0]).pub, st.pub, c.name + " snap gleich");
    }
  }
  assert.ok(viaUi >= 40, "die meisten Faelle Pfeil fuer Pfeil ueber die Oberflaechen-Eingabe: " + viaUi + "/" + viaSnap);
});
