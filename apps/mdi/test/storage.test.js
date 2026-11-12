// Geraetespeicher (src/broker/storage.js) mit einem localStorage-Ersatz: pub (Snapshot-Karten) und memo bleiben erhalten.
import test from "node:test";
import assert from "node:assert/strict";
import { createStorage } from "../src/broker/storage.js";

function fakeLs() { const m = new Map(); return { get length() { return m.size; }, key: (i) => [...m.keys()][i], getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }

test("saveGame/loadGame behalten pub und memo (Snapshot-Karten, Merkzettel); zu Grosses wird weggelassen, nicht gekuerzt", () => {
  const prev = globalThis.localStorage; globalThis.localStorage = fakeLs();
  try {
    const s = createStorage(), g = "0123456789abcdef";
    s.saveGame({ g, seat: 1, salt: null, n: 2, lh: "a", bh: "b", k: [null, null], pub: { list: [1, 2] }, memo: { own: true } });
    assert.deepEqual(s.loadGame(g).pub, { list: [1, 2] });
    assert.deepEqual(s.loadGame(g).memo, { own: true });
    s.saveGame({ g, seat: 1, salt: null, n: 3, lh: "a", bh: "b", k: [null, null], pub: { big: "x".repeat(20000) }, memo: { big: "y".repeat(600) } });
    assert.equal(s.loadGame(g).pub, undefined); assert.equal(s.loadGame(g).memo, undefined);
  } finally { globalThis.localStorage = prev; }
});
