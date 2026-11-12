// Strang F, Stufe 1 (ADR 0001 a, f, g): Kartenregister, Zugvertrag v0.2, SDK 0.2, Textfilter, Erweiterungspunkte.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generate, discover, GenError } from "../scripts/gen.js";
import * as S from "../src/contract/session.js";
import * as SDK from "../src/contract/sdk.js";
import { clean, fold, whyNot } from "../src/contract/text.js";
import { deriveModes, playOf } from "../src/contract/modes.js";
import { withFeatures, featureEffects, featureContext, chart, guards, actions, machine, initialContext } from "../src/app/machine.js";
import { pack } from "../src/app/konto.js";
import * as G from "../src/app/game.js";
import { CARDS, ORDER, VARIANTS, LEGACY, validInput, codeHash } from "../src/cards/index.js";
import fx from "./fixtures/cards/fx-zug/card.js";
import { counter } from "./helpers.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIX = path.join(ROOT, "test/fixtures/cards");

// ---------- (a) Register ----------
test("Register: entdeckt alle Kartenordner aus den Manifesten (keine Handpflege), _-Ordner bleiben draussen", () => {
  const dirs = discover(path.join(ROOT, "src/cards"));
  assert.deepEqual([...dirs].sort(), Object.keys(CARDS).sort());
  assert.deepEqual([...ORDER].sort(), [...dirs].sort());
  for (const id of dirs) assert.match(codeHash(id), /^[0-9a-f]{32}$/);
  assert.match(fs.readFileSync(path.join(ROOT, "src/cards/index.js"), "utf8"), /^\/\/ ERZEUGT von scripts\/gen\.js/);
});

function tmpCards(files) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "mdi-gen-"));
  for (const [f, s] of Object.entries(files)) { const p = path.join(base, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof s === "string" ? s : Buffer.isBuffer(s) ? s : JSON.stringify(s)); }
  return base;
}
const man = (id, extra = {}) => ({ id, version: "1.0.0", sdk: "mdi-sdk/0.2", kind: "card", mode: "static", title: { de: "T", en: "T" }, players: { min: 1, max: 1 }, hidden: "none", uses: [], limits: { stepBudget: 1, stateBytes: 1024 }, params: { type: "object", properties: {} }, parts: [], ...extra });
const CARD = 'import manifest from "./manifest.json" with { type: "json" }; export default { manifest };';
function rejects(files, re) {
  const base = tmpCards(files);
  try { assert.throws(() => generate({ cardsDir: path.join(base, "cards") }), (e) => e instanceof GenError && re.test(e.message), String(re)); }
  finally { fs.rmSync(base, { recursive: true, force: true }); }
}

test("Register lehnt ab statt zu raten: Ordner/id, Schema, fehlende Dateien, Budgets, Harness, Varianten, rt", () => {
  rejects({ "cards/aa/manifest.json": man("bb"), "cards/aa/card.js": CARD }, /passt nicht zum Ordner/);
  rejects({ "cards/aa/manifest.json": { ...man("aa"), kind: "spiel" }, "cards/aa/card.js": CARD }, /Manifest ungueltig/);
  rejects({ "cards/aa/manifest.json": man("aa") }, /Pflicht/);
  rejects({ "cards/aa/manifest.json": man("aa", { thumb: { src: "shot", file: "thumb.webp", alt: { de: "a", en: "a" } } }), "cards/aa/card.js": CARD }, /Thumbnail fehlt/);
  rejects({ "cards/aa/manifest.json": man("aa", { thumb: { src: "shot", file: "thumb.webp", alt: { de: "a", en: "a" } } }), "cards/aa/card.js": CARD, "cards/aa/thumb.webp": Buffer.alloc(61 * 1024) }, /Thumbnail .* > /);
  rejects({ "cards/aa/manifest.json": man("aa", { assets: [{ id: "w", type: "json", file: "w.json" }] }), "cards/aa/card.js": CARD, "cards/aa/w.json": Buffer.alloc(65 * 1024, 32) }, /Budget/);
  rejects({ "cards/aa/manifest.json": man("aa"), "cards/aa/card.js": CARD + " Math.sin(1);" }, /Harness.*Math\.sin/);
  rejects({ "cards/aa/manifest.json": man("aa"), "cards/aa/card.js": 'import x from "../../engines/e/x.js"; ' + CARD, "engines/e/x.js": "export default Date.now();" }, /Harness .*engines\/e\/x\.js.*Date/);
  rejects({ "cards/aa/manifest.json": man("aa", { params: { type: "object", properties: { n: { type: "integer", maximum: 3, default: 1, "x-field": "number", "x-label": { de: "n", en: "n" } } } }, variants: [{ id: "aa-b", title: { de: "b", en: "b" }, params: { n: 9 } }] }), "cards/aa/card.js": CARD }, /Variante aa-b/);
  const rt = { tick: 120, view: { w: 100, h: 100 }, numeric: "int", net: "none", maxTicks: 100, controls: { buttons: [{ id: "tap", kind: "pulse", keys: [], zone: "any" }] } };
  rejects({ "cards/aa/manifest.json": man("aa", { kind: "realtime", mode: "realtime", rt }), "cards/aa/card.js": CARD }, /Manifest ungueltig/);
  rejects({ "cards/aa/manifest.json": man("aa", { kind: "realtime", mode: "turn", rt: { ...rt, controls: { buttons: [] } } }), "cards/aa/card.js": CARD }, /realtime/);
});

test("Register: Code-Hash folgt jeder gebuendelten Datei (auch Engines) und den Assets, nicht dem Thumbnail", () => {
  const files = { "cards/aa/manifest.json": man("aa", { assets: [{ id: "w", type: "json", file: "w.json" }], thumb: { src: "shot", file: "t.webp", alt: { de: "a", en: "a" } } }), "cards/aa/card.js": 'import x from "../../engines/e/x.js"; ' + CARD, "engines/e/x.js": "export default 1;", "cards/aa/w.json": "[1]", "cards/aa/t.webp": "x" };
  const base = tmpCards(files), dir = path.join(base, "cards");
  try {
    const h0 = generate({ cardsDir: dir })["gen/codehash.js"];
    fs.writeFileSync(path.join(base, "engines/e/x.js"), "export default 2;");
    const h1 = generate({ cardsDir: dir })["gen/codehash.js"];
    fs.writeFileSync(path.join(dir, "aa/w.json"), "[2]");
    const h2 = generate({ cardsDir: dir })["gen/codehash.js"];
    fs.writeFileSync(path.join(dir, "aa/t.webp"), "y");
    const h3 = generate({ cardsDir: dir })["gen/codehash.js"];
    assert.notEqual(h0, h1, "Engine-Datei"); assert.notEqual(h1, h2, "Asset"); assert.equal(h2, h3, "Thumbnail aendert die Spielidentitaet nicht");
    assert.deepEqual(JSON.parse(generate({ cardsDir: dir })["gen/assets.json"]).aa.thumbs, [{ file: "t.webp", src: "shot", bytes: 1 }]);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test("Register: Fixture-Register mit Eingabe-Schema, Varianten und Legacy-ids erzeugt Validatoren", async () => {
  const out = generate({ cardsDir: FIX });
  assert.match(out["gen/validators.js"], /export const inputs_fx_zug/);
  assert.match(out.index, /VARIANTS/);
  assert.match(out.index, /LEGACY/);
  assert.equal(typeof VARIANTS, "object"); assert.equal(typeof LEGACY, "object");
  assert.equal(validInput("bluff", { t: "say", seat: 0, v: 3 }), true, "Karten ohne inputs pruefen ueber moves()");
  assert.equal(validInput("gibtsnicht", { t: "x", seat: 0 }), false);
});

// ---------- (f) Zugvertrag v0.2 ----------
const ent = () => counter("e");
function fxSession(mine = [0, 1, 2]) {
  const e = ent(), { secrets, commits } = S.makeSecrets(fx, mine, e);
  return S.newSession(fx, { params: { rounds: 1 }, seed: "s".repeat(32), mine, secrets, commits });
}
function drain(s) { for (let r = S.dueReveal(fx, s); r; r = S.dueReveal(fx, s)) s = S.apply(fx, s, r); return s; }

test("v0.2 status.auto: Pflichtzuege fuer eigene Sitze laufen ohne Entscheidung, fremde nicht", () => {
  let s = drain(fxSession());
  assert.deepEqual(s.log.map((x) => x.t), ["deal", "deal", "deal"]);
  assert.equal(S.status(fx, s).auto, false);
  const only0 = fxSession([0]);
  assert.deepEqual(S.dueReveal(fx, only0), { t: "deal", seat: 0 });
  const after = S.apply(fx, only0, S.dueReveal(fx, only0));
  assert.equal(S.dueReveal(fx, after), null, "Sitz 1 gehoert nicht diesem Geraet");
});

test("v0.2 accepts: freie Texteingaben ohne Aufzaehlung; step prueft trotzdem; Groesse begrenzt", () => {
  let s = drain(fxSession());
  s = S.apply(fx, s, { t: "say", seat: 0, a: "Pizza für alle", d: 20000 });
  assert.equal(s.state.pub.said[0][1], "Pizza für alle");
  assert.throws(() => S.apply(fx, s, { t: "say", seat: 1, a: "ruf an: 0171 2345678", d: 20000 }), (e) => e.code === "zug-ungueltig");
  assert.throws(() => S.apply(fx, s, { t: "say", seat: 1, a: "x".repeat(3000), d: 1 }), (e) => e.code === "eingabe" && /zu gross/.test(e.message));
  assert.throws(() => S.apply(fx, s, { t: "say", seat: 1, a: "ok", d: 1.5 }), (e) => e.code === "eingabe");
});

test("v0.2 toWire: Snapshot-Karten verdichten ihr Log ueber compact", () => {
  const card = { ...fx, compact: (log) => log.filter((x) => x.t !== "deal") };
  const s = drain(fxSession());
  assert.equal(S.toWire(s).m.length, 3);
  assert.equal(S.toWire(s, card).m.length, 0);
});

test("v0.2 modes/play: manifest.modes und Varianten schneiden, play.default liegt in offer", () => {
  assert.deepEqual(deriveModes(fx), ["alone", "bot", "link", "live"], "3 Sitze: Bot und Gruppen-Live");
  assert.deepEqual(deriveModes(fx, "fx-zug-kurz"), ["alone"]);
  assert.deepEqual(playOf(fx), { default: "alone", offer: ["alone", "bot", "link"] });
  const p = { manifest: { ...fx.manifest, play: { default: "link", offer: ["link", "live"] } } };
  assert.deepEqual(playOf(p), { default: "link", offer: ["link", "live"] });
  const rt = { manifest: { mode: "realtime", players: { min: 1, max: 2 }, rt: { net: "split", ghost: { bytes: 100 } } }, bot() {} };
  assert.deepEqual(deriveModes(rt), ["alone", "bot", "live"], "Geist ist kein waehlbarer Modus");
  assert.deepEqual(deriveModes({ ...rt, bot: undefined, manifest: { ...rt.manifest, rt: { net: "none" } } }), ["alone"]);
});

test("v0.2 Abdecken vor dem ersten Zug (alone) und Kontext fuer view (today, age18, nick, draft)", () => {
  const rnd = counter("c"), R = () => [rnd(), rnd(), rnd(), rnd()];
  let s = machine.send(machine.initial(initialContext("de")), { type: "OPEN", id: "bluff", rand: R() });
  s = machine.send(s, { type: "MODE", mode: "alone", rand: R() });
  s = machine.send(s, { type: "GO", rand: R() });
  assert.ok(machine.matches(s, "inhalt.card.play.cover"));
  s = machine.send(s, { type: "COVER_OK", rand: R() });
  assert.ok(machine.matches(s, "inhalt.card.play.turn"));
  assert.equal(s.ctx.coveredFor, 0);
  s = machine.send(s, { type: "DRAFT", draft: { x: 1 }, rand: R() });
  assert.deepEqual(G.viewCtx({ ...s.ctx, today: 20400 }), { lang: "de", today: 20400, draft: { x: 1 }, memo: null, age18: false, nick: s.ctx.me ? s.ctx.me.nick || "" : "" });
  assert.equal(G.todayOf(Date.UTC(2026, 10, 12, 23, 59)), 20769);
});

// ---------- SDK 0.2 ----------
test("SDK 0.2: rng-Zustand serialisierbar, mulberry32 wie Altcode, expD/sinD/cosD nahe an Math, stateHashF", () => {
  const r = SDK.rng("x"); r.u32(); r.u32();
  const st = r.state(), a = [r.u32(), r.u32()], b = SDK.rngFrom(st);
  assert.deepEqual([b.u32(), b.u32()], a);
  assert.throws(() => SDK.rngFrom([1, 2, 3]), RangeError);
  const m = SDK.mulberry32(42), first = [m(), m(), m()];
  const m2 = SDK.mulberry32(42); assert.deepEqual([m2(), m2(), m2()], first);
  for (const v of first) assert.ok(v >= 0 && v < 1);
  for (const x of [-20, -1.5, 0, 0.3, 1, 7.25, 50]) assert.ok(Math.abs(SDK.expD(x) / Math.exp(x) - 1) < 1e-14, "exp " + x);
  for (let x = -40; x <= 40; x += 0.37) { assert.ok(Math.abs(SDK.sinD(x) - Math.sin(x)) < 1e-13, "sin " + x); assert.ok(Math.abs(SDK.cosD(x) - Math.cos(x)) < 1e-13, "cos " + x); }
  assert.equal(SDK.stateHashF({ a: 0.1 }), SDK.stateHashF({ a: 0.1 }));
  assert.notEqual(SDK.stateHashF({ a: 0.1 }), SDK.stateHashF({ a: 0.1 + 1e-17 + 1e-16 }));
  assert.equal(SDK.stateHashF({ a: 1, b: [2] }), SDK.stateHash({ a: 1, b: [2] }), "Ganzzahlen wie canon");
});

// ---------- Text ----------
test("Text: clean/fold wie Altcode (quest.js, core.js, kontakt.js)", () => {
  assert.equal(clean("  Hallo   <b>Welt</b> ", 40), "Hallo b Welt /b");
  assert.equal(clean("Pizza", 3), "Piz");
  assert.equal(clean("ruf mich an 0171 2345678", 40), "");
  assert.equal(clean("schreib mir auf insta", 40), "");
  assert.equal(clean("du bist so hässlich", 40), "");
  assert.equal(clean("Treffpunkt Bahnhof", 40), "");
  assert.equal(clean("Treffpunkt Bahnhof", 40, { meet: false }), "Treffpunkt Bahnhof");
  assert.equal(whyNot("f.u.c.k"), "word"); assert.equal(whyNot("lisa@gmx.de"), "contact"); assert.equal(whyNot("250000 Punkte"), "");
  assert.equal(fold("Größe Ärger"), "grossearger");
});

// ---------- (g) Erweiterungspunkte ----------
test("Features: Zustaende, vorgezogene Uebergaenge, angehaengte entry-Aktionen, Effekte und Kontext; Konflikte werfen", () => {
  const f = {
    id: "demo",
    states: { demo: { on: { BACK: "inhalt.shelf" } } },
    shelfOn: { DEMO: "inhalt.demo" },
    on: { inhalt: { LINK: { target: "inhalt.demo", cond: "isDemo" } } },
    entry: { "inhalt.card.share": ["demoArchive"] },
    guards: { isDemo: (ctx, ev) => ev.hash === "#demo" },
    actions: { demoArchive: (ctx) => ({ ...ctx, archived: (ctx.archived || 0) + 1 }) },
    context: () => ({ archived: 0 }),
    effects: { "demo.fx": () => {} }
  };
  const c = withFeatures(chart, guards, actions, [f]);
  assert.equal(c.chart.states.inhalt.on.LINK[0].target, "inhalt.demo", "Feature-Uebergang wird zuerst geprueft");
  assert.equal(c.chart.states.inhalt.on.LINK.length, 4);
  assert.deepEqual(c.chart.states.inhalt.states.card.states.share.entry.slice(-1), ["demoArchive"]);
  assert.equal(chart.states.inhalt.on.LINK.length, 3, "Basisdiagramm unveraendert");
  assert.deepEqual(featureContext([f], null), { archived: 0 });
  assert.deepEqual(Object.keys(featureEffects([f])), ["demo.fx"]);
  assert.throws(() => withFeatures(chart, guards, actions, [f, { ...f }]), /doppelt/);
  assert.throws(() => withFeatures(chart, guards, actions, [{ id: "x", guards: { cardExists: () => true } }]), /doppelt/);
  assert.throws(() => withFeatures(chart, guards, actions, [{ id: "x", on: { "inhalt.gibts": { A: "inhalt.shelf" } } }]), /fehlt/);
  assert.throws(() => withFeatures(chart, guards, actions, [{ id: "a", states: { shelf: {} } }, { id: "b", states: { shelf: {} } }]), /shelf/);
});

test("Konto pack: lokale Wand und gemerkte Karten haben Vorrang (Wand-Sync, Strang H)", () => {
  const me = { nick: "Ada", emoji: "🙂", colors: ["yellow", "ink"], set: "a" };
  assert.deepEqual(pack(me, { wall: [1], saved: ["x"] }).wall, [1]);
  assert.deepEqual(pack(me, { wall: [1], saved: ["x"] }, { wall: [2] }).wall, [2]);
  assert.deepEqual(pack(me, { wall: [1], saved: ["x"] }, { saved: [] }).saved, []);
});
