// Golden-Tests Mal & Rat gegen das Alt-Orakel (test/fixtures/malrat-golden.json, erzeugt von gen-malrat-golden.cjs
// mit pre-legacy-removal apps/<alter-client>/src/malrat.js): dieselbe Strich-Kodierung im Link, dieselben Pruefwerte,
// Wortvorschlaege, Tipps, Faltung und Wortfilter.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import * as M from "../src/engines/malrat/malrat.js";
import { mulberry32 } from "../src/engines/seed32/seed32.js";

const G = createRequire(import.meta.url)("./fixtures/malrat-golden.json");

function scribble(n, k, seed) {
  const r = mulberry32(seed || 1), out = [];
  for (let i = 0; i < n; i++) {
    const cx = r(), cy = r(), a = r() * 6, p = [];
    for (let j = 0; j < k; j++) p.push([Math.min(1, Math.max(0, cx + 0.3 * Math.cos(a + j / 9) + (r() - 0.5) * 0.004)), Math.min(1, Math.max(0, cy + 0.3 * Math.sin(a + j / 7) + (r() - 0.5) * 0.004))]);
    out.push({ c: i % 8, w: i % 3, p });
  }
  return out;
}
function zigzag(n, k, seed) {
  const r = mulberry32(seed), out = [];
  for (let i = 0; i < n; i++) { const p = []; for (let j = 0; j < k; j++) p.push([r(), r()]); out.push({ c: Math.floor(r() * 8), w: Math.floor(r() * 3), p }); }
  return out;
}
function make(r) { return r.kind === "line" ? [{ c: 5, w: 2, p: Array.from({ length: 50 }, (x, i) => [i / 49, i / 49]) }, { c: 1, w: 0, p: [[0.5, 0.5]] }] : r.kind === "zigzag" ? zigzag(r.n, r.k, r.seed) : scribble(r.n, r.k, r.seed); }

test("Golden: Orakel vollstaendig (>= 30 Strichsaetze, alle Toleranzstufen, groebere Packungen kommen vor)", () => {
  assert.deepEqual(M.EPS, G.eps);
  assert.equal(M.ALL.length, G.all);
  assert.ok(G.strokes.length >= 30);
  const used = new Set(G.strokes.flatMap((s) => [s.pack600, s.pack300, s.pack120].filter(Boolean).map((p) => p.eps)));
  assert.deepEqual([...used].sort(), [0.45, 0.8, 1.3, 2], "jede Toleranzstufe wird gebraucht");
  assert.ok(G.strokes.some((s) => s.pack120 === null), "auch Bilder, die gar nicht passen");
});

test("Golden: dieselbe Strich-Kodierung im Link wie der Altcode (encode je Toleranz, pack, decode, Farben)", () => {
  for (const [i, s] of G.strokes.entries()) {
    const lines = make(s.recipe);
    for (const [e, want] of Object.entries(s.enc)) assert.equal(M.encode(lines, Number(e)), want, "Satz " + i + " eps " + e);
    assert.deepEqual(M.pack(lines, (x) => x.length <= 600), s.pack600, "pack600 " + i);
    assert.deepEqual(M.pack(lines, (x) => x.length <= 300), s.pack300, "pack300 " + i);
    assert.deepEqual(M.pack(lines, (x) => x.length <= 120), s.pack120, "pack120 " + i);
    if (s.dec !== undefined) assert.deepEqual(M.decode(M.encode(lines, 0.45)), s.dec, "decode " + i);
    assert.deepEqual(M.used(M.decode(M.encode(lines, 0.45)) || []), s.used, "Farben " + i);
  }
});

test("Golden: Pruefwerte bitgleich zum Altcode (WebCrypto) und zu node:crypto pbkdf2Sync", () => {
  for (const c of G.checks) {
    assert.equal(M.check(c.w, c.seed, c.r), c.k, c.w + "|" + c.seed + "|" + c.r);
    assert.equal(crypto.pbkdf2Sync(M.fold(c.w), "malrat|" + c.seed + "|" + c.r, M.ITER, 8, "sha256").toString("base64url"), c.k);
  }
  // PBKDF2 selbst: lange Schluessel (> 64 Byte) und mehr als ein Block
  const key = new TextEncoder().encode("k".repeat(100)), salt = new TextEncoder().encode("salz");
  assert.equal(Buffer.from(M.pbkdf2(key, salt, 3, 40)).toString("hex"), crypto.pbkdf2Sync(Buffer.from(key), Buffer.from(salt), 3, 40, "sha256").toString("hex"));
});

test("Golden: Wortvorschlaege, Tipp-Reihenfolge, Buchstabenbank, Faltung und Wortfilter wie im Altcode", () => {
  for (const s of G.suggest) assert.deepEqual(M.suggest(s.seed, s.r, s.l), s.s, s.seed + "|" + s.r + "|" + s.l);
  for (const o of G.order) assert.deepEqual(M.order(o.n, o.seed, o.r), o.o);
  for (const b of G.bank) assert.deepEqual(M.bank(b.w, b.seed, b.r), b.b);
  for (const t of G.text) {
    assert.equal(M.fold(t.w), t.fold, "fold " + t.w); assert.equal(M.own(t.w), t.own, "own " + t.w);
    assert.equal(M.guess(t.w), t.guess, "guess " + t.w); assert.equal(M.hintOf(t.w), t.hint, "hint " + t.w);
    assert.deepEqual(M.letters(t.w), t.letters, "letters " + t.w);
  }
});
