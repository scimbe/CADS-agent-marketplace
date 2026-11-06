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
  return { S, t };
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

test("Panzer: der Bot beendet jede Partie gegen einen stillstehenden Spieler in unter 120 s (e2e-0..39)", () => {
  for (let n = 0; n < 40; n++) {
    const r = panzerVsIdle("e2e-" + n, 120);
    assert.ok(r.S.over, "e2e-" + n + " endet nicht in 120 s, Stand " + r.S.score);
    assert.deepEqual(r.S.score, [0, A.PANZER.WIN], "e2e-" + n);
  }
});
