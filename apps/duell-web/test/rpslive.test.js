"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../src/rpslive.js");
const Duel = require("../src/duel.js");
const CH = "ab".repeat(32);

// Two phones, messages handed over in order; keeps every message on the wire and the last results.
function pair(g = 0) {
  const a = R.match(CH, g), b = R.match(CH, g), wire = [], res = { a: null, b: null };
  const side = { a, b };
  async function deliver(from, msgs) {
    const to = from === "a" ? "b" : "a";
    for (const m of msgs) {
      wire.push({ from, m: JSON.parse(JSON.stringify(m)) });
      const r = await side[to].receive(JSON.parse(JSON.stringify(m)));
      if (r.result) res[to] = r.result;
      await deliver(to, r.send);
    }
  }
  return {
    a, b, wire, res,
    async round(x, y) { await deliver("a", (await a.pick(x)).send); await deliver("b", (await b.pick(y)).send); }
  };
}

test("Regeln: gleiche Regel wie im Bot-Duell, jede Hand schlaegt genau eine, Spiel bis 5", () => {
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) assert.equal(R.outcome(x, y), Duel.outcome(x, y));
  for (let x = 0; x < 3; x++) assert.equal([0, 1, 2].filter((y) => R.outcome(x, y) > 0).length, 1);
  assert.equal(R.outcome(1, 0), 1); assert.equal(R.outcome(0, 2), 1); assert.equal(R.outcome(2, 1), 1);   // paper>rock, rock>scissors, scissors>paper
  assert.equal(R.WIN, 5); assert.ok(R.over([5, 3])); assert.ok(R.over([2, 5])); assert.ok(!R.over([4, 4]));
});

test("Commit-Reveal: das Siegel verraet die Hand nicht, Salz ist frisch, Siegel haengt an Kanal, Spiel und Runde", async () => {
  const s = R.salt();
  assert.match(s, /^[0-9a-f]{32}$/); assert.notEqual(s, R.salt());
  const h = await R.seal(CH, 0, 0, 1, s);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, await R.seal(CH, 0, 0, 1, s));
  for (const other of [await R.seal(CH, 0, 0, 2, s), await R.seal(CH, 0, 1, 1, s), await R.seal(CH, 1, 0, 1, s), await R.seal("cd".repeat(32), 0, 0, 1, s)]) assert.notEqual(h, other);
  // the first message carries only round and seal: no hand, no salt
  const out = (await R.match(CH, 0).pick(2)).send;
  assert.equal(out.length, 1); assert.deepEqual(Object.keys(out[0]).sort(), ["h", "n", "t"]); assert.equal(out[0].t, "c"); assert.match(out[0].h, /^[0-9a-f]{64}$/);
});

test("Commit-Reveal: niemand deckt auf, bevor beide Siegel da sind; beide Seiten zaehlen gleich, gespiegelt", async () => {
  const a = R.match(CH, 0), b = R.match(CH, 0);
  const first = (await a.pick(0)).send;
  assert.deepEqual(first.map((m) => m.t), ["c"], "A sendet nur das Siegel");
  assert.deepEqual((await b.receive(first[0])).send, [], "B hat noch nicht gewaehlt: nichts aufdecken");
  assert.ok(b.state().theyPicked && !b.state().picked);
  const bOut = (await b.pick(2)).send;
  assert.deepEqual(bOut.map((m) => m.t), ["c", "r"], "B kennt A's Siegel schon: Siegel, dann Aufdecken");
  const aGot = await a.receive(bOut[0]);
  assert.deepEqual(aGot.send.map((m) => m.t), ["r"]);
  assert.equal((await a.receive(bOut[1])).result.o, 1, "Stein schlaegt Schere");
  assert.equal((await b.receive(aGot.send[0])).result.o, -1);
  assert.deepEqual(a.state().score, [1, 0]); assert.deepEqual(b.state().score, [0, 1]);
  assert.equal(a.state().round, 1); assert.equal(b.state().round, 1);
});

test("Spiel bis 5: endet bei 5, danach keine Zuege mehr; jedes Aufdecken kam nach beiden Siegeln", async () => {
  const p = pair();
  const plan = [[0, 0], [1, 0], [0, 1], [2, 1], [1, 2], [1, 0], [1, 0], [2, 1]];   // draw, A, B, A, B, A, A, A
  for (const [x, y] of plan) await p.round(x, y);
  assert.deepEqual(p.res.a.score, [5, 2]); assert.deepEqual(p.res.b.score, [2, 5]);
  assert.ok(p.res.a.over && p.res.b.over);
  assert.equal(p.res.a.round, plan.length - 1);
  assert.deepEqual((await p.a.pick(1)).send, [], "nach dem Ende keine neuen Zuege");
  for (let n = 0; n < plan.length; n++) {
    const at = (t, from) => p.wire.findIndex((w) => w.m.n === n && w.m.t === t && w.from === from);
    for (const who of ["a", "b"]) assert.ok(at("r", who) > Math.max(at("c", "a"), at("c", "b")), "Runde " + n + " " + who);
  }
});

test("Pruefung: andere Hand, falsches Salz oder Muell nach dem Siegel beendet das Spiel als Betrug", async () => {
  const bad = [(m) => ({ ...m, h: (m.h + 1) % 3 }), (m) => ({ ...m, s: "0".repeat(32) }), (m) => ({ ...m, h: 7 }), (m) => ({ ...m, s: "zz" }), (m) => ({ ...m, h: "0" })];
  for (const twist of bad) {
    const a = R.match(CH, 0), b = R.match(CH, 0);
    const ca = (await a.pick(1)).send[0], cb = (await b.pick(0)).send[0];
    const bRev = (await b.receive(ca)).send[0];
    assert.equal((await a.receive(cb)).send[0].t, "r");
    const r = await a.receive(twist(bRev));
    assert.equal(r.cheat, true); assert.ok(a.state().cheat && a.state().done);
    assert.deepEqual(a.state().score, [0, 0], "kein Punkt aus einem gebrochenen Siegel");
    assert.deepEqual((await a.pick(2)).send, [], "nach Betrug ist Schluss");
  }
});

test("Pruefung: Aufdecken vor dem eigenen Siegel, falsche Runde, Muell und doppeltes Siegel werden ignoriert", async () => {
  const a = R.match(CH, 0), b = R.match(CH, 0);
  const cb = (await b.pick(2)).send[0];
  assert.deepEqual(await a.receive({ t: "r", n: 0, h: 2, s: "1".repeat(32) }), { send: [] }, "Aufdecken vor A's Siegel zaehlt nicht");
  assert.deepEqual(await a.receive({ t: "c", n: 3, h: cb.h }), { send: [] }, "falsche Runde");
  assert.deepEqual(await a.receive({ t: "c", n: 0, h: "nope" }), { send: [] }, "kein Hash");
  assert.deepEqual(await a.receive(null), { send: [] });
  await a.receive(cb);
  assert.deepEqual(await a.receive({ t: "c", n: 0, h: "f".repeat(64) }), { send: [] }, "zweites Siegel zaehlt nicht");
  assert.ok(!a.state().cheat);
  const aOut = (await a.pick(0)).send;
  assert.deepEqual(aOut.map((m) => m.t), ["c", "r"]);
  const bRev = (await b.receive(aOut[0])).send[0];
  assert.equal((await a.receive(bRev)).result.o, 1, "Stein (A) schlaegt Schere (B)");
});

test("Kein Wiederabspielen: ein Siegel aus Spiel 0 passt nicht in Spiel 1", async () => {
  const s = R.salt(), old = await R.seal(CH, 0, 0, 0, s);
  const m = R.match(CH, 1);
  await m.pick(1); await m.receive({ t: "c", n: 0, h: old });
  assert.equal((await m.receive({ t: "r", n: 0, h: 0, s })).cheat, true);
});

test("Gleichzeitig waehlen: beide Siegel kreuzen sich, beide decken genau einmal auf", async () => {
  const a = R.match(CH, 0), b = R.match(CH, 0);
  const [ao, bo] = await Promise.all([a.pick(1), b.pick(1)]);
  const [ar, br] = await Promise.all([a.receive(bo.send[0]), b.receive(ao.send[0])]);
  assert.equal(ar.send.length, 1); assert.equal(br.send.length, 1);
  const [x, y] = await Promise.all([a.receive(br.send[0]), b.receive(ar.send[0])]);
  assert.equal(x.result.o, 0); assert.equal(y.result.o, 0);
  assert.deepEqual(a.state().score, [0, 0]); assert.equal(a.state().round, 1);
});
