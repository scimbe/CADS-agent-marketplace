// Bauernskat at the live table (table.js + bauernskat.js) without browsers: two devices over one fake pair link (JSON
// over an ordered pipe, like the data channel). Checks that both end with the same score and that no device ever gets a
// key that would open a face-down card before the trick that took the card above it is over - also when a player
// stands up in the middle of the hand - and that a wrong key is blamed on the other seat.
const test = require("node:test"), assert = require("node:assert/strict");
const Table = require("../src/table.js"), B = require("../src/bauernskat.js");

// o.sent: every message a device puts on its link, with the sender's game state at that moment; o.tamper(owner, msg)
// may change a message on its way (a cheating device).
function fakeLive(o = {}) {
  const open = new Map(); let n = 0;
  function pipe() {
    const ch = (++n).toString(16).padStart(64, "b");
    const end = () => ({ h: null, closers: [], dead: false, owner: null });
    const a = end(), b = end();
    const conn = (me, other) => ({
      channel: ch, _end: me,
      send: (m) => {
        if (me.dead) return;
        if (o.sent && me.owner) { const h = me.owner._debug().hand; o.sent.push({ from: me.owner, m: JSON.parse(JSON.stringify(m)), state: h && JSON.parse(JSON.stringify(h.state)) }); }
        if (o.tamper && me.owner) m = o.tamper(me.owner, JSON.parse(JSON.stringify(m)));
        // what was sent before a close still arrives (a real data channel sends its queue before it closes); the
        // closers run after it (their setImmediate comes later)
        const s = JSON.stringify(m); setImmediate(() => { if (other.h) other.h(JSON.parse(s)); });
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
// what: names the step and (as a function) says what the devices show, so a timeout tells where a hand stood still.
const until = (f, ms = 60000, what) => new Promise((ok, bad) => { const t0 = Date.now(); (function tick() { let r; try { r = f(); } catch (e) { r = false; } if (r) return ok(r); if (Date.now() - t0 > ms) return bad(new Error("timeout" + (what ? ": " + (typeof what === "function" ? what() : what) : ""))); setTimeout(tick, 10); })(); });

async function pair(live, o = {}) {
  const A = Table.create({ game: "bauernskat", live, name: "Ada", emoji: "🦊", autoFast: 5, autoMs: o.autoMs || 20000 });
  const inv = await A.invite();
  const Bt = await Table.join(inv.token, { game: "bauernskat", live, name: "Bo", emoji: "🐢", autoFast: 5, autoMs: o.autoMs || 20000 });
  const [bEnd, aEnd] = live.conns; aEnd._end.owner = A; bEnd._end.owner = Bt;     // the joiner's end first, see accept
  return [A, Bt];
}
const lay = B.layout();
function stackOf(p) { let r = null; lay.stacks.forEach((row, z) => row.forEach((x, i) => { if (x.up === p) r = { z, i, kind: "up" }; if (x.down === p) r = { z, i, kind: "down" }; })); return r; }
// After every screen update: does a device hold the other seat's key for a face-down card that is not due yet?
function watch(T, bad) {
  T.forEach((t) => t.on(() => {
    const h = t._debug().hand; if (!h || !h.state.stacks || B.done(h.state)) return;   // at the end every secret is revealed on purpose
    const me = t.view().mySeat;
    for (const z of [0, 1]) lay.stacks[z].forEach((x, i) => {
      const s = h.state.stacks[z][i], due = !s.under || h.state.flip.some((f) => f.seat === z && f.i === i);
      if (!due && ((h.keys[x.down] && h.keys[x.down][1 - me]) || h.pub[x.down] != null)) bad.push("seat " + me + " holds the key of face-down (" + z + "," + i + ")");
    });
  }));
}
// Every key message: was it allowed at that moment by the sender's own state?
function checkSent(sent, bad) {
  let flips = 0;
  for (const x of sent) {
    if (x.m.t !== "keys" || !x.state) continue;
    x.m.pos.forEach((p) => {
      const st = stackOf(p); if (!st) { bad.push("unknown position " + p); return; }
      if (st.kind === "up") { if (x.state.phase !== "deal") bad.push("up key outside the deal"); return; }
      flips++;
      if (!x.state.flip.some((f) => f.seat === st.z && f.i === st.i)) bad.push("face-down (" + st.z + "," + st.i + ") sent before its turn");
      else if (x.state.stacks[st.z][st.i].top !== null || (x.state.trick && x.state.trick.cards.length)) bad.push("face-down sent during the trick");
    });
  }
  return flips;
}

test("Bauernskat am Tisch: zwei Geraete, ein Paar-Link, 16 offene Karten, keine Hand, Auto spielt durch, beide zaehlen gleich", async () => {
  const live = fakeLive(), T = await pair(live);
  await until(() => T.every((t) => t.view().complete));
  assert.deepEqual(T.map((t) => t.view().mySeat).sort(), [0, 1]);
  assert.equal(new Set(T.map((t) => t.view().badge)).size, 1);
  await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
  for (const t of T) {
    const v = t.view(); assert.deepEqual(v.hand.cards, [], "keine Handkarten");
    assert.equal(v.hand.state.phase, "declare"); assert.equal(v.hand.state.stacks.flat().filter((x) => x.top).length, 16, "16 offene Karten");
  }
  assert.equal(JSON.stringify(T[0].view().hand.state), JSON.stringify(T[1].view().hand.state), "gleicher offener Zustand");
  T.forEach((t) => t.auto(true));
  await until(() => T.every((t) => t.view().last && t.view().last.result), 60000);
  assert.equal(JSON.stringify(T[0].view().last.result), JSON.stringify(T[1].view().last.result));
  T.forEach((t) => assert.deepEqual(t.view().last.audit, []));
  T.forEach((t) => assert.deepEqual(t.view().seats.map((s) => s.score), T[0].view().seats.map((s) => s.score)));
  T.forEach((t) => t.auto(false)); T.forEach((t) => t.next());
  await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
  assert.equal(T[0].view().hand.state.dealer, 1, "der andere gibt");
  T.forEach((t) => t.leave(true));
});

test("Geheimhaltung: eine verdeckte Karte oeffnet sich erst nach dem Stich, der die Karte darueber genommen hat", async () => {
  const sent = [], bad = [], live = fakeLive({ sent }), T = await pair(live);
  watch(T, bad);
  await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
  T.forEach((t) => t.auto(true));
  await until(() => T.every((t) => t.view().last && t.view().last.result), 60000);
  const flips = checkSent(sent, bad);
  assert.deepEqual(bad, []);
  assert.ok(flips >= 2, "verdeckte Karten aufgedeckt: " + flips);
  for (const x of sent) if (x.m.t === "act" && x.m.a.t === "play") assert.equal(x.m.keys.length, 2, "ein Zug traegt nur die Schluessel seiner Karte");
  T.forEach((t) => assert.deepEqual(t.view().last.audit, []));
  T.forEach((t) => t.leave(true));
});

test("Gegenprobe: ein Geraet, das eine verdeckte Karte zu frueh freigibt, faellt der Pruefung auf", async () => {
  const orig = B.reveals;
  B.reveals = (s) => { const r = orig(s); if (s.phase === "deal") r.push({ seat: 0, i: 0, kind: "down" }); return r; };   // leaks one key with the deal
  try {
    const sent = [], bad = [], live = fakeLive({ sent }), T = await pair(live);
    watch(T, bad);
    await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
    await until(() => bad.length || sent.some((x) => x.m.t === "keys" && x.m.pos.includes(lay.stacks[0][0].down)), 10000);
    checkSent(sent, bad);
    assert.ok(bad.length > 0, "the leak is seen");
    T.forEach((t) => t.leave(true));
  } finally { B.reveals = orig; }
});

test("Auto mit Frist: niemand tippt, nach der Frist zieht jedes Geraet selbst regelgerecht", async () => {
  const live = fakeLive(), T = await pair(live, { autoMs: 15 });
  await until(() => T.every((t) => t.view().last && t.view().last.result), 60000);
  assert.equal(JSON.stringify(T[0].view().last.result), JSON.stringify(T[1].view().last.result));
  T.forEach((t) => assert.deepEqual(t.view().last.audit, []));
  T.forEach((t) => t.leave(true));
});

test("Aufstehen mitten im Spiel: das Geraet spielt auf Auto zu Ende und gibt jeden verdeckten Schluessel erst frei, wenn er dran ist; dann ist der Platz frei", async () => {
  const sent = [], bad = [], live = fakeLive({ sent }), T = await pair(live);
  watch(T, bad);
  const at = (step) => () => step + " " + JSON.stringify(T.map((t) => { const v = t.view(), h = v.hand; return { seat: v.mySeat, auto: v.auto, closed: v.closed, tricks: h && h.state.tricks.length, phase: h && h.state.phase, wait: v.deadline ? v.deadline - Date.now() : 0, last: !!v.last, seats: v.seats.map((x) => (x.free ? "frei" : x.auto ? "auto" : "da")) }; }));
  await until(() => T.every((t) => t.view().hand && t.view().hand.dealt), 60000, at("ausgeteilt"));
  // Stand up in the middle, not at the end: on Auto (5 ms a move) a whole hand is over in well under a second, and under
  // load the 10 ms poll could first look when the hand is already done; then leave() closes at once (nothing left to play)
  // and the seat never shows Auto. So the moment the second trick is over (on the screen update itself, not on a poll)
  // both devices go off Auto: the next move then waits for the 20 s clock, and the test stands up in that pause.
  let paused = false;
  T[0].on((v) => { if (!paused && v.hand && v.hand.state.tricks.length >= 2) { paused = true; T[0].auto(false); T[1].auto(false); } });
  T[0].auto(true); T[1].auto(true);
  await until(() => paused, 60000, at("zwei Stiche"));
  assert.ok(!B.done(T[0]._debug().hand.state), "mitten im Spiel");
  const seat = T[1].view().mySeat;
  T[1].leave();                                             // the screen closes; the device stays until the hand is over
  assert.equal(T[1].view().closed, false);
  await until(() => T[0].view().seats[seat].auto, 60000, at("Platz auf Auto"));
  T[0].auto(true);                                          // the one who stays plays on quickly too
  assert.equal(T[0]._debug().hand.ghost[seat], undefined, "keine Uebergabe aller Schluessel");
  await until(() => T[0].view().last && T[0].view().last.result, 60000, at("Ergebnis"));
  assert.deepEqual(T[0].view().last.audit, []);
  checkSent(sent, bad); assert.deepEqual(bad, []);
  await until(() => T[1].view().closed && T[0].view().seats[seat].free, 60000, at("Platz frei"));
  T[0].leave(true);
});

test("Falscher Schluessel in der 2er-Runde: die Schuld bekommt der andere Platz, das Spiel haelt an und sagt es", async () => {
  let A = null, cheated = false;
  const live = fakeLive({ tamper: (owner, m) => {
    // B swaps its key of the first face-down card it has to open for another valid key
    if (owner !== A && m.t === "keys" && !cheated && m.pos.length === 1 && stackOf(m.pos[0]) && stackOf(m.pos[0]).kind === "down") { cheated = true; m.k = ["02".padEnd(64, "0")]; }
    return m;
  } });
  const T = await pair(live); A = T[0];
  await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
  T.forEach((t) => t.auto(true));
  await until(() => A.view().hand && A.view().hand.flags.length, 60000);
  const f = A.view().hand.flags[0];
  assert.equal(f.seat, T[1].view().mySeat, "B ist schuld, nicht der Besitzer des Stapels");
  assert.equal(f.why, "key"); assert.equal(A.view().note, "badkey");
  T.forEach((t) => t.leave(true));
});
