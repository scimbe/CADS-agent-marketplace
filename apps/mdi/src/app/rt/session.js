// Echtzeit-Sitzung im Host (ADR 0001 b): verbindet Partie (match.js) oder geteilte Seite (net.js), feste Tick-Schleife
// (loop.js), Eingabe-Abtastung (input.js), Countdown, Pause/Weiter, Live-Nachrichten und Ereignisse fuer Klang.
// Kein DOM: Zeichnen, Uhr, Bildtakt, Senden und Klang kommen als Abhaengigkeiten. Meldet nur Uebergaenge an die
// Statechart (onChange), die Bildschleife liegt nie im Zustand.
import { createMatch } from "./match.js";
import { createLockstep, createSplit } from "./net.js";
import { createLoop } from "./loop.js";
import { createSampler } from "./input.js";

export const COUNTDOWN_MS = 3000, PEER_LOST_MS = 15000;

/**
 * @param card
 * @param {object} o  { mode: "alone"|"bot"|"live"|"ghost", seat, params, seed, level, ghost?: Uint8Array, serving?, lang, reduced }
 * @param {object} d  { now(), frame(f), cancel?(h), send?(msg), draw(node, info), onEvents?(ev[]), onChange(info) }
 */
export function createRtSession(card, o, d) {
  const m = card.manifest, rt = m.rt, n = m.players.max, seat = o.seat || 0, other = n > 1 ? (seat === 0 ? 1 : 0) : -1;
  const net = o.mode === "live" ? rt.net : "none";
  const sampler = createSampler(rt.controls, rt.view);
  let match = null, split = null, lock = null;
  const roles = [];
  for (let s = 0; s < n; s++) roles.push(s === seat ? "human" : o.mode === "bot" ? "bot" : o.mode === "ghost" ? "ghost" : o.mode === "live" ? "remote" : "none");
  if (net === "split") split = createSplit(card, { seat, params: o.params, seed: o.seed, serving: o.serving, send: d.send, now: d.now });
  else {
    match = createMatch(card, { params: o.params, seed: o.seed, roles, level: o.level, ghost: o.ghost, record: o.mode === "alone" || o.mode === "bot" ? seat : -1 });
    if (net === "lockstep") lock = createLockstep({ seat, other, delay: rt.delay === undefined ? Math.round(rt.tick / 20) : rt.delay, tick: rt.tick, send: d.send, onDesync: (info) => finish({ type: "desync", info }) });
  }
  let goAt = null, phase = "ready", peerPaused = false, selfPaused = false, stallSince = null, frameT = null, ended = false;
  const status = () => (split ? split.status() : match.status());
  function finish(info) {
    if (ended) return; ended = true; phase = "over"; loop.stop();
    if (lock) lock.flush();
    d.onChange({ ...info, status: status() });
  }
  function onTick() {
    if (phase !== "run") return true;
    if (split) {
      const ev = split.step(sampler.sample());
      if (ev.length && d.onEvents) d.onEvents(ev);
    } else {
      const t = match.tick;
      if (lock) {
        if (!lock.ready(t)) {
          if (stallSince === null) { stallSince = d.now(); d.onChange({ type: "stall" }); }
          else if (d.now() - stallSince > PEER_LOST_MS) finish({ type: "peer-lost" });
          return false;
        }
        if (stallSince !== null) { stallSince = null; d.onChange({ type: "flow" }); }
      }
      const mine = sampler.sample();
      let given;
      if (lock) { lock.local(t, mine); given = lock.inputs(t); }
      else given = { [seat]: mine };
      const ev = match.step(given);
      if (lock) lock.after(t, match.hash());
      if (ev.length && d.onEvents) d.onEvents(ev);
    }
    if (status().over) finish({ type: "over" });
    return true;
  }
  function onFrame(alpha) {
    const t = d.now(), dtFrame = frameT === null ? 0 : Math.min(0.1, (t - frameT) / 1000); frameT = t;
    if (phase === "ready" && goAt !== null && t >= goAt) { phase = "run"; d.onChange({ type: "go" }); }
    const ctx = { seat, alpha, reduced: !!o.reduced, lang: o.lang || "de", t: t / 1000, paused: loop.paused, countdown: phase === "ready" && goAt !== null ? Math.max(1, Math.ceil((goAt - t) / 1000)) : 0 };
    const node = split ? split.view({ ...ctx, tracked: split.tracked(dtFrame) }) : match.view(ctx);
    d.draw(node, { alpha, countdown: ctx.countdown, paused: loop.paused, stalled: loop.stalled, status: status() });
  }
  const loop = createLoop({ tick: rt.tick, now: d.now, frame: d.frame, cancel: d.cancel, onTick, onFrame });
  function pause(by) {
    if (by === "peer") peerPaused = true; else selfPaused = true;
    if (!loop.paused) { loop.pause(); sampler.reset(); if (by !== "peer" && net !== "none" && d.send) d.send({ t: "pause" }); d.onChange({ type: "pause", by }); }
  }
  function resume(by) {
    if (by === "peer") peerPaused = false; else selfPaused = false;
    if (loop.paused && !peerPaused && !selfPaused) { loop.resume(); d.onChange({ type: "resume" }); }
    if (by !== "peer" && net !== "none" && d.send) d.send({ t: "resume" });
  }
  return {
    start() { goAt = d.now() + COUNTDOWN_MS; loop.start(); },
    stop() { ended = true; loop.stop(); sampler.reset(); },
    pause: () => pause("self"),
    resume: () => resume("self"),
    /** Live-Nachricht vom Partner (schon gegen live.schema geprueft) */
    receive(msg) {
      if (msg.t === "pause") { pause("peer"); return true; }
      if (msg.t === "resume") { resume("peer"); return true; }
      if (lock && lock.receive(msg)) return true;
      if (split && split.receive(msg)) return true;
      return false;
    },
    key: (code, down) => sampler.key(code, down),
    pointer: (type, id, x, y) => sampler.pointer(type, id, x, y),
    button: (id, down) => sampler.button(id, down),
    blur() { sampler.reset(); },
    get phase() { return phase; },
    get paused() { return loop.paused; },
    get tick() { return split ? split.tick : match.tick; },
    status,
    hash: () => (split ? split.hash() : match.hash()),
    ghostWire: () => (match ? match.ghostWire() : null),
    screenButtons: () => sampler.screenButtons(),
    controls: rt.controls,
    view: rt.view,
    /** nur fuer Tests: n Ticks ohne Uhr rechnen */
    _tick: onTick, _frame: onFrame, _go() { goAt = d.now(); phase = "run"; }
  };
}
