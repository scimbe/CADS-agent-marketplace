// Partie = Karte + Parameter + Seed + Commitments + Eingabe-Log. Kartenunabhaengig: dieselbe Logik fuer
// Allein, Bot, Link und Live. Verdeckte Information per Commit-Reveal (KONZEPT §3.1):
//   salt (128 Bit, nur auf dem Geraet des Sitzes) -> commit = SHA-256("mdi-commit|" + salt) ist oeffentlich
//   priv[sitz] = card.deal(rng(SHA-256(salt + "|" + seed)))      – nur wer das Salz kennt, kennt die Karten
//   Aufloesung: Eingabe {t:"reveal", seat, salt}; alle pruefen commit und rechnen nach.
// Ein Geraet haelt priv[s] nur fuer Sitze, deren Salz es kennt; fremde Teile sind null.
import { rng, sha256, canon, stateHash, utf8 } from "./sdk.js";

export const COMMIT_PREFIX = "mdi-commit|";
export function commitOf(salt) { return sha256(COMMIT_PREFIX + salt); }
const HEX32 = /^[0-9a-f]{32}$/, HEX64 = /^[0-9a-f]{64}$/;

export class GameError extends Error {
  constructor(code, detail) { super(code + (detail ? ": " + detail : "")); this.code = code; }
}

export function secretSeats(card) { return card.manifest.hidden === "commit-reveal" ? (card.manifest.secretSeats || []) : []; }
export function playerCount(card) { return card.manifest.players.max; }
/** Groesste kanonische Laenge einer Eingabe (ADR 0001 f): die Huelle prueft das Schema, die Karte den Rest. */
export const MAX_INPUT_BYTES = 2048;

/** Salze und Commitments fuer die Sitze dieses Geraets. entropy() liefert 32 Hex-Zeichen. */
export function makeSecrets(card, mine, entropy) {
  const secrets = {}, commits = new Array(playerCount(card)).fill(null);
  for (const seat of secretSeats(card)) if (mine.includes(seat)) { const s = entropy(); if (!HEX32.test(s)) throw new GameError("entropie"); secrets[seat] = s; commits[seat] = commitOf(s); }
  return { secrets, commits };
}

function dealFor(card, session, seat, salt, pub0) {
  return card.deal({ rng: rng(sha256(salt + "|" + session.seed)), seat, pub: pub0, params: session.params });
}
function initial(card, session) {
  const st = card.init({ rng: rng(session.seed + "|init"), params: session.params, players: session.players });
  const pub0 = st.pub;
  for (const k of Object.keys(session.secrets)) { const seat = Number(k); st.priv[seat] = dealFor(card, session, seat, session.secrets[k], pub0); }
  return st;
}

/**
 * Neue Partie. commits enthaelt alle bekannten Commitments (eigene aus makeSecrets, fremde aus Link/Peer).
 * @returns Partie-Objekt (unveraenderlich verwendet)
 */
export function newSession(card, { params, seed, mine, secrets = {}, commits }) {
  const m = card.manifest, players = playerCount(card);
  if (typeof seed !== "string" || !seed.length) throw new GameError("seed");
  const c = (commits || new Array(players).fill(null)).slice();
  for (const seat of secretSeats(card)) if (c[seat] !== null && !HEX64.test(c[seat])) throw new GameError("commit");
  for (const k of Object.keys(secrets)) if (c[k] !== commitOf(secrets[k])) throw new GameError("commit", "eigenes Salz passt nicht");
  const s = { card: m.id, version: m.version, params, seed, players, commits: c, log: [], secrets: { ...secrets }, mine: mine.slice() };
  s.state = initial(card, s);
  return s;
}

function sameInput(a, b) { return canon(a) === canon(b); }

/** Eine Eingabe anwenden. Wirft GameError bei ungueltigen Zuegen (nie stilles Raten, A4). */
export function apply(card, session, input) {
  if (!input || typeof input !== "object" || typeof input.t !== "string" || !Number.isInteger(input.seat)) throw new GameError("eingabe");
  // UTF-8-Byte zaehlen, nicht UTF-16-Einheiten (Review L10)
  let size; try { size = utf8(canon(input)).length; } catch (e) { throw new GameError("eingabe", "nicht kanonisch"); }
  if (size > MAX_INPUT_BYTES) throw new GameError("eingabe", "zu gross");
  const st = session.state, status = card.status(st);
  if (status.over) throw new GameError("vorbei");
  if (input.seat !== status.turn) throw new GameError("nicht-am-zug", "Sitz " + input.seat);
  let next, logged;
  if (input.t === "reveal") {
    const seat = input.seat, salt = input.salt !== undefined ? input.salt : session.secrets[seat];
    if (!status.reveal) throw new GameError("eingabe", "keine Aufloesung faellig");
    if (typeof salt !== "string" || !HEX32.test(salt)) throw new GameError("aufloesung", "Salz fehlt");
    if (commitOf(salt) !== session.commits[seat]) throw new GameError("betrug", "Salz passt nicht zum Commitment");
    const pub0 = card.init({ rng: rng(session.seed + "|init"), params: session.params, players: session.players }).pub;
    const priv = st.priv.slice(); priv[seat] = dealFor(card, session, seat, salt, pub0);
    try { next = card.step({ pub: st.pub, priv }, { t: "reveal", seat }, rng(session.seed + "|step|" + session.log.length)); }
    catch (e) { throw new GameError("zug-ungueltig", e.message); }
    logged = { t: "reveal", seat, salt };
  } else {
    const known = st.priv[input.seat] !== null || !secretSeats(card).includes(input.seat);
    if (known) {
      // accepts (ADR 0001 f) ersetzt die Aufzaehlung fuer nicht aufzaehlbare Eingaben; step prueft trotzdem selbst
      const obs = card.observe(st, input.seat);
      const ok = typeof card.accepts === "function" ? card.accepts(obs, input.seat, input) === true : card.moves(obs, input.seat).some((m) => sameInput(m, input));
      if (!ok) throw new GameError("zug-ungueltig", canon(input).slice(0, 200));
    }
    try { next = card.step(st, input, rng(session.seed + "|step|" + session.log.length)); }
    catch (e) { throw new GameError("zug-ungueltig", e.message); }
    logged = input;
  }
  if (canon(next).length > card.manifest.limits.stateBytes) throw new GameError("zustand-zu-gross");
  // status.cheat (Ansage unter Wert) meldet die Karte selbst offen in status/view; der Host wertet nicht still
  return { ...session, state: next, log: session.log.concat([logged]) };
}

/** Faelliger Pflichtzug fuer einen eigenen Sitz (oder null): Aufloesung (status.reveal + eigenes Salz) oder
 *  Pflichtzug ohne Entscheidung (status.auto + genau ein legaler Zug, ADR 0001 f – Mischen, Sperren, Schluessel). */
export function dueReveal(card, session) {
  const s = card.status(session.state);
  if (s.over) return null;
  if (s.reveal && session.secrets[s.turn] !== undefined) return { t: "reveal", seat: s.turn, salt: session.secrets[s.turn] };
  if (s.auto === true && session.mine.includes(s.turn) && !s.reveal) {
    const known = session.state.priv[s.turn] !== null || !secretSeats(card).includes(s.turn);
    if (!known) return null;
    const legal = card.moves(card.observe(session.state, s.turn), s.turn);
    if (legal.length === 1) return legal[0];
  }
  return null;
}
export const dueForced = dueReveal;

export function observe(card, session, seat) { return card.observe(session.state, seat); }
export function status(card, session) { return card.status(session.state); }
/** Hash des oeffentlichen Zustands: gleich auf allen Geraeten (Lockstep-Abgleich). */
export function pubHash(session) { return stateHash(session.state.pub); }

/** Drahtformat ohne Salze, ohne priv – das Einzige, was Link und Netz sehen. */
export function toWire(session, card = null) {
  // Snapshot-Karten (manifest.link.snap) verdichten ihr Log rein und deterministisch (ADR 0001 f)
  const log = card && card.manifest.link && card.manifest.link.snap && typeof card.compact === "function" ? card.compact(session.log) : session.log;
  return { c: session.card, v: session.version, p: session.params, s: session.seed, k: session.commits, m: log };
}

/** Partie aus dem Drahtformat nachspielen; jede Eingabe wird erneut geprueft. */
export function fromWire(card, wire, { mine, secrets = {} }) {
  if (wire.c !== card.manifest.id) throw new GameError("karte-unbekannt");
  if (wire.v !== card.manifest.version) throw new GameError("version");
  let s = newSession(card, { params: wire.p, seed: wire.s, mine, secrets, commits: wire.k });
  for (const input of wire.m) s = apply(card, s, input);
  return s;
}
