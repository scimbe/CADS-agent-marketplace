"use strict";
// A7a (Bauplan freie Karte): Spur (src/spur.js), tap buffer and tempo k in the engine, ev/k/spur in core.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { record, CASES, C, E, S } = require("./fixtures/spur-golden.js");

const u8 = (a) => Uint8Array.from(a);
const stOf = (c) => C.sanitizeState({ v: 1, ...c.st });

test("Spur: Kodierung - Tap kurz (gap*2), sonst gap*16+d*2+1, Ende d=0, Varint LEB128", () => {
  // tap at 0, tap at 40, hold on at 50, hold off + tap at 60, end at 70
  const b = S.encode([[0, 1], [40, 1], [50, 2], [60, 3]], 70);
  // 0*2 | 40*2 | 10*16+2*2+1 = 165 (2 Byte) | 10*16+3*2+1 = 167 | Ende 10*16+0+1 = 161
  assert.deepEqual([...b], [0, 80, 165, 1, 167, 1, 161, 1]);
  assert.deepEqual(S.parse(b), { ev: [[0, 1], [40, 1], [50, 2], [60, 3]], end: 70 });
  assert.deepEqual([...S.encode([[63, 1]], null)], [126], "Tap nach 63 Ticks: ein Byte");
  assert.deepEqual([...S.encode([[64, 1]], null)], [128, 1], "ab 64 Ticks: zwei Byte");
  assert.deepEqual([...S.sanitize(b)], [...b], "kanonisch bleibt gleich");
  const p = S.player(b), w = [];
  for (let t = 0; t <= 70; t++) w.push(p.at(t));
  assert.equal(w[0], 1); assert.equal(w[1], 0); assert.equal(w[40], 1); assert.equal(w[49], 0);
  assert.equal(w[50], 2, "Halten an"); assert.equal(w[59], 2, "Halten haelt"); assert.equal(w[60], 1, "Halten aus + Tap"); assert.equal(w[61], 0);
  assert.equal(p.end, 70);
});

test("Spur: sanitize verwirft, was die Grenzen bricht (Ticks <= 90 s x 120, Varint <= 4 Byte, Summe <= Tick-Maximum, Bytes)", () => {
  assert.equal(S.TMAX, 90 * 120);
  assert.equal(S.sanitize(u8([0x80, 0x80, 0x80, 0x80, 0x01])), null, "Varint mit 5 Byte");
  assert.equal(S.sanitize(u8([0x80])), null, "abgeschnittenes Varint");
  assert.equal(S.sanitize(S.encode([[S.TMAX + 1, 1]], null)), null, "Tap nach Tick-Maximum");
  assert.notEqual(S.sanitize(S.encode([[S.TMAX, 1]], S.TMAX)), null, "genau am Tick-Maximum geht");
  assert.equal(S.sanitize(S.encode([[0, 1], [S.TMAX, 1]], S.TMAX + 1)), null, "Ende hinter dem Maximum");
  // many gaps that each are fine, together too long
  const many = []; for (let i = 1; i <= 200; i++) many.push([i * 60, 1]);
  assert.equal(S.sanitize(S.encode(many, null)), null, "Summe der Laeufe 12 000 > 10 800");
  assert.equal(S.sanitize(u8([1 + 0, 0])), null, "Eintrag nach der Endmarke");
  assert.equal(S.sanitize(u8([0, 0])), null, "zwei Eintraege auf einem Tick");
  assert.equal(S.sanitize(u8([16 * 5 + 2 + 1])), null, "ein einzelner Tap in der langen Form ist nicht die eine Kodierung");
  assert.equal(S.sanitize(new Uint8Array(S.MAX_BYTES + 1).fill(2)), null, "ueber MAX_BYTES");
  assert.equal(S.sanitize(new Uint8Array(0)), null, "leer");
  for (const x of [null, undefined, "AAAA", [0, 2], { length: 3 }, 7]) assert.equal(S.sanitize(x), null, "kein Uint8Array: " + String(x));
  // over-long but in-range varint (0x80 0x00 = 0) is re-encoded to its one form
  assert.deepEqual([...S.sanitize(u8([0x80, 0x00, 2]))], [0, 2]);
});

test("Spur: Aufnahme fasst Eingaben auf einem Tick zusammen und endet ehrlich an MAX_BYTES", () => {
  const r = S.recorder();
  r.put(0, 1); r.put(0, 1); r.put(5, 2); r.put(5, 3); r.put(3, 1); r.put(9, 0); r.end(12);
  assert.deepEqual(S.parse(r.bytes()), { ev: [[0, 1], [5, 3], [9, 2]], end: 12 }, "doppelter Tap = einer, Halten+Tap auf Tick 5, zurueck in der Zeit verworfen");
  const r2 = S.recorder(); r2.put(4, 2); r2.put(4, 0); r2.end(8);
  assert.deepEqual(S.parse(r2.bytes()), { ev: [], end: 8 }, "an und aus auf einem Tick hebt sich auf");
  const big = S.recorder(); let t = 0;
  for (let i = 0; i < 2000; i++) { t += 64; big.put(t, 1); }     // 2-byte taps, the cap comes before 90 s
  big.end(S.TMAX);
  const b = big.bytes(), p = S.parse(b);
  assert.ok(b.length <= S.MAX_BYTES, "gekappt: " + b.length);
  assert.ok(p && p.end < S.TMAX && p.end === p.ev[p.ev.length - 1][0] + 64, "endet beim ersten Tap, der nicht mehr passt: " + (p && p.end));
});

test("Golden-Replay: Hash(Seed, Spur) ergibt eingefrorene Punkte und Bahn; die aufgenommene Spur erreicht beim Abspielen denselben Score", () => {
  for (const c of CASES) {
    const st = stOf(c), r = record(st, c.frac), p = S.fly(E, C, st, r.bytes);
    assert.deepEqual({ score: p.score, ticks: p.ticks }, { score: r.score, ticks: r.ticks }, c.name + ": Abspielen = Aufnahme");
    assert.deepEqual({ score: p.score, ticks: p.ticks, hash: p.hash, len: r.bytes.length }, c.want, c.name + ": eingefroren");
    // through the link and back: the same bytes, the same run
    const back = C.decodeState(C.encodeState({ ...st, ev: E.EV, spur: r.bytes }));
    assert.deepEqual([...back.spur], [...r.bytes], c.name + ": Spur ueberlebt den Link");
    assert.equal(back.ev, 1); assert.equal(back.k, st.k);
    assert.deepEqual(S.fly(E, C, back), p, c.name + ": aus dem Link gleich");
  }
});

test("Engine: Tap-Puffer und alte Docs ohne ev/k - dieselben Punkte und dieselbe Bahn wie vor A7a", () => {
  // [score, ticks, FNV over round(y*1000)] of the game.js bot per preset, measured with engine.js before A7a (main a26e332)
  const BEFORE = [[49, 10800, 3455308725], [17, 2383, 3386471246], [60, 10800, 1769463850], [53, 10800, 2325004423], [64, 10300, 3169787077], [0, 153, 3022656078], [56, 10800, 1151320111], [33, 3727, 1597446504]];
  const now = C.PRESETS.map((pr) => {
    const st = C.presetState(pr, "de"), sim = E.createSim(st.params, C.mulberry32(st.seed), C.routeParams(st));
    let h = 0x811c9dc5; sim.flap();
    for (let t = 0; t < 10800 && sim.state !== "over"; t++) {
      const nx = sim.pipes.find((p) => p.x + E.PIPE_W >= E.BX - E.R), mid = nx ? nx.top + nx.gap * 0.62 : E.H * 0.45;
      if (sim.bird.y > mid && sim.bird.vy > 0) sim.flap();
      sim.step(); h = Math.imul(h ^ Math.round(sim.bird.y * 1000), 16777619) >>> 0;
    }
    return [sim.score, sim.ticks, h];
  });
  assert.deepEqual(now, BEFORE);
  // the tap waits for the step: before it the bird is untouched, the step applies it
  const sim = E.createSim(C.PRESETS[0].params, C.mulberry32(1));
  sim.flap(); sim.step(); const vy = sim.bird.vy;
  sim.flap(); assert.equal(sim.bird.vy, vy, "Tap wirkt erst am Tick"); sim.step();
  assert.equal(sim.bird.vy, -sim.params.jump + sim.params.gravity * E.STEP);
});

test("Tempo k: Zeitdehnung speed*k, gravity*k^2, jump*k - gleiche Geometrie, loesbar fuer jedes k", () => {
  const st = C.presetState(C.PRESETS[0], "de");
  for (const k of [0.5, 0.75, 1]) {
    const sim = E.createSim(st.params, C.mulberry32(st.seed), null, k);
    assert.deepEqual(sim.params, { gravity: st.params.gravity * k * k, jump: st.params.jump * k, gap: st.params.gap, speed: st.params.speed * k });
    const hk = (sim.params.jump ** 2) / (2 * sim.params.gravity), h1 = (st.params.jump ** 2) / (2 * st.params.gravity);
    assert.ok(Math.abs(hk - h1) < 1e-9, "Sprunghoehe gleich bei k=" + k);
  }
  // same track (seeded gaps) at every k, and the bot flies 90 s at every k on the calm presets
  for (const id of ["chill", "night", "candy", "ocean"]) {
    for (const k of [0.5, 0.75, 1]) {
      const r = record(C.sanitizeState({ v: 1, ...C.presetState(C.PRESETS.find((p) => p.id === id), "de"), k }), 0.62);
      assert.equal(r.ticks, S.TMAX, id + " k=" + k + " loesbar");
    }
  }
  assert.equal(C.sanitizeState({ v: 1, seed: 1, k: 0.6 }).k, undefined, "nur 0.5/0.75 (1 = ohne)");
  assert.equal(C.sanitizeState({ v: 1, seed: 1, k: 1 }).k, undefined);
  assert.equal(C.sanitizeState({ v: 1, seed: 1, k: "0.5" }).k, undefined);
  assert.equal(C.sanitizeState({ v: 1, seed: 1, ev: 1.5 }).ev, undefined);
  assert.equal(C.sanitizeState({ v: 1, seed: 1, ev: "1" }).ev, undefined);
  assert.equal(C.sanitizeState({ v: 1, seed: 1, ev: 2 }).ev, 2, "neuere Version bleibt sichtbar (ehrliche Meldung in A7b)");
});

test("core: Spur reist als Bytes nach einer 0 im selben Base64; JSON-Spur zaehlt nie; alte Links bleiben Byte fuer Byte", () => {
  const st = C.presetState(C.PRESETS[2], "de");
  const old = Buffer.from(JSON.stringify(C.sanitizeState(st))).toString("base64url");
  assert.equal(C.encodeState(st), old, "ohne ev/k/spur genau wie vorher");
  const sp = S.encode([[0, 1], [30, 1]], 50), enc = C.encodeState({ ...st, ev: 1, k: 0.5, spur: sp });
  const raw = Buffer.from(enc, "base64url"), z = raw.indexOf(0);
  assert.deepEqual([...raw.subarray(z + 1)], [...sp], "Bytes direkt, kein Base64 im Base64");
  assert.ok(!/spur/.test(raw.subarray(0, z).toString()), "nicht im JSON");
  const j = JSON.parse(raw.subarray(0, z).toString()); assert.equal(j.ev, 1); assert.equal(j.k, 0.5);
  const viaJson = Buffer.from(JSON.stringify({ ...C.sanitizeState(st), spur: [0, 60] })).toString("base64url");
  assert.equal(C.decodeState(viaJson).spur, undefined, "Spur im JSON-Text wird ignoriert");
  const bad = Buffer.concat([Buffer.from(JSON.stringify(C.sanitizeState(st))), Buffer.from([0, 0x80, 0x80, 0x80, 0x80, 1])]).toString("base64url");
  const d = C.decodeState(bad);
  assert.ok(d && d.spur === undefined && d.seed === st.seed, "kaputte Spur faellt weg, der Rest bleibt");
  assert.equal(C.sanitizeState({ ...st, spur: [0, 2] }).spur, undefined, "nur Uint8Array");
});

test("Fuzz: 10 000 zufaellige und praeparierte Spuren je < 5 ms durch sanitize, keine Exception, Speicher < 1 MB", () => {
  require("node:v8").setFlagsFromString("--expose-gc");
  const gc = require("node:vm").runInNewContext("gc");
  let seed = 0x5eed;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  const valid = CASES.map((c) => record(stOf(c), c.frac).bytes);
  const make = (i) => {
    const kind = i % 6;
    if (kind === 0) return Uint8Array.from({ length: Math.floor(rnd() * (S.MAX_BYTES + 40)) }, () => Math.floor(rnd() * 256));
    if (kind === 1) { const b = Uint8Array.from(valid[i % valid.length]); for (let f = 0; f < 3; f++) b[Math.floor(rnd() * b.length)] ^= 1 << Math.floor(rnd() * 8); return b; }
    if (kind === 2) return new Uint8Array(Math.floor(rnd() * (S.MAX_BYTES + 10))).fill(0x80 | Math.floor(rnd() * 128));  // never ending varints
    if (kind === 3) return Uint8Array.from({ length: S.MAX_BYTES }, () => 0xff);                                            // max continuation
    if (kind === 4) { const b = valid[i % valid.length]; return b.subarray(0, Math.floor(rnd() * b.length)); }               // cut off
    return Uint8Array.from({ length: S.MAX_BYTES }, (_, j) => (j % 4 === 3 ? 0x7f : 0xff));                                  // 4-byte varints, huge gaps
  };
  gc(); const before = process.memoryUsage().heapUsed;
  // Each Spur is timed three times and counts with its fastest run: a GC pause or the scheduler of a busy machine hitting
  // one call says nothing about the Spur; a Spur that is slow in itself is slow all three times.
  let worst = 0, raw = 0, kept = 0;
  for (let i = 0; i < 10000; i++) {
    const b = make(i);
    let r, best = Infinity;
    for (let n = 0; n < 3; n++) {
      const t0 = process.hrtime.bigint();
      try { r = S.sanitize(b); } catch (e) { assert.fail("Exception bei Spur " + i + ": " + e); }
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      best = Math.min(best, ms); raw = Math.max(raw, ms);
    }
    worst = Math.max(worst, best);
    if (r) { kept++; assert.ok(r.length <= S.MAX_BYTES); assert.deepEqual([...S.sanitize(r)], [...r], "idempotent"); }
  }
  gc(); const grow = process.memoryUsage().heapUsed - before;
  console.log("Fuzz: 10000 Spuren, langsamste " + worst.toFixed(3) + " ms (Einzelmessung max " + raw.toFixed(3) + " ms), behalten " + kept + ", Heap-Wachstum " + grow + " B");
  assert.ok(worst < 5, "langsamste " + worst + " ms");
  assert.ok(grow < 1024 * 1024, "Heap +" + grow + " B");
});

test("grep: Simulationskern ohne Math.random, sin oder pow (Zufall nur aus dem Seed, bitgleich in jeder Engine)", () => {
  for (const f of ["engine.js", "spur.js"]) {
    const src = fs.readFileSync(path.join(__dirname, "../src", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(!/Math\.(random|sin|cos|pow|exp)\b|\*\*/.test(src), f);
  }
});
