// Echtzeit-Partie ueber den Vertrag (ADR 0001 b): init/step/status/view/bot/hash, kartenunabhaengig.
// Rollen je Sitz: "human" (Eingabe vom Geraet), "bot" (card.bot, Zufall aus dem Seed), "ghost" (Eingabespur),
// "remote" (Eingabe vom Partner, Lockstep), "none" (leere Eingabe). Rein bis auf die Uhr, die von aussen tickt.
import { rng as mkRng, stateHash, stateHashF } from "../../contract/sdk.js";
import * as T from "../../contract/trace.js";

export const ROLES = ["human", "bot", "ghost", "remote", "none"];
const EMPTY = Object.freeze({ b: 0 });

export class RtError extends Error { constructor(code, detail) { super(code + (detail ? ": " + detail : "")); this.code = code; } }

/** Hash des Zustands: card.hash bei f64, sonst kanonisch (Ganzzahl) bzw. Bit-Hex (f64 ohne eigenen Hash). */
/** Spur-Format des Altcodes (spur.js) fuer Karten mit hoechstens drei Knoepfen und ohne Achsen/Zeiger: bytegleich
 *  zu alten Golden-Spuren und etwa dreimal kompakter als das allgemeine Format. */
export function usesSpur(card) {
  const c = card.manifest.rt.controls;
  return (c.buttons || []).length <= 3 && !c.axes && !c.pointer;
}
function parseTrace(card, bytes) {
  const max = card.manifest.rt.ghost ? card.manifest.rt.ghost.bytes : 0;
  if (usesSpur(card)) { const r = T.parseSpur(bytes, max); if (!r) return null; const p = T.spurPlayer(bytes); return { end: r.end === null ? Infinity : r.end, at: (t) => ({ b: p.at(t) }) }; }
  return T.parse(bytes, max);
}
function makeRecorder(card) {
  const max = card.manifest.rt.ghost.bytes;
  if (!usesSpur(card)) return T.recorder(max);
  const r = T.spurRecorder(max);
  return { put: (t, x) => r.put(t, (x && x.b) || 0), end: (t) => r.end(t), bytes: () => r.bytes() };
}
export function hashOf(card, state) {
  if (typeof card.hash === "function") return String(card.hash(state));
  return card.manifest.rt.numeric === "f64" ? stateHashF(state) : stateHash(state);
}

/**
 * @param card
 * @param {object} o
 * @param {object} o.params
 * @param {string} o.seed
 * @param {string[]} o.roles       je Sitz eine Rolle
 * @param {number} [o.level]       Bot-Stufe 1..3
 * @param {Uint8Array} [o.ghost]   Eingabespur fuer den Sitz mit Rolle "ghost"
 * @param {number} [o.record]      Sitz, dessen Eingaben als Spur aufgenommen werden (oder -1)
 */
export function createMatch(card, o) {
  const m = card.manifest, rt = m.rt;
  if (m.mode !== "realtime" || !rt) throw new RtError("typ");
  const n = m.players.max;
  if (!Array.isArray(o.roles) || o.roles.length !== n || o.roles.some((r) => !ROLES.includes(r))) throw new RtError("rollen");
  if (o.roles.includes("bot") && typeof card.bot !== "function") throw new RtError("bot");
  const level = [1, 2, 3].includes(o.level) ? o.level : 2;
  let ghost = null;
  if (o.roles.includes("ghost")) { ghost = o.ghost instanceof Uint8Array ? parseTrace(card, o.ghost) : null; if (!ghost) throw new RtError("geist", "Spur ungueltig"); }
  const botRng = mkRng(o.seed + "|bot");
  let state = card.init({ params: o.params, seed: o.seed, players: o.roles.slice(), level, rng: mkRng(o.seed + "|init") });
  let prev = state, tick = 0, timeUp = false;
  const rec = Number.isInteger(o.record) && o.record >= 0 && rt.ghost ? makeRecorder(card) : null;
  const status = () => { const s = card.status(state); return timeUp && !s.over ? { ...s, over: true, timeUp: true } : s; };
  return {
    get state() { return state; }, get prev() { return prev; }, get tick() { return tick; },
    roles: o.roles.slice(), level, seed: o.seed, params: o.params,
    status,
    /** Ein Tick. given: Eingaben fuer human/remote-Sitze ({sitz: Input}). Liefert die Ereignisse. */
    step(given = {}) {
      if (status().over) return [];
      const inputs = [];
      for (let s = 0; s < n; s++) {
        const r = o.roles[s];
        if (r === "bot") inputs.push(card.bot(state, s, { level, rng: botRng }) || EMPTY);
        else if (r === "ghost") inputs.push(tick <= ghost.end ? ghost.at(tick) : EMPTY);
        else if (r === "none") inputs.push(EMPTY);
        else { const x = given[s]; if (!x) throw new RtError("eingabe-fehlt", "Sitz " + s + " Tick " + tick); inputs.push(x); }
      }
      if (rec) rec.put(tick, inputs[o.record]);
      const r = card.step(state, inputs, tick);
      if (!r || typeof r !== "object" || !("state" in r)) throw new RtError("vertrag", "step liefert {state, ev}");
      prev = state; state = r.state; tick++;
      if (tick >= rt.maxTicks) timeUp = true;
      if (rec && status().over) rec.end(tick);
      return Array.isArray(r.ev) ? r.ev : [];
    },
    hash() { return hashOf(card, state); },
    view(ctx = {}) { return card.view(state, { ...ctx, prev, alpha: ctx.alpha || 0 }); },
    /** Geist-Link-Daten nach dem Ende (Spur des aufgenommenen Sitzes). */
    ghostWire() {
      if (!rec) throw new RtError("geist", "keine Aufnahme");
      rec.end(tick);
      // rl: Rollen der Aufnahme (der aufgenommene Sitz als "ghost"), damit die Pruefung genau so nachspielt
      const rl = o.roles.map((r, s) => (s === o.record ? "ghost" : r === "bot" ? "bot" : "none"));
      return { c: m.id, v: m.version, p: o.params, s: o.seed, tr: T.toB64url(rec.bytes()), n: tick, sc: status().score.slice(0, 10), h: hashOf(card, state).slice(0, 16), q: o.record, lv: level, rl };
    }
  };
}

/**
 * Prueft einen Geist-Link: spielt die Aufnahme mit denselben Rollen nach (aufgenommener Sitz = Spur, andere Sitze wie
 * bei der Aufnahme: Bot mit gleicher Stufe) und vergleicht Endhash und Stand. Ehrlich ablehnen, nie raten.
 */
export function verifyGhost(card, w) {
  const n = card.manifest.players.max, q = Number.isInteger(w.q) ? w.q : 0;
  const bytes = T.fromB64url(w.tr);
  if (!bytes) return { ok: false, reason: "geist" };
  let roles;
  if (Array.isArray(w.rl)) { if (w.rl.length !== n || w.rl[q] !== "ghost" || w.rl.some((r, s) => s !== q && !["bot", "none"].includes(r))) return { ok: false, reason: "geist" }; roles = w.rl.slice(); }
  else { roles = []; for (let s = 0; s < n; s++) roles.push(s === q ? "ghost" : typeof card.bot === "function" ? "bot" : "none"); }
  let mt;
  try { mt = createMatch(card, { params: w.p, seed: w.s, roles, level: w.lv, ghost: bytes }); } catch (e) { return { ok: false, reason: e.code || "geist" }; }
  for (let i = 0; i < w.n && !mt.status().over; i++) mt.step();
  if (mt.tick !== w.n) return { ok: false, reason: "abweichung", detail: "Ticks" };
  if (mt.hash().slice(0, 16) !== w.h) return { ok: false, reason: "abweichung", detail: "Hash" };
  const sc = mt.status().score;
  if (w.sc.some((v, i) => sc[i] !== v)) return { ok: false, reason: "abweichung", detail: "Stand" };
  return { ok: true, bytes, ticks: w.n, score: sc, seat: q };
}
