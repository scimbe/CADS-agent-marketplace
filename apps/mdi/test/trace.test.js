// Geist-Spuren (ADR 0001 b). Teil 1: Alt-Orakel – Tests aus dem Altcode (test/spur.test.js, Tag pre-legacy-removal)
// unveraendert gegen den Port src/contract/trace.js. Teil 2: allgemeines Format (Knoepfe, Achsen, Zeiger).
import test from "node:test";
import assert from "node:assert/strict";
import * as T from "../src/contract/trace.js";

const u8 = (a) => Uint8Array.from(a);
const S = { encode: T.encodeSpur, parse: T.parseSpur, sanitize: T.sanitizeSpur, recorder: T.spurRecorder, player: T.spurPlayer, TMAX: T.SPUR_TMAX, MAX_BYTES: T.SPUR_MAX_BYTES };

test("Alt-Orakel Spur: Kodierung – Tap kurz (gap*2), sonst gap*16+d*2+1, Ende d=0, Varint LEB128", () => {
  const b = S.encode([[0, 1], [40, 1], [50, 2], [60, 3]], 70);
  assert.deepEqual([...b], [0, 80, 165, 1, 167, 1, 161, 1]);
  assert.deepEqual(S.parse(b), { ev: [[0, 1], [40, 1], [50, 2], [60, 3]], end: 70 });
  assert.deepEqual([...S.encode([[63, 1]], null)], [126]);
  assert.deepEqual([...S.encode([[64, 1]], null)], [128, 1]);
  assert.deepEqual([...S.sanitize(b)], [...b]);
  const p = S.player(b), w = [];
  for (let t = 0; t <= 70; t++) w.push(p.at(t));
  assert.equal(w[0], 1); assert.equal(w[1], 0); assert.equal(w[40], 1); assert.equal(w[49], 0);
  assert.equal(w[50], 2); assert.equal(w[59], 2); assert.equal(w[60], 1); assert.equal(w[61], 0);
  assert.equal(p.end, 70);
});

test("Alt-Orakel Spur: sanitize verwirft, was die Grenzen bricht", () => {
  assert.equal(S.TMAX, 90 * 120);
  assert.equal(S.sanitize(u8([0x80, 0x80, 0x80, 0x80, 0x01])), null);
  assert.equal(S.sanitize(u8([0x80])), null);
  assert.equal(S.sanitize(S.encode([[S.TMAX + 1, 1]], null)), null);
  assert.notEqual(S.sanitize(S.encode([[S.TMAX, 1]], S.TMAX)), null);
  assert.equal(S.sanitize(S.encode([[0, 1], [S.TMAX, 1]], S.TMAX + 1)), null);
  const many = []; for (let i = 1; i <= 200; i++) many.push([i * 60, 1]);
  assert.equal(S.sanitize(S.encode(many, null)), null);
  assert.equal(S.sanitize(u8([1 + 0, 0])), null);
  assert.equal(S.sanitize(u8([0, 0])), null);
  assert.equal(S.sanitize(u8([16 * 5 + 2 + 1])), null);
  assert.equal(S.sanitize(new Uint8Array(S.MAX_BYTES + 1).fill(2)), null);
  assert.equal(S.sanitize(new Uint8Array(0)), null);
  for (const x of [null, undefined, "AAAA", [0, 2], { length: 3 }, 7]) assert.equal(S.sanitize(x), null);
  assert.deepEqual([...S.sanitize(u8([0x80, 0x00, 2]))], [0, 2]);
});

test("Alt-Orakel Spur: Aufnahme fasst Eingaben auf einem Tick zusammen und endet ehrlich an MAX_BYTES", () => {
  const r = S.recorder();
  r.put(0, 1); r.put(0, 1); r.put(5, 2); r.put(5, 3); r.put(3, 1); r.put(9, 0); r.end(12);
  assert.deepEqual(S.parse(r.bytes()), { ev: [[0, 1], [5, 3], [9, 2]], end: 12 });
  const r2 = S.recorder(); r2.put(4, 2); r2.put(4, 0); r2.end(8);
  assert.deepEqual(S.parse(r2.bytes()), { ev: [], end: 8 });
  const big = S.recorder(); let t = 0;
  for (let i = 0; i < 2000; i++) { t += 64; big.put(t, 1); }
  big.end(S.TMAX);
  const b = big.bytes(), p = S.parse(b);
  assert.ok(b.length <= S.MAX_BYTES);
  assert.ok(p && p.end < S.TMAX && p.end === p.ev[p.ev.length - 1][0] + 64);
});

test("Allgemeine Spur: Rundweg mit Knoepfen, Achsen und Zeigern; at() liefert die Eingabe je Tick", () => {
  const seq = [[0, { b: 1 }], [1, { b: 0 }], [7, { b: 2, ax: -500 }], [8, { b: 2, ax: -500, p: [[0, 120, 900, 3]] }], [9, { b: 2, ax: -500, p: [[0, 130, 880, 1]] }], [30, { b: 0 }]];
  const r = T.recorder(600);
  for (let t = 0; t <= 40; t++) { const e = seq.filter((x) => x[0] <= t).pop(); r.put(t, e ? e[1] : { b: 0 }); }
  r.end(40);
  const bytes = r.bytes(), p = T.parse(bytes);
  assert.ok(p, "lesbar");
  assert.equal(p.end, 40);
  for (let t = 0; t <= 40; t++) { const e = seq.filter((x) => x[0] <= t).pop(); assert.deepEqual(p.at(t), { b: 0, ...(e ? e[1] : {}) }, "Tick " + t); }
  assert.ok(T.fromB64url(T.toB64url(bytes)).every((v, i) => v === bytes[i]));
});

test("Allgemeine Spur: nichtkanonische, abgeschnittene und zu grosse Spuren werden abgelehnt", () => {
  const r = T.recorder(); r.put(0, { b: 1 }); r.put(3, { b: 0 }); r.end(5);
  const ok = r.bytes();
  assert.ok(T.parse(ok));
  assert.equal(T.parse(ok.slice(0, ok.length - 1)), null, "abgeschnitten");
  assert.equal(T.parse(Uint8Array.from([...ok, 0, 0])), null, "nach dem Ende");
  assert.equal(T.parse(Uint8Array.from([0, 1, 0, 1, 1, 1, 1, 0])), null, "Feld ohne Aenderung im mask");
  assert.equal(T.parse(new Uint8Array(0)), null);
  assert.equal(T.parse(ok, 2), null, "ueber maxBytes");
  assert.throws(() => { const q = T.recorder(); q.put(5, { b: 1 }); q.put(4, { b: 0 }); }, /zurueck/);
  const cap = T.recorder(20); for (let t = 0; t < 200; t++) cap.put(t, { b: t % 2 }); cap.end(200);
  assert.ok(cap.bytes().length <= 20 && T.parse(cap.bytes(), 20), "endet ehrlich am Budget");
});
