// Klang-Engine (E8): Trommeln, Beat, Spassstimme, WAV und Spitzen. Exakt aus alt:src/studio.js:1-92 (ohne DOM, ohne WebAudio).
// Alles bleibt im Speicher des Geraets; der Link traegt nur Muster, Tempo, Effekt und Text.
var SR = 22050;

// ---------- drums ----------
function noise(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 2147483648 - 1; }; }
function mix(out, at, sig, gain) { for (var i = 0; i < sig.length && at + i < out.length; i++) out[at + i] += sig[i] * gain; }
function kick(sr) {
  var n = Math.floor(sr * 0.22), o = new Float32Array(n), ph = 0;
  for (var i = 0; i < n; i++) { var t = i / sr, f = 45 + 150 * Math.exp(-t * 28); ph += 6.283185 * f / sr; o[i] = Math.sin(ph) * Math.exp(-t * 11); }
  return o;
}
function snare(sr) {
  var n = Math.floor(sr * 0.18), o = new Float32Array(n), nz = noise(77);
  for (var i = 0; i < n; i++) { var t = i / sr; o[i] = (nz() * 0.75 + Math.sin(6.283185 * 190 * t) * 0.4) * Math.exp(-t * 20); }
  return o;
}
function hat(sr) {
  var n = Math.floor(sr * 0.05), o = new Float32Array(n), nz = noise(5), prev = 0;
  for (var i = 0; i < n; i++) { var x = nz(), t = i / sr; o[i] = (x - prev) * 0.6 * Math.exp(-t * 90); prev = x; }
  return o;
}
function blip(sr, f) {
  var n = Math.floor(sr * 0.14), o = new Float32Array(n);
  for (var i = 0; i < n; i++) { var t = i / sr, s = Math.sin(6.283185 * f * t); o[i] = (s > 0 ? 0.6 : -0.6) * Math.exp(-t * 16); }
  return o;
}
var NOTES = [110, 130.81, 146.83, 164.81];   // a small minor scale: every melody sounds fine
// pattern: {k,s,h,b}: 16 chars each, "x" = hit
function renderBeat(p, bpm, loops, sr) {
  sr = sr || SR; loops = loops || 2;
  var step = 60 / bpm / 4, len = Math.ceil(step * 16 * loops * sr), out = new Float32Array(len);
  var K = kick(sr), S = snare(sr), H = hat(sr);
  for (var l = 0; l < loops; l++) for (var i = 0; i < 16; i++) {
    var at = Math.floor((l * 16 + i) * step * sr);
    if (p.k[i] === "x") mix(out, at, K, 0.9);
    if (p.s[i] === "x") mix(out, at, S, 0.55);
    if (p.h[i] === "x") mix(out, at, H, 0.4);
    if (p.b[i] === "x") mix(out, at, blip(sr, NOTES[i % 4]), 0.4);
  }
  return normalize(out);
}

// ---------- voice ----------
function normalize(a) {
  var m = 0, i;
  for (i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
  if (m > 0) for (i = 0; i < a.length; i++) a[i] = a[i] / m * 0.92;
  return a;
}
function resample(a, rate) {
  var n = Math.floor(a.length / rate), o = new Float32Array(n);
  for (var i = 0; i < n; i++) { var p = i * rate, j = Math.floor(p), f = p - j; o[i] = (a[j] || 0) * (1 - f) + (a[j + 1] || 0) * f; }
  return o;
}
function ring(a, f, sr) { var o = new Float32Array(a.length); for (var i = 0; i < a.length; i++) o[i] = a[i] * Math.sin(6.283185 * f * i / sr); return o; }
function echo(a, sec, fb, sr) {
  var d = Math.floor(sec * sr), o = new Float32Array(a.length + d * 3);
  o.set(a);
  for (var i = d; i < o.length; i++) o[i] += o[i - d] * fb;
  return o;
}
function warp(a, fx, sr) {
  sr = sr || SR;
  var o;
  if (fx === "chip") o = resample(a, 1.7);
  else if (fx === "monster") o = echo(ring(resample(a, 0.62), 38, sr), 0.09, 0.35, sr);
  else if (fx === "robot") o = echo(ring(a, 96, sr), 0.05, 0.3, sr);
  else if (fx === "echo") o = echo(a, 0.22, 0.55, sr);
  else o = a.slice();
  return normalize(o);
}
// A silly built-in voice for when there is no microphone: "ba-da-bi-du" with moving vowels.
function dummyVoice(sr) {
  sr = sr || SR;
  var n = Math.floor(sr * 1.6), o = new Float32Array(n), ph = 0, F = [[700, 1200], [400, 2200], [300, 800], [650, 1700]];
  for (var i = 0; i < n; i++) {
    var t = i / sr, syl = Math.floor(t / 0.4) % 4, e = Math.sin(3.14159 * ((t / 0.4) % 1));
    ph += 6.283185 * (140 + 30 * Math.sin(t * 5)) / sr;
    var src = (ph % 6.283185) / 3.14159 - 1;
    o[i] = e * (src * 0.3 + Math.sin(ph * F[syl][0] / 140) * 0.5 + Math.sin(ph * F[syl][1] / 140) * 0.25);
  }
  return normalize(o);
}

// ---------- wav ----------
function wav(a, sr) {
  sr = sr || SR;
  var n = a.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), i;
  function str(o, s) { for (var j = 0; j < s.length; j++) v.setUint8(o + j, s.charCodeAt(j)); }
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, n * 2, true);
  for (i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, a[i])) * 32767, true);
  return new Uint8Array(buf);
}
function peaks(a, n) {
  var out = [], w = Math.max(1, Math.floor(a.length / n));
  for (var i = 0; i < n; i++) { var m = 0; for (var j = i * w; j < (i + 1) * w && j < a.length; j++) m = Math.max(m, Math.abs(a[j])); out.push(m); }
  return out;
}

export const FX_OLD = ["chip", "monster", "robot", "echo"];
export { SR, renderBeat, warp, dummyVoice, wav, peaks, normalize, NOTES };
