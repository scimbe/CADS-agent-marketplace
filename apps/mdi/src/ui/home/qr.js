// QR-Code (ISO/IEC 18004) ohne Netz und ohne Abhaengigkeit, fuer das Story-Bild 9:16 (alt:src/statuscard.js nutzte
// qrcode-generator mit Stufe M und automatischer Version). Hier: Byte-Modus (UTF-8), Fehlerkorrektur M, Version 1-40
// automatisch, Maske nach Strafpunkten. Blocktabelle M und Positionen der Ausrichtungsmuster sind die Normtabellen (gleiche
// Werte wie qrcode-generator 1.4.4, MIT). Geprueft: test/home-qr.test.js (Struktur + eingefrorene Matrizen, die mit jsQR
// gelesen wurden).

// je Version: [Bloecke, Codewoerter je Block, Daten je Block, (Bloecke2, Codewoerter2, Daten2)]
const RS_M = [[1,26,16],[1,44,28],[1,70,44],[2,50,32],[2,67,43],[4,43,27],[4,49,31],[2,60,38,2,61,39],[3,58,36,2,59,37],[4,69,43,1,70,44],[1,80,50,4,81,51],[6,58,36,2,59,37],[8,59,37,1,60,38],[4,64,40,5,65,41],[5,65,41,5,66,42],[7,73,45,3,74,46],[10,74,46,1,75,47],[9,69,43,4,70,44],[3,70,44,11,71,45],[3,67,41,13,68,42],[17,68,42],[17,74,46],[4,75,47,14,76,48],[6,73,45,14,74,46],[8,75,47,13,76,48],[19,74,46,4,75,47],[22,73,45,3,74,46],[3,73,45,23,74,46],[21,73,45,7,74,46],[19,75,47,10,76,48],[2,74,46,29,75,47],[10,74,46,23,75,47],[14,74,46,21,75,47],[14,74,46,23,75,47],[12,75,47,26,76,48],[6,75,47,34,76,48],[29,74,46,14,75,47],[13,74,46,32,75,47],[40,75,47,7,76,48],[18,75,47,31,76,48]];
const ALIGN = [[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]];
const FORMAT_M = 0; // Stufe M hat die Formatbits 00

function blocks(v) { const r = RS_M[v - 1], out = []; for (let k = 0; k < r.length; k += 3) for (let n = 0; n < r[k]; n++) out.push({ total: r[k + 1], data: r[k + 2] }); return out; }
export function capacity(v) { return blocks(v).reduce((a, b) => a + b.data, 0); }

function gfMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 255; }
function rsDivisor(deg) {
  const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1;
  for (let i = 0; i < deg; i++) { for (let j = 0; j < deg; j++) { r[j] = gfMul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; } root = gfMul(root, 2); }
  return r;
}
function rsRemainder(data, div) {
  const r = new Array(div.length).fill(0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); for (let i = 0; i < div.length; i++) r[i] ^= gfMul(div[i], f); }
  return r;
}

function codewords(bytes, v) {
  const bits = [], put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, v < 10 ? 8 : 16); for (const b of bytes) put(b, 8);
  const cap = capacity(v) * 8;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = []; for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }
  for (let p = 0xec; data.length < cap / 8; p ^= 0xec ^ 0x11) data.push(p);
  // auf Bloecke verteilen, je Block Fehlerkorrektur, dann verschraenkt
  const bl = blocks(v), ecLen = bl[0].total - bl[0].data, div = rsDivisor(ecLen), ds = [], es = [];
  let k = 0;
  for (const b of bl) { const d = data.slice(k, k + b.data); k += b.data; ds.push(d); es.push(rsRemainder(d, div)); }
  const out = [], maxD = Math.max(...bl.map((b) => b.data));
  for (let i = 0; i < maxD; i++) for (const d of ds) if (i < d.length) out.push(d[i]);
  for (let i = 0; i < ecLen; i++) for (const e of es) out.push(e[i]);
  return out;
}

function baseMatrix(v) {
  const n = 17 + 4 * v, m = Array.from({ length: n }, () => new Array(n).fill(false)), fn = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (x, y, d) => { m[y][x] = d; fn[y][x] = true; };
  for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= n || y >= n) continue; const d = Math.max(Math.abs(dx), Math.abs(dy)); set(x, y, d !== 2 && d !== 4); } };
  finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
  const al = ALIGN[v - 1];
  for (const ay of al) for (const ax of al) {
    if ((ax === 6 && ay === 6) || (ax === 6 && ay === al[al.length - 1]) || (ax === al[al.length - 1] && ay === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // Formatbereiche reservieren (werden spaeter beschrieben) und das dunkle Modul
  drawFormat(m, fn, 0, set);
  if (v >= 7) {
    let rem = v; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (v << 12) | rem;
    for (let i = 0; i < 18; i++) { const d = ((bits >>> i) & 1) === 1, a = n - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, d); set(b, a, d); }
  }
  return { n, m, fn };
}
function drawFormat(m, fn, mask, set) {
  const n = m.length, data = (FORMAT_M << 3) | mask;
  let rem = data; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412, b = (i) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, b(i));
  set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, b(i));
  for (let i = 0; i < 8; i++) set(n - 1 - i, 8, b(i));
  for (let i = 8; i < 15; i++) set(8, n - 15 + i, b(i));
  set(8, n - 8, true);
}
const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
];
function place(base, cw) {
  const { n, m, fn } = base, out = m.map((r) => r.slice());
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? n - 1 - vert : vert;
      if (!fn[y][x] && i < cw.length * 8) { out[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
  return out;
}
function penalty(m) {
  const n = m.length; let p = 0;
  const line = (get) => {
    for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b <= n; b++) {
        if (b < n && get(a, b) === get(a, b - 1)) run++;
        else { if (run >= 5) p += 3 + run - 5; run = 1; }
      }
      for (let b = 0; b + 11 <= n; b++) {
        const s = Array.from({ length: 11 }, (_, k) => (get(a, b + k) ? 1 : 0)).join("");
        if (s === "10111010000" || s === "00001011101") p += 40;
      }
    }
  };
  line((a, b) => m[a][b]); line((a, b) => m[b][a]);
  let dark = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (m[y][x]) dark++;
    if (x + 1 < n && y + 1 < n && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
  }
  const total = n * n;
  p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return p;
}

/** Text -> Matrix (Array von Zeilen, true = dunkel). Wirft, wenn der Text nicht in Version 40 passt. */
export function qrMatrix(text) {
  const bytes = new TextEncoder().encode(String(text));
  let v = 1;
  while (v <= 40 && capacity(v) < bytes.length + (v < 10 ? 2 : 3)) v++;
  if (v > 40) throw new RangeError("qr: zu lang");
  const base = baseMatrix(v), cw = codewords(bytes, v);
  let best = null, bestP = Infinity;
  for (let k = 0; k < 8; k++) {
    const mm = place(base, cw);
    for (let y = 0; y < base.n; y++) for (let x = 0; x < base.n; x++) if (!base.fn[y][x] && MASKS[k](x, y)) mm[y][x] = !mm[y][x];
    drawFormat(mm, base.fn, k, (x, y, d) => { mm[y][x] = d; });
    const pp = penalty(mm);
    if (pp < bestP) { bestP = pp; best = mm; }
  }
  return best;
}
