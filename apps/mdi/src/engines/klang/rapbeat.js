// Strassenrap-Beat: Klang (PR #227, src/rapbeat.js:158-609, unveraendert portiert). Synthese Sample fuer Sample (Kick, Snare,
// Clap, Hats, Rim, 808 mit Glide, E-Piano, Piano, Pad, Glocke, Stab), Mix mit Sidechain und Limiter bei -1 dBFS, WAV 16 Bit
// mit TPDF-Dither, Lautheit nach ITU-R BS.1770. Nur fuer Renderer und Tests (approximierte Math-Funktionen), nie fuer Karten.
import { hash32, mulberry32 } from "../poster/doc.js";
import { DRUMS, STYLES, MOODS, KEYS, SEEDS, SECTIONS, LOOPS, SONG, PROG, range, ok, fresh, params, rng, pick, hn, chordTones, voice, phrase, roll, stepNote } from "./rapbeat-rule.js";
const SR = 44100, TAU = Math.PI * 2;
function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
// ---------- the song as events ----------
// ev: { t seconds, i instrument, v velocity, ... } for the bars [from, from + n) of the song, timed from bar "from".
function events(v, from, n) {
  var p = params(v), st = p.style, ph = phrase(p), spb = 60 / p.bpm, out = [], r = rng(p, "prog");
  var prog = PROG[MOODS[p.mood]][Math.floor(r() * 2)], swing = st.swing, s16 = spb / 4;
  var rootBass = 28 + ((p.key - 4 + 12) % 12);     // E1 .. D#2: where an 808 still carries on a phone
  function at(bar, b, sw, jit, key) {
    var t = (bar * 4 + b) * spb, q = Math.round(b * 4);
    if (sw && Math.abs(b * 4 - q) < 1e-6 && q % 2) t += (swing - 0.5) * 2 * s16;
    if (jit) t += (hn(p.seed, bar, b, key) - 0.5) * 2 * jit;
    return t;
  }
  for (var bi = from; bi < from + n && bi < SONG.length; bi++) {
    var S = SONG[bi], rel = bi - from, pb = bi % 2, lastBar = S.i === S.n - 1, next = SONG[bi + 1];
    var dropFrom = lastBar && next && next.sec === "hook" ? (st.half ? 2 : 3) : 9;   // the beat drops out before the hook
    var drums = S.sec === "hook" || S.sec === "verse" || (S.sec === "intro" && S.i >= S.n - 2 && st.half);
    var full = S.sec === "hook" || S.sec === "verse";
    var chord = prog[Math.floor(bi / st.chordBars) % 4], croot = p.key + chord[0];
    var fill = full && S.i % 4 === 3;
    function inBar(list) { return list.filter(function (e) { return e.b >= pb * 4 && e.b < pb * 4 + 4; }); }
    var swingOn = st.swing > 0.5;
    if (drums) {
      if (full) inBar(ph.kick).forEach(function (e) { var b = e.b - pb * 4; if (b < dropFrom) out.push({ t: at(rel, b, swingOn, 0, "k"), i: "kick", v: e.v }); });
      if (full) inBar(ph.snare).forEach(function (e) { var b = e.b - pb * 4; if (b < dropFrom) out.push({ t: at(rel, b, swingOn, 0.002, "s") + (e.late || 0), i: "snare", v: e.v }); });
      if (full) inBar(ph.clap).forEach(function (e) { var b = e.b - pb * 4; if (b < dropFrom) out.push({ t: at(rel, b, false, 0, "c") + 0.004, i: "clap", v: e.v }); });
      if (full) inBar(ph.rim).forEach(function (e) { var b = e.b - pb * 4; if (b < dropFrom) out.push({ t: at(rel, b, swingOn, 0.002, "r"), i: "rim", v: e.v }); });
      var hats = inBar(ph.hat).map(function (e) { return { b: e.b - pb * 4, v: e.v, up: e.up || 0 }; });
      if (fill && st.half && pb === 1) { var tmp = hats.map(function (h) { return { b: h.b + 4, v: h.v }; }); roll(tmp, 7.5, 0.5, 8, true); hats = tmp.map(function (h) { return { b: h.b - 4, v: h.v, up: h.up || 0 }; }); }
      var oh = inBar(ph.ohat).map(function (e) { return e.b - pb * 4; });
      hats.forEach(function (h) {
        if (h.b >= dropFrom) return;
        if (oh.some(function (o) { return Math.abs(o - h.b) < 1e-6; })) return;
        if (S.sec === "verse" && S.i < 4 && bi < 20 && h.v < 0.45 && !st.half) return;   // the first verse starts a little thinner
        out.push({ t: at(rel, h.b, swingOn, 0.0025, "h"), i: "hat", v: h.v * (0.92 + 0.16 * hn(p.seed, bi, h.b, "hv")), up: h.up });
      });
      oh.forEach(function (b) { if (b < dropFrom) out.push({ t: at(rel, b, swingOn, 0, "o"), i: "ohat", v: 0.55 }); });
      if (fill && !st.half && pb === 1 && b0(ph.snare)) [3.25, 3.5, 3.75].forEach(function (b, k) { if (b < dropFrom) out.push({ t: at(rel, b, swingOn, 0.002, "f" + k), i: "snare", v: 0.3 + 0.15 * k }); });
      if (S.sec === "hook" && S.i === 0) out.push({ t: at(rel, 0, false, 0, "x"), i: "crash", v: 0.7 });
    }
    if (full) inBar(ph.bass).forEach(function (e) {
      var b = e.b - pb * 4; if (b >= dropFrom) return;
      var len = Math.min(e.len, dropFrom - b);
      out.push({ t: at(rel, b, swingOn && st.id !== "trap", 0, "b"), i: "bass", v: e.v, f: hz(rootBass + chord[0] + e.deg), d: len * spb, glide: !!e.glide });
    });
    // music: chords every bar (a 2-bar chord in drill sounds once), the motif in hooks (and lighter in the 2nd verse half)
    var tones = voice(60 + croot, chordTones(chord[1], st.id !== "drill" && MOODS[p.mood] !== "dark"), st.id === "drill" ? 53 : 55);
    var inst = st.id === "boombap" ? "epiano" : st.id === "oldschool" ? "stab" : "pad";
    var lp = S.sec === "intro" ? 0.35 + 0.15 * S.i : S.sec === "outro" ? 0.6 - 0.12 * S.i : S.sec === "verse" ? 0.7 : 1;
    if (st.chordBars === 1 || bi % st.chordBars === 0) ph.keys.forEach(function (k) {
      var d = Math.min(k[1] * st.chordBars, 4 * st.chordBars - k[0]) * spb;
      tones.forEach(function (m, j) { out.push({ t: at(rel, k[0], swingOn, 0.003, "c" + j), i: inst, v: 0.7, f: hz(m), d: d, lp: lp, j: j }); });
    });
    if (st.id === "oldschool") tones.slice(0, 3).forEach(function (m, j) { out.push({ t: at(rel, 0, false, 0, "pd" + j), i: "pad", v: 0.35, f: hz(m), d: 4 * spb, lp: lp * 0.8, j: j, soft: 1 }); });
    var leadOn = S.sec === "hook" || (S.sec === "verse" && S.i >= 8 && st.id !== "boombap") || S.sec === "intro";
    if (leadOn) {
      var li = st.id === "drill" ? "piano" : st.id === "trap" ? "bell" : st.id === "boombap" ? "epiano" : "stab";
      var answer = Math.floor(S.i / 2) % 2 === 1, lv = S.sec === "hook" ? 1 : 0.55;
      inBar(ph.lead).forEach(function (e, n, all) {
        var b = e.b - pb * 4, deg = e.deg + (answer && n >= all.length - 2 ? 1 : 0);
        var m = 72 + p.key + stepNote(ph.scale, deg); if (li === "piano" || li === "epiano") m -= 12;
        if (m > 86) m -= 12;
        out.push({ t: at(rel, b, swingOn, 0.003, "l"), i: li, v: e.v * lv, f: hz(m), d: e.len * spb, lp: S.sec === "intro" ? lp : 1, lead: 1 });
      });
    }
  }
  // round robin: which of four takes of a drum sound plays here (from the seed and the place, like the humanising)
  out.forEach(function (e) { if (DRUMS.indexOf(e.i) >= 0) e.rr = Math.floor(hn(p.seed, Math.round((from * 4 + e.t / spb) * 1000), e.i, "rr") * 4); });
  out.sort(function (a, b) { return a.t - b.t; });
  return { ev: out, spb: spb, p: p };
}
function b0(list) { return list.length > 0; }

// ---------- DSP helpers ----------
// xorshift noise, seeded per voice (deterministic)
function noise(seed) { var x = (seed >>> 0) || 1; return function () { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 2147483648 - 1; }; }
// TPT state variable filter (Zavalishin/Simper): stable while the cutoff moves
function SVF() { this.a = 0; this.b = 0; this.set(1000, 0.707); }
SVF.prototype.set = function (fc, q) { var g = Math.tan(Math.PI * Math.min(fc, SR * 0.45) / SR); this.k = 1 / q; this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2; };
SVF.prototype.run = function (x) {
  var v3 = x - this.b, v1 = this.a1 * this.a + this.a2 * v3, v2 = this.b + this.a2 * this.a + this.a3 * v3;
  this.a = 2 * v1 - this.a; this.b = 2 * v2 - this.b; this.lo = v2; this.bp = v1; this.hi = x - this.k * v1 - v2; return v2;
};
function polyblep(t, dt) { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; }
// soft saturation: a rational tanh (Pade 3/2, exact enough and much cheaper), normalised so that sat(1, d) = 1
function th(x) { return x > 3 ? 1 : x < -3 ? -1 : x * (27 + x * x) / (27 + 9 * x * x); }
var TH = {};
function sat(x, d) { var n = TH[d] || (TH[d] = 1 / th(d)); return th(x * d) * n; }
function db(x) { return Math.pow(10, x / 20); }

// ---------- instruments: each adds its samples into the buses ----------
// B: { kick, bass (mono), dL, dR (drums), mL, mR (music), vL, vR (reverb send) }
function kick(B, s0, e, P) {
  var st = P.style.id, f1 = st === "boombap" ? 52 : st === "oldschool" ? 48 : 50, f0 = st === "boombap" ? 160 : 230, pd = st === "boombap" ? 0.035 : 0.028;
  var dec = st === "boombap" ? 0.13 : st === "oldschool" ? 0.2 : st === "trap" ? 0.085 : 0.075, drive = st === "boombap" ? 2.2 : 1.6, n = Math.min(Math.floor(dec * 6 * SR), B.kick.length - s0), ph = 0, nz = noise((e.rr || 0) * 7 + 1), hp = new SVF(), amp = Math.pow(e.v, 1.3);
  hp.set(3000, 0.7);
  for (var i = 0; i < n; i++) {
    var t = i / SR, f = f1 + (f0 - f1) * Math.exp(-t / pd); ph += f / SR; if (ph > 1) ph -= 1;
    var env = Math.exp(-t / dec) * (t < 0.0015 ? t / 0.0015 : 1), body = Math.sin(TAU * ph) * env;
    hp.run(nz()); var click = hp.hi * Math.exp(-t / 0.002) * 0.5;
    B.kick[s0 + i] += sat(body * 1.1 + click, drive) * amp;
  }
}
function snare(B, s0, e, P) {
  var st = P.style.id, nd = st === "boombap" ? 0.09 : st === "oldschool" ? 0.085 : st === "trap" ? 0.075 : 0.065, n = Math.min(Math.floor(nd * 6 * SR), B.dL.length - s0);
  var nz = noise((e.rr || 0) * 13 + 5), bp = new SVF(), hp = new SVF(), p1 = 0, p2 = 0, amp = Math.pow(e.v, 1.4) * (st === "drill" ? 0.85 : 0.9);
  bp.set(st === "boombap" ? 1800 : 2600, 0.8); hp.set(st === "boombap" ? 700 : 1200, 0.7);
  var rev = st === "boombap" ? 0.22 : 0.12;
  for (var i = 0; i < n; i++) {
    var t = i / SR, f = 1 + 0.35 * Math.exp(-t / 0.01); p1 += 180 * f / SR; p2 += 330 * f / SR;
    var tone = (Math.sin(TAU * p1) * 0.7 + Math.sin(TAU * p2) * 0.35) * Math.exp(-t / 0.045);
    var x = nz(); bp.run(x); hp.run(x);
    var nzs = (bp.bp * 1.4 + hp.hi * 0.6) * Math.exp(-t / nd) * (t < 0.001 ? t / 0.001 : 1);
    var y = sat((tone * 0.9 + nzs * 0.9), 1.8) * amp;
    B.dL[s0 + i] += y; B.dR[s0 + i] += y; B.vL[s0 + i] += y * rev; B.vR[s0 + i] += y * rev;
  }
}
function clap(B, s0, e, P) {
  var n = Math.min(Math.floor(0.5 * SR), B.dL.length - s0), na = noise((e.rr || 0) * 17 + 3), nb = noise((e.rr || 0) * 19 + 11), fa = new SVF(), fb = new SVF(), amp = e.v * 0.8;
  fa.set(1150, 1.4); fb.set(1250, 1.4);
  for (var i = 0; i < n; i++) {
    var t = i / SR, env = 0;
    for (var k = 0; k < 3; k++) { var tk = t - k * 0.0085; if (tk >= 0 && tk < 0.012) env = Math.max(env, Math.exp(-tk / 0.0035)); }
    if (t >= 0.017) env = Math.max(env, 0.85 * Math.exp(-(t - 0.017) / 0.085));
    fa.run(na()); fb.run(nb());
    var l = fa.bp * env * 2.2 * amp, r = fb.bp * env * 2.2 * amp;
    B.dL[s0 + i] += l; B.dR[s0 + i] += r; B.vL[s0 + i] += l * 0.18; B.vR[s0 + i] += r * 0.18;
  }
}
var HATF = [205.3, 304.4, 369.6, 522.7, 540, 800];
function hat(B, s0, e, P, open) {
  var dec = open ? 0.22 : P.style.half ? 0.03 : 0.04, n = Math.min(Math.floor(dec * 5 * SR), B.dL.length - s0), up = Math.pow(2, (e.up || 0) / 12) * 1.6;
  var ph = [0, 0, 0, 0, 0, 0], hp = new SVF(), bp = new SVF(), nz = noise((e.rr || 0) * 23 + 7), amp = Math.pow(e.v, 1.5) * (open ? 0.3 : 0.38);
  var lp = new SVF(), lp2 = new SVF(); hp.set(7000, 0.7); bp.set(10500, 0.9); lp.set(14000, 0.6); lp2.set(14000, 0.6);
  var pan = P.style.half ? 0.12 : -0.12, gl = 1 - pan, gr = 1 + pan;
  for (var i = 0; i < n; i++) {
    var t = i / SR, sq = 0;
    for (var k = 0; k < 6; k++) { ph[k] += HATF[k] * up / SR; if (ph[k] >= 1) ph[k] -= 1; sq += ph[k] < 0.5 ? 1 : -1; }
    var x = sq / 6 * 0.7 + nz() * 0.5; bp.run(x); hp.run(lp2.run(lp.run(bp.bp)));
    var env = Math.exp(-t / dec) * (t < 0.0005 ? t / 0.0005 : 1), y = hp.hi * env * amp * 2;
    B.dL[s0 + i] += y * gl; B.dR[s0 + i] += y * gr;
  }
}
function rim(B, s0, e) {
  var n = Math.min(Math.floor(0.08 * SR), B.dL.length - s0), ph = 0, nz = noise((e.rr || 0) * 29 + 1), bp = new SVF(), amp = e.v * 0.5;
  bp.set(2200, 2);
  for (var i = 0; i < n; i++) {
    var t = i / SR; ph += 1700 / SR; bp.run(nz());
    var y = (Math.sin(TAU * ph) * 0.6 + bp.bp * 1.5) * Math.exp(-t / 0.012) * amp;
    B.dL[s0 + i] += y * 0.8; B.dR[s0 + i] += y * 1.2; B.vL[s0 + i] += y * 0.25; B.vR[s0 + i] += y * 0.25;
  }
}
function crash(B, s0, e) {
  var n = Math.min(Math.floor(2.2 * SR), B.dL.length - s0), na = noise((e.rr || 0) * 31 + 3), nb = noise((e.rr || 0) * 37 + 9), ha = new SVF(), hb = new SVF(), amp = e.v * 0.12;
  ha.set(5000, 0.6); hb.set(5200, 0.6);
  for (var i = 0; i < n; i++) {
    var t = i / SR, env = Math.exp(-t / 0.6) * (t < 0.002 ? t / 0.002 : 1); ha.run(na()); hb.run(nb());
    B.dL[s0 + i] += ha.hi * env * amp; B.dR[s0 + i] += hb.hi * env * amp; B.vL[s0 + i] += ha.hi * env * amp * 0.3; B.vR[s0 + i] += hb.hi * env * amp * 0.3;
  }
}
// The 808 (and the bass of the other styles): one voice through the whole render, so a glide never clicks.
function bassVoice(B, list, P, total) {
  var st = P.style.id, ph = 0, f = 50, amp = 0, out = B.bass, hp = new SVF(), lp = new SVF(), lpo = new SVF();
  hp.set(24, 0.7); lp.set(st === "oldschool" ? 900 : st === "boombap" ? 420 : 2600, 0.7);
  var tau = st === "trap" ? 1.1 : st === "drill" ? 0.75 : st === "boombap" ? 0.38 : 0.2, drive = st === "drill" ? 3 : st === "trap" ? 2.4 : 1.4;
  for (var n = 0; n < list.length; n++) {
    var e = list[n], s0 = Math.max(0, Math.round(e.t * SR)), s1 = n + 1 < list.length ? Math.round(list[n + 1].t * SR) : total;
    var end = Math.min(s1, s0 + Math.round((e.d + (st === "trap" || st === "drill" ? 0.05 : 0.02)) * SR), total), from = f, peak = Math.pow(e.v, 1.2);
    var glide = e.glide && n > 0, g0 = amp;
    for (var i = s0; i < s1 && i < total; i++) {
      var t = (i - s0) / SR, target = e.f;
      if (glide) f = target + (from - target) * Math.exp(-t / 0.028); else f = target * (1 + (st === "oldschool" ? 0 : 0.5) * Math.exp(-t / 0.012));
      var a;
      if (i < end) { a = glide ? peak * Math.exp(-(t + 0.15) / tau) : peak * Math.exp(-t / tau); var att = Math.min(1, t / (glide ? 0.012 : 0.0025)); a = g0 + (a - g0) * att; }
      else a = amp * Math.exp(-1 / (SR * 0.025));
      amp = a; ph += f / SR; if (ph > 1) ph -= 1;
      var x;
      if (st === "oldschool") { var sw = 2 * ph - 1 - polyblep(ph, f / SR); lpo.set(250 + 2200 * Math.exp(-t / 0.06), 1.6); x = lpo.run(sw) * 1.2; }
      else x = Math.sin(TAU * ph) + 0.12 * Math.sin(2 * TAU * ph);
      var y = sat(x * a, drive);
      lp.run(y); hp.run(lp.lo); out[i] += hp.hi;
    }
  }
}
function epiano(B, s0, e) {
  // two-operator FM (a Rhodes-like tine), a slow tape wobble and a stereo tremolo, lowpassed with the section
  var n = Math.min(Math.floor((e.d + 0.5) * SR), B.mL.length - s0), ph = 0, amp = e.v * 0.16, rel = Math.floor(e.d * SR), lp = new SVF(), cut = 1200 + 5000 * (e.lp || 1);
  lp.set(cut, 0.7);
  var pan = (e.j || 0) % 2 ? 0.25 : -0.25, seed = (e.j || 0) * 1.7, dt = e.f / SR, wow = 1, trem = 0;
  var ix = 1.6, id = Math.exp(-1 / (SR * 0.22)), ov = 0.18, od = Math.exp(-1 / (SR * 0.4)), ev = 1, ed = Math.exp(-1 / (SR * 1.4)), rd = Math.exp(-1 / (SR * 0.12));
  for (var i = 0; i < n; i++) {
    if ((i & 63) === 0) { var at = i / SR; wow = 1 + 0.0025 * Math.sin(TAU * 0.6 * at); trem = 0.12 * Math.sin(TAU * 4.2 * at + seed); }
    ph += dt * wow; if (ph >= 1) ph -= 1;
    var x = Math.sin(TAU * ph + (ix + 0.25) * Math.sin(TAU * ph)) + ov * Math.sin(2 * TAU * ph);
    ix *= id; ov *= od; ev *= i > rel ? ed * rd : ed;
    var y = lp.run(x) * ev * (i < 176 ? i / 176 : 1) * amp;
    B.mL[s0 + i] += y * (1 - pan) * (1 + trem); B.mR[s0 + i] += y * (1 + pan) * (1 - trem); B.vL[s0 + i] += y * 0.25; B.vR[s0 + i] += y * 0.25;
  }
}
function piano(B, s0, e) {
  // five slightly stretched partials (rotating phasors: a sine per partial without Math.sin), each with its own decay
  var n = Math.min(Math.floor((e.d + 1.2) * SR), B.mL.length - s0), amp = e.v * 0.13, rel = Math.floor((e.d + 0.25) * SR), nz = noise(77 + Math.round(e.f)), lp = new SVF();
  lp.set(3500, 0.6);
  var part = [1, 2.003, 3.009, 4.02, 5.04], gain = [1, 0.5, 0.28, 0.16, 0.08], dec = [1.6, 0.9, 0.6, 0.4, 0.3], K = 5, cr = [], sr = [], c = [], sn = [], g = [], kd = [];
  for (var k = 0; k < K; k++) { var w = TAU * e.f * part[k] / SR; if (w > Math.PI) { K = k; break; } cr.push(Math.cos(w)); sr.push(Math.sin(w)); c.push(1); sn.push(0); g.push(gain[k]); kd.push(Math.exp(-1 / (SR * dec[k]))); }
  var ham = 0.4, hd = Math.exp(-1 / (SR * 0.006)), rd = Math.exp(-1 / (SR * 0.15)), rg = 1;
  for (var i = 0; i < n; i++) {
    var x = 0;
    for (k = 0; k < K; k++) { var nc = c[k] * cr[k] - sn[k] * sr[k]; sn[k] = c[k] * sr[k] + sn[k] * cr[k]; c[k] = nc; x += sn[k] * g[k]; g[k] *= kd[k]; }
    x += lp.run(nz()) * ham; ham *= hd;
    if (i > rel) rg *= rd;
    var y = x * (i < 88 ? i / 88 : 1) * rg * amp;
    B.mL[s0 + i] += y * 1.1; B.mR[s0 + i] += y * 0.9; B.vL[s0 + i] += y * 0.35; B.vR[s0 + i] += y * 0.35;
  }
}
function pad(B, s0, e, P) {
  var drill = P.style.id === "drill", n = Math.min(Math.floor((e.d + 0.8) * SR), B.mL.length - s0), rel = Math.floor(e.d * SR), amp = e.v * (drill ? 0.06 : 0.045) * (e.soft ? 0.8 : 1);
  var fr = [-0.09, 0, 0.08].map(function (d) { return e.f * Math.pow(2, d / 12) / SR; }), ph = [0.1, 0.5, 0.8], lL = new SVF(), lR = new SVF(), att = (drill ? 0.35 : 0.2) * SR;
  var cut = (drill ? 1500 : 1900) * (0.45 + 0.55 * (e.lp || 1)), rd = Math.exp(-1 / (SR * 0.35)), rg = 1, vib = 1;
  lL.set(cut, 0.8); lR.set(cut, 0.8);
  for (var i = 0; i < n; i++) {
    if ((i & 63) === 0) vib = 1 + 0.002 * Math.sin(TAU * 5 * i / SR);
    var l = 0, r = 0;
    for (var k = 0; k < 3; k++) {
      var dt = fr[k] * vib; ph[k] += dt; if (ph[k] >= 1) ph[k] -= 1;
      var s = 2 * ph[k] - 1 - polyblep(ph[k], dt); if (k === 0) l += s; else if (k === 2) r += s; else { l += s * 0.7; r += s * 0.7; }
    }
    if (i > rel) rg *= rd;
    var env = (i < att ? i / att : 1) * rg;
    var yl = lL.run(l) * env * amp, yr = lR.run(r) * env * amp;
    B.mL[s0 + i] += yl; B.mR[s0 + i] += yr; B.vL[s0 + i] += yl * 0.4; B.vR[s0 + i] += yr * 0.4;
  }
}
function bell(B, s0, e) {
  var n = Math.min(Math.floor((e.d + 1.4) * SR), B.mL.length - s0), ph = 0, mp = 0, amp = e.v * 0.1, rel = Math.floor((e.d + 0.4) * SR);
  for (var i = 0; i < n; i++) {
    var t = i / SR; ph += e.f / SR; mp += e.f * 3.5 / SR;
    var x = Math.sin(TAU * ph + (2.2 * Math.exp(-t / 0.18) + 0.3) * Math.sin(TAU * mp)) * 0.8 + Math.sin(TAU * ph * 2) * 0.15 * Math.exp(-t / 0.5);
    var env = Math.exp(-t / 0.9) * (t < 0.002 ? t / 0.002 : 1) * (i > rel ? Math.exp(-(i - rel) / (SR * 0.2)) : 1), y = x * env * amp;
    B.mL[s0 + i] += y * 0.85; B.mR[s0 + i] += y * 1.15; B.vL[s0 + i] += y * 0.5; B.vR[s0 + i] += y * 0.5;
  }
}
function stab(B, s0, e) {
  var n = Math.min(Math.floor((e.d + 0.3) * SR), B.mL.length - s0), rel = Math.floor(e.d * SR), amp = e.v * (e.lead ? 0.06 : 0.04), det = [-0.12, 0.12], ph = [0, 0.37], lL = new SVF(), lR = new SVF();
  for (var i = 0; i < n; i++) {
    var t = i / SR, l = 0, r = 0;
    if (i % 16 === 0) { var c = (400 + 3800 * Math.exp(-t / 0.09)) * (0.5 + 0.5 * (e.lp || 1)); lL.set(c, 1.1); lR.set(c, 1.1); }
    for (var k = 0; k < 2; k++) { var f = e.f * Math.pow(2, det[k] / 12), dt = f / SR; ph[k] += dt; if (ph[k] >= 1) ph[k] -= 1; var s = 2 * ph[k] - 1 - polyblep(ph[k], dt); if (k) r += s; else l += s; }
    var env = (t < 0.004 ? t / 0.004 : 1) * Math.exp(-t / 0.5) * (i > rel ? Math.exp(-(i - rel) / (SR * 0.06)) : 1);
    var yl = lL.run(l) * env * amp, yr = lR.run(r) * env * amp;
    B.mL[s0 + i] += yl; B.mR[s0 + i] += yr; B.vL[s0 + i] += yl * 0.3; B.vR[s0 + i] += yr * 0.3;
  }
}
// velocity curves of the drums (their voices are rendered at v = 1); the music voices take v themselves
var CURVE = { kick: function (v) { return Math.pow(v, 1.3); }, snare: function (v) { return Math.pow(v, 1.4); }, clap: function (v) { return v; }, hat: function (v) { return Math.pow(v, 1.5); }, ohat: function (v) { return Math.pow(v, 1.5); }, rim: function (v) { return v; }, crash: function (v) { return v; } };
var CH = ["kick", "dL", "dR", "mL", "mR", "vL", "vR"];
var VOICE = { kick: kick, snare: snare, clap: clap, hat: function (B, s, e, P) { hat(B, s, e, P, false); }, ohat: function (B, s, e, P) { hat(B, s, e, P, true); }, rim: rim, crash: crash, epiano: epiano, piano: piano, pad: pad, bell: bell, stab: stab };

// ---------- reverb (Freeverb: 8 combs, 4 all-passes per side) ----------
function reverb(inL, inR, room, damp) {
  var CB = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], AP = [556, 441, 341, 225], n = inL.length, oL = new Float32Array(n), oR = new Float32Array(n);
  [[inL, oL, 0], [inR, oR, 23]].forEach(function (ch) {
    var x = ch[0], y = ch[1], sp = ch[2];
    var cb = CB.map(function (l) { return { b: new Float32Array(l + sp), i: 0, f: 0 }; }), ap = AP.map(function (l) { return { b: new Float32Array(l + sp), i: 0 }; });
    for (var i = 0; i < n; i++) {
      var inp = x[i] * 0.015, s = 0;
      for (var k = 0; k < 8; k++) { var c = cb[k], o = c.b[c.i]; c.f = o * (1 - damp) + c.f * damp; c.b[c.i] = inp + c.f * room; if (++c.i >= c.b.length) c.i = 0; s += o; }
      for (var a = 0; a < 4; a++) { var A = ap[a], bo = A.b[A.i]; A.b[A.i] = s + bo * 0.5; s = bo - s; if (++A.i >= A.b.length) A.i = 0; }
      y[i] = s;
    }
  });
  return [oL, oR];
}

// ---------- loudness (ITU-R BS.1770 K-weighting, gated; as pyloudnorm) ----------
function biquad(x, c) {
  var y = new Float32Array(x.length), x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (var i = 0; i < x.length; i++) { var v = c[0] * x[i] + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
function kw(sr) {
  var A = Math.pow(10, 4 / 40), w = TAU * 1500 / sr, al = Math.sin(w) / (2 * Math.SQRT1_2), cs = Math.cos(w), sA = Math.sqrt(A);
  var a0 = (A + 1) - (A - 1) * cs + 2 * sA * al, sh = [A * ((A + 1) + (A - 1) * cs + 2 * sA * al) / a0, -2 * A * ((A - 1) + (A + 1) * cs) / a0, A * ((A + 1) + (A - 1) * cs - 2 * sA * al) / a0, 2 * ((A - 1) - (A + 1) * cs) / a0, ((A + 1) - (A - 1) * cs - 2 * sA * al) / a0];
  var w2 = TAU * 38 / sr, al2 = Math.sin(w2) / (2 * 0.5), c2 = Math.cos(w2), b0 = 1 + al2, hp = [(1 + c2) / 2 / b0, -(1 + c2) / b0, (1 + c2) / 2 / b0, -2 * c2 / b0, (1 - al2) / b0];
  return [sh, hp];
}
function lufs(L, R, sr) {
  sr = sr || SR; var f = kw(sr), chans = [L, R].map(function (x) { return biquad(biquad(x, f[0]), f[1]); });
  var blk = Math.round(0.4 * sr), hop = Math.round(0.1 * sr), z = [];
  for (var s = 0; s + blk <= L.length; s += hop) { var m = 0; chans.forEach(function (c) { var a = 0; for (var i = s; i < s + blk; i++) a += c[i] * c[i]; m += a / blk; }); z.push(m); }
  function lk(m) { return -0.691 + 10 * Math.log10(m); }
  var g1 = z.filter(function (m) { return lk(m) > -70; }); if (!g1.length) return -Infinity;
  var rel = lk(g1.reduce(function (a, b) { return a + b; }, 0) / g1.length) - 10, g2 = g1.filter(function (m) { return lk(m) > rel; });
  return lk(g2.reduce(function (a, b) { return a + b; }, 0) / g2.length);
}

// ---------- the render ----------
// opt: { from: first bar, bars: how many (default the whole song), countIn: one bar of clicks before (recording mode) }
// Returns a job: run its steps one by one (renderAsync gives the page a breath between them) or all at once (render).
function job(v, opt) {
  opt = opt || {};
  var from = opt.from || 0, n = opt.bars || (SONG.length - from), E = events(v, from, n), P = E.p, spb = E.spb, pre = opt.countIn ? 4 * spb : 0;
  var len = Math.ceil((n * 4 * spb + pre + (opt.tail === false ? 0 : 2.5)) * SR), off = Math.round(pre * SR);
  var B = { kick: new Float32Array(len), bass: new Float32Array(len), dL: new Float32Array(len), dR: new Float32Array(len), mL: new Float32Array(len), mR: new Float32Array(len), vL: new Float32Array(len), vR: new Float32Array(len) };
  var ev = E.ev.map(function (e) { var o = Object.assign({}, e); o.t += pre; return o; }), out = null, steps = [];
  // Every sound is rendered once and then laid in wherever it plays, like a sampler: drums at full velocity in four
  // round-robin variants (e.rr, the seed picks), scaled by their velocity curve; music notes by pitch, length and filter.
  var notBass = ev.filter(function (e) { return e.i !== "bass"; }), cache = {}, tmp = null;
  function sound(e) {
    var drum = CURVE[e.i], x = Object.assign({}, e); delete x.t; if (drum) x.v = 1; if (!drum) delete x.rr;
    var key = JSON.stringify(x); if (cache[key]) return cache[key];
    var need = Math.ceil(((e.d || 0) + 2.6) * SR);
    if (!tmp || tmp.dL.length < need) { tmp = {}; CH.forEach(function (c) { tmp[c] = new Float32Array(need); }); } else CH.forEach(function (c) { tmp[c].fill(0, 0, need); });
    VOICE[e.i](tmp, 0, x, P);
    var out = {};
    CH.forEach(function (c) { var a = tmp[c], last = -1; for (var i = need - 1; i >= 0; i--) if (a[i] > 1e-6 || a[i] < -1e-6) { last = i; break; } if (last >= 0) out[c] = a.slice(0, last + 1); });
    return (cache[key] = out);
  }
  for (var c = 0; c < notBass.length; c += 96) (function (part) {
    steps.push(function () {
      part.forEach(function (e) {
        var s0 = Math.max(0, Math.round(e.t * SR)); if (s0 >= len) return;
        var o = sound(e), g = CURVE[e.i] ? CURVE[e.i](e.v) : 1;
        for (var ch in o) { var a = o[ch], b = B[ch], m = Math.min(a.length, len - s0); for (var i = 0; i < m; i++) b[s0 + i] += a[i] * g; }
      });
    });
  })(notBass.slice(c, c + 96));
  steps.push(function () { bassVoice(B, ev.filter(function (e) { return e.i === "bass"; }), P, len); });
  steps.push(function () {
    if (opt.countIn) for (var k = 0; k < 4; k++) click(B, Math.round(k * spb * SR), k === 0);
    var kicks = ev.filter(function (e) { return e.i === "kick"; }), size = len;
    // a loop (opt.wrap): the tails past its end are laid over its start, so it repeats without a gap or a cut
    if (opt.wrap) {
      size = Math.round(n * 4 * spb * SR);
      Object.keys(B).forEach(function (k) { var a = B[k]; for (var i = size; i < len; i++) a[i % size] += a[i]; B[k] = a.subarray(0, size); });
      kicks = kicks.concat(kicks.map(function (e) { return { t: e.t - size / SR, v: e.v }; }));
    }
    out = mix(B, kicks, P, size, off, !opt.wrap, opt.stems);
  });
  return { steps: steps, result: function () { return out; }, events: E, off: off, spb: spb, len: len };
}
function click(B, s0, accent) {
  var n = Math.floor(0.03 * SR), ph = 0, f = accent ? 1760 : 1320;
  for (var i = 0; i < n && s0 + i < B.dL.length; i++) { ph += f / SR; var y = Math.sin(TAU * ph) * Math.exp(-i / SR / 0.008) * 0.35; B.dL[s0 + i] += y; B.dR[s0 + i] += y; }
}
// per style: drums, 808, music, reverb return (dB), and the gain before the limiter (set with scripts/rapbeat-analyse.js)
var LEVEL = {
  boombap: { k: -2, b: -3, d: 0.5, m: 0, v: -4, g: 1.4, duck: 0.35 },
  trap: { k: 0, b: -3, d: 1.5, m: 6, v: -3, g: -1, duck: 0.3 },
  drill: { k: 0, b: -3, d: 2, m: 2, v: -4, g: -0.1, duck: 0.3 },
  oldschool: { k: -6, b: -9, d: -2.5, m: 9, v: -5, g: 4.4, duck: 0.3 }
};
function mix(B, kicks, P, len, off, fadeEnd, stems) {
  var S = stems ? { kick: new Float32Array(len), bass: new Float32Array(len), drums: new Float32Array(len), music: new Float32Array(len) } : null;
  var L = LEVEL[P.style.id], st = P.style.id, duck = new Float32Array(len).fill(1);
  kicks.forEach(function (k) {   // sidechain: 808 and music duck under each kick (a few dB, back in ~120 ms)
    var s0 = Math.round(k.t * SR), d = L.duck * k.v;
    for (var i = 0; i < Math.round(0.25 * SR) && s0 + i < len; i++) { if (s0 + i < 0) continue; var t = i / SR, g = 1 - d * (t < 0.003 ? t / 0.003 : Math.exp(-(t - 0.003) / 0.07)); if (g < duck[s0 + i]) duck[s0 + i] = g; }
  });
  var rv = reverb(B.vL, B.vR, st === "boombap" ? 0.8 : 0.84, st === "boombap" ? 0.45 : 0.3);
  var hpL = new SVF(), hpR = new SVF(), sHp = new SVF(), bHp = new SVF(), lpL = new SVF(), lpR = new SVF(), rvL = new SVF(), rvR = new SVF();
  hpL.set(210, 0.6); hpR.set(210, 0.6); sHp.set(200, 0.7); bHp.set(28, 0.7); rvL.set(350, 0.7); rvR.set(350, 0.7);
  var lofi = st === "boombap"; lpL.set(lofi ? 6500 : 16000, 0.7); lpR.set(lofi ? 6500 : 16000, 0.7);
  var gk = db(L.k), gb = db(L.b), gd = db(L.d), gm = db(L.m), gv = db(L.v), crackle = noise(P.seed * 3 + 1), hiss = noise(P.seed * 5 + 2);
  var oL = new Float32Array(len), oR = new Float32Array(len), env = 0, gr = 1;
  for (var i = 0; i < len; i++) {
    // music: high-passed at 210 Hz (the bass owns the low end), the side below 200 Hz removed (mono low end), a touch of tape, ducked
    var ml = lpL.run(sat(B.mL[i] * 1.2, 1.3)), mr = lpR.run(sat(B.mR[i] * 1.2, 1.3));
    hpL.run(ml); hpR.run(mr); ml = hpL.hi; mr = hpR.hi;
    var mid = (ml + mr) / 2, side = (ml - mr) / 2; sHp.run(side); side = sHp.hi; ml = (mid + side) * gm * duck[i]; mr = (mid - side) * gm * duck[i];
    if (lofi) { var cr = crackle(); if (cr > 0.9993) { ml += 0.05 * (cr - 0.9993) / 0.0007; mr += 0.05 * (cr - 0.9993) / 0.0007; } var hs = hiss() * 0.0018; ml += hs; mr += hs; }
    rvL.run(rv[0][i]); rvR.run(rv[1][i]);
    var bass = B.bass[i]; bHp.run(bass); bass = bHp.hi * gb * (0.55 + 0.45 * duck[i]);
    var k = B.kick[i] * gk;
    var l = k + bass + B.dL[i] * gd + ml + rvL.hi * gv, r = k + bass + B.dR[i] * gd + mr + rvR.hi * gv;
    if (S) { S.kick[i] = k; S.bass[i] = bass; S.drums[i] = (B.dL[i] + B.dR[i]) / 2 * gd; S.music[i] = (ml + mr) / 2 + (rvL.hi + rvR.hi) / 2 * gv; }   // stems for scripts/rapbeat-analyse.js
    // gentle glue compression on the sum (2:1 above -12 dBFS, 10 ms / 150 ms)
    var pk = Math.max(Math.abs(l), Math.abs(r)); env = pk > env ? env + (pk - env) * 0.0023 : env + (pk - env) * 0.00015;
    var over = env > 0.25 ? Math.pow(env / 0.25, -0.5) : 1; gr = over;
    oL[i] = l * gr; oR[i] = r * gr;
  }
  // the master: gain into the limiter, and nothing above ~17 kHz (two 2-pole low-passes: no fizz that only adds
  // inter-sample peaks on the way to the converter)
  var g = db(L.g), aL = new SVF(), aR = new SVF(), bL = new SVF(), bR = new SVF(); aL.set(17000, 0.54); aR.set(17000, 0.54); bL.set(17000, 1.31); bR.set(17000, 1.31);
  var dcL = new SVF(), dcR = new SVF(); dcL.set(18, 0.6); dcR.set(18, 0.6);   // and no DC below 18 Hz (saturation is not symmetric)
  for (var j = 0; j < len; j++) { dcL.run(oL[j] * g); dcR.run(oR[j] * g); oL[j] = bL.run(aL.run(dcL.hi)); oR[j] = bR.run(aR.run(dcR.hi)); }
  var gr = limit(oL, oR, db(-1.5));
  // the count-in stays before the beat (recording mode); fade the very end
  var fade = fadeEnd ? Math.round(0.05 * SR) : 0; for (var e = 0; e < fade; e++) { var gf = e / fade; oL[len - 1 - e] *= gf; oR[len - 1 - e] *= gf; }
  if (S) Object.keys(S).forEach(function (k) { var a = S[k]; for (var i = 0; i < len; i++) a[i] *= g; });
  return { L: oL, R: oR, sr: SR, off: off, stems: S, gr: gr };
}
// Lookahead limiter: the gain each sample needs, its minimum over the next 1.5 ms, smoothed by a moving average of the
// same length (so it is down before the peak arrives), released over ~80 ms; then a hard ceiling for anything left.
var HALF = [0, 1, 2, 3, 4, 5, 6, 7].map(function (k) { var x = k - 3.5, w = 0.5 + 0.5 * Math.cos(Math.PI * x / 4.5); return Math.sin(Math.PI * x) / (Math.PI * x) * w; });
function limit(L, R, ceil) {
  var n = L.length, la = Math.round(0.0015 * SR), need = new Float32Array(n), h = new Float32Array(n), q = [], qi = 0;
  // the peak a DAC can see: each sample and the point halfway to the next (8-tap windowed sinc), so the true peak stays
  // under the ceiling too, not only the samples
  for (var i = 0; i < n; i++) {
    var p = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    if (p > ceil * 0.7 && i >= 3 && i < n - 4) { var hl = 0, hr = 0; for (var k = 0; k < 8; k++) { hl += L[i - 3 + k] * HALF[k]; hr += R[i - 3 + k] * HALF[k]; } p = Math.max(p, Math.abs(hl), Math.abs(hr)); }
    need[i] = p > ceil ? ceil / p : 1;
    if (i > 0 && need[i] < need[i - 1]) need[i - 1] = need[i];   // the half-sample point lies between i and i + 1
  }
  // sliding minimum over [i, i + la)
  for (var j = n - 1; j >= 0; j--) {
    while (q.length > qi && need[q[q.length - 1]] >= need[j]) q.pop();
    q.push(j); if (qi >= q.length) qi = q.length - 1;
    while (q[qi] >= j + la) qi++;
    h[j] = need[q[qi]];
  }
  var acc = 0, rel = 1 - Math.exp(-1 / (SR * 0.08)), g = 1, buf = new Float32Array(la), gs = 0, gn = 0, gmin = 1;
  for (var k = 0; k < n; k++) {
    acc += h[k] - buf[k % la]; buf[k % la] = h[k]; var avg = k >= la - 1 ? acc / la : Math.min(acc / (k + 1), h[k]);
    var target = Math.min(avg, h[k]); g = target < g ? target : g + (target - g) * rel;
    if (g < 0.999) { gs += g; gn++; } if (g < gmin) gmin = g;
    var a = L[k] * g, b = R[k] * g; L[k] = a > ceil ? ceil : a < -ceil ? -ceil : a; R[k] = b > ceil ? ceil : b < -ceil ? -ceil : b;
  }
  // how hard it worked: the deepest gain reduction and the share of the time it reduced at all (dB, fraction)
  return { max: -20 * Math.log10(gmin), time: gn / n, avg: gn ? -20 * Math.log10(gs / gn) : 0 };
}
function render(v, opt) { var j = job(v, opt); j.steps.forEach(function (s) { s(); }); var r = j.result(); r.events = j.events; return r; }
function renderAsync(v, opt, progress) {
  var j = job(v, opt), i = 0;
  return new Promise(function (ok, no) {
    (function next() {
      try {
        var t0 = Date.now();
        while (i < j.steps.length && Date.now() - t0 < 40) j.steps[i++]();
        if (progress) progress(i / j.steps.length);
        if (i < j.steps.length) setTimeout(next, 0); else { var r = j.result(); r.events = j.events; ok(r); }
      } catch (e) { no(e); }
    })();
  });
}
// where a loop starts and how long it is (bars)
function loop(name) { return name === "song" ? { from: 0, bars: SONG.length } : { from: LOOPS[name], bars: 8 }; }

// ---------- WAV (16 bit PCM, stereo, TPDF dither) ----------
function wav(L, R, sr) {
  var n = L.length, b = new ArrayBuffer(44 + n * 4), d = new DataView(b), nz = noise(12345);
  function s(o, t) { for (var i = 0; i < t.length; i++) d.setUint8(o + i, t.charCodeAt(i)); }
  s(0, "RIFF"); d.setUint32(4, 36 + n * 4, true); s(8, "WAVE"); s(12, "fmt "); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 2, true);
  d.setUint32(24, sr, true); d.setUint32(28, sr * 4, true); d.setUint16(32, 4, true); d.setUint16(34, 16, true); s(36, "data"); d.setUint32(40, n * 4, true);
  for (var i = 0, o = 44; i < n; i++, o += 4) {
    var l = Math.round(L[i] * 32767 + (nz() + nz()) * 0.5), r = Math.round(R[i] * 32767 + (nz() + nz()) * 0.5);
    d.setInt16(o, l > 32767 ? 32767 : l < -32768 ? -32768 : l, true); d.setInt16(o + 2, r > 32767 ? 32767 : r < -32768 ? -32768 : r, true);
  }
  return new Uint8Array(b);
}

export { SR, events, render, renderAsync, loop, wav, lufs, limit, LEVEL };
export { fileName, SONG } from "./rapbeat-rule.js"; // SONG fuer host-audio aus dem Teil "klang-rap" (F #277)
