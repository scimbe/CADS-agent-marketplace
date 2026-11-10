"use strict";
// Stimme verzerren (part klang): the effects on a synthetic signal, deterministic (no microphone, no Web Audio), the
// merged card with its alias table for old links, and what the link carries (effect, tempo, text; never the voice).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const K = require("../src/klang.js");
const D = require("../src/daily.js");
const SR = K.SR;
const src = (f) => fs.readFileSync(path.join(__dirname, "../src", f), "utf8");

const sine = (f, sec, amp) => { const a = new Float32Array(Math.round(sec * SR)); for (let i = 0; i < a.length; i++) a[i] = (amp || 0.5) * Math.sin(2 * Math.PI * f * i / SR); return a; };
const peak = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rms = (a, s, e) => { s = s || 0; e = e || a.length; let x = 0; for (let i = s; i < e; i++) x += a[i] * a[i]; return Math.sqrt(x / (e - s)); };
// Frequency from the rising zero crossings, away from the ends.
const freq = (a) => { const b = a.subarray(2048, a.length - 2048); let z = 0; for (let i = 1; i < b.length; i++) if (b[i - 1] < 0 && b[i] >= 0) z++; return z / (b.length / SR); };
// A "voice": 220 Hz with a slow swell, so start and end differ (for the mirror test).
const voice = () => { const a = sine(220, 2); for (let i = 0; i < a.length; i++) a[i] *= i / a.length; return a; };

test("Klang: zehn Effekte (8 Stimmen + 2 Tempi), jede Kombination endlich, Pegel 0.92, nie NaN", () => {
  assert.deepEqual(K.FX, ["monster", "chip", "robot", "echo", "rev", "alien", "tel", "chor"]);
  assert.deepEqual(K.TEMPO, ["slow", "fast"]);
  assert.deepEqual(D.FX.slice().sort(), K.FX.slice().sort(), "der Link kennt genau die Effekte des Teils");
  assert.deepEqual(D.TEMPO, K.TEMPO);
  for (const fx of K.FX.concat([undefined])) for (const tp of [undefined].concat(K.TEMPO)) {
    const o = K.apply(voice(), { fx, tp }), n = fx + "/" + tp;
    assert.ok(o instanceof Float32Array && o.length > SR, n);
    assert.ok(o.every(Number.isFinite), n + ": endlich");
    assert.ok(Math.abs(peak(o) - 0.92) < 1e-6, n + ": Spitze 0.92, " + peak(o));
  }
});

test("Klang: deterministisch, Eingabe bleibt unveraendert, Stille bleibt still, leer bleibt leer", () => {
  const a = voice(), copy = a.slice();
  for (const fx of K.FX) {
    assert.deepEqual(K.apply(a, { fx, tp: "fast" }), K.apply(a, { fx, tp: "fast" }), fx + ": gleiche Eingabe, gleiche Ausgabe");
    assert.deepEqual(a, copy, fx + ": die Aufnahme selbst bleibt, wie sie war (Rueckgaengig)");
    const z = K.apply(new Float32Array(SR), { fx });
    assert.ok(z.every((v) => v === 0), fx + ": Stille");
    assert.equal(K.apply(new Float32Array(0), { fx }).every(Number.isFinite), true);
  }
});

test("Klang: Laengen – Stimmeffekte behalten die Laenge (Echo/Halle/Chor mit Ausklang), Tempo teilt sie, hoechstens 10 s Eingabe", () => {
  const a = voice(), L = a.length;
  for (const fx of ["chip", "rev", "alien", "tel"]) assert.equal(K.apply(a, { fx }).length, L, fx);
  assert.equal(K.apply(a, { fx: "robot" }).length, L + Math.floor(0.05 * SR) * 3, "Roboter: kurzes Echo");
  assert.equal(K.apply(a, { fx: "monster" }).length, L + Math.floor(0.09 * SR) * 3);
  assert.equal(K.apply(a, { fx: "echo" }).length, L + Math.floor(0.22 * SR) * 3 + Math.floor(0.6 * SR), "Echo + Halle klingen nach");
  assert.equal(K.apply(a, { fx: "chor" }).length, L + Math.floor(0.029 * SR));
  assert.equal(K.apply(a, { tp: "slow" }).length, Math.floor(L / 0.62), "Zeitlupe: laenger");
  assert.equal(K.apply(a, { tp: "fast" }).length, Math.floor(L / 1.6), "Chipmunk-Tempo: kuerzer");
  assert.equal(K.apply(sine(220, 14), {}).length, 10 * SR, "laenger als 10 s wird abgeschnitten");
  // the longest file: 10 s, echo with its tail, in slow motion
  const longest = K.apply(sine(220, 10), { fx: "echo", tp: "slow" }).length / SR;
  assert.ok(longest < 19, "laengste Aufnahme " + longest + " s");
});

test("Klang: Rueckwaerts ist die Spiegelung, zweimal rueckwaerts das Original", () => {
  const a = voice(), r = K.apply(a, { fx: "rev" }), plain = K.apply(a, {});
  for (let i = 0; i < a.length; i += 97) assert.equal(r[i], plain[a.length - 1 - i]);
  assert.deepEqual(K.reverse(K.reverse(a)), a);
  assert.ok(rms(r, 0, SR / 2) > rms(r, r.length - SR / 2), "die laute Stelle steht jetzt vorn");
});

test("Klang: Tonhoehe – Hamster hoch, Monster tief (gleiche Laenge), Tempo verschiebt mit, Telefon schneidet Tiefen und Hoehen", () => {
  const a = sine(220, 2);
  const near = (x, want, tol, n) => assert.ok(Math.abs(x - want) < tol, n + ": " + x.toFixed(1) + " Hz statt " + want);
  near(freq(K.apply(a, {})), 220, 3, "ohne Effekt");
  near(freq(K.apply(a, { fx: "chip" })), 220 * 1.75, 12, "Hamster");
  near(freq(K.pitch(a, 0.62)), 220 * 0.62, 6, "Monster (ohne Ringmod)");
  near(freq(K.apply(a, { tp: "fast" })), 220 * 1.6, 6, "Chipmunk-Tempo");
  near(freq(K.apply(a, { tp: "slow" })), 220 * 0.62, 4, "Zeitlupe");
  near(freq(K.apply(a, { fx: "rev" })), 220, 3, "Rueckwaerts aendert die Tonhoehe nicht");
  // phone band 300-3400 Hz: 100 Hz and 6 kHz far down, 1 kHz passes (before the level is set again)
  const mix = (f) => { const x = sine(1000, 1, 0.3), o = sine(f, 1, 0.6), m = new Float32Array(x.length); for (let i = 0; i < m.length; i++) m[i] = x[i] + o[i]; return m; };
  // Goertzel: the power of one frequency; the share of 1 kHz against the other tone, before and after the phone
  const pow = (x, f) => { const w = 2 * Math.cos(2 * Math.PI * f / SR); let s1 = 0, s2 = 0; for (const v of x) { const s0 = v + w * s1 - s2; s2 = s1; s1 = s0; } return s1 * s1 + s2 * s2 - w * s1 * s2; };
  for (const f of [100, 6000]) {
    const before = pow(mix(f), 1000) / pow(mix(f), f), after = K.apply(mix(f), { fx: "tel" }), share = pow(after, 1000) / pow(after, f);
    assert.ok(before < 0.5, f + " Hz ueberwiegt vorher"); assert.ok(share > 20 * before, "Telefon: " + f + " Hz faellt weg, 1 kHz bleibt (" + before.toFixed(2) + " -> " + share.toFixed(1) + ")");
  }
  // ring modulator (alien): no energy left at the plain voice's own pitch, it moves to the sidebands
  const al = K.apply(a, { fx: "alien" });
  assert.ok(Math.abs(freq(al) - 220 * 1.2) > 30, "Alien klingt anders als die Stimme: " + freq(al));
});

test("Klang: Lautstaerkeverlauf fuer den Frosch (0..1, ein Wert je Bild), Videotyp MP4 zuerst, Bitrate haelt 2 MB", () => {
  const a = voice(), e = K.envelope(a, 30);
  assert.equal(e.length, Math.ceil(a.length / Math.round(SR / 30)));
  assert.ok(e.every((v) => v >= 0 && v <= 1)); assert.equal(Math.max(...e), 1); assert.ok(e[0] < e[e.length - 1]);
  assert.deepEqual(K.envelope(new Float32Array(SR), 30).filter((v) => v !== 0), [], "Stille: Mund zu");
  const MR = (ok) => ({ isTypeSupported: (t) => ok.includes(t) });
  assert.equal(K.videoType(MR(["video/webm", "video/mp4"])), "video/mp4", "MP4 vor WebM (iOS Safari, Chrome ab 126)");
  assert.equal(K.videoType(MR(["video/webm;codecs=vp8,opus", "video/webm"])), "video/webm;codecs=vp8,opus", "Firefox, aeltere Chrome: WebM");
  assert.equal(K.videoType(MR([])), ""); assert.equal(K.videoType(undefined), ""); assert.equal(K.videoType({}), "");
  for (const sec of [1, 4, 10, 19]) assert.ok(K.bitrate(sec) * sec / 8 < 2 * 1024 * 1024 * 0.8, sec + " s: unter 2 MB mit Reserve");
  assert.ok(K.bitrate(1) <= 900000 && K.bitrate(60) >= 150000);
});

test("Katalog: eine Karte „Stimme verzerren“ statt drei, alte Links (#i= und #c=) oeffnen sie mit ihrem Effekt", () => {
  const ids = D.IDEAS.map((i) => i.id);
  for (const old of ["stimme-monster", "stimme-maus", "stimme-robo"]) assert.ok(!ids.includes(old), old + " ist zusammengelegt");
  const card = D.byId("stimme-verzerren");
  assert.equal(card.kind, "sound"); assert.equal(card.sound.mode, "voice");
  // since the shelf clean-up (2026-11) it is off the shelf (merged into "Tier-Aufstellung"), links still open it
  assert.equal(D.IDEAS.concat(D.RETIRED).filter((i) => i.kind === "sound" && i.sound.mode === "voice").length, 1, "eine Stimmkarte");
  assert.ok(D.RETIRED.includes(card) && card.to === "mut-tierstory" && !D.IDEAS.includes(card), "nicht im Regal");
  assert.deepEqual(D.MOVED, { "stimme-monster": ["stimme-verzerren", "monster"], "stimme-maus": ["stimme-verzerren", "chip"], "stimme-robo": ["stimme-verzerren", "robot"] });
  for (const [old, [id, fx]] of Object.entries(D.MOVED)) {
    assert.equal(D.byId(old), card, old);
    assert.deepEqual(D.parseRoute("#i=" + old), { type: "idea", id, fx }, old + " als Einladung");
    assert.deepEqual(D.parseRoute(D.inviteUrl(old, true).replace(/^[^#]*/, "")), { type: "idea", id, fx }, old + " ueber c=");
    const doc = D.docFromIdea(D.byId(old), D.sanitizeProfile({}), "de", D.parseRoute("#i=" + old).fx);
    assert.equal(doc.i, id); assert.equal(doc.fx, fx, old + ": der Effekt der alten Karte");
  }
  assert.deepEqual(D.parseRoute("#i=stimme-verzerren"), { type: "idea", id: "stimme-verzerren" }, "die neue Karte ohne Variante");
  assert.equal(D.docFromIdea(card, D.sanitizeProfile({}), "en").fx, "monster");
  assert.equal(D.parseRoute("#i=stimme-quatsch"), null, "unbekannt bleibt unbekannt");
  // the wall keeps an old entry (its id still names a card)
  assert.equal(D.sanitizeWall([{ id: "stimme-maus", ts: 1, th: "data:image/jpeg;base64,AAAA" }]).length, 1);
});

test("Link: traegt nur Effekt, Tempo und Text – nie die Stimme; Tempo gehoert zu „stimme“ in der Spur", () => {
  const base = D.docFromIdea(D.byId("stimme-verzerren"), D.sanitizeProfile({}), "de");
  const doc = Object.assign({}, base, { fx: "alien", tp: "slow", x: "Hallo Oma", pcm: [1, 2, 3], raw: "x", audio: "data:audio/wav;base64,UklGRg" });
  const back = D.parseRoute(D.docUrl(doc).replace(/^[^#]*/, "")).doc;
  assert.equal(back.fx, "alien"); assert.equal(back.tp, "slow"); assert.equal(back.x, "Hallo Oma");
  assert.deepEqual(Object.keys(back).sort(), ["bpm", "by", "col", "fx", "i", "k", "m", "p", "tp", "x"], "kein Ton im Link");
  assert.equal(D.sanitizeDoc(Object.assign({}, base, { tp: "warp" })).tp, undefined, "unbekanntes Tempo faellt weg");
  assert.equal(D.sanitizeDoc(Object.assign({}, base, { fx: "laser" })).fx, "chip", "unbekannter Effekt: Hamster wie bisher");
  assert.deepEqual(D.changedAreas(base, Object.assign({}, base, { tp: "fast" })), ["stimme"]);
  assert.ok(!("tp" in base), "ohne Tempo kein Schluessel: alte Links bleiben bitgleich");
});

test("Teil klang: Aufnahme nur nach einem Tipp, Hinweise in einfacher Sprache, Teilen nur ueber Teilen-Menue oder Download", () => {
  const ui = src("klang-ui.js"), T = require("../src/texts.json");
  // getUserMedia only inside record(), and record() only from a click (the record button) or the explicit answer tap (ed.rec)
  assert.equal((ui.match(/getUserMedia\(/g) || []).length, 1);
  const calls = ui.match(/record\(rb, ed, redo\)/g) || [];
  assert.equal(calls.length, 2, "der Aufnahmeknopf und der eine Tipp „Antworte mit deiner Stimme“");
  // the answer starts the take only when the microphone is already allowed; otherwise the explanation comes first
  assert.match(ui, /if \(yes\) record\(rb, ed, redo\); else \{ mic\.classList\.add\("first"\)/);
  assert.match(ui, /navigator\.permissions\.query\(\{ name: "microphone" \}\)\.then\(function \(s\) \{ return s\.state === "granted"; \}, function \(\) \{ return false; \}\)/);
  assert.match(src("app.js"), /rec: go && voiceGot\(\)/, "ed.rec nur nach dem Hauptknopf einer empfangenen Stimme");
  assert.match(src("app.js"), /\$\("go"\)\.addEventListener\("click", function \(\) \{ start\(null, true\); \}\)/, "nur #go, nicht der Tipp aufs Blatt");
  assert.equal((src("app.js").match(/start\(null, true\)/g) || []).length, 1);
  // the video has a time limit: sound length + 5 s, then stop, drop, and a new try is possible
  assert.match(ui, /var LIMIT = 5;/); assert.match(ui, /end\(no, new Error\("timeout"\)\); \}, \(len \+ LIMIT\) \* 1000\)/);
  // nothing of the voice goes to a server: no fetch, no beacon, no short link, no upload in the part
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|ShortLink|FormData/.test(ui + src("klang.js")));
  assert.match(ui, /navigator\.share\(\{ files: \[file\], text: text \}\)/); assert.match(ui, /await Kit\.saveFile\(blob, name\)/);
  for (const l of ["de", "en"]) for (const k of ["kl_mic", "kl_others", "kl_note", "kl_warn", "kl_mark", "answerVoice", "fx_rev", "fx_alien", "fx_tel", "fx_chor", "kl_tp_slow", "kl_tp_fast"]) assert.ok(T[l][k], l + " " + k);
  assert.equal(T.de.kl_note, "Die Aufnahme speichern wir nicht. Sie geht direkt von deinem Gerät in den Chat.");
  assert.equal(T.de.kl_warn, "Verzerrt heißt nicht anonym, und ein Video kann weitergeleitet werden.");
  assert.ok(T.de.answerVoice.length <= 10 && T.en.answerVoice.length <= 10, "der Antwortknopf bleibt einzeilig");
  assert.equal(T.de.kl_others, "Nimm nur dich selbst auf, oder frag vorher.");
  assert.equal(T.de.kl_mark, "Stimme verzerrt");
  for (const l of ["de", "en"]) for (const k of ["kl_mic", "kl_others", "kl_note", "kl_warn"]) {
    const words = T[l][k].split(/[\s.,!?]+/).filter(Boolean);
    assert.ok(words.every((w) => w.length <= 14), l + " " + k + ": kurze Woerter"); assert.ok(T[l][k].split(/[.!?]/).filter((x) => x.trim()).every((x) => x.trim().split(/\s+/).length <= 14), l + " " + k + ": kurze Saetze");
  }
});
