// Stimmeffekte der Karte „Stimme verzerren“ (E8), exakt aus alt:src/klang.js. Gleiche Eingabe, gleiche Ausgabe; Mono-Float32
// mit SR 22050. Abspielen und Video macht die Seite, nichts verlaesst das Geraet. Ein Effekt plus hoechstens ein Tempo.
var SR = 22050, MAX_SEC = 10, TAU = 6.283185307179586;

function normalize(a) {
  var m = 0, i;
  for (i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
  if (m > 0) for (i = 0; i < a.length; i++) a[i] = a[i] / m * 0.92;
  return a;
}
// Faster or slower playback: pitch and length change together (rate 2: half as long, an octave up).
function resample(a, rate) {
  var n = Math.floor(a.length / rate), o = new Float32Array(n);
  for (var i = 0; i < n; i++) { var p = i * rate, j = Math.floor(p), f = p - j; o[i] = (a[j] || 0) * (1 - f) + (a[j + 1] || 0) * f; }
  return o;
}
// Higher or lower without changing the length: grains of 46 ms, each read faster or slower, laid over each other at half
// a grain with a Hann window (the windows add up to 1, so the level stays).
function pitch(a, ratio) {
  var N = 1024, hop = N / 2, o = new Float32Array(a.length), w = new Float32Array(N), i;
  for (i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(TAU * i / N);
  for (var at = -hop; at < a.length; at += hop) {
    var from = at - (ratio - 1) * N / 2;   // the grain read around where it is laid down, so nothing drifts
    for (i = 0; i < N; i++) {
      var q = at + i; if (q < 0 || q >= o.length) continue;
      var p = from + i * ratio, j = Math.floor(p), f = p - j;
      o[q] += w[i] * ((a[j] || 0) * (1 - f) + (a[j + 1] || 0) * f);
    }
  }
  return o;
}
function ring(a, f, mix) {
  var o = new Float32Array(a.length);
  for (var i = 0; i < a.length; i++) o[i] = a[i] * ((1 - mix) + mix * Math.sin(TAU * f * i / SR));
  return o;
}
// Echo with its tail: three repeats' room after the end.
function echo(a, sec, fb) {
  var d = Math.floor(sec * SR), o = new Float32Array(a.length + d * 3);
  o.set(a);
  for (var i = d; i < o.length; i++) o[i] += o[i - d] * fb;
  return o;
}
// A small hall on top of the echo: four combs at prime-ish lengths.
function hall(a) {
  var tail = Math.floor(0.6 * SR), o = new Float32Array(a.length + tail), L = [1116, 1188, 1277, 1356];
  o.set(a);
  L.forEach(function (d) { var c = new Float32Array(o.length); for (var i = 0; i < c.length; i++) c[i] = (a[i] || 0) + (i >= d ? c[i - d] * 0.62 : 0); for (i = 0; i < o.length; i++) o[i] += c[i] * 0.18; });
  return o;
}
// Biquad from the Audio EQ Cookbook (RBJ), the same filter a Web Audio BiquadFilterNode uses.
function biquad(a, type, f, Q) {
  var w0 = TAU * f / SR, cs = Math.cos(w0), al = Math.sin(w0) / (2 * Q), b0, b1, b2;
  if (type === "lp") { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; } else { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  var a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al, o = new Float32Array(a.length), x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (var i = 0; i < a.length; i++) {
    var x = a[i], y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y; o[i] = y;
  }
  return o;
}
// Phone / walkie-talkie: only 300-3400 Hz (two filters each side), a little overdriven.
function tel(a) {
  var o = biquad(biquad(biquad(biquad(a, "hp", 300, 0.707), "hp", 300, 0.707), "lp", 3400, 0.707), "lp", 3400, 0.707);
  for (var i = 0; i < o.length; i++) o[i] = Math.tanh(o[i] * 2.2);
  return o;
}
// Choir: the voice and two more, a bit lower and a bit higher, each a few milliseconds late.
function chor(a) {
  var lo = pitch(a, 0.94), hi = pitch(a, 1.07), d1 = Math.floor(0.017 * SR), d2 = Math.floor(0.029 * SR), o = new Float32Array(a.length + d2);
  for (var i = 0; i < o.length; i++) o[i] = (a[i] || 0) * 0.6 + (i >= d1 ? lo[i - d1] || 0 : 0) * 0.5 + (i >= d2 ? hi[i - d2] || 0 : 0) * 0.5;
  return o;
}
function reverse(a) { var o = new Float32Array(a.length); for (var i = 0; i < a.length; i++) o[i] = a[a.length - 1 - i]; return o; }
var FX = {
  monster: function (a) { return echo(ring(pitch(a, 0.62), 38, 0.35), 0.09, 0.3); },
  chip: function (a) { return pitch(a, 1.75); },                                        // hamster / helium
  robot: function (a) { return echo(ring(a, 96, 1), 0.05, 0.3); },
  echo: function (a) { return hall(echo(a, 0.22, 0.5)); },                              // echo / hall
  rev: reverse,
  alien: function (a) { return ring(pitch(a, 1.2), 330, 0.9); },                       // ring modulator
  tel: tel,
  chor: chor
};
var TEMPO = { slow: 0.62, fast: 1.6 };   // Zeitlupe (longer, deeper), Chipmunk-Tempo (shorter, higher)
// Up to 10 s of voice: what is longer is cut, a silent or empty take stays silent (never NaN).
function clip(raw) { var a = raw instanceof Float32Array ? raw : new Float32Array(raw || []); return a.length > MAX_SEC * SR ? a.slice(0, MAX_SEC * SR) : a; }
function apply(raw, o) {
  o = o || {};
  var a = clip(raw), f = FX[o.fx], out = f ? f(a) : a.slice();
  if (TEMPO[o.tp]) out = resample(out, TEMPO[o.tp]);
  return normalize(out);
}
// Loudness over time (0..1, one value per frame of the video at fps), for the frog's mouth and the moving wave.
function envelope(a, fps) {
  var w = Math.max(1, Math.round(SR / fps)), n = Math.ceil(a.length / w), o = new Array(n), m = 0;
  for (var k = 0; k < n; k++) { var s = 0, c = 0; for (var i = k * w; i < Math.min(a.length, (k + 1) * w); i++) { s += a[i] * a[i]; c++; } o[k] = c ? Math.sqrt(s / c) : 0; m = Math.max(m, o[k]); }
  return o.map(function (v) { return m ? Math.min(1, v / m) : 0; });
}
// The type of video this browser records, MP4 first (plays everywhere, also in WhatsApp on iPhones), else WebM, or "".
var TYPES = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"];
function videoTypes(MR) {
  if (!MR || typeof MR.isTypeSupported !== "function") return [];
  return TYPES.filter(function (x) { try { return MR.isTypeSupported(x); } catch (e) { return false; } });
}
function videoType(MR) { return videoTypes(MR)[0] || ""; }
// AAC (MP4) does not start below about 96 kbit/s in Chromium; Opus (WebM) speaks clearly at 48.
function audioBits(type) { return /mp4/.test(type) ? 96000 : 48000; }
// Bits per second so the file stays under 2 MB even at the longest take (10 s in slow motion with the echo's tail):
// 1.6 MB over the length, a quarter of it kept back for the container and an encoder that overshoots.
function bitrate(sec) { return Math.max(150000, Math.min(900000, Math.floor(1.6e6 * 8 * 0.75 / Math.max(1, sec)))); }
const FX_NAMES = Object.keys(FX), TEMPO_NAMES = Object.keys(TEMPO);
export { SR, MAX_SEC, FX_NAMES as FX, TEMPO_NAMES as TEMPO, apply, reverse, pitch, resample, envelope, videoType, videoTypes, audioBits, bitrate, TYPES };
