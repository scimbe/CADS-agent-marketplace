// Karte spiel-dart auf Vertragsebene (Zugvertrag v0.2, ADR 0001 f): Zustand nur Ganzzahlen/Strings, ein Pfeil je
// Eingabe mit Rohwert a (aim + power), accepts wie der Altcode, Bert ueber card.bot und den echten Bot-Agenten,
// Schnappschuss (link.snap: compact/merge), Link-Groesse, Spitznamen in jeder Schrift, Ansichten mit ADR-Widgets.
import test from "node:test";
import assert from "node:assert/strict";
import card from "../src/cards/spiel-dart/card.js";
import * as B from "../src/cards/spiel-dart/board.js";
import * as D from "../src/engines/dart/dart.js";
import * as S from "../src/contract/session.js";
import * as H from "../src/contract/handshake.js";
import { createBotAgent } from "../src/bot/agent.js";
import { rng, canon, stateHash } from "../src/contract/sdk.js";
import { encode, decode, MAX_FRAGMENT } from "../src/app/link.js";
import { validInput } from "../src/cards/index.js";

// Ziel so legen, dass der Pfeil (mit der Streuung aus dem Seed) genau auf (x, y) landet
function onto(seed, k, x, y) { const h = D.hand(seed, k); return D.dart(x - h.sx, y - h.sy, D.MID); }
function spot(f) { if (f === "B") return [0, 0]; if (f === "0") return [1.2, 0.4]; return D.centre(+f.slice(1), { T: "t", D: "d", S: "s" }[f[0]]); }
const din = (seat, d, n) => { const x = { t: "dart", seat, a: { aim: [d.ax, d.ay], power: d.p } }; if (d.f) x.f = 1; if (n !== undefined) x.n = n; return x; };
function fresh(spiel = "a", tag = "t") { return card.init({ rng: rng(tag), params: { spiel } }); }
const ok = (st, seat, x) => card.accepts(card.observe(st, seat), seat, x);
function k(st) { return D.sim(st.pub.seed, st.pub.s).k; }
/** Eine Aufnahme auf Felder werfen (so viele Pfeile wie die Regel annimmt), n = Name am ersten Pfeil. */
function throwTurn(st, seat, fields, n) {
  for (let i = 0; i < fields.length; i++) {
    const p = spot(fields[i]), x = din(seat, onto(st.pub.seed, k(st), p[0], p[1]), i === 0 ? n : undefined);
    st = card.step(st, x);
  }
  return st;
}
function walk(n, f) { f(n); for (const c of n.children || []) walk(c, f); for (const c of n.fields || []) walk(c, f); }
function texts(v) { const out = []; walk(v, (n) => { if (n.t === "text") out.push(n.text); }); return out; }
const entropy = (p) => { let i = 0; return () => (p + (++i).toString(16)).padStart(32, "0").slice(-32); };

test("Init: Seed aus dem Init-rng, Zustand kanonisch, Spielart aus den Parametern, Kopfzeile Runde n von m", () => {
  const a = fresh("c", "x"), b = fresh("c", "x"), c = fresh("c", "y");
  assert.match(a.pub.seed, /^[0-9a-f]{16}$/); assert.equal(a.pub.seed, b.pub.seed); assert.notEqual(a.pub.seed, c.pub.seed);
  assert.equal(a.pub.s, "cl"); assert.doesNotThrow(() => canon(a));
  assert.deepEqual(Object.keys(a.pub).sort(), ["mode", "n", "s", "seed"]);
  assert.deepEqual(card.status(a), { over: false, turn: 0, reveal: false, score: [0, 0], winner: -1, bot: false, turnNo: 1, turns: 12 });
  assert.deepEqual(card.status(fresh("a")).score, [301, 301]);
  assert.equal(card.status(fresh("d")).turns, 3);
});

test("Ein Pfeil je Eingabe: richtiger Sitz, Raster 0..4095, Kraft 0..8, f nur 1, Namen durch den Filter; Aufnahme endet nach 3", () => {
  let st = fresh("a"); const s = st.pub.seed, d = onto(s, 0, ...spot("T20"));
  assert.ok(ok(st, 0, din(0, d)));
  assert.equal(ok(st, 1, din(1, d)), false, "falscher Sitz");
  for (const bad of [{ ...din(0, d), a: { aim: [4096, 0], power: 4 } }, { ...din(0, d), a: { aim: [1, 2], power: 9 } }, { ...din(0, d), a: { aim: [1], power: 4 } }, { ...din(0, d), f: 2 }, { ...din(0, d), n: 5 }, { t: "turn", seat: 0, d: "AAAAAAAAAAAAAAA", c: 0 }])
    assert.equal(ok(st, 0, bad), false, JSON.stringify(bad));
  assert.equal(ok(st, 0, din(0, d, "Bert")), false, "Bildschirmwort als Name");
  st = throwTurn(st, 0, ["T20", "S5", "S1"], "Ana");
  assert.deepEqual(st.pub.n, ["Ana", ""]);
  assert.equal(card.status(st).turn, 1, "nach drei Pfeilen ist Sitz 1 dran");
  const d1 = onto(s, 3, ...spot("S1"));
  assert.equal(ok(st, 1, din(1, d1, "Ana")), false, "der Name des anderen");
  assert.equal(ok(st, 1, din(1, d1, "Аna")), false, "kyrillisches A als Verkleidung");
  assert.equal(ok(st, 0, din(0, d1)), false, "Sitz 0 nicht mehr dran");
  // Bust nach einem Pfeil beendet die Aufnahme: danach ist der andere dran (alt sim)
  let x = fresh("a", "bust");
  x = throwTurn(x, 0, ["T20", "T20", "T20"]); x = throwTurn(x, 1, ["0", "0", "0"]);
  x = throwTurn(x, 0, ["T20", "T19", "S2"]); x = throwTurn(x, 1, ["0", "0", "0"]);
  x = throwTurn(x, 0, ["S2"]);
  assert.equal(card.status(x).turn, 1, "S2 auf 2 ohne Double: Bust, Aufnahme vorbei");
  assert.ok(D.sim(x.pub.seed, x.pub.s).turns.at(-1).bust);
});

test("Kanonischer Zustand, gleicher Hash bei gleicher Folge; Punkte stehen nie im Zustand", () => {
  const play = () => { let st = fresh("d", "h"); for (let t = 0; t < 6; t++) st = throwTurn(st, t % 2, ["T20", "S1", "0"]); return st; };
  const a = play(), b = play();
  assert.equal(stateHash(a), stateHash(b));
  assert.ok(card.status(a).over); assert.equal(card.status(a).winner, -1, "gleich viel: Unentschieden");
});

test("Bert: card.bot nach der ersten Aufnahme, danach rechnet die Engine jede Bert-Aufnahme aus dem Seed", () => {
  let st = fresh("a", "bert");
  assert.throws(() => card.bot(card.observe(st, 1), 1, {}), /nicht am Zug/);
  st = throwTurn(st, 0, ["T20", "T20", "T20"]);
  assert.deepEqual(card.moves(card.observe(st, 1), 1)[0], { t: "bert", seat: 1 });
  assert.deepEqual(card.bot(card.observe(st, 1), 1, { level: 2, seed: "s" }), { t: "bert", seat: 1 });
  assert.equal(ok(st, 0, { t: "bert", seat: 0 }), false);
  assert.equal(ok(st, 1, { t: "bert", seat: 1, x: 1 }), false, "keine Zusatzfelder");
  const viaBot = card.step(st, { t: "bert", seat: 1 });
  assert.equal(viaBot.pub.s[1], "b"); assert.equal(card.status(viaBot).turn, 0); assert.equal(card.status(viaBot).bot, true);
  assert.equal(D.sim(viaBot.pub.seed, viaBot.pub.s).turns.length, 2, "Berts Aufnahme folgt sofort");
  assert.equal(ok(viaBot, 1, { t: "bert", seat: 1 }), false, "nur einmal");
  // ein Mensch auf Sitz 1 schliesst Bert aus
  const human = throwTurn(st, 1, ["S1", "S1", "S1"]);
  assert.equal(ok(human, 1, { t: "bert", seat: 1 }), false);
});

test("Bot-Partie ueber den echten Agenten (src/bot/agent.js, card.bot) bis zum Ende; beide Seiten gleich", () => {
  const card0 = card, mine = entropy("a"), net = [];
  const hi = H.hello(card0, { spiel: "a" }, 0, [mine(), mine(), mine()]);
  let human = null;
  const agent = createBotAgent(card0, { seat: 1, level: 2, entropy: entropy("b"), send: (m) => net.push(m) });
  agent.receive(hi.msg);
  const join = net.shift(); const st = H.start(card0, { spiel: "a" }, hi.local, join);
  human = st.session; agent.receive(st.msg);
  for (let i = 0; i < 200 && !S.status(card0, human).over; i++) {
    while (net.length) { const m = net.shift(); human = S.apply(card0, human, m.x); assert.equal(S.pubHash(human), m.h); }
    if (S.status(card0, human).over) break;
    const t = S.status(card0, human).turn;
    assert.equal(t, 0, "der Mensch ist am Zug");
    const mv = card0.moves(S.observe(card0, human, 0), 0).at(-1);
    human = S.apply(card0, human, mv);
    agent.receive({ t: "in", i: human.log.length - 1, x: mv, h: S.pubHash(human) });
  }
  while (net.length) { const m = net.shift(); human = S.apply(card0, human, m.x); }
  const status = S.status(card0, human);
  assert.ok(status.over); assert.equal(status.bot, true);
  assert.ok(human.log.some((x) => x.t === "bert"), "Bert hat uebernommen");
  const v = texts(card0.view(card0.observe(human.state, 0), 0, { lang: "de" }));
  assert.ok(v.some((x) => /Bert|Unentschieden/.test(x)), v.join(" | "));
});

test("Link-Rundreise auf Vertragsebene (accepts): toWire/fromWire mit Schnappschuss spielt dieselbe Partie", () => {
  const e = entropy("c");
  let a = S.newSession(card, { params: { spiel: "a" }, seed: e(), mine: [0] });
  for (const f of ["T20", "T20", "T20"]) { const p = spot(f); a = S.apply(card, a, din(0, onto(a.state.pub.seed, k(a.state), p[0], p[1]))); }
  const w = JSON.parse(JSON.stringify(S.toWire(a, card)));
  assert.equal(w.m.length, 1); assert.equal(w.m[0].t, "snap");
  assert.ok(validInput("spiel-dart", w.m[0]));
  const b = S.fromWire(card, w, { mine: [1] });
  assert.equal(S.pubHash(b), S.pubHash(a));
  let b2 = b;
  for (const f of ["S20", "S20", "S20"]) { const p = spot(f); b2 = S.apply(card, b2, din(1, onto(b2.state.pub.seed, k(b2.state), p[0], p[1]))); }
  const a2 = S.fromWire(card, S.toWire(b2, card), { mine: [0] });
  assert.deepEqual(D.sim(a2.state.pub.seed, a2.state.pub.s).left, [121, 241]);
  // merge: Fortsetzung um eine Aufnahme gilt, ein frueherer Stand behaelt den eigenen, Fremdes wird abgelehnt
  assert.deepEqual(card.merge(a.state.pub, a2.state.pub), a2.state.pub);
  assert.deepEqual(card.merge(a2.state.pub, a.state.pub), a2.state.pub);
  const forged = { ...a2.state.pub, s: a.state.pub.s.slice(0, -5) + "AAAAA" + a2.state.pub.s.slice(a.state.pub.s.length) };
  assert.throws(() => card.merge(a.state.pub, forged), (err) => err.code === "manipuliert");
  assert.throws(() => card.merge(a.state.pub, { ...a2.state.pub, seed: "0".repeat(16) }), (err) => err.code === "manipuliert");
  // Schnappschuss nur als erste Eingabe
  assert.equal(ok(a.state, 0, w.m[0]), false);
});

test("Link: volle Partie (12 Runden je Person, 72 Pfeile) passt als Schnappschuss in MAX_FRAGMENT", () => {
  const e = entropy("d");
  let s = S.newSession(card, { params: { spiel: "a" }, seed: e(), mine: [0, 1] });
  for (let t = 0; t < 24; t++) for (let j = 0; j < 3; j++) { const p = spot("S1"); s = S.apply(card, s, din(t % 2, onto(s.state.pub.seed, k(s.state), p[0], p[1]), j === 0 ? (t % 2 ? "Ελένη" : "지민") : undefined)); }
  assert.ok(S.status(card, s).over); assert.equal(s.log.length, 72);
  const w = { ...S.toWire(s, card), g: "0".repeat(16), h: S.pubHash(s) };
  const f = encode("challenge", w);
  assert.ok(f.length <= MAX_FRAGMENT, f.length + " > " + MAX_FRAGMENT);
  assert.ok(decode(f).ok);
  const back = S.fromWire(card, decode(f).data, { mine: [] });
  assert.equal(S.pubHash(back), S.pubHash(s));
  assert.deepEqual(back.state.pub.n, ["지민", "Ελένη"]);
});

test("Link: Spitznamen in jeder Schrift (alt: Ελένη, Олег, 지민) reisen im Link", () => {
  const st = fresh("a", "u"), x = din(0, onto(st.pub.seed, 0, ...spot("T20")), "Олег");
  assert.ok(ok(st, 0, x), "die Karte erlaubt den Namen");
  assert.ok(validInput("spiel-dart", x));
  const w = { c: "spiel-dart", v: card.manifest.version, p: { spiel: "a" }, s: "0".repeat(32), k: [null, null], m: [x], g: "0".repeat(16) };
  assert.ok(decode(encode("challenge", w)).ok);
  assert.equal(validInput("spiel-dart", { ...x, n: "x".repeat(49) }), false, "Laenge begrenzt");
  assert.equal(validInput("spiel-dart", { t: "turn", seat: 0 }), false, "unbekannte Eingabe");
});

test("Hinweiszuege: am Zug genau ein Pfeil (Ziel wie Bert, Kraft Mitte), Sitz 1 nach der ersten Aufnahme zusaetzlich Bert", () => {
  let st = fresh("a", "m");
  assert.deepEqual(card.moves(card.observe(st, 1), 1), []);
  const m0 = card.moves(card.observe(st, 0), 0);
  assert.equal(m0.length, 1); assert.equal(m0[0].a.power, D.MID); assert.ok(ok(st, 0, m0[0]));
  st = throwTurn(st, 0, ["T20", "T20", "T20"]);
  const m1 = card.moves(card.observe(st, 1), 1);
  assert.deepEqual(m1.map((x) => x.t), ["bert", "dart"]);
  for (const x of m1) assert.ok(ok(st, 1, x));
});

test("Ansichten de/en: Canvas (Brett, Pfeile, Zitter-Ebene), form aus aim + power, Zielen auf, Ergebnis", () => {
  let st = fresh("a", "v");
  for (const lang of ["de", "en"]) {
    const pv = card.view(card.observe(st, 0), 0, { lang, preview: true });
    assert.ok(texts(pv).includes(D.T(lang).da_m_a));
  }
  const v0 = card.view(card.observe(st, 0), 0, { lang: "de", draft: null, nick: "Ana" });
  assert.ok(texts(v0).includes("Wähle das Spiel und wirf."));
  const nodes = []; walk(v0, (n) => nodes.push(n));
  const cv = nodes.find((n) => n.t === "canvas"), form = nodes.find((n) => n.t === "form");
  assert.ok(cv && cv.layers.length === 3, "Brett, Pfeile, Zittern");
  assert.equal(cv.layers[0].ops.filter((o) => o.o === "arc").length, 80);
  assert.equal(cv.layers[2].frames.length, D.STEPS);
  for (const o of cv.layers[0].ops) if (o.o === "arc") assert.ok(o.a0 >= 0 && o.a0 < 1 && o.a1 > o.a0 && o.a1 - o.a0 < 0.06);
  assert.deepEqual(form.submit, { t: "dart", seat: 0, n: "Ana" });
  assert.deepEqual(form.fields.map((f) => f.t), ["aim", "power"]);
  assert.deepEqual(form.fields[0].value, B.aimGrid("t20"));
  assert.equal(form.fields[1].mode, "pendel");
  // Tastatur: Zahl, dann Ring, dann Regler ohne Timing (f:1)
  const choice = nodes.find((n) => n.t === "choice");
  assert.ok(choice.options.length <= 24);
  const twenty = choice.options.find((o) => o.label === "20");
  const v1 = card.view(card.observe(st, 0), 0, { lang: "de", draft: twenty.draft });
  const n1 = []; walk(v1, (n) => n1.push(n));
  const rings = n1.find((n) => n.t === "choice");
  assert.deepEqual(rings.options.map((o) => o.label), ["Triple 20", "Double 20", "Single 20"]);
  const v2 = card.view(card.observe(st, 0), 0, { lang: "de", draft: { ...rings.options[1].draft, slider: true } });
  const n2 = []; walk(v2, (n) => n2.push(n));
  const f2 = n2.find((n) => n.t === "form");
  assert.deepEqual(f2.fields[0].value, B.aimGrid("d20")); assert.equal(f2.fields[1].mode, "schieber"); assert.equal(f2.submit.f, 1);
  // so wie der Host die Eingabe baut ({...submit, a}) nimmt die Karte sie an
  assert.ok(ok(st, 0, { ...f2.submit, a: { aim: f2.fields[0].value, power: 4 } }));
  // nach einer Aufnahme: Kacheln der drei Pfeile mit Sprechtext; Ergebnis am Ende
  st = throwTurn(st, 0, ["T20", "S5", "S1"]);
  const v3 = card.view(card.observe(st, 1), 1, { lang: "de" });
  let tiles = 0; walk(v3, (n) => { if (n.t === "tile") { tiles++; assert.ok(n.a11y.length > 5); } }); assert.equal(tiles, 3);
  assert.ok(texts(v3).includes("Wirf deine drei Pfeile."));
  let x = fresh("d", "w");
  for (let t = 0; t < 6; t++) x = throwTurn(x, t % 2, t % 2 ? ["S1", "S1", "S1"] : ["T20", "T20", "T20"]);
  assert.ok(texts(card.view(card.observe(x, 0), 0, { lang: "de" })).includes("Du gewinnst!"));
  assert.ok(texts(card.view(card.observe(x, 1), 1, { lang: "de" })).includes("Gegner gewinnt!"));
  assert.ok(texts(card.view(card.observe(x, 1), 1, { lang: "en" })).length > 2);
});

test("Brett-Daten: 63 Felder fuer Zielen auf treffen die Feldmitte; Pendel startet auf der Stufe aus dem Seed", () => {
  const opts = B.aimOptions("de"); assert.equal(opts.length, 63); assert.equal(opts[3].label, "Triple 20");
  for (const o of opts.slice(1)) {
    const g = B.aimGrid(o.v), a = D.aimOf({ ax: g[0], ay: g[1] }), h = D.score(a[0], a[1]);
    const want = o.v === "50" ? [25, 2] : o.v === "25" ? [25, 1] : [Number(o.v.slice(1)), { t: 3, d: 2, s: 1 }[o.v[0]]];
    assert.deepEqual([h.n, h.m], want, o.v);
  }
  assert.equal(B.aimGrid(""), null);
  assert.deepEqual(B.gridOf(B.MID, B.MID), [2048, 2048]);
  const s = fresh().pub.seed;
  assert.equal(B.powerAt(s, 0, 0), D.hand(s, 0).lv);
});
