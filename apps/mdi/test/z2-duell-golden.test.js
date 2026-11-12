// Alt-Orakel der Agenten-Duelle: die Engine src/engines/duell liefert fuer dieselben Agenten, Seeds und Haende dieselben
// Runden, Punkte, Texte (de/en), Erklaerungen und Gegnerwuerfe wie duel.js im Altcode.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as D from "../src/engines/duell/duel.js";

const G = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/z2-duell-golden.json"), "utf8"));

test("Fixture stammt aus dem Altbaum", () => assert.match(G.herkunft, /^Altbaum @ pre-legacy-removal \([0-9a-f]{40}\)/));
test(`rps, rap, auction: ${G.duelle.length} Duelle, Runden/Punkte de+en und Erklaerung wie alt`, () => {
  for (const c of G.duelle) {
    for (const l of ["de", "en"]) assert.deepEqual(D.play(c.doc, l), c[l], c.doc.m + " seed " + c.doc.seed + " " + l);
    assert.deepEqual(D.explain(c.doc, D.play(c.doc, "de")), c.why);
  }
});
test(`mind: ${G.mind.length} Partien, Agentenhaende und Stand wie alt`, () => {
  for (const c of G.mind) { const r = D.playMind(c.doc, c.hands); assert.deepEqual(r.rounds.map((x) => x.y), c.ys); assert.deepEqual([r.sa, r.sb], [c.sa, c.sb]); }
});
test(`Gegner wuerfeln: ${G.rival.length} Wuerfe wie alt`, () => {
  for (const c of G.rival) assert.deepEqual(D.rival(c.seed, c.n, D.DATA.rivals[c.lang], D.DATA.emoji), c.b);
});
test(`Katalogkarten (fromIdea): ${G.ideen.length} Faelle, Agenten und Duell wie alt`, () => {
  for (const c of G.ideen) {
    assert.deepEqual(D.agent(c.doc.a), c.doc.a, c.id + " Agent a"); assert.deepEqual(D.agent(c.doc.b), c.doc.b, c.id + " Agent b");
    if (c.res) { assert.deepEqual(D.play(c.doc, c.lang), c.res, c.id + " " + c.lang); assert.deepEqual(D.explain(c.doc, c.res), c.why); }
  }
});
