// Strang B, Spiel-Baukasten: Sprache (spec/check), Interpreter (engine/zug), Bots, Pruefer und die beiden Karten.
// Goldwerte (test/fixtures/baukasten-gold.json) frieren Ablauf und Zahlen ein: gleicher Seed + gleiche Bot-Eingaben ->
// gleicher Zustandshash; eine Aenderung am Interpreter muss die Datei bewusst neu erzeugen (siehe unten, GOLD=1).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { stateHash, rng, canon } from "../src/contract/sdk.js";
import { schemaFull, schemaLlm, normalize, compact, SPEC, txt } from "../src/engines/baukasten/spec.js";
import { check, contrast, LIMITS, textsOf } from "../src/engines/baukasten/check.js";
import * as E from "../src/engines/baukasten/engine.js";
import * as Z from "../src/engines/baukasten/zug.js";
import { botInput, planOf, randomBot } from "../src/engines/baukasten/bot.js";
import { pruefe, feedback, SCHWELLEN } from "../src/engines/baukasten/pruefer.js";
import { BEISPIELE, FLAPPY, BREAKOUT, PONG, AUSWEICHEN, MEMORY, DREI, QUIZ, WORTSALAT, SNAKE } from "../src/engines/baukasten/beispiele.js";
import card from "../src/cards/baukasten/card.js";
import zug from "../src/cards/baukasten-zug/card.js";
import { createMatch, verifyGhost } from "../src/app/rt/match.js";
import { newSession, apply } from "../src/contract/session.js";

const clone = (x) => JSON.parse(JSON.stringify(x));
const GOLD_FILE = new URL("./fixtures/baukasten-gold.json", import.meta.url);

// ---- Sprache ------------------------------------------------------------------------------------------------------
test("Baukasten: alle Beispiele sind gueltig und drueckt die bestehenden Spielarten aus", () => {
  // Nachweis der Ausdrucksstaerke: Flug (Flappy), Ziegel (Breakout), Pong, Kick, Schlange (Snake), Reaktion, Ausweichen,
  // Lauf (Huepfer), Memory, Drei/Vier gewinnt, Wortspiele (Wortsalat, Quiz, Luecke)
  assert.deepEqual(Object.keys(BEISPIELE).sort(), ["ausweichen", "breakout", "drei", "flappy", "huepfer", "kick", "luecke", "memory", "pong", "quiz", "reaktion", "snake", "vier", "wortsalat"]);
  for (const [n, raw] of Object.entries(BEISPIELE)) { const c = check(raw); assert.ok(c.ok, n + ": " + c.errors.join("; ")); }
});

test("Baukasten: Kurzform und Normalform sind verlustfrei (normalize(compact(d)) = d)", () => {
  for (const [n, raw] of Object.entries(BEISPIELE)) {
    const d = check(raw).desc, k = compact(d), back = normalize(k);
    assert.deepEqual(back.errors, [], n);
    assert.deepEqual(back.desc, d, n);
    assert.ok(JSON.stringify(k).length < JSON.stringify(d).length, n + ": Kurzform kuerzer");
    assert.ok(JSON.stringify(k).length <= LIMITS.descBytes, n + ": passt in die Grenze");
  }
});

test("Baukasten: JSON Schema (voll) und check() urteilen gleich ueber Strukturvektoren", () => {
  const ajv = new Ajv2020({ strict: true, allErrors: false, unicodeRegExp: true });
  const valid = ajv.compile(schemaFull());
  const good = Object.values(BEISPIELE).map((b) => check(b).desc);
  for (const d of good) assert.ok(valid(d), ajv.errorsText(valid.errors));
  const bad = [
    { ...clone(FLAPPY), extra: 1 },                                           // unbekanntes Feld
    { ...clone(FLAPPY), players: 3 },                                         // Bereich
    { ...clone(FLAPPY), mode: "rundlauf" },                                   // Aufzaehlung
    { ...clone(FLAPPY), things: [{ ...FLAPPY.things[0], id: "Vogel!" }] },   // id-Muster
    { ...clone(FLAPPY), title: "" },                                          // Pflichttext leer
    { ...clone(FLAPPY), world: { ...FLAPPY.world, gravity: 1.5 } },           // keine Ganzzahl
    { ...clone(FLAPPY), rules: [{ when: "touch", a: "vogel", b: "rohr", do: [] }] }   // Regel ohne Wirkung
  ];
  for (const b of bad) {
    assert.equal(valid(b), false, "Ajv lehnt ab: " + JSON.stringify(b).slice(0, 60));
    assert.ok(normalize(b).errors.length > 0, "normalize lehnt ab: " + JSON.stringify(b).slice(0, 60));
  }
});

test("Baukasten: LLM-Schema passt zu Structured Outputs (flach, alles Pflicht, ohne Grenzen, Rekursion, Unions)", () => {
  for (const mode of ["realtime", "turn"]) {
    const s = schemaLlm(mode), banned = ["minimum", "maximum", "minLength", "maxLength", "pattern", "maxItems", "minItems", "anyOf", "oneOf", "$ref", "default"];
    let objects = 0, optional = 0;
    const walk = (n, path) => {
      for (const k of banned) assert.ok(!(k in n), path + ": " + k);
      if (n.type === "object") {
        objects++;
        assert.equal(n.additionalProperties, false, path);
        const keys = Object.keys(n.properties);
        optional += keys.filter((k) => !n.required.includes(k)).length;
        for (const k of keys) walk(n.properties[k], path + "." + k);
      }
      if (n.type === "array") walk(n.items, path + "[]");
    };
    walk(s, mode);
    assert.equal(optional, 0, "keine optionalen Felder (Grenze 24)");
    assert.ok(objects > 5);
    assert.ok(JSON.stringify(s).length < 12000, "Schema klein genug fuer den Cache-Praefix");
    assert.deepEqual(s.properties.mode.enum, [mode]);
  }
  assert.ok(!("turn" in schemaLlm("realtime").properties) && !("spawn" in schemaLlm("turn").properties));
});

test("Baukasten: Modellausgabe wird begrenzt statt abgelehnt (clamp) und meldet jede Begrenzung", () => {
  const raw = { ok: true, ...clone(FLAPPY), world: { ...FLAPPY.world, gravity: 99999 }, things: FLAPPY.things.map((t) => ({ ...t, w: 99999 })) };
  assert.equal(check(raw, { llm: true }).ok, false);
  const c = check(raw, { llm: true, clamp: true });
  assert.ok(c.desc.world.gravity === 6000 && c.notes.some((n) => /gravity/.test(n)), JSON.stringify(c.notes));
});

test("Baukasten: Texte werden bereinigt (Steuerzeichen, spitze Klammern, Laenge)", () => {
  assert.equal(txt("a\u0000b<script>c\u202e", 30), "a b script c");
  const d = check({ ...clone(FLAPPY), title: "  Hallo\n<b>Welt</b>  " }).desc;
  assert.equal(d.title, "Hallo b Welt /b");
  assert.ok(textsOf(d).includes("Hallo b Welt /b"));
});

test("Baukasten: check() nennt konkrete Gruende fuer Sinnfehler", () => {
  const why = (raw) => check(raw).errors.join(" | ");
  assert.match(why({ ...clone(FLAPPY), rules: [{ when: "touch", a: "vogel", b: "wolke", do: [{ act: "score" }] }] }), /b wolke ist kein Ding/);
  assert.match(why({ ...clone(FLAPPY), bg: "yellow", things: [FLAPPY.things[0], { ...FLAPPY.things[1], color: "white" }] }), /zu schwach/);
  assert.match(why({ ...clone(FLAPPY), start: [{ thing: "vogel", x: 300, y: 760 }] }), /Sitz 0 hat keine Steuerung/);
  assert.match(why({ ...clone(FLAPPY), end: {}, rules: FLAPPY.rules.filter((r) => r.when === "pass") }), /kein Ende/);
  assert.match(why({ ...clone(FLAPPY), world: { gravity: 2600 } }), /rechts ausserhalb der Wand/);
  assert.match(why({ ...clone(PONG), rules: [{ when: "out", a: "ball", b: "top", do: [{ act: "score", on: "a", n: 1 }] }] }), /erreicht keinen Sitz/);
  assert.match(why({ ...clone(SNAKE), things: [{ ...SNAKE.things[0], control: "lr" }, SNAKE.things[1]] }), /passt nicht zum Raster/);
  assert.match(why({ ...clone(FLAPPY), things: [{ ...FLAPPY.things[0], look: "emoji", emoji: "abc" }, FLAPPY.things[1]] }), /ohne gueltiges Emoji/);
  assert.match(why({ ...clone(MEMORY), turn: { ...MEMORY.turn, cols: 3 } }), /cols x rows muss/);
  assert.match(why({ ...clone(QUIZ), turn: { ...QUIZ.turn, items: QUIZ.turn.items.map((i) => ({ ...i, wrong: [i.a] })) } }), /gleich der richtigen/);
  assert.match(why({ ...clone(FLAPPY), start: [{ thing: "rohr", x: 10, y: 10, n: 120, cols: 10 }, { thing: "rohr", x: 10, y: 10, n: 60, cols: 10 }, ...FLAPPY.start] }), /zu viele Dinge/);
  assert.ok(contrast("ink", "paper") > 15 && contrast("yellow", "white") < 3);
});

// ---- Interpreter --------------------------------------------------------------------------------------------------
function runBots(d, seed, ticks, roles) {
  const plan = planOf(d);
  let st = E.init(d, seed, roles);
  const evs = [];
  for (let i = 0; i < ticks && !st.over; i++) {
    const r = E.step(d, st, [botInput(d, st, 0, 3, plan), botInput(d, st, 1, 2, plan)], (s, seat) => botInput(d, s, seat, 2, plan));
    st = r.state; if (r.ev.length) evs.push(st.t + ":" + r.ev.map((e) => e.k).join(","));
  }
  return { st, evs };
}

test("Baukasten: Zustand ist kanonisch (nur Ganzzahlen) und deterministisch", () => {
  for (const [n, raw] of Object.entries(BEISPIELE)) {
    const d = check(raw).desc;
    if (d.mode !== "realtime") continue;
    const roles = ["bot", d.players === 2 ? "bot" : "none"];
    const a = runBots(d, "det", 900, roles), b = runBots(d, "det", 900, roles);
    assert.doesNotThrow(() => canon(a.st), n + ": nur Ganzzahlen");
    assert.equal(stateHash(a.st), stateHash(b.st), n);
    assert.deepEqual(a.evs, b.evs, n);
    assert.notEqual(stateHash(runBots(d, "anders", 900, roles).st), stateHash(a.st), n + ": Seed wirkt");
  }
});

test("Baukasten: Goldwerte (Hash nach 600 Ticks, Endstand) sind eingefroren", () => {
  const now = {};
  for (const [n, raw] of Object.entries(BEISPIELE)) {
    const d = check(raw).desc;
    if (d.mode === "realtime") {
      const roles = ["bot", d.players === 2 ? "bot" : "none"];
      const mid = runBots(d, "gold", 600, roles).st, end = runBots(d, "gold", LIMITS.maxTicks, roles).st;
      now[n] = { h600: stateHash(mid), t: end.t, sc: end.sc, win: end.win };
    } else {
      let s = Z.init(d, "gold", d.players), k = 0;
      while (!s.pub.over && k++ < 400) s = Z.step(d, s, Z.botMove(d, s.pub, s.pub.tu, 3, "gold"));
      now[n] = { h: stateHash(s.pub), sc: s.pub.sc, win: s.pub.win, moves: s.pub.moves };
    }
  }
  const HERKUNFT = "Eigene Goldwerte des Baukasten-Interpreters (Strang B), erzeugt mit GOLD=1 node --test test/baukasten.test.js aus src/engines/baukasten/beispiele.js; keine Kopie aus dem Altcode";
  if (process.env.GOLD === "1") fs.writeFileSync(GOLD_FILE, JSON.stringify({ herkunft: HERKUNFT, ...now }, null, 1) + "\n");
  const { herkunft, ...gold } = JSON.parse(fs.readFileSync(GOLD_FILE, "utf8"));
  assert.equal(herkunft, HERKUNFT);
  assert.deepEqual(now, gold);
});

test("Baukasten: Tunnelschutz – kein Ding bewegt sich je Tick weiter als seine halbe kleinste Seite", () => {
  const d = check({ ...clone(PONG), things: [PONG.things[0], { ...PONG.things[1], vy: 3000, vx: 3000 }] }).desc;
  // Kern des Schutzes: vor jeder Bewegung wird auf die halbe kleinste Seite begrenzt
  const ball = check(PONG).desc.things[1];
  assert.ok(Math.min(ball.w, ball.h) * 128 < Math.trunc(3000 * 256 / 60), "Testfall uebersteigt die Grenze wirklich");
  const s0 = E.init(d, "t", ["bot", "bot"]), b0 = s0.e.find((e) => d.things[e.k].id === "ball");
  const one = E.step(d, s0, [{ b: 0 }, { b: 0 }]).state.e.find((e) => d.things[e.k].id === "ball");
  assert.ok(Math.abs(b0.vy) > Math.min(b0.hw, b0.hh), "Start schneller als erlaubt");
  assert.ok(Math.abs(one.y - b0.y) <= Math.min(one.hw, one.hh) && Math.abs(one.x - b0.x) <= Math.min(one.hw, one.hh), "Weg je Tick begrenzt");
});

test("Baukasten: Wettlauf – ein Solo-Spiel mit zwei Sitzen hat getrennte Bahnen, Erzeugtes ist geteilt", () => {
  const d = check(BREAKOUT).desc;
  const st = E.init(d, "race", ["human", "ghost"]);
  assert.equal(st.race, 1);
  const bricks = (ln) => st.e.filter((e) => d.things[e.k].id === "ziegel" && e.ln === ln).length;
  assert.equal(bricks(0), 24); assert.equal(bricks(1), 24);
  let s = st;
  for (let i = 0; i < 1500 && !s.over; i++) {
    s = E.step(d, s, [botInput(d, s, 0, 3), { b: 0 }]).state;
    // jede Bahn zaehlt nur ihre eigenen Ziegel: Stand = abgeraeumte Ziegel der eigenen Bahn
    for (const ln of [0, 1]) assert.equal(s.sc[ln], 24 - s.e.filter((e) => d.things[e.k].id === "ziegel" && e.ln === ln).length);
  }
  assert.notEqual(s.sc[0], s.sc[1], "Bahnen laufen unabhaengig");
  const f = check(FLAPPY).desc;
  let r = E.init(f, "race", ["human", "ghost"]);
  for (let i = 0; i < 200; i++) r = E.step(f, r, [{ b: 0 }, { b: 0 }]).state;
  assert.ok(r.e.filter((e) => e.k === 1).every((e) => e.ln === -1), "Roehren gehoeren beiden Bahnen");
});

test("Baukasten: Zeiger werden ueber die Buehnen-Abbildung exakt in Weltkoordinaten umgerechnet", () => {
  const d = check({ ...clone(REAKTION_SQUARE()) }).desc, f = E.fitOf(d);
  assert.deepEqual(f, { num: 1000, den: 1000, ox: 0, oy: 300 });
  assert.deepEqual(E.toWorld(d, f, 500, 800), [500, 500]);
});
function REAKTION_SQUARE() { return { ...clone(BEISPIELE.reaktion), world: { w: 1000, h: 1000 }, spawn: [{ ...BEISPIELE.reaktion.spawn[0], y: 500, yr: 300 }] }; }

test("Baukasten: Grenzen zur Laufzeit – hoechstens LIMITS.alive Dinge, Notbremse nach LIMITS.maxTicks", () => {
  const d = check({ ...clone(AUSWEICHEN), spawn: [{ thing: "stein", every: 100, x: 500, y: -40, xr: 400, max: 60 }, { thing: "stein", every: 100, x: 500, y: -40, xr: 400, max: 60 }, { thing: "stein", every: 100, x: 500, y: -40, xr: 400, max: 60 }, { thing: "stein", every: 100, x: 500, y: -40, xr: 400, max: 60 }], world: { ...AUSWEICHEN.world, gravity: 0 }, things: [AUSWEICHEN.things[0], { ...AUSWEICHEN.things[1], gravity: false }], end: { time: 0, lives: 3, win: "survive" }, rules: [{ when: "every", n: 1000, do: [{ act: "score", on: "all", n: 1 }] }] }).desc;
  let st = E.init(d, "lim", ["human", "none"]), maxAlive = 0;
  while (!st.over) { st = E.step(d, st, [{ b: 0 }]).state; maxAlive = Math.max(maxAlive, st.e.length); }
  assert.ok(maxAlive <= LIMITS.alive);
  assert.equal(st.t, LIMITS.maxTicks); assert.equal(st.cap, 1);
});

test("Baukasten: Zugspiele – Drei gewinnt erkennt Reihen, Memory endet immer, Antworten werten tolerant", () => {
  const d = check(DREI).desc;
  let s = Z.init(d, "z", 2);
  for (const [seat, i] of [[0, 0], [1, 3], [0, 1], [1, 4], [0, 2]]) s = Z.step(d, s, { t: "put", seat, i });
  assert.deepEqual([s.pub.over, s.pub.win], [1, 0]);
  assert.throws(() => Z.step(d, Z.init(d, "z", 2), { t: "put", seat: 1, i: 0 }), /nicht am Zug/);
  const m = check(MEMORY).desc;
  let t = Z.init(m, "mem", 2), n = 0;
  while (!t.pub.over) { const ms = Z.moves(m, t.pub, t.pub.tu); t = Z.step(m, t, ms[ms.length - 1]); n++; }
  assert.ok(n <= 2 * Z.TRIES_PER_PAIR * m.turn.pairs.length);
  const w = check(WORTSALAT).desc, ws = Z.init(w, "w", 2);
  const it = w.turn.items[ws.pub.order[0]];
  assert.ok(Z.correct(w, ws.pub, "  " + it.a.toUpperCase() + "! "));
  assert.notEqual(ws.pub.show[0].replace(/ /g, ""), it.a.toUpperCase().replace(/ /g, ""), "gemischt");
});

// ---- Bots und Pruefer -----------------------------------------------------------------------------------------------
test("Baukasten: Pruefer laesst alle Beispiele durch (Determinismus, endet, gewinnbar, nicht trivial, fair)", () => {
  for (const [n, raw] of Object.entries(BEISPIELE)) {
    const v = pruefe(raw, { games: 6 });
    assert.ok(v.ok, n + ": " + JSON.stringify(v.reasons) + " " + JSON.stringify(v.metrics));
    assert.ok(v.desc.mode === "turn" || v.metrics.determinismus, n);
  }
});

test("Baukasten: Pruefer lehnt kaputte Spiele mit Grund ab", () => {
  const codes = (raw) => pruefe(raw, { games: 6 }).reasons.map((r) => r.code);
  // zu enge Luecke: nicht gewinnbar
  assert.ok(codes({ ...clone(FLAPPY), spawn: [{ ...FLAPPY.spawn[0], gap: 140 }] }).includes("nicht-gewinnbar"));
  // keine Gefahr: Ueberleben ist geschenkt
  assert.ok(codes({ ...clone(AUSWEICHEN), rules: AUSWEICHEN.rules.filter((r) => r.when !== "touch") }).includes("trivial"));
  // Ziel unerreichbar und keine Zeit: endet erst an der Notbremse
  assert.ok(codes({ ...clone(PONG), end: { score: 999, win: "score" } }).includes("endet-nicht"));
  // Startplatz im Hindernis: sofort vorbei
  const kurz = { ...clone(BEISPIELE.huepfer), start: [{ thing: "fuchs", x: 250, y: 1500, seat: 0 }, { thing: "kiste", x: 250, y: 1555 }], end: { score: 20, lives: 1, win: "score" } };
  assert.ok(codes(kurz).includes("zu-kurz"), codes(kurz).join());
  // Schemafehler kommen als Stufe "schema" mit Rueckmeldung fuers Modell
  const s = pruefe({ ...clone(FLAPPY), things: [] });
  assert.equal(s.stage, "schema"); assert.match(feedback(s), /ungueltig/);
  assert.ok(SCHWELLEN.nichtsMax <= 0.05 && SCHWELLEN.endet >= 0.95);
});

test("Baukasten: Pruefer haelt das Rechenbudget ein und lehnt dann ab (fail closed)", () => {
  const v = pruefe(BREAKOUT, { games: 6, budget: 5000 });
  assert.equal(v.ok, false); assert.equal(v.stage, "budget");
});

test("Baukasten: Zufallsbot kennt keine Ziele (Tippspiele), Bot-Plan wird aus der Steuerung abgeleitet", () => {
  const d = check(BEISPIELE.reaktion).desc;
  let st = E.init(d, "r", ["bot", "none"]);
  for (let i = 0; i < 100; i++) st = E.step(d, st, [{ b: 0 }]).state;
  const star = st.e[0];
  for (let s = 0; s < 64; s++) { const x = randomBot(d, { ...st, t: s * 8 }, 0, 7); if (x.p) assert.ok(x.p[0][1] !== (star.x >> 8) || x.p[0][2] !== (star.y >> 8)); }
  assert.deepEqual(planOf(check({ ...clone(FLAPPY), bot: undefined }).desc), { kind: "flap", thing: "vogel", target: "rohr" });
  assert.deepEqual(planOf(check({ ...clone(SNAKE), bot: undefined }).desc), { kind: "seek", thing: "schlange", target: "apfel" });
  assert.deepEqual(planOf(check({ ...clone(BREAKOUT), bot: undefined }).desc), { kind: "track", thing: "schlaeger", target: "ball" });
});

// ---- Karten -------------------------------------------------------------------------------------------------------
test("Karte baukasten: Echtzeit-Vertrag, Bot als zweite Seite, Geist aus einer Bot-Partie und aus allein", () => {
  for (const ex of [PONG, FLAPPY]) {
    const params = { desc: compact(check(ex).desc) };
    const roles = ex.players === 2 ? ["human", "bot"] : ["human", "none"];
    const mt = createMatch(card, { params, seed: "geist", roles, level: 2, record: 0 });
    const plan = planOf(check(ex).desc);
    for (let i = 0; i < 1200 && !mt.status().over; i++) mt.step({ 0: botInput(mt.state.D, mt.state, 0, 3, plan) });
    const w = mt.ghostWire();
    const v = verifyGhost(card, JSON.parse(JSON.stringify(w)));
    assert.ok(v.ok, ex.title + ": " + JSON.stringify(v));
    const view = mt.view({ seat: 0 });
    assert.equal(view.t, "canvas"); assert.ok(view.layers.find((l) => l.id === "world").ops.length > 0);
  }
  assert.throws(() => card.init({ params: { desc: { v: 1, title: "x", mode: "realtime" } }, seed: "s", players: ["human", "none"] }), /ungueltig/);
  assert.throws(() => card.init({ params: { desc: DREI }, seed: "s", players: ["human", "none"] }), /baukasten-zug/);
});

test("Karte baukasten-zug: Zugvertrag ueber die Partie-Logik (session) bis zum Ende, nur erlaubte Zuege", () => {
  for (const ex of [DREI, MEMORY, QUIZ, WORTSALAT]) {
    const params = { desc: compact(check(ex).desc) };
    let s = newSession(zug, { params, seed: "zs", mine: [0, 1], commits: [null, null] });
    for (let k = 0; k < 400 && !zug.status(s.state).over; k++) {
      const st = zug.status(s.state), obs = zug.observe(s.state, st.turn);
      s = apply(zug, s, zug.bot(obs, st.turn, { level: 2, seed: "b" + k }));
    }
    assert.ok(zug.status(s.state).over, ex.title);
    const view = zug.view(zug.observe(s.state, 0), 0, { lang: "de" });
    assert.equal(view.t, "frame");
  }
  const s0 = newSession(zug, { params: { desc: DREI }, seed: "x", mine: [0, 1], commits: [null, null] });
  assert.throws(() => apply(zug, s0, { t: "put", seat: 0, i: 99 }));
});

test("Karten: Adapter der freien Karte (fromFree/toFree) bilden das Server-Doc {k:\"bau\"} verlustfrei ab", () => {
  const doc = { k: "bau", t: "Wolkenflug", b: compact(check(FLAPPY).desc), col: ["#ffd400", "#ff3b1d"] };
  const p = card.fromFree(doc);
  assert.deepEqual(check(p.desc).desc, check(FLAPPY).desc);
  assert.equal(zug.fromFree(doc), null, "Echtzeitbeschreibung passt nicht zur Zugkarte");
  assert.equal(card.fromFree({ k: "game", g: {} }), null);
  assert.equal(card.fromFree({ k: "bau", b: { v: 1, title: "kaputt", mode: "realtime", things: "x" } }), null);
  const back = card.toFree(p);
  assert.equal(back.k, "bau"); assert.deepEqual(check(back.b).desc, check(FLAPPY).desc);
  assert.ok(zug.fromFree({ k: "bau", t: "M", b: MEMORY }));
});

test("Karten: Manifeste – Parameter-Standard ist ein gueltiges Spiel, Modi und Grenzen passen", () => {
  for (const [c, mode] of [[card, "realtime"], [zug, "turn"]]) {
    const m = c.manifest, def = m.params.properties.desc.default;
    assert.equal(check(def).ok, true); assert.equal(check(def).desc.mode, mode);
    assert.equal(m.mode, mode); assert.equal(m.hidden, "none"); assert.equal(m.family, "frei");
  }
  assert.equal(card.manifest.rt.maxTicks, LIMITS.maxTicks);
  assert.equal(card.manifest.rt.tick, 60);
});

test("Baukasten: RNG-Nutzung nur ueber den Zustand (gleiches Ergebnis nach Serialisierung mitten in der Partie)", () => {
  const d = check(SNAKE).desc, plan = planOf(d);
  let a = E.init(d, "ser", ["bot", "none"]);
  for (let i = 0; i < 300; i++) a = E.step(d, a, [botInput(d, a, 0, 2, plan)]).state;
  let b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 300; i++) { a = E.step(d, a, [botInput(d, a, 0, 2, plan)]).state; b = E.step(d, b, [botInput(d, b, 0, 2, plan)]).state; }
  assert.equal(stateHash(a), stateHash(b));
  void rng; void SPEC;
});
