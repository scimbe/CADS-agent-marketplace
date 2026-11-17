// QR fuer das Story-Bild: Struktur nach ISO 18004 und eingefrorene Matrizen (vorher mit jsQR gelesen).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { qrMatrix, capacity } from "../src/ui/home/qr.js";

const F = JSON.parse(fs.readFileSync(new URL("./fixtures/home-qr.json", import.meta.url), "utf8"));
test("eingefrorene Matrizen (mit jsQR gelesen) bleiben gleich", () => {
  for (const c of F.cases) assert.deepEqual(qrMatrix(c.t).map((r) => r.map((b) => (b ? "1" : "0")).join("")), c.rows, c.t);
});
test("Groesse waechst mit dem Text, Version 1 bis 40, zu lang wirft", () => {
  assert.equal(qrMatrix("1").length, 21);
  assert.equal(capacity(40), 2334, "Datencodewoerter Version 40-M (Norm)");
  assert.equal(qrMatrix("y".repeat(1200)).length, 17 + 4 * 29);
  assert.throws(() => qrMatrix("y".repeat(2400)), RangeError);
});
test("Suchmuster in drei Ecken, Taktlinie, dunkles Modul", () => {
  const m = qrMatrix("https://bunsenbrenner.org/s/Ab3dEf7h"), n = m.length;
  const finder = (x0, y0) => { for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const d = Math.max(Math.abs(x - 3), Math.abs(y - 3)); assert.equal(m[y0 + y][x0 + x], d !== 2, "Suchmuster " + x0 + "," + y0); } };
  finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
  for (let i = 8; i < n - 8; i++) { assert.equal(m[6][i], i % 2 === 0); assert.equal(m[i][6], i % 2 === 0); }
  assert.equal(m[n - 8][8], true);
});
