// Unit-Tests der Spiel-API (src/spiel/api.js): Modulform, Zustandsregeln, Zeitschritt/Seed, Eingabe, Kollision,
// Zeichnen, Punkte/Leben/Level/Ende/Neustart, Vorausspielen. Fehlermeldungen muessen sagen, was erwartet war.
import test from "node:test";
import assert from "node:assert/strict";
import { createGame, checkModule, checkState, normInput, hit, createDrawer, SpielFehler, W, H, TOP, LIMITS, CONTROLS } from "../src/spiel/api.js";

const mini = (over = {}) => ({
  title: "Mini", controls: ["left", "right", "fire"], lives: 2,
  init(g) { return { x: 100, n: 0, r: g.random() }; },
  update(s, input, g) { if (input.left) s.x -= 1; if (input.right) s.x += 1; if (input.firePressed) { g.addScore(5); g.sound("shoot"); } s.n += 1; },
  draw(s, d) { d.clear("cream"); d.rect(s.x, 10, 20, 20, "red", { round: 16, shadow: true }); },
  ...over
});
const throwsCode = (f, code, re) => assert.throws(f, (e) => e instanceof SpielFehler && e.code === code && (!re || re.test(e.message)), "erwartet SpielFehler " + code);

test("Modulform: fehlende Teile und falsche Werte werden mit Erwartung gemeldet", () => {
  throwsCode(() => checkModule(null), "modul", /export default/);
  throwsCode(() => checkModule(mini({ draw: undefined })), "modul", /draw fehlt.*export default \{ title/);
  throwsCode(() => checkModule(mini({ controls: ["left", "jump"] })), "modul", /"jump".*left, right, up, down, fire/);
  throwsCode(() => checkModule(mini({ controls: [] })), "modul", /controls/);
  throwsCode(() => checkModule(mini({ controls: ["left", "left"] })), "modul", /doppelt/);
  throwsCode(() => checkModule(mini({ lives: 0 })), "modul", /lives.*1 bis 9/);
  throwsCode(() => checkModule(mini({ title: "" })), "modul", /title/);
  throwsCode(() => checkModule(mini({ speed: 3 })), "modul", /unbekanntes Feld "speed"/);
  assert.deepEqual(checkModule(mini({ controls: ["fire", "left"] })).controls, ["left", "fire"], "kanonische Reihenfolge");
});

test("Zustand: nur Daten, Pfad zum Fehler, Groessengrenze", () => {
  throwsCode(() => checkState({ a: { b: [1, NaN] } }, "update"), "zustand", /s\.a\.b\[1\] ist NaN/);
  throwsCode(() => checkState({ f() {} }, "update"), "zustand", /s\.f ist eine Funktion/);
  const shared = { x: 1 };
  throwsCode(() => checkState({ a: shared, b: shared }, "update"), "zustand", /doppelt/);
  throwsCode(() => checkState({ m: new Map() }, "update"), "zustand", /kein einfaches Objekt/);
  throwsCode(() => checkState(5, "init(g)"), "zustand", /init\(g\) muss ein Objekt/);
  throwsCode(() => checkState({ big: Array.from({ length: LIMITS.stateNodes + 1 }, () => 0) }, "update"), "speicher", /Zustand zu gross/);
  throwsCode(() => checkState({ t: "x".repeat(LIMITS.stateBytes) }, "update"), "speicher", /Bytes/);
  assert.ok(checkState({ a: [1, "b", null, true, { c: 2 }] }, "init(g)") > 0);
});

test("Fester Zeitschritt und Seed: gleicher Seed + gleiche Eingaben => gleicher Hash; anderer Seed => anderer", () => {
  const run = (seed) => { const g = createGame(mini(), { seed }); for (let i = 0; i < 120; i++) g.step(i % 7 === 0 ? { fire: true, firePressed: true } : { right: true }); return g.hash(); };
  assert.equal(run("a"), run("a"));
  assert.notEqual(run("a"), run("b"));
  const g = createGame(mini(), { seed: "a" });
  for (let i = 0; i < 10; i++) g.step({});
  assert.equal(g.status().frame, 10);
  assert.equal(g.status().ticks, 10);
  throwsCode(() => createGame(mini(), {}), "api", /seed/);
});

test("Eingabe: nur deklarierte Steuerung wirkt, falsche Typen und Schluessel werden abgelehnt", () => {
  assert.deepEqual(normInput({ left: true, up: true, firePressed: true }, ["left", "fire"]), { left: true, right: false, up: false, down: false, fire: false, firePressed: true });
  assert.deepEqual(normInput(undefined, CONTROLS), { left: false, right: false, up: false, down: false, fire: false, firePressed: false });
  throwsCode(() => normInput({ left: 1 }, CONTROLS), "eingabe", /left muss true\/false/);
  throwsCode(() => normInput({ jump: true }, CONTROLS), "eingabe", /unbekannter Schluessel "jump"/);
  const g = createGame(mini(), { seed: "x" });
  g.step({ up: true, down: true });
  assert.equal(g.hash(), (() => { const h = createGame(mini(), { seed: "x" }); h.step({}); return h.hash(); })(), "up/down nicht deklariert => wirkungslos");
});

test("Kollision: Rechteck/Rechteck, Kreis/Kreis, Kreis/Rechteck; Beruehren zaehlt nicht; Mischformen werden abgelehnt", () => {
  assert.equal(hit({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), true);
  assert.equal(hit({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), false);
  assert.equal(hit({ x: 0, y: 0, r: 5 }, { x: 9, y: 0, r: 5 }), true);
  assert.equal(hit({ x: 0, y: 0, r: 5 }, { x: 10, y: 0, r: 5 }), false);
  assert.equal(hit({ x: 15, y: 5, r: 6 }, { x: 0, y: 0, w: 10, h: 10 }), true);
  assert.equal(hit({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, r: 6 }), false);
  throwsCode(() => hit({ x: 0, y: 0, w: 1, h: 1, r: 1 }, { x: 0, y: 0, r: 1 }), "api", /nicht beides/);
  throwsCode(() => hit({ x: 0, y: 0 }, { x: 0, y: 0, r: 1 }), "api", /\{x,y,w,h\}.*\{x,y,r\}/);
  throwsCode(() => hit({ x: 0, y: NaN, r: 1 }, { x: 0, y: 0, r: 1 }), "api", /y ist NaN/);
});

test("Zeichnen: App-Farben, Zahlen, Optionen und Befehlsgrenze werden geprueft", () => {
  const { d, ops } = createDrawer();
  d.clear("cream"); d.rect(1, 2, 3, 4, "yellow", { round: 18, shadow: true, line: true }); d.circle(5, 6, 7, "red"); d.emoji("⛵", 10, 10, 30);
  d.text(42, 1, 1, { size: 20, align: "center", color: "ink" }); d.line(0, 0, 1, 1, "ink", 3);
  assert.deepEqual(ops.map((o) => o[0]), ["clear", "rect", "circle", "emoji", "text", "line"]);
  assert.deepEqual(ops[1], ["rect", 1, 2, 3, 4, "yellow", 18, true, true]);
  throwsCode(() => d.rect(0, 0, 1, 1, "blue"), "zeichnen", /"blue" unbekannt – erlaubt: yellow, cream, ink, red/);
  throwsCode(() => d.circle(0, undefined, 3, "red"), "zeichnen", /y ist undefined/);
  throwsCode(() => d.rect(0, 0, 1, 1, "red", { radius: 3 }), "zeichnen", /unbekannte Option "radius"/);
  throwsCode(() => d.emoji("x", 0, 0, 500), "zeichnen", /8\.\.160/);
  throwsCode(() => d.text({}, 0, 0), "zeichnen", /Text oder eine Zahl/);
  const many = createDrawer();
  throwsCode(() => { for (let i = 0; i <= LIMITS.ops; i++) many.d.circle(0, 0, 1, "ink"); }, "zeichnen", /zu viele Zeichenbefehle/);
});

test("Phasen: in draw nur lesen; g.random/addScore ausserhalb von init/update sind Fehler", () => {
  throwsCode(() => createGame(mini({ draw(s, d, g) { g.addScore(1); } }), { seed: "x" }).draw(), "api", /g\.addScore\(\) geht nur in init oder update, nicht in draw/);
  throwsCode(() => createGame(mini({ draw(s, d, g) { g.random(); } }), { seed: "x" }).draw(), "api", /nicht in draw/);
  throwsCode(() => createGame(mini({ update(s, i, g) { g.sound("boom"); } }), { seed: "x" }).step({}), "api", /"boom" unbekannt/);
  throwsCode(() => createGame(mini({ update(s, i, g) { g.addScore(1.5); } }), { seed: "x" }).step({}), "api", /ganze Zahl/);
  throwsCode(() => createGame(mini({ update(s, i, g) { g.randInt(5, 1); } }), { seed: "x" }).step({}), "api", /a <= b/);
  throwsCode(() => createGame(mini({ update() { return { neu: 1 }; } }), { seed: "x" }).step({}), "api", /aendere s direkt/);
  const g = createGame(mini({ update(s, i, g2) { s.v = [g2.W, g2.H, g2.TOP, g2.sin(90), g2.cos(180), g2.dist({ x: 0, y: 0 }, { x: 3, y: 4 }), g2.clamp(9, 0, 5)]; } }), { seed: "x" });
  g.step({});
  assert.deepEqual(g.snapshot().s.v.map((x) => Math.round(x * 1e9) / 1e9), [W, H, TOP, 1, -1, 5, 5]);
});

test("Punkte, Leben, Level, Ende, Neustart, Toene", () => {
  const mod = mini({ update(s, input, g) { if (input.fire) g.loseLife(); if (input.left) g.nextLevel(); if (input.right) g.addScore(7); if (input.firePressed) g.addLife(); s.n += 1; } });
  const g = createGame(mod, { seed: "x" });
  g.step({ right: true }); g.step({ left: true });
  assert.deepEqual([g.status().score, g.status().level, g.status().lives], [7, 2, 2]);
  g.step({ fire: true }); g.step({ fire: true });
  assert.equal(g.status().over, true);
  assert.deepEqual(g.sounds(), ["lose"]);
  const frozen = g.hash(), frame = g.status().frame;
  g.step({ right: true });
  assert.equal(g.hash(), frozen, "nach dem Ende ruht update");
  assert.equal(g.status().frame, frame);
  assert.equal(g.status().ticks, 5, "ticks laufen weiter");
  g.restart();
  assert.deepEqual(g.status(), { frame: 0, ticks: 5, score: 0, lives: 2, level: 1, over: false, won: false, round: 1 });
  assert.equal(g.hash(), createGame(mod, { seed: "x", round: 1 }).hash(), "Neustart = neues Spiel der naechsten Runde");
  const w = createGame(mini({ update(s, i, g2) { g2.win(); } }), { seed: "x" });
  w.step({});
  assert.deepEqual([w.status().over, w.status().won, w.sounds()], [true, true, ["win"]]);
});

test("snapshot/restore sind exakt (Grundlage fuer vorausspielende Bots)", () => {
  const g = createGame(mini({ update(s, i, g2) { s.x += g2.randInt(-3, 3); if (i.firePressed) g2.addScore(1); } }), { seed: "y" });
  for (let i = 0; i < 20; i++) g.step({ fire: true, firePressed: i % 3 === 0 });
  const snap = g.snapshot(), h = g.hash();
  for (let i = 0; i < 30; i++) g.step({ fire: true, firePressed: true });
  assert.notEqual(g.hash(), h);
  g.restore(snap);
  assert.equal(g.hash(), h);
  const a = []; for (let i = 0; i < 10; i++) { g.step({}); a.push(g.hash()); }
  g.restore(snap);
  const b = []; for (let i = 0; i < 10; i++) { g.step({}); b.push(g.hash()); }
  assert.deepEqual(a, b, "RNG-Zustand wird mit wiederhergestellt");
});
