import test from "node:test";
import assert from "node:assert/strict";
import { createMachine } from "../src/app/statechart.js";
import { machine, initialContext } from "../src/app/machine.js";
import { actionsOf, view, leaf } from "../src/ui/view.js";
import { cardOf } from "../src/cards/index.js";
import { encode } from "../src/app/link.js";
import * as S from "../src/contract/session.js";
import * as H from "../src/contract/handshake.js";
import { counter } from "./helpers.js";

// ---------- Semantik der eigenen Statechart (SCXML-Teilmenge) ----------
test("hierarchisch + parallel: Startkonfiguration, entry-Reihenfolge, valid()", () => {
  const log = [];
  const a = (n) => (ctx) => { log.push(n); return ctx; };
  const m = createMachine({ type: "parallel", states: {
    x: { initial: "a", entry: ["ex"], states: { a: { entry: ["ea"], exit: ["xa"], on: { GO: "x.b" } }, b: { entry: ["eb"], on: { UP: "x" } } } },
    y: { initial: "c", states: { c: { on: { GO: { target: "y.d", cond: "ok" } } }, d: {} } }
  } }, { guards: { ok: (ctx) => ctx.ok }, actions: { ex: a("ex"), ea: a("ea"), xa: a("xa"), eb: a("eb") } });
  let s = m.initial({ ok: false });
  assert.deepEqual(s.config, ["x", "x.a", "y", "y.c"]);
  assert.deepEqual(log, ["ex", "ea"]);
  assert.equal(m.valid(s.config), null);
  s = m.send(s, "GO");
  assert.deepEqual(s.config, ["x", "x.b", "y", "y.c"], "Bedingung in y verhindert Wechsel");
  assert.deepEqual(log.slice(2), ["xa", "eb"]);
  s = m.send({ ...s, ctx: { ok: true } }, "UP");
  assert.deepEqual(s.config, ["x", "x.a", "y", "y.c"], "Ziel = Elternzustand -> Eintritt in initial");
  s = m.send(s, "GO");
  assert.deepEqual(s.config, ["x", "x.b", "y", "y.d"], "beide Regionen reagieren auf dasselbe Ereignis");
  assert.equal(m.send(s, "NIX").consumed, false);
});
test("raise: interne Ereignisse laufen im selben Makroschritt; Region spricht ueber Ereignis", () => {
  const m = createMachine({ type: "parallel", states: {
    a: { initial: "p", states: { p: { on: { GO: { target: "a.q", raise: "PING" } } }, q: {} } },
    b: { initial: "r", states: { r: { on: { PING: "b.s" } }, s: {} } }
  } });
  const s = m.send(m.initial({}), "GO");
  assert.deepEqual(s.config, ["a", "a.q", "b", "b.s"]);
});
test("Fehler im Diagramm werden beim Erzeugen gemeldet", () => {
  assert.throws(() => createMachine({ initial: "a", states: { a: { on: { X: "nix" } } } }), /Ziel nix/);
  assert.throws(() => createMachine({ initial: "a", states: { a: { on: { X: { target: "a", cond: "fehlt" } } } } }), /Bedingung/);
  assert.throws(() => createMachine({ states: { a: {} } }), /initial/);
});

// ---------- App-Diagramm: Pfad-Enumeration bis Tiefe 6 ----------
function demoLinks() {
  const ent = counter("e");
  const bluff = cardOf("bluff"), gruss = cardOf("gruss");
  const sec = S.makeSecrets(bluff, [0], ent);
  let s = S.newSession(bluff, { params: { cards: 3, bonus: 2, accent: "red" }, seed: ent(), mine: [0], ...sec });
  for (const m of bluff.moves(bluff.observe(s.state, 0), 0).slice(0, 1)) s = S.apply(bluff, s, m);
  for (let i = 0; i < 2; i++) s = S.apply(bluff, s, bluff.moves(bluff.observe(s.state, 0), 0)[0]);
  return {
    card: encode("card", { c: "gruss", v: gruss.manifest.version, p: { title: "Hallo", text: "Du", bg: "red", stickers: ["heart"] } }),
    challenge: encode("challenge", { ...S.toWire(s), g: "00000000000000aa", h: S.pubHash(s) }),
    live: encode("live", { t: "A".repeat(22) }),
    bad: "#v2.card.%%%"
  };
}
const LINKS = demoLinks();
const HELLO = (() => { const r = H.hello(cardOf("bluff"), { cards: 3, bonus: 2, accent: "red" }, 0, [counter("c")(), counter("d")()]); return r.msg; })();

function eventsFor(state) {
  const ctx = state.ctx, out = [
    { type: "OPEN", id: "gruss" }, { type: "OPEN", id: "bluff" }, { type: "BACK" }, { type: "GO" }, { type: "CUSTOMIZE" }, { type: "DONE" }, { type: "CLOSE" },
    { type: "MODE", mode: "alone" }, { type: "MODE", mode: "bot" }, { type: "MODE", mode: "link" }, { type: "MODE", mode: "live" }, { type: "SEAT", seat: 1 },
    { type: "SHARE" }, { type: "SENT" }, { type: "AGAIN" }, { type: "COVER_OK" }, { type: "ACCEPT" },
    { type: "LINK", hash: LINKS.card }, { type: "LINK", hash: LINKS.challenge }, { type: "LINK", hash: LINKS.live }, { type: "LINK", hash: LINKS.bad },
    { type: "LIVE_TOKEN", token: "B".repeat(22) }, { type: "LIVE_UP" }, { type: "LIVE_DOWN" }, { type: "LIVE_FAIL", reason: "gone" },
    { type: "HELLO", msg: HELLO }, { type: "PEER_IN", msg: { t: "in", i: 0, x: { t: "say", seat: 0, v: 6 }, h: "0".repeat(16) } },
    { type: "KONTO_IN" }, { type: "KONTO_OUT" }
  ];
  if (ctx.cardId) {
    const c = cardOf(ctx.cardId);
    for (const p of c.manifest.parts) out.push({ type: "BUBBLE", part: p.id });
    const part = c.manifest.parts.find((p) => p.id === ctx.part);
    if (part) { const k = part.params[0], prop = c.manifest.params.properties[k]; out.push({ type: "PARAM", key: k, value: prop.enum ? prop.enum[1] : prop.type === "integer" ? prop.minimum : prop.type === "array" ? [] : "Neu" }); }
    if (ctx.session) { const st = S.status(c, ctx.session); if (st.turn >= 0) { const mv = c.moves(c.observe(ctx.session.state, st.turn), st.turn); if (mv.length) out.push({ type: "INPUT", input: mv[0] }); } }
  }
  return out;
}
function sig(state) {
  const c = state.ctx;
  return state.config.join(",") + "|" + [c.cardId, c.mode, c.seat, c.part, c.viewer, c.sent, c.error, c.reason, c.incoming && c.incoming.kind, c.session && c.session.log.length, c.raum && !!c.raum.token, c.note, c.link ? 1 : 0, JSON.stringify(c.params)].join("|");
}

test("Pfad-Enumeration bis Tiefe 6: gueltige Konfiguration, Disclosure, keine toten Knoepfe, BACK fuehrt heim", () => {
  const rnd = counter("a");
  const start = machine.initial(initialContext("de"));
  let frontier = [start];
  const seen = new Map([[sig(start), 0]]);
  let edges = 0, depthReached = 0;
  const leaves = new Set();
  for (let depth = 1; depth <= 6; depth++) {
    const next = [];
    for (const st of frontier) {
      for (const ev of eventsFor(st)) {
        const r = machine.send(st, { ...ev, rand: [rnd(), rnd(), rnd(), rnd()] });
        edges++;
        if (!r.consumed) continue;
        const k = sig(r);
        if (seen.has(k)) continue;
        seen.set(k, depth); next.push(r); depthReached = depth;
      }
    }
    frontier = next;
  }
  for (const [, d] of seen) assert.ok(d <= 6);
  // Invarianten je erreichtem Zustand
  const states = [];
  (function collect() { const q = [start]; const done = new Set(); const rr = counter("b");
    // erneut ablaufen, um Zustandsobjekte zu haben (seen speichert nur Signaturen)
    while (q.length && states.length < 20000) { const s = q.shift(); const k = sig(s); if (done.has(k)) continue; done.add(k); states.push(s); if ((seen.get(k) || 0) >= 6) continue; for (const ev of eventsFor(s)) { const r = machine.send(s, { ...ev, rand: [rr(), rr(), rr(), rr()] }); if (r.consumed && seen.has(sig(r))) q.push(r); } }
  })();
  for (const s of states) {
    assert.equal(machine.valid(s.config), null, s.config.join());
    const L = leaf(s); leaves.add(L);
    // Review M2: wer auf dem Regal steht, hat keinen offenen Raum (keine haengende Einladung/Verbindung)
    if (L === "shelf") assert.ok(machine.matches(s, "raum.allein"), "Regal mit offenem Raum: " + s.config.join());
    const acts = actionsOf(s);
    assert.ok(acts.secondary.length <= 3, L + ": zu viele Nebenaktionen");
    for (const a of [acts.primary, ...acts.secondary].filter(Boolean)) assert.ok(machine.send(s, { ...a.ev, rand: ["1".repeat(32), "2".repeat(32), "3".repeat(32), "4".repeat(32)] }).consumed, L + ": toter Knopf " + a.id);
    // BACK: hoechstens 6 Schritte bis zum Regal
    let b = s;
    for (let i = 0; i < 6 && leaf(b) !== "shelf"; i++) { const r = machine.send(b, { type: "BACK", rand: [] }); if (!r.consumed) break; b = r; }
    assert.ok(leaf(b) === "shelf" || leaf(b).startsWith("card.play.hand") || leaf(b) === "card.play.wait", L + ": BACK kommt nicht heim (" + leaf(b) + ")");
    // Ansicht laesst sich aus jedem Zustand ableiten (reine Funktion)
    const v = view(s, () => {});
    const hasDialog = JSON.stringify(v, (k, x) => (k === "el" || k === "on" ? undefined : x)).includes('"role":"dialog"');
    assert.equal(hasDialog, machine.matches(s, "inhalt.card.customize.dialog"), L + ": Dialog sichtbar nur im Zustand dialog");
  }
  assert.equal(machine.send(start, { type: "BACK" }).consumed, false, "Regal verbraucht BACK nicht (Host darf App verlassen)");
  const must = ["shelf", "card.view", "card.customize.bubbles", "card.customize.dialog", "card.share", "card.lobby", "card.play.turn", "card.play.hand", "receive.show", "receive.reject", "receive.live", "receive.wait"];
  for (const m of must) assert.ok(leaves.has(m), "nicht erreicht: " + m);
  console.log("# enumeration: Tiefe " + depthReached + ", " + seen.size + " Zustaende, " + edges + " Kanten geprueft, Blattzustaende: " + [...leaves].sort().join(" "));
});

test("laengere Pfade (ueber Tiefe 6 hinaus): Weitergeben, Senden, Ende sind erreichbar und gueltig", () => {
  const rnd = counter("f"), R = () => [rnd(), rnd(), rnd(), rnd()];
  const go = (s, ev) => { const r = machine.send(s, { ...ev, rand: R() }); assert.ok(r.consumed, leaf(s) + " " + ev.type); assert.equal(machine.valid(r.config), null); return r; };
  const play = (s) => { const c = cardOf(s.ctx.cardId); for (let i = 0; i < 20 && machine.matches(s, "inhalt.card.play.turn"); i++) { const v = s.ctx.viewer; s = go(s, { type: "INPUT", input: c.moves(c.observe(s.ctx.session.state, v), v)[0] }); } return s; };
  let s = go(machine.initial(initialContext("en")), { type: "OPEN", id: "bluff" });
  s = go(go(s, { type: "MODE", mode: "alone" }), { type: "GO" });
  s = play(s); assert.equal(leaf(s), "card.play.cover");
  assert.equal(actionsOf(s).primary.id, "cover-ok");
  s = play(go(s, { type: "COVER_OK" })); assert.equal(leaf(s), "card.play.over", "Aufloesung laeuft automatisch, das Geraet haelt das Salz");
  assert.equal(s.ctx.session.log[s.ctx.session.log.length - 1].t, "reveal");
  let l = go(go(machine.initial(initialContext("de")), { type: "OPEN", id: "bluff" }), { type: "MODE", mode: "link" });
  l = play(go(l, { type: "GO" })); assert.equal(leaf(l), "card.play.send"); assert.ok(l.ctx.link.startsWith("#v2.challenge."));
  l = go(l, { type: "SENT" }); assert.equal(leaf(l), "card.play.wait");
});
