"use strict";
// Card numbers (src/stat.js): what goes out for share, open and vote, once per link, never more than the contract; a vote
// counts (and shows) only when the server took it from a signed-in account.
const test = require("node:test");
const assert = require("node:assert/strict");
const St = require("../src/stat.js");
const D = require("../src/daily.js");

// A fetch that records every call and answers with the given status and X-Stat header (or throws / rejects).
function net(status, xstat) {
  const sent = [];
  const fetch = (u, o) => {
    sent.push({ u, o, body: JSON.parse(o.body) });
    if (status === "throw") throw new Error("no fetch");
    if (status === "offline") return Promise.reject(new Error("offline"));
    return Promise.resolve({ status, headers: { get: (k) => (k === "X-Stat" ? xstat || null : null) } });
  };
  return { sent, o: { fetch } };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test("stat: ein fetch an den Origin der API, POST keepalive, ohne Cookie und Referrer; kein Beacon; Fehler still", async () => {
  assert.equal(St.URL, "https://demos-34a13a96.bunsenbrenner.org/api/duell/stat");
  const n = net(204); St.share({ i: "plan-09", by: [] }, n.o);
  assert.equal(n.sent.length, 1);
  assert.deepEqual({ ...n.sent[0].o, body: undefined }, { method: "POST", keepalive: true, credentials: "omit", referrerPolicy: "no-referrer", headers: { "Content-Type": "application/json" }, body: undefined });
  assert.equal(n.sent[0].u, St.URL); assert.deepEqual(n.sent[0].body, { i: "plan-09", e: "share" });
  let beacon = 0; const nav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { sendBeacon: () => { beacon++; return true; } } });
  try { St.open({}, { i: "x" }, "k", net(204).o); } finally { if (nav) Object.defineProperty(globalThis, "navigator", nav); else delete globalThis.navigator; }
  assert.equal(beacon, 0, "nie per Beacon (der schickt Cookies mit)");
  for (const s of ["throw", "offline", 500]) assert.doesNotThrow(() => St.share({ i: "x" }, net(s).o), String(s));
  await tick();   // a rejected fetch is caught: no unhandled rejection
});

test("stat: share traegt die geaenderten Bereiche des letzten Trail-Eintrags, nur bekannte AREAS; i ist doc.i, idea.id oder own (auch fuer eine freie KI-Karte)", () => {
  const n = net(204);
  assert.deepEqual(D.AREAS, ["text", "farbe", "stil", "sticker", "foto", "beat", "stimme", "regeln", "figur", "welt", "idee"]);
  St.share({ i: "plan-09", by: [{ n: "Ana", w: ["text"] }, { n: "Ben", w: ["farbe", "sticker", "beat", "idee"] }], x: "geheim" }, n.o);
  St.share({ i: "plan-09", by: [{ n: "Ben", w: ["farbe", "<script>", "farbe", "toString", 7] }] }, n.o);
  St.share({ k: "card", by: [{ n: "Ana", w: [] }] }, n.o);
  St.share({ i: "x", by: [{ n: "Ana", w: ["unbekannt"] }] }, n.o);
  St.share({ i: "plan-09", ki: { k: "karte", s: "s1" }, by: [{ n: "Ana", w: ["text"] }] }, n.o);
  St.share({ i: "plan-09", ki: { k: "wish", s: "s1" }, by: [] }, n.o);
  assert.deepEqual(n.sent.map((s) => s.body), [
    { i: "plan-09", e: "share", w: ["farbe", "sticker", "beat", "idee"] },
    { i: "plan-09", e: "share", w: ["farbe"] },
    { i: "own", e: "share" },
    { i: "x", e: "share" },
    { i: "own", e: "share", w: ["text"] },
    { i: "plan-09", e: "share" }]);
  assert.equal(St.id({ id: "quiz-chaos", kind: "turn" }), "quiz-chaos"); assert.equal(St.id(null), "own");
});

test("stat: open nur einmal je Link auf einem Geraet, gemerkt in store.seen (begrenzt)", () => {
  const n = net(204), store = {};
  assert.ok(St.open(store, { i: "plan-09" }, "aB3dE5gH", n.o));
  assert.equal(St.open(store, { i: "plan-09" }, "aB3dE5gH", n.o), null, "derselbe Link: nicht noch einmal");
  assert.ok(St.open(store, { i: "plan-09" }, "h12345", n.o), "ein anderer Link derselben Karte zaehlt");
  assert.deepEqual(n.sent.map((s) => s.body), [{ i: "plan-09", e: "open" }, { i: "plan-09", e: "open" }]);
  assert.equal(n.sent[0].o.credentials, "omit");
  assert.deepEqual(store.seen, ["aB3dE5gH", "h12345"]);
  const again = JSON.parse(JSON.stringify(store));   // what the next visit reads from localStorage
  assert.equal(St.open(again, { i: "plan-09" }, "aB3dE5gH", n.o), null);
  for (let i = 0; i < 150; i++) St.open(store, { i: "x" }, "k" + i, n.o);
  assert.equal(store.seen.length, 100); assert.equal(store.seen[99], "k149");
  const bad = { seen: "kaputt" }; assert.ok(St.open(bad, { i: "x" }, "k", n.o)); assert.deepEqual(bad.seen, ["k"]);
});

test("stat: Stimme setzen, wechseln und zuruecknehmen schickt nur v, mit dem Login dieser Seite", async () => {
  const n = net(204), store = {}, card = { id: "plan-09" };
  assert.deepEqual(await St.vote(store, card, 1, n.o), { v: 1 }); assert.deepEqual(store.votes, { "plan-09": 1 });
  assert.deepEqual(await St.vote(store, card, -1, n.o), { v: -1 }); assert.deepEqual(store.votes, { "plan-09": -1 });
  assert.deepEqual(await St.vote(store, card, -1, n.o), { v: 0 }, "noch einmal: zurueck"); assert.deepEqual(store.votes, {});
  assert.deepEqual(await St.vote(store, { i: "plan-09" }, 1, n.o), { v: 1 }, "doc.i und idea.id sind dieselbe Karte");
  assert.deepEqual(n.sent.map((s) => s.body), [{ i: "plan-09", e: "vote", v: 1 }, { i: "plan-09", e: "vote", v: -1 }, { i: "plan-09", e: "vote", v: 0 }, { i: "plan-09", e: "vote", v: 1 }], "kein p: der Server kennt die Stimme je Konto");
  assert.ok(n.sent.every((s) => s.o.credentials === "same-origin" && s.o.referrerPolicy === "no-referrer"));
  const odd = { votes: { a: 7 } }; await St.vote(odd, { id: "a" }, -1, n.o);
  assert.deepEqual(n.sent[4].body, { i: "a", e: "vote", v: -1 }, "Unsinn im Speicher gilt als keine Stimme");
});

test("stat: ohne Konto (X-Stat: login oder 401) zaehlt die Stimme nicht und wird nicht gemerkt; offline ebenso, ohne Hinweis", async () => {
  for (const [s, x] of [[202, "login"], [204, "login"], [401, null]]) {
    const store = { votes: { b: 1 } };
    assert.deepEqual(await St.vote(store, { id: "a" }, 1, net(s, x).o), { v: 0, why: "login" }, s + " " + x);
    assert.deepEqual(await St.vote(store, { id: "b" }, -1, net(s, x).o), { v: 1, why: "login" });
    assert.deepEqual(store.votes, { b: 1 }, "nichts als abgegeben gemerkt");
  }
  for (const s of ["offline", "throw", 500, 429]) {
    const store = {};
    assert.deepEqual(await St.vote(store, { id: "a" }, 1, net(s).o), { v: 0, why: "" }, String(s)); assert.equal(store.votes, undefined);
  }
});

test("stat: X-Stat dup, full, unavailable: 2xx zaehlt trotzdem nicht, der alte Stand bleibt (auch beim 4. Wechsel)", async () => {
  for (const x of ["dup", "full", "unavailable"]) {
    const store = { votes: { a: -1 } };
    assert.deepEqual(await St.vote(store, { id: "a" }, 1, net(204, x).o), { v: -1, why: x }, x);
    assert.deepEqual(await St.vote(store, { id: "a" }, -1, net(200, x).o), { v: -1, why: x }, x + ": zuruecknehmen ebenso nicht");
    assert.deepEqual(store.votes, { a: -1 });
  }
  // three changes count, the fourth is refused: the shown vote stays the third
  const store = {}, answers = [null, null, null, "full"]; let i = 0;
  const o = { fetch: () => Promise.resolve({ status: 204, headers: { get: () => answers[i++] } }) };
  for (const v of [1, -1, 1]) await St.vote(store, { id: "a" }, v, o);
  assert.deepEqual(store.votes, { a: 1 });
  assert.deepEqual(await St.vote(store, { id: "a" }, -1, o), { v: 1, why: "full" }); assert.deepEqual(store.votes, { a: 1 });
});

test("stat: X-Stat same (dieselbe Stimme schon von einem anderen Geraet des Kontos) gilt als bestaetigt, ohne Hinweis", async () => {
  const store = {};
  assert.deepEqual(await St.vote(store, { id: "a" }, 1, net(204, "same").o), { v: 1 }); assert.deepEqual(store.votes, { a: 1 });
  assert.deepEqual(await St.vote(store, { id: "a" }, 1, net(200, "same").o), { v: 0 }, "zuruecknehmen, schon so gespeichert"); assert.deepEqual(store.votes, {});
});

test("stat: card — Tageskarte und empfangene Katalogkarte ja; eigene Karte, Einladung ohne Doc-ID und freie KI-Karte nein", () => {
  const idea = { id: "plan-09" }, got = { i: "plan-09", by: [] };
  assert.equal(St.card({ idea }), idea);
  assert.equal(St.card({ doc: got, note: "Von Ana" }), got);
  assert.equal(St.card({ doc: got }), null, "ohne note: nichts Empfangenes");
  assert.equal(St.card({ doc: { by: [] }, note: "x" }), null, "eigene Karte ohne Katalog-ID");
  assert.equal(St.card({ doc: { i: "plan-09", ki: { k: "wish", s: "s1" } }, note: "x" }).i, "plan-09", "Wunsch-KI bleibt die Katalogkarte");
  assert.equal(St.card({ doc: { i: "plan-09", ki: { k: "karte", s: "s1" } }, note: "x" }), null, "freie Karte: ihr Deck zaehlt, nicht die Katalogkarte");
  assert.equal(St.card(null), null);
});

test("stat: Daily Business (flavor stat: false) schickt nichts", async () => {
  globalThis.DailyFlavor = { id: "business", stat: false };
  try {
    const n = net(204), store = {};
    assert.equal(St.off(), true);
    St.share({ i: "x" }, n.o); St.open(store, { i: "x" }, "k", n.o);
    assert.deepEqual(await St.vote(store, { id: "x" }, 1, n.o), { v: 0, why: "" });
    assert.equal(n.sent.length, 0);
  } finally { delete globalThis.DailyFlavor; }
  assert.equal(St.off(), false);
});

// M7: the switch "Karten-Statistik aus" (store.statOff, stimme-ui.js row): no share and no open, a vote still goes out.
test("stat: Schalter aus (store.statOff) schickt kein share und kein open, merkt nichts als gesehen; Daumen gehen weiter", async () => {
  const n = net(204), store = { statOff: true };
  assert.equal(St.off("share", { store }), true); assert.equal(St.off("open", { store }), true);
  assert.equal(St.off("vote", { store }), false, "eine Stimme ist eine bewusste Handlung"); assert.equal(St.off(), false, "ohne Ereignis: nur der Flavor");
  assert.equal(St.share({ i: "plan-09", by: [{ n: "Ana", w: ["text"] }] }, { ...n.o, store }), null);
  assert.equal(St.open(store, { i: "plan-09" }, "aB3dE5gH", n.o), null);
  assert.equal(store.seen, undefined, "nicht als gesehen gemerkt: wieder an zaehlt der Link einmal");
  assert.deepEqual(await St.vote(store, { id: "plan-09" }, 1, n.o), { v: 1 });
  assert.deepEqual(n.sent.map((s) => s.body), [{ i: "plan-09", e: "vote", v: 1 }]);
  // The store of the page (window.Kit.store) when the caller passes none, as app.js and stimme-ui.js do.
  globalThis.Kit = { store };
  try { assert.equal(St.share({ i: "x" }, n.o), null); assert.equal(n.sent.length, 1); } finally { delete globalThis.Kit; }
  // on again: share and open as before
  delete store.statOff;
  assert.deepEqual(St.share({ i: "x" }, n.o), { i: "x", e: "share" });
  assert.ok(St.open(store, { i: "plan-09" }, "aB3dE5gH", n.o));
  assert.deepEqual(n.sent.slice(1).map((s) => s.body), [{ i: "x", e: "share" }, { i: "plan-09", e: "open" }]);
});
