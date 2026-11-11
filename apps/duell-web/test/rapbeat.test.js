"use strict";
// Straßenrap-Beat (src/rapbeat.js): the patterns come only from the seed, the tempo stays in the style's range, the genre
// rules hold (swing, snare places, drops before the hook), the WAV is a valid 16-bit stereo file of the song's length, and
// the mix stays under its ceiling. The sound cards it replaces are off the shelf, their links still open.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const RB = require("../src/rapbeat.js"), Tn = require("../src/turns.js"), D = require("../src/daily.js");
const IDEAS = require("../src/ideas.json");
const sha = (u8) => crypto.createHash("sha256").update(u8).digest("hex");

test("Straßenrap-Beat: Stile mit Genre-Tempo, nur gueltige Zuege, ein Link mit fuenf Zahlen", () => {
  assert.deepEqual(RB.STYLES.map((s) => [s.id, s.lo, s.hi]), [["boombap", 84, 96], ["trap", 130, 150], ["drill", 138, 145], ["oldschool", 92, 104]]);
  RB.STYLES.forEach((s, i) => {
    const f = RB.fresh(i, 99); assert.ok(RB.ok(f), s.id); assert.ok(f[1] >= s.lo && f[1] <= s.hi);
    assert.ok(RB.ok([i, s.lo, 0, 0, 0]) && RB.ok([i, s.hi, 11, 2, 9999]), s.id + " Grenzen");
    assert.ok(!RB.ok([i, s.lo - 1, 0, 0, 0]) && !RB.ok([i, s.hi + 1, 0, 0, 0]), s.id + " ausserhalb");
  });
  for (const bad of [[4, 90, 0, 0, 0], [0, 90, 12, 0, 0], [0, 90, 0, 3, 0], [0, 90, 0, 0, 10000], [0, 90.5, 0, 0, 0], [0, 90, 0, 0], "x", null]) assert.ok(!RB.ok(bad), JSON.stringify(bad));
  // the turn rule: one move, the settings; a link holds nothing else and opens on any phone with the same beat
  const idea = IDEAS.ideas.find((i) => i.id === "strassenrap-beat");
  assert.equal(idea.turn.g, "rapbeat"); assert.equal(Tn.who("rapbeat"), "solo");
  const d0 = Tn.fresh(D.docFromIdea(idea, D.sanitizeProfile({}), "de"), 5), v = [2, 142, 4, 0, 808];
  const d1 = Tn.play(d0, [v], 0), d2 = Tn.play(d1, [[0, 90, 9, 1, 4711]], 0);
  assert.deepEqual(Tn.moves(d1), [[v]]); assert.deepEqual(Tn.moves(d2), [[[0, 90, 9, 1, 4711]]], "snap: der Link haelt nur den letzten Stand");
  assert.equal(Tn.state(d2).over, false, "ein Beat endet nie");
  assert.equal(Tn.play(d0, [[2, 150, 4, 0, 808]], 0), null, "Drill mit 150 BPM gibt es nicht");
  const back = D.parseRoute("#" + D.docUrl(d1).split("#")[1]).doc;
  assert.deepEqual(Tn.moves(back), [[v]]);
  assert.ok(D.docUrl(d1).length < 400, "kurzer Link: " + D.docUrl(d1).length);
  assert.equal(RB.label(v, "de"), "Drill · 142 BPM · e-Moll · Düster · #808"); assert.equal(RB.label(v, "en"), "Drill · 142 BPM · E minor · Dark · #808");
});

test("Straßenrap-Beat: Muster nur aus dem Seed (gleich bei gleichem Seed, anders bei anderem), Tempo und Tonart aendern das Muster nicht", () => {
  for (let st = 0; st < 4; st++) {
    const a = RB.phrase(RB.params([st, RB.STYLES[st].bpm, 0, 0, 1234])), b = RB.phrase(RB.params([st, RB.STYLES[st].bpm, 0, 0, 1234]));
    assert.deepEqual(a, b, "gleicher Seed");
    assert.deepEqual(RB.phrase(RB.params([st, RB.STYLES[st].lo, 7, 0, 1234])), a, "Tempo und Tonart: dasselbe Muster");
    const seen = new Set(); for (let s = 0; s < 12; s++) seen.add(JSON.stringify(RB.phrase(RB.params([st, RB.STYLES[st].bpm, 0, 0, s]))));
    assert.ok(seen.size >= 8, RB.STYLES[st].id + ": Seeds geben verschiedene Muster (" + seen.size + ")");
  }
  // no Math.random anywhere in the engine: the same render twice is the same file, byte for byte
  const real = Math.random; Math.random = () => { throw new Error("Math.random"); };
  try {
    const v = [1, 140, 2, 0, 1312], x = RB.render(v, { from: 4, bars: 2 }), y = RB.render(v, { from: 4, bars: 2 });
    assert.equal(sha(RB.wav(x.L, x.R, x.sr)), sha(RB.wav(y.L, y.R, y.sr)));
  } finally { Math.random = real; }
});

test("Straßenrap-Beat: Groove – Boom-Bap-Swing auf den Off-16teln, Trap-Snare auf der 3, Drill-Snare auf 3 und 4, Drop vor der Hook", () => {
  const E = (v, from, n) => RB.events(v, from, n);
  // boom bap 90 BPM, swing 57 %: an off-16th hat comes (0.57 - 0.5) * 2 sixteenths late (+-2.5 ms humanising)
  const bb = E([0, 90, 9, 0, 7], 4, 2), s16 = 60 / 90 / 4;
  const hats = bb.ev.filter((e) => e.i === "hat").map((e) => e.t / s16), late = hats.filter((g) => Math.round(g - 0.14) % 2 === 1).map((g) => (g - Math.round(g - 0.14)) * s16 * 1000);
  assert.ok(late.length >= 8 && late.every((ms) => Math.abs(ms - 0.14 * s16 * 1000) < 2.6), "Swing: " + late.map((x) => x.toFixed(1)));
  // the snare sits a little late in boom bap (laid back), on 2 and 4
  bb.ev.filter((e) => e.i === "snare" && e.v === 1).forEach((e) => { const b = e.t / (s16 * 4); assert.ok([1, 3, 5, 7].some((x) => b - x > 0.005 && b - x < 0.04), "Snare " + b); });
  // trap: snare and clap on 3 of every bar (half time)
  const tr = E([1, 140, 2, 0, 3], 4, 4), beat = 60 / 140;
  assert.deepEqual(tr.ev.filter((e) => e.i === "snare" && e.v === 1).map((e) => Math.round(e.t / beat * 4) / 4), [2, 6, 10, 14]);
  // drill: snare on 3 of bar one and on 4 of bar two
  const dr = E([2, 142, 4, 0, 808], 4, 2), b2 = 60 / 142;
  assert.deepEqual(dr.ev.filter((e) => e.i === "snare").map((e) => Math.round(e.t / b2 * 4) / 4), [2, 7]);
  // drill 808s slide: some notes glide in
  assert.ok(RB.phrase(RB.params([2, 142, 4, 0, 808])).bass.some((n) => n.glide), "Drill: gleitende 808");
  // the song: 64 bars, 8-bar hooks, 16-bar verses; the beat drops out at the end of the bar before every hook
  assert.equal(RB.SONG.length, 64); assert.deepEqual(RB.SECTIONS.map((s) => s[1]), [4, 8, 16, 8, 16, 8, 4]);
  const song = E([1, 140, 2, 0, 3], 0, 64), bar = 4 * beat;
  [3, 27, 51].forEach((b) => {
    const hits = song.ev.filter((e) => ["kick", "snare", "hat", "bass"].includes(e.i) && e.t >= (b + 0.5) * bar && e.t < (b + 1) * bar);
    assert.deepEqual(hits.map((e) => e.i), [], "Drop in Takt " + b);
    assert.ok(song.ev.some((e) => e.i === "kick" && Math.abs(e.t - (b + 1) * bar) < 0.001), "die Hook setzt mit der Kick ein, Takt " + (b + 1));
  });
  assert.ok(!song.ev.some((e) => e.i === "kick" && e.t < 4 * bar), "Intro ohne Kick");
});

test("Straßenrap-Beat: WAV – Kopf, Laenge, Pegel unter der Decke, Einzaehler davor", () => {
  const v = [3, 98, 7, 2, 1987], r = RB.render(v, { from: 4, bars: 2, tail: false }), w = RB.wav(r.L, r.R, r.sr), dv = new DataView(w.buffer);
  const str = (o, n) => String.fromCharCode(...w.slice(o, o + n));
  assert.equal(str(0, 4), "RIFF"); assert.equal(str(8, 4), "WAVE"); assert.equal(str(12, 4), "fmt "); assert.equal(str(36, 4), "data");
  assert.deepEqual([dv.getUint16(20, true), dv.getUint16(22, true), dv.getUint32(24, true), dv.getUint16(34, true)], [1, 2, 44100, 16], "PCM, Stereo, 44,1 kHz, 16 Bit");
  assert.equal(dv.getUint32(4, true), w.length - 8); assert.equal(dv.getUint32(40, true), w.length - 44);
  const frames = (w.length - 44) / 4; assert.equal(frames, r.L.length); assert.equal(frames, Math.ceil(2 * 4 * 60 / 98 * 44100));
  let pk = 0; for (let i = 0; i < r.L.length; i++) pk = Math.max(pk, Math.abs(r.L[i]), Math.abs(r.R[i]));
  assert.ok(20 * Math.log10(pk) <= -1.49, "Spitze unter -1,5 dBFS: " + 20 * Math.log10(pk));
  // the song (export) is the whole arrangement plus 2.5 s of tails; with the count-in one bar more in front, clicks only there
  const c = RB.render(v, { from: 4, bars: 1, countIn: true });
  assert.equal(c.off, Math.round(4 * 60 / 98 * 44100));
  let pre = 0; for (let i = 0; i < c.off; i++) pre = Math.max(pre, Math.abs(c.L[i])); assert.ok(pre > 0.05, "Einzaehler hoerbar");
  // a loop wraps its tails onto its start: exactly 8 bars long
  const lp = RB.render(v, Object.assign(RB.loop("hook"), { wrap: true }));
  assert.equal(lp.L.length, Math.round(8 * 4 * 60 / 98 * 44100));
  const lufs = RB.lufs(lp.L, lp.R); assert.ok(lufs > -13 && lufs < -8, "Lautheit der Hook " + lufs.toFixed(1) + " LUFS");
  assert.match(RB.fileName(v), /^strassenrap-oldschool-98bpm-g-minor-hype-1987\.wav$/);
});

test("Regal: die Sound-Karten sind weg, ihre Links oeffnen weiter, Nachfolger ist der Straßenrap-Beat", () => {
  assert.deepEqual(IDEAS.ideas.filter((i) => i.kind === "sound").map((i) => i.id), [], "kein Sound mehr im Regal");
  const ret = Object.fromEntries(IDEAS.retired.filter((i) => i.kind === "sound").map((i) => [i.id, i.to]));
  assert.deepEqual(ret, { "beat-boss": "strassenrap-beat", "stimme-verzerren": "mut-tierstory", "plan-05": "strassenrap-beat", "plan-12": "strassenrap-beat", "beat-pausenhof": "strassenrap-beat" });
  for (const id of Object.keys(ret)) assert.deepEqual(D.parseRoute("#i=" + id), { type: "idea", id }, id + ": alter Link oeffnet");
  // same days as before: the new card keeps the old one's place in the rotation (mx "sound")
  assert.equal(IDEAS.ideas.find((i) => i.id === "strassenrap-beat").mx, "sound");
});
