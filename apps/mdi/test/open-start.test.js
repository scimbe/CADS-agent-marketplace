// OPEN {id, variant?, mode?, start?} als ein Ereignis (Board Bote1, H "Jetzt spielen | Erst ueben"):
// start fuehrt atomar ins Spiel, fremder Modus bleibt ehrlich in card.view, Teile werden vorher geladen,
// Umschalter im Spielkopf nur bis zum ersten Zug und nicht live.
import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "../src/app/runtime.js";
import { createFeatParts } from "../src/app/fparts-lazy.js";
import { modesOf, cardOf } from "../src/cards/index.js";
import * as G from "../src/app/game.js";
import { counter, memStorage, testRuntime } from "./helpers.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

test("OPEN start:true mit gueltigem Modus fuehrt in einem Ereignis ins Spiel", () => {
  const rt = testRuntime();
  assert.ok(modesOf(cardOf("bluff")).includes("bot"));
  rt.dispatch({ type: "OPEN", id: "bluff", mode: "bot", start: true }); rt.flush();
  assert.ok(rt.matches("inhalt.card.play"), JSON.stringify(rt.state.value));
  assert.equal(rt.state.ctx.mode, "bot");
});

test("OPEN start:true ohne mode nimmt playOf(...).default; ohne start nur card.view", () => {
  const a = testRuntime(); a.dispatch({ type: "OPEN", id: "bluff", start: true }); a.flush();
  assert.ok(a.matches("inhalt.card.play") || a.matches("inhalt.card.lobby") || a.matches("inhalt.card.share"), JSON.stringify(a.state.value));
  const b = testRuntime(); b.dispatch({ type: "OPEN", id: "bluff", mode: "bot" });
  assert.ok(b.matches("inhalt.card.view")); assert.equal(b.state.ctx.mode, "bot");
});

test("OPEN mit einem Modus, den die Karte nicht hat: bleibt in card.view, Hinweis, keine Ersatzwahl, kein Start", () => {
  const rt = testRuntime();
  assert.ok(!modesOf(cardOf("gruss")).includes("bot"));
  rt.dispatch({ type: "OPEN", id: "gruss", mode: "bot", start: true }); rt.flush();
  assert.ok(rt.matches("inhalt.card.view"));
  assert.equal(rt.state.ctx.note, "modus-fehlt");
});

test("OPEN start mit verzoegert ladendem Teil (fuer GO): wartet, startet danach, geht nicht verloren", async () => {
  const FPR = createFeatParts({ "x-ui": { file: "parts/feat-x-ui.000000000000.js", sri: "x" } });
  const gates = [];
  const rt = createRuntime({ lang: "de", entropy: counter("a"), storage: memStorage(), schedule: (f) => f(), onChange: () => {}, clearUrl: () => {},
    needFeatures: [{ id: "fx", needParts: (ev) => (ev.type === "GO" ? ["x-ui"] : []) }], featParts: FPR,
    loadFeat: (n) => new Promise((ok) => gates.push(() => ok({ name: n, mod: {} }))) });
  rt.dispatch({ type: "OPEN", id: "bluff", mode: "bot", start: true });
  assert.ok(rt.matches("inhalt.shelf"), "wartet auf den Teil");
  await tick(); while (gates.length) gates.shift()(); await tick(); await tick();
  assert.ok(rt.matches("inhalt.card.play"), JSON.stringify(rt.state.value));
});

test("MODE im Spielkopf: vor dem ersten Zug Neustart in der neuen Spielweise; danach gesperrt mit Grund; live nie", () => {
  const rt = testRuntime();
  rt.dispatch({ type: "OPEN", id: "bluff", mode: "bot", start: true }); rt.flush();
  assert.equal(G.movesMade(rt.state.ctx), 0);
  rt.dispatch({ type: "MODE", mode: "alone" }); rt.flush();
  assert.ok(rt.matches("inhalt.card.play")); assert.equal(rt.state.ctx.mode, "alone");
  // einen Zug machen, dann ist die Spielweise fest
  const ctx = { ...rt.state.ctx, session: { ...rt.state.ctx.session, log: [{ seat: 0, a: 1 }] } };
  assert.equal(G.movesMade(ctx), 1);
  assert.equal(G.movesMade({ session: { log: [{ t: "reveal", seat: 0 }] } }), 0, "Aufdecken ist kein Zug");
});

test("MODE nach dem ersten Zug oder live: bleibt im Spiel, Hinweis modus-gesperrt", async () => {
  const { machine } = await import("../src/app/machine.js");
  const rt = testRuntime();
  rt.dispatch({ type: "OPEN", id: "bluff", mode: "bot", start: true }); rt.flush();
  const s = rt.state, moved = { ...s, ctx: { ...s.ctx, session: { ...s.ctx.session, log: [{ seat: 0, a: 1 }] } } };
  const r = machine.send(moved, { type: "MODE", mode: "alone", rand: [], at: 0 });
  assert.ok(machine.matches(r, "inhalt.card.play")); assert.equal(r.ctx.mode, "bot"); assert.equal(r.ctx.note, "modus-gesperrt");
  const live = machine.send({ ...s, ctx: { ...s.ctx, mode: "live" } }, { type: "MODE", mode: "alone", rand: [], at: 0 });
  assert.equal(live.ctx.note, "modus-gesperrt");
});
