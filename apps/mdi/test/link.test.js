import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encode, decode, MAX_FRAGMENT } from "../src/app/link.js";
import { receive } from "../src/app/game.js";
import { counter } from "./helpers.js";

const VEC = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/link-vectors.json"), "utf8"));

test("Fragment #v2.<typ>.<b64url>: hin und zurueck", () => {
  const f = encode("card", { c: "gruss", v: "1.0.0", p: { title: "Grüße ✓", text: "", bg: "ink", stickers: [] } });
  assert.match(f, /^#v2\.card\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(decode(f), { ok: true, type: "card", data: { c: "gruss", v: "1.0.0", p: { title: "Grüße ✓", text: "", bg: "ink", stickers: [] } } });
  assert.throws(() => encode("card", { c: "gruss" }), /Schema/);
  assert.throws(() => encode("card", { c: "gruss", v: "1.0.0", p: { t: "x".repeat(MAX_FRAGMENT) } }), /zu-lang/);
});
test("Testvektoren: annehmen", () => {
  for (const v of VEC.accept) { const r = receive(v.hash, null, [counter("7")()]); assert.equal(r.ok, true, v.name + " " + r.reason); assert.equal(r.kind, v.kind); }
});
test("Testvektoren: ablehnen mit Grund (nie raten, A4)", () => {
  for (const v of VEC.reject) { const r = receive(v.hash, null, [counter("8")()]); assert.deepEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: v.reason }, v.name); }
});
test("Empfang eines Zug-Duells: Pruefer bekommt seinen Sitz, aber nie die Karten des Boten", () => {
  const r = receive(VEC.accept[1].hash, null, ["9".repeat(32)]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.session.mine, [1]);
  assert.equal(r.session.state.priv[0], null);
  assert.equal(r.store, undefined, "beim Empfang wird nichts gespeichert, erst beim Annehmen");
});
