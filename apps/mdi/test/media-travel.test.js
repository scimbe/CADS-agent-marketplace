// Datenschutz (Befund A/L, Auftrag des Integrators): Ein Foto auf dem Geraet (media.local, Wert "local:<32 hex>") reist
// weder im Link noch im Live-Handshake, noch in Show, Echtzeit live oder in der Aufnahme (Geist). Beide Seiten spielen
// mit denselben Parametern; das Foto ist reine Darstellung (gleicher Zustands-Hash mit und ohne Foto).
import test from "node:test";
import assert from "node:assert/strict";
import { cardOf } from "../src/cards/index.js";
import { defaults, paramsForLink, paramsForPeer } from "../src/contract/fields.js";
import * as G from "../src/app/game.js";
import { createMatch } from "../src/app/rt/match.js";
import { initialContext } from "../src/app/machine.js";

const ID = "local:" + "ab".repeat(16);
const mediaKeys = (c) => Object.entries(c.manifest.params.properties).filter(([, v]) => v["x-field"] === "media.local").map(([k]) => k);
function withPhoto(id) {
  const c = cardOf(id), p = defaults(c.manifest.params);
  for (const k of mediaKeys(c)) p[k] = ID;
  if ("photoUse" in p) p.photoUse = "figure";
  return { c, p };
}
const CARDS = ["arcade-kick", "flug", "foto-alien"];

test("Reiseregel: paramsForLink und paramsForPeer lassen media.local weg (eine gemeinsame Regel)", () => {
  for (const id of CARDS) {
    const { c, p } = withPhoto(id);
    assert.ok(mediaKeys(c).length > 0, id + " hat ein Foto-Feld");
    for (const f of [paramsForLink, paramsForPeer]) assert.doesNotMatch(JSON.stringify(f(c.manifest.params, p)), /local:/, id + " " + f.name);
  }
});

test("Live-Handshake (hello, helloGroup) und Show tragen keine Foto-id", () => {
  for (const id of CARDS) {
    const { c, p } = withPhoto(id);
    const ctx = { ...initialContext("de"), cardId: id, params: { [id]: p }, seat: 0 };
    assert.doesNotMatch(JSON.stringify(G.helloFor(ctx, ["r1", "r2", "r3", "r4"]).msg), /local:/, id + " hello");
    if (c.manifest.players.max > 2) assert.doesNotMatch(JSON.stringify(G.helloGroupFor(ctx, ["r1", "r2", "r3", "r4"]).msgs), /local:/, id + " helloGroup");
    assert.doesNotMatch(JSON.stringify(G.peerParams(ctx)), /local:/, id + " show/rt live (peerParams)");
  }
});

test("Aufnahme (Geist) und Echtzeit: Foto-id nicht im Draht; Zustand mit und ohne Foto gleich (Foto ist Darstellung)", () => {
  for (const id of ["arcade-kick", "flug", "lauf"]) {
    const { c, p } = withPhoto(id);
    const run = (params) => { const m = createMatch(c, { params, seed: "s1", roles: ["human", "bot"], level: 2, record: 0 }); for (let i = 0; i < 240 && !m.status().over; i++) m.step({ 0: { b: i % 7 === 0 ? 1 : 0, ax: 0, ay: 0, p: [] } }); return m; };
    const full = run(p), peer = run(paramsForPeer(c.manifest.params, p));
    if (c.manifest.rt.ghost) assert.doesNotMatch(JSON.stringify(full.ghostWire()), /local:/, id + " Geist");
    assert.equal(full.hash(), peer.hash(), id + ": Foto geht nicht in den Spielzustand");
  }
});

test("Empfang: Link, Hello oder Show mit fremder Foto-id wird abgelehnt (kein Abfragen des eigenen Fotospeichers)", async () => {
  const { encode } = await import("../src/app/link.js");
  for (const [id, k] of [["flug", "figur"], ["arcade-kick", "photo"], ["foto-alien", "photo"]]) {
    const c = cardOf(id), p = { ...defaults(c.manifest.params), [k]: ID };
    const r = G.receive(encode("card", { c: id, v: c.manifest.version, p }), null, []);
    assert.equal(r.ok, false, id); assert.equal(r.reason, "params");
    assert.equal(G.receive(encode("card", { c: id, v: c.manifest.version, p: defaults(c.manifest.params) }), null, []).ok, true, id + " ohne Foto geht");
    assert.throws(() => G.joinFor(initialContext("de"), { t: "hello", c: id, v: c.manifest.version, p, s: "x", g: undefined }, ["a", "b", "c"]), /params/);
  }
});

test("Arcade (Foto ist Pflichtfeld): Link und Live-Beitritt bleiben gueltig, obwohl das Foto fehlt (Pruefung mit Standardwert)", async () => {
  const { encode } = await import("../src/app/link.js");
  const { c, p } = withPhoto("arcade-kick");
  const lp = paramsForLink(c.manifest.params, p);
  assert.equal(lp.photo, undefined);
  assert.equal(G.receive(encode("card", { c: "arcade-kick", v: c.manifest.version, p: lp }), null, []).ok, true, "Arcade-Karten-Link wird angenommen (vorher abgelehnt: params)");
  const ctx = { ...initialContext("de"), cardId: "arcade-kick", params: { "arcade-kick": p }, seat: 0 };
  const h = G.helloFor(ctx, ["r1", "r2", "r3", "r4"]);
  assert.doesNotThrow(() => G.joinFor(initialContext("de"), h.msg, ["a", "b", "c"]));
});
