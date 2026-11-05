// Bauernskat at the live table (table.js + bauernskat.js) without browsers: two devices over one fake pair link (JSON
// over an ordered pipe, like the data channel). Checks that both end with the same score and that no device ever gets a
// key that would open the other's hand or a face-down card before its face-up card has been played and the trick is over.
const test = require("node:test"), assert = require("node:assert/strict");
const Table = require("../src/table.js"), B = require("../src/bauernskat.js");

// sent: every message a device puts on its link, with the sender's game state at that moment
function fakeLive(sent) {
  const open = new Map(); let n = 0;
  function pipe() {
    const ch = (++n).toString(16).padStart(64, "b");
    const end = () => ({ h: null, closers: [], dead: false, owner: null });
    const a = end(), b = end();
    const conn = (me, other) => ({
      channel: ch, _end: me,
      send: (o) => {
        if (me.dead) return;
        if (sent && me.owner) { const h = me.owner._debug().hand; sent.push({ from: me.owner, m: JSON.parse(JSON.stringify(o)), state: h && JSON.parse(JSON.stringify(h.state)), no: h && h.no }); }
        const s = JSON.stringify(o); setImmediate(() => { if (!other.dead && other.h) other.h(JSON.parse(s)); });
      },
      on: (h) => { me.h = h; }, onClose: (h) => { me.closers.push(h); },
      close: () => { if (me.dead) return; me.dead = other.dead = true; setImmediate(() => { me.closers.forEach((f) => f()); other.closers.forEach((f) => f()); }); }
    });
    return [conn(a, b), conn(b, a)];
  }
  const conns = [];
  return {
    conns,
    invite: async () => { const token = String(++n).padStart(22, "T"); let ok; const ready = new Promise((r) => { ok = r; }); open.set(token, ok); return { token, expires: Date.now() + 9e5, ready: ready.then((c) => { conns.push(c); return c; }) }; },
    accept: async (token) => { const ok = open.get(token); if (!ok) throw new Error("gone"); open.delete(token); const [x, y] = pipe(); ok(x); conns.push(y); return y; }
  };
}
const until = (f, ms = 60000) => new Promise((ok, bad) => { const t0 = Date.now(); (function tick() { let r; try { r = f(); } catch (e) { r = false; } if (r) return ok(r); if (Date.now() - t0 > ms) return bad(new Error("timeout")); setTimeout(tick, 10); })(); });

async function pair(live, o = {}) {
  const A = Table.create(Object.assign({ game: "bauernskat", live, name: "Ada", emoji: "🦊", autoFast: 5, autoMs: o.autoMs || 20000 }, o.a || {}));
  const inv = await A.invite();
  const Bt = await Table.join(inv.token, Object.assign({ game: "bauernskat", live, name: "Bo", emoji: "🐢", autoFast: 5, autoMs: o.autoMs || 20000 }, o.b || {}));
  return [A, Bt];
}
function own(live, T) {
  // the first conn belongs to the one who accepted (B), the second to the inviter (A): see invite/accept above
  const [bEnd, aEnd] = live.conns; aEnd._end.owner = T[0]; bEnd._end.owner = T[1];
}

test("Bauernskat am Tisch: zwei Geraete, ein Paar-Link, Auto spielt ganz durch, beide zaehlen gleich, alles nachgeprueft", async () => {
  const live = fakeLive(null), T = await pair(live);
  await until(() => T.every((t) => t.view().complete));
  assert.deepEqual(T.map((t) => t.view().mySeat).sort(), [0, 1]);
  assert.equal(new Set(T.map((t) => t.view().badge)).size, 1);
  await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
  for (const t of T) {
    const v = t.view(); assert.equal(v.hand.cards.length, 8, "8 Handkarten");
    assert.equal(v.hand.state.phase, "declare"); assert.equal(v.hand.state.stacks.flat().filter((x) => x.top).length, 8, "8 offene Karten");
  }
  assert.equal(JSON.stringify(T[0].view().hand.state), JSON.stringify(T[1].view().hand.state), "gleicher offener Zustand");
  T.forEach((t) => t.auto(true));
  await until(() => T.every((t) => t.view().last && t.view().last.result), 60000);
  const res = T.map((t) => JSON.stringify(t.view().last.result));
  assert.equal(res[0], res[1]);
  T.forEach((t) => assert.deepEqual(t.view().last.audit, []));
  const st = T[0].view().last.state;
  if (st.contract.game !== "N") assert.equal(st.tricks.length, 16);
  T.forEach((t) => assert.deepEqual(t.view().seats.map((s) => s.score), T[0].view().seats.map((s) => s.score)));
  // the next game: the other one deals
  T.forEach((t) => t.auto(false)); T.forEach((t) => t.next());
  await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
  assert.equal(T[0].view().hand.state.dealer, 1);
  T.forEach((t) => t.leave());
});

test("Geheimhaltung: Hand und verdeckte Stapelkarten bleiben dem Gegner verschlossen, bis die offene Karte darueber gespielt und der Stich vorbei ist", async () => {
  const sent = [], live = fakeLive(sent), T = await pair(live);
  own(live, T);
  const lay = B.layout(), seatOf = (t) => t.view().mySeat;
  let checks = 0, flipsSeen = 0;
  // After every screen update of each device: which keys of the other's cards does it hold?
  function look(t) {
    const d = t._debug(), h = d.hand; if (!h || !h.state.stacks) return;
    const me = seatOf(t), op = 1 - me, done = B.done(h.state);
    if (done) return;                                       // at the end every secret is revealed on purpose
    lay.hands[op].forEach((p) => assert.ok(!(h.keys[p] && h.keys[p][op]), "Schluessel fuer gegnerische Handkarte " + p));
    // my own hand: the other's key, but never my own face-down cards
    for (const z of [0, 1]) lay.stacks[z].forEach((x, i) => {
      const s = h.state.stacks[z][i], mayOpen = !s.under || h.state.flip.some((f) => f.seat === z && f.i === i);
      if (!mayOpen) {
        assert.ok(!(h.keys[x.down] && h.keys[x.down][1 - me]), "Schluessel fuer verdeckte Karte (" + z + "," + i + ") zu frueh");
        assert.equal(h.pub[x.down], undefined);
      }
      checks++;
    });
  }
  T.forEach((t) => t.on(() => look(t)));
  await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
  T.forEach((t) => t.auto(true));
  await until(() => T.every((t) => t.view().last && t.view().last.result), 60000);
  assert.ok(checks > 100, "geprueft: " + checks);
  // Every key a device sent: for whose card, and was it allowed at that moment by the sender's own state?
  for (const x of sent) {
    if (x.m.t !== "keys") continue;
    const me = seatOf(x.from), op = 1 - me;
    x.m.pos.forEach((p) => {
      assert.ok(lay.hands[me].indexOf(p) < 0, "eigene Handkarte nie verschickt");
      if (lay.hands[op].indexOf(p) >= 0) return;            // the other's own hand: their key from me, that is the deal
      let z = -1, i = -1, kind = "";
      lay.stacks.forEach((row, zz) => row.forEach((s, ii) => { if (s.up === p) { z = zz; i = ii; kind = "up"; } if (s.down === p) { z = zz; i = ii; kind = "down"; } }));
      assert.ok(z >= 0, "unbekannte Position " + p);
      if (kind === "up") { assert.equal(x.state.phase, "deal"); return; }
      flipsSeen++;
      assert.ok(x.state.flip.some((f) => f.seat === z && f.i === i), "verdeckte Karte nur, wenn sie dran ist");
      assert.equal(x.state.stacks[z][i].top, null, "die offene Karte darueber ist gespielt");
      assert.ok(!x.state.trick || x.state.trick.cards.length === 0, "der Stich ist vorbei");
    });
  }
  assert.ok(flipsSeen >= 1, "mindestens eine verdeckte Karte aufgedeckt: " + flipsSeen);
  // the play messages carry the keys of the card played and nothing else
  for (const x of sent) if (x.m.t === "act" && x.m.a.t === "play") assert.equal(x.m.keys.length, 2);
  T.forEach((t) => assert.deepEqual(t.view().last.audit, []));
  T.forEach((t) => t.leave());
});

test("Auto mit Frist: niemand tippt, nach der Frist zieht jedes Geraet selbst regelgerecht", async () => {
  const live = fakeLive(null), T = await pair(live, { autoMs: 15 });
  await until(() => T.every((t) => t.view().last && t.view().last.result), 60000);
  assert.equal(JSON.stringify(T[0].view().last.result), JSON.stringify(T[1].view().last.result));
  T.forEach((t) => assert.deepEqual(t.view().last.audit, []));
  T.forEach((t) => t.leave());
});

test("Aufstehen mitten im Spiel: die Karten gehen offen an den anderen, sein Geraet spielt den Platz regelgerecht zu Ende", async () => {
  const live = fakeLive(null), T = await pair(live);
  await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
  T[0].auto(true); T[1].auto(true);
  await until(() => T[0].view().hand && T[0].view().hand.state.tricks.length >= 3);
  T[1].leave();
  await until(() => T[0].view().last && T[0].view().last.result, 60000);
  assert.deepEqual(T[0].view().last.audit, []);
  T[0].leave();
});
