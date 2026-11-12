// Duell-Karte als Vertragskarte: Altduelle ueber init/accepts/step/status/view, Herausforderung (Zug 2), mind mit zehn
// Haenden, alle Katalogvarianten bis zum Ende, ungueltige Agenten werden abgelehnt.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rng } from "../src/contract/sdk.js";
import { defaults } from "../src/contract/fields.js";
import card from "../src/cards/duell-liest/card.js";
import * as D from "../src/engines/duell/duel.js";

const G = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/z2-duell-golden.json"), "utf8"));
const P0 = defaults(card.manifest.params);
const formOf = (a, m) => { const v = { n: a.n, e: [D.DATA.emoji.indexOf(a.e)] }; if (m !== "mind") for (const k of D.SLIDERS[m]) v[k] = a[k]; return v; };
function start(params, seed) { const st = card.init({ rng: rng("d|" + seed), params, players: 2 }); return { ...st, pub: { ...st.pub, seed } }; }
function go(st, x) { assert.equal(card.accepts(card.observe(st, x.seat), x.seat, x), true, JSON.stringify(x)); return card.step(st, x); }
const CONTROL = new Set(["choice", "form", "explain", "go"]);
function controls(n, o = []) { if (n && typeof n === "object") { if (CONTROL.has(n.t)) o.push(n.t); (n.children || []).forEach((c) => controls(c, o)); } return o; }

test(`Altduelle (${G.duelle.length}): Zug 1 gegen den Gegner aus den Parametern wie alt, Zug 2 = Agent gegen Agent`, () => {
  for (const c of G.duelle) {
    if (!D.DATA.emoji.includes(c.doc.a.e)) continue;
    const b = c.doc.b, params = { ...P0, m: c.doc.m, set: c.doc.set, w: c.doc.w, bn: b.n, be: b.e, br: b.r, bc: b.c, bp: b.p };
    let st = start(params, c.doc.seed);
    assert.equal(card.status(st).turn, 0);
    assert.ok(controls(card.view(card.observe(st, 0), 0, { lang: "de" })).includes("form"), "Agent einstellen");
    st = go(st, { t: "agent", seat: 0, a: formOf(c.doc.a, c.doc.m) });
    for (const l of ["de", "en"]) assert.deepEqual(card.result(st.pub, 0, l), c[l], c.doc.m + " seed " + c.doc.seed + " " + l);
    const v = card.view(card.observe(st, 0), 0, { lang: "de" });
    assert.equal(v.children[0].text, c.why.w === "" ? "Unentschieden" : v.children[0].text, "Urteil oben");
    assert.ok(JSON.stringify(v).includes("❓"), "Erklaerung ohne KI");
    st = go(st, { t: "ok", seat: 0 });
    assert.equal(card.status(st).turn, 1);
    const a1 = D.rival(c.doc.seed, 7, D.DATA.rivals.de, D.DATA.emoji);
    st = go(st, { t: "agent", seat: 1, a: formOf(a1, c.doc.m) });
    const s = card.status(st), r = D.play({ m: c.doc.m, seed: c.doc.seed, w: c.doc.w, a: { ...a1, n: a1.n }, b: c.doc.a }, "de");
    assert.equal(s.over, true);
    assert.deepEqual(s.score, [r.sb, r.sa]);
    assert.equal(s.winner, D.winner(r) > 0 ? 1 : D.winner(r) < 0 ? 0 : -1);
  }
});
test(`mind (${G.mind.length}): zehn Haende gegen den lernenden Agenten wie alt`, () => {
  for (const c of G.mind) {
    const b = c.doc.b, params = { ...P0, m: "mind", set: c.doc.set, bn: b.n, be: b.e, br: b.r, bc: b.c, bp: b.p };
    let st = start(params, c.doc.seed);
    st = go(st, { t: "agent", seat: 0, a: { n: c.doc.a.n, e: [Math.max(0, D.DATA.emoji.indexOf(c.doc.a.e))] } });
    // mind: Agent a hat keine Regler (alt ausgeblendet) -> r/c/p = 50; das Duell haengt nur an b.c und den Haenden
    for (const h of c.hands) { assert.equal(card.moves(card.observe(st, 0), 0).length, 3); st = go(st, { t: "hand", seat: 0, a: h }); }
    const r = card.result(st.pub, 0, "de");
    assert.deepEqual(r.rounds.map((x) => x.y), c.ys); assert.deepEqual([r.sa, r.sb], [c.sa, c.sb]);
  }
});
test("Agent aendern fuehrt zurueck zum Einstellen; ungueltige Agenten und fremde Zuege werden abgelehnt", () => {
  let st = start({ ...P0, m: "rap" }, 99);
  const obs = () => card.observe(st, 0);
  for (const a of [{ n: "", e: [99], r: 1, c: 1, p: 1 }, { n: "", e: [0], r: 101, c: 1, p: 1 }, { n: "ruf an 0171 2345678", e: [0], r: 1, c: 1, p: 1 }, { n: "", e: [0], r: 1, c: 1, p: 1, x: 1 }, { n: "", e: "🤖", r: 1, c: 1, p: 1 }])
    assert.equal(card.accepts(obs(), 0, { t: "agent", seat: 0, a }), false, JSON.stringify(a));
  assert.equal(card.accepts(obs(), 1, { t: "agent", seat: 1, a: { e: [0] } }), false, "Sitz 1 ist nicht dran");
  st = go(st, { t: "agent", seat: 0, a: { n: "Kai", e: [1], r: 80, c: 20, p: 40 } });
  st = go(st, { t: "again", seat: 0 });
  assert.equal(st.pub.ph, "a0"); assert.equal(st.pub.a0, null);
});
test("alle Katalogvarianten laufen ueber moves() bis zum Ende (Treiber wie modes.test)", () => {
  const all = [{ id: "duell-liest", params: {} }, ...card.manifest.variants];
  for (const v of all) {
    let st = start({ ...P0, ...v.params }, 4242);
    for (let k = 0; k < 40 && !card.status(st).over; k++) {
      const s = card.status(st), mv = card.moves(card.observe(st, s.turn), s.turn);
      assert.ok(mv.length, v.id + " ohne Zug in Phase " + st.pub.ph);
      for (const lang of ["de", "en"]) { const n = card.view(card.observe(st, s.turn), s.turn, { lang }); assert.ok(controls(n).length, v.id + " " + st.pub.ph + " ohne Bedienelement"); }
      st = go(st, mv[mv.length - 1]);
    }
    assert.equal(card.status(st).over, true, v.id);
    assert.ok(card.view(card.observe(st, 0), 0, { lang: "de" }).children.length >= 1);
  }
});
