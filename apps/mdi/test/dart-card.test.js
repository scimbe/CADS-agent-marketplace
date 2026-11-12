// Karte spiel-dart auf Vertragsebene: Zustand nur Ganzzahlen/Strings, Zuege pruefen wie der Altcode (ok), Bert als
// einziger Bot-Zug, Ansichten in de/en, Brett-Daten, Link-Rundreise und Linkgroesse.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import card from "../src/cards/spiel-dart/card.js";
import * as B from "../src/cards/spiel-dart/board.js";
import * as D from "../src/engines/dart/dart.js";
import * as S from "../src/contract/session.js";
import { rng, canon, stateHash } from "../src/contract/sdk.js";
import { chooseMove } from "../src/bot/ismcts.js";
import { encode, decode, MAX_FRAGMENT } from "../src/app/link.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SESSION_SRC = fs.readFileSync(path.join(HERE, "../src/contract/session.js"), "utf8");
const HAS_ACCEPTS = /\.accepts\b/.test(SESSION_SRC);
const WAIT_F = HAS_ACCEPTS ? false : "wartet auf den accepts-Hook in src/contract/session.js (Strang F)";

function onto(seed, k, x, y) { const h = D.hand(seed, k); return D.dart(x - h.sx, y - h.sy, D.MID); }
function spot(f) { if (f === "B") return [0, 0]; if (f === "0") return [1.2, 0.4]; return D.centre(+f.slice(1), { T: "t", D: "d", S: "s" }[f[0]]); }
function chars(seed, k0, fields) { return fields.map((f, i) => { const p = spot(f); return D.enc(onto(seed, k0 + i, p[0], p[1])); }).join(""); }
function fresh(spiel = "a", tag = "t") { return card.init({ rng: rng(tag), params: { spiel } }); }
const turn = (seat, d, c = 0, n) => (n === undefined ? { t: "turn", seat, d, c } : { t: "turn", seat, d, c, n });
const ok = (st, seat, x) => card.accepts(card.observe(st, seat), seat, x);
function k(st) { return D.sim(st.pub.seed, st.pub.s).k; }

// Primitive, die der Renderer kennt (src/render/render.js)
const PRIM = new Set(["frame", "stack", "row", "text", "shape", "tile", "choice"]);
function walk(n, f) { f(n); for (const c of n.children || []) walk(c, f); }
function texts(v) { const out = []; walk(v, (n) => { if (n.t === "text") out.push(n.text); }); return out; }

test("Init: Seed aus dem Init-rng, Zustand kanonisch (nur Ganzzahlen/Strings), Spielart aus den Parametern", () => {
  const a = fresh("c", "x"), b = fresh("c", "x"), c = fresh("c", "y");
  assert.match(a.pub.seed, /^[0-9a-f]{16}$/); assert.equal(a.pub.seed, b.pub.seed); assert.notEqual(a.pub.seed, c.pub.seed);
  assert.equal(a.pub.s, "cl"); assert.doesNotThrow(() => canon(a));
  assert.deepEqual(card.status(a), { over: false, turn: 0, reveal: false, score: [0, 0], winner: -1, bot: false });
  assert.deepEqual(card.status(fresh("a")).score, [301, 301]);
});

test("Zug pruefen wie der Altcode: nur ganze Aufnahmen, richtiger Sitz, Behauptung 0..999, Namen durch den Filter", () => {
  const st = fresh("a"), s = st.pub.seed, d3 = chars(s, 0, ["T20", "S5", "S1"]);
  assert.ok(ok(st, 0, turn(0, d3, 66)));
  assert.equal(ok(st, 1, turn(1, d3, 66)), false, "falscher Sitz");
  assert.equal(ok(st, 0, turn(0, d3.slice(0, 10), 66)), false, "Aufnahme nicht fertig");
  assert.equal(ok(st, 0, turn(0, d3 + "AAAAA", 66)), false, "ein Pfeil zu viel");
  assert.equal(ok(st, 0, turn(0, d3.slice(0, -1), 66)), false, "halber Pfeil");
  assert.equal(ok(st, 0, turn(0, d3, 1000)), false, "Behauptung ausserhalb 0..999");
  assert.equal(ok(st, 0, turn(0, d3, 66, "Bert")), false, "Bildschirmwort als Name");
  assert.ok(ok(st, 0, turn(0, d3, 180)), "falsche Punkte sind erlaubt und werden nachgerechnet");
  const a = card.step(st, turn(0, d3, 180, "Ana"));
  assert.deepEqual([a.pub.c, a.pub.n], [180, ["Ana", ""]]);
  assert.equal(ok(a, 1, turn(1, chars(s, 3, ["S1", "S1", "S1"]), 3, "Ana")), false, "der verkleidete Name des anderen");
  assert.equal(ok(a, 1, turn(1, chars(s, 3, ["S1", "S1", "S1"]), 3, "Аna")), false, "kyrillisches A");
  const b = card.step(a, turn(1, chars(s, 3, ["S1", "S1", "S1"]), 3, "Ben"));
  assert.deepEqual(b.pub.n, ["Ana", "Ben"]);
  assert.throws(() => card.step(b, turn(1, chars(s, 6, ["S1", "S1", "S1"]), 3)), /ungueltig/);
  // Bust nach einem Pfeil beendet die Aufnahme: 1 Pfeil ist dann eine ganze Aufnahme (alt sim)
  let x = fresh("a", "bust"); const xs = x.pub.seed;
  x = card.step(x, turn(0, chars(xs, 0, ["T20", "T20", "T20"]))); x = card.step(x, turn(1, chars(xs, 3, ["0", "0", "0"])));
  x = card.step(x, turn(0, chars(xs, 6, ["T20", "T19", "S2"]))); x = card.step(x, turn(1, chars(xs, 9, ["0", "0", "0"])));
  assert.ok(ok(x, 0, turn(0, chars(xs, 12, ["S2"]))), "S2 auf 2: Bust nach einem Pfeil");
  assert.equal(ok(x, 0, turn(0, chars(xs, 12, ["S2", "S1"]))), false, "nach dem Bust kein Pfeil mehr");
});

test("Kanonischer Zustand und gleicher Hash bei gleicher Folge; Punkte stehen nie im Zustand", () => {
  const play = () => { let st = fresh("d", "h"); const s = st.pub.seed; for (let t = 0; t < 6; t++) st = card.step(st, turn(t % 2, chars(s, t * 3, ["T20", "S1", "0"]), 81)); return st; };
  const a = play(), b = play();
  assert.equal(stateHash(a), stateHash(b)); assert.deepEqual(Object.keys(a.pub).sort(), ["c", "mode", "n", "s", "seed"]);
  assert.ok(card.status(a).over); assert.equal(card.status(a).winner, -1, "gleich viel: Unentschieden");
});

test("Bert: einziger Zug fuer Sitz 1, Pfeile aus dem Seed; danach rechnet die Engine jede Bert-Aufnahme selbst", () => {
  let st = fresh("a", "bert"); const s = st.pub.seed;
  assert.deepEqual(card.moves(card.observe(st, 1), 1), [], "Sitz 1 ist noch nicht dran");
  st = card.step(st, turn(0, chars(s, 0, ["T20", "T20", "T20"]), 180));
  assert.deepEqual(card.moves(card.observe(st, 1), 1), [{ t: "bert", seat: 1 }]);
  assert.equal(ok(st, 0, { t: "bert", seat: 0 }), false);
  const mv = chooseMove(card, card.observe(st, 1), 1, { iterations: 60, seed: "x" });
  assert.deepEqual(mv, { t: "bert", seat: 1 });
  const viaBot = card.step(st, mv);
  assert.equal(viaBot.pub.s[1], "b"); assert.equal(card.status(viaBot).turn, 0); assert.equal(card.status(viaBot).bot, true);
  assert.equal(D.sim(s, viaBot.pub.s).turns.length, 2, "Berts Aufnahme folgt sofort");
  assert.equal(card.accepts(card.observe(viaBot, 1), 1, { t: "bert", seat: 1 }), false, "nur einmal");
  // bis zum Ende: Mensch wirft (auf Berts Ziele), Bert folgt aus dem Seed; das Ergebnis nennt Bert
  let g = D.sim(s, viaBot.pub.s), cur = viaBot;
  for (let i = 0; i < 40 && !card.status(cur).over; i++) {
    const aim = D.aimFor(g, 0), c = D.centre(aim.n, aim.r);
    let d = ""; for (let j = 0; j < 3; j++) { const trial = cur.pub.s + d + D.enc(D.dart(c[0], c[1], D.MID)); d += D.enc(D.dart(c[0], c[1], D.MID)); const tg = D.sim(s, trial); if (!tg.partial) break; }
    cur = card.step(cur, turn(0, d, 0)); g = D.sim(s, cur.pub.s);
  }
  assert.ok(card.status(cur).over);
  const v = texts(card.view(card.observe(cur, 0), 0, { lang: "de" }));
  assert.ok(v.some((t) => /Bert|Du schlägst Bert|Unentschieden/.test(t)), v.join(" | "));
  // ein Mensch auf Sitz 1 schliesst Bert aus
  const human = card.step(st, turn(1, chars(s, 3, ["S1", "S1", "S1"]), 3));
  assert.deepEqual(card.moves(card.observe(human, 1), 1), []);
  assert.equal(card.accepts(card.observe(human, 1), 1, { t: "bert", seat: 1 }), false);
});

test("Ansichten de/en: nur bekannte Primitive, Stand, Aufnahme, Korrekturhinweis, Ergebnis", () => {
  let st = fresh("a", "v"); const s = st.pub.seed;
  for (const lang of ["de", "en"]) {
    const pv = card.view(card.observe(st, 0), 0, { lang, preview: true });
    walk(pv, (n) => assert.ok(PRIM.has(n.t), n.t));
    assert.ok(texts(pv).includes(D.T(lang).da_m_a));
  }
  assert.ok(texts(card.view(card.observe(st, 0), 0, { lang: "de" })).includes("Wähle das Spiel und wirf."));
  st = card.step(st, turn(0, chars(s, 0, ["T20", "S5", "S1"]), 180));
  const v1 = card.view(card.observe(st, 1), 1, { lang: "de" });
  walk(v1, (n) => assert.ok(PRIM.has(n.t), n.t));
  const t1 = texts(v1);
  assert.ok(t1.includes("Im Link standen 180 Punkte, nachgerechnet sind es 66."), t1.join(" | "));
  assert.ok(t1.includes("Wirf deine drei Pfeile."));
  let tiles = 0; walk(v1, (n) => { if (n.t === "tile") { tiles++; assert.ok(n.a11y.length > 5); } }); assert.equal(tiles, 3);
  const en = texts(card.view(card.observe(st, 1), 1, { lang: "en" }));
  assert.ok(en.includes("The link said 180 points; counted again it is 66."));
  let x = fresh("d", "w"); const xs = x.pub.seed;
  for (let t = 0; t < 6; t++) x = card.step(x, turn(t % 2, chars(xs, t * 3, t % 2 ? ["S1", "S1", "S1"] : ["T20", "T20", "T20"]), t % 2 ? 3 : 180));
  assert.ok(texts(card.view(card.observe(x, 0), 0, { lang: "de" })).includes("Du gewinnst!"));
  assert.ok(texts(card.view(card.observe(x, 1), 1, { lang: "de" })).includes("Gegner gewinnt!"));
});

test("Brett-Daten: 20 Zahlen, 80 Ringsektoren, Bull, Pfeile; Zielen auf (63 Optionen) trifft die Feldmitte", () => {
  let st = fresh("a", "b"); const s = st.pub.seed;
  st = card.step(st, turn(0, chars(s, 0, ["T20", "S5", "S1"]), 66));
  const items = B.boardItems(st.pub, "de");
  assert.equal(items.filter((i) => i.k === "sector").length, 80);
  assert.equal(items.filter((i) => i.k === "text").length, 20);
  assert.equal(items.filter((i) => i.k === "dart").length, 3);
  for (const i of items) for (const key of ["r", "r0", "r1", "x", "y"]) if (key in i) assert.ok(Number.isInteger(i[key]), key);
  const opts = B.aimOptions("de"); assert.equal(opts.length, 63); assert.equal(opts[3].label, "Triple 20");
  for (const o of opts.slice(1)) {
    const g = B.aimGrid(o.v), a = D.aimOf({ ax: g[0], ay: g[1] }), h = D.score(a[0], a[1]);
    const want = o.v === "50" ? [25, 2] : o.v === "25" ? [25, 1] : [Number(o.v.slice(1)), { t: 3, d: 2, s: 1 }[o.v[0]]];
    assert.deepEqual([h.n, h.m], want, o.v);
  }
  assert.equal(B.aimGrid(""), null);
  assert.equal(B.dartChars(2048, 2048, 4, false), D.enc({ ax: 2048, ay: 2048, p: 4 }));
  assert.equal(D.dec(B.dartChars(0, 4095, 8, true))[0].f, 1);
  assert.throws(() => B.dartChars(4096, 0, 4)); assert.throws(() => B.dartChars(0, 0, 9));
  const inp = B.turnInput(0, [B.dartChars(2048, 1442, 4), B.dartChars(2048, 1442, 4), B.dartChars(2048, 1442, 4)], 60);
  assert.equal(inp.d.length, 15); assert.equal("n" in inp, false);
  assert.equal(B.powerAt(s, 0, 0), D.hand(s, 0).lv);
});

test("Link-Rundreise auf Vertragsebene: toWire/fromWire spielt jede Aufnahme nach", { skip: WAIT_F }, () => {
  const entropy = (() => { let i = 0; return () => (++i).toString(16).padStart(32, "0"); })();
  let a = S.newSession(card, { params: { spiel: "a" }, seed: entropy(), mine: [0] });
  const s = a.state.pub.seed;
  a = S.apply(card, a, turn(0, chars(s, 0, ["T20", "T20", "T20"]), 180));
  const b = S.fromWire(card, JSON.parse(JSON.stringify(S.toWire(a))), { mine: [1] });
  assert.equal(S.pubHash(b), S.pubHash(a));
  const b2 = S.apply(card, b, turn(1, chars(s, 3, ["S20", "S20", "S20"]), 60));
  const a2 = S.fromWire(card, S.toWire(b2), { mine: [0] });
  assert.deepEqual(D.sim(s, a2.state.pub.s).left, [121, 241]);
});

test("Link: eine Aufnahme mit ASCII-Namen besteht das heutige Link-Schema", () => {
  const st = fresh("a", "l"), s = st.pub.seed;
  const w = { c: "spiel-dart", v: "1.0.0", p: { spiel: "a" }, s: "0".repeat(32), k: [null, null], m: [turn(0, chars(s, 0, ["T20", "T20", "T20"]), 180, "Ana")], g: "0".repeat(16) };
  const f = encode("challenge", w); assert.ok(decode(f).ok);
});

test("Link: volles Spiel (12 Runden je Person) passt in MAX_FRAGMENT", { todo: "Linkkapazitaet bei Strang F angefragt (24 Aufnahmen > " + MAX_FRAGMENT + " Zeichen)" }, () => {
  let st = fresh("a", "full"); const s = st.pub.seed, m = [];
  for (let t = 0; t < 24; t++) { const x = turn(t % 2, chars(s, t * 3, ["S1", "S1", "S1"]), 3); m.push(x); st = card.step(st, x); }
  assert.ok(card.status(st).over);
  const w = { c: "spiel-dart", v: "1.0.0", p: { spiel: "a" }, s: "0".repeat(32), k: [null, null], m, g: "0".repeat(16) };
  assert.ok(encode("challenge", w).length <= MAX_FRAGMENT);
});

test("Link: Spitznamen in jeder Schrift (alt: Ελένη, Олег, 지민) reisen im Link", { todo: "Input-Strings im Link-Schema nur [A-Za-z0-9_-] – bei Strang F angefragt" }, () => {
  const st = fresh("a", "u"), s = st.pub.seed;
  const x = turn(0, chars(s, 0, ["T20", "T20", "T20"]), 180, "Олег");
  assert.ok(ok(st, 0, x), "die Karte erlaubt den Namen");
  const w = { c: "spiel-dart", v: "1.0.0", p: { spiel: "a" }, s: "0".repeat(32), k: [null, null], m: [x], g: "0".repeat(16) };
  assert.ok(decode(encode("challenge", w)).ok);
});
