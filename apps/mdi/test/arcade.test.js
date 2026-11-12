// Portierte Altcode-Tests (alt:test/arcade.test.js, 25 Faelle) gegen die neue Arcade-Engine. Abbildung der API:
// alt A.side(g,{seed,serving,send,clock}) -> Side() aus arcade-net.js, alt A.pair/A.bot -> matchInit/matchStep mit Bots.
// Zeit: alt tick(1/60) = zwei Schritte zu 1/120 s; Netzverzoegerung von 6 Bildern (100 ms) = 12 Ticks.
import test from "node:test";
import assert from "node:assert/strict";
import * as A from "../src/engines/arcade/index.js";
import { puckServe, plausibleMallet, plausiblePuck } from "../src/engines/arcade/puck.js";
import { ziegelServe, ziegelDefend, plausiblePaddle, plausibleZiegel, ZIEGEL } from "../src/engines/arcade/ziegel.js";
import { plausibleVolley, VOLLEY } from "../src/engines/arcade/volley.js";
import { island, surface, tankPos, crater, flight, plausibleShot, PANZER } from "../src/engines/arcade/panzer.js";
import { snowWalls, SNOW } from "../src/engines/arcade/snow.js";
import { flipBumpers, FLIP } from "../src/engines/arcade/flipper.js";
import { elfSpot, elfShooter } from "../src/engines/arcade/elfer.js";
import { mirror, W, H } from "../src/engines/arcade/core.js";
import { Side, Bot, channel, rng, BAD } from "./arcade-net.js";

const speed = (b) => Math.sqrt(b.vx * b.vx + b.vy * b.vy);
function play(g, seed, lagTicks, maxSec) {
  let st = A.matchStart(A.matchInit({ g, seed, players: ["bot", "bot"], lag: lagTicks }));
  let t = 0;
  while (t < (maxSec || 900) * 120 && !A.matchStatus(st).over) { st = A.matchStep(st, []).state; t++; }
  return { A: st.sides[0], B: st.sides[1], t: t / 120 };
}

test("Zehn Spiele, jedes gegen den Bot bis zum Ende, beide Seiten zaehlen gleich, auch mit 100 ms Netz", () => {
  assert.equal(A.IDS.length, 10);
  for (const g of A.IDS) for (const lag of [0, 12]) {
    const r = play(g, "probe-" + g, lag);
    assert.ok(r.A.over && r.B.over, g + " endet nicht (lag " + lag + ")");
    assert.deepEqual(r.A.score, [r.B.score[1], r.B.score[0]], g + ": gespiegelt gleich");
    assert.notEqual(r.A.score[0], r.A.score[1], g + ": es gibt einen Sieger");
    assert.ok(Math.max(...r.A.score) >= A.rulesOf(g).WIN || g === "elfer" || g === "murmel", g + " " + r.A.score);
    assert.equal(r.A.rejected + r.B.rejected, 0, g + ": ehrliche Seiten werden nie verworfen");
  }
});

test("Aufschlag, Insel, Waelle und Bumper kommen nur aus dem Startwert und sind fuer beide gleich", () => {
  assert.deepEqual(puckServe("s", 2), puckServe("s", 2)); assert.notDeepEqual(puckServe("s", 2), puckServe("s", 3));
  assert.deepEqual(ziegelServe("s", 1), ziegelServe("s", 1));
  for (let n = 0; n < 30; n++) assert.ok(ziegelServe("k" + n, n).vy < 0, "weg vom Aufschlaeger");
  const T = island("x");
  for (let i = 0; i < T.length; i++) assert.equal(T[i], T[T.length - 1 - i], "Insel ist spiegelgleich, keiner steht schlechter");
  assert.deepEqual(snowWalls("x"), snowWalls("x")); assert.deepEqual(flipBumpers("x"), flipBumpers("x"));
  assert.deepEqual(elfSpot("x", 4), elfSpot("x", 4));
  assert.equal(elfShooter(0, true), true); assert.equal(elfShooter(0, false), false); assert.equal(elfShooter(1, false), true);
});

test("Ein Aufschlag, der nicht aus dem Startwert kommt, wird verworfen", () => {
  for (const g of ["puck", "ziegel", "volley", "kick", "flipper"]) {
    const S = Side(g, { seed: "s", serving: false });
    S.receive({ t: "serve", n: 0, b: { x: 500, y: 300, vx: 0, vy: 2000 } });
    assert.equal(S.rejected, 1, g);
  }
});

test("Der Verteidiger entscheidet: was schon bei ihm ist, kann die andere Seite nicht mehr umschreiben", () => {
  const S = Side("puck", { seed: "d", serving: true, send: () => {} });
  S.start(); S.tick(0.05);
  assert.equal(S.st.own, true);
  const before = JSON.stringify(S.st.p);
  S.receive({ t: "hit", b: { x: 500, y: 300, vx: 0, vy: 900 } });
  assert.equal(JSON.stringify(S.st.p), before, "der Puck in der eigenen Haelfte bleibt, wie er ist");
  const Z = Side("ziegel", { seed: "d", serving: false, send: () => {} });
  Z.receive({ t: "serve", n: 0, b: mirror(ziegelServe("d", 0)) });
  const b0 = JSON.stringify(Z.st.b);
  Z.receive({ t: "hit", b: { x: Z.st.opp, y: H - ZIEGEL.PY + ZIEGEL.R, vx: 0, vy: 900 } });
  assert.equal(JSON.stringify(Z.st.b), b0);
});

test("Ziegel: Ball am Schlaeger vorbei bricht den Ziegel dahinter, durch die Luecke ist es ein Punkt", () => {
  const out = [], S = Side("ziegel", { seed: "z", serving: false, send: (m) => out.push(m) });
  S.start(); S.input({ x: 900 }); S.tick(1);
  S.st.b = { x: 100, y: 1200, vx: 0, vy: 800 }; S.st.held = false;
  for (let i = 0; i < 60 && !out.some((m) => m.t === "brk"); i++) S.tick(1 / 60);
  const brk = out.find((m) => m.t === "brk");
  assert.ok(brk, "Ziegel bricht"); assert.equal(brk.k, 0); assert.equal(S.st.mine[0], 0); assert.ok(S.st.b.vy < 0, "Ball fliegt zurueck");
  S.st.b = { x: 100, y: 1200, vx: 0, vy: 800 }; S.st.past = false;
  for (let i = 0; i < 90 && !out.some((m) => m.t === "pt"); i++) S.tick(1 / 60);
  assert.ok(out.some((m) => m.t === "pt")); assert.deepEqual(S.score, [0, 1]);
});

test("Anti-Schummeln: Spruenge, Raketen-Baelle, Dauerfeuer und fremde Zuege werden gedeckelt oder verworfen", () => {
  assert.ok(plausiblePaddle(500, 1000, 0.016) < 600, "Schlaeger springt nicht");
  const m = plausibleMallet({ x: 500, y: 200 }, { x: 500, y: 1400 }, 0.05);
  assert.ok(m.y <= H / 2 - 72, "Schlaeger bleibt in seiner Haelfte");
  assert.equal(plausiblePuck("hit", { x: 500, y: 300, vx: 0, vy: 9000 }, { x: 500, y: 300 }), false, "zu schnell");
  assert.equal(plausiblePuck("hit", { x: 900, y: 300, vx: 0, vy: 900 }, { x: 100, y: 1500 }), false, "weit weg vom Schlaeger");
  assert.equal(plausibleZiegel("brk", { x: 100, y: H - ZIEGEL.WY + ZIEGEL.BH / 2 + ZIEGEL.R, vx: 0, vy: 700 }, 500, 0, [1, 1, 1, 1, 1, 1, 0]), false, "kaputter Ziegel bricht nicht zweimal");
  assert.ok(plausibleVolley("st", { x: 600, y: 1300, vx: 0, vy: 2200 }, { x: 700, y: 1370 }), "ein fallender Ball darf schneller sein als ein Schlag");
  assert.equal(plausibleVolley("hit", { x: 600, y: 1300, vx: 0, vy: 2200 }, { x: 700, y: 1370 }), false);
  assert.equal(plausibleShot({ i: 0, vx: 3000, vy: -100, w: 0 }, -9, 5), false, "zu stark");
  assert.equal(plausibleShot({ i: 1, vx: 500, vy: -600, w: 0 }, 4.8, 5), false, "zu schnell nachgeladen");
  assert.ok(plausibleShot({ i: 1, vx: 500, vy: -600, w: 0 }, 3, 5));
  const N = Side("snow", { seed: "n", serving: false });
  for (let i = 0; i < 5; i++) N.receive({ t: "throw", i, x: 500, vx: 0 });
  assert.equal(N.rejected, 2, "nur drei Schneebaelle in der Hand");
  const E = Side("elfer", { seed: "e", serving: true });
  E.start(); E.receive({ t: "shot", n: 0, vx: 0, vy: 1000, c: 0 });
  assert.equal(E.rejected, 1, "wer selbst schiesst, bekommt keinen fremden Schuss");
  const K = Side("stock", { seed: "k", serving: true });
  K.start(); K.receive({ t: "throw", n: 0, x: 500, vx: 0, vy: 500 }); K.tick(0.05);
  assert.equal(K.rejected, 1, "nicht am Zug");
  assert.equal(K.st.list.length, 0, "und nicht geworfen");
});

test("Rundenspiele: jeder Wurf ergibt auf beiden Handys Bit fuer Bit dasselbe Bild", () => {
  for (const g of ["stock", "murmel"]) {
    let st = A.matchStart(A.matchInit({ g, seed: "same-" + g, players: ["bot", "bot"], lag: 6 }));
    for (let i = 0; i < 120 * 40; i++) {
      st = A.matchStep(st, []).state;
      const [P, Q] = st.sides;
      if (!P.st.rolling && !Q.st.rolling && P.st.n === Q.st.n) assert.deepEqual(P.st.list.map((s) => [s.x, s.y]), Q.st.list.map((s) => [s.x, s.y]), g + " nach Wurf " + P.st.n);
      if (P.over) break;
    }
    assert.ok(st.sides[0].st.n >= 2, g + " wurde gespielt");
  }
});

test("Panzer: wer getroffen wird, entscheidet; Krater bleiben in seiner Haelfte", () => {
  const T = island("p"), before = T.slice();
  crater(T, 300, surface(T, 300), true);
  assert.ok(T.some((y, i) => y !== before[i]), "Krater");
  for (let i = 50; i < 100; i++) assert.equal(T[i], before[i], "die andere Haelfte bleibt unberuehrt");
  const out = [], S = Side("panzer", { seed: "p", serving: false, send: (m) => out.push(m) });
  S.start();
  const tk = tankPos(S.st.T, true);
  S.st.shells.push({ x: tk.x, y: tk.y - 5, vx: 0, vy: 10, w: 0, mine: false, i: 0 });
  for (let i = 0; i < 30 && !out.some((m) => m.t === "boom"); i++) S.tick(1 / 60);
  const boom = out.find((m) => m.t === "boom");
  assert.ok(boom && boom.hit === true); assert.deepEqual(S.score, [0, 1]);
});

function panzerVsIdle(seed, max) {
  const toMe = [], toBot = [];
  const S = Side("panzer", { seed, serving: true, send: (m) => toBot.push(m) });
  const B = Side("panzer", { seed, serving: false, send: (m) => toMe.push(m) });
  const bot = Bot("panzer", B, seed);
  S.start(); B.start();
  let t = 0;
  while (t < max && !S.over) { S.tick(1 / 60); while (toBot.length) B.receive(toBot.shift()); bot(1 / 60); B.tick(1 / 60); while (toMe.length) S.receive(toMe.shift()); t += 1 / 60; }
  return { S, t, shots: B.st.id };
}
test("Panzer: ein Krater sinkt nie unter die Wasserlinie, der Panzer bleibt im tiefsten Loch treffbar", () => {
  const T = island("tief"), P = PANZER, sea = T.slice();
  for (let k = 0; k < 40; k++) { const tk = tankPos(T, true); crater(T, tk.x + ((k % 5) - 2) * 20, tk.y + P.TH, true); }
  for (let i = 0; i < T.length; i++) {
    if (sea[i] < P.SEA) assert.ok(T[i] < P.SEA, "Kraterboden bleibt Land, Feld " + i);
    else assert.equal(T[i], sea[i], "der Meeresboden wird nie angehoben, Feld " + i);
  }
  const out = [], S = Side("panzer", { seed: "tief", serving: false, send: (m) => out.push(m) });
  S.st.T.splice(0, T.length, ...T); S.start();
  const tk = tankPos(S.st.T, true);
  S.st.shells.push({ x: tk.x, y: tk.y - 5, vx: 0, vy: 10, w: 0, mine: false, i: 0 });
  for (let i = 0; i < 60 && !out.some((m) => m.t === "boom"); i++) S.tick(1 / 60);
  const boom = out.find((m) => m.t === "boom");
  assert.ok(boom && boom.hit === true, "Treffer statt Platschen im tiefen Krater");
});
test("Panzer: ein schneller Schuss, der im Schritt unter den Kraterboden faellt, landet trotzdem auf der Insel", () => {
  const T = island("tief"), P = PANZER;
  for (let k = 0; k < 40; k++) { const tk = tankPos(T, true); crater(T, tk.x + ((k % 5) - 2) * 20, tk.y + P.TH, true); }
  const floor = surface(T, P.TX);
  assert.ok(floor > P.SEA - P.FLOOR - 1 && floor < P.SEA, "Boden knapp ueber der Wasserlinie: " + floor);
  const f = flight(T, { x: P.TX, y: floor - 2, vx: 0, vy: 20 * 120, w: 0 }, 10);
  assert.equal(f.k, "land", "kein Platschen auf Land"); assert.ok(f.y >= P.SEA, "der Schritt endet wirklich unter SEA: " + f.y);
  assert.equal(flight(T, { x: 30, y: P.SEA - 2, vx: 0, vy: 2400, w: 0 }, 10).k, "sea", "ueber dem Wasser bleibt es Platschen");
});
test("Panzer: der Bot beendet jede Partie gegen einen stillstehenden Spieler in unter 120 s (e2e-0..39), und trifft nicht besser als frueher", () => {
  let shots = 0, hits = 0, time = 0;
  for (let n = 0; n < 40; n++) {
    const r = panzerVsIdle("e2e-" + n, 120);
    assert.ok(r.S.over, "e2e-" + n + " endet nicht in 120 s, Stand " + r.S.score);
    assert.deepEqual(r.S.score, [0, PANZER.WIN], "e2e-" + n);
    shots += r.shots; hits += r.S.score[1]; time += r.t;
  }
  assert.ok(shots / hits >= 2.7 && shots / hits <= 4, "Schuss je Treffer " + (shots / hits).toFixed(2));
  assert.ok(time / 40 >= 25 && time / 40 <= 45, "mittlere Partie " + (time / 40).toFixed(1) + " s");
});

test("Kein Ball wird von den eigenen Regeln schneller als VMAX, sonst verwirft ihn die Gegenseite als Schummelei", () => {
  for (let off = -118; off <= 118; off += 2) for (const vx of [-1250, -600, 0, 600, 1250]) for (const vy of [100, 400, 900, 1250]) {
    const r = ziegelDefend({ x: 500 + off, y: ZIEGEL.PY, vx, vy }, 500);
    if (r && r.hit) assert.ok(speed(r.ball) <= ZIEGEL.VMAX + 1e-9, off + " " + vx + " " + vy);
  }
  for (let seed = 1; seed <= 6; seed++) {
    let st = A.matchStart(A.matchInit({ g: "flipper", seed: "v" + seed, players: ["bot", "bot"] }));
    for (let f = 0; f < 120 * 60 && !st.sides[0].over; f++) {
      st = A.matchStep(st, []).state;
      for (const S of st.sides) if (S.st.b && S.st.own) assert.ok(speed(S.st.b) <= FLIP.VMAX + 1e-9, "seed " + seed);
    }
    assert.equal(A.matchStatus(st).rejected, 0);
  }
});
test("Flipper: ein zu schneller oder ein von nirgends kommender Ball wird weiter verworfen", () => {
  const S = Side("flipper", { seed: "x", serving: false }); S.start();
  S.receive({ t: "st", b: { x: 500, y: 400, vx: 0, vy: FLIP.VMAX * 1.05 } });
  assert.equal(S.rejected, 1, "zu schnell");
  S.receive({ t: "hit", b: { x: 500, y: 760, vx: 0, vy: 900 } });
  assert.equal(S.rejected, 2, "Treffer ohne Klappe oder Bumper");
  S.receive({ t: "st", b: { x: 500, y: 400, vx: 0, vy: FLIP.VMAX } });
  assert.equal(S.rejected, 2, "ein ehrlicher Zustand an der Grenze geht durch");
});

test("Schnee: nachgeladen wird nach der Uhr des Werfers, aber eine vorgestellte Uhr bringt keine Munition", () => {
  const S = Side("snow", { seed: "s", serving: false }); S.start();
  for (let k = 0; k < 10; k++) { S.receive({ t: "p", x: 500, ms: 1000 + k * 50 }); S.tick(0.05); }
  for (let k = 0; k < 100; k++) S.tick(0.05);
  for (let i = 0; i < 6; i++) S.receive({ t: "throw", i, x: 500, vx: 0, ms: 1500 + i * 900 });
  assert.equal(S.rejected, 0, "ehrlicher Stau nach dem Stocken");
  const C = Side("snow", { seed: "c", serving: false }); C.start();
  for (let k = 0; k < 10; k++) { C.receive({ t: "p", x: 500, ms: 1000 + k * 50 }); C.tick(0.05); }
  for (let i = 0; i < 10; i++) C.receive({ t: "throw", i, x: 500, vx: 0, ms: 1500 + i * 10000 });
  assert.ok(10 - C.rejected <= 7, "drei in der Hand und hoechstens vier aus dem Guthaben: " + (10 - C.rejected));
  const P = Side("snow", { seed: "p", serving: false }); P.start(); P.input({ x: 900 });
  let ms = 1000, got = 0, sent = 0;
  for (let round = 0; round < 8; round++) {
    for (let k = 0; k < 200; k++) { P.tick(0.05); P.receive({ t: "p", x: 500, ms }); }
    for (let i = 0; i < 40; i++) { const r = P.rejected; P.receive({ t: "throw", i: sent++, x: 500, vx: 0, ms: (ms += 900) }); if (P.rejected === r) got++; }
  }
  assert.equal(P.over, false); assert.equal(P.score[1], 0, "kein Treffer: gezaehlt wird nur das Annehmen");
  assert.ok(got <= 40, "acht Pausen, je hoechstens fuenf statt vierzig: " + got);
  const Q = Side("snow", { seed: "q", serving: false, clock: () => Q.t }); Q.start(); Q.input({ x: 900 });
  let qms = 1000, qgot = 0;
  for (let round = 0; round < 8; round++) {
    for (let k = 0; k < 200; k++) Q.tick(0.05);
    for (let i = 0; i < 40; i++) { const r = Q.rejected; Q.receive({ t: "throw", i: sent++, x: 500, vx: 0, ms: (qms += 900) }); if (Q.rejected === r) qgot++; }
  }
  assert.ok(qgot <= 8 * Math.ceil(3 + (SNOW.AMMO * SNOW.RELOAD + 1 + 6) / SNOW.RELOAD), "je Stocken gedeckelt: " + qgot);
  assert.ok(qgot <= 3 + Q.t / SNOW.RELOAD, "nie mehr, als in der echten Zeit geht: " + qgot + " in " + Q.t.toFixed(0) + " s");
});
test("Schnee: ein Werfer ohne Uhr in den Wuerfen verliert keinen ehrlichen Wurf", () => {
  const S = Side("snow", { seed: "o", serving: false }); S.start(); S.input({ x: 900 });
  let t = 0, i = 0;
  for (let f = 0; f < 60 * 30; f++) {
    t += 1 / 60; S.tick(1 / 60);
    if (f % 3 === 0) S.receive({ t: "p", x: 500, ms: Math.round(t * 1000) });
    if (f % 60 === 0) S.receive({ t: "throw", i: i++, x: 500, vx: 0 });
  }
  assert.equal(S.rejected, 0);
});

// Ehrliche Bot-Partien im schlechten Netz mit einem langen Aussetzer; old: die Gegenseite stempelt ihre Wuerfe nicht.
function stallGame(g, seed, stall, old) {
  const NET = Object.assign({}, BAD, { stall: [20, 20 + stall] }), r = rng(seed);
  const ab = channel(r, NET), ba = channel(r, NET); let now = 0;
  const SA = Side(g, { seed: "d" + seed, serving: true, clock: () => now, send: (m) => ab.send(now, m) });
  const SB = Side(g, { seed: "d" + seed, serving: false, clock: () => now, send: (m) => { if (old) delete m.ms; ba.send(now, m); } });
  const a = Bot(g, SA, "a"), b = Bot(g, SB, "b"); SA.start(); SB.start();
  for (let f = 0; f < 60 * 120 && !(SA.over && SB.over); f++) { now += 1 / 60; ba.due(now, (m) => SA.receive(m)); ab.due(now, (m) => SB.receive(m)); a(1 / 60); b(1 / 60); SA.tick(1 / 60); SB.tick(1 / 60); }
  return SA.rejected + SB.rejected;
}
test("Langes Stocken (bis 6 s): was waehrend der Luecke ehrlich geworfen oder geschossen wurde, gilt", () => {
  for (const g of ["snow", "panzer"]) for (const stall of [4, 6]) for (let seed = 1; seed <= 8; seed++) assert.equal(stallGame(g, seed, stall, false), 0, g + " Stocken " + stall + " s, seed " + seed);
  for (let seed = 1; seed <= 8; seed++) assert.ok(stallGame("snow", seed, 4, true) <= 1, "Werfer ohne Uhr: nicht schlechter als im Altcode, seed " + seed);
});
test("Panzer: nach gemessenem Stocken kommen die Schuesse der Luecke zusammen an, ohne Stocken bleibt es einer je Nachladen", () => {
  let wall = 0; const S = Side("panzer", { seed: "z", serving: false, clock: () => wall }); S.start();
  const shot = (i) => { const r = S.rejected; S.receive({ t: "shot", i, vx: -500, vy: -700, w: 0 }); return S.rejected === r ? 1 : 0; };
  S.receive({ t: "p", vx: -500, vy: -700 });
  wall += 4.5;
  let got = 0; for (let i = 0; i < 10; i++) got += shot(i);
  assert.ok(got >= 4 && got <= 1 + Math.floor(4.5 / PANZER.RELOAD) + 1, "Schuesse der Luecke: " + got);
  let tight = 0; for (let k = 0; k < 20; k++) { wall += 0.05; S.receive({ t: "p", vx: -500, vy: -700 }); tight += shot(100 + k); }
  assert.ok(tight <= 2, "ohne Stocken kein Dauerfeuer: " + tight);
});

function overBad(g, seed, o) {
  o = o || {};
  const r = rng(seed), net = Object.assign({}, BAD, o.stall ? { stall: [20, 20 + o.stall] } : {});
  const ab = channel(r, net), ba = channel(r, net); let now = 0;
  const clock = () => now, oldA = o.old === "A", oldB = o.old === "B";
  const SA = Side(g, { seed: "d" + seed, serving: true, clock, send: (m) => { if (!(oldA && m.t === "fin")) ab.send(now, m); } });
  const SB = Side(g, { seed: "d" + seed, serving: false, clock, send: (m) => { if (!(oldB && m.t === "fin")) ba.send(now, m); } });
  for (const [S, old] of [[SA, oldA], [SB, oldB]]) if (old) { const rc = S.receive; S.receive = (m) => { if (m.t !== "fin") rc(m); }; }
  const a = Bot(g, SA, "a"), b = Bot(g, SB, "b"); SA.start(); SB.start();
  let f = 0;
  for (; f < 60 * 120 && !(SA.over && SB.over); f++) {
    now += 1 / 60; ba.due(now, (m) => SA.receive(m)); ab.due(now, (m) => SB.receive(m)); a(1 / 60); b(1 / 60);
    SA.tick(o.hang && f % 97 === 0 ? 0.25 : 1 / 60); SB.tick(1 / 60);
  }
  return { SA, SB, t: f / 60 };
}
function same(SA, SB, what) {
  assert.ok(SA.over && SB.over, what + " endet");
  assert.deepEqual(SA.score, [SB.score[1], SB.score[0]], what + ": gleicher Endstand");
  assert.equal(SA.draw, SB.draw, what);
  assert.ok(Math.max(...SA.score) <= A.rulesOf(SA.g).WIN, what + ": nie ueber WIN " + SA.score);
}
test("Doppel-K.o.: beide Seiten enden im schlechten Netz gleich, gleichzeitige letzte Treffer sind ein Unentschieden", () => {
  let draws = 0;
  for (const g of ["snow", "panzer"]) for (let seed = 1; seed <= 30; seed++) { const { SA, SB } = overBad(g, seed); same(SA, SB, g + " " + seed); if (SA.draw) draws++; }
  assert.ok(draws >= 1, "der Doppel-K.o. kommt in den 60 Partien vor und endet unentschieden");
});
test("Doppel-K.o. auch nach 4 s Stocken und mit haengenden Bildern: gleich, nie ueber WIN", () => {
  for (const g of ["snow", "panzer"]) for (let seed = 1; seed <= 15; seed++) {
    let r = overBad(g, seed, { stall: 4 }); same(r.SA, r.SB, g + " " + seed + " Stocken");
    r = overBad(g, seed, { hang: true }); same(r.SA, r.SB, g + " " + seed + " Haenger");
  }
});
test("Doppel-K.o. wenn eine Seite kein fin schickt: niemand bleibt haengen (FIN_WAIT)", () => {
  for (const g of ["snow", "panzer"]) for (const old of ["A", "B"]) for (let seed = 1; seed <= 8; seed++) {
    const { SA, SB } = overBad(g, seed, { old });
    assert.ok(SA.over && SB.over, g + " ohne fin " + old + " seed " + seed);
  }
});
test("fin gilt nur fuer ein Ende, das sein kann", () => {
  const S = Side("snow", { seed: "f", serving: false }); S.start();
  S.receive({ t: "fin", c: 2 }); S.tick(0.1);
  assert.equal(S.over, false, "zwei Treffer sind kein Ende");
  S.receive({ t: "fin", c: 99 });
  assert.equal(S.over, true); assert.equal(S.score[0], SNOW.WIN, "hoechstens WIN");
});

test("Volley: ein Treffer weit weg von der gemeldeten Figur gilt nur, soweit sie seit ihrer letzten Meldung laufen konnte", () => {
  let wall = 0; const V = VOLLEY, S = Side("volley", { seed: "v", serving: false, clock: () => wall }); S.start();
  const far = { x: 600, y: 900, vx: -400, vy: -600 };
  S.receive({ t: "p", x: 900, y: V.FY - V.PRAD }); wall += 0.05;
  S.receive({ t: "hit", b: far }); assert.equal(S.rejected, 1, "Meldungen laufen: zu weit weg");
  S.receive({ t: "p", x: 900, y: V.FY - V.PRAD }); wall += 0.4;
  S.receive({ t: "hit", b: far }); assert.equal(S.rejected, 1, "nach 0,4 s ohne Meldung konnte sie so weit laufen");
  const T = Side("volley", { seed: "w", serving: false, clock: () => wall }); T.start();
  T.receive({ t: "p", x: 900, y: V.FY - V.PRAD }); wall += 0.1;
  T.receive({ t: "hit", b: far }); assert.equal(T.rejected, 1, "nach 0,1 s noch nicht");
});
test("Elfer und Eis-Stock: wer hinterherhaengt, holt auf, aber Zuege ueberspringen oder vertauschen geht nicht", () => {
  const E = Side("elfer", { seed: "e", serving: true, send: () => {} }); E.start();
  E.input({ shot: { vx: 0, vy: -1200, c: 0 } }); E.tick(0.02);
  E.receive({ t: "res", n: 0, r: "miss" }); assert.equal(E.st.phase, "done");
  E.receive({ t: "shot", n: 2, vx: 0, vy: 1200, c: 0 }); assert.equal(E.rejected, 1, "nicht zwei weiter");
  E.receive({ t: "shot", n: 1, vx: 0, vy: 1200, c: 0 }); assert.equal(E.rejected, 1); assert.equal(E.st.n, 1); assert.equal(E.st.phase, "fly");
  const K = Side("stock", { seed: "k", serving: false }); K.start();
  K.receive({ t: "throw", n: 0, x: 500, vx: 0, vy: 500 }); K.tick(0.05);
  assert.equal(K.rejected, 1, "falsche Richtung"); assert.equal(K.st.list.length, 0);
});
test("Eis-Stock: eine Flut von Wuerfen ausser der Reihe blockiert den eigenen Zug nicht", () => {
  const out = [], K = Side("stock", { seed: "f", serving: true, send: (m) => out.push(m) }); K.start();
  for (let f = 0; f < 30; f++) {
    for (const n of [K.st.n, K.st.n + 1]) K.receive({ t: "throw", n, x: 500, vx: 0, vy: 600 });
    if (f === 10) K.input({ shot: { vx: 0, vy: -560 } });
    K.tick(1 / 60);
  }
  const mine = out.filter((m) => m.t === "throw");
  assert.equal(mine.length, 1, "der eigene Wurf ging los"); assert.equal(mine[0].vy, -560, "und zwar der eigene, kein weicher Spaetwurf");
  assert.equal(K.st.list.length, 1, "nur dieser Stein liegt");
});
test("Elfer: ein Schuss zaehlt einmal, und ein ungueltiger naechster Schuss beendet die Pause nicht", () => {
  const K = Side("elfer", { seed: "r", serving: false, send: () => {} }); K.start();
  K.input({ x: W / 2 });
  K.receive({ t: "shot", n: 0, vx: 380, vy: 1600, c: 0 });
  for (let i = 0; i < 60 && K.st.phase === "fly"; i++) K.tick(1 / 60);
  assert.equal(K.st.phase, "done"); const score = K.score.slice();
  for (let i = 0; i < 4; i++) K.receive({ t: "shot", n: 0, vx: 380, vy: 1600, c: 0 });
  for (let i = 0; i < 30; i++) K.tick(1 / 60);
  assert.deepEqual(K.score, score, "keine Tore aus Wiederholungen"); assert.equal(K.rejected, 4);
  const L = Side("elfer", { seed: "s", serving: true, send: () => {} }); L.start();
  L.input({ shot: { vx: 0, vy: -1200, c: 0 } }); L.tick(0.02); L.receive({ t: "res", n: 0, r: "miss" });
  L.receive({ t: "shot", n: 1, vx: 0, vy: 99999, c: 0 });
  assert.equal(L.st.n, 0, "die Pause laeuft weiter"); assert.equal(L.st.phase, "done");
});
test("Eis-Stock und Murmel: auch wenn die Gegenseite waehrend ihres rollenden Steins flutet, geht der eigene Wurf binnen 2 s los", () => {
  for (const g of ["stock", "murmel"]) for (const net of [{ base: 0.01, jitter: 0.001, loss: 0, rto: 0.2 }, { base: 0.03, jitter: 0.005, loss: 0, rto: 0.2 }]) {
    const r = rng(5), ab = channel(r, net), ba = channel(r, net); let now = 0; const sent = [];
    const SA = Side(g, { seed: "fl", serving: false, clock: () => now, send: (m) => ab.send(now, m) });
    const SB = Side(g, { seed: "fl", serving: true, clock: () => now, send: (m) => { if (m.t === "throw") sent.push(now); ba.send(now, m); } });
    const bot = Bot(g, SA, "a"); SA.start(); SB.start();
    let turnAt = null, worst = 0;
    for (let f = 0; f < 60 * 40 && !SB.over; f++) {
      now += 1 / 60; ba.due(now, (m) => SA.receive(m)); ab.due(now, (m) => SB.receive(m));
      for (const q of [0, 1]) ab.send(now, { t: "throw", n: SB.st.n + q, x: A.rulesOf(g).fromX(500), vx: 0, vy: 600 });
      const myTurn = SB.st.turn === 0 && !SB.st.rolling;
      if (myTurn && turnAt === null) turnAt = now;
      if (myTurn) SB.input({ shot: { x: 500, vx: 0, vy: -700 } });
      const before = sent.length; bot(1 / 60); SA.tick(1 / 60); SB.tick(1 / 60);
      if (sent.length > before && turnAt !== null) { worst = Math.max(worst, now - turnAt); turnAt = null; }
      if (turnAt !== null) worst = Math.max(worst, now - turnAt);
    }
    assert.ok(sent.length >= 3, g + ": eigene Wuerfe " + sent.length);
    assert.ok(worst <= 2, g + " (" + net.base + " s): laengste Wartezeit auf den eigenen Wurf " + worst.toFixed(2) + " s");
  }
});
