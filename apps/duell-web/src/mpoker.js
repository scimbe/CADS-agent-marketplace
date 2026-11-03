/* Mental poker for the card tables: the players shuffle and deal together, nobody (no server either) sees a card that is
   not theirs, and at the end everyone can check the whole deal. No DOM, no network: table.js carries the messages.
   Commutative encryption (SRA) on Curve25519, x coordinate only: a card is the point (id+1)*G, a lock with key k is k*P.
   Locks commute, so they can be put on and taken off in any order.
   1. shuffle: seat 0..n-1 in turn lock every card with its own key k and permute the deck (one honest seat is enough).
   2. lock: seat 0..n-1 in turn swap k for a fresh key per position (k^-1 * k_i in one step), no permutation.
   A position opens only with all n position keys: the owner gets the others' keys privately; playing a card publishes all.
   3. reveal: after the hand every seat publishes k, the permutation and all keys; verify() replays both passes.
   Field arithmetic follows TweetNaCl (public domain, Bernstein et al.), without the X25519 clamping, so keys invert mod L. */
(function (root) {
  "use strict";
  var L = (1n << 252n) + 27742317777372353535851937790883648493n;   // order of the base point
  function gf(init) { var r = new Float64Array(16); if (init) for (var i = 0; i < init.length; i++) r[i] = init[i]; return r; }
  var _121665 = gf([0xdb41, 1]);
  function car(o) { var c = 1, v; for (var i = 0; i < 16; i++) { v = o[i] + c + 65535; c = Math.floor(v / 65536); o[i] = v - c * 65536; } o[0] += c - 1 + 37 * (c - 1); }
  function sel(p, q, b) { var t, c = ~(b - 1); for (var i = 0; i < 16; i++) { t = c & (p[i] ^ q[i]); p[i] ^= t; q[i] ^= t; } }
  function pack(o, n) {
    var i, j, b, m = gf(), t = gf();
    for (i = 0; i < 16; i++) t[i] = n[i];
    car(t); car(t); car(t);
    for (j = 0; j < 2; j++) {
      m[0] = t[0] - 0xffed;
      for (i = 1; i < 15; i++) { m[i] = t[i] - 0xffff - ((m[i - 1] >> 16) & 1); m[i - 1] &= 0xffff; }
      m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1); b = (m[15] >> 16) & 1; m[14] &= 0xffff;
      sel(t, m, 1 - b);
    }
    for (i = 0; i < 16; i++) { o[2 * i] = t[i] & 0xff; o[2 * i + 1] = t[i] >> 8; }
  }
  function unpack(o, n) { for (var i = 0; i < 16; i++) o[i] = n[2 * i] + (n[2 * i + 1] << 8); o[15] &= 0x7fff; }
  function A(o, a, b) { for (var i = 0; i < 16; i++) o[i] = a[i] + b[i]; }
  function Z(o, a, b) { for (var i = 0; i < 16; i++) o[i] = a[i] - b[i]; }
  var T = new Float64Array(31);
  function M(o, a, b) {
    var i, j, ai; for (i = 0; i < 31; i++) T[i] = 0;
    for (i = 0; i < 16; i++) { ai = a[i]; for (j = 0; j < 16; j++) T[i + j] += ai * b[j]; }
    for (i = 0; i < 15; i++) T[i] += 38 * T[i + 16];
    for (i = 0; i < 16; i++) o[i] = T[i];
    car(o); car(o);
  }
  function S(o, a) { M(o, a, a); }
  function inv(o, i) { var c = gf(), a; for (a = 0; a < 16; a++) c[a] = i[a]; for (a = 253; a >= 0; a--) { S(c, c); if (a !== 2 && a !== 4) M(c, c, i); } for (a = 0; a < 16; a++) o[a] = c[a]; }
  // k*P on the x coordinate (Montgomery ladder). k: 32 bytes little endian, k < L; u: 32 bytes. Returns 32 bytes.
  function ladder(k, u) {
    var x = gf(), a = gf([1]), b = gf(), c = gf(), d = gf([1]), e = gf(), f = gf(), r, i, q = new Uint8Array(32);
    unpack(x, u); for (i = 0; i < 16; i++) b[i] = x[i];
    for (i = 254; i >= 0; --i) {
      r = (k[i >>> 3] >>> (i & 7)) & 1;
      sel(a, b, r); sel(c, d, r);
      A(e, a, c); Z(a, a, c); A(c, b, d); Z(b, b, d); S(d, e); S(f, a); M(a, c, a); M(c, b, e);
      A(e, a, c); Z(a, a, c); S(b, a); Z(c, d, f); M(a, c, _121665); A(a, a, d); M(c, c, a); M(a, d, f); M(d, b, x); S(b, e);
      sel(a, b, r); sel(c, d, r);
    }
    inv(c, c); M(a, a, c); pack(q, a);
    return q;
  }
  // ---------- scalars mod L (few, so BigInt is fine) ----------
  function toBig(h) { var v = 0n; for (var i = 62; i >= 0; i -= 2) v = (v << 8n) | BigInt(parseInt(h.substr(i, 2), 16)); return v; }
  function fromBig(v) { var s = ""; for (var i = 0; i < 32; i++) { s += Number(v & 255n).toString(16).padStart(2, "0"); v >>= 8n; } return s; }
  function bytes(h) { var o = new Uint8Array(32); for (var i = 0; i < 32; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; }
  function hex(b) { var s = ""; for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? "0" : "") + b[i].toString(16); return s; }
  function invL(a) { var r0 = a % L, r1 = L, s0 = 1n, s1 = 0n, q, t; while (r1) { q = r0 / r1; t = r0 - q * r1; r0 = r1; r1 = t; t = s0 - q * s1; s0 = s1; s1 = t; } return ((s0 % L) + L) % L; }
  function rnd(n) { var b = new Uint8Array(n); root.crypto.getRandomValues(b); return b; }
  function key() { for (;;) { var b = rnd(32); b[31] &= 0x1f; var v = toBig(hex(b)); if (v > 0n && v < L) return fromBig(v); } }
  function below(n) { var lim = Math.floor(0x100000000 / n) * n; for (;;) { var v = new Uint32Array(rnd(4).buffer)[0]; if (v < lim) return v % n; } }
  function pow(kHex, uHex) { return hex(ladder(bytes(kHex), bytes(uHex))); }
  // ---------- the protocol ----------
  var G = "09".padEnd(64, "0"), cache = {};
  // The open deck: card id i is the point (i+1)*G. Everyone computes the same list.
  function cards(n) {
    if (cache[n]) return cache[n];
    var out = []; for (var i = 0; i < n; i++) out.push(pow(fromBig(BigInt(i + 1)), G));
    return (cache[n] = out);
  }
  function secrets(n) {
    var p = []; for (var i = 0; i < n; i++) p.push(i);
    for (i = n - 1; i > 0; i--) { var j = below(i + 1), t = p[i]; p[i] = p[j]; p[j] = t; }
    var ki = []; for (i = 0; i < n; i++) ki.push(key());
    return { k: key(), perm: p, ki: ki };
  }
  function isPoint(h) { return typeof h === "string" && /^[0-9a-f]{64}$/.test(h); }
  // out[i] = k * deck[perm[i]]
  function shuffle(deck, sec) { return sec.perm.map(function (j) { return pow(sec.k, deck[j]); }); }
  function lock(deck, sec) { var ik = invL(toBig(sec.k)); return deck.map(function (v, i) { return pow(fromBig(ik * toBig(sec.ki[i]) % L), v); }); }
  // All n position keys -> card id, or -1 when the keys do not open a card.
  function open(v, keys, n) {
    var p = 1n; keys.forEach(function (k) { p = p * toBig(k) % L; });
    var m = pow(fromBig(invL(p)), v);
    return cards(n).indexOf(m);
  }
  function validSecrets(s, n) {
    if (!s || !isPoint(s.k) || !Array.isArray(s.perm) || !Array.isArray(s.ki) || s.perm.length !== n || s.ki.length !== n) return false;
    var seen = {}; for (var i = 0; i < n; i++) { var j = s.perm[i]; if (!(j >= 0 && j < n && j === (j | 0)) || seen[j]) return false; seen[j] = 1; }
    var k = toBig(s.k); if (!(k > 0n && k < L)) return false;
    return s.ki.every(function (x) { if (!isPoint(x)) return false; var v = toBig(x); return v > 0n && v < L; });
  }
  // Replays a finished deal. t = { n, d1: [deck after each seat's shuffle], d2: [deck after each seat's lock], sec: [secrets per seat] }.
  // -> { ok, seat (who cheated, if found), deck: card id per position }
  function verify(t) {
    var n = t.n, deck = cards(n), seats = t.sec.length;
    for (var s = 0; s < seats; s++) {
      if (!validSecrets(t.sec[s], n)) return { ok: false, seat: s, why: "secrets" };
      deck = shuffle(deck, t.sec[s]);
      if (deck.join() !== (t.d1[s] || []).join()) return { ok: false, seat: s, why: "shuffle" };
    }
    for (s = 0; s < seats; s++) {
      deck = lock(deck, t.sec[s]);
      if (deck.join() !== (t.d2[s] || []).join()) return { ok: false, seat: s, why: "lock" };
    }
    var ids = deck.map(function (v, i) { return open(v, t.sec.map(function (x) { return x.ki[i]; }), n); });
    var sorted = ids.slice().sort(function (a, b) { return a - b; });
    if (sorted.some(function (x, i) { return x !== i; })) return { ok: false, seat: -1, why: "deck" };
    return { ok: true, deck: ids };
  }
  var api = { L: L, ladder: ladder, pow: pow, cards: cards, secrets: secrets, shuffle: shuffle, lock: lock, open: open, verify: verify, isPoint: isPoint, validSecrets: validSecrets };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MPoker = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
