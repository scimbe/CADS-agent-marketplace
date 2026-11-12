// Vertragstest freie Karte -> Engines: jede Ausgabe des Servers fuer Genre G1 (compose "game") und G2 (compose "lauf")
// muss genau in die Parameter-Schemata der Karten "flug" und "lauf" passen, verlustfrei (Doc -> Parameter -> Doc), und
// jeder Enum-Wert der Server-Schemata muss in den Manifesten vorkommen. Quelle: test/fixtures/karte-g1g2.json, erzeugt
// aus CADS-DEMO-wrapper lib/duell-karte.mjs; mit MDI_WRAPPER=<Pfad> wird der Server live gelesen und Drift gemeldet.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import Ajv from "ajv";
import flug from "../src/cards/flug/card.js";
import lauf from "../src/cards/lauf/card.js";
import * as FP from "../src/engines/flug/params.js";
import * as LP from "../src/engines/lauf/params.js";

const require = createRequire(import.meta.url);
let FIX = require("./fixtures/karte-g1g2.json");
if (process.env.MDI_WRAPPER) {
  const sha = execFileSync("git", ["-C", process.env.MDI_WRAPPER, "rev-parse", "--short", "HEAD"]).toString().trim();
  const live = JSON.parse(execFileSync(process.execPath, [new URL("./fixtures/mk-karte-g1g2.mjs", import.meta.url).pathname, process.env.MDI_WRAPPER, sha]).toString());
  test("Server live (MDI_WRAPPER): Schemata und Ausgaben gleich der Fixture", () => {
    assert.deepEqual(live.schemas, FIX.schemas, "Server-Schema G1/G2 geaendert: Fixture neu erzeugen und Karten anpassen");
    assert.deepEqual(live.cases.map((c) => c.doc), FIX.cases.map((c) => c.doc));
  });
  FIX = live;
}
const ajv = new Ajv({ strict: false, allErrors: true });
const vFlug = ajv.compile(flug.manifest.params), vLauf = ajv.compile(lauf.manifest.params);
const errs = (v) => JSON.stringify(v.errors);

test("G1: jede Server-Ausgabe (compose game) wird gueltige Parameter der Karte flug, verlustfrei und spielbar", () => {
  const cases = FIX.cases.filter((c) => c.art === "game");
  assert.ok(cases.length >= 190, "Fall-Anzahl " + cases.length);
  let ok = 0;
  for (const c of cases) {
    const p = flug.fromFree(c.doc);
    if (!c.doc) { assert.equal(p, null, "kein Doc -> null"); continue; }
    assert.ok(p, "Doc gelesen: " + c.slots.title);
    const full = Object.assign({}, Object.fromEntries(Object.entries(flug.manifest.params.properties).map(([k, d]) => [k, d.default])), p);
    assert.ok(vFlug(full), c.slots.title + ": " + errs(vFlug));
    // verlustfrei: der Server-Doc kommt identisch zurueck (ohne die Felder, die nicht reisen)
    assert.deepEqual(flug.toFree(p), c.doc, c.slots.title + ": Rundreise");
    // Physik: Level-Werte und Routen-Schritte des Servers kommen 1:1 an
    const lv = FIX.LEVELS[c.slots.level] || FIX.LEVELS.normal;
    assert.deepEqual({ gravity: p.gravity, jump: p.jump, gap: p.gap, speed: p.speed }, lv);
    assert.deepEqual(p.route.map((r) => r.p), c.doc.g.route.map((r) => r.p));
    // spielbar: init + 240 Ticks mit Bot
    let st = flug.init({ params: full, seed: "x", players: 1 });
    for (let t = 0; t < 240; t++) st = flug.step(st, [flug.bot(st, 0, { level: 2 })], t).state;
    assert.ok(st.sims[0].ticks > 0); ok++;
  }
  assert.ok(ok >= 190);
});

test("G2: jede Server-Ausgabe (compose lauf) wird gueltige Parameter der Karte lauf, verlustfrei und spielbar", () => {
  const cases = FIX.cases.filter((c) => c.art === "lauf");
  assert.ok(cases.length >= 48);
  for (const c of cases) {
    const p = lauf.fromFree(c.doc);
    if (!c.doc) { assert.equal(p, null); continue; }
    const full = Object.assign({}, Object.fromEntries(Object.entries(lauf.manifest.params.properties).map(([k, d]) => [k, d.default])), p);
    assert.ok(vLauf(full), c.slots.title + ": " + errs(vLauf));
    assert.deepEqual(lauf.toFree(p), c.doc, c.slots.title + ": Rundreise");
    assert.deepEqual(LP.laufOf(p), c.doc.l, "Dokument l gleich");
    assert.equal(p.ev, 1, "build() setzt EV");
    let st = lauf.init({ params: full, seed: "x", players: 1 });
    for (let t = 0; t < 240; t++) st = lauf.step(st, [lauf.bot(st, 0)], t).state;
    assert.ok(st.sims[0].ticks > 0);
  }
});

test("Abdeckung: jeder Enum-Wert der Server-Schemata G1/G2 ist in den Manifesten erlaubt und kommt in einem Fall vor", () => {
  const G = FIX.schemas.game.properties, L = FIX.schemas.lauf.properties, FM = flug.manifest.params.properties, LM = lauf.manifest.params.properties;
  const incl = (a, b, what) => { for (const x of a) assert.ok(b.includes(x), what + ": " + x); };
  incl(G.theme.enum, FM.theme.enum, "Welt"); incl(G.route.items.properties.thema.enum, FM.route.items.properties.t.enum, "Abschnittswelt");
  incl(G.motif.enum, FM.look.properties.d.enum, "Motiv"); incl(G.route.items.properties.physik.enum, FM.route.items.properties.p.enum, "Physik-Schritt");
  incl(Object.keys(FIX.LEVELS), G.level.enum, "Level");
  incl(L.world.enum, LM.w.enum, "Laufwelt"); incl(L.mode.enum, LM.m.enum, "Modus"); incl(L.figure.enum, LM.e.enum, "Figur");
  incl(L.obstacle.enum, LM.o.enum, "Hindernis"); incl(L.coin.enum, LM.c.enum, "Sammeln"); incl(L.foe.enum, LM.f.enum, "Gegner"); incl(L.foes.items.enum, LM.fp.items.enum, "Gegnerbewegung");
  incl(Object.keys(FIX.LAUF_LEVELS), L.level.enum, "Lauf-Level");
  assert.deepEqual(FIX.LAUF_LEVELS, LP.LEVELS, "Lauf-Level-Tabelle gleich dem Server (vendored lauf-engine.js)");
  assert.deepEqual(FIX.LAUF_HAS, LP.HAS, "HAS gleich");
  assert.deepEqual(FIX.GENRE_ENGINE, { G1: "flug", G2: "lauf" });
  // jeder Wert kam in mindestens einem Fall wirklich an
  const docs = FIX.cases.filter((c) => c.doc), seen = (f) => new Set(docs.flatMap(f));
  incl(G.theme.enum, [...seen((c) => (c.art === "game" ? [c.doc.g.theme] : []))], "Fall Welt");
  incl(G.emoji.enum, [...seen((c) => (c.art === "game" ? [c.doc.g.emoji] : []))], "Fall Figur");
  incl(G.route.items.properties.physik.enum, [...seen((c) => (c.art === "game" ? c.doc.g.route.map((r) => r.p) : []))], "Fall Physik");
  incl(L.world.enum, [...seen((c) => (c.art === "lauf" ? [c.doc.l.w] : []))], "Fall Laufwelt");
  incl(L.foes.items.enum, [...seen((c) => (c.art === "lauf" ? c.doc.l.fp : []))], "Fall Gegnerbewegung");
  // Server-Emoji ueberlebt die Bereinigung der Engine unveraendert
  for (const e of G.emoji.enum) assert.equal(FP.gameOf({ emoji: e }).emoji, e, "Emoji " + e);
});

test("Karten-Export fuer Strang K: fromFree/toFree, null bei fremden Docs, Siegel ki und fr bleiben", () => {
  assert.equal(flug.fromFree({ k: "lauf", l: {} }), null); assert.equal(lauf.fromFree({ k: "game", g: {} }), null);
  assert.equal(flug.fromFree(null), null); assert.equal(lauf.fromFree("x"), null);
  const ki = { k: "karte", s: "s2.karte.mw3abcde.AnlRQb9jJYrLILMRBtJj7yR1qlhJF0ER", h: "h".repeat(43) };
  const g1 = FIX.cases.find((c) => c.art === "game" && c.doc).doc;
  const p = flug.fromFree({ ...g1, ki, fr: "abcdefghijklmnopqrstuv" });
  assert.deepEqual(p.ki, ki); assert.equal(p.fr, "abcdefghijklmnopqrstuv");
  assert.deepEqual(flug.toFree(p).ki, ki);
});
