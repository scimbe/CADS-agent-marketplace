// Fotos auf dem Geraet (media.local): gleiche Bytes -> gleiche id, Wert local:<id>, nur Bilder, Grenze 2 MB, ohne Speicher
// ehrlich "nicht-verfuegbar", URL gecacht und beim Loeschen freigegeben.
import test from "node:test";
import assert from "node:assert/strict";
import { createMedia, VALUE_RE, MAX_BYTES } from "../src/broker/media.js";

function mem() { const m = new Map(); return { get: async (k) => m.get(k), put: async (k, v) => { m.set(k, v); }, del: async (k) => { m.delete(k); }, m }; }
const digest = (b) => globalThis.crypto.subtle.digest("SHA-256", b);
const blob = (n, type = "image/png") => new Blob([new Uint8Array(n).fill(7)], { type });

test("put: id aus dem Inhalt, Wert local:<id>, dasselbe Foto dieselbe id", async () => {
  const store = mem(), made = [], revoked = [];
  const md = createMedia({ store, digest, objectUrl: { create: (b) => { made.push(b); return "blob:x" + made.length; }, revoke: (u) => revoked.push(u) } });
  const a = await md.put(blob(100)), b = await md.put(blob(100)), c = await md.put(blob(101));
  assert.ok(a.ok && VALUE_RE.test(a.value)); assert.equal(a.id, b.id); assert.notEqual(a.id, c.id);
  assert.equal(store.m.size, 2);
  assert.equal(await md.url(a.id), "blob:x1"); assert.equal(await md.url(a.id), "blob:x1", "gecacht");
  await md.delete(a.id); assert.deepEqual(revoked, ["blob:x1"]); assert.equal(await md.url(a.id), null);
});
test("nur Bilder, Grenze 2 MB, ohne Speicher ehrlich nicht-verfuegbar", async () => {
  const md = createMedia({ store: mem(), digest });
  assert.equal((await md.put(blob(10, "text/plain"))).error, "kein-bild");
  assert.equal((await md.put(blob(MAX_BYTES + 1))).error, "zu-gross");
  const none = createMedia({ store: null, digest });
  assert.equal(none.available, false); assert.equal((await none.put(blob(10))).error, "nicht-verfuegbar");
});
