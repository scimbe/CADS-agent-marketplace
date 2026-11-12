// Alt-Orakel Z1: dieselben Seeds und Antworten wie der Altcode (Fixture aus test/tools/zug-golden.mjs) muessen in der
// neuen Zug-Engine dieselben Optionen, Ablehnungen, Ergebnisse (de/en), face/peekWhole und Tore ergeben.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeZug, enc } from "../src/engines/zug/zug.js";
import { GAMES, TEXT } from "../src/engines/zug/spiele.js";
import { okAnswer } from "../src/engines/zug/check.js";

const ALT = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/zug-golden-z1.json"), "utf8"));
const manifest = { id: "zug-test", players: { min: 2, max: 10 }, howto: { de: "", en: "" } };
const card = makeZug({ manifest, games: GAMES, text: TEXT, variantKey: "spiel" });
// Altcode kennt keine Sitze; fuer den Vergleich zaehlt nur die Regel. Der Sitz kommt aus status().
function fresh(g, seed) { return { pub: { v: g, p: { spiel: g }, seed, m: [], now: [], o: 0, k: 0 }, priv: new Array(10).fill(null) }; }

test("Fixture stammt aus dem Altbaum und deckt alle 19 Z1-Spiele ab", () => {
  assert.match(ALT.herkunft, /pre-legacy-removal/);
  assert.equal(new Set(ALT.faelle.map((f) => f.g)).size, 19);
  assert.ok(ALT.faelle.length >= 100);
});

for (const g of Object.keys(GAMES)) {
  test("Alt-Orakel " + g + ": Optionen, Ablehnungen, Ergebnis, Tor", () => {
    const cases = ALT.faelle.filter((f) => f.g === g);
    assert.ok(cases.length > 0, "Faelle fuer " + g);
    for (const f of cases) {
      let st = fresh(g, f.seed), ri = 0, oi = 0;
      f.turns.forEach((t, ti) => {
        t.a.forEach((v, i) => {
          const pub = st.pub, p = card.prompts(pub)[pub.now.length], doc = card.docFor(pub);
          // Optionen (de/en) wie alt
          if (p.from && p.w !== "ideas") {
            const o = f.options[oi++];
            assert.deepEqual([o.t, o.i], [ti, i]);
            assert.deepEqual(p.from(doc, pub.m, pub.now, "de"), o.de, g + " Optionen de");
            assert.deepEqual(p.from(doc, pub.m, pub.now, "en"), o.en, g + " Optionen en");
          }
          // Ablehnungen wie alt (okAnswer und Vertragspruefung accepts)
          while (ri < f.rejects.length && f.rejects[ri].t === ti && f.rejects[ri].i === i) {
            const r = f.rejects[ri++];
            assert.equal(okAnswer(p, r.v, doc, "de", pub.m, pub.now), r.ok, g + " okAnswer " + JSON.stringify(r.v));
            if (r.v !== null && r.v !== undefined && !(typeof r.v === "number" && !Number.isInteger(r.v))) {
              const seat = card.status(st).turn;
              assert.equal(card.accepts(card.observe(st, seat), seat, card.answer(pub, seat, r.v, t.d)), r.ok, g + " accepts " + JSON.stringify(r.v));
            }
          }
          const seat = card.status(st).turn;
          const input = card.answer(pub, seat, v, t.d);
          assert.ok(card.accepts(card.observe(st, seat), seat, input), g + " nimmt Altantwort an " + JSON.stringify(v));
          st = card.step(st, input);
        });
        assert.deepEqual(card.face(st.pub, "de"), f.faces[ti].de, g + " face de");
        assert.deepEqual(card.face(st.pub, "en"), f.faces[ti].en, g + " face en");
        assert.equal(card.whole(st.pub, "de"), f.wholes[ti], g + " peekWhole");
        assert.equal(st.pub.o, f.gates[ti].o, g + " Tor-Tag o");
        assert.equal(card.gateLeft(st.pub, t.d), f.gates[ti].left, g + " Tor offen in Tagen");
        if (g === "wunsch" && f.closed && ti === f.turns.length - 1) {
          const seat = card.status(st).turn;
          st = card.step(st, { t: "close", seat });
        }
      });
      assert.deepEqual(st.pub.m, f.m, g + " Zuege wie alt (inkl. snap)");
      assert.equal(card.status(st).over, f.over, g + " vorbei");
      assert.deepEqual(card.result(st.pub, "de"), f.results.de, g + " Ergebnis de");
      assert.deepEqual(card.result(st.pub, "en"), f.results.en, g + " Ergebnis en");
      if (f.endAt !== undefined) {
        // pay: der Zug bleibt stehen, nichts ist eine gueltige Antwort (alt end:true)
        const seat = card.status(st).turn;
        assert.equal(card.accepts(card.observe(st, seat), seat, { t: "ans", seat, a: enc(0) }), false);
      }
    }
  });
}
