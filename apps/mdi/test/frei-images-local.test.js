// env.images, Fall {kind:"local", id}: Foto auf dem Geraet ueber den injizierten Lieferanten, nie ueber den Server
// (Bedingungen von Strang K: strenge id, eigener Schluessel, Lieferant injiziert, blob:-URLs werden freigegeben).
import test from "node:test";
import assert from "node:assert/strict";
import { createImages } from "../src/features/frei/images.js";

const WIN = { location: { protocol: "https:", host: "h" } };
const ID = "0123456789abcdef0123456789abcdef";
const tick = () => new Promise((r) => setTimeout(r, 0));
function server() { const asked = []; return { asked, image: (p) => { asked.push(p); return Promise.resolve({ ok: true, url: "data:image/png;base64,AAAA" }); } }; }

test("gueltig: url leer waehrend des Ladens, dann blob:-URL, subscribe meldet local:<id>, kein Serverzugriff", async () => {
  const api = server(), asked = [], seen = [];
  const im = createImages(WIN, api, { local: (id) => { asked.push(id); return Promise.resolve("blob:x/1"); }, revoke: () => {} });
  im.subscribe((k) => seen.push(k));
  const src = { kind: "local", id: ID };
  assert.equal(im.url(src), ""); assert.equal(im.state(src), "busy");
  im.url(src); await tick();
  assert.deepEqual(asked, [ID], "einmal geladen");
  assert.equal(im.url(src), "blob:x/1"); assert.equal(im.state(src), "ok");
  assert.deepEqual(seen, ["local:" + ID]);
  assert.deepEqual(api.asked, [], "nie ueber den Server");
  assert.equal(im.get(src), null, "ohne Image (Node) kein Element, kein Fehler");
});

test("ungueltige id: null/leer wie bei ungueltigen Server-Quellen, Lieferant nicht gefragt", async () => {
  let n = 0;
  const im = createImages(WIN, server(), { local: () => { n++; return Promise.resolve("blob:x"); } });
  for (const id of ["", "0123", ID.toUpperCase(), ID + "0", "../" + ID.slice(3), 42]) {
    assert.equal(im.url({ kind: "local", id }), "", String(id)); assert.equal(im.get({ kind: "local", id }), null);
    assert.equal(im.state({ kind: "local", id }), "ungueltig");
  }
  assert.equal(im.url("local:" + ID), "", "Parameterwert allein ist keine Quelle");
  await tick(); assert.equal(n, 0);
});

test("fehlender Lieferant: url \"\", get null, kein Wurf, kein Rueckfall auf den Server", async () => {
  const api = server(), im = createImages(WIN, api);
  const src = { kind: "local", id: ID };
  assert.equal(im.url(src), ""); assert.equal(im.get(src), null); assert.equal(im.state(src), "nicht-verfuegbar");
  await tick(); assert.deepEqual(api.asked, []);
});

test("Lieferant liefert null oder wirft: leer und ehrlicher Zustand, Meldung trotzdem", async () => {
  const seen = [];
  const im = createImages(WIN, server(), { local: (id) => (id.startsWith("0") ? Promise.resolve(null) : Promise.reject(new Error("idb"))) });
  im.subscribe((k) => seen.push(k));
  const a = { kind: "local", id: ID }, b = { kind: "local", id: "f".repeat(32) };
  im.url(a); im.url(b); await tick(); await tick();
  assert.equal(im.url(a), ""); assert.equal(im.state(a), "fehlt");
  assert.equal(im.url(b), ""); assert.equal(im.state(b), "fehler");
  assert.equal(seen.length, 2);
});

test("blob:-URLs werden beim Verwerfen und beim Verdraengen freigegeben; Schluessel kollidieren nicht mit Server-Bildern", async () => {
  const revoked = []; let n = 0;
  const im = createImages(WIN, server(), { local: () => Promise.resolve("blob:x/" + ++n), revoke: (u) => revoked.push(u) });
  const src = { kind: "local", id: ID };
  im.url(src); await tick();
  assert.equal(im.url(src), "blob:x/1");
  im.forget(src); assert.deepEqual(revoked, ["blob:x/1"]);
  assert.equal(im.url(src), "", "naechstes url() laedt neu"); await tick();
  assert.equal(im.url(src), "blob:x/2");
  for (let i = 0; i < 45; i++) im.url({ kind: "local", id: i.toString(16).padStart(32, "a") });
  await tick();
  assert.ok(revoked.includes("blob:x/2"), "beim Verdraengen frei");
  const ref = "A".repeat(22) + ".png";
  assert.equal(im.state({ kind: "server", ref }), "neu");
});

test("fehlendes Foto wird nach kurzer Zeit neu gefragt (spaeter im Editor gespeichert), nicht bei jedem Zeichnen", async () => {
  let t = 0, have = false, n = 0;
  const im = createImages(WIN, server(), { local: () => { n++; return Promise.resolve(have ? "blob:y" : null); }, revoke: () => {}, now: () => t });
  const src = { kind: "local", id: ID };
  im.url(src); await tick(); assert.equal(im.state(src), "fehlt");
  im.url(src); im.url(src); await tick(); assert.equal(n, 1, "gedrosselt");
  have = true; t = 2500;
  im.url(src); await tick(); assert.equal(n, 2); assert.equal(im.url(src), "blob:y");
});
