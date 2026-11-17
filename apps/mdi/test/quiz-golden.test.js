// Golden-Tests der Quiz-Karten gegen das Alt-Orakel (test/fixtures/quiz-golden.json, erzeugt von
// test/fixtures/gen-quiz-golden.cjs aus dem Tag pre-legacy-removal): gleicher Seed + gleiches Paket + gleiche Antworten
// => gleiche Reihenfolgen, Schieber-Enden, Wertungen und Ergebnistexte.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as P from "../src/engines/quiz/pack.js";
import * as M from "../src/engines/quiz/make.js";
import * as R from "../src/engines/quiz/preis.js";
import abfragen from "../src/cards/zug-abfragen/card.js";
import typen from "../src/cards/zug-typen/card.js";
import preis from "../src/cards/quiz-preis/card.js";

const G = JSON.parse(fs.readFileSync(new URL("./fixtures/quiz-golden.json", import.meta.url), "utf8"));
const plain = (v) => JSON.parse(JSON.stringify(v));

/** Antworten (Altformat) eines Zugs als Eingaben in die Karte spielen. */
function play(card, pub, turns) {
  let st = { pub: { ...structuredClone(pub), m: [], now: [] }, priv: [null, null] };
  turns.forEach((answers, t) => {
    for (const a of answers) {
      const input = { t: "ans", seat: t % 2, a }; // Altformat = Widgetwert: show 0, pick [k], slide Zahl
      assert.equal(card.accepts(card.observe(st, t % 2), t % 2, input), true, JSON.stringify(input));
      st = card.step(st, input);
    }
  });
  return st;
}

test("Golden: mindestens 30 Seeds", () => { assert.ok(G.seeds.length >= 30); });

test("Golden: sanitize wie im Altcode (Nachtpakete und ungültige Pakete)", () => {
  for (const c of G.sanitize) assert.deepEqual(plain(P.sanitize(c.in)), c.out, JSON.stringify(c.in).slice(0, 80));
});

test("Golden: Reihenfolgen, Schieber-Enden, Wertung, typeOf je Seed", () => {
  for (const e of G.games) {
    const pack = G.sanitize.find((s) => s.in && s.out && packId(s.in) === e.pack);
    const doc = { seed: e.seed, pk: pack.out, g: e.g };
    if (e.choices) {
      assert.deepEqual(doc.pk.q.map((r, i) => P.choices(doc, i)), e.choices, e.seed + " " + e.pack);
      assert.deepEqual(doc.pk.q.map((r, i) => P.rightAt(doc, i)), e.rightAt);
    }
    if (e.mixT) assert.deepEqual(doc.pk.q.map((r, i) => P.mix(doc, "t" + i, r.length - 1)), e.mixT);
    if (e.top) assert.deepEqual(P.nums(doc).map((i) => P.top(doc, i)), e.top, "top " + e.seed);
    if (e.typeOf) assert.deepEqual([P.typeOf(doc, e.a), P.typeOf(doc, e.b)], e.typeOf);
    if (e.score) assert.deepEqual(plain([P.score(doc, e.g, e.a), P.score(doc, e.g, e.b)]), e.score);
  }
});
// Nachtpakete in der Fixture haben ihre Herkunft nicht dabei: über den Titel aus der Paketdatei zuordnen
import PACKS from "../src/engines/quiz/quiz-packs.json" with { type: "json" };
function packId(pkIn) { const x = PACKS.packs.find((p) => p.pk.t === pkIn.t); return x ? x.id : null; }

test("Golden: ganze Partie durch die Karte ergibt dasselbe Ergebnis (de/en) wie der Altcode", () => {
  let n = 0;
  for (const e of G.games) {
    if (!e.result) continue;
    const pack = G.sanitize.find((s) => s.in && s.out && packId(s.in) === e.pack).out;
    const card = e.g === "typen" ? typen : abfragen;
    const st = play(card, { g: e.g === "schaetzen" ? "schaetzen" : e.g, seed: e.seed, pk: pack }, e.m.map((t) => t));
    const c = e.g === "schaetzen" ? preis : card;
    assert.equal(c.status(st).over, true);
    for (const lang of ["de", "en"]) assert.deepEqual(plain(card.result(st.pub, lang)), e.result[lang], e.seed + " " + e.pack + " " + e.g + " " + lang);
    if (e.last) {
      const g = { de: null, en: null };
      for (const lang of ["de", "en"]) {
        const v = card.view(card.observe({ pub: { ...st.pub, m: st.pub.m.slice(0, 1), now: st.pub.m[1].slice(0, -1) }, priv: [] }, 1), 1, { lang });
        g[lang] = v.children.flatMap((k) => (k.t === "show" ? k.lines : k.t === "text" && k.role === "body" ? [k.text] : []));
      }
      assert.deepEqual(g, e.last, "letzter Schritt " + e.pack);
    }
    n++;
  }
  assert.ok(n > 50, "Partien: " + n);
});

test("Golden: Was kostet das? – Preise, Schieber-Enden, Abstand und Ergebnis", () => {
  for (const e of G.preis) {
    assert.deepEqual(R.preisItems(e.seed), e.items);
    assert.deepEqual(e.items.map((k, i) => R.top(e.seed, i)), e.top);
    assert.deepEqual([R.off(e.seed, e.a), R.off(e.seed, e.b)], e.off);
    assert.equal(R.off(e.seed, e.raw), e.offRaw, e.seed + ": off() der Engine auch fuer beliebige Cent wie der Altcode");
    const st = play(preis, { g: "preis", seed: e.seed, pk: null }, [e.a, e.b]);
    assert.equal(preis.status(st).over, true);
    for (const lang of ["de", "en"]) assert.deepEqual(plain(preis.result(st.pub, lang)), e.result[lang], e.seed + " " + lang);
  }
});

test("Golden: Fünf mal schätzen – Fragen des Tages, Enden und Ergebnis", () => {
  for (const e of G.schaetzen) {
    const g = R.guesses(e.seed);
    assert.deepEqual(g.map((q) => q[3]), e.max);
    assert.deepEqual(g.map((q) => [q[0], q[1]]), e.peek);
    const st = play(preis, { g: "schaetzen", seed: e.seed, pk: null }, [e.a]);
    assert.equal(preis.status(st).over, true);
    for (const lang of ["de", "en"]) assert.deepEqual(plain(preis.result(st.pub, lang)), e.result[lang], e.seed + " " + lang);
  }
});

test("Golden: Serveroption -> Paket (fromOption) und fit", () => {
  for (const c of G.fromOption) assert.deepEqual(plain(M.fromOption(c.in)), c.out);
  for (const c of G.fit) {
    const pk = P.sanitize(PACKS.packs.find((x) => x.id === c.pack).pk);
    assert.deepEqual(plain(M.fit(c.g, pk, (p) => JSON.stringify(p).length, c.room)), c.out, c.pack + " " + c.room);
  }
});
