// Laufzeit + Statechart mit Testkarten (test/lib/fixture-app.js): Echtzeit allein/Bot/Geist/Live, Gruppen-Live mit
// drei Geraeten, Bot mit zwei lokalen Bots, Entwurf/PREPARE. Gleiche Treiber wie im Produkt, keine Kartensonderlogik.
import test from "node:test";
import assert from "node:assert/strict";
import { fixtureApp } from "./lib/fixture-app.js";
import { counter, memStorage, fakeLiveNet, until } from "./helpers.js";

let A;
test.before(async () => { A = await fixtureApp(); });

function fakeRt() {
  let t = 0; const q = [], frames = [];
  return { frames, dep: { now: () => t, frame: (f) => q.push(f), cancel: () => {}, draw: (n, i) => frames.push(i), sound: () => {} }, run(ms) { for (let x = 0; x < ms; x += 16) { t += 16; q.splice(0).forEach((f) => f()); } } };
}
function rtRuntime(opts = {}) {
  const shared = [], R = fakeRt();
  const rt = A.createRuntime({ lang: "de", entropy: opts.entropy || counter("a"), storage: memStorage(), live: opts.live || (() => Promise.reject(new Error("kein live"))), share: (f) => { shared.push(f); return Promise.resolve("copied"); }, clearUrl: () => {}, schedule: (f) => setTimeout(f, 0), onChange: () => {}, rt: R.dep });
  rt.shared = shared; rt.R = R; return rt;
}
const leaf = (rt) => rt.state.config.filter((c) => c.startsWith("inhalt.")).sort((a, b) => b.length - a.length)[0];

test("Echtzeit allein bis zum Ende, dann Geist teilen; Empfaenger prueft den Geist und spielt dagegen", async () => {
  const a = rtRuntime();
  a.dispatch({ type: "OPEN", id: "fx-rt" }); a.dispatch({ type: "MODE", mode: "bot" }); a.dispatch("GO");
  assert.equal(leaf(a), "inhalt.card.rt.ready");
  a.R.run(3200); await until(() => leaf(a) === "inhalt.card.rt.run");
  a.dispatch({ type: "PAUSE" }); await until(() => leaf(a) === "inhalt.card.rt.pause");
  a.dispatch({ type: "RESUME" }); await until(() => leaf(a) === "inhalt.card.rt.run");
  for (let i = 0; i < 400 && leaf(a) !== "inhalt.card.rt.over"; i++) { a.rt.key("Space", i % 2 === 0); a.R.run(500); await new Promise((r) => setTimeout(r, 0)); }
  assert.equal(leaf(a), "inhalt.card.rt.over");
  assert.ok(a.state.ctx.link && a.state.ctx.link.startsWith("#v2.ghost."), "Geist-Link");
  const b = rtRuntime({ entropy: counter("b") });
  b.link(a.state.ctx.link); assert.equal(leaf(b), "inhalt.receive.show", b.state.ctx.reason);
  b.dispatch("ACCEPT"); assert.equal(leaf(b), "inhalt.card.rt.ready"); assert.equal(b.state.ctx.mode, "ghost");
  b.R.run(3200); await until(() => leaf(b) === "inhalt.card.rt.run");
  const bad = rtRuntime({ entropy: counter("c") }); bad.link(a.state.ctx.link.slice(0, -4) + "AAAA");
  assert.equal(leaf(bad), "inhalt.receive.reject");
});

test("Echtzeit live (lockstep) zwischen zwei Geraeten: gleicher Endstand", async () => {
  const net = fakeLiveNet(), a = rtRuntime({ live: net.loader }), b = rtRuntime({ entropy: counter("b"), live: net.loader });
  a.dispatch({ type: "OPEN", id: "fx-rt" }); a.dispatch({ type: "MODE", mode: "live" }); a.dispatch("GO");
  await until(() => a.state.ctx.raum && a.state.ctx.raum.inviteLink);
  b.link(a.state.ctx.raum.inviteLink); b.dispatch("ACCEPT");
  await until(() => leaf(a) && leaf(a).startsWith("inhalt.card.rt") && leaf(b) && leaf(b).startsWith("inhalt.card.rt"));
  for (let i = 0; i < 2000 && !(leaf(a) === "inhalt.card.rt.over" && leaf(b) === "inhalt.card.rt.over"); i++) { a.R.run(100); b.R.run(100); a.rt.key("Space", i % 2 === 0); b.rt.key("Enter", i % 2 === 1); await new Promise((r) => setTimeout(r, 0)); }
  assert.equal(leaf(a), "inhalt.card.rt.over"); assert.equal(leaf(b), "inhalt.card.rt.over");
  assert.deepEqual(a.state.ctx.rtResult.status.score, b.state.ctx.rtResult.status.score);
});

test("Gruppen-Live mit drei Geraeten (Zugkarte, alle Sitze geheim): ein Link je Gast, gleicher Zustand, kein fremdes Geheimnis", async () => {
  const net = fakeLiveNet(), h = rtRuntime({ live: net.loader, entropy: counter("a") });
  h.dispatch({ type: "OPEN", id: "fx-zug" }); h.dispatch({ type: "MODE", mode: "live" }); h.dispatch("GO");
  await until(() => h.state.ctx.raum && h.state.ctx.raum.invites && Object.keys(h.state.ctx.raum.invites).length === 2);
  const g = { 1: rtRuntime({ live: net.loader, entropy: counter("b") }), 2: rtRuntime({ live: net.loader, entropy: counter("c") }) };
  for (const s of [1, 2]) { g[s].link(h.state.ctx.raum.invites[s]); g[s].dispatch("ACCEPT"); }
  const all = [h, g[1], g[2]];
  await until(() => all.every((d) => d.state.ctx.session));
  for (let k = 0; k < 50; k++) {
    for (const d of all) if (leaf(d) === "inhalt.card.play.turn") { const seat = d.state.ctx.viewer; d.dispatch({ type: "INPUT", input: { t: "say", seat, a: "Hallo " + seat } }); }
    await new Promise((r) => setTimeout(r, 2));
    if (all.every((d) => leaf(d) === "inhalt.card.play.over")) break;
  }
  assert.ok(all.every((d) => leaf(d) === "inhalt.card.play.over"), all.map(leaf).join());
  const pub = all.map((d) => JSON.stringify(d.state.ctx.session.state.pub));
  assert.equal(pub[0], pub[1]); assert.equal(pub[1], pub[2]);
  for (const d of all) { const me = d.state.ctx.session.mine[0]; for (const o of [0, 1, 2]) if (o !== me) assert.equal(d.state.ctx.session.state.priv[o], null); }
  assert.ok(all.every((d) => d.state.ctx.session.state.pub.days.every((x) => Number.isInteger(x))), "Tag gestempelt");
});

test("Bot-Modus mit drei Sitzen: zwei lokale Bots spielen bis zum Ende", async () => {
  const a = rtRuntime();
  a.dispatch({ type: "OPEN", id: "fx-zug" }); a.dispatch({ type: "MODE", mode: "bot" }); a.dispatch("GO");
  for (let k = 0; k < 200 && leaf(a) !== "inhalt.card.play.over"; k++) {
    if (leaf(a) === "inhalt.card.play.turn") a.dispatch({ type: "INPUT", input: { t: "say", seat: 0, a: "Ich" } });
    await new Promise((r) => setTimeout(r, 1));
  }
  assert.equal(leaf(a), "inhalt.card.play.over");
  assert.deepEqual(a.state.ctx.botSeats, [1, 2]);
});

test("Merkzettel je Partie (MEMO): bleibt auf dem Geraet, ueberlebt neue Staende, reist nie im Link", async () => {
  const storage = memStorage();
  const a = A.createRuntime({ lang: "de", entropy: counter("d"), storage, live: () => Promise.reject(new Error("x")), share: () => Promise.resolve("copied"), clearUrl() {}, schedule: (f) => setTimeout(f, 0), onChange() {} });
  a.dispatch({ type: "OPEN", id: "fx-zug" }); a.dispatch({ type: "MODE", mode: "link" }); a.dispatch("GO");
  await until(() => a.state.ctx.session);
  a.dispatch({ type: "MEMO", memo: { own: true } });
  assert.deepEqual(a.state.ctx.memo, { own: true });
  const g = a.state.ctx.gameId;
  assert.deepEqual(storage.loadGame(g).memo, { own: true });
  for (let k = 0; k < 5 && a.state.config.includes("inhalt.card.play.turn"); k++) a.dispatch({ type: "INPUT", input: { t: "say", seat: a.state.ctx.viewer, a: "x" } });
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(storage.loadGame(g).memo, { own: true }, "neuer Stand behaelt den Merkzettel");
  if (a.state.ctx.link) assert.ok(!Buffer.from(a.state.ctx.link.split(".")[2], "base64url").toString().includes("own"), "nicht im Link");
  a.dispatch({ type: "MEMO", memo: { big: "x".repeat(600) } });
  assert.deepEqual(a.state.ctx.memo, { own: true }, "zu gross wird abgelehnt");
});
