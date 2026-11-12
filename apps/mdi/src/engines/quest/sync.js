// Synchrone Kryptografie fuer den Geheimen Kanal: PBKDF2-HMAC-SHA-256 (RFC 8018) und AES-256-GCM (NIST SP 800-38D,
// 12-Byte-IV, 128-Bit-Tag) in reinem JS. Nur Ganzzahl- und BigInt-Operationen, also bitgleich auf jeder Engine und ohne
// async: so laufen Siegeln (card.prepare) und Oeffnen (step) im Kartenvertrag. Format exakt wie alt:src/quest.js mit Web
// Crypto (Schluessel = PBKDF2(fold(Antwort), Nonce, 30000), Blob = b64url(Nonce || Chiffrat || Tag)); Tests pruefen beides
// gegen Web Crypto und gegen einen mit dem Altcode versiegelten Link.

// ---------- SHA-256 auf Uint32-Bloecken ----------
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
const IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const W = new Uint32Array(64);
function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
function compress(H, M) { // H: Uint32Array(8) wird veraendert, M: 16 Woerter
  for (let i = 0; i < 16; i++) W[i] = M[i];
  for (let i = 16; i < 64; i++) {
    const x = W[i - 15], y = W[i - 2];
    W[i] = (W[i - 16] + (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) + W[i - 7] + (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10))) >>> 0;
  }
  let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
  for (let i = 0; i < 64; i++) {
    const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
    const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
    h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
  }
  H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
  H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
}
function words(bytes, off) { const m = new Uint32Array(16); for (let i = 0; i < 16; i++) m[i] = (bytes[off + 4 * i] << 24 | bytes[off + 4 * i + 1] << 16 | bytes[off + 4 * i + 2] << 8 | bytes[off + 4 * i + 3]) >>> 0; return m; }
/** SHA-256 ueber Bytes (vorangestellter Zustand optional fuer HMAC). */
function sha256(bytes, H0, prefixLen = 0) {
  const H = new Uint32Array(H0 || IV), l = bytes.length, nb = ((l + 9 + 63) >> 6) << 6, b = new Uint8Array(nb);
  b.set(bytes); b[l] = 0x80;
  const bits = (l + prefixLen) * 8;
  for (let i = 0; i < 4; i++) b[nb - 1 - i] = (bits / 2 ** (8 * i)) & 255;
  b[nb - 5] = Math.floor(bits / 0x100000000) & 255;
  for (let o = 0; o < nb; o += 64) compress(H, words(b, o));
  return H;
}
function toBytes(H) { const o = new Uint8Array(32); for (let i = 0; i < 8; i++) { o[4 * i] = H[i] >>> 24; o[4 * i + 1] = H[i] >>> 16 & 255; o[4 * i + 2] = H[i] >>> 8 & 255; o[4 * i + 3] = H[i] & 255; } return o; }
export function sha256Bytes(bytes) { return toBytes(sha256(bytes)); }

/** PBKDF2-HMAC-SHA-256, dkLen 32 (ein Block). */
export function pbkdf2(pass, salt, iter) {
  let key = pass;
  if (key.length > 64) key = sha256Bytes(key);
  const k = new Uint8Array(64); k.set(key);
  const ip = new Uint8Array(64), op = new Uint8Array(64);
  for (let i = 0; i < 64; i++) { ip[i] = k[i] ^ 0x36; op[i] = k[i] ^ 0x5c; }
  const Hi = new Uint32Array(IV), Ho = new Uint32Array(IV);
  compress(Hi, words(ip, 0)); compress(Ho, words(op, 0)); // Mittelzustaende nach dem ersten Block
  const hmac = (msg) => toBytes(sha256(toBytes(sha256(msg, Hi, 64)), Ho, 64));
  const s1 = new Uint8Array(salt.length + 4); s1.set(salt); s1[salt.length + 3] = 1;
  let u = hmac(s1);
  const out = u.slice();
  for (let n = 1; n < iter; n++) { u = hmac(u); for (let i = 0; i < 32; i++) out[i] ^= u[i]; }
  return out;
}

// ---------- AES-256 (nur Verschluesseln, GCM braucht kein Entschluesseln des Blocks) ----------
const SBOX = (() => {
  const s = new Uint8Array(256); let p = 1, q = 1;
  do {
    p = p ^ ((p << 1) & 255) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 255; if (q & 0x80) q ^= 0x09;
    const x = q ^ ((q << 1 | q >>> 7) & 255) ^ ((q << 2 | q >>> 6) & 255) ^ ((q << 3 | q >>> 5) & 255) ^ ((q << 4 | q >>> 4) & 255);
    s[p] = (x ^ 0x63) & 255;
  } while (p !== 1);
  s[0] = 0x63;
  return s;
})();
function xt(x) { return ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 255; }
function expand(key) { // 15 Rundenschluessel a 16 Byte
  const w = new Uint8Array(240); w.set(key);
  let rc = 1;
  for (let i = 32; i < 240; i += 4) {
    let t = [w[i - 4], w[i - 3], w[i - 2], w[i - 1]];
    if (i % 32 === 0) { t = [SBOX[t[1]] ^ rc, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]]; rc = xt(rc); }
    else if (i % 32 === 16) t = t.map((x) => SBOX[x]);
    for (let j = 0; j < 4; j++) w[i + j] = w[i - 32 + j] ^ t[j];
  }
  return w;
}
function encBlock(w, inp) {
  const s = new Uint8Array(16);
  for (let i = 0; i < 16; i++) s[i] = inp[i] ^ w[i];
  for (let r = 1; r < 15; r++) {
    const t = new Uint8Array(16);
    for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) t[4 * c + row] = SBOX[s[4 * ((c + row) % 4) + row]]; // SubBytes + ShiftRows
    if (r < 14) for (let c = 0; c < 4; c++) { // MixColumns
      const a0 = t[4 * c], a1 = t[4 * c + 1], a2 = t[4 * c + 2], a3 = t[4 * c + 3], x = a0 ^ a1 ^ a2 ^ a3;
      t[4 * c] ^= x ^ xt(a0 ^ a1); t[4 * c + 1] ^= x ^ xt(a1 ^ a2); t[4 * c + 2] ^= x ^ xt(a2 ^ a3); t[4 * c + 3] ^= x ^ xt(a3 ^ a0);
    }
    for (let i = 0; i < 16; i++) s[i] = t[i] ^ w[16 * r + i];
  }
  return s;
}

// ---------- GCM ----------
const R = 0xe1n << 120n, M128 = (1n << 128n) - 1n;
function big(b) { let x = 0n; for (const v of b) x = (x << 8n) | BigInt(v); return x; }
function bytes16(x) { const o = new Uint8Array(16); for (let i = 15; i >= 0; i--) { o[i] = Number(x & 255n); x >>= 8n; } return o; }
function gmul(x, y) { let z = 0n, v = y; for (let i = 127; i >= 0; i--) { if ((x >> BigInt(i)) & 1n) z ^= v; v = v & 1n ? (v >> 1n) ^ R : v >> 1n; } return z & M128; }
function ghash(h, data) {
  let y = 0n;
  for (let o = 0; o < data.length; o += 16) { const blk = new Uint8Array(16); blk.set(data.subarray(o, o + 16)); y = gmul(y ^ big(blk), h); }
  return y;
}
function ctr(w, j0, data) {
  const out = new Uint8Array(data.length), cb = j0.slice();
  for (let o = 0; o < data.length; o += 16) {
    for (let i = 15; i >= 12; i--) { cb[i] = (cb[i] + 1) & 255; if (cb[i]) break; }
    const ks = encBlock(w, cb);
    for (let i = 0; i < 16 && o + i < data.length; i++) out[o + i] = data[o + i] ^ ks[i];
  }
  return out;
}
function tagOf(w, j0, ct) {
  const h = big(encBlock(w, new Uint8Array(16)));
  const lens = new Uint8Array(16), bits = ct.length * 8;
  for (let i = 0; i < 4; i++) lens[15 - i] = (bits / 2 ** (8 * i)) & 255;
  const padded = new Uint8Array(Math.ceil(ct.length / 16) * 16 + 16); padded.set(ct); padded.set(lens, padded.length - 16);
  return bytes16(ghash(h, padded) ^ big(encBlock(w, j0)));
}
function j0of(iv) { const j = new Uint8Array(16); j.set(iv); j[15] = 1; return j; }
/** AES-256-GCM: Chiffrat || Tag */
export function gcmEncrypt(key, iv, plain) {
  const w = expand(key), j0 = j0of(iv), ct = ctr(w, j0, plain), out = new Uint8Array(ct.length + 16);
  out.set(ct); out.set(tagOf(w, j0, ct), ct.length);
  return out;
}
/** @returns {Uint8Array|null} Klartext oder null, wenn der Tag nicht stimmt */
export function gcmDecrypt(key, iv, data) {
  if (data.length < 16) return null;
  const w = expand(key), j0 = j0of(iv), ct = data.subarray(0, data.length - 16), tag = tagOf(w, j0, ct);
  let diff = 0; for (let i = 0; i < 16; i++) diff |= tag[i] ^ data[ct.length + i];
  return diff ? null : ctr(w, j0, ct);
}
