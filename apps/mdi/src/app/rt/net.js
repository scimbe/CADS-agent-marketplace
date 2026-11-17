// Live fuer Echtzeitkarten ueber den vorhandenen Broker (ADR 0001 b). Zwei Netzarten:
//  lockstep: beide Geraete rechnen die ganze Partie; jede Seite schickt ihre Eingaben mit Verzoegerung `delay` Ticks
//            ({t:"rt", i, x:[…]}, gebuendelt alle 2 Ticks). Fehlt die Partnereingabe, haelt die Simulation an (keine
//            Vorhersage im Zustand). Alle `tick` Ticks ein Hash ({t:"rh", i, h}); Abweichung wird offen gemeldet.
//  split:    jede Seite rechnet nur card.side (Altcode arcade.js: wer die Haelfte mit dem Ball hat, entscheidet);
//            out-Nachrichten gehen als {t:"rs", i, ms, m:[…]}; Ankuenfte kommen im naechsten lokalen Tick als inbox.
//            Glaettung fremder Positionen ueber rt.smooth (nur Anzeige).
import { createTrack } from "./smooth.js";
import { hashOf } from "./match.js";

const EMPTY = Object.freeze({ b: 0 });
export const BATCH = 2;

/**
 * @param {object} o  { seat, other, delay, tick, send(msg), onDesync(info) }
 */
// Fenster fuer Partner-Eingaben und -Hashes (Review M6): nur Ticks nahe der eigenen Simulation werden angenommen
export const WINDOW = 600;
export function createLockstep(o) {
  const delay = Math.max(0, o.delay | 0), mine = new Map(), theirs = new Map(), hashes = new Map();
  // Review H2: bei kleiner Verzoegerung sofort senden, sonst warten beide auf den halben Stapel des anderen
  const batch = Math.max(1, Math.min(BATCH, delay));
  let pending = [], pendingFrom = null, desynced = false, peerHash = new Map(), now = 0, dropped = 0;
  function flush() { if (pending.length) { o.send({ t: "rt", i: pendingFrom, x: pending }); pending = []; pendingFrom = null; } }
  const inWindow = (i) => i >= now - 4 * delay - 8 && i <= now + WINDOW;
  return {
    /** Eigene Eingabe, abgetastet beim lokalen Tick n, gilt bei n + delay. */
    local(n, input) {
      const at = n + delay; mine.set(at, input);
      if (pendingFrom === null) pendingFrom = at;
      pending.push(input);
      if (pending.length >= batch) flush();
    },
    flush,
    receive(msg) {
      if (msg.t === "rt") { msg.x.forEach((x, k) => { if (inWindow(msg.i + k)) theirs.set(msg.i + k, x); else dropped++; }); return true; }
      if (msg.t === "rh") { if (inWindow(msg.i)) { peerHash.set(msg.i, msg.h); check(msg.i); } else dropped++; return true; }
      return false;
    },
    get dropped() { return dropped; },
    get sizes() { return { theirs: theirs.size, peerHash: peerHash.size, hashes: hashes.size }; },
    ready(n) { return n < delay || theirs.has(n); },
    inputs(n) {
      now = n;
      const g = {};
      g[o.seat] = n < delay ? EMPTY : mine.get(n) || EMPTY;
      g[o.other] = n < delay ? EMPTY : theirs.get(n);
      mine.delete(n - 4 * delay - 8); theirs.delete(n - 4 * delay - 8);
      return g;
    },
    /** nach Tick n: Hash nur im Pruefintervall berechnen (Review M2), merken und senden; alte Eintraege raeumen (M6) */
    after(n, hashFn) {
      if ((n + 1) % o.tick !== 0) return;
      const hash = typeof hashFn === "function" ? hashFn() : hashFn;
      hashes.set(n, hash); o.send({ t: "rh", i: n, h: hash }); check(n);
      for (const k of [...hashes.keys()]) if (k < n - 10 * o.tick) hashes.delete(k);
      for (const k of [...peerHash.keys()]) if (k < n - 10 * o.tick) peerHash.delete(k);
    },
    get desynced() { return desynced; }
  };
  function check(i) {
    if (desynced || !hashes.has(i) || !peerHash.has(i)) return;
    if (hashes.get(i) !== peerHash.get(i)) { desynced = true; o.onDesync({ tick: i, mine: hashes.get(i), theirs: peerHash.get(i) }); }
    peerHash.delete(i);
  }
}

/**
 * Geteilte Seiten (net "split").
 * @param card
 * @param {object} o { seat, params, seed, serving, send(msg), now(): ms }
 */
export function createSplit(card, o) {
  if (!card.side) throw new Error("net split braucht card.side");
  const rt = card.manifest.rt, inbox = [], tracks = {};
  for (const sm of rt.smooth || []) tracks[sm.msg] = { spec: sm, track: createTrack(sm.fields.length, { vmax: sm.vmax, lo: sm.lo || null, hi: sm.hi || null }) };
  let st = card.side.init({ params: o.params, seed: o.seed, seat: o.seat, serving: o.serving === true }), prev = st, tick = 0;
  return {
    get state() { return st; }, get prev() { return prev; }, get tick() { return tick; },
    step(input) {
      const got = inbox.splice(0);
      const r = card.side.step(st, { input, inbox: got, tick });
      prev = st; st = r.st; tick++;
      if (r.out && r.out.length) o.send({ t: "rs", i: tick - 1, ms: Math.round(o.now()), m: r.out });
      return Array.isArray(r.ev) ? r.ev : [];
    },
    receive(msg) {
      if (msg.t !== "rs") return false;
      for (const m of msg.m) {
        inbox.push(m);
        const tr = tracks[m.t];
        if (tr && Number.isInteger(msg.ms)) tr.track.push(o.now() / 1000, msg.ms / 1000, tr.spec.fields.map((f) => Number(m[f]) || 0));
      }
      return true;
    },
    tracked(dtFrame) { const out = {}; for (const [k, v] of Object.entries(tracks)) { const s = v.track.sample(o.now() / 1000, dtFrame); if (s) out[k] = s; } return out; },
    status() { return card.side.status(st); },
    hash() { return hashOf(card, st); },
    view(ctx) { return card.side.view(st, { ...ctx, prev }); }
  };
}
