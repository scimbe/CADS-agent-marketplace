// Die zehn Arcade-Karten im Kartenvertrag (ADR 0001 b): Register, Partie mit Bot, Anzeige, Steuerung (Zeiger und
// Tastatur), Live ueber zwei Seiten (net "split"), Anpassung (Farben, Figur, Punkte zum Sieg, eigenes Foto).
import test from "node:test";
import assert from "node:assert/strict";
import { ORDER, cardOf, manifestOf, validParams, modesOf } from "../src/cards/index.js";
import { defaults, paramsForLink } from "../src/contract/fields.js";
import { W, H } from "../src/engines/arcade/core.js";
import { rtOf, paramsOf } from "../src/engines/arcade/card.js";
import { rulesOf, botNew, botStep } from "../src/engines/arcade/index.js";

const IDS = ["arcade-kick", "arcade-elfer", "arcade-ziegel", "arcade-panzer", "arcade-stock", "arcade-puck", "arcade-volley", "arcade-flipper", "arcade-snow", "arcade-murmel"];
const G = (id) => id.slice(7);
const OPS = new Set(["rect", "circle", "ellipse", "arc", "line", "poly", "path", "text", "sprite", "image", "glow", "particles", "group", "shake", "flash"]);
const NONE = { b: 0, ax: 0, ay: 0, p: [] };
function walk(ops, fn) { for (const o of ops) { fn(o); if (o.o === "group") walk(o.ops, fn); } }
function checkView(v, what) {
  assert.equal(v.t, "canvas"); assert.equal(v.w, W); assert.equal(v.h, H);
  let n = 0;
  for (const L of v.layers) walk(L.ops, (o) => {
    n++; assert.ok(OPS.has(o.o), what + ": Op " + o.o);
    for (const [k, x] of Object.entries(o)) if (typeof x === "number") assert.ok(Number.isFinite(x), what + ": " + o.o + "." + k + " = " + x);
    if (o.o === "particles") for (const p of o.list) assert.ok(p.slice(0, 4).every(Number.isFinite), what + ": Partikel");
  });
  assert.ok(n > 5 && n <= 4000, what + ": " + n + " Ops");
  return n;
}
function newGame(id, players, params, seed = "t-" + id) {
  const c = cardOf(id), p = Object.assign(defaults(manifestOf(id).params), params || {});
  assert.ok(validParams(id, p), id + " Parameter gueltig");
  return { c, st: c.init({ params: p, seed, players }) };
}

test("Register: zehn Arcade-Karten, Manifest aus der Engine abgeleitet, Modi Bot und Live", () => {
  for (const id of IDS) {
    assert.ok(ORDER.includes(id), id); const m = manifestOf(id);
    assert.equal(m.kind, "realtime"); assert.equal(m.rt.net, "split"); assert.equal(m.rt.numeric, "f64"); assert.equal(m.rt.tick, 120);
    assert.deepEqual(m.rt, JSON.parse(JSON.stringify(rtOf(G(id)))), id + ": rt wie die Engine");
    assert.deepEqual(m.params, JSON.parse(JSON.stringify(paramsOf(G(id), rulesOf(G(id))).params)), id + ": Parameter wie die Engine");
    assert.deepEqual(modesOf(cardOf(id)), ["bot", "live"]);
    for (const b of m.rt.controls.buttons) assert.ok(b.keys.length >= 1, id + ": jeder Knopf hat Tasten");
  }
});

test("Jede Karte: Bot gegen Bot ueber den Kartenvertrag bis zum Ende, Anzeige gueltig fuer beide Sitze", () => {
  for (const id of IDS) {
    let { c, st } = newGame(id, ["bot", "bot"]);
    let t = 0, ev = 0, views = 0;
    for (; t < 120 * 400 && !c.status(st).over; t++) {
      const r = c.step(st, [NONE, NONE]); st = r.state; ev += r.ev.length;
      if (t % 600 === 0) { checkView(c.view(st, { seat: 0, alpha: 0.5, lang: "de" }), id); checkView(c.view(st, { seat: 1, lang: "en" }), id + " Sitz 1"); views++; }
    }
    const s = c.status(st);
    assert.ok(s.over, id + " endet"); assert.equal(s.rejected, 0); assert.ok(ev > 0, id + " Ereignisse");
    assert.match(s.say, /\d : \d/); assert.equal(typeof c.hash(st), "string");
    checkView(c.view(st, { seat: 0 }), id + " Ende");
  }
});

test("Determinismus: gleicher Seed und gleiche Eingaben ergeben denselben Hash; der Zustand vor step bleibt unveraendert", () => {
  for (const id of IDS) {
    const run = (seed) => { let { c, st } = newGame(id, ["human", "bot"], null, seed); for (let t = 0; t < 900; t++) st = c.step(st, [{ b: t % 50 < 3 ? 1 : 0, ax: t % 240 < 120 ? 1000 : -1000, ay: 0, p: [] }, NONE]).state; return c.hash(st); };
    assert.equal(run("d1"), run("d1"), id); assert.notEqual(run("d1"), run("d2"), id);
    const { c, st } = newGame(id, ["bot", "bot"]); const before = c.hash(st); c.step(st, [NONE, NONE]); assert.equal(c.hash(st), before, id + ": step ist rein");
  }
});

// Zeiger in Weltkoordinaten: [id, x, y, f], f bit0 unten, bit1 neu, bit2 los.
const press = (x, y, id = 1) => ({ b: 0, ax: 0, ay: 0, p: [[id, x, y, 3]] });
const hold = (x, y, id = 1) => ({ b: 0, ax: 0, ay: 0, p: [[id, x, y, 1]] });
const release = (x, y, id = 1) => ({ b: 0, ax: 0, ay: 0, p: [[id, x, y, 4]] });
function steps(c, st, inputs) { for (const i of inputs) st = c.step(st, [i, NONE]).state; return st; }
const rep = (n, i) => Array.from({ length: n }, () => i);

test("Steuerung per Zeiger wie im Altcode: ziehen bewegt, tippen kickt/wirft/springt, Schleuder feuert, Wischen schiesst", () => {
  let g = newGame("arcade-ziegel", ["human", "bot"]); let st = steps(g.c, g.st, [press(200, 1400), ...rep(60, hold(200, 1400))]);
  assert.ok(Math.abs(st.sides[0].st.me - 200) < 1, "Ziegel: Schlaeger folgt dem Finger");
  g = newGame("arcade-puck", ["human", "bot"]); st = steps(g.c, g.st, [press(300, 1300), ...rep(60, hold(300, 1300))]);
  assert.ok(Math.abs(st.sides[0].st.me.x - 300) < 1 && Math.abs(st.sides[0].st.me.y - 1250) < 1, "Puck: Schlaeger 50 ueber dem Finger");
  g = newGame("arcade-kick", ["human", "bot"]); st = steps(g.c, g.st, [press(600, 1500)]);
  assert.ok(st.sides[0].st.kick > 0, "Kick: Tippen kickt");
  g = newGame("arcade-volley", ["human", "bot"]); st = steps(g.c, g.st, [press(250, 500), ...rep(3, NONE)]);
  assert.ok(st.sides[0].st.me.vy < 0, "Volley: oben tippen springt");
  g = newGame("arcade-snow", ["human", "bot"]); st = steps(g.c, g.st, [press(500, 1450)]);
  assert.equal(st.sides[0].st.ammo, 2, "Schnee: Tippen wirft");
  g = newGame("arcade-flipper", ["human", "bot"]); st = steps(g.c, g.st, [press(100, 1300), ...rep(20, hold(100, 1300))]);
  assert.ok(st.sides[0].st.a[0] < 0 && st.sides[0].st.a[1] > 0.5, "Flipper: linke Haelfte schlaegt links");
  st = steps(g.c, st, [release(100, 1300), press(900, 1300, 2), ...rep(20, hold(900, 1300, 2))]);
  assert.ok(st.sides[0].st.a[1] < 0, "Flipper: rechte Haelfte schlaegt rechts");
  g = newGame("arcade-panzer", ["human", "bot"]); st = steps(g.c, g.st, rep(10, NONE));
  st = steps(g.c, st, [press(400, 900), hold(300, 1100), hold(250, 1150)]);
  assert.ok(st.ctl[0].aim, "Panzer: Zielhilfe beim Ziehen"); checkView(g.c.view(st, {}), "panzer zielen");
  st = steps(g.c, st, [release(250, 1150), NONE]);
  assert.equal(st.sides[0].st.shells.length, 1, "Panzer: Loslassen feuert");
  g = newGame("arcade-elfer", ["human", "bot"]); st = steps(g.c, g.st, rep(4, NONE));
  assert.equal(st.sides[0].st.shooting, true);
  const path = []; for (let k = 0; k <= 12; k++) path.push(hold(500 + k * 8, 1000 - k * 40));
  st = steps(g.c, st, [press(500, 1000), ...path, release(596, 520), NONE]);
  assert.equal(st.sides[0].st.phase, "fly", "Elfer: Wischen schiesst");
  g = newGame("arcade-stock", ["human", "bot"]); st = steps(g.c, g.st, rep(4, NONE));
  st = steps(g.c, st, [press(500, 1300), hold(500, 1400), hold(500, 1520)]);
  assert.ok(st.ctl[0].aim, "Stock: Zielpunkte"); st = steps(g.c, st, [release(500, 1520), NONE]);
  assert.equal(st.sides[0].st.list.length, 1, "Stock: Schleuder wirft");
  g = newGame("arcade-murmel", ["human", "bot"]); st = steps(g.c, g.st, rep(4, NONE));
  st = steps(g.c, st, [press(600, 1300), hold(600, 1450), hold(600, 1560), release(600, 1560), NONE]);
  assert.ok(st.sides[0].st.list.some((s) => s.shooter), "Murmel: Tippen auf die Linie, zurueckziehen, loslassen");
});

// Knoepfe per id (Bitmaske in der Reihenfolge von rt.controls.buttons), wie der Host sie aus Tasten und Bildschirmknoepfen bildet.
function kbOf(id) {
  const ids = manifestOf(id).rt.controls.buttons.map((b) => b.id);
  return (names = [], ax = 0) => ({ b: names.reduce((m, n) => { assert.ok(ids.includes(n), id + ": Knopf " + n); return m | (1 << ids.indexOf(n)); }, 0), ax, ay: 0, p: [] });
}
test("Ohne Wischen (Design Phase C, Befund Schwere 4): jede Handlung hat einen Bildschirmknopf mit Tasten, jedes Spiel ist so spielbar", () => {
  for (const id of IDS) {
    const c = manifestOf(id).rt.controls;
    for (const b of c.buttons) { assert.equal(b.zone, "button", id + ": " + b.id + " als echter Knopf"); assert.ok(b.keys.length >= 1 && b.label && b.label.de, id + ": " + b.id); }
    assert.ok(!c.axes || !c.axes.y, id + ": keine y-Achse (der Host zeichnet nur ← →)");
  }
  let kb = kbOf("arcade-ziegel"), g = newGame("arcade-ziegel", ["human", "bot"]); let st = steps(g.c, g.st, rep(60, kb([], -1000)));
  assert.ok(st.sides[0].st.me < 400, "Ziegel: ←");
  kb = kbOf("arcade-puck"); g = newGame("arcade-puck", ["human", "bot"]); st = steps(g.c, g.st, rep(40, kb(["down"], 1000)));
  assert.ok(st.sides[0].st.me.x > 600 && st.sides[0].st.me.y > 1400, "Puck: → und Runter");
  kb = kbOf("arcade-volley"); g = newGame("arcade-volley", ["human", "bot"]); st = steps(g.c, g.st, [kb(["jump"]), NONE]);
  assert.ok(st.sides[0].st.me.vy < 0, "Volley: Springen");
  kb = kbOf("arcade-kick"); g = newGame("arcade-kick", ["human", "bot"]); st = steps(g.c, g.st, [kb(["kick"])]); assert.ok(st.sides[0].st.kick > 0, "Kick: KICK");
  kb = kbOf("arcade-snow"); g = newGame("arcade-snow", ["human", "bot"]); st = steps(g.c, g.st, [kb(["fire"])]); assert.equal(st.sides[0].st.ammo, 2, "Schnee: Werfen");
  kb = kbOf("arcade-flipper"); g = newGame("arcade-flipper", ["human", "bot"]); st = steps(g.c, g.st, rep(20, kb(["right"]))); assert.ok(st.sides[0].st.a[1] < 0 && st.sides[0].st.a[0] > 0.5, "Flipper: RECHTS TIPPEN");
  st = steps(g.c, st, rep(20, kb(["left"]))); assert.ok(st.sides[0].st.a[0] < 0, "Flipper: LINKS TIPPEN");
  kb = kbOf("arcade-panzer"); g = newGame("arcade-panzer", ["human", "bot"]); st = steps(g.c, g.st, [...rep(30, kb(["up"], 1000)), kb(["fire"]), NONE]);
  assert.equal(st.sides[0].st.shells.length, 1, "Panzer: Steiler, Kraft, Feuer");
  kb = kbOf("arcade-elfer"); g = newGame("arcade-elfer", ["human", "bot"]); st = steps(g.c, g.st, [...rep(4, NONE), ...rep(20, kb(["up"], 1000)), kb(["shoot"]), NONE]);
  assert.equal(st.sides[0].st.phase, "fly", "Elfer: zielen, Kurve, Schiessen");
  for (const id of ["arcade-stock", "arcade-murmel"]) {
    kb = kbOf(id); g = newGame(id, ["human", "bot"]); st = steps(g.c, g.st, [...rep(4, NONE), ...rep(10, kb(["up"], 300)), kb(["throw"]), NONE]);
    assert.equal(st.sides[0].st.list.filter((s) => s.shooter || s.p === 0).length, 1, id + ": Richtung, Staerker, Werfen");
  }
});

test("Gemuetlich spielen: Zeitlupe 50 % (gleicher Ablauf bei halber Geschwindigkeit), Doppeltippen zaehlt einmal", () => {
  for (const id of ["arcade-ziegel", "arcade-panzer", "arcade-stock"]) {
    const a = newGame(id, ["bot", "bot"], null, "slow"), b = newGame(id, ["bot", "bot"], { comfort: "an" }, "slow");
    let sa = a.st, sb = b.st;
    for (let t = 0; t < 600; t++) sa = a.c.step(sa, [NONE, NONE]).state;
    for (let t = 0; t < 1200; t++) sb = b.c.step(sb, [NONE, NONE]).state;
    assert.equal(sb.sides[0].t, sa.sides[0].t, id + ": halbe Spielzeit je Host-Tick");
    assert.deepEqual(JSON.stringify(sb.sides), JSON.stringify(sa.sides), id + ": derselbe Spielverlauf, nur langsamer");
    assert.equal(b.c.status(sb).comfort, true);
  }
  const kb = kbOf("arcade-snow");
  for (const comfort of ["aus", "an"]) {
    const g = newGame("arcade-snow", ["human", "bot"], { comfort });
    const st = steps(g.c, g.st, [kb(["fire"]), NONE, NONE, NONE, kb(["fire"]), NONE]);   // zweites Tippen nach 4 Host-Ticks
    assert.equal(st.sides[0].st.ammo, comfort === "an" ? 2 : 1, "Schnee " + comfort + ": Doppeltippen");
  }
});

test("Kennzahlen fuer den Endbildschirm: drei Zahlen je Spiel, zweisprachig", () => {
  for (const id of IDS) {
    let { c, st } = newGame(id, ["bot", "bot"]);
    for (let t = 0; t < 120 * 400 && !c.status(st).over; t++) st = c.step(st, [NONE, NONE]).state;
    const z = c.status(st).stats;
    assert.equal(z.length, 3, id); for (const k of z) { assert.ok(k.label.de && k.label.en && k.hint.de && k.hint.en, id + ": Name und Erklaerung"); assert.notEqual(k.value, undefined, id); }
    assert.match(String(z[2].value), /^\d+:\d\d$/, id + ": Spielzeit");
    assert.ok(z.slice(0, 2).some((k) => k.value > 0), id + ": " + JSON.stringify(z));
  }
});

// Zwei Handys ueber Live (net "split"): jede Seite laeuft fuer sich, out reist als JSON, Ankunft im naechsten Tick.
function live(id, ticks, lag) {
  const c = cardOf(id), p = defaults(manifestOf(id).params), seed = "live-" + id;
  let A = c.side.init({ params: p, seed, seat: 0, serving: true }), B = c.side.init({ params: p, seed, seat: 1, serving: false });
  const qa = [], qb = []; let t = 0;
  // beide Seiten spielt je ein Bot (wie zwei Menschen, die gleich gut sind), ueber die Engine-Hilfe
  const ba = botNew(G(id), "a"), bb = botNew(G(id), "b");
  for (; t < ticks && !(c.side.status(A).over && c.side.status(B).over); t++) {
    botStep(A.S, ba); botStep(B.S, bb);
    const inA = qa.filter((x) => x[0] <= t).map((x) => x[1]), inB = qb.filter((x) => x[0] <= t).map((x) => x[1]);
    qa.splice(0, inA.length); qb.splice(0, inB.length);
    const ra = c.side.step(A, { input: NONE, inbox: inA, tick: t }), rb = c.side.step(B, { input: NONE, inbox: inB, tick: t });
    A = ra.st; B = rb.st;
    for (const m of ra.out) { const s = JSON.stringify(m); assert.ok(s.length < 4096); qb.push([t + 1 + lag, JSON.parse(s)]); }
    for (const m of rb.out) qa.push([t + 1 + lag, JSON.parse(JSON.stringify(m))]);
  }
  return { c, A, B, t };
}
test("Live: zwei Seiten ueber JSON-Nachrichten, auch mit 100 ms Verzoegerung; gespiegelt gleicher Endstand, keine Verwerfung", () => {
  for (const id of IDS) for (const lag of [0, 12]) {
    const { c, A, B } = live(id, 120 * 400, lag), a = c.side.status(A), b = c.side.status(B);
    assert.ok(a.over && b.over, id + " endet (lag " + lag + ")");
    assert.deepEqual(a.score, [b.score[1], b.score[0]], id + " gleicher Stand");
    assert.equal(a.rejected + b.rejected, 0, id);
    checkView(c.side.view(A, { lang: "de" }), id + " live A"); checkView(c.side.view(B, { lang: "de", tracked: { p: { x: 400, y: 300, c: 500, v: 0, vx: 300, vy: -400 } } }), id + " live B geglaettet");
  }
});

test("Anpassung: Farben und Figur in der Anzeige, Punkte zum Sieg wie die freie Karte (1-9), Foto nur als lokaler Slot", () => {
  for (const id of IDS) {
    const g = G(id);
    let { c, st } = newGame(id, ["bot", "bot"], { colA: "#c8ff00", colB: "#7a1fff", emoji: "🚀", photo: "lokal-1", photoUse: "figure" });
    for (let t = 0; t < 240; t++) st = c.step(st, [NONE, NONE]).state;
    const s = JSON.stringify(c.view(st, { seat: 0 }));
    assert.ok(s.includes("#c8ff00") && s.includes("#7a1fff"), id + ": eigene Farben");
    assert.ok(s.includes('"slot":"photo"') && !s.includes("lokal-1"), id + ": Foto nur als Slot, nie der Inhalt");
    const bg = JSON.stringify(newGame(id, ["bot", "bot"], { photo: "lokal-1", photoUse: "bg" }).c.view(newGame(id, ["bot", "bot"], { photo: "lokal-1", photoUse: "bg" }).st, {}));
    assert.ok(bg.includes('"slot":"photo"'), id + ": Foto als Hintergrund");
    const off = JSON.stringify(newGame(id, ["bot", "bot"], { photo: "lokal-1", photoUse: "off" }).c.view(newGame(id, ["bot", "bot"]).st, {}));
    assert.ok(!off.includes('"slot":"photo"'), id + ": ohne Wahl kein Foto");
    const emo = JSON.stringify(c.view(newGame(id, ["bot", "bot"], { emoji: "🚀" }).st, {}));
    assert.ok(emo.includes("🚀"), id + ": Figur-Emoji");
    // Das Foto reist nicht im Link, nur wenn der Nutzer es ausdruecklich teilt (media.local, fields.js travel).
    const p = Object.assign(defaults(manifestOf(id).params), { photo: "lokal-1", photoUse: "figure" });
    assert.equal(paramsForLink(manifestOf(id).params, p).photo, undefined, id + ": Foto nicht im Link");
    assert.equal(paramsForLink(manifestOf(id).params, p, { withLocalMedia: true }).photo, "lokal-1", id + ": nur auf ausdruecklichen Wunsch");
  }
});
test("Punkte zum Sieg (alt frei.test.js): 7 gilt, 99 ist kein Wert; eine Partie bis 1 endet nach dem ersten Punkt", () => {
  for (const id of IDS.filter((x) => x !== "arcade-elfer")) {
    const g = newGame(id, ["bot", "bot"], { win: 7 }); assert.equal(g.st.sides[0].WIN, 7, id);
    assert.equal(validParams(id, Object.assign(defaults(manifestOf(id).params), { win: 99 })), false, id + ": 99 abgelehnt");
  }
  let { c, st } = newGame("arcade-ziegel", ["bot", "bot"], { win: 1 }, "free");
  for (let i = 0; i < 120 * 300 && !c.status(st).over; i++) st = c.step(st, [NONE, NONE]).state;
  assert.ok(c.status(st).over); assert.equal(Math.max(...st.sides[0].score), 1); assert.deepEqual(st.sides[0].score, st.sides[1].score.slice().reverse());
});
test("Reduzierte Bewegung: weniger Partikel, kein Wackeln und kein Blitz in der Anzeige", () => {
  let { c, st } = newGame("arcade-panzer", ["bot", "bot"], null, "calm");
  let found = false;
  for (let t = 0; t < 120 * 60 && !found; t++) {
    st = c.step(st, [NONE, NONE]).state;
    if (st.fx[0].some((e) => e.k === "boom" && st.now / 120 - e.at < 0.05)) {
      const count = (v) => { let n = 0, sh = 0, fl = 0; for (const L of v.layers) walk(L.ops, (o) => { if (o.o === "particles") n += o.list.length; if (o.o === "shake") sh++; if (o.o === "rect" && L.id === "top" && o.alpha) fl++; }); return { n, sh, fl }; };
      const full = count(c.view(st, { reduced: false })), calm = count(c.view(st, { reduced: true }));
      assert.ok(calm.n < full.n * 0.5, "Partikel " + calm.n + " < " + full.n); assert.equal(calm.sh, 0); assert.equal(calm.fl, 0); assert.ok(full.sh + full.fl > 0);
      found = true;
    }
  }
  assert.ok(found, "ein Einschlag kam vor");
});
test("Hartes Partie-Limit: zwei Bots, die nie einen Punkt machen (Flipper stat-flipper-8), enden nach 300 s; beide Seiten gleich", () => {
  let { c, st } = newGame("arcade-flipper", ["bot", "bot"], null, "stat-flipper-8");
  let t = 0; for (; t < 120 * 400 && !c.status(st).over; t++) st = c.step(st, [NONE, NONE]).state;
  const s = c.status(st);
  assert.equal(t, 120 * 300, "Ende genau beim Limit"); assert.ok(s.over && s.timeUp);
  assert.deepEqual(st.sides[0].score, st.sides[1].score.slice().reverse(), "gespiegelt gleich");
  assert.equal(s.winner, st.sides[0].draw ? -1 : st.sides[0].score[0] > st.sides[0].score[1] ? 0 : 1);
  assert.match(c.view(st, {}).layers.at(-1).ops.map((o) => o.text || "").join(" "), /Gewonnen|Knapp|Unentschieden/);
});
test("Anzeige: kein Op traegt fill:null (der Renderer wuerde schwarz fuellen); Rahmen ohne fill", () => {
  for (const id of IDS) {
    let { c, st } = newGame(id, ["bot", "bot"]);
    for (let t = 0; t < 300; t++) st = c.step(st, [NONE, NONE]).state;
    for (const v of [c.view(st, {}), c.view(st, { thumb: true })]) for (const L of v.layers) walk(L.ops, (o) => assert.ok(o.fill !== null, id + ": " + o.o + " mit fill null"));
  }
});

// Lastunabhaengiger Aufwand je Spiel (Auftrag Integrator): deterministische Bot-Partien (Seeds w1-w3, je bis 60 s),
// gezaehlt werden Ops und Knoten der Anzeigeliste je Bild (Partikel- und Polygonpunkte zaehlen als Knoten), die Groesse
// des Zustands und die Nachrichten unterwegs je Tick. Feste Obergrenzen je Spiel (gemessen 2026-11-12, etwa +20-30 %
// Spielraum fuer andere Spielverlaeufe): eine echte Regression wird rot, egal wie ausgelastet die Maschine ist.
const WORK = {
  "arcade-kick": { ops: 110, nodes: 190, bytes: 5000, msgs: 6 }, "arcade-elfer": { ops: 85, nodes: 230, bytes: 3000, msgs: 5 },
  "arcade-ziegel": { ops: 370, nodes: 420, bytes: 3800, msgs: 5 }, "arcade-panzer": { ops: 110, nodes: 630, bytes: 6000, msgs: 6 },
  "arcade-stock": { ops: 160, nodes: 220, bytes: 7600, msgs: 3 }, "arcade-puck": { ops: 125, nodes: 205, bytes: 5700, msgs: 6 },
  "arcade-volley": { ops: 395, nodes: 850, bytes: 9800, msgs: 5 }, "arcade-flipper": { ops: 140, nodes: 210, bytes: 5500, msgs: 6 },
  "arcade-snow": { ops: 260, nodes: 490, bytes: 8900, msgs: 7 }, "arcade-murmel": { ops: 425, nodes: 600, bytes: 9400, msgs: 3 }
};
test("Aufwand je Bild und Tick ohne Uhr: Ops, Anzeigelisten-Knoten, Zustandsgroesse und Nachrichten unter festen Grenzen", () => {
  const got = {};
  for (const id of IDS) {
    const mx = { ops: 0, nodes: 0, bytes: 0, msgs: 0 };
    for (const seed of ["w1", "w2", "w3"]) {
      let { c, st } = newGame(id, ["bot", "bot"], null, seed);
      for (let t = 0; t < 120 * 60 && !c.status(st).over; t++) {
        st = c.step(st, [NONE, NONE]).state;
        mx.msgs = Math.max(mx.msgs, st.q[0].length + st.q[1].length);
        if (t % 4 === 0) { let ops = 0, nodes = 0; for (const L of c.view(st, {}).layers) walk(L.ops, (o) => { ops++; nodes += 1 + (o.o === "particles" ? o.list.length : o.o === "poly" ? o.pts.length / 2 : 0); }); mx.ops = Math.max(mx.ops, ops); mx.nodes = Math.max(mx.nodes, nodes); }
        if (t % 60 === 0) mx.bytes = Math.max(mx.bytes, JSON.stringify(st).length);
      }
    }
    got[id] = mx;
    for (const k of Object.keys(WORK[id])) assert.ok(mx[k] <= WORK[id][k], id + ": " + k + " " + mx[k] + " > " + WORK[id][k]);
  }
});
