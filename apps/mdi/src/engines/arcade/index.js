// Arcade-Engine E4: Register der zehn Duelle, die Seite (Live, net:"split") und die Partie (zwei Seiten +
// Nachrichtenwarteschlangen in einem Zustand: allein, Bot, Vorschau, Tests). Port von alt:src/arcade.js:528-548 und
// dem Bot-Aufbau in alt:src/arcade-ui.js:548-565. Vertrag: ADR 0001 (b).
import { W, H, TICK, STEP, VOLATILE, hashSide, mineTurn } from "./core.js";
import { die, hashOf } from "./num.js";
import { ctlInit, mapInput } from "./controls.js";
import * as puck from "./puck.js";
import * as ziegel from "./ziegel.js";
import * as volley from "./volley.js";
import * as panzer from "./panzer.js";
import * as kick from "./kick.js";
import * as flipper from "./flipper.js";
import * as snow from "./snow.js";
import * as elfer from "./elfer.js";
import * as stock from "./stock.js";
import * as murmel from "./murmel.js";

export const GAMES = { puck, ziegel, volley, panzer, kick, flipper, snow, elfer, stock, murmel };
export const IDS = ["puck", "ziegel", "volley", "panzer", "kick", "flipper", "snow", "elfer", "stock", "murmel"];
export { W, H, TICK, STEP, mineTurn };
export function rulesOf(g) { return GAMES[g].rules; }

// ---------- eine Seite (ein Handy) ----------
/** o: { seed, serving, win } */
export function side(g, o) { if (!GAMES[g]) throw new RangeError("arcade: " + g); return GAMES[g].init(o); }
export function start(S) { GAMES[S.g].start(S); }
export function input(S, i) { GAMES[S.g].input(S, i); }
export function tick(S) { GAMES[S.g].tick(S); }
export function receive(S, m) { if (m && typeof m === "object") GAMES[S.g].receive(S, m); }
export { hashSide };
/** Wuerfel eines Bots: Zaehler im Bot-Zustand, Seed im Strom. */
function dice(B) { return () => die(B.seed, B.n++); }
export function botNew(g, seed) { const B = { seed: String(seed) + "|bot", n: 0 }; Object.assign(B, GAMES[g].botInit(dice(B))); return B; }
export function botStep(S, B, dt = STEP) { GAMES[S.g].bot(S, B, dice(B), dt); }

// ---------- die Partie ----------
function clone(o) {
  if (Array.isArray(o)) return o.map(clone);
  if (o && typeof o === "object") { const r = {}; for (const k of Object.keys(o)) r[k] = clone(o[k]); return r; }
  return o;
}
/**
 * Neue Partie. Sitz 0 ist der Einladende (schlaegt auf, eigenes Bild = gemeinsames Bild der Rundenspiele).
 * o: { g, seed, players:["human"|"bot", …], win, lag } – lag: Nachrichten kommen so viele Ticks spaeter an (Tests).
 */
export function matchInit(o) {
  const g = o.g, seed = String(o.seed), players = (o.players || ["human", "bot"]).map((p) => (p === "bot" || (p && p.kind === "bot") ? "bot" : "human"));
  const A = side(g, { seed, serving: true, win: o.win }), B = side(g, { seed, serving: false, win: o.win });
  const st = { g, seed, now: 0, lag: Number.isInteger(o.lag) && o.lag >= 0 && o.lag <= 120 ? o.lag : 0, sides: [A, B], q: [[], []], players, bots: [null, null], ctl: [ctlInit(), ctlInit()] };
  for (let s = 0; s < 2; s++) if (players[s] === "bot") st.bots[s] = botNew(g, seed + "|" + s);
  return st;
}
export function matchStart(st) { st = clone(st); start(st.sides[0]); start(st.sides[1]); return st; }
/**
 * Ein Tick der Partie (rein: der uebergebene Zustand bleibt unveraendert). inputs[seat] = Host-Eingabe {b,ax,ay,p}.
 * Reihenfolge wie alt pair() mit Bots (arcade.js:542-547, test/arcade.test.js play()): Bots und Eingaben, dann
 * Nachrichten zustellen, dann beide Seiten einen Schritt.
 */
export function matchStep(prev, inputs) {
  const st = clone(prev), [A, B] = st.sides;
  if (!A.started) { start(A); start(B); }
  for (let s = 0; s < 2; s++) {
    const S = st.sides[s];
    if (st.bots[s]) botStep(S, st.bots[s]);
    else mapInput(st.g, st.ctl[s], S, inputs && inputs[s], (gi) => input(S, gi));
  }
  st.now++;
  const ev = [];
  // Gesendetes kommt sofort in die Warteschlange der Gegenseite, wie alt send() -> qb.push: was Seite 0 beim Zustellen
  // sendet (etwa "fin"), erreicht Seite 1 noch im selben Tick, wenn lag 0 ist.
  const flush = (s) => { const S = st.sides[s]; for (const m of S.out) st.q[1 - s].push([st.now + st.lag, m]); for (const e of S.ev) ev.push(Object.assign({ seat: s }, e)); S.out = []; S.ev = []; };
  for (let s = 0; s < 2; s++) { const q = st.q[s], S = st.sides[s]; while (q.length && q[0][0] <= st.now) receive(S, q.shift()[1]); flush(s); }
  tick(A); flush(0); tick(B); flush(1);
  return { state: st, ev };
}
export function matchHash(st) {
  return hashOf({ g: st.g, now: st.now, sides: st.sides.map((S) => { const r = {}; for (const k of Object.keys(S)) if (!VOLATILE.has(k)) r[k] = S[k]; return r; }), q: st.q, bots: st.bots, ctl: st.ctl });
}
/** Stand aus Sicht eines Sitzes; Sitz 1 sieht die Punkte seiner eigenen Seite (gespiegelt gleich). */
export function matchStatus(st) {
  const [A, B] = st.sides, over = A.over && B.over, score = [A.score[0], A.score[1]];
  const winner = over ? (A.draw ? -1 : A.score[0] > A.score[1] ? 0 : 1) : null;
  return { over, score, winner, draw: over && !!A.draw, rejected: A.rejected + B.rejected };
}

// ---------- Seite fuer Live (net:"split") ----------
/** side.init({ seed, seat, serving, win }) */
export function liveInit(g, o) { const S = side(g, { seed: o.seed, serving: o.serving !== undefined ? o.serving : o.seat === 0, win: o.win }); return { S, ctl: ctlInit() }; }
/** side.step(st, { input, inbox, tick, wall? }) -> { st, out, ev }. inbox: Nachrichten der Gegenseite, die seit dem letzten Tick ankamen. */
export function liveStep(prev, { input: inp, inbox, wall }) {
  const st = clone(prev), S = st.S;
  if (!S.started) start(S);
  if (typeof wall === "number" && Number.isFinite(wall)) S.wall = wall;
  for (const m of Array.isArray(inbox) ? inbox : []) receive(S, m);
  mapInput(S.g, st.ctl, S, inp, (gi) => input(S, gi));
  tick(S);
  const out = S.out, ev = S.ev.map((e) => Object.assign({ seat: 0 }, e));
  S.out = []; S.ev = [];
  return { st, out, ev };
}
