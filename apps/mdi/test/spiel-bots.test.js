// Generische Bots und Abnahme (src/spiel/bots.js, pruefung.js) ohne Browser; Referenzspiele nutzen nur die API
// (statische Pruefung scripts/harness.js checkSpielSource); Protokoll-Schema und Eingabe-Abbildung des Rahmens.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { playtest } from "../src/spiel/pruefung.js";
import { actions, press, makeBot, BOTS } from "../src/spiel/bots.js";
import { createGame } from "../src/spiel/api.js";
import { checkToFrame, checkToHost, V } from "../src/spiel/protokoll.js";
import { toInput, LAYOUT } from "../src/broker/spiel-frame.js";
import { createSampler } from "../src/app/rt/input.js";
import { checkSpielSource } from "../scripts/harness.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const BEISPIELE = path.join(DIR, "../src/spiel/beispiele"), NEG = path.join(DIR, "fixtures/spiel");
const NAMES = ["invaders", "breakout", "snake", "rennen", "asteroids", "plattformer"];
const load = async (f) => (await import(f)).default;
const now = () => performance.now();

test("Aktionsraum aus controls; Feuer wird gehaemmert (firePressed kommt vor)", () => {
  assert.deepEqual(actions(["left", "right", "fire"]).map((a) => a.dirs.join("+") + (a.fire ? "!" : "")), ["", "left", "right", "!", "left!", "right!"]);
  assert.deepEqual(actions(["up", "down"]).length, 3);
  assert.deepEqual(press({ dirs: ["left"], fire: true }, 0), { left: true, fire: true, firePressed: true });
  assert.deepEqual(press({ dirs: ["left"], fire: true }, 1), { left: true });
  assert.deepEqual(BOTS, ["idle", "random", "greedy"]);
});

test("Bots sind deterministisch und Greedy laesst den Spielzustand unveraendert (Vorausspielen per snapshot/restore)", async () => {
  const mod = await load(path.join(BEISPIELE, "invaders.js"));
  const run = () => { const g = createGame(mod, { seed: "s" }), b = makeBot("greedy", g, "b"); const seen = []; for (let t = 0; t < 300; t++) { const before = g.hash(); const inp = b.next(t); assert.equal(g.hash(), before); g.step(inp); seen.push(g.hash()); } return seen; };
  assert.deepEqual(run(), run());
});

for (const name of NAMES) {
  test("Referenzspiel " + name + ": nur Spiel-API (statisch sauber) und besteht die Abnahme (30 s je Bot)", async () => {
    const src = fs.readFileSync(path.join(BEISPIELE, name + ".js"), "utf8");
    assert.deepEqual(checkSpielSource(src), [], "statische Pruefung");
    assert.ok(!/^\s*import\s/m.test(src), "keine Importe");
    const r = playtest(await load(path.join(BEISPIELE, name + ".js")), { seed: "unit", seconds: 30, now, name });
    const failed = Object.entries(r.checks).filter(([, c]) => !c.ok).map(([k, c]) => k + " " + JSON.stringify(c));
    assert.equal(r.ok, true, name + ": " + (r.error ? JSON.stringify(r.error) : failed.join("; ")));
    assert.ok(r.bots.greedy.bestScore > 0 || r.bots.random.bestScore > 0);
  });
}

test("Negativfaelle ohne Browser: Ausnahme, Speicher, Zustand ausserhalb von s werden erkannt", async () => {
  const ex = playtest(await load(path.join(NEG, "exception.js")), { seed: "n", seconds: 5, now });
  assert.equal(ex.ok, false); assert.equal(ex.error.code, "exception"); assert.match(ex.error.message, /reading 'x'/); assert.equal(ex.error.where, "idle");
  const mem = playtest(await load(path.join(NEG, "speicher.js")), { seed: "n", seconds: 5, now });
  assert.equal(mem.ok, false); assert.equal(mem.error.code, "speicher");
  const leak = playtest(await load(path.join(NEG, "leck.js")), { seed: "n", seconds: 20, now });
  assert.equal(leak.ok, false);
  assert.ok(!leak.checks.deterministic.ok || !leak.checks.restartWorks.ok, JSON.stringify(leak.checks));
  for (const f of ["fetch", "parent", "zufall", "faelscher", "syntax"]) assert.ok(checkSpielSource(fs.readFileSync(path.join(NEG, f + ".js"), "utf8")).length > 0, f + ": statisch gemeldet");
});

test("Protokoll: exakte Schluessel, Werte geprueft, Ablehnung mit Grund", () => {
  const start = { v: V, t: "start", mode: "test", code: "export default {}", seed: "abc", lang: "de", seconds: 60 };
  assert.equal(checkToFrame(start), null);
  assert.equal(checkToFrame({ v: V, t: "start", mode: "play", code: "x", seed: "abc", lang: "en" }), null);
  assert.match(checkToFrame({ ...start, extra: 1 }), /Schluessel/);
  assert.match(checkToFrame({ ...start, seed: "a b" }), /seed/);
  assert.match(checkToFrame({ ...start, seconds: 0 }), /seconds/);
  assert.match(checkToFrame({ ...start, lang: "fr" }), /lang/);
  assert.match(checkToFrame({ ...start, code: "x".repeat(70000) }), /code/);
  assert.match(checkToFrame({ v: 2, t: "pause" }), /v=1/);
  assert.match(checkToFrame({ v: V, t: "eval", code: "1" }), /unbekannter Typ/);
  assert.equal(checkToFrame({ v: V, t: "pause" }), null);
  const st = { frame: 1, score: 0, lives: 3, level: 1, over: false, won: false, paused: false };
  assert.equal(checkToHost({ v: V, t: "status", status: st }), null);
  assert.match(checkToHost({ v: V, t: "status", status: { ...st, lives: 99 } }), /Zahlen/);
  assert.match(checkToHost({ v: V, t: "status", status: { ...st, cookie: "x" } }), /Schluessel/);
  assert.equal(checkToHost({ v: V, t: "error", code: "watchdog", message: "x" }), null);
  assert.match(checkToHost({ v: V, t: "error", code: "frei", message: "x" }), /code/);
  assert.match(checkToHost({ v: V, t: "result", report: { ok: true } }), /unvollstaendig/);
  assert.equal(checkToHost({ v: V, t: "started", meta: { title: "T", controls: ["left"], lives: 3 } }), null);
});

test("Rahmen-Eingabe: Tastatur, Bildschirmknopf, Tippen und Wischen ergeben die API-Eingabe", () => {
  const s = createSampler(LAYOUT, { w: 360, h: 640 });
  s.key("ArrowLeft", true);
  assert.deepEqual(toInput(s.sample()), { left: true, right: false, up: false, down: false, fire: false, firePressed: false });
  s.key("ArrowLeft", false); s.key("Space", true);
  assert.deepEqual(toInput(s.sample()), { left: false, right: false, up: false, down: false, fire: true, firePressed: true });
  assert.deepEqual(toInput(s.sample()).firePressed, false, "Feuer-Impuls nur einen Frame");
  s.key("Space", false); s.sample();
  s.pointer("down", 1, 100, 300); assert.equal(toInput(s.sample()).firePressed, true, "Tippen = Feuer-Impuls");
  s.pointer("move", 1, 100, 200); assert.equal(toInput(s.sample()).up, true, "Wischen nach oben");
  assert.equal(toInput(s.sample()).up, false, "Wischen wirkt einen Frame");
  s.pointer("up", 1, 100, 200); s.sample();
  s.button("right", true); assert.equal(toInput(s.sample()).right, true, "Steuerkreuz");
});
