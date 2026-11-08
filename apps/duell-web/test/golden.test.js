"use strict";
// Old links keep working (editor concept 5.2): links as origin/main e928c80 wrote them (test/golden-links.json, made with
// that version's daily.js) must read to the very same docs. New doc keys may only be optional, with defaults that give
// today's picture; a key this version does not know is dropped, as before.
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../src/daily.js");
const G = require("./golden-links.json");

test("Golden-Links: jede Kartenart, mit Stickern, Wetter, Tuer, Siegel, eigenem Titel und fremden Schluesseln, liest wie vorher", () => {
  assert.ok(G.links.length >= 30);
  const kinds = new Set();
  for (const g of G.links) {
    const r = D.parseRoute(g.hash);
    // a card merged into another (D.MOVED, e.g. the three voice cards into "stimme-verzerren") reads as the new card, the rest as it was
    const want = D.MOVED[g.doc.i] ? Object.assign({}, g.doc, { i: D.MOVED[g.doc.i][0] }) : g.doc;
    assert.equal(r && r.type, "doc", g.name); assert.deepEqual(r.doc, want, g.name); kinds.add(g.doc.k);
    const again = D.docUrl(r.doc); assert.deepEqual(D.parseRoute(again.slice(again.indexOf("#"))).doc, want, g.name + ": wieder geteilt bleibt es gleich");
  }
  for (const k of D.KINDS.filter((k) => k !== "table")) assert.ok(kinds.has(k), "Art " + k);
  assert.ok(!("tp" in G.links.find((g) => g.name === "card:unknown-keys").doc), "unbekannter Schluessel faellt weg");
});
