// Gruppen-Live mit 3 Sitzen (ADR 0001 f, Stufe 2): Handshake im Stern, Seed aus allen Nonces, Weiterleitung der Zuege
// durch den Gastgeber in fester Reihenfolge; jedes Geraet kennt nur das eigene Geheimnis.
import test from "node:test";
import assert from "node:assert/strict";
import * as H from "../src/contract/handshake.js";
import * as S from "../src/contract/session.js";
import fx from "./fixtures/cards/fx-zug/card.js";
import { counter } from "./helpers.js";

const P = { rounds: 1 };
function setup() {
  const e = counter("a"), r = H.helloGroup(fx, P, 0, [e(), e()]);
  const guests = {};
  for (const { to, msg } of r.msgs) { const ge = counter("b" + to); guests[to] = H.join(fx, msg, [ge(), ge()]); }
  let local = r.local, res;
  for (const g of [2, 1]) { res = H.joinGroup(fx, P, local, g, guests[g].msg); local = res.local; }
  assert.equal(res.done, true);
  const sessions = { 0: res.session };
  for (const g of [1, 2]) sessions[g] = H.begin(fx, guests[g].local, res.msg);
  return { sessions, start: res.msg, hello: r.msgs, guests };
}
const drain = (s) => { for (let d = S.dueReveal(fx, s); d; d = S.dueReveal(fx, s)) s = S.apply(fx, s, d); return s; };

test("Gruppe: alle drei Geraete rechnen denselben Seed und dieselben Commitments; nur das eigene Geheimnis ist bekannt", () => {
  const { sessions } = setup();
  assert.equal(sessions[0].seed, sessions[1].seed); assert.equal(sessions[1].seed, sessions[2].seed);
  assert.deepEqual(sessions[0].commits, sessions[2].commits);
  for (const q of [0, 1, 2]) for (const o of [0, 1, 2]) if (o !== q) assert.equal(sessions[q].state.priv[o], null, "Sitz " + q + " kennt " + o);
  assert.notEqual(sessions[1].state.priv[1], null);
});

test("Gruppe: Zuege laufen ueber den Gastgeber an alle; Pflichtzuege und freie Eingaben bleiben im Gleichschritt", () => {
  let { sessions: s } = setup();
  const send = (from, x) => { for (const q of [0, 1, 2]) s[q] = S.apply(fx, s[q], x); void from; };
  for (let k = 0; k < 20 && !S.status(fx, s[0]).over; k++) {
    const turn = S.status(fx, s[0]).turn;
    const due = S.dueReveal(fx, s[turn]);
    if (due) { send(turn, due); continue; }
    send(turn, { t: "say", seat: turn, a: "Hallo " + turn, d: 20769 });
  }
  assert.equal(S.status(fx, s[0]).over, true);
  assert.equal(S.pubHash(s[0]), S.pubHash(s[1])); assert.equal(S.pubHash(s[1]), S.pubHash(s[2]));
  void drain;
});

test("Gruppe: Betrug wird erkannt – falsches seedA, fehlende/veraenderte eigene Nonce, veraendertes eigenes Commitment, doppeltes join", () => {
  const { start, guests } = setup();
  assert.throws(() => H.begin(fx, guests[1].local, { ...start, s: "f".repeat(32) }), (e) => e.code === "betrug");
  assert.throws(() => H.begin(fx, guests[1].local, { ...start, j: start.j.map((x) => (x.q === 1 ? { ...x, n: "0".repeat(32) } : x)) }), (e) => e.code === "betrug");
  assert.throws(() => H.begin(fx, guests[1].local, { ...start, k: start.k.map((c, i) => (i === 1 ? "a".repeat(64) : c)) }), (e) => e.code === "betrug");
  const e = counter("c"), r = H.helloGroup(fx, P, 0, [e(), e()]);
  const j1 = H.join(fx, r.msgs[0].msg, [e(), e()]);
  const a = H.joinGroup(fx, P, r.local, 1, j1.msg);
  assert.throws(() => H.joinGroup(fx, P, a.local, 1, j1.msg), (x) => x.code === "abweichung");
  assert.throws(() => H.joinGroup(fx, P, r.local, 7, j1.msg), (x) => x.code === "eingabe");
});
