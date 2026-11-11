import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as S from "../src/contract/sdk.js";

test("sha256 stimmt mit node:crypto ueberein (FIPS 180-4)", () => {
  for (const s of ["", "abc", "x".repeat(55), "x".repeat(56), "x".repeat(64), "äöü🙂".repeat(40)]) assert.equal(S.sha256(s), createHash("sha256").update(s).digest("hex"));
});
test("rng: gleicher Seed, gleiche Folge; int() ohne Schiefe im Bereich", () => {
  const a = S.rng("seed"), b = S.rng("seed"), c = S.rng("anders");
  const xa = Array.from({ length: 50 }, () => a.u32()), xb = Array.from({ length: 50 }, () => b.u32()), xc = Array.from({ length: 50 }, () => c.u32());
  assert.deepEqual(xa, xb); assert.notDeepEqual(xa, xc);
  const r = S.rng(7), n = new Array(6).fill(0);
  for (let i = 0; i < 6000; i++) n[r.int(6)]++;
  for (const k of n) assert.ok(k > 850 && k < 1150, String(n));
  assert.throws(() => r.int(0)); assert.throws(() => r.int(1.5));
});
test("rng: Goldene Werte (bitgleich ueber Engines; e2e prueft dieselben Werte im Browser)", () => {
  const r = S.rng("mdi-golden");
  assert.deepEqual([r.u32(), r.u32(), r.u32()], GOLD.rng);
});
test("Tabellen-Trigonometrie: nur Ganzzahl-Arithmetik, Abweichung zu Math.sin < 1e-4, Tabellenhash fest", () => {
  let md = 0; const all = [];
  for (let a = 0; a < 4096; a++) { md = Math.max(md, Math.abs(S.sinT(a) / 65536 - Math.sin((a * 2 * Math.PI) / 4096))); all.push(S.sinT(a)); }
  assert.ok(md < 1e-4, String(md));
  assert.equal(S.sinT(1024), 65536); assert.equal(S.cosT(0), 65536); assert.equal(S.sinT(0), 0); assert.equal(S.sinT(2048), 0);
  assert.equal(S.stateHash(all), GOLD.sinTable);
});
test("atan2T ist Umkehrung von sinT/cosT (+-1 Einheit)", () => {
  for (let a = 0; a < 4096; a += 13) {
    const x = S.cosT(a), y = S.sinT(a), b = S.atan2T(y, x);
    assert.ok(Math.min(Math.abs(a - b), 4096 - Math.abs(a - b)) <= 1, a + " " + b);
  }
});
test("logD: nur Grundrechenarten, nahe Math.log, Goldwert fest", () => {
  for (const x of [1, 2, 3, 10, 1e6, 0.001]) assert.ok(Math.abs(S.logD(x) - Math.log(x)) < 1e-12);
  assert.equal(S.logD(12345).toString(), GOLD.logD);
});
test("Festkomma und isqrt", () => {
  assert.equal(S.mulFx(S.fx(3), S.fx(2)), S.fx(6));
  assert.equal(S.mulFx(S.fx(-3), S.ONE / 2), -S.fx(3) / 2);
  assert.equal(S.divFx(S.fx(1), S.fx(4)), S.ONE / 4);
  for (const n of [0, 1, 2, 15, 16, 17, 99, 1e9]) { const r = S.isqrt(n); assert.ok(r * r <= n && (r + 1) * (r + 1) > n); }
});
test("canon: Schluessel sortiert, keine Gleitkommazahlen im Zustand", () => {
  assert.equal(S.canon({ b: 1, a: [true, null, "x"] }), '{"a":[true,null,"x"],"b":1}');
  assert.throws(() => S.canon({ a: 0.5 }));
});
const GOLD = { rng: [2473711870, 243433525, 3063576089], sinTable: "b8eb7f1882e3f8da", logD: "9.421006401779279" };
export { GOLD };
