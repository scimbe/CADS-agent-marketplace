"use strict";
// Card numbers (src/stat.js): what goes out for share, open and vote, once per link, never more than the contract.
const test = require("node:test");
const assert = require("node:assert/strict");
const St = require("../src/stat.js");

// A navigator whose beacon records what it was given (and can refuse, or throw), and a fetch that records too.
function net(beacon) {
  const sent = [];
  const nav = beacon === undefined ? {} : { sendBeacon: (u, b) => { if (beacon === "throw") throw new Error("x"); sent.push({ how: "beacon", u, b }); return beacon; } };
  const fetch = (u, o) => { sent.push({ how: "fetch", u, o }); return Promise.reject(new Error("offline")); };
  return { sent, o: { nav, fetch } };
}
const body = async (s) => JSON.parse(s.how === "beacon" ? await s.b.text() : s.o.body);

test("stat: an den Origin der API, per Beacon mit Blob application/json, sonst fetch mit keepalive; Fehler still", async () => {
  assert.equal(St.URL, "https://demos-34a13a96.bunsenbrenner.org/api/duell/stat");
  let n = net(true); St.share({ i: "plan-09", by: [] }, n.o);
  assert.equal(n.sent.length, 1); assert.equal(n.sent[0].how, "beacon"); assert.equal(n.sent[0].u, St.URL);
  assert.equal(n.sent[0].b.type, "application/json"); assert.deepEqual(await body(n.sent[0]), { i: "plan-09", e: "share" });
  for (const b of [false, "throw", undefined]) {
    n = net(b); assert.doesNotThrow(() => St.share({ i: "x" }, n.o));
    const f = n.sent.filter((s) => s.how === "fetch");
    assert.equal(f.length, 1, "Fallback bei " + b); assert.equal(f[0].u, St.URL);
    assert.equal(f[0].o.method, "POST"); assert.equal(f[0].o.keepalive, true); assert.equal(f[0].o.credentials, "omit");
    assert.equal(f[0].o.headers["Content-Type"], "application/json");
  }
  await new Promise((r) => setTimeout(r, 5));   // the rejected fetch is caught, no unhandled rejection
  assert.doesNotThrow(() => St.send({ i: "x", e: "open" }, { nav: {}, fetch: () => { throw new Error("no fetch"); } }));
});

test("stat: share traegt die geaenderten Bereiche des letzten Trail-Eintrags, i ist doc.i, idea.id oder own", async () => {
  const n = net(true);
  St.share({ i: "plan-09", by: [{ n: "Ana", w: ["text"] }, { n: "Ben", w: ["farbe", "sticker"] }], x: "geheim" }, n.o);
  St.share({ k: "card", by: [{ n: "Ana", w: [] }] }, n.o);
  assert.deepEqual(await body(n.sent[0]), { i: "plan-09", e: "share", w: ["farbe", "sticker"] }, "kein Name, kein Text");
  assert.deepEqual(await body(n.sent[1]), { i: "own", e: "share" });
  assert.equal(St.id({ id: "quiz-chaos", kind: "turn" }), "quiz-chaos"); assert.equal(St.id(null), "own");
});

test("stat: open nur einmal je Link auf einem Geraet, gemerkt in store.seen (begrenzt)", async () => {
  const n = net(true), store = {};
  assert.ok(St.open(store, { i: "plan-09" }, "aB3dE5gH", n.o));
  assert.equal(St.open(store, { i: "plan-09" }, "aB3dE5gH", n.o), null, "derselbe Link: nicht noch einmal");
  assert.ok(St.open(store, { i: "plan-09" }, "h12345", n.o), "ein anderer Link derselben Karte zaehlt");
  assert.equal(n.sent.length, 2); assert.deepEqual(await body(n.sent[0]), { i: "plan-09", e: "open" });
  assert.deepEqual(store.seen, ["aB3dE5gH", "h12345"]);
  const again = JSON.parse(JSON.stringify(store));   // what the next visit reads from localStorage
  assert.equal(St.open(again, { i: "plan-09" }, "aB3dE5gH", n.o), null);
  for (let i = 0; i < 150; i++) St.open(store, { i: "x" }, "k" + i, n.o);
  assert.equal(store.seen.length, 100); assert.equal(store.seen[99], "k149");
  const bad = { seen: "kaputt" }; assert.ok(St.open(bad, { i: "x" }, "k", n.o)); assert.deepEqual(bad.seen, ["k"]);
});

test("stat: Stimme setzen, wechseln und zuruecknehmen schickt v und die vorherige p", async () => {
  const n = net(true), store = {}, card = { id: "plan-09" };
  assert.equal(St.vote(store, card, 1, n.o), 1); assert.deepEqual(store.votes, { "plan-09": 1 });
  assert.equal(St.vote(store, card, -1, n.o), -1); assert.deepEqual(store.votes, { "plan-09": -1 });
  assert.equal(St.vote(store, card, -1, n.o), 0, "noch einmal: zurueck"); assert.deepEqual(store.votes, {});
  assert.equal(St.vote(store, { i: "plan-09" }, 1, n.o), 1, "doc.i und idea.id sind dieselbe Karte");
  const got = await Promise.all(n.sent.map(body));
  assert.deepEqual(got, [{ i: "plan-09", e: "vote", v: 1, p: 0 }, { i: "plan-09", e: "vote", v: -1, p: 1 }, { i: "plan-09", e: "vote", v: 0, p: -1 }, { i: "plan-09", e: "vote", v: 1, p: 0 }]);
  const odd = { votes: { a: 7 } }; St.vote(odd, { id: "a" }, -1, n.o);
  assert.deepEqual(await body(n.sent[4]), { i: "a", e: "vote", v: -1, p: 0 }, "Unsinn im Speicher gilt als keine Stimme");
});
