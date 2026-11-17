// Strassenrap-Beat (PR #227, Branch feat/strassenrap-beat @ 4438861, src/rapbeat.js): die Regel ohne Klang. Ein Link traegt
// genau einen Zug [Stil, BPM, Tonart, Stimmung, Variante], fuenf kleine Zahlen; jedes Geraet baut daraus denselben Beat.
// Muster nur aus dem Seed (mit Stil und Stimmung), nie aus Zufall, Uhr oder Geraet. Unveraendert portiert; Karte und
// Synthese (rapbeat.js) teilen diese Datei. Harness-fest: keine approximierten Math-Funktionen.
import { hash32, mulberry32 } from "../poster/doc.js";
// lo..hi: the BPM slider; bpm: where a new beat starts; swing: MPC-style 16th swing (0.5 straight); half: counted in half time
var STYLES = [
  { id: "boombap", lo: 84, hi: 96, bpm: 90, swing: 0.57, half: false, chordBars: 1 },
  { id: "trap", lo: 130, hi: 150, bpm: 140, swing: 0.5, half: true, chordBars: 1 },
  { id: "drill", lo: 138, hi: 145, bpm: 142, swing: 0.5, half: true, chordBars: 2 },
  { id: "oldschool", lo: 92, hi: 104, bpm: 98, swing: 0.54, half: false, chordBars: 1 }
];
var MOODS = ["dark", "melan", "hype"];
var KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
var SEEDS = 10000, DRUMS = ["kick", "snare", "clap", "hat", "ohat", "rim", "crash"];
// The song: 64 bars. A verse is 16 bars (two 8-bar halves), a hook 8; the bar before a hook drops out (see bars()).
var SECTIONS = [["intro", 4], ["hook", 8], ["verse", 16], ["hook", 8], ["verse", 16], ["hook", 8], ["outro", 4]];
var LOOPS = { hook: 4, verse: 12, song: 0 };   // the first bar of the loop the screen plays (a hook, a verse's second half)

function range(st) { var s = STYLES[st] || STYLES[0]; return [s.lo, s.hi]; }
function intIn(v, a, b) { return Number.isInteger(v) && v >= a && v <= b; }
// A link can be built by hand: only what the screen could have sent.
function ok(v) {
  return Array.isArray(v) && v.length === 5 && intIn(v[0], 0, STYLES.length - 1) && intIn(v[1], range(v[0])[0], range(v[0])[1]) &&
    intIn(v[2], 0, 11) && intIn(v[3], 0, MOODS.length - 1) && intIn(v[4], 0, SEEDS - 1);
}
function fresh(st, seed) { st = st || 0; return [st, STYLES[st].bpm, 9, 0, (seed >>> 0) % SEEDS]; }   // A minor, dark
function params(v) { return { st: v[0], style: STYLES[v[0]], bpm: v[1], key: v[2], mood: v[3], seed: v[4] }; }
function bars() { var out = []; SECTIONS.forEach(function (s) { for (var i = 0; i < s[1]; i++) out.push({ sec: s[0], i: i, n: s[1] }); }); return out; }
var SONG = bars();

// ---------- randomness: only from the seed ----------
function rng(p, tag) { return mulberry32(hash32("rapbeat|" + p.seed + "|" + p.st + "|" + p.mood + "|" + tag)); }
function pick(r, a) { return a[Math.floor(r() * a.length)]; }
// a number in [0, 1) for a place in the song (humanising): the same bar and beat always get the same one
function hn(seed, a, b, c) { var h = hash32(seed + ":" + a + ":" + b + ":" + c); return h / 4294967296; }

// ---------- harmony ----------
// Progressions as [semitones above the key's root, quality] for each chord; two per mood, the seed picks.
var PROG = {
  dark: [[[0, "m"], [0, "m"], [8, "M"], [1, "M"]], [[0, "m"], [8, "M"], [7, "m"], [0, "m"]]],
  melan: [[[0, "m"], [8, "M"], [3, "M"], [10, "M"]], [[0, "m"], [5, "m"], [8, "M"], [10, "M"]]],
  hype: [[[0, "m"], [10, "M"], [8, "M"], [7, "M"]], [[0, "m"], [5, "m"], [7, "M"], [0, "m"]]]
};
var SCALE = { dark: [0, 1, 3, 5, 7, 8, 10], melan: [0, 2, 3, 5, 7, 8, 10], hype: [0, 2, 3, 5, 7, 8, 11] };
var PENTA = [0, 3, 5, 7, 10];
function chordTones(q, rich) { return q === "m" ? (rich ? [0, 3, 7, 10, 14] : [0, 3, 7, 12]) : (rich ? [0, 4, 7, 11, 14] : [0, 4, 7, 12]); }
// close voicing around a centre (MIDI), so chords move little from one to the next
function voice(rootMidi, tones, lo) { return tones.map(function (t) { var m = rootMidi + t; while (m < lo) m += 12; while (m >= lo + 12) m -= 12; return m; }).sort(function (a, b) { return a - b; }); }

// ---------- patterns: a 2-bar phrase per element, from the seed ----------
// Beats count from 0 (0 = the "one"); a 2-bar phrase spans 0..8.
var KICK = {
  boombap: [[0, 0.75, 2.5], [0, 1.75, 2.5], [0, 0.5, 2.5, 3.25], [0, 2.25, 2.5], [0, 0.75, 2.25, 3.5], [0, 1.5, 2.5, 2.75]],
  trap: [[0, 1.5, 2.75], [0, 0.75, 1.5, 3.5], [0, 2.5, 3], [0, 1.25, 3.25], [0, 0.5, 1.75, 3.5], [0, 2.75, 3.5]],
  drill: [[0, 1.5], [0, 2.75], [0, 0.75, 3.25], [0, 1.25, 3.5], [0.5, 1.5], [0, 3.5]],
  oldschool: [[0, 1.5, 2.5], [0, 0.75, 1.5, 2.5], [0, 2.5, 2.75], [0, 1.75, 2.5, 3.5]]
};
function phrase(p) {
  var s = p.style.id, r = rng(p, "phrase"), out = { kick: [], snare: [], clap: [], hat: [], ohat: [], rim: [], bass: [], keys: [], lead: [] };
  var k1 = pick(r, KICK[s]), k2 = pick(r, KICK[s]); if (k2 === k1) k2 = KICK[s][(KICK[s].indexOf(k1) + 1) % KICK[s].length];
  k1.forEach(function (b) { out.kick.push({ b: b, v: b === 0 ? 1 : 0.9 }); }); k2.forEach(function (b) { out.kick.push({ b: 4 + b, v: b === 0 ? 1 : 0.9 }); });
  if (s === "boombap" || s === "oldschool") {
    [1, 3, 5, 7].forEach(function (b) { out.snare.push({ b: b, v: 1, late: s === "boombap" ? 0.008 : 0 }); });
    if (s === "oldschool") [1, 3, 5, 7].forEach(function (b) { out.clap.push({ b: b, v: 0.45 }); });
    [1.75, 2.75, 3.75, 5.75, 6.75, 7.75].forEach(function (b) { if (r() < 0.32) out.snare.push({ b: b, v: 0.22 + r() * 0.12 }); });   // ghost notes
    // 16ths with an accent on the 8ths (swing moves the off-16ths), a few left out so it breathes
    for (var i = 0; i < 32; i++) { var pos = i % 4, v = [0.95, 0.38, 0.72, 0.42][pos]; if (s === "oldschool" && pos % 2) v *= 0.8; if (pos % 2 && r() < 0.18) continue; out.hat.push({ b: i / 4, v: v * (0.9 + r() * 0.1) }); }
    if (r() < 0.7) out.ohat.push({ b: 7.5, v: 0.6 });
    if (s === "oldschool" && r() < 0.6) out.ohat.push({ b: 3.5, v: 0.5 });
  } else if (s === "trap") {
    [2, 6].forEach(function (b) { out.snare.push({ b: b, v: 1 }); out.clap.push({ b: b, v: 0.9 }); });
    if (r() < 0.45) out.snare.push({ b: 7.75, v: 0.55 });
    var eighths = r() < 0.45;
    for (var j = 0; j < 32; j++) { if (eighths && j % 2) continue; out.hat.push({ b: j / 4, v: j % 2 ? 0.55 : 0.85 }); }
    // rolls: 1/16 triplets or 1/32 with a pitch ramp, before a snare or at the end of the phrase
    var spots = [1.5, 3.5, 5.5, 7, 7.5].filter(function () { return r() < 0.42; }); if (!spots.length) spots = [7];
    spots.forEach(function (at) { roll(out.hat, at, at === 7 ? 1 : 0.5, pick(r, [6, 8, 6, 12]), r() < 0.6); });
    if (r() < 0.5) out.ohat.push({ b: 3.5, v: 0.45 });
  } else {   // drill
    out.snare.push({ b: 2, v: 1 }, { b: 7, v: 1 }); out.clap.push({ b: 2, v: 0.55 }, { b: 7, v: 0.55 });
    [3.5, 5.25, 7.75].forEach(function (b) { if (r() < 0.45) out.rim.push({ b: b, v: 0.5 + r() * 0.3 }); });
    // per beat: straight 16ths, 8ths, 8th triplets, half 16ths + half 1/16 triplets, or one hit (a gap the 808 answers)
    var kinds = ["s", "e", "t", "st", "o"], bar = [];
    for (var q = 0; q < 4; q++) bar.push(q === 0 ? "e" : pick(r, kinds));
    for (var bb = 0; bb < 8; bb++) {
      var kind = bb === 7 ? pick(r, ["t", "st", "s"]) : bar[bb % 4], x = [];
      if (kind === "s") x = [0, 0.25, 0.5, 0.75]; else if (kind === "e") x = [0, 0.5]; else if (kind === "t") x = [0, 1 / 3, 2 / 3];
      else if (kind === "st") x = [0, 0.25, 0.5, 0.5 + 1 / 6, 0.5 + 2 / 6]; else x = [0];
      x.forEach(function (f, n) { out.hat.push({ b: bb + f, v: n === 0 ? 0.85 : 0.5 + r() * 0.2 }); });
    }
  }
  if (s === "boombap" && r() < 0.5) out.rim.push({ b: 3.5, v: 0.35 });
  bassLine(p, r, out);
  musicLine(p, r, out);
  return out;
}
function roll(list, at, len, per, ramp) {
  for (var i = list.length - 1; i >= 0; i--) if (list[i].b >= at - 1e-6 && list[i].b < at + len - 1e-6) list.splice(i, 1);
  var n = Math.round(len * per);
  for (var k = 0; k < n; k++) list.push({ b: at + k / per, v: 0.45 + 0.4 * (k / n), up: ramp ? 5 * k / n : 0, roll: 1 });
}
// The bass: notes as semitones above the chord's root (in the 808's register); glide: slides in from the note before.
function bassLine(p, r, out) {
  var s = p.style.id;
  out.kick.forEach(function (k, i) {
    var nx = out.kick[i + 1], len = (nx ? nx.b : 8) - k.b, deg = 0, glide = false;
    if (s === "trap") { if (i > 0 && r() < 0.3) { deg = pick(r, [12, 7, 10]); glide = r() < 0.5; } }
    else if (s === "drill") { if (i > 0 && r() < 0.6) { deg = pick(r, [12, 7, 3, 10, -2]); glide = r() < 0.7; } }
    else if (s === "boombap") { len = Math.min(len, 0.75 + r() * 0.5); if (r() < 0.2) deg = 12; }
    else { len = Math.min(len, 0.4); if (i % 2 && r() < 0.5) deg = 12; }
    out.bass.push({ b: k.b, len: len, deg: deg, glide: glide, v: k.v });
  });
  // drill: an extra 808 in a hat gap, sliding into the next bar's root
  if (s === "drill" && r() < 0.7) out.bass.push({ b: 7.5, len: 0.5, deg: pick(r, [3, 7, -2]), glide: true, v: 0.8 });
  if (s === "oldschool") [0.5, 1.75, 3.25, 4.5, 6.25].forEach(function (b) { if (r() < 0.35 && !out.bass.some(function (x) { return Math.abs(x.b - b) < 0.3; })) out.bass.push({ b: b, len: 0.25, deg: pick(r, [0, 12, 7]), v: 0.7 }); });
  out.bass.sort(function (a, b) { return a.b - b.b; });
}
// Chord rhythm and a 2-bar motif (scale steps), repeated with an answer every second phrase.
function musicLine(p, r, out) {
  var s = p.style.id;
  var rhy = s === "boombap" ? pick(r, [[[0, 1.5], [1.75, 0.75], [2.5, 1.5]], [[0, 2.5], [2.5, 1.5]], [[0, 0.75], [0.75, 1.75], [2.75, 1.25]]])
    : s === "oldschool" ? pick(r, [[[0, 0.4], [1.5, 0.4], [2.75, 0.5]], [[0, 0.35], [0.75, 0.35], [2.5, 0.6]]])
    : [[0, 4]];
  out.keys = rhy;
  var grid = s === "drill" ? pick(r, [[0, 0.5, 1, 1.5, 2.5, 3, 3.5], [0, 1 / 3, 2 / 3, 1, 2, 2.5, 3]]) : s === "trap" ? pick(r, [[0, 0.5, 0.75, 1.5, 2, 2.5, 3.5], [0, 0.75, 1.5, 2.25, 3, 3.5]])
    : s === "boombap" ? [0, 1.5, 2.5, 3] : [0, 0.5, 1.5, 2.5];
  var sc = s === "trap" || s === "boombap" ? PENTA : SCALE[MOODS[p.mood]], deg = 0;
  for (var bar = 0; bar < 2; bar++) grid.forEach(function (b, i) {
    if (bar === 1 && i === grid.length - 1 && r() < 0.5) return;
    deg += pick(r, [-2, -1, -1, 0, 1, 1, 2]); if (deg < -2) deg = -2; if (deg > sc.length + 2) deg = sc.length + 2;
    if (i === 0) deg = bar === 0 ? 0 : pick(r, [2, 4, 0]);
    out.lead.push({ b: bar * 4 + b, deg: deg, len: s === "boombap" ? 0.9 : 0.45, v: i === 0 ? 1 : 0.75 + r() * 0.2 });
  });
  out.scale = sc;
}
function stepNote(sc, deg) { var o = Math.floor(deg / sc.length), i = ((deg % sc.length) + sc.length) % sc.length; return sc[i] + 12 * o; }
/** Dateiname der WAV (#227 fileName). */
export function fileName(v, lang) { var p = params(v); return "strassenrap-" + p.style.id + "-" + p.bpm + "bpm-" + KEYS[p.key].replace("#", "sharp").toLowerCase() + "-minor-" + MOODS[p.mood] + "-" + p.seed + ".wav"; }
/** Naechste Variante im festen Gang (alt rapbeat-ui.js dice), ohne Zufall. */
export function dice(seed) { return (seed * 7919 + 4513) % SEEDS; }
export { DRUMS, STYLES, MOODS, KEYS, SEEDS, SECTIONS, LOOPS, SONG, PROG, SCALE, PENTA, range, ok, fresh, params, bars, rng, pick, hn, chordTones, voice, phrase, roll, stepNote };
