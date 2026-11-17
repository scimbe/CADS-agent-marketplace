// Abnahme eines Spielmoduls durch generische Bots (harte Gates nach 08-forschung/spiel-baukasten.md G1–G3 und
// harness-bewertung.md: ausfuehrbare Pruefungen vor jedem Urteil). Rein: Uhr (now) und Fortschritt kommen von aussen,
// damit dieselbe Pruefung in Node (Unit-Test) und im Sandbox-Worker (Bot-Runner) laeuft.
// Netzversuche kann nur der Browser sehen; der Runner traegt sie als checks.noNetwork nach (finish()).
import { createGame, checkModule, API_VERSION, HZ, LIMITS } from "./api.js";
import { BOTS, GREEDY, makeBot, actions, press } from "./bots.js";
import { runSzenario, SZ_MAX_STEPS } from "./szenario.js";

/** Schwellen (Startwerte, eigene Setzung; Kalibrierung gegen menschliches Urteil steht aus). */
export const THRESHOLDS = Object.freeze({ p95Ms: 4, probeFrames: 45, probeStarts: [0, 30, 90, 240], detFrames: 900, restartWarmup: 200 });

const p95 = (xs) => { if (!xs.length) return 0; const a = xs.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * 0.95))]; };
const round3 = (x) => Math.round(x * 1000) / 1000;
/** Pruefphasen in Reihenfolge; jede meldet Fortschritt je Spielschritt (der Rahmen haelt je Phase ein eigenes Fenster). */
export const PHASES = Object.freeze(["bots", "eingaben", "determinismus", "neustart", "szenarien"]);
const RESTART_TAIL = 30;

/**
 * Obergrenze der Spielschritte (game.step) einer Pruefung je Phase. Grundlage der Gesamtfrist im Rahmen und im Host
 * (spiel/fristen.js): eine Frist, die mit der Arbeit waechst, nicht mit jedem Fortschritt neu beginnt.
 * @param {number} seconds  simulierte Sekunden je Bot
 * @param {number} controls Anzahl deklarierter Steuerungen (1..5)
 */
export function workSteps(seconds, controls) {
  const frames = seconds * HZ, acts = 1 + 2 * (controls - 1) + 1; // Obergrenze von actions(): nichts, je Richtung, Feuer, je Richtung + Feuer
  const greedy = frames + Math.ceil(frames / GREEDY.decide) * acts * GREEDY.horizon;
  return {
    bots: 2 * frames + greedy,
    eingaben: Math.max(...THRESHOLDS.probeStarts) + controls * THRESHOLDS.probeStarts.length * 2 * THRESHOLDS.probeFrames,
    determinismus: 2 * THRESHOLDS.detFrames,
    neustart: THRESHOLDS.restartWarmup + RESTART_TAIL,
    szenarien: SZ_MAX_STEPS   // Obergrenze, unabhaengig von der Zahl der Szenarien (die Frist waechst nicht mit dem Auftrag)
  };
}
const fresh = (st, meta, round) => st.frame === 0 && st.score === 0 && st.lives === meta.lives && st.level === 1 && !st.over && !st.won && st.round === round;

function runBot(mod, kind, o, ctx) {
  const game = createGame(mod, { seed: o.seed }), bot = makeBot(kind, game, o.seed + "|" + kind), meta = game.meta;
  const frames = o.seconds * HZ, times = [], games = [];
  let maxOps = 0, continuous = true, restartOk = true, broken = null, maxLevel = 1;
  ctx.where = kind;
  for (let t = 0; t < frames; t++) {
    const before = game.status(), input = bot.next(t);
    const t0 = o.now();
    game.step(input);
    const ops = game.draw();
    times.push(o.now() - t0);
    const after = game.status();
    if (ops.length > maxOps) maxOps = ops.length;
    if (after.level > maxLevel) maxLevel = after.level;
    const want = before.over ? before.frame : before.frame + 1;
    if (after.frame !== want || after.ticks !== before.ticks + 1) { continuous = false; broken = broken || { frame: t, want, got: after.frame }; }
    if (after.over) {
      games.push({ score: after.score, level: after.level, frames: after.frame, won: after.won });
      game.restart();
      if (!fresh(game.status(), meta, after.round + 1)) { restartOk = false; broken = broken || { frame: t, restart: game.status() }; }
    }
    ctx.tick();
  }
  const last = game.status();
  const all = games.concat(last.frame > 0 ? [{ score: last.score, level: last.level, frames: last.frame, won: false, open: true }] : []);
  return {
    frames, games: games.length, overs: games.length, wins: games.filter((x) => x.won).length,
    bestScore: Math.max(0, ...all.map((x) => x.score)), maxLevel, maxOps,
    p95Ms: round3(p95(times)), maxMs: round3(Math.max(0, ...times)), continuous, restartOk, broken, times
  };
}

/** Wirkt jede deklarierte Steuerung? Je Startpunkt: nichts tun vs. Steuerung halten, Hash vergleichen. */
function probeInputs(mod, o, ctx) {
  const out = {};
  const base = createGame(mod, { seed: o.seed }), warm = makeBot("random", base, o.seed + "|probe");
  const starts = [];
  let t = 0;
  for (const at of THRESHOLDS.probeStarts) {
    while (t < at && !base.status().over) { base.step(warm.next(t)); t++; ctx.tick(); }
    if (base.status().over) break;
    starts.push(base.snapshot());
  }
  for (const c of base.meta.controls) {
    const a = c === "fire" ? { dirs: [], fire: true } : { dirs: [c], fire: false };
    let effect = false;
    for (const snap of starts) {
      base.restore(snap);
      for (let k = 0; k < THRESHOLDS.probeFrames; k++) { base.step({}); ctx.tick(); }
      const idle = base.hash();
      base.restore(snap);
      for (let k = 0; k < THRESHOLDS.probeFrames; k++) { base.step(press(a, k)); ctx.tick(); }
      if (base.hash() !== idle) { effect = true; break; }
    }
    out[c] = effect;
  }
  return out;
}

/** Gleicher Seed + gleiche Bot-Eingaben => gleicher Hash (zwei frische Laeufe). Faengt auch Zustand ausserhalb von s. */
function determinism(mod, o, ctx) {
  const run = () => {
    const g = createGame(mod, { seed: o.seed }), b = makeBot("random", g, o.seed + "|det");
    for (let t = 0; t < THRESHOLDS.detFrames; t++) { g.step(b.next(t)); ctx.tick(); if (g.status().over) g.restart(); }
    return g.hash();
  };
  const a = run(), b = run();
  return { ok: a === b, a, b };
}

/** Neustart = frischer Start der naechsten Runde (Stand zurueckgesetzt, Zustand gleich einem neuen Spiel dieser Runde). */
function restartProbe(mod, o, ctx) {
  const g = createGame(mod, { seed: o.seed }), b = makeBot("random", g, o.seed + "|neu");
  for (let t = 0; t < THRESHOLDS.restartWarmup && !g.status().over; t++) { g.step(b.next(t)); ctx.tick(); }
  const round = g.status().round + 1;
  g.restart();
  const st0 = g.status();
  const ref = createGame(mod, { seed: o.seed, round });
  const sameStart = g.hash() === ref.hash();
  for (let k = 0; k < RESTART_TAIL; k++) { g.step({}); ref.step({}); ctx.tick(); }
  return { ok: fresh(st0, g.meta, round) && sameStart && g.hash() === ref.hash(), sameStart };
}

/**
 * Spielt ein Modul mit allen Bots und prueft die Invarianten.
 * @param {object} mod  Spielmodul
 * @param {{seed:string, seconds:number, now:() => number, onProgress?:(done:number,total:number,phase:string)=>void, name?:string, szenarien?:object[]}} o
 *   szenarien: geprueft mit checkSzenarien (protokoll.js); sie laufen nach den Invarianten und entscheiden nicht ueber ok,
 *   sondern je Haekchen-Punkt (report.szenarien, Abnahme in bau/abnahme.mjs)
 * @returns {object} Bericht (JSON-faehig)
 */
export function playtest(mod, o) {
  const opt = { ...o, onProgress: o.onProgress || (() => {}) };
  const szenarien = o.szenarien || [];
  const report = { api: API_VERSION, name: o.name || null, title: null, controls: null, seed: o.seed, seconds: o.seconds, ok: false, error: null, checks: {}, bots: {}, szenarien: [] };
  // Fortschritt in allen Phasen: je Bot-Frame (Greedy-Vorausspiel inklusive) und je Spielschritt in Eingaben,
  // Determinismus und Neustart. total = Obergrenze dieser Meldungen (Eingaben kann frueher enden).
  const ctx = { done: 0, total: 0, where: "modul", phase: "bots", tick() { ctx.done++; opt.onProgress(ctx.done, ctx.total, ctx.phase); } };
  try {
    const meta = checkModule(mod);
    report.title = meta.title; report.controls = meta.controls;
    const w = workSteps(o.seconds, meta.controls.length);
    ctx.total = BOTS.length * o.seconds * HZ + w.eingaben + w.determinismus + w.neustart + szenarien.reduce((a, sz) => a + sz.schritte.reduce((b, x) => b + x.frames, 0), 0);
    ctx.where = "init";
    createGame(mod, { seed: o.seed });
    const runs = {};
    for (const kind of BOTS) runs[kind] = runBot(mod, kind, opt, ctx);
    ctx.where = ctx.phase = "eingaben"; const inputs = probeInputs(mod, opt, ctx);
    ctx.where = ctx.phase = "determinismus"; const det = determinism(mod, opt, ctx);
    ctx.where = ctx.phase = "neustart"; const rs = restartProbe(mod, opt, ctx);
    ctx.where = ctx.phase = "szenarien";
    report.szenarien = szenarien.map((sz) => runSzenario(mod, sz, { seed: o.seed, tick: () => ctx.tick() }));
    const allTimes = BOTS.flatMap((k) => runs[k].times);
    for (const k of BOTS) { const { times, ...rest } = runs[k]; void times; report.bots[k] = rest; }
    const played = Math.max(runs.random.bestScore, runs.greedy.bestScore);
    const c = report.checks;
    c.noException = { ok: true };
    c.framesContinuous = { ok: BOTS.every((k) => runs[k].continuous), broken: BOTS.map((k) => runs[k].broken).find(Boolean) || null };
    // Spielende Bots holen Punkte und nicht weniger als Nichtstun. (Strenger "mehr als Nichtstun" scheitert an seltenen
    // Belohnungen: der Greedy-Horizont findet den Apfel der Schlange nicht immer; Eingabewirkung prueft inputsEffective.)
    c.scoreChanges = { ok: played > 0 && played >= runs.idle.bestScore, idle: runs.idle.bestScore, played };
    c.gameOverReachable = { ok: BOTS.some((k) => runs[k].overs > 0), overs: Object.fromEntries(BOTS.map((k) => [k, runs[k].overs])) };
    c.restartWorks = { ok: rs.ok && BOTS.every((k) => runs[k].restartOk), sameStart: rs.sameStart };
    c.inputsEffective = { ok: Object.values(inputs).every(Boolean), perControl: inputs };
    c.deterministic = { ok: det.ok, hash: det.a };
    c.performance = { ok: p95(allTimes) <= THRESHOLDS.p95Ms, p95Ms: round3(p95(allTimes)), maxMs: round3(Math.max(0, ...allTimes)), budgetMs: THRESHOLDS.p95Ms, maxOps: Math.max(...BOTS.map((k) => runs[k].maxOps)), opsLimit: LIMITS.ops };
  } catch (e) {
    report.error = { code: e && e.code ? e.code : "exception", message: String(e && e.message ? e.message : e).slice(0, 500), where: ctx.where, frame: ctx.done };
    report.checks.noException = { ok: false };
  }
  return finish(report);
}

/** ok neu berechnen (nach Nachtraegen wie noNetwork). */
export function finish(report) {
  const c = Object.values(report.checks);
  report.ok = !report.error && c.length > 0 && c.every((x) => x.ok === true);
  return report;
}
