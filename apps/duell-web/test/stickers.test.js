"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const K = require("../src/stickers.js");
const D = require("../src/daily.js");

test("Treffer: oberster Sticker gewinnt, kleine Sticker bleiben fingertauglich, daneben trifft nichts", () => {
  const l = [{ x: 0.5, y: 0.5, z: 1 }, { x: 0.52, y: 0.5, z: 1 }];
  assert.equal(K.hit(l, { x: 0.5, y: 0.5 }), 1);
  assert.equal(K.hit(l, { x: 0.9, y: 0.9 }), -1);
  const small = [{ x: 0.5, y: 0.5, z: 0.5 }];
  assert.equal(K.hit(small, { x: 0.57, y: 0.5 }), -1, "ohne Mindestradius daneben");
  assert.equal(K.hit(small, { x: 0.57, y: 0.5 }, 0.08), 0, "mit Mindestradius getroffen");
});
test("Zwei Finger: doppelter Abstand verdoppelt, Vierteldrehung dreht, Grenzen halten", () => {
  const s = { z: 1, r: 0 }, a = { x: 0, y: 0 }, b = { x: 100, y: 0 };
  assert.equal(K.transform(s, a, b, a, { x: 200, y: 0 }).z, 2);
  assert.ok(Math.abs(K.transform(s, a, b, a, { x: 0, y: 100 }).r - Math.PI / 2) < 0.001);
  assert.equal(K.transform(s, a, b, a, { x: 9000, y: 0 }).z, K.MAX_Z);
  assert.equal(K.transform(s, a, b, a, { x: 1, y: 0 }).z, K.MIN_Z);
  assert.ok(Math.abs(K.transform({ z: 1, r: 3 }, a, b, a, { x: 0, y: 100 }).r) <= K.MAX_R);
});
test("Rueckgaengig: stellt die letzte Liste wieder her, gleiche Staende doppeln nicht, Verlauf ist begrenzt", () => {
  const l = [{ e: "🐸" }], h = [];
  K.remember(h, K.snapshot(l)); K.remember(h, K.snapshot(l));
  assert.equal(h.length, 1);
  l.length = 0;
  assert.equal(K.restore(h, l), true); assert.deepEqual(l, [{ e: "🐸" }]);
  assert.equal(K.restore(h, l), false);
  for (let i = 0; i < 50; i++) K.remember(h, "[" + i + "]");
  assert.equal(h.length, 20);
});
test("Muelleimer nur innerhalb der Flaeche", () => {
  const b = { left: 10, right: 20, top: 10, bottom: 20 };
  assert.ok(K.inBox({ x: 15, y: 15 }, b)); assert.ok(!K.inBox({ x: 25, y: 15 }, b)); assert.ok(!K.inBox({ x: 15, y: 15 }, null));
});
test("Link: gedrehter Sticker uebersteht den Link, Remix bleibt loeschbar und das Loeschen bleibt im neuen Link", () => {
  const doc = D.sanitizeDoc({ k: "card", x: "Hallo", sk: [{ e: "🐸", x: 0.5, y: 0.5, r: 2.5, z: 1 }, { e: "🍕", x: 0.2, y: 0.2, r: 0, z: 1 }] });
  assert.equal(doc.sk[0].r, 2.5, "Drehung ueber 1 rad bleibt erhalten");
  const url = D.docUrl(doc), r = D.parseRoute(url.slice(url.indexOf("#")));
  assert.equal(r.doc.sk.length, 2);
  const again = D.sanitizeDoc(r.doc); again.sk.splice(0, 1);
  assert.deepEqual(D.changedAreas(r.doc, again), ["sticker"], "Loeschen zaehlt als eigene Aenderung");
  const url2 = D.docUrl(again), r2 = D.parseRoute(url2.slice(url2.indexOf("#")));
  assert.deepEqual(r2.doc.sk.map((s) => s.e), ["🍕"]);
});
