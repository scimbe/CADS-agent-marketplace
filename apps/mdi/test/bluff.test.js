import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bluff from "../src/cards/bluff/card.js";
import * as S from "../src/contract/session.js";
import { counter } from "./helpers.js";

const ALT = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/bluff-alt.json"), "utf8"));
const P = { cards: 5, bonus: 2, accent: "red" };

function play(cards, say, open) {
  let st = bluff.init({ params: P });
  st = { pub: st.pub, priv: [{ cards }, null] };
  for (const v of say) st = bluff.step(st, { t: "say", seat: 0, v });
  for (const o of open) st = bluff.step(st, { t: "call", seat: 1, open: o });
  return bluff.step(st, { t: "reveal", seat: 0 });
}

test("Regel-Paritaet mit der Altkarte zug-bluff (24 Faelle, Fixture mit Herkunft)", () => {
  assert.match(ALT.herkunft, /Altbaum duell-web/);
  for (const f of ALT.faelle) assert.deepEqual(play(f.cards, f.say, f.open).pub.score, f.expect, JSON.stringify(f));
});

test("Ansage unter dem eigenen Wert ist auf dem eigenen Geraet unmoeglich", () => {
  let st = bluff.init({ params: P }); st = { pub: st.pub, priv: [{ cards: [4, 1, 1, 1, 1] }, null] };
  assert.throws(() => bluff.step(st, { t: "say", seat: 0, v: 3 }), /unter Wert/);
  assert.deepEqual(bluff.moves(bluff.observe(st, 0), 0).map((m) => m.v), [4, 5, 6]);
  assert.deepEqual(bluff.moves(bluff.observe(st, 1), 1), [], "Pruefer ist nicht dran");
});

test("Geraet des Pruefers: fremde Karten unbekannt bis zur Aufloesung; dann nachgerechnet", () => {
  const ent = counter("4");
  const sec = S.makeSecrets(bluff, [0], ent);
  let a = S.newSession(bluff, { params: P, seed: ent(), mine: [0], ...sec });
  let b = S.newSession(bluff, { params: P, seed: a.seed, mine: [1], commits: a.commits });
  assert.equal(b.state.priv[0], null);
  for (let i = 0; i < 5; i++) { const m = bluff.moves(bluff.observe(a.state, 0), 0)[0]; a = S.apply(bluff, a, m); b = S.apply(bluff, b, m); }
  for (let i = 0; i < 5; i++) { const m = { t: "call", seat: 1, open: i % 2 === 0 }; a = S.apply(bluff, a, m); b = S.apply(bluff, b, m); }
  assert.equal(b.state.priv[0], null, "vor der Aufloesung");
  assert.equal(JSON.stringify(S.toWire(b)).includes(sec.secrets[0]), false);
  const rv = S.dueReveal(bluff, a); assert.ok(rv);
  a = S.apply(bluff, a, rv); b = S.apply(bluff, b, rv);
  assert.deepEqual(b.state.pub.truth, a.state.priv[0].cards);
  assert.equal(S.pubHash(a), S.pubHash(b));
});

test("Commit-Reveal: falsches Salz -> betrug; Ansage unter Wert (gefaelschter Link) -> Partie zaehlt nicht", () => {
  const ent = counter("5");
  const sec = S.makeSecrets(bluff, [0], ent);
  let a = S.newSession(bluff, { params: P, seed: ent(), mine: [0], ...sec });
  const cards = a.state.priv[0].cards;
  // Faelscher schreibt Ansagen unter Wert direkt ins Log (sein Geraet prueft nicht); Gegenueber kann es erst bei Aufloesung sehen
  let b = S.newSession(bluff, { params: P, seed: a.seed, mine: [1], commits: a.commits });
  const low = cards.map((c) => Math.max(1, c - 1));
  for (const v of low) b = S.apply(bluff, b, { t: "say", seat: 0, v });
  for (let i = 0; i < 5; i++) b = S.apply(bluff, b, { t: "call", seat: 1, open: false });
  assert.throws(() => S.apply(bluff, b, { t: "reveal", seat: 0, salt: "f".repeat(32) }), (e) => e.code === "betrug");
  const done = S.apply(bluff, b, { t: "reveal", seat: 0, salt: sec.secrets[0] });
  const st = S.status(bluff, done);
  if (cards.some((c) => c > 1)) { assert.equal(st.cheat, true); assert.equal(st.winner, 1); assert.deepEqual(st.score, [0, 0]); }
});

test("Zuege ausser der Reihe und fremde Eingabeformen werden abgelehnt", () => {
  const ent = counter("6");
  let a = S.newSession(bluff, { params: P, seed: ent(), mine: [0], ...S.makeSecrets(bluff, [0], ent) });
  assert.throws(() => S.apply(bluff, a, { t: "call", seat: 1, open: true }), (e) => e.code === "nicht-am-zug");
  assert.throws(() => S.apply(bluff, a, { t: "say", seat: 0, v: 9 }), (e) => e.code === "zug-ungueltig");
  assert.throws(() => S.apply(bluff, a, { t: "reveal", seat: 0 }), (e) => e.code === "eingabe");
});
