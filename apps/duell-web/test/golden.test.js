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
    kinds.add(g.doc.k);
    // shelf clean-up (2026-11): a struck bot card (agent duel, photo meme with a bot face) says honestly that it is gone; any
    // other struck card reads as its own content without the id; a card taken off the shelf (D.RETIRED) reads as it was
    if (D.GONE.includes(g.doc.i) && ["duel", "photo"].includes(g.doc.k)) { assert.deepEqual(r, { type: "gone", id: g.doc.i }, g.name); continue; }
    // a card merged into another (D.MOVED, e.g. the three voice cards into "stimme-verzerren") reads as the new card, the rest as it was
    const want = D.MOVED[g.doc.i] ? Object.assign({}, g.doc, { i: D.MOVED[g.doc.i][0] }) : D.GONE.includes(g.doc.i) ? Object.assign({}, g.doc, { i: undefined }) : g.doc;
    if (want.i === undefined) delete want.i;
    assert.equal(r && r.type, "doc", g.name); assert.deepEqual(r.doc, want, g.name);
    const again = D.docUrl(r.doc); assert.deepEqual(D.parseRoute(again.slice(again.indexOf("#"))).doc, want, g.name + ": wieder geteilt bleibt es gleich");
  }
  for (const k of D.KINDS.filter((k) => k !== "table" && k !== "code")) assert.ok(kinds.has(k), "Art " + k);   // code: new (Code-Modus), test/code.test.js
  assert.ok(!("tp" in G.links.find((g) => g.name === "card:unknown-keys").doc), "unbekannter Schluessel faellt weg");
});

// Shelf clean-up (2026-11, 209 -> 74 cards, konzept2 sections 4 and 5): every card that left the shelf still means something
// to someone who opens an old link. Merged cards (ideas.json retired, "to": the carrier) open as they were, but nothing
// lists them any more; struck cards (ideas.json gone) say so (app.js route "gone": a toast, the day's card, "All cards").
test("Golden-Links Regal-Bereinigung: jede entfernte Karte, alt geteilt, oeffnet sich weiter oder sagt ehrlich, dass sie weg ist", () => {
  const OUT = require("./fixtures/regal-74.json");
  assert.equal(OUT.streichen.length, 38); assert.equal(Object.keys(OUT.zusammenlegen).length, 97);
  const daily = require("../src/ideas.json"), biz = require("../src/flavors/business/ideas.json");
  const shelf = (c) => c.ideas.concat(c.gated || []).map((i) => i.id);
  // 2026-11: "Dein Agent liest dich" (a bot as player) is parked until it is rebuilt: off the shelf, its old links open
  const parkedIds = daily.retired.filter((i) => i.round >= 0).map((i) => i.id);
  assert.deepEqual(parkedIds, ["duell-liest"]);
  assert.equal(shelf(daily).length + shelf(biz).length + 1, 73, "64 + 8 + die freie Karte (duell-liest geparkt)");
  for (const c of [daily, biz]) for (const id of shelf(c)) assert.ok(!OUT.streichen.includes(id) && !OUT.zusammenlegen[id], id + " ist noch im Regal");
  // every carrier stays on the shelf (the daily one; x-ballduell -> arcade-kick is a shelf button, not a card)
  for (const [id, to] of Object.entries(OUT.zusammenlegen)) assert.ok(shelf(daily).includes(to) || shelf(biz).includes(to) || parkedIds.includes(to), id + " -> " + to);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  let opened = 0, gone = 0;
  for (const id of OUT.streichen.concat(Object.keys(OUT.zusammenlegen))) {
    if (!OUT.daily_vorher.includes(id)) continue;   // x-callcard, x-ballduell (shelf buttons) and the business cards (below)
    const r = D.parseRoute("#i=" + id);
    assert.deepEqual(D.parseRoute("#c=" + b64({ v: 1, i: id })), r, id + ": #c= wie #i=");
    if (OUT.streichen.includes(id)) { assert.deepEqual(r, { type: "gone", id }, id); gone++; continue; }
    const card = D.byId(id);
    assert.deepEqual(r, { type: "idea", id }, id); assert.ok(D.RETIRED.includes(card) && !D.IDEAS.includes(card), id + " nicht im Regal");
    assert.equal(card.to, OUT.zusammenlegen[id], id); assert.ok(D.IDEAS.includes(D.byId(card.to)) || parkedIds.includes(card.to), id + " -> " + card.to); opened++;
  }
  assert.equal(gone, 37); assert.equal(opened, 83);
  assert.deepEqual(D.parseRoute("#i=duell-liest"), { type: "idea", id: "duell-liest" }, "geparkt: der alte Link oeffnet weiter");
  assert.ok(!D.IDEAS.includes(D.byId("duell-liest")) && D.RETIRED.includes(D.byId("duell-liest")));
  assert.deepEqual(D.parseRoute("#i=plan-10"), { type: "gone", id: "plan-10" }, "Auktion der Agenten");
  // a struck bot duel shared as a creation: gone as well; a struck text card: its own text, without the card
  assert.deepEqual(D.parseRoute("#c=" + b64({ v: 1, d: { k: "duel", i: "plan-10", m: "auction", col: ["#ffd400", "#ff3b1d"], by: [] } })), { type: "gone", id: "plan-10" });
  const spruch = D.parseRoute("#c=" + b64({ v: 1, d: { k: "card", i: "karte-spruch", x: "Mein Spruch", col: ["#ffd400", "#ff3b1d"], by: [], st: "druck", sk: [] } }));
  assert.equal(spruch.type, "doc"); assert.equal(spruch.doc.x, "Mein Spruch"); assert.equal(spruch.doc.i, undefined);
  // Daily Business: its 13 merged cards are retired there (their carrier may be a daily card), none struck
  assert.equal(biz.retired.length, 13); assert.deepEqual(biz.gone, []);
  assert.deepEqual(biz.retired.map((i) => i.id).sort(), Object.keys(OUT.zusammenlegen).filter((id) => /^biz-/.test(id)).sort());
});
