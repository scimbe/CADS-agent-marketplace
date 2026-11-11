"use strict";
// Straßenrap-Beat: renders example beats to WAV (the same renderer the page uses, src/rapbeat.js) and measures them, so
// the sound is judged by numbers as well as by ear. `node scripts/rapbeat-analyse.js <out-dir> [style,bpm,key,mood,seed ...]`
// Without beats it renders one per style. Per file:
//   loudness   integrated LUFS (BS.1770 K-weighting with gating), sample peak and a 4x oversampled true-peak estimate
//              (dBTP), PLR (true peak minus loudness), short-term loudness range of the 3 s windows (max - min, rough LRA)
//   spectrum   energy per octave band of the mid signal, in dB relative to the loudest band (Welch, Hann, 8192)
//   low end    side/mid energy below 150 Hz (mono low end: the lower the better) and the L/R correlation below 150 Hz
//   groove     onsets of the hat band (above 6 kHz) against the 16th grid: the median delay of the off-16ths as an MPC
//              swing percentage (50 % straight), the same from the beat's events, and the spread of the on-16ths (ms, MAD)
//   limiter    deepest gain reduction (dB) and share of the time it reduced at all
// Nothing here goes into the page; the numbers go into the pull request.
const fs = require("fs");
const path = require("path");
const RB = require("../src/rapbeat.js");

const SR = RB.SR;
function fft(re, im) {   // in place, radix 2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
function psd(x) {
  const N = 8192, acc = new Float64Array(N / 2), w = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  let frames = 0;
  for (let s = 0; s + N <= x.length; s += N / 2) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = x[s + i] * w[i]; fft(re, im); for (let k = 0; k < N / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k]; frames++; }
  return { p: acc.map((v) => v / frames), df: SR / N };
}
const BANDS = [[20, 40], [40, 80], [80, 160], [160, 320], [320, 640], [640, 1280], [1280, 2560], [2560, 5120], [5120, 10240], [10240, 20000]];
function bandsDb(P) { const e = BANDS.map(([a, b]) => { let s = 0; for (let k = Math.ceil(a / P.df); k * P.df < b; k++) s += P.p[k]; return s; }); const m = Math.max(...e); return e.map((v) => 10 * Math.log10(v / m)); }
function below(P, f) { let s = 0; for (let k = 1; k * P.df < f; k++) s += P.p[k]; return s; }
function truePeak(L, R) {   // 4x oversampling with a windowed-sinc interpolator (31 taps per phase)
  let pk = 0; const T = 15, phase = [0.25, 0.5, 0.75].map((f) => { const h = []; for (let k = -T; k <= T; k++) { const x = k - f, w = 0.5 + 0.5 * Math.cos(Math.PI * x / (T + 1)); h.push(x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x) * w); } return h; });
  for (const c of [L, R]) for (let i = T; i < c.length - T - 1; i++) { pk = Math.max(pk, Math.abs(c[i])); if (Math.abs(c[i]) < 0.5) continue; for (const h of phase) { let s = 0; for (let k = -T; k <= T; k++) s += c[i + k] * h[k + T]; pk = Math.max(pk, Math.abs(s)); } }
  return pk;
}
function shortTerm(L, R) {
  const out = [], w = 3 * SR;
  for (let s = 0; s + w <= L.length; s += SR) out.push(RB.lufs(L.subarray(s, s + w), R.subarray(s, s + w)));
  return out.filter((x) => isFinite(x) && x > -40);
}
// groove: onsets in the hat band, measured against the 16th grid of the beat (after the count-in offset)
function groove(L, R, bpm, off) {
  const n = L.length, x = new Float32Array(n); let y1 = 0, x1 = 0; const a = Math.exp(-2 * Math.PI * 6000 / SR);
  for (let i = 0; i < n; i++) { const m = (L[i] + R[i]) / 2, hp = a * (y1 + m - x1); x1 = m; y1 = hp; x[i] = hp * hp; }
  const hop = 64, env = []; for (let s = 0; s + hop <= n; s += hop) { let e = 0; for (let i = s; i < s + hop; i++) e += x[i]; env.push(Math.log10(e + 1e-12)); }
  const s16 = 60 / bpm / 4, on = [];
  for (let i = 2; i < env.length - 1; i++) if (env[i] - env[i - 2] > 0.8 && env[i] >= env[i + 1] && env[i] > -3) on.push((i - 1) * hop / SR);
  const odd = [], even = [];
  on.forEach((t) => { const g = (t - off / SR) / s16, q = Math.round(g); if (q >= 0) (q % 2 ? odd : even).push(g - q); });
  const med = (a) => { const b = a.slice().sort((p, q) => p - q); return b.length ? b[Math.floor(b.length / 2)] : NaN; };
  // an odd 16th is late by (swing - 0.5) * 2 sixteenths, an even one sits on the grid: swing % = 50 + 50 * (late odd - even)
  const sw = 50 + 50 * (med(odd) - med(even));
  // spread of the on-16th onsets: median absolute deviation (robust against reverb tails and crackle found as onsets)
  const m0 = med(even), mad = med(even.map((d) => Math.abs(d - m0)));
  return { onsets: on.length, swing: sw, evenSpreadMs: mad * s16 * 1000 };
}
function analyse(v, dir) {
  const t0 = Date.now(), r = RB.render(v), ms = Date.now() - t0, p = RB.params(v);
  const name = RB.fileName(v), file = path.join(dir, name);
  fs.writeFileSync(file, RB.wav(r.L, r.R, r.sr));
  const L = r.L, R = r.R, mid = L.map((x, i) => (x + R[i]) / 2), side = L.map((x, i) => (x - R[i]) / 2);
  let sp = 0, dc = 0, atCeil = 0; for (let i = 0; i < L.length; i++) { sp = Math.max(sp, Math.abs(L[i]), Math.abs(R[i])); dc += L[i] + R[i]; if (Math.abs(L[i]) > 0.8905) atCeil++; }
  const I = RB.lufs(L, R), tp = truePeak(L, R), st = shortTerm(L, R).sort((a, b) => a - b);
  const Pm = psd(mid), Ps = psd(side), b = bandsDb(Pm);
  const lowSide = 10 * Math.log10(below(Ps, 150) / below(Pm, 150));
  const g = groove(L, R, p.bpm, r.off);
  // the beat's own swing (from its events: the hats on odd 16ths), to compare with what the audio shows
  const s16 = 60 / p.bpm / 4, odd = r.events.ev.filter((e) => e.i === "hat").map((e) => (e.t - r.off / SR) / s16).filter((g) => Math.round(g - 0.1) % 2 === 1).map((g) => g - Math.round(g - 0.1)).sort((a, b) => a - b);
  return {
    file, name, renderMs: ms, seconds: +(L.length / SR).toFixed(1), style: p.style.id, bpm: p.bpm, key: RB.KEYS[p.key] + "m", mood: RB.MOODS[p.mood], seed: p.seed,
    lufsI: +I.toFixed(1), limiterMaxDb: +r.gr.max.toFixed(1), limiterTimePct: +(r.gr.time * 100).toFixed(0), samplePeakDb: +(20 * Math.log10(sp)).toFixed(2), truePeakDb: +(20 * Math.log10(tp)).toFixed(2), plr: +(20 * Math.log10(tp) - I).toFixed(1),
    shortTermRange: +(st[Math.floor(st.length * 0.95)] - st[Math.floor(st.length * 0.1)]).toFixed(1), dcOffset: +(dc / L.length / 2).toExponential(1), samplesAtCeiling: atCeil,
    octaveBandsDb: Object.fromEntries(BANDS.map(([a, bb], i) => [a + "-" + bb, +b[i].toFixed(1)])),
    sideBelow150Db: +lowSide.toFixed(1), swingPct: +g.swing.toFixed(1), designSwingPct: +(p.style.swing * 100).toFixed(0), eventSwingPct: +(50 + 50 * odd[Math.floor(odd.length / 2)]).toFixed(1), onGridMadMs: +g.evenSpreadMs.toFixed(1), hatOnsets: g.onsets
  };
}
if (require.main === module) {
  const dir = process.argv[2] || "."; fs.mkdirSync(dir, { recursive: true });
  const list = process.argv.slice(3).map((s) => s.split(",").map(Number));
  const beats = list.length ? list : [[0, 90, 9, 1, 4711], [1, 140, 2, 0, 1312], [2, 142, 4, 0, 808], [3, 98, 7, 2, 1987]];
  const out = beats.map((v) => { if (!RB.ok(v)) throw new Error("bad beat " + v); return analyse(v, dir); });
  console.log(JSON.stringify(out, null, 1));
}
module.exports = { analyse, groove, truePeak, psd, bandsDb };
