// Foto im Editor (media.local): PHOTO_PUT -> Effekt home.photo speichert auf dem Geraet und setzt "local:<id>" per PARAM.
import test from "node:test";
import assert from "node:assert/strict";
import { home } from "../src/ui/home/feature.js";
import { createMedia } from "../src/broker/media.js";

const ctx0 = home.context();
function mem() { const m = new Map(); return { get: async (k) => m.get(k), put: async (k, v) => { m.set(k, v); }, del: async (k) => { m.delete(k); } }; }

test("PHOTO_PUT: busy und Effekt; PHOTO_DONE setzt den Zustand", () => {
  const out = [], file = { type: "image/png" };
  const c = home.actions.photoPut(ctx0, { type: "PHOTO_PUT", key: "photo", file }, (fx) => out.push(fx));
  assert.deepEqual(c.photo, { key: "photo", st: "busy" }); assert.deepEqual(out, [{ type: "home.photo", key: "photo", file }]);
  assert.deepEqual(home.actions.photoDone(c, { key: "photo", st: "ok" }).photo, { key: "photo", st: "ok" });
  assert.equal(home.actions.photoPut(ctx0, { key: "photo" }, () => assert.fail()).photo.st, "kein-bild");
});

test("home.photo: speichert und setzt PARAM local:<id>; ohne Speicher nicht-verfuegbar", async () => {
  const media = createMedia({ store: mem(), digest: (b) => crypto.subtle.digest("SHA-256", b) }), got = [];
  home.effects["home.photo"]({ key: "photo", file: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }) }, { dispatch: (e) => got.push(e), deps: { home: { media } } });
  for (let i = 0; i < 200 && got.length < 2; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(got[0].type, "PARAM"); assert.match(got[0].value, /^local:[0-9a-f]{32}$/); assert.deepEqual(got[1], { type: "PHOTO_DONE", key: "photo", st: "ok" });
  const none = [];
  home.effects["home.photo"]({ key: "photo", file: {} }, { dispatch: (e) => none.push(e), deps: {} });
  assert.deepEqual(none, [{ type: "PHOTO_DONE", key: "photo", st: "nicht-verfuegbar" }]);
});
