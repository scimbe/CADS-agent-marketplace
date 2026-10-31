/* My Daily Idea: pure sound and pixel work (no DOM, no WebAudio). Everything stays in memory on the device. */
(function (root) {
  "use strict";
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

  // ---------- pixels (d = RGBA bytes) ----------
  function luma(d, i) { return (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255; }
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function contrast(x) { x = (x - 0.5) * 1.5 + 0.5; return x < 0 ? 0 : x > 1 ? 1 : x; }
  function duotone(d, dark, light) {
    var a = hex(dark), b = hex(light);
    for (var i = 0; i < d.length; i += 4) { var l = contrast(luma(d, i)); d[i] = a[0] + (b[0] - a[0]) * l; d[i + 1] = a[1] + (b[1] - a[1]) * l; d[i + 2] = a[2] + (b[2] - a[2]) * l; }
    return d;
  }
  function posterize(d, levels) {
    var s = 255 / (levels - 1);
    for (var i = 0; i < d.length; i += 4) for (var k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] / s) * s;
    return d;
  }
  // Print dots: darker image -> bigger ink dot in each cell.
  function halftone(d, w, h, cell, ink, paper) {
    var a = hex(ink), b = hex(paper), x, y;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var cx = Math.floor(x / cell) * cell + (cell >> 1), cy = Math.floor(y / cell) * cell + (cell >> 1);
      var li = (Math.min(h - 1, cy) * w + Math.min(w - 1, cx)) * 4;
      var dark = 1 - contrast(luma(d, li)), r = dark * cell * 0.72, dx = x - cx, dy = y - cy;
      d[(y * w + x) * 4 + 3] = dx * dx + dy * dy <= r * r ? 1 : 0;       // mark, the source sample must stay intact above/left
    }
    for (var i = 0; i < d.length; i += 4) { var c = d[i + 3] ? a : b; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
    return d;
  }
  function glitch(d, w, h, seed) {
    var s = (seed >>> 0) || 1;
    function r() { s = (s + 0x6D2B79F5) >>> 0; var t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    var src = d.slice(), x, y, shift = Math.max(2, Math.round(w * 0.018));
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {          // red and blue drift apart
      var i = (y * w + x) * 4;
      d[i] = src[(y * w + Math.min(w - 1, x + shift)) * 4];
      d[i + 2] = src[(y * w + Math.max(0, x - shift)) * 4 + 2];
    }
    var bands = 14;
    for (var b = 0; b < bands; b++) {                          // whole slices jump sideways
      var y0 = Math.floor(r() * h), bh = Math.ceil(r() * h * 0.05), off = Math.floor((r() - 0.5) * w * 0.3), row = d.slice();
      for (y = y0; y < Math.min(h, y0 + bh); y++) for (x = 0; x < w; x++) {
        var j = (y * w + x) * 4, sx = (((x + off) % w) + w) % w, k = (y * w + sx) * 4;
        d[j] = row[k]; d[j + 1] = row[k + 1]; d[j + 2] = row[k + 2];
      }
    }
    for (y = 0; y < h; y += 4) for (x = 0; x < w; x++) { var q = (y * w + x) * 4; d[q] *= 0.8; d[q + 1] *= 0.8; d[q + 2] *= 0.8; }
    return d;
  }

  var api = { SR: SR, renderBeat: renderBeat, warp: warp, dummyVoice: dummyVoice, wav: wav, peaks: peaks, normalize: normalize, FX: ["chip", "monster", "robot", "echo"], duotone: duotone, posterize: posterize, halftone: halftone, glitch: glitch };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Studio = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
