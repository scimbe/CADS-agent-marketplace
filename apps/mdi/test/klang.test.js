// Klang-Engine (E8): portiert aus alt test/klang.test.js und test/studio.test.js, dazu Alt-Orakel (gleiche Samples wie Altcode).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import * as K from "../src/engines/klang/klang.js";
import * as S from "../src/engines/klang/studio.js";

const SR = K.SR;
const ALT = JSON.parse(fs.readFileSync(new URL("./fixtures/klang-alt.json", import.meta.url), "utf8"));
const h = (a) => crypto.createHash("sha256").update(Buffer.from(new Float32Array(a).buffer)).digest("hex");
const sine = (f, sec, amp) => { const a = new Float32Array(Math.round(sec * SR)); for (let i = 0; i < a.length; i++) a[i] = (amp || 0.5) * Math.sin(2 * Math.PI * f * i / SR); return a; };
const peak = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rms = (a, s, e) => { s = s || 0; e = e || a.length; let x = 0; for (let i = s; i < e; i++) x += a[i] * a[i]; return Math.sqrt(x / (e - s)); };
const freq = (a) => { const b = a.subarray(2048, a.length - 2048); let z = 0; for (let i = 1; i < b.length; i++) if (b[i - 1] < 0 && b[i] >= 0) z++; return z / (b.length / SR); };
const voice = () => { const a = sine(220, 2); for (let i = 0; i < a.length; i++) a[i] *= i / a.length; return a; };

test("Alt-Orakel: jeder Effekt und jedes Tempo, Beat (Pausenhof, Endkampf), Spassstimme: bitgleiche Samples wie der Altcode", () => {
  for (const [k, want] of Object.entries(ALT.fx)) { const [fx, tp] = k.split("/"); assert.equal(h(K.apply(voice(), { fx: fx || undefined, tp: tp || undefined })), want, k); }
  for (const [k, b] of Object.entries(ALT.beats)) assert.equal(h(S.renderBeat(b.p, b.bpm, 2)), ALT.beat[k], k);
  assert.equal(h(S.dummyVoice()), ALT.dummy);
  for (const fx of S.FX_OLD) assert.equal(h(S.warp(S.dummyVoice(), fx)), ALT.warp[fx], fx);
});
test("Klang: zehn Effekte (8 Stimmen + 2 Tempi), jede Kombination endlich, Pegel 0.92, nie NaN", () => {
  assert.deepEqual(K.FX, ["monster", "chip", "robot", "echo", "rev", "alien", "tel", "chor"]);
  assert.deepEqual(K.TEMPO, ["slow", "fast"]);
  for (const fx of K.FX.concat([undefined])) for (const tp of [undefined].concat(K.TEMPO)) {
    const o = K.apply(voice(), { fx, tp }), n = fx + "/" + tp;
    assert.ok(o instanceof Float32Array && o.length > SR, n);
    assert.ok(o.every(Number.isFinite), n);
    assert.ok(Math.abs(peak(o) - 0.92) < 1e-6, n);
  }
});
test("Klang: deterministisch, Eingabe bleibt, Stille bleibt still, leer bleibt leer", () => {
  const a = voice(), copy = a.slice();
  for (const fx of K.FX) {
    assert.deepEqual(K.apply(a, { fx, tp: "fast" }), K.apply(a, { fx, tp: "fast" }));
    assert.deepEqual(a, copy);
    assert.ok(K.apply(new Float32Array(SR), { fx }).every((v) => v === 0));
    assert.equal(K.apply(new Float32Array(0), { fx }).every(Number.isFinite), true);
  }
});
test("Klang: Laengen, Spiegelung, Tonhoehe, Telefonband", () => {
  const a = voice(), L = a.length;
  for (const fx of ["chip", "rev", "alien", "tel"]) assert.equal(K.apply(a, { fx }).length, L, fx);
  assert.equal(K.apply(a, { fx: "robot" }).length, L + Math.floor(0.05 * SR) * 3);
  assert.equal(K.apply(a, { fx: "echo" }).length, L + Math.floor(0.22 * SR) * 3 + Math.floor(0.6 * SR));
  assert.equal(K.apply(a, { tp: "slow" }).length, Math.floor(L / 0.62));
  assert.equal(K.apply(sine(220, 14), {}).length, 10 * SR, "laenger als 10 s wird abgeschnitten");
  const r = K.apply(a, { fx: "rev" }), plain = K.apply(a, {});
  for (let i = 0; i < a.length; i += 97) assert.equal(r[i], plain[a.length - 1 - i]);
  const s = sine(220, 2), near = (x, w, t) => assert.ok(Math.abs(x - w) < t, x + " statt " + w);
  near(freq(K.apply(s, { fx: "chip" })), 220 * 1.75, 12); near(freq(K.pitch(s, 0.62)), 220 * 0.62, 6); near(freq(K.apply(s, { tp: "fast" })), 220 * 1.6, 6);
});
test("Klang: Lautstaerkeverlauf, Videotyp MP4 zuerst, Bitrate haelt 2 MB", () => {
  const e = K.envelope(voice(), 30);
  assert.ok(e.every((v) => v >= 0 && v <= 1)); assert.equal(Math.max(...e), 1);
  const MR = (ok) => ({ isTypeSupported: (t) => ok.includes(t) });
  assert.equal(K.videoType(MR(["video/webm", "video/mp4"])), "video/mp4");
  assert.equal(K.videoType(undefined), "");
  for (const sec of [1, 4, 10, 19]) assert.ok(K.bitrate(sec) * sec / 8 < 2 * 1024 * 1024 * 0.8);
});
// ---------- alt test/studio.test.js (Klangteil) ----------
const P0 = { k: "x---x---x---x---", s: "----------------", h: "----------------", b: "----------------" };
test("Beat: Laenge passt zum Tempo, Energie auf den gesetzten Schritten, ein Schritt mehr aendert den Ton", () => {
  const a = S.renderBeat(P0, 120, 1), step = Math.floor(60 / 120 / 4 * SR);
  assert.equal(a.length, Math.ceil(2 * SR));
  assert.ok(rms(a, 0, step) > 0.2); assert.ok(rms(a, step * 3, step * 4) < 0.02); assert.ok(rms(a, step * 4, step * 5) > 0.2);
  const b = S.renderBeat({ ...P0, s: "--x-------------" }, 120, 1);
  assert.ok(rms(b, step * 2, step * 3) > rms(a, step * 2, step * 3) + 0.05);
});
test("WAV: gueltiger Kopf und Laenge", () => {
  const w = S.wav(new Float32Array([0, 0.5, -0.5, 1])), v = new DataView(w.buffer), s = (o, n) => String.fromCharCode(...w.slice(o, o + n));
  assert.equal(s(0, 4), "RIFF"); assert.equal(s(8, 4), "WAVE"); assert.equal(s(36, 4), "data");
  assert.equal(v.getUint32(24, true), SR); assert.equal(w.length, 52); assert.equal(v.getInt16(46, true), Math.trunc(0.5 * 32767));
});
