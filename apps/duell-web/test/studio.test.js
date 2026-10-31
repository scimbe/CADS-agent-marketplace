"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../src/studio.js");
const rms = (a, s, e) => { let m = 0; for (let i = s; i < e; i++) m += a[i] * a[i]; return Math.sqrt(m / (e - s)); };
const P = { k: "x---x---x---x---", s: "----------------", h: "----------------", b: "----------------" };

test("Beat: Laenge passt zum Tempo, Energie genau auf den gesetzten Schritten", () => {
  const sr = S.SR, a = S.renderBeat(P, 120, 1), step = Math.floor(60 / 120 / 4 * sr);
  assert.equal(a.length, Math.ceil(2 * sr));   // 16 sixteenths at 120 bpm = 2 s
  assert.ok(rms(a, 0, step) > 0.2, "Kick auf 1");
  assert.ok(rms(a, step * 3, step * 4) < 0.02, "Stille vor der 2");
  assert.ok(rms(a, step * 4, step * 5) > 0.2, "Kick auf 2");
});
test("Beat: Aendern eines Schritts aendert den Ton", () => {
  const a = S.renderBeat(P, 120, 1), b = S.renderBeat({ ...P, s: "--x-------------" }, 120, 1), step = Math.floor(0.125 * S.SR);
  assert.ok(rms(b, step * 2, step * 3) > rms(a, step * 2, step * 3) + 0.05);
});
test("Stimme: Hamster kuerzer, Monster laenger, jeder Effekt veraendert das Signal", () => {
  const v = S.dummyVoice();
  assert.ok(S.warp(v, "chip").length < v.length * 0.7);
  assert.ok(S.warp(v, "monster").length > v.length * 1.4);
  for (const fx of S.FX || ["chip", "monster", "robot", "echo"]) {
    const o = S.warp(v, fx); assert.ok(Math.max(...o.slice(0, 20000).map(Math.abs)) > 0.1, fx);
    assert.notDeepEqual(o.slice(1000, 1100), v.slice(1000, 1100), fx);
  }
});
test("WAV: gueltiger Kopf und Laenge", () => {
  const w = S.wav(new Float32Array([0, 0.5, -0.5, 1])), v = new DataView(w.buffer), s = (o, n) => String.fromCharCode(...w.slice(o, o + n));
  assert.equal(s(0, 4), "RIFF"); assert.equal(s(8, 4), "WAVE"); assert.equal(s(36, 4), "data");
  assert.equal(v.getUint32(24, true), S.SR); assert.equal(v.getUint32(40, true), 8); assert.equal(w.length, 52);
  assert.equal(v.getInt16(46, true), Math.trunc(0.5 * 32767));
});
const img = (w, h) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < d.length; i += 4) { const x = (i / 4) % w; d[i] = d[i + 1] = d[i + 2] = x / w * 255; d[i + 3] = 255; } return d; };
test("Foto: Duoton nimmt nur Farben zwischen den zwei Toenen", () => {
  const d = S.duotone(img(8, 2), "#000000", "#ff0000");
  for (let i = 0; i < d.length; i += 4) { assert.equal(d[i + 1], 0); assert.equal(d[i + 2], 0); }
  assert.ok(d[(7) * 4] > 200);
});
test("Foto: Poster reduziert Stufen, Rasterpunkte haben nur zwei Farben, Glitch haengt vom Text-Seed ab", () => {
  const p = S.posterize(img(64, 1), 4); assert.ok(new Set(p.filter((_, i) => i % 4 === 0)).size <= 4);
  const h = S.halftone(img(32, 32), 32, 32, 8, "#112233", "#ffeedd"), cols = new Set(); for (let i = 0; i < h.length; i += 4) cols.add(h[i]);
  assert.deepEqual([...cols].sort((a, b) => a - b), [0x11, 0xff]);
  const a = S.glitch(img(64, 64), 64, 64, 1), b = S.glitch(img(64, 64), 64, 64, 2), c = S.glitch(img(64, 64), 64, 64, 1);
  assert.notDeepEqual(a, b); assert.deepEqual(a, c);
});
