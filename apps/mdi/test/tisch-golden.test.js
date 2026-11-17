// Golden-Tests alt gegen neu: komplette Partien mit festen Seeds. Die neue Karte spielt ueber den Vertrag (Mental Poker,
// feste Entropie), die Entscheidungen kommen aus einem Seed-RNG bzw. dem Auto-Zug des Altcodes. Das alte Regelmodul hat
// dieselben Entscheidungen auf derselben Austeilung nachgespielt; seine Stiche, Augen, Pruefung und Wertung sind in
// test/fixtures/tisch-golden.json eingefroren (Herkunft dort).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { playAlone, randomChooser, autoChooser } from "./tisch-helpers.js";

const GOLD = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/tisch-golden.json"), "utf8"));

test("Golden: " + GOLD.games.length + " komplette Partien (Skat, Doppelkopf, Bauernskat, alle Hausregeln) – Austeilung, Stiche, Augen, Pruefung und Wertung wie im Altcode", () => {
  const seen = { skat: 0, doko: 0, bauernskat: 0 };
  for (const g of GOLD.games) {
    const s = playAlone(g.game, { tag: g.tag, params: { runden: 1, regeln: g.regeln }, chooser: g.chooser === "auto" ? autoChooser() : randomChooser(g.tag) });
    const last = s.state.pub.last, id = g.game + " " + g.k;
    assert.equal(last.cheat, undefined, id);
    assert.deepEqual(last.full, g.full, id + ": Austeilung");
    assert.deepEqual(last.state.tricks, g.expect.tricks, id + ": Stiche");
    assert.deepEqual(last.audit, g.expect.audit, id + ": Pruefung");
    assert.deepEqual(last.result || null, g.expect.result, id + ": Wertung");
    const pts = g.expect.result ? (g.game === "skat" ? g.expect.result.list : g.expect.result.points) : null;
    if (pts) assert.deepEqual(s.state.pub.score, pts, id + ": Stand");
    seen[g.game]++;
  }
  assert.deepEqual(seen, { skat: 16, doko: 16, bauernskat: 16 });
  // Abdeckung: die Faelle enthalten Farbspiel/Grand/Null, Ramsch, Einpassen, Soli und Normalspiele
  const kinds = new Set(GOLD.games.map((g) => g.expect.result && (g.expect.result.ramsch ? "ramsch" : g.expect.result.passedOut ? "eingepasst" : g.expect.result.game || g.expect.result.kind)).filter(Boolean));
  for (const k of ["ramsch", "eingepasst", "normal"]) assert.ok(kinds.has(k), "Abdeckung " + k + ": " + [...kinds]);
});
