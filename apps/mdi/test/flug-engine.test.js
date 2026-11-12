// Engine E2 Flug gegen das Alt-Orakel (test/fixtures/alt-e2, pre-legacy-removal): eingefrorene Golden-Werte aus
// alt test/spur.test.js und test/fixtures/spur-golden.js, dazu Tick-fuer-Tick-Vergleich mit dem alten Code.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import * as E from "../src/engines/flug/engine.js";
import * as S from "../src/engines/flug/spur.js";
import * as P from "../src/engines/flug/params.js";
import * as L from "../src/engines/flug/link.js";
import { mulberry32, hash32 } from "../src/engines/flug/rng.js";

const require = createRequire(import.meta.url);
const AC = require("./fixtures/alt-e2/core.cjs");
const AE = require("./fixtures/alt-e2/engine.cjs");
const AS = require("./fixtures/alt-e2/spur.cjs");
const G = require("./fixtures/alt-e2/spur-golden.cjs");

// Bot wie alt spur-golden.js record(), auf der NEUEN Engine
function record(st, frac) {
  const sim = E.createSim(st.params, mulberry32(st.seed), P.routeParams(st), st.k), r = S.recorder();
  r.put(sim.ticks, 1); sim.flap();
  while (sim.state === "run" && sim.ticks < S.TMAX) {
    if (E.demoWants(sim, frac)) { r.put(sim.ticks, 1); sim.flap(); }
    sim.step();
  }
  r.end(sim.ticks);
  return { bytes: r.bytes(), score: sim.score, ticks: sim.ticks };
}
const stOf = (c) => L.sanitize({ v: 1, ...c.st });

test("Golden-Replay (alt spur-golden): Seed + Spur ergeben die eingefrorenen Punkte, Ticks, float64-Bahnhash und Bytes", () => {
  assert.equal(G.CASES.length, 5);
  for (const c of G.CASES) {
    const st = stOf(c), r = record(st, c.frac), p = S.fly(st, r.bytes);
    assert.deepEqual({ score: p.score, ticks: p.ticks }, { score: r.score, ticks: r.ticks }, c.name + ": Abspielen = Aufnahme");
    assert.deepEqual({ score: p.score, ticks: p.ticks, hash: p.hash, len: r.bytes.length }, c.want, c.name + ": eingefroren");
    assert.deepEqual([...r.bytes], [...G.record(AC.sanitizeState({ v: 1, ...c.st }), c.frac).bytes], c.name + ": Spur-Bytes wie Altcode");
    const back = L.decodeState(L.encodeState({ ...st, ev: E.EV, spur: r.bytes }));
    assert.deepEqual([...back.spur], [...r.bytes], c.name + ": Spur ueberlebt den Link");
    assert.equal(back.ev, 1); assert.equal(back.k, st.k);
    assert.deepEqual(S.fly(back), p, c.name + ": aus dem Link gleich");
  }
});

test("Presets wie vor A7a (alt spur.test.js BEFORE): Punkte, Ticks, FNV ueber round(y*1000)", () => {
  const BEFORE = [[49, 10800, 3455308725], [17, 2383, 3386471246], [60, 10800, 1769463850], [53, 10800, 2325004423], [64, 10300, 3169787077], [0, 153, 3022656078], [56, 10800, 1151320111], [33, 3727, 1597446504]];
  const now = P.PRESETS.map((pr) => {
    const st = P.presetState(pr, "de"), sim = E.createSim(st.params, mulberry32(st.seed), P.routeParams(st));
    let h = 0x811c9dc5; sim.flap();
    for (let t = 0; t < 10800 && sim.state !== "over"; t++) {
      if (E.demoWants(sim)) sim.flap();
      sim.step(); h = Math.imul(h ^ Math.round(sim.bird.y * 1000), 16777619) >>> 0;
    }
    return [sim.score, sim.ticks, h];
  });
  assert.deepEqual(now, BEFORE);
  const sim = E.createSim(P.PRESETS[0].params, mulberry32(1));
  sim.flap(); sim.step(); const vy = sim.bird.vy;
  sim.flap(); assert.equal(sim.bird.vy, vy, "Tap wirkt erst am Tick"); sim.step();
  assert.equal(sim.bird.vy, -sim.params.jump + sim.params.gravity * E.STEP);
});

// Tick-fuer-Tick gegen die alte Engine: Vogel, Roehren, Abschnitt, Ereignisse, ueber Seeds, Physik, Route und Tempo
function trace(Eng, mk, st, taps) {
  const sim = Eng.createSim(st.params, mk(st.seed), st.rp, st.k), out = [];
  for (let t = 0; t < 4000 && sim.state !== "over"; t++) {
    if (taps(t, sim)) sim.flap();
    const ev = sim.step();
    out.push([sim.ticks, sim.bird.y, sim.bird.vy, sim.bird.rot, sim.score, sim.section, sim.pipes.map((p) => [p.x, p.top, p.gap]).flat().join("|"), ev.join("+")].join(","));
  }
  return out.join("\n");
}
test("Differenz gegen den Altcode: 120 Laeufe mit zufaelliger Physik, Route und Tempo sind Tick fuer Tick bitgleich", () => {
  const r = mulberry32(99);
  const steps = P.STEPS, th = P.THEME_NAMES;
  for (let n = 0; n < 120; n++) {
    const raw = { v: 1, seed: Math.floor(r() * 4294967295), params: { gravity: 800 + r() * 2000, jump: 250 + r() * 400, gap: 80 + r() * 140, speed: 80 + r() * 200 }, theme: th[n % 8], title: "x", emoji: "🐸" };
    if (n % 3 === 0) raw.route = [0, 1, 2].map((i) => ({ p: steps[(n + i) % 7], d: { gravity: Math.round(r() * 1600 - 800), gap: Math.round(r() * 120 - 60), speed: Math.round(r() * 160 - 80) }, t: th[(n + i) % 8], e: "⭐" }));
    if (n % 4 === 1) raw.k = 0.5; else if (n % 4 === 2) raw.k = 0.75;
    const a = L.sanitize(raw), b = AC.sanitizeState(raw);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), "sanitizeState " + n);
    const frac = 0.4 + (n % 5) * 0.08;
    const want = (t, sim) => { const nx = sim.pipes.find((p) => p.x + 52 >= 86 - 15), mid = nx ? nx.top + nx.gap * frac : 512 * 0.45; return t === 0 || (sim.bird.y > mid && sim.bird.vy > 0); };
    assert.equal(trace(E, mulberry32, { ...a, rp: P.routeParams(a) }, want), trace(AE, AC.mulberry32, { ...b, rp: AC.routeParams(b) }, want), "Lauf " + n);
  }
});

test("Engine: Untaetigkeit endet am Boden, anderer Seed = andere Strecke, Masse exportiert (alt engine.test.js)", () => {
  const st = P.presetState(P.PRESETS[0], "de"), sim = E.createSim(st.params, mulberry32(st.seed));
  sim.flap(); let dead = false;
  for (let i = 0; i < 2000 && !dead; i++) dead = sim.step().includes("dead");
  assert.ok(dead); assert.equal(sim.score, 0); assert.deepEqual(sim.flap(), []);
  const d = P.dailyConfig(new Date("2026-11-01T00:00:00Z"));
  const tops = (seed) => { const s = E.createSim(d.params, mulberry32(seed)); s.flap(); const t = []; for (let i = 0; i < 3000 && s.state !== "over"; i++) { if (E.demoWants(s)) s.flap(); s.step(); const nx = E.nextPipe(s); if (nx && !t.includes(nx.top)) t.push(nx.top); } return t; };
  assert.notDeepEqual(tops(d.seed), tops(d.seed + 1));
  for (const k of ["W", "H", "GROUND", "STEP", "PIPE_W", "R", "BX"]) assert.equal(typeof E[k], "number", k);
});

test("Tempo k: Zeitdehnung, gleiche Sprunghoehe, jedes ruhige Preset 90 s loesbar bei k = 0.5/0.75/1", () => {
  const st = P.presetState(P.PRESETS[0], "de");
  for (const k of [0.5, 0.75, 1]) {
    const sim = E.createSim(st.params, mulberry32(st.seed), null, k);
    assert.deepEqual(sim.params, { gravity: st.params.gravity * k * k, jump: st.params.jump * k, gap: st.params.gap, speed: st.params.speed * k });
  }
  for (const id of ["chill", "night", "candy", "ocean"]) for (const k of [0.5, 0.75, 1]) {
    const r = record(L.sanitize({ ...P.presetState(P.PRESETS.find((p) => p.id === id), "de"), k }), 0.62);
    assert.equal(r.ticks, S.TMAX, id + " k=" + k);
  }
  assert.equal(L.sanitize({ v: 1, seed: 1, k: 0.6 }).k, undefined);
  assert.equal(L.sanitize({ v: 1, seed: 1, ev: 2 }).ev, 2);
});

test("Spur: Kodierung, Grenzen, Aufnahme und Wiedergabe wie alt spur.test.js; 3000 Zufallsspuren gleich dem Altcode", () => {
  const b = S.encode([[0, 1], [40, 1], [50, 2], [60, 3]], 70);
  assert.deepEqual([...b], [0, 80, 165, 1, 167, 1, 161, 1]);
  assert.deepEqual(S.parse(b), { ev: [[0, 1], [40, 1], [50, 2], [60, 3]], end: 70 });
  assert.equal(S.sanitize(Uint8Array.from([0x80, 0x80, 0x80, 0x80, 0x01])), null);
  assert.equal(S.sanitize(Uint8Array.from([0, 0])), null);
  assert.equal(S.sanitize(new Uint8Array(S.MAX_BYTES + 1).fill(2)), null);
  for (const x of [null, undefined, "AAAA", [0, 2], 7]) assert.equal(S.sanitize(x), null);
  const r1 = S.recorder(); r1.put(0, 1); r1.put(0, 1); r1.put(5, 2); r1.put(5, 3); r1.put(3, 1); r1.put(9, 0); r1.end(12);
  assert.deepEqual(S.parse(r1.bytes()), { ev: [[0, 1], [5, 3], [9, 2]], end: 12 });
  const rnd = mulberry32(7);
  for (let i = 0; i < 3000; i++) {
    const u = Uint8Array.from({ length: Math.floor(rnd() * 60) }, () => Math.floor(rnd() * (i % 2 ? 256 : 128)));
    const a = S.sanitize(u), o = AS.sanitize(u);
    assert.deepEqual(a && [...a], o && [...o], "Spur " + i);
  }
});

test("Link: gleiche Bytes wie alt core.encodeState, alte Links lesen gleich, kaputte Spur faellt weg", () => {
  const st = P.presetState(P.PRESETS[2], "de"), sp = S.encode([[0, 1], [30, 1]], 50);
  assert.equal(L.encodeState(st), AC.encodeState(st));
  assert.equal(L.encodeState({ ...st, ev: 1, k: 0.5, spur: sp }), AC.encodeState({ ...st, ev: 1, k: 0.5, spur: AS.encode([[0, 1], [30, 1]], 50) }));
  const bad = Buffer.concat([Buffer.from(JSON.stringify(AC.sanitizeState(st))), Buffer.from([0, 0x80, 0x80, 0x80, 0x80, 1])]).toString("base64url");
  const d = L.decodeState(bad); assert.ok(d && d.spur === undefined && d.seed === st.seed);
  assert.equal(L.decodeState("!!"), null); assert.equal(L.decodeState("x".repeat(1300)), null);
  const f = L.challengeFragment({ ...st, name: "Mo" }, 12, sp);
  const back = L.parseHash("#" + f);
  assert.equal(back.score, 12); assert.equal(back.name, undefined, "kein Name im Link"); assert.deepEqual([...back.spur], [...sp]);
});

test("Parameter: sanitize*, Tagesrunde, Wortregeln und KI-Antwort gleich dem Altcode", () => {
  const r = mulberry32(5), pick = (a) => a[Math.floor(r() * a.length)];
  const junk = [undefined, null, "x", 3, -9999, 1e9, "#12345g", "#ABCDEF", "🐸", ["⭐", "x", "🍩", "🌈"], { a: 1 }, NaN, "stars", "emoji", "round"];
  for (let i = 0; i < 400; i++) {
    const look = {}; for (const k of ["a", "b", "p", "q", "g", "h", "d", "f", "e", "o", "m"]) if (r() < 0.6) look[k] = r() < 0.5 ? pick(junk) : (k === "d" ? pick(P.DECOS) : k === "f" ? pick(P.FORMS) : "#" + Math.floor(r() * 0xffffff).toString(16).padStart(6, "0"));
    assert.deepEqual(P.sanitizeLook(look), AC.sanitizeLook(look), "Look " + i);
    const anim = { art: pick(P.ANIM.concat(["x"])), tempo: r() * 3, staerke: r() * 1.4, bei: pick(P.ANIM_BEI.concat(["y"])) };
    assert.deepEqual(P.sanitizeAnim(anim), AC.sanitizeAnim(anim), "Anim " + i);
    const p = { gravity: pick(junk.concat([r() * 4000])), jump: String(r() * 800), pipeGap: r() * 300, speed: pick(junk) };
    assert.deepEqual(P.sanitizeParams(p), AC.sanitizeParams(p), "Params " + i);
  }
  for (const s of ["2026-01-01", "2026-11-12", "2027-02-28", "2030-12-31"]) for (const l of ["de", "en"]) assert.deepEqual(P.dailyConfig(new Date(s + "T10:00:00Z"), l), AC.dailyConfig(new Date(s + "T10:00:00Z"), l), s);
  const sentences = ["Schnelle Rakete im Weltall", "langsam unter Wasser mit Fischen", "super schwer, enge Lücken, Drache im Vulkan", "easy candy unicorn that spins fast", "Ein hüpfender Frosch beim Sprung", "keine Animation mehr", "Retro 8-bit Pixel Katze", "fuck", "", "Neon Party Alien wackelt langsam", "Mond schweben Feder Geist blinkt bei jedem Punkt"];
  for (const s of sentences) for (const l of ["de", "en"]) assert.deepEqual(P.localConfig(s, l), AC.localConfig(s, l), s);
  const api = { params: { gravity: 2000, flapPower: 500, pipeGap: 120, pipeSpeed: 170 }, theme: "ocean", title: "Tiefsee-Sturm", emoji: "🐠", abschnitte: [{ physik: "ruhig", thema: "ocean", emoji: "🐟", d: { gravity: -200 } }, { physik: "sturm", thema: "night", emoji: "⚡" }, { physik: "schnell", thema: "ocean", emoji: "🐳" }], anim: { art: "wippen" } };
  assert.deepEqual(P.stateFromApi(api, "Unter Wasser, dann Sturm"), AC.stateFromApi(api, "Unter Wasser, dann Sturm"));
  assert.equal(P.configKey(P.presetState(P.PRESETS[1], "de")), AC.configKey(AC.presetState(AC.PRESETS[1], "de")));
  assert.equal(hash32("duel-flug-agent"), AC.hash32("duel-flug-agent"));
});

test("Simulationskern ohne Math.random/sin/cos/pow/exp/** (Zufall nur aus dem Seed)", () => {
  for (const f of ["engine.js", "spur.js", "rng.js", "agent.js"]) {
    const src = fs.readFileSync(new URL("../src/engines/flug/" + f, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(!/Math\.(random|sin|cos|tan|atan2?|pow|exp|log\w*|hypot|cbrt)\b|\*\*|Date|performance/.test(src), f);
  }
});
