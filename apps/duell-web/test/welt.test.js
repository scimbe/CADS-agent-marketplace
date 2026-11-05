"use strict";
// Flight game MVP 1: the AI kind welt taken 1:1, a route of 3 sections in the game and in the challenge link.
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core.js");
const E = require("../src/engine.js");
const D = require("../src/daily.js");

// The option as the live server sent it for "Unter Wasser mit Haien, dann ein Sturm" (2026-11-05, kind welt).
const LIVE = { params: { gravity: 1800, flapPower: 430, pipeGap: 140, pipeSpeed: 130 }, theme: "day", title: "Hai-Abenteuer", emoji: "🐳",
  abschnitte: [{ physik: "schwebend", delta: { gravity: -400, flapPower: -40 }, thema: "day", emoji: "🐳" },
    { physik: "sturm", delta: { pipeSpeed: 30, pipeGap: -15 }, thema: "night", emoji: "⚡" },
    { physik: "schnell", delta: { pipeSpeed: 40 }, thema: "day", emoji: "🌊" }] };
const SATZ = "Unter Wasser mit Haien, dann ein Sturm";

// Bot that flaps below the middle of the next gap (each pipe has its own gap now).
function play(st, maxTicks) {
  const sim = E.createSim(st.params, C.mulberry32(st.seed), C.routeParams(st)), tops = [], sections = [];
  sim.flap();
  for (let t = 0; t < maxTicks && sim.state !== "over"; t++) {
    const next = sim.pipes.find((p) => p.x + sim.PIPE_W >= sim.BX - sim.R);
    if (next && !tops.includes(next.top)) tops.push(next.top);
    if (next && sim.bird.y > next.top + next.gap * 0.62 && sim.bird.vy > 0) sim.flap();
    if (sim.step().includes("section")) sections.push([sim.score, sim.section, sim.params]);
  }
  return { score: sim.score, tops, sections, gaps: sim.pipes.map((p) => p.gap) };
}

test("welt 1:1: Regeln, Welt, Figur, Titel und 3 Abschnitte genau wie geantwortet; Seed nur aus dem Satz", () => {
  const st = C.stateFromApi(LIVE, SATZ);
  assert.deepEqual(st.params, { gravity: 1800, jump: 430, gap: 140, speed: 130 });
  assert.equal(st.theme, "day"); assert.equal(st.title, "Hai-Abenteuer"); assert.equal(st.emoji, "🐳");
  assert.deepEqual(st.route, [
    { p: "schwebend", d: { gravity: -400, jump: -40 }, t: "day", e: "🐳" },
    { p: "sturm", d: { gap: -15, speed: 30 }, t: "night", e: "⚡" },
    { p: "schnell", d: { speed: 40 }, t: "day", e: "🌊" }]);
  assert.equal(st.look, undefined, "nichts dazugemischt");
  assert.equal(st.seed, C.stateFromApi(LIVE, SATZ).seed, "gleicher Satz, gleiche Strecke");
  assert.notEqual(st.seed, C.stateFromApi(LIVE, "Ein anderer Satz").seed);
});

test("Abschnitt i: Basis + delta, geklemmt auf RANGES; kaputte Strecken fallen weg", () => {
  const st = C.stateFromApi(LIVE, SATZ), ps = C.routeParams(st);
  assert.deepEqual(ps[0], { gravity: 1400, jump: 390, gap: 140, speed: 130 });
  assert.deepEqual(ps[1], { gravity: 1800, jump: 430, gap: 125, speed: 160 });
  assert.deepEqual(ps[2], { gravity: 1800, jump: 430, gap: 140, speed: 170 });
  const edge = C.sanitizeState({ v: 1, seed: 1, params: { gravity: 2500, jump: 600, gap: 95, speed: 250 }, route: [{ d: { gravity: 800, gap: -60, speed: 80 }, t: "day", e: "🔥" }, { d: { jump: 999 }, t: "night", e: "⚡" }, { d: {}, t: "retro", e: "👾" }] });
  const pe = C.routeParams(edge);
  assert.deepEqual(pe[0], { gravity: 2600, jump: 600, gap: 90, speed: 260 }, "auf RANGES geklemmt");
  assert.equal(edge.route[1].d.jump, 120, "delta selbst ist begrenzt");
  for (const bad of [[], [1, 2, 3], LIVE.abschnitte.slice(0, 2), LIVE.abschnitte.concat(LIVE.abschnitte[0]), [{ t: "lava?", e: "🐳" }, LIVE.abschnitte[1], LIVE.abschnitte[2]], [{ t: "day", e: "<b>" }, LIVE.abschnitte[1], LIVE.abschnitte[2]]])
    assert.equal(C.sanitizeState({ v: 1, seed: 1, params: {}, route: bad }).route, undefined, JSON.stringify(bad));
  assert.equal(C.sanitizeRoute([{ p: "rakete", t: "day", e: "🐳" }, LIVE.abschnitte[1], LIVE.abschnitte[2]])[0].p, "normal", "unbekannte Stufe heisst normal");
});

test("Engine: 5 Roehren je Abschnitt, Physik wechselt beim Durchfliegen, jede Roehre behaelt ihre Luecke; deterministisch", () => {
  const st = C.stateFromApi(LIVE, SATZ), ps = C.routeParams(st);
  const a = play(st, 40000), b = play(st, 40000);
  assert.deepEqual(a, b, "gleicher Link, gleicher Lauf");
  assert.ok(a.score >= 11, "Bot kommt in Abschnitt 3, hat " + a.score);
  assert.deepEqual(a.sections.map((x) => x.slice(0, 2)), [[5, 1], [10, 2]]);
  assert.deepEqual(a.sections[0][2], ps[1]); assert.deepEqual(a.sections[1][2], ps[2]);
  // without a route: exactly as before (same tops, same params)
  const plain = C.sanitizeState({ v: 1, seed: st.seed, params: st.params, theme: "day", title: "x", emoji: "🐳" });
  const s0 = E.createSim(plain.params, C.mulberry32(plain.seed));
  assert.equal(s0.sections, 1); assert.deepEqual(s0.params, plain.params); assert.equal(s0.pipes[0].gap, 140);
});

test("Gaps der Roehren: Abschnitt 1 hat 140, ab Roehre 6 der Sturm 125, ab Roehre 11 wieder 140", () => {
  const st = C.stateFromApi(LIVE, SATZ), sim = E.createSim(st.params, C.mulberry32(st.seed), C.routeParams(st)), seen = [];
  sim.flap();
  // fly through everything: keep the bird in the middle of the next gap (a test hand, not a bot)
  for (let i = 0; i < 60000 && seen.length < 12; i++) {
    const next = sim.pipes.find((p) => p.x + sim.PIPE_W >= sim.BX - sim.R);
    if (next) { sim.bird.y = next.top + next.gap / 2; sim.bird.vy = 0; }
    sim.step();
    sim.pipes.forEach((p) => { if (!p.seen) { p.seen = 1; seen.push(p.gap); } });
  }
  assert.deepEqual(seen.slice(0, 12), [140, 140, 140, 140, 140, 125, 125, 125, 125, 125, 140, 140]);
});

test("Challenge-Link: Freunde fliegen exakt dieselbe Welt und Strecke; KI-Siegel faehrt mit; Fragment unter dem Limit", () => {
  const ki = { k: "welt", s: "s2.welt.mw2y455c.AnlRQb9jJYrLILMRBtJj7yR1qlhJF0ER", h: "3tcKq21IwdMq89hVw0ASV5MnYO6RX-JkYugqLugtlsA" };
  const st = Object.assign(C.stateFromApi(LIVE, SATZ), { ki }), url = D.challengeUrl(st, 17);
  const back = C.parseHash(url.split("#")[1]);
  assert.equal(back.score, 17); delete back.score;
  assert.deepEqual(back, st);
  assert.deepEqual(play(back, 40000), play(st, 40000), "derselbe Lauf beim Freund");
  assert.ok(url.split("#c=")[1].length < C.MAX_FRAGMENT / 1.5, "Fragment " + url.length);
  assert.notEqual(C.configKey(st), C.configKey(Object.assign({}, st, { route: undefined })), "Bestwert je Strecke");
  assert.equal(C.configKey(C.dailyConfig(new Date("2026-11-01T00:00:00Z"))), C.configKey(Object.assign({}, C.dailyConfig(new Date("2026-11-01T00:00:00Z")))), "alte Bestwerte bleiben");
  assert.equal(C.sanitizeState(Object.assign({}, st, { ki: { k: "wish", s: ki.s } })).ki, undefined, "nur das welt-Siegel");
  assert.equal(C.sanitizeState(Object.assign({}, st, { ki: { k: "welt" } })).ki, undefined, "ohne Siegel kein KI-Zeichen");
});

test("Blatt: die Strecke bleibt im geteilten Blatt; Strecke zaehlt als Welt-Aenderung", () => {
  const st = C.stateFromApi(LIVE, SATZ), d = D.sanitizeDoc({ k: "game", col: ["#ffd400", "#ff3b1d"], by: [], g: st });
  assert.deepEqual(d.g.route, st.route);
  const plain = D.sanitizeDoc({ k: "game", col: ["#ffd400", "#ff3b1d"], by: [], g: Object.assign({}, st, { route: undefined }) });
  assert.ok(D.changedAreas(plain, d).includes("welt"));
  assert.deepEqual(D.parseRoute("#" + D.docUrl(d).split("#")[1]).doc.g.route, st.route);
});

test("Ohne KI: die Regel-Erkennung ist fest (kein Zufall), ohne Strecke", () => {
  const a = C.localConfig("Unter Wasser mit Fischen", "de"), b = C.localConfig("Unter Wasser mit Fischen", "de");
  assert.deepEqual(a, b); assert.equal(a.theme, "ocean"); assert.equal(a.route, undefined);
});
