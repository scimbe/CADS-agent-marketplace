const test = require("node:test"), assert = require("node:assert/strict");
const A = require("../src/arcade2.js");   // loads arcade.js and adds the six further duels

// Two bots play a whole game over a pipe; lag holds every message back that many frames (6 frames = 100 ms).
function play(g, seed, lag, max) {
  const P = A.pair(g, seed, lag), ba = A.bot(g, P.A, seed + "a"), bb = A.bot(g, P.B, seed + "b");
  P.start();
  let t = 0;
  while (t < (max || 900) && !(P.A.over && P.B.over)) { ba(1 / 60); bb(1 / 60); P.tick(1 / 60); P.A.ev.length = 0; P.B.ev.length = 0; t += 1 / 60; }
  return { A: P.A, B: P.B, t };
}

test("Zehn Spiele, jedes gegen den Bot bis zum Ende, beide Seiten zaehlen gleich, auch mit 100 ms Netz", () => {
  assert.equal(A.IDS.length, 10);
  for (const g of A.IDS) for (const lag of [0, 6]) {
    const r = play(g, "probe-" + g, lag);
    assert.ok(r.A.over && r.B.over, g + " endet nicht (lag " + lag + ")");
    assert.deepEqual(r.A.score, [r.B.score[1], r.B.score[0]], g + ": gespiegelt gleich");
    assert.notEqual(r.A.score[0], r.A.score[1], g + ": es gibt einen Sieger");
    assert.ok(Math.max(...r.A.score) >= A.GAMES[g].rules.WIN || g === "elfer" || g === "murmel", g + " " + r.A.score);
    assert.equal(r.A.rejected + r.B.rejected, 0, g + ": ehrliche Seiten werden nie verworfen");
  }
});

test("Aufschlag, Insel, Waelle und Bumper kommen nur aus dem Startwert und sind fuer beide gleich", () => {
  assert.deepEqual(A.puckServe("s", 2), A.puckServe("s", 2)); assert.notDeepEqual(A.puckServe("s", 2), A.puckServe("s", 3));
  assert.deepEqual(A.ziegelServe("s", 1), A.ziegelServe("s", 1));
  for (let n = 0; n < 30; n++) assert.ok(A.ziegelServe("k" + n, n).vy < 0, "weg vom Aufschlaeger");
  const T = A.island("x");
  for (let i = 0; i < T.length; i++) assert.equal(T[i], T[T.length - 1 - i], "Insel ist spiegelgleich, keiner steht schlechter");
  assert.deepEqual(A.snowWalls("x"), A.snowWalls("x")); assert.deepEqual(A.flipBumpers("x"), A.flipBumpers("x"));
  assert.deepEqual(A.elfSpot("x", 4), A.elfSpot("x", 4));
  assert.equal(A.elfShooter(0, true), true); assert.equal(A.elfShooter(0, false), false); assert.equal(A.elfShooter(1, false), true);
});

test("Ein Aufschlag, der nicht aus dem Startwert kommt, wird verworfen", () => {
  for (const g of ["puck", "ziegel", "volley", "kick", "flipper"]) {
    const S = A.side(g, { seed: "s", serving: false });
    S.receive({ t: "serve", n: 0, b: { x: 500, y: 300, vx: 0, vy: 2000 } });
    assert.equal(S.rejected, 1, g);
  }
});

test("Der Verteidiger entscheidet: was schon bei ihm ist, kann die andere Seite nicht mehr umschreiben", () => {
  const S = A.side("puck", { seed: "d", serving: true, send: () => {} });
  S.start(); S.tick(0.05);
  assert.equal(S.st.own, true);
  const before = JSON.stringify(S.st.p);
  S.receive({ t: "hit", b: { x: 500, y: 300, vx: 0, vy: 900 } });
  assert.equal(JSON.stringify(S.st.p), before, "der Puck in der eigenen Haelfte bleibt, wie er ist");
  // Ziegel: a ball already on its way here is not replaced by a late hit from over there
  const Z = A.side("ziegel", { seed: "d", serving: false, send: () => {} });
  Z.receive({ t: "serve", n: 0, b: A.mirror(A.ziegelServe("d", 0)) });
  const b0 = JSON.stringify(Z.st.b);
  Z.receive({ t: "hit", b: { x: Z.st.opp, y: A.H - A.ZIEGEL.PY + A.ZIEGEL.R, vx: 0, vy: 900 } });
  assert.equal(JSON.stringify(Z.st.b), b0);
});

test("Ziegel: Ball am Schlaeger vorbei bricht den Ziegel dahinter, durch die Luecke ist es ein Punkt", () => {
  const out = [], S = A.side("ziegel", { seed: "z", serving: false, send: (m) => out.push(m) });
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
  assert.ok(A.plausiblePaddle(500, 1000, 0.016) < 600, "Schlaeger springt nicht");
  const m = A.plausibleMallet({ x: 500, y: 200 }, { x: 500, y: 1400 }, 0.05);
  assert.ok(m.y <= A.H / 2 - A.PUCK.MR, "Schlaeger bleibt in seiner Haelfte");
  assert.equal(A.plausiblePuck("hit", { x: 500, y: 300, vx: 0, vy: 9000 }, { x: 500, y: 300 }), false, "zu schnell");
  assert.equal(A.plausiblePuck("hit", { x: 900, y: 300, vx: 0, vy: 900 }, { x: 100, y: 1500 }), false, "weit weg vom Schlaeger");
  assert.equal(A.plausibleZiegel("brk", { x: 100, y: A.H - A.ZIEGEL.WY + A.ZIEGEL.BH / 2 + A.ZIEGEL.R, vx: 0, vy: 700 }, 500, 0, [1, 1, 1, 1, 1, 1, 0]), false, "kaputter Ziegel bricht nicht zweimal");
  assert.ok(A.plausibleVolley("st", { x: 600, y: 1300, vx: 0, vy: 2200 }, { x: 700, y: 1370 }), "ein fallender Ball darf schneller sein als ein Schlag");
  assert.equal(A.plausibleVolley("hit", { x: 600, y: 1300, vx: 0, vy: 2200 }, { x: 700, y: 1370 }), false);
  assert.equal(A.plausibleShot({ i: 0, vx: 3000, vy: -100, w: 0 }, -9, 5), false, "zu stark");
  assert.equal(A.plausibleShot({ i: 1, vx: 500, vy: -600, w: 0 }, 4.8, 5), false, "zu schnell nachgeladen");
  assert.ok(A.plausibleShot({ i: 1, vx: 500, vy: -600, w: 0 }, 3, 5));
  const N = A.side("snow", { seed: "n", serving: false });
  for (let i = 0; i < 5; i++) N.receive({ t: "throw", i, x: 500, vx: 0 });
  assert.equal(N.rejected, 2, "nur drei Schneebaelle in der Hand");
  const E = A.side("elfer", { seed: "e", serving: true });
  E.start(); E.receive({ t: "shot", n: 0, vx: 0, vy: 1000, c: 0 });
  assert.equal(E.rejected, 1, "wer selbst schiesst, bekommt keinen fremden Schuss");
  const K = A.side("stock", { seed: "k", serving: true });
  K.start(); K.receive({ t: "throw", n: 0, x: 500, vx: 0, vy: 500 });
  assert.equal(K.rejected, 1, "nicht am Zug");
});

test("Rundenspiele: jeder Wurf ergibt auf beiden Handys Bit fuer Bit dasselbe Bild", () => {
  for (const g of ["stock", "murmel"]) {
    const P = A.pair(g, "same-" + g, 3), ba = A.bot(g, P.A, "a"), bb = A.bot(g, P.B, "b");
    P.start();
    for (let i = 0; i < 60 * 40; i++) {
      ba(1 / 60); bb(1 / 60); P.tick(1 / 60);
      if (!P.A.st.rolling && !P.B.st.rolling && P.A.st.n === P.B.st.n) assert.deepEqual(P.A.st.list.map((s) => [s.x, s.y]), P.B.st.list.map((s) => [s.x, s.y]), g + " nach Wurf " + P.A.st.n);
      if (P.A.over) break;
    }
    assert.ok(P.A.st.n >= 2, g + " wurde gespielt");
  }
});

test("Panzer: wer getroffen wird, entscheidet; Krater bleiben in seiner Haelfte", () => {
  const T = A.island("p"), before = T.slice();
  A.crater(T, 300, A.surface(T, 300), true);
  assert.ok(T.some((y, i) => y !== before[i]), "Krater");
  for (let i = 50; i < 100; i++) assert.equal(T[i], before[i], "die andere Haelfte bleibt unberuehrt");
  const out = [], S = A.side("panzer", { seed: "p", serving: false, send: (m) => out.push(m) });
  S.start();
  const tk = A.tankPos(S.st.T, true);
  S.st.shells.push({ x: tk.x, y: tk.y - 5, vx: 0, vy: 10, w: 0, mine: false, i: 0 });
  for (let i = 0; i < 30 && !out.some((m) => m.t === "boom"); i++) S.tick(1 / 60);
  const boom = out.find((m) => m.t === "boom");
  assert.ok(boom && boom.hit === true); assert.deepEqual(S.score, [0, 1]);
});

// Wired like playBot in arcade-ui.js: the player stands still (S idle), the bot plays B, 60 frames per second.
function panzerVsIdle(seed, max) {
  const toMe = [], toBot = [];
  const S = A.side("panzer", { seed, serving: true, send: (m) => toBot.push(JSON.parse(JSON.stringify(m))) });
  const B = A.side("panzer", { seed, serving: false, send: (m) => toMe.push(JSON.parse(JSON.stringify(m))) });
  const bot = A.bot("panzer", B, seed);
  S.start(); B.start();
  let t = 0;
  while (t < max && !S.over) { S.tick(1 / 60); while (toBot.length) B.receive(toBot.shift()); bot(1 / 60); B.tick(1 / 60); B.ev.length = 0; while (toMe.length) S.receive(toMe.shift()); S.ev.length = 0; t += 1 / 60; }
  return { S, t, shots: B.st.id };
}

test("Panzer: ein Krater sinkt nie unter die Wasserlinie, der Panzer bleibt im tiefsten Loch treffbar", () => {
  const T = A.island("tief"), P = A.PANZER, sea = T.slice();
  for (let k = 0; k < 40; k++) { const tk = A.tankPos(T, true); A.crater(T, tk.x + ((k % 5) - 2) * 20, tk.y + P.TH, true); }
  for (let i = 0; i < T.length; i++) {
    if (sea[i] < P.SEA) assert.ok(T[i] < P.SEA, "Kraterboden bleibt Land, Feld " + i);
    else assert.equal(T[i], sea[i], "der Meeresboden wird nie angehoben, Feld " + i);
  }
  const out = [], S = A.side("panzer", { seed: "tief", serving: false, send: (m) => out.push(m) });
  S.st.T.splice(0, T.length, ...T); S.start();
  const tk = A.tankPos(S.st.T, true);
  S.st.shells.push({ x: tk.x, y: tk.y - 5, vx: 0, vy: 10, w: 0, mine: false, i: 0 });
  for (let i = 0; i < 60 && !out.some((m) => m.t === "boom"); i++) S.tick(1 / 60);
  const boom = out.find((m) => m.t === "boom");
  assert.ok(boom && boom.hit === true, "Treffer statt Platschen im tiefen Krater");
});

test("Panzer: ein schneller Schuss, der im Schritt unter den Kraterboden faellt, landet trotzdem auf der Insel", () => {
  const T = A.island("tief"), P = A.PANZER;
  for (let k = 0; k < 40; k++) { const tk = A.tankPos(T, true); A.crater(T, tk.x + ((k % 5) - 2) * 20, tk.y + P.TH, true); }
  const floor = A.surface(T, P.TX);
  assert.ok(floor > P.SEA - P.FLOOR - 1 && floor < P.SEA, "Boden knapp ueber der Wasserlinie: " + floor);
  // falls 20 px per step (faster than FLOOR), starts just above the floor, so its next position is below SEA
  const f = A.flight(T, { x: P.TX, y: floor - 2, vx: 0, vy: 20 * 120, w: 0 }, 10);
  assert.equal(f.k, "land", "kein Platschen auf Land");
  assert.ok(f.y >= P.SEA, "der Schritt endet wirklich unter SEA: " + f.y);
  const g = A.flight(T, { x: 30, y: P.SEA - 2, vx: 0, vy: 2400, w: 0 }, 10);
  assert.equal(g.k, "sea", "ueber dem Wasser bleibt es Platschen");
});

test("Panzer: der Bot beendet jede Partie gegen einen stillstehenden Spieler in unter 120 s (e2e-0..39), und trifft nicht besser als frueher", () => {
  let shots = 0, hits = 0, time = 0;
  for (let n = 0; n < 40; n++) {
    const r = panzerVsIdle("e2e-" + n, 120);
    assert.ok(r.S.over, "e2e-" + n + " endet nicht in 120 s, Stand " + r.S.score);
    assert.deepEqual(r.S.score, [0, A.PANZER.WIN], "e2e-" + n);
    shots += r.shots; hits += r.S.score[1]; time += r.t;
  }
  // as strong as before the fix (about 3.3 shots per hit, 30-35 s per game), not a sharpshooter
  assert.ok(shots / hits >= 2.7 && shots / hits <= 4, "Schuss je Treffer " + (shots / hits).toFixed(2));
  assert.ok(time / 40 >= 25 && time / 40 <= 45, "mittlere Partie " + (time / 40).toFixed(1) + " s");
});

test("Kein Ball wird von den eigenen Regeln schneller als VMAX, sonst verwirft ihn die Gegenseite als Schummelei", () => {
  // Ziegel: every paddle hit, also the steep ones whose upward speed is raised to the minimum
  for (let off = -118; off <= 118; off += 2) for (const vx of [-1250, -600, 0, 600, 1250]) for (const vy of [100, 400, 900, 1250]) {
    const r = A.ziegelDefend({ x: 500 + off, y: A.ZIEGEL.PY, vx, vy }, 500);
    if (r && r.hit) assert.ok(Math.hypot(r.ball.vx, r.ball.vy) <= A.ZIEGEL.VMAX + 1e-9, off + " " + vx + " " + vy);
  }
  // Flipper: whole bot games, the ball never above its top speed on the side that moves it
  for (let seed = 1; seed <= 6; seed++) {
    const P = A.pair("flipper", "v" + seed, 0), ba = A.bot("flipper", P.A, "a"), bb = A.bot("flipper", P.B, "b"); P.start();
    for (let f = 0; f < 60 * 60 && !P.A.over; f++) {
      ba(1 / 60); bb(1 / 60); P.tick(1 / 60);
      for (const S of [P.A, P.B]) if (S.st.b && S.st.own) assert.ok(Math.hypot(S.st.b.vx, S.st.b.vy) <= A.FLIP.VMAX + 1e-9, "seed " + seed);
    }
    assert.equal(P.A.rejected + P.B.rejected, 0);
  }
});

test("Flipper: ein zu schneller oder ein von nirgends kommender Ball wird weiter verworfen", () => {
  const S = A.side("flipper", { seed: "x", serving: false }); S.start();
  S.receive({ t: "st", b: { x: 500, y: 400, vx: 0, vy: A.FLIP.VMAX * 1.05 } });
  assert.equal(S.rejected, 1, "zu schnell");
  S.receive({ t: "hit", b: { x: 500, y: 760, vx: 0, vy: 900 } });   // mid-field, far from flippers and bumpers
  assert.equal(S.rejected, 2, "Treffer ohne Klappe oder Bumper");
  S.receive({ t: "st", b: { x: 500, y: 400, vx: 0, vy: A.FLIP.VMAX } });
  assert.equal(S.rejected, 2, "ein ehrlicher Zustand an der Grenze geht durch");
});

test("Schnee: nachgeladen wird nach der Uhr des Werfers, aber eine vorgestellte Uhr bringt keine Munition", () => {
  // honest: reports flow, then a stall of 5 s in which six throws are made 0.9 s apart; all arrive together
  const S = A.side("snow", { seed: "s", serving: false }); S.start();
  for (let k = 0; k < 10; k++) { S.receive({ t: "p", x: 500, ms: 1000 + k * 50 }); S.tick(0.05); }
  for (let k = 0; k < 100; k++) S.tick(0.05);   // the stall: five seconds, in frames
  for (let i = 0; i < 6; i++) S.receive({ t: "throw", i, x: 500, vx: 0, ms: 1500 + i * 900 });
  assert.equal(S.rejected, 0, "ehrlicher Stau nach dem Stocken");
  // cheat: the same moment, but the clock jumps ten seconds per throw
  const C = A.side("snow", { seed: "c", serving: false }); C.start();
  for (let k = 0; k < 10; k++) { C.receive({ t: "p", x: 500, ms: 1000 + k * 50 }); C.tick(0.05); }
  for (let i = 0; i < 10; i++) C.receive({ t: "throw", i, x: 500, vx: 0, ms: 1500 + i * 10000 });
  assert.ok(10 - C.rejected <= 7, "drei in der Hand und hoechstens vier aus dem Guthaben: " + (10 - C.rejected));
  // a long pause and then a burst whose clock steps 0.9 s per throw: the pause does not pile up, round after round
  const P = A.side("snow", { seed: "p", serving: false }); P.start(); P.input({ x: 900 });   // out of the line of fire
  let ms = 1000, got = 0, sent = 0;
  for (let round = 0; round < 8; round++) {
    for (let k = 0; k < 200; k++) { P.tick(0.05); P.receive({ t: "p", x: 500, ms: ms }); }   // ten seconds without a throw, reports flow
    for (let i = 0; i < 40; i++) { const r = P.rejected; P.receive({ t: "throw", i: sent++, x: 500, vx: 0, ms: (ms += 900) }); if (P.rejected === r) got++; }
  }
  assert.equal(P.over, false); assert.equal(P.score[1], 0, "kein Treffer: gezaehlt wird nur das Annehmen");
  assert.ok(got <= 40, "acht Pausen, je hoechstens fuenf statt vierzig: " + got);
  // complete silence: a stall seen here buys at most its own length (up to 6 s), never more than real time allows
  const Q = A.side("snow", { seed: "q", serving: false, clock: () => Q.t }); Q.start(); Q.input({ x: 900 });
  let qms = 1000, qgot = 0;
  for (let round = 0; round < 8; round++) {
    for (let k = 0; k < 200; k++) Q.tick(0.05);                        // ten seconds of nothing at all
    for (let i = 0; i < 40; i++) { const r = Q.rejected; Q.receive({ t: "throw", i: sent++, x: 500, vx: 0, ms: (qms += 900) }); if (Q.rejected === r) qgot++; }
  }
  assert.ok(qgot <= 8 * Math.ceil(3 + (A.SNOW.AMMO * A.SNOW.RELOAD + 1 + 6) / A.SNOW.RELOAD), "je Stocken gedeckelt: " + qgot);
  assert.ok(qgot <= 3 + Q.t / A.SNOW.RELOAD, "nie mehr, als in der echten Zeit geht: " + qgot + " in " + Q.t.toFixed(0) + " s");
});

test("Schnee: ein alter Werfer ohne Uhr in den Wuerfen gegen einen neuen Empfaenger verliert keinen ehrlichen Wurf", () => {
  // the older app stamps its position reports (from the smoothing) but not its throws
  const S = A.side("snow", { seed: "o", serving: false }); S.start(); S.input({ x: 900 });   // out of the line of fire
  let t = 0, i = 0;
  for (let f = 0; f < 60 * 30; f++) {
    t += 1 / 60; S.tick(1 / 60);
    if (f % 3 === 0) S.receive({ t: "p", x: 500, ms: Math.round(t * 1000) });
    if (f % 60 === 0) S.receive({ t: "throw", i: i++, x: 500, vx: 0 });   // one per second, slower than a reload
  }
  assert.equal(S.rejected, 0);
});

// Honest bot games over the bad network with one long stall; old: the other side is an app without clocks in its throws.
function stallGame(g, seed, stall, old) {
  const N = require("./netsim.js"), NET = Object.assign({}, N.BAD, { stall: [20, 20 + stall] }), r = N.rng(seed);
  const ab = N.channel(r, NET), ba = N.channel(r, NET); let now = 0;
  const SA = A.side(g, { seed: "d" + seed, serving: true, clock: () => now, send: (m) => ab.send(now, m) });
  const SB = A.side(g, { seed: "d" + seed, serving: false, clock: () => now, send: (m) => { if (old) delete m.ms; ba.send(now, m); } });
  const a = A.bot(g, SA, "a"), b = A.bot(g, SB, "b"); SA.start(); SB.start();
  for (let f = 0; f < 60 * 120 && !(SA.over && SB.over); f++) { now += 1 / 60; ba.due(now, (m) => SA.receive(m)); ab.due(now, (m) => SB.receive(m)); a(1 / 60); b(1 / 60); SA.tick(1 / 60); SB.tick(1 / 60); SA.ev.length = 0; SB.ev.length = 0; }
  return SA.rejected + SB.rejected;
}
test("Langes Stocken (bis 6 s): was waehrend der Luecke ehrlich geworfen oder geschossen wurde, gilt", () => {
  for (const g of ["snow", "panzer"]) for (const stall of [4, 6]) for (let seed = 1; seed <= 8; seed++) {
    assert.equal(stallGame(g, seed, stall, false), 0, g + " Stocken " + stall + " s, seed " + seed);
  }
  for (let seed = 1; seed <= 8; seed++) assert.ok(stallGame("snow", seed, 4, true) <= 1, "alte App: nicht schlechter als vorher, seed " + seed);
});
test("Panzer: nach gemessenem Stocken kommen die Schuesse der Luecke zusammen an, ohne Stocken bleibt es einer je Nachladen", () => {
  let wall = 0; const S = A.side("panzer", { seed: "z", serving: false, clock: () => wall }); S.start();
  const shot = (i) => { const r = S.rejected; S.receive({ t: "shot", i, vx: -500, vy: -700, w: 0 }); return S.rejected === r ? 1 : 0; };
  S.receive({ t: "p", vx: -500, vy: -700 });
  wall += 4.5;                                                  // nothing arrived for 4.5 s here
  let got = 0; for (let i = 0; i < 10; i++) got += shot(i);
  assert.ok(got >= 4 && got <= 1 + Math.floor(4.5 / A.PANZER.RELOAD) + 1, "Schuesse der Luecke: " + got);
  let tight = 0; for (let k = 0; k < 20; k++) { wall += 0.05; S.receive({ t: "p", vx: -500, vy: -700 }); tight += shot(100 + k); }
  assert.ok(tight <= 2, "ohne Stocken kein Dauerfeuer: " + tight);
});

// Two sides over the bad network (150 ms +-80 ms, 5 % loss resent after 250 ms, one stall: 500 ms or o.stall seconds);
// o.old: "A" or "B" is an older app that neither sends nor understands "fin"; o.hang: that side's frames hang 0.25 s now and then.
function overBad(g, seed, o) {
  o = o || {};
  const N = require("./netsim.js"), r = N.rng(seed), net = Object.assign({}, N.BAD, o.stall ? { stall: [20, 20 + o.stall] } : {});
  const ab = N.channel(r, net), ba = N.channel(r, net); let now = 0;
  const clock = () => now, oldA = o.old === "A", oldB = o.old === "B";
  const SA = A.side(g, { seed: "d" + seed, serving: true, clock, send: (m) => { if (!(oldA && m.t === "fin")) ab.send(now, m); } });
  const SB = A.side(g, { seed: "d" + seed, serving: false, clock, send: (m) => { if (!(oldB && m.t === "fin")) ba.send(now, m); } });
  for (const [S, old] of [[SA, oldA], [SB, oldB]]) if (old) { const rc = S.receive; S.receive = (m) => { if (m.t !== "fin") rc(m); }; }
  const a = A.bot(g, SA, "a"), b = A.bot(g, SB, "b"); SA.start(); SB.start();
  let f = 0;
  for (; f < 60 * 120 && !(SA.over && SB.over); f++) {
    now += 1 / 60; ba.due(now, (m) => SA.receive(m)); ab.due(now, (m) => SB.receive(m)); a(1 / 60); b(1 / 60);
    const hang = o.hang && f % 97 === 0 ? 0.25 : 1 / 60;   // a hanging frame: one big step on side A
    SA.tick(hang); SB.tick(1 / 60); SA.ev.length = 0; SB.ev.length = 0;
  }
  return { SA, SB, t: f / 60 };
}
function same(SA, SB, what) {
  assert.ok(SA.over && SB.over, what + " endet");
  assert.deepEqual(SA.score, [SB.score[1], SB.score[0]], what + ": gleicher Endstand");
  assert.equal(SA.draw, SB.draw, what);
  assert.ok(Math.max(...SA.score) <= A.GAMES[SA.g].rules.WIN, what + ": nie ueber WIN " + SA.score);
}
test("Doppel-K.o.: beide Seiten enden im schlechten Netz gleich, gleichzeitige letzte Treffer sind ein Unentschieden", () => {
  let draws = 0;
  for (const g of ["snow", "panzer"]) for (let seed = 1; seed <= 30; seed++) {
    const { SA, SB } = overBad(g, seed); same(SA, SB, g + " " + seed); if (SA.draw) draws++;
  }
  assert.ok(draws >= 1, "der Doppel-K.o. kommt in den 60 Partien vor und endet unentschieden");
});
test("Doppel-K.o. auch nach 4 s Stocken und mit haengenden Bildern: gleich, nie ueber WIN", () => {
  for (const g of ["snow", "panzer"]) for (let seed = 1; seed <= 15; seed++) {
    let r = overBad(g, seed, { stall: 4 }); same(r.SA, r.SB, g + " " + seed + " Stocken");
    r = overBad(g, seed, { hang: true }); same(r.SA, r.SB, g + " " + seed + " Haenger");
  }
});
test("Doppel-K.o. mit einer alten App ohne fin, auf jeder Seite: niemand bleibt haengen", () => {
  for (const g of ["snow", "panzer"]) for (const old of ["A", "B"]) for (let seed = 1; seed <= 8; seed++) {
    const { SA, SB } = overBad(g, seed, { old });
    assert.ok(SA.over && SB.over, g + " alt " + old + " seed " + seed);
  }
});
test("fin gilt nur fuer ein Ende, das sein kann", () => {
  const S = A.side("snow", { seed: "f", serving: false }); S.start();
  S.receive({ t: "fin", c: 2 }); S.tick(0.1);
  assert.equal(S.over, false, "zwei Treffer sind kein Ende");
  S.receive({ t: "fin", c: 99 });
  assert.equal(S.over, true); assert.equal(S.score[0], A.SNOW.WIN, "hoechstens WIN");
});
