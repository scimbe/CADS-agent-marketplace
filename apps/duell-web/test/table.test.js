// The card table without browsers: a fake Live joins the pairs in-process (JSON over ordered pipes, like the data
// channel), simple bots play, and every device must end with the same score while only ever opening its own cards.
const test = require("node:test"), assert = require("node:assert/strict");
const Table = require("../src/table.js");

function fakeLive() {
  const open = new Map(); let n = 0;
  function pipe() {
    const ch = (++n).toString(16).padStart(64, "a");
    const end = () => ({ h: null, closers: [], dead: false });
    const a = end(), b = end();
    const conn = (me, other) => ({
      channel: ch,
      send: (o) => { if (me.dead) return; const s = JSON.stringify(o); setImmediate(() => { if (!other.dead && other.h) other.h(JSON.parse(s)); }); },
      on: (h) => { me.h = h; }, onClose: (h) => { me.closers.push(h); },
      close: () => { if (me.dead) return; me.dead = other.dead = true; setImmediate(() => { me.closers.forEach((f) => f()); other.closers.forEach((f) => f()); }); }
    });
    return [conn(a, b), conn(b, a)];
  }
  return {
    invite: async () => { const token = String(++n).padStart(22, "T"); let ok; const ready = new Promise((r) => { ok = r; }); open.set(token, ok); return { token, expires: Date.now() + 9e5, ready }; },
    accept: async (token) => { const ok = open.get(token); if (!ok) throw new Error("gone"); open.delete(token); const [x, y] = pipe(); ok(x); return y; }
  };
}
// A bot that always takes the plainest way through: healthy, no calls, first legal card; in Skat middlehand bids 18
// and plays Kreuz after picking up.
function bot(t, game) {
  let busy = false;
  const go = (v) => {
    if (busy || !v.hand || !v.hand.actions.length) return;
    const acts = v.hand.actions, pick = (f) => acts.find(f);
    let a;
    if (game === "doko") a = pick((x) => x.t === "vorbehalt" && x.v === "gesund") || pick((x) => x.t === "play");
    else a = pick((x) => x.t === "bid" && x.v === 18 && v.mySeat === (v.hand.state.dealer + 2) % 3) || pick((x) => x.t === "pickup")
      || (pick((x) => x.t === "push") && { t: "push", seat: v.mySeat, cards: v.hand.cards.slice(0, 2) })
      || pick((x) => x.t === "declare" && x.game === "C" && !x.hand) || pick((x) => x.t === "play") || pick((x) => x.t === "pass");
    if (!a) return;
    busy = true; setImmediate(() => { busy = false; t.act(a); });
  };
  t.on(go); go(t.view());
}
const until = (f, ms = 60000) => new Promise((ok, bad) => { const t0 = Date.now(); (function tick() { let r; try { r = f(); } catch (e) { r = false; } if (r) return ok(r); if (Date.now() - t0 > ms) return bad(new Error("timeout")); setTimeout(tick, 20); })(); });

async function fill(game, seats, live) {
  const A = Table.create({ game, live, name: "Ada", emoji: "🦊" }), all = [A];
  for (let i = 1; i < seats; i++) {
    const host = all[i - 1];                               // every newcomer is invited by the one before, not only by the creator
    await until(() => host.view().mySeat >= 0);
    const inv = await host.invite();
    all.push(await Table.join(inv.token, { game, live, name: "P" + i, emoji: "🐢" }));
  }
  return all;
}

test("Doppelkopf: vier Geraete, jeder laedt den naechsten ein, ein ganzes Spiel, alle zaehlen gleich", async () => {
  const live = fakeLive(), T = await fill("doko", 4, live);
  await until(() => T.every((t) => t.view().complete));
  const badges = T.map((t) => t.view().badge); assert.equal(new Set(badges).size, 1); assert.equal(badges[0].split(" ").length, 3);
  assert.deepEqual(T.map((t) => t.view().mySeat).sort(), [0, 1, 2, 3]);
  await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
  // nobody opened a card that is not theirs
  for (const t of T) { const h = t._debug().hand; assert.deepEqual(Object.keys(h.open).map(Number).sort((a, b) => a - b), h.lay.hands[t.view().mySeat]); }
  T.forEach((t) => bot(t, "doko"));
  await until(() => T.every((t) => t.view().last && t.view().last.result), 120000);
  const res = T.map((t) => JSON.stringify(t.view().last.result.points));
  assert.equal(new Set(res).size, 1, res.join(" | "));
  T.forEach((t) => assert.deepEqual(t.view().last.audit, []));
  const sc = T[0].view().seats.map((s) => s.score); assert.equal(sc.reduce((a, b) => a + b, 0), 0);
  T.forEach((t) => assert.deepEqual(t.view().seats.map((s) => s.score), sc));
  T.forEach((t) => t.leave());
});

test("Doppelkopf: wer geht, macht den Platz frei; das laufende Spiel faellt aus, ein Neuer setzt sich hin", async () => {
  const live = fakeLive(), T = await fill("doko", 4, live);
  await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
  const leaver = T[2], seat = leaver.view().mySeat; leaver.leave();
  const rest = T.filter((t) => t !== leaver);
  await until(() => rest.every((t) => !t.view().hand && t.view().last && t.view().last.aborted && t.view().seats[seat].free));
  const inv = await rest[2].invite();                       // the last one who came invites
  const E = await Table.join(inv.token, { game: "doko", live, name: "Eve", emoji: "🐙" });
  const now = rest.concat([E]);
  await until(() => now.every((t) => t.view().complete));
  assert.equal(E.view().mySeat, seat);
  await until(() => now.every((t) => t.view().hand && t.view().hand.dealt));
  assert.equal(new Set(now.map((t) => t.view().hand.no)).size, 1);
  now.forEach((t) => t.leave());
});

test("Skat: drei Geraete, Reizen, Skat aufnehmen und druecken, Wertung gleich, gedrueckte Karten bleiben geheim", async () => {
  const live = fakeLive(), T = await fill("skat", 3, live);
  await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
  T.forEach((t) => bot(t, "skat"));
  await until(() => T.every((t) => t.view().last && (t.view().last.result || t.view().last.audit)), 120000);
  const l = T.map((t) => t.view().last);
  l.forEach((x) => assert.deepEqual(x.audit, []));
  assert.equal(new Set(l.map((x) => JSON.stringify(x.result.list))).size, 1);
  assert.equal(l[0].result.game, "C"); assert.equal(l[0].full.pushed.length, 2);
  T.forEach((t) => t.leave());
});

test("Ein voller Tisch nimmt niemanden mehr auf", async () => {
  const live = fakeLive(), T = await fill("skat", 3, live);
  await until(() => T.every((t) => t.view().complete));
  await assert.rejects(T[1].invite(), /full/);
  T.forEach((t) => t.leave());
});
