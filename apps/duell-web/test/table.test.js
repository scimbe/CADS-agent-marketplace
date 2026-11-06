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
  const A = Table.create({ game, live, name: "Ada", emoji: "🦊", autoFast: 20 }), all = [A];
  for (let i = 1; i < seats; i++) {
    const host = all[i - 1];                               // every newcomer is invited by the one before, not only by the creator
    await until(() => host.view().mySeat >= 0);
    const inv = await host.invite();
    all.push(await Table.join(inv.token, { game, live, name: "P" + i, emoji: "🐢", autoFast: 20 }));
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

test("Doppelkopf: wer einfach wegfaellt (ohne Uebergabe), macht den Platz frei; das Spiel faellt aus, ein Neuer setzt sich hin", async () => {
  const live = fakeLive(), T = await fill("doko", 4, live);
  await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
  const leaver = T[2], seat = leaver.view().mySeat; leaver._crash();
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
  await assert.rejects(T[1].inviteAll(), /full/);
  T.forEach((t) => t.leave());
});

// ---------- one link for the whole group ----------
async function group(game, live, opt) {
  const A = Table.create(Object.assign({ game, live, name: "Ada", emoji: "🦊" }, opt)), g = await A.inviteAll();
  return { A, g };
}
test("Gruppenlink (Doppelkopf): ein Link fuer drei Plaetze, gleichzeitig geoeffnet, jeder bekommt einen anderen Platz, der Vierte liest: voll", async () => {
  const live = fakeLive(), { A, g } = await group("doko", live);
  assert.equal(g.tokens.length, 3); assert.equal(new Set(g.tokens).size, 3);
  assert.deepEqual(A.view().seats.map((s) => !!(s.free && s.held)), [false, true, true, true]);
  const T = [A].concat(await Promise.all(["Ben", "Cem", "Dia"].map((n) => Table.join(g.tokens, { game: "doko", live, name: n, emoji: "🐢" }))));
  await until(() => T.every((t) => t.view().complete));
  assert.deepEqual(T.map((t) => t.view().mySeat).sort(), [0, 1, 2, 3]);
  await assert.rejects(Table.join(g.tokens, { game: "doko", live, name: "Eli", emoji: "🐙" }), /full/);
  await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
  T.forEach((t) => t.leave());
});

test("Gruppenlink: wer sich zuerst verbindet, bekommt den vordersten freien Platz, egal welches Token", async () => {
  const live = fakeLive(), { A, g } = await group("skat", live);
  assert.equal(g.tokens.length, 2);
  const C = await Table.join([g.tokens[1]], { game: "skat", live, name: "Cem", emoji: "🐢" });   // the second token first
  await until(() => C.view().mySeat >= 0);
  assert.equal(C.view().mySeat, 1);
  const B = await Table.join(g.tokens, { game: "skat", live, name: "Ben", emoji: "🐢" });        // token 1 is still free
  await until(() => B.view().mySeat >= 0);
  assert.equal(B.view().mySeat, 2);
  assert.equal(A.view().invites.length, 0);
  [A, B, C].forEach((t) => t.leave());
});

// ---------- Auto ----------
test("Auto (Doppelkopf und Skat): niemand tippt, nach der Frist zieht jedes Geraet selbst regelgerecht, alle zaehlen gleich", async () => {
  for (const [game, n] of [["doko", 4], ["skat", 3]]) {
    const live = fakeLive(), { A, g } = await group(game, live, { autoMs: 30 });
    const T = [A]; for (let i = 1; i < n; i++) T.push(await Table.join(g.tokens, { game, live, name: "P" + i, emoji: "🐢", autoMs: 30 }));
    await until(() => T.every((t) => t.view().last && (t.view().last.result || t.view().last.audit)), 120000);
    const l = T.map((t) => t.view().last);
    l.forEach((x) => assert.deepEqual(x.audit, [], game));
    assert.equal(new Set(l.map((x) => JSON.stringify(x.result.points))).size, 1, game);
    T.forEach((t) => t.leave());
  }
});

test("Auto-Schalter: ein Platz spielt auf Auto, die anderen von Hand; das Spiel endet regelgerecht und alle sehen den Auto-Platz", async () => {
  const live = fakeLive(), T = await fill("doko", 4, live);
  await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
  const ai = T[1], seat = ai.view().mySeat; ai.auto(true);
  await until(() => T.every((t) => t.view().seats[seat].auto));
  T.filter((t) => t !== ai).forEach((t) => bot(t, "doko"));
  await until(() => T.every((t) => t.view().last && t.view().last.result), 120000);
  T.forEach((t) => assert.deepEqual(t.view().last.audit, []));
  assert.equal(new Set(T.map((t) => JSON.stringify(t.view().last.result.points))).size, 1);
  T.forEach((t) => t.leave());
});

test("Aufstehen mitten im Spiel: die Karten gehen offen an alle, jedes Geraet spielt den Platz gleich zu Ende, danach ist er frei", async () => {
  for (const [game, n] of [["doko", 4], ["skat", 3]]) {
    const live = fakeLive(), T = await fill(game, n, live);
    await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
    // Skat: the leaver is Rearhand, so the bots bid, the declarer picks up the skat (with the leaver's keys from the
    // handover) and the hand is really played; Doppelkopf: the last seat
    const leaver = game === "skat" ? T[0] : T[n - 1], rest = T.filter((t) => t !== leaver), seat = leaver.view().mySeat, mine = leaver.view().hand.cards.slice().sort();
    leaver.leave();
    await until(() => rest.every((t) => t.view().hand && t.view().hand.ghosts.some((x) => x.seat === seat)));
    rest.forEach((t) => assert.deepEqual(t.view().hand.ghosts[0].cards.slice().sort(), mine));
    rest.forEach((t) => bot(t, game));
    await until(() => rest.every((t) => t.view().last && (t.view().last.result || t.view().last.audit)), 120000);
    const l = rest.map((t) => t.view().last);
    l.forEach((x) => { assert.ok(!x.aborted, game); assert.deepEqual(x.audit, [], game); assert.equal(x.cheat, undefined); });
    assert.equal(new Set(l.map((x) => JSON.stringify(x.result.points))).size, 1, game);
    assert.ok(!l[0].result.passedOut && l[0].state.tricks.length > 0, game + " was played");
    if (game === "skat") { assert.equal(l[0].result.declarer, 2); assert.equal(l[0].full.pushed.length, 2); }
    await until(() => rest.every((t) => t.view().seats[seat].free));
    rest.forEach((t) => t.leave());
  }
});

test("Eine gefaelschte Uebergabe (falsche Schluessel) macht keinen Platz zu Auto", async () => {
  const MP = require("../src/mpoker.js");
  const live = fakeLive(), T = await fill("skat", 3, live);
  await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
  const victim = T[1], A = T[0], d = A._debug(), h = d.hand, seat = victim.view().mySeat;
  // a handover for the victim's seat, as if it came over the victim's own link, but with made-up secrets
  const sec = MP.secrets(32);
  d.inbox(victim.id, { t: "handover", no: h.no, sec, pushed: [], open: h.lay.hands[seat].map((p) => [p, [sec.ki[p], sec.ki[p], sec.ki[p]]]) });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(A._debug().hand.ghost[seat], undefined);
  assert.ok(A._debug().hand.flags.some((f) => f.seat === seat));
  T.forEach((t) => t.leave());
});

test("Hausregeln am Tisch: der Ersteller waehlt, Neue uebernehmen sie (auch gegen einen alten Link), Aenderung zwischen zwei Spielen gilt fuer alle", async () => {
  const live = fakeLive(), A = Table.create({ game: "skat", live, name: "Ada", emoji: "🦊", rules: ["ramsch"], autoFast: 20 }), T = [A];
  for (let i = 1; i < 3; i++) {
    await until(() => T[i - 1].view().mySeat >= 0);
    const inv = await T[i - 1].invite();
    T.push(await Table.join(inv.token, { game: "skat", live, name: "P" + i, emoji: "🐢", rules: ["kontra"], autoFast: 20 }));   // an old link with other rules
  }
  await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
  T.forEach((t) => { assert.deepEqual(t.view().rules, ["ramsch"]); assert.deepEqual(t.view().hand.state.rules, ["ramsch"]); });
  assert.equal(A.rules(["kontra"]), false, "nicht mitten im Spiel");
  // everyone passes: Ramsch, played by the plain bot to the end, the same result everywhere
  T.forEach((t) => { let busy = false; const go = (v) => { if (busy || !v.hand || !v.hand.actions.length) return; const a = v.hand.actions.find((x) => x.t === "pass") || v.hand.actions.find((x) => x.t === "play"); if (!a) return; busy = true; setImmediate(() => { busy = false; t.act(a); }); }; t.on(go); go(t.view()); });
  await until(() => T.every((t) => t.view().last && t.view().last.result), 120000);
  const r = T.map((t) => t.view().last.result); assert.ok(r.every((x) => x.ramsch)); assert.equal(new Set(r.map((x) => JSON.stringify(x.points))).size, 1);
  assert.equal(T[1].rules(["kontra", "ramsch"]), true);
  await until(() => T.every((t) => t.view().rules.join() === "ramsch,kontra"));
  T.forEach((t) => t.next());
  await until(() => T.every((t) => t.view().hand && t.view().hand.state));
  T.forEach((t) => assert.deepEqual(t.view().hand.state.rules, ["ramsch", "kontra"]));
  T.forEach((t) => t.leave());
});

// ---------- review of PR #131 ----------
async function skatWith(rules, live) {
  const T = [Table.create({ game: "skat", live, name: "Ada", emoji: "🦊", rules, autoFast: 20 })];
  for (let i = 1; i < 3; i++) {
    await until(() => T[i - 1].view().mySeat >= 0);
    const inv = await T[i - 1].invite();
    T.push(await Table.join(inv.token, { game: "skat", live, name: "P" + i, emoji: "🐢", rules, autoFast: 20 }));
  }
  return T;
}
test("Review 3: zwei Gegenspieler sagen gleichzeitig Kontra, der Tisch haengt nicht (kein 30-s-Stau), Kontra zaehlt einmal", async () => {
  const live = fakeLive(), T = await skatWith(["kontra"], live), gate = { open: false };
  await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
  // the plain bot, but in the play phase it waits until both Kontras are out
  T.forEach((t) => {
    let busy = false;
    const go = (v) => { if (!gate.open && v.hand && v.hand.state && v.hand.state.phase === "play") return; if (busy || !v.hand || !v.hand.actions.length) return;
      const acts = v.hand.actions, pick = (f) => acts.find(f);
      const a = pick((x) => x.t === "bid" && x.v === 18 && v.mySeat === (v.hand.state.dealer + 2) % 3) || pick((x) => x.t === "pickup")
        || (pick((x) => x.t === "push") && { t: "push", seat: v.mySeat, cards: v.hand.cards.slice(0, 2) })
        || pick((x) => x.t === "declare" && x.game === "C" && !x.hand) || pick((x) => x.t === "play") || pick((x) => x.t === "pass");
      if (!a) return; busy = true; setImmediate(() => { busy = false; t.act(a); }); };
    t.on(go); t._go = go; go(t.view());
  });
  await until(() => T.every((t) => t.view().hand.state.phase === "play"));
  const decl = T[0].view().hand.state.declarer, def = T.filter((t) => t.view().mySeat !== decl);
  await until(() => def.every((t) => t.view().hand.actions.some((x) => x.t === "kontra")));
  def.forEach((t) => assert.equal(t.act({ t: "kontra", seat: t.view().mySeat }), true, "beide sagen Kontra im selben Moment"));
  await until(() => T.every((t) => t.view().hand.state.kontra === 1));
  gate.open = true; T.forEach((t) => t._go(t.view()));
  await until(() => T.every((t) => t.view().last && t.view().last.result), 12000);
  const l = T.map((t) => t.view().last);
  l.forEach((x) => assert.deepEqual(x.audit, [])); assert.equal(new Set(l.map((x) => JSON.stringify(x.result.list))).size, 1);
  T.forEach((t) => assert.notEqual(t.view().note, "stuck"));
  assert.ok(l[0].result.lines.some((x) => x.k === "kontra"), "Kontra einmal gewertet");
  T.forEach((t) => t.leave());
});
test("Review 4: wer nach dem Spiel schon bereit ist, kann die Hausregeln nicht mehr aendern; wer noch nicht bereit ist, schon, und alle starten damit", async () => {
  const live = fakeLive(), T = await skatWith(["ramsch"], live);
  await until(() => T.every((t) => t.view().hand && t.view().hand.dealt));
  T.forEach((t) => { let busy = false; const go = (v) => { if (busy || !v.hand || !v.hand.actions.length || v.hand.no > 0) return; const a = v.hand.actions.find((x) => x.t === "pass") || v.hand.actions.find((x) => x.t === "play"); if (!a) return; busy = true; setImmediate(() => { busy = false; t.act(a); }); }; t.on(go); go(t.view()); });
  await until(() => T.every((t) => t.view().last && t.view().last.result), 120000);
  assert.ok(T.every((t) => t.view().rulesOpen), "zwischen zwei Spielen offen");
  T[0].next(); T[1].next();
  assert.equal(T[0].view().rulesOpen, false); assert.equal(T[0].rules(["kontra"]), false, "schon bereit: die anderen koennten mit den alten Regeln starten");
  assert.equal(T[2].view().rulesOpen, true);
  assert.equal(T[2].rules(["kontra"]), true);
  await until(() => T.every((t) => t.view().rules.join() === "kontra"));
  T[2].next();
  await until(() => T.every((t) => t.view().hand && t.view().hand.state));
  T.forEach((t) => assert.deepEqual(t.view().hand.state.rules, ["kontra"]));
  assert.ok(T.every((t) => !t.view().rulesOpen), "mitten im Spiel zu");
  T.forEach((t) => t.leave());
});
