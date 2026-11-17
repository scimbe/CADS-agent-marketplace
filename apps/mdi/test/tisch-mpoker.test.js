// Portiert aus alt:test/mpoker.test.js (Tag pre-legacy-removal), Alt-Orakel: Faelle unveraendert, nur Modulrahmen neu.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import MP0 from "../src/engines/tisch/mpoker.js";
import { rng } from "../src/contract/sdk.js";
// Neu: Geheimnisse kommen aus dem Seed-RNG des Sitzes (aus seinem Salz), nicht aus crypto.getRandomValues
let seedNo = 0;
const MP = { ...MP0, secrets: (n) => MP0.secrets(n, rng("test-mpoker|" + (seedNo++))) };

const hexOf = (b) => Buffer.from(b).toString("hex");
// Straight BigInt Montgomery ladder as an independent reference.
const P = (1n << 255n) - 19n;
const md = (a) => ((a % P) + P) % P;
function powP(b, e) { let r = 1n; b = md(b); while (e > 0n) { if (e & 1n) r = r * b % P; e >>= 1n; b = b * b % P; } return r; }
function le(h) { return BigInt("0x" + Buffer.from(h, "hex").reverse().toString("hex")); }
function refLadder(k, u) {
  let x2 = 1n, z2 = 0n, x3 = u, z3 = 1n, sw = 0n;
  for (let t = 254; t >= 0; t--) {
    const kt = (k >> BigInt(t)) & 1n; if (sw ^ kt) { [x2, x3] = [x3, x2]; [z2, z3] = [z3, z2]; } sw = kt;
    const A = md(x2 + z2), AA = A * A % P, B = md(x2 - z2), BB = B * B % P, E = md(AA - BB), C = md(x3 + z3), D = md(x3 - z3), DA = D * A % P, CB = C * B % P;
    x3 = md((DA + CB) ** 2n); z3 = md(u * md((DA - CB) ** 2n)); x2 = AA * BB % P; z2 = md(E * md(AA + 121665n * E));
  }
  if (sw) { [x2, x3] = [x3, x2]; [z2, z3] = [z3, z2]; }
  return md(x2 * powP(z2, P - 2n));
}
function deal(seats, n) {
  const sec = Array.from({ length: seats }, () => MP.secrets(n)), d1 = [], d2 = [];
  let deck = MP.cards(n);
  for (const s of sec) { deck = MP.shuffle(deck, s); d1.push(deck); }
  for (const s of sec) { deck = MP.lock(deck, s); d2.push(deck); }
  return { sec, d1, d2, final: deck };
}

test("Leiter stimmt mit einer BigInt-Referenz und mit X25519 (geklemmter Schluessel) ueberein", () => {
  for (let i = 0; i < 5; i++) {
    const k = crypto.randomBytes(32); k[31] &= 0x0f; const u = MP.cards(8)[i];
    assert.equal(le(hexOf(MP.ladder(k, Buffer.from(u, "hex")))), refLadder(le(hexOf(k)), le(u)));
  }
  // X25519 from node:crypto clamps its key; the same clamped scalar through our ladder must give the same public key
  const kp = crypto.generateKeyPairSync("x25519");
  const d = Buffer.from(kp.privateKey.export({ format: "jwk" }).d, "base64url"); d[0] &= 248; d[31] = (d[31] & 127) | 64;
  const pub = Buffer.from(kp.publicKey.export({ format: "jwk" }).x, "base64url");
  const base = Buffer.alloc(32); base[0] = 9;
  assert.equal(le(hexOf(MP.ladder(d, base))), le(hexOf(pub)));
});

test("Schloesser vertauschen, und der Kehrwert oeffnet wieder", () => {
  const a = MP.secrets(4), b = MP.secrets(4), deck = MP.cards(4), id = [0, 1, 2, 3];
  assert.deepEqual(MP.shuffle(MP.shuffle(deck, { ...a, perm: id }), { ...b, perm: id }), MP.shuffle(MP.shuffle(deck, { ...b, perm: id }), { ...a, perm: id }));
  for (let i = 0; i < 4; i++) assert.equal(MP.open(MP.pow(a.ki[i], deck[i]), [a.ki[i]], 4), i);
});

test("Doppelkopf-Deck: vier Sitze mischen und sperren, jede Position oeffnet nur mit allen vier Schluesseln", () => {
  const n = 48, t0 = Date.now(), r = deal(4, n), ms = Date.now() - t0;
  const ids = r.final.map((v, i) => MP.open(v, r.sec.map((s) => s.ki[i]), n));
  assert.deepEqual([...ids].sort((x, y) => x - y), [...Array(n).keys()], "eine Permutation aller Karten");
  const three = r.final.map((v, i) => MP.open(v, r.sec.slice(1).map((s) => s.ki[i]), n));
  assert.ok(three.every((x) => x === -1), "drei Schluessel reichen nicht");
  assert.ok(ms < 60000, "Geben dauert " + ms + " ms");   // ~0.7 s on a laptop at rest; generous for loaded CI machines
  const v = MP.verify({ n, d1: r.d1, d2: r.d2, sec: r.sec });
  assert.equal(v.ok, true); assert.deepEqual(v.deck, ids);
});

test("Pruefung am Ende findet, wer beim Mischen oder Sperren betrogen hat", () => {
  const n = 32, r = deal(3, n);
  // seat 1 swaps one locked card for a copy of another (two players would hold the same card)
  const d1 = r.d1.map((d) => d.slice()); d1[1][5] = d1[1][6];
  const v1 = MP.verify({ n, d1, d2: r.d2, sec: r.sec }); assert.deepEqual([v1.seat, v1.why], [1, "shuffle"]);
  // seat 2 claims other keys afterwards than it locked with
  const sec = r.sec.map((s) => ({ ...s, ki: s.ki.slice() })); sec[2].ki[3] = MP.secrets(1).ki[0];
  assert.equal(MP.verify({ n, d1: r.d1, d2: r.d2, sec }).seat, 2);
  // a permutation that is not one
  const bad = r.sec.map((s) => ({ ...s, perm: s.perm.slice() })); bad[0].perm[0] = bad[0].perm[1];
  assert.equal(MP.verify({ n, d1: r.d1, d2: r.d2, sec: bad }).why, "secrets");
});

test("Mischung ist gleichverteilt genug: jede Karte landet ueberall", () => {
  const n = 8, hits = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let r = 0; r < 400; r++) { const s = MP.secrets(n); s.perm.forEach((j, i) => hits[j][i]++); }
  for (const row of hits) for (const h of row) assert.ok(h > 20 && h < 90, String(h));
});
