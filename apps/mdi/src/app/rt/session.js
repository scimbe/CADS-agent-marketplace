// Echtzeit-Sitzung im Host (ADR 0001 b): verbindet Partie (match.js) oder geteilte Seite (net.js), feste Tick-Schleife
// (loop.js), Eingabe-Abtastung (input.js), Countdown, Pause/Weiter, Live-Nachrichten und Ereignisse fuer Klang.
// Kein DOM: Zeichnen, Uhr, Bildtakt, Senden und Klang kommen als Abhaengigkeiten. Meldet nur Uebergaenge an die
// Statechart (onChange), die Bildschleife liegt nie im Zustand.
import { createMatch } from "./match.js";
import { createLockstep, createSplit } from "./net.js";
import { createLoop } from "./loop.js";
import { createSampler } from "./input.js";

export const COUNTDOWN_MS = 3000, PEER_LOST_MS = 15000, PEER_PAUSE_MS = 60000;

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
  let sampled = -1;
  let goAt = null, phase = "ready", peerPaused = false, peerPausedAt = null, selfPaused = false, stallSince = null, frameT = null, ended = false;
  const status = () => (split ? split.status() : match.status());
  function finish(info) {
    if (ended) return; ended = true; phase = info.type === "over" ? "over" : "error"; loop.stop();
    if (lock) { try { lock.flush(); } catch (e) { /* Kanal zu */ } }
    let st = null; try { st = status(); } catch (e) { st = null; }
    d.onChange({ ...info, status: st });
  }
  // Review H3: ein Fehler der Karte (step/view) friert nie still ein, sondern beendet ehrlich mit "error"
  function guard(f) { return (...a) => { if (ended) return false; try { return f(...a); } catch (e) { finish({ type: "error", reason: "karte-fehler", detail: String(e && e.message || e).slice(0, 200) }); return false; } }; }
  function onTick() {
    if (phase !== "run") return true;
    if (split) {
      const ev = split.step(sampler.sample());
      if (ev.length && d.onEvents) d.onEvents(ev);
    } else {
      const t = match.tick;
      if (lock) {
        // eigene Eingabe fuer diesen Tick genau einmal abtasten und senden, BEVOR auf den Partner gewartet wird –
        // sonst warten bei kleiner Verzoegerung beide aufeinander (Review H2)
        if (sampled < t) { lock.local(t, sampler.sample()); sampled = t; }
        if (!lock.ready(t)) {
          lock.flush(); // Review H2: eigene Eingaben nie im halben Stapel liegen lassen, waehrend wir warten
          if (stallSince === null) { stallSince = d.now(); d.onChange({ type: "stall" }); }
          else if (d.now() - stallSince > PEER_LOST_MS) finish({ type: "peer-lost" });
          return false;
        }
        if (stallSince !== null) { stallSince = null; d.onChange({ type: "flow" }); }
      }
      let given;
      if (lock) given = lock.inputs(t);
      else given = { [seat]: sampler.sample() };
      const ev = match.step(given);
      if (lock) lock.after(t, () => match.hash());
      if (ev.length && d.onEvents) d.onEvents(ev);
    }
    if (status().over) finish({ type: "over" });
    return true;
  }
  function onFrame(alpha) {
    const t = d.now(), dtFrame = frameT === null ? 0 : Math.min(0.1, (t - frameT) / 1000); frameT = t;
    // Review M5: pausiert der Partner zu lange, endet die Partie ehrlich
    if (peerPaused && peerPausedAt !== null && t - peerPausedAt > PEER_PAUSE_MS) { finish({ type: "peer-lost", reason: "pause" }); return; }
    if (phase === "ready" && goAt !== null && t >= goAt) { phase = "run"; d.onChange({ type: "go" }); }
    // local.params: die ungefilterten Parameter dieses Geraets, nur fuer die Anzeige (eigenes Foto); gespielt wird mit o.params
    const ctx = { seat, alpha, local: { params: o.localParams || o.params }, reduced: !!o.reduced, lang: o.lang || "de", t: t / 1000, paused: loop.paused, countdown: phase === "ready" && goAt !== null ? Math.max(1, Math.ceil((goAt - t) / 1000)) : 0 };
    let node = split ? split.view({ ...ctx, tracked: split.tracked(dtFrame) }) : match.view(ctx);
    // Review M7: Echtzeit zeichnet immer in rt.view (dieselbe Flaeche wie die Zeigerumrechnung)
    if (node && node.t === "canvas" && (node.w !== rt.view.w || node.h !== rt.view.h || (node.fit || "contain") !== (rt.view.fit || "contain"))) node = { ...node, w: rt.view.w, h: rt.view.h, fit: rt.view.fit || "contain" };
    d.draw(node, { alpha, countdown: ctx.countdown, paused: loop.paused, stalled: loop.stalled, status: status() });
  }
  const loop = createLoop({ tick: rt.tick, now: d.now, frame: d.frame, cancel: d.cancel, onTick: guard(onTick), onFrame: guard(onFrame) });
  function pause(by) {
    if (by === "peer") { peerPaused = true; if (peerPausedAt === null) peerPausedAt = d.now(); } else selfPaused = true;
    if (!loop.paused) { loop.pause(); sampler.reset(); if (by !== "peer" && net !== "none" && d.send) d.send({ t: "pause" }); d.onChange({ type: "pause", by }); }
  }
  function resume(by) {
    if (by === "peer") { peerPaused = false; peerPausedAt = null; } else selfPaused = false;
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
    tap: (down) => sampler.tap(down),
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
    _tick: guard(onTick), _frame: guard(onFrame), _go() { goAt = d.now(); phase = "run"; }
  };
}
