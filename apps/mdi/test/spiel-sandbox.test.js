// Sandbox ohne Browser: Haertung des Spiel-Realms (src/broker/spiel-haerten.js) in einem eigenen node:vm-Realm,
// Fristen (src/spiel/fristen.js), Fortschritt in allen Pruefphasen und die CSP als eine Quelle.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { harden, verifyHardened, frozenTargets, BLOCKED, LOCKED, ALLOC_MAX } from "../src/broker/spiel-haerten.js";
import { FRISTEN, gesamtfristMs, hostFristMs, mitFristen } from "../src/spiel/fristen.js";
import { HOST_SILENCE_MS } from "../src/broker/spiel-host.js";
import { playtest, workSteps, PHASES, THRESHOLDS } from "../src/spiel/pruefung.js";
import { GREEDY } from "../src/spiel/bots.js";
import { CONTROLS } from "../src/spiel/api.js";
import { frameCsp } from "../src/broker/spiel-csp.js";
import { frameCsp as frameCspBuild } from "../scripts/spiel/build.mjs";
import { ERROR_CODES } from "../src/spiel/protokoll.js";
import { checkSpielSource } from "../scripts/harness.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const NEG = path.join(DIR, "fixtures/spiel");

// Web-Bausteine, die ein Worker hat und ein vm-Realm nicht: im Realm selbst definiert (richtige Prototypen-Kette)
const WEB = `class EventTarget {} class MessagePort extends EventTarget {} class Performance {} class TextEncoder {} class Blob {}
  class URL {} var performance = new Performance(); var structuredClone = (x) => x;
  globalThis.EventTarget = EventTarget; globalThis.MessagePort = MessagePort; globalThis.Performance = Performance;
  globalThis.TextEncoder = TextEncoder; globalThis.Blob = Blob; globalThis.URL = URL;`;
function realm(withWeb = true) {
  const ctx = vm.createContext({});
  if (withWeb) vm.runInContext(WEB, ctx);
  return { ctx, scope: vm.runInContext("globalThis", ctx), run: (src) => vm.runInContext(src, ctx) };
}
const codeOf = (fn) => { try { fn(); return null; } catch (e) { return e.code || e.name; } };

test("Haertung: alle verlangten Objekte eingefroren, Bindungen gesperrt, Stubs zaehlen auch new Worker()", () => {
  const { scope, run } = realm(), blocked = [];
  harden(scope, (n) => blocked.push(n));
  for (const [label, get] of frozenTargets(scope)) assert.ok(Object.isFrozen(get()), label);
  // Iterator-Prototypen von Map, Set, String sowie Date, RegExp und typisierte Arrays sind dabei (Befund 10)
  const labels = frozenTargets(scope).map(([l]) => l);
  for (const l of ["%MapIteratorPrototype%", "%SetIteratorPrototype%", "%StringIteratorPrototype%", "Date.prototype", "RegExp.prototype", "Float64Array.prototype", "%TypedArray%.prototype"]) assert.ok(labels.includes(l), l);
  // Umbiegen aus dem Realm heraus scheitert (strikter Code wirft)
  for (const src of ["Object.getPrototypeOf(new Map()[Symbol.iterator]()).next = null", "Object.getPrototypeOf(''[Symbol.iterator]()).next = null",
    "Date.prototype.getTime = null", "RegExp.prototype.exec = null", "Float64Array.prototype.fill = null", "Date = null", "performance = null", "Math.random = () => 1"]) {
    assert.throws(() => run("'use strict'; " + src), (e) => e.name === "TypeError", src);
  }
  for (const name of BLOCKED) assert.throws(() => run("new " + name + "('x')"), /gesperrt/, name);
  assert.deepEqual(blocked, [...BLOCKED], "jeder Versuch gezaehlt, auch mit new");
  assert.throws(() => run("Math.random()"), /g\.random\(\)/);
  assert.equal(run("[1, 2, 3].join('-') + 'ab'.repeat(2) + '7'.padStart(3, '0') + Array.from({ length: 3 }).length + [0, 0].fill(1).join('')"), "1-2-3abab0073" + "11");
});

test("Haertung: Speicherbombe in einem Schritt wirft sofort \"speicher\" (repeat, padStart, fill, join, Array.from)", () => {
  const { scope, run } = realm();
  harden(scope, () => {});
  for (const src of ["new Array(2 ** 30).fill(0)", "'x'.repeat(2 ** 29 - 24)", "''.padStart(2 ** 28)", "''.padEnd(2 ** 28)", "new Array(2 ** 30).join('x')", "Array.from({ length: 2 ** 30 })"]) {
    const e = (() => { try { run(src); return null; } catch (x) { return x; } })();
    assert.ok(e, src);
    assert.equal(e.code, "speicher", src);
    assert.match(e.message, new RegExp("hoechstens " + ALLOC_MAX), src);
  }
  assert.equal(run("'ab'.repeat(" + ALLOC_MAX / 2 + ").length"), ALLOC_MAX, "genau an der Grenze erlaubt");
});

test("Haertung ist fail closed: fehlende Bausteine oder ein ungehaerteter Realm werfen \"sandbox\", nichts wird uebersprungen", () => {
  const { scope } = realm(false);
  assert.equal(codeOf(() => harden(scope, () => {})), "sandbox", "Realm ohne MessagePort/Performance/... ");
  assert.throws(() => harden(realm(false).scope, () => {}), /MessagePort|Performance|TextEncoder|Blob|URL|performance/);
  const fresh = realm();
  assert.throws(() => verifyHardened(fresh.scope, { stubs: {}, random: null, wraps: [] }), (e) => e.code === "sandbox" && /Object\.prototype nicht eingefroren/.test(e.message) && /Bindung Date nicht gesperrt/.test(e.message) && /Worker nicht gesperrt/.test(e.message));
  // nicht ersetzbare Faehigkeit: Haertung bricht ab, statt sie stehen zu lassen
  const fixed = realm();
  Object.defineProperty(fixed.scope, "Worker", { value: function Worker() {}, configurable: false, writable: false });
  assert.throws(() => harden(fixed.scope, () => {}), /Worker ist nicht ersetzbar/);
  assert.ok(LOCKED.includes("Date") && LOCKED.includes("RegExp") && LOCKED.includes("Float64Array"));
  assert.ok(ERROR_CODES.includes("sandbox"));
});

test("Statische Vorpruefung meldet verschachtelten Worker, BroadcastChannel und dynamischen Import", () => {
  const w = checkSpielSource(fs.readFileSync(path.join(NEG, "worker.js"), "utf8")).join(" ");
  assert.match(w, /Worker/); assert.match(w, /BroadcastChannel/);
  assert.match(checkSpielSource(fs.readFileSync(path.join(NEG, "import.js"), "utf8")).join(" "), /dynamischer Import/);
});

test("Fristen: Fenster je Phase passen in die Host-Stille, Gesamtfrist waechst mit der Arbeit und deckt ein Spiel im Budget", () => {
  for (const [k, ms] of Object.entries(FRISTEN.fenster)) assert.ok(ms + 500 < HOST_SILENCE_MS, k + " " + ms);
  for (const p of PHASES) assert.ok(FRISTEN.fenster[p] > 0, "eigenes Fenster fuer " + p);
  // ein Greedy-Entscheid (teuerste Einheit ohne Meldung) im Budget passt mit Faktor 2 ins Bot-Fenster
  assert.ok(FRISTEN.fenster.bots >= 2 * 2 * CONTROLS.length * GREEDY.horizon * THRESHOLDS.p95Ms);
  assert.ok(gesamtfristMs(10) < gesamtfristMs(60), "waechst mit seconds");
  assert.ok(hostFristMs(60) > gesamtfristMs(60), "Host wartet laenger als der Rahmen");
  const w = workSteps(60, CONTROLS.length), steps = w.bots + w.eingaben + w.determinismus + w.neustart;
  assert.ok(gesamtfristMs(60) >= FRISTEN.fenster.load + steps * THRESHOLDS.p95Ms, "jeder Schritt am Budget passt hinein");
  assert.equal(gesamtfristMs(60, mitFristen({ faktor: 0 })), FRISTEN.fenster.load);
  assert.throws(() => mitFristen({ frei: 1 }), /unbekannter Schluessel/);
  assert.throws(() => mitFristen({ fenster: { gesamt: 1 } }), /unbekanntes Fenster/);
});

test("Fortschritt kommt aus allen Phasen (bots, eingaben, determinismus, neustart), done bleibt <= total", async () => {
  const mod = (await import(path.join(DIR, "../src/spiel/beispiele/breakout.js"))).default;
  const seen = new Set();
  let last = 0, total = 0;
  const r = playtest(mod, { seed: "p", seconds: 2, now: () => performance.now(), onProgress(done, t, phase) { assert.equal(done, last + 1); last = done; total = t; seen.add(phase); } });
  assert.equal(r.error, null);
  assert.deepEqual([...seen], [...PHASES]);
  assert.ok(last <= total, last + " <= " + total);
});

test("CSP: eine Quelle fuer Auslieferung und Einbettung, mit sandbox allow-scripts und ohne Netz", () => {
  assert.equal(frameCspBuild, frameCsp, "build.mjs reicht dieselbe Funktion weiter");
  const csp = frameCsp("http://spiel.test", "http://app.test");
  for (const d of ["sandbox allow-scripts", "connect-src 'none'", "default-src 'none'", "frame-ancestors http://app.test"]) assert.ok(csp.split("; ").includes(d), d);
  assert.ok(!/unsafe-eval|unsafe-inline|\*/.test(csp));
});
