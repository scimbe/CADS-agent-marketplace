// Reine Spielablauf-Funktionen fuer die Statechart: kartenunabhaengig, ohne Netz/DOM/Zufall (Zufall kommt als
// ev.rand aus der Laufzeit). Jede Funktion bekommt ctx und liefert neuen ctx (+ Effekte ueber emit).
import { cardOf, validParams, validInput } from "../cards/index.js";
import { defaults } from "../contract/fields.js";
import * as S from "../contract/session.js";
import * as H from "../contract/handshake.js";
import { decode } from "./link.js";
import { stateHash } from "../contract/sdk.js";
import { verifyGhost } from "./rt/match.js";

// ---------- Geraeteeintrag je Link-Partie (Review H1/M1) ----------
// Jeder Sitz merkt sich den Stand, den er zuletzt kannte oder verschickt hat: Basis (Karte, Version, Parameter, Seed),
// Commitments und Hash des Logs. Ein eingehender Link muss diesen Stand unveraendert fortsetzen und darf nur Zuege
// anderer Sitze anhaengen; sonst wird er abgelehnt, bevor irgendetwas nachgespielt oder aufgedeckt wird.
function baseHash(w) { return stateHash({ c: w.c, v: w.v, p: w.p, s: w.s }); }
export function gameEntry(session, gameId) {
  const seat = session.mine[0], c = cardOf(session.card), snap = isSnap(c);
  const e = { g: gameId, seat, salt: session.secrets[seat] || null, n: session.log.length, lh: stateHash(session.log), bh: baseHash(S.toWire(session)), k: session.commits.slice() };
  // Snapshot-Karten: der eigene Stand selbst wird gemerkt, damit eingehende Staende vereinigt werden koennen
  if (snap) e.pub = session.state.pub;
  return e;
}
function isSnap(c) { return !!(c && c.manifest.link && c.manifest.link.snap && typeof c.merge === "function" && typeof c.compact === "function"); }
/** UTC-Tag (Tage seit 1970-01-01) aus Millisekunden – die einzige Uhr, die Karten sehen (ADR 0001 f, ctx.today). */
export function todayOf(ms) { return Math.floor(ms / 86400000); }
/** Eingabe aus Link/Live/Bot: Huelle und Schema der Karte, bevor irgendetwas nachgespielt wird. */
export function checkInput(cardId, x) {
  if (!validInput(cardId, x)) throw new S.GameError("eingabe", "Schema der Karte");
  return x;
}
/** Kontext fuer view(obs, seat, ctx) – eine Quelle fuer Host-Ansichten (ADR 0001 f, Anfrage Z1). */
export function viewCtx(ctx, extra = {}) {
  const me = ctx.me || {}, konto = ctx.konto || {};
  return { lang: ctx.lang, today: Number.isInteger(ctx.today) ? ctx.today : null, draft: ctx.draft === undefined ? null : ctx.draft, age18: konto.age18 === true || me.age18 === true, nick: typeof me.nick === "string" ? me.nick : "", ...extra };
}
export function continues(stored, w) {
  if (!stored || typeof stored.lh !== "string" || !Array.isArray(stored.k)) return "manipuliert";
  if (stored.bh !== baseHash(w)) return "manipuliert";
  if (w.k.length !== stored.k.length) return "manipuliert";
  for (let i = 0; i < w.k.length; i++) {
    if (stored.k[i] !== null && w.k[i] !== stored.k[i]) return "manipuliert";
    if (stored.k[i] === null && w.k[i] !== null && i === stored.seat) return "manipuliert";
  }
  if (w.m.length < stored.n) return "veraltet";
  if (stateHash(w.m.slice(0, stored.n)) !== stored.lh) return "manipuliert";
  if (w.m.slice(stored.n).some((x) => x.seat === stored.seat)) return "manipuliert";
  return null;
}

export function card(ctx) { return cardOf(ctx.cardId); }
export function paramsOf(ctx, id = ctx.cardId) { return (ctx.params && ctx.params[id]) || defaults(cardOf(id).manifest.params); }
function seq(rand) { let i = 0; return () => rand[i++ % rand.length]; }

/** Sitze, die dieses Geraet spielt. */
export function mySeats(ctx) {
  if (!ctx.session) return [];
  return ctx.session.mine;
}
export function gameStatus(ctx) { return ctx.session ? S.status(card(ctx), ctx.session) : null; }

// ---------- Start je Modus ----------
export function startLocal(ctx, rand) {
  const c = card(ctx), n = S.playerCount(c), all = []; for (let s = 0; s < n; s++) all.push(s);
  const mine = ctx.mode === "alone" ? all : [ctx.seat];
  const next = seq(rand.slice(2));
  const { secrets, commits } = S.makeSecrets(c, mine, next);
  const session = S.newSession(c, { params: paramsOf(ctx), seed: rand[0], mine, secrets, commits });
  const started = { ...ctx, session, gameId: rand[1].slice(0, 16), sent: false, error: null, link: null, draft: null, coveredFor: null, viewer: ctx.mode === "alone" ? 0 : ctx.seat };
  return applyDue(started).ctx; // Pflichtzuege direkt nach Beginn (status.auto), lokal: nichts zu senden
}

/** Bot-Modus mit mehr als zwei Sitzen (ADR 0001 f): ein Mensch, n-1 Bots auf diesem Geraet. Alle Salze liegen hier;
 *  die Ansicht zeigt nur den Sitz des Menschen. Gruppen-Handshake ist Stufe 2. */
export function startBotsLocal(ctx, rand) {
  const c = card(ctx), n = S.playerCount(c), all = []; for (let s = 0; s < n; s++) all.push(s);
  const next = seq(rand.slice(2));
  const { secrets, commits } = S.makeSecrets(c, all, next);
  const session = S.newSession(c, { params: paramsOf(ctx), seed: rand[0], mine: all, secrets, commits });
  const r = applyDue({ ...ctx, session, gameId: rand[1].slice(0, 16), sent: false, error: null, link: null, draft: null, viewer: ctx.seat, botSeats: all.filter((s) => s !== ctx.seat) });
  return r.ctx;
}
/** Zug eines lokalen Bots (Eingabe kommt aus der Laufzeit); danach Pflichtzuege. */
export function applyBotLocal(ctx, input) {
  if (!ctx.botSeats || !ctx.botSeats.includes(input.seat)) throw new S.GameError("zug-ungueltig", "kein Bot-Sitz");
  checkInput(ctx.cardId, input);
  return applyDue({ ...ctx, session: S.apply(card(ctx), ctx.session, input) }).ctx;
}
export function botTurn(ctx) {
  if (!ctx.session || !ctx.botSeats) return null;
  const st = gameStatus(ctx);
  return !st.over && ctx.botSeats.includes(st.turn) ? st.turn : null;
}

export function helloFor(ctx, rand) {
  const c = card(ctx), r = H.hello(c, paramsOf(ctx), ctx.seat, rand);
  return { ctx: { ...ctx, hs: r.local, session: null, error: null, viewer: ctx.seat }, msg: r.msg };
}
export function joinFor(ctx, hi, rand) {
  const c = cardOf(hi.c);
  if (!c) throw new S.GameError("karte-unbekannt");
  if (!validParams(hi.c, hi.p)) throw new S.GameError("params");
  const r = H.join(c, hi, rand);
  return { ctx: { ...ctx, cardId: hi.c, hs: r.local, session: null, error: null, viewer: r.local.mine[0], seat: r.local.mine[0] }, msg: r.msg };
}
export function startFor(ctx, jn) {
  const r = H.start(card(ctx), paramsOf(ctx), ctx.hs, jn);
  const due = applyDue({ ...ctx, session: r.session, hs: null, draft: null });
  return { ctx: due.ctx, msg: r.msg, out: due.out };
}
export function beginFor(ctx, st) {
  return applyDue({ ...ctx, session: H.begin(card(ctx), ctx.hs, st), hs: null, draft: null });
}

// ---------- Zuege ----------
/** Eigene Eingabe anwenden, dann faellige eigene Aufloesung. Liefert Nachrichten fuer den Partner. */
export function applyMine(ctx, input, today = ctx.today) {
  const c = card(ctx);
  // manifest.inputDay: der Host stempelt den UTC-Tag; step bleibt uhrfrei (ADR 0001 f)
  if (c.manifest.inputDay) { if (!Number.isInteger(today)) throw new S.GameError("eingabe", "Tag fehlt"); input = { ...input, d: today }; }
  checkInput(ctx.cardId, input);
  let s = S.apply(c, ctx.session, input);
  const out = [{ t: "in", i: s.log.length - 1, x: s.log[s.log.length - 1], h: S.pubHash(s) }];
  for (let r = S.dueReveal(c, s); r; r = S.dueReveal(c, s)) {
    s = S.apply(c, s, r);
    out.push({ t: "in", i: s.log.length - 1, x: s.log[s.log.length - 1], h: S.pubHash(s) });
  }
  return { ctx: { ...ctx, session: s, sent: false, draft: null }, out };
}
/** Partnereingabe (Bot oder Live) mit Reihenfolge- und Hash-Pruefung. */
export function applyPeer(ctx, msg) {
  if (msg.i !== ctx.session.log.length) throw new S.GameError("abweichung", "Reihenfolge");
  if (ctx.session.mine.includes(msg.x.seat)) throw new S.GameError("zug-ungueltig", "fremder Zug fuer eigenen Sitz");
  if (msg.x.t !== "reveal") checkInput(ctx.cardId, msg.x);
  const s = S.apply(card(ctx), ctx.session, msg.x);
  if (S.pubHash(s) !== msg.h) throw new S.GameError("abweichung", "Zustandshash");
  return applyDue({ ...ctx, session: s });
}
function applyDue(ctx) {
  const c = card(ctx); let s = ctx.session; const out = [];
  for (let r = S.dueReveal(c, s); r; r = S.dueReveal(c, s)) {
    s = S.apply(c, s, r);
    out.push({ t: "in", i: s.log.length - 1, x: s.log[s.log.length - 1], h: S.pubHash(s) });
  }
  return { ctx: { ...ctx, session: s }, out };
}

// ---------- Link-Duell ----------
export function challengeOf(ctx) {
  return { ...S.toWire(ctx.session, card(ctx)), g: ctx.gameId, h: S.pubHash(ctx.session) };
}
/** Pruefung eines eingehenden Fragments. stored = eigener Eintrag zu dieser Partie (Salz), falls vorhanden. */
export function receive(hash, stored, rand) {
  const d = decode(hash);
  if (!d.ok) return { ok: false, reason: d.reason };
  if (d.type === "live") return { ok: true, kind: "live", token: d.data.t };
  const c = cardOf(d.data.c);
  if (!c) return { ok: false, reason: "karte-unbekannt" };
  if (d.data.v !== c.manifest.version) return { ok: false, reason: "version" };
  if (!validParams(d.data.c, d.data.p)) return { ok: false, reason: "params" };
  if (d.type === "ghost") {
    // Geist-Link (ADR 0001 b): nur Echtzeitkarten mit rt.ghost; die Spur wird vor dem Annehmen nachgespielt
    if (c.manifest.mode !== "realtime" || !c.manifest.rt.ghost) return { ok: false, reason: "typ" };
    const v = verifyGhost(c, d.data);
    if (!v.ok) return { ok: false, reason: v.reason };
    return { ok: true, kind: "ghost", cardId: d.data.c, params: d.data.p, wire: d.data, seat: v.seat, score: v.score };
  }
  if (d.type === "card") {
    if (c.manifest.mode !== "static") return { ok: false, reason: "typ" };
    return { ok: true, kind: "card", cardId: d.data.c, params: d.data.p };
  }
  if (c.manifest.mode === "static") return { ok: false, reason: "typ" };
  if (c.manifest.mode === "realtime") return { ok: false, reason: "typ" };
  const w = d.data;
  for (const x of w.m) if (x.t !== "reveal" && !validInput(w.c, x)) return { ok: false, reason: "eingabe" };
  const snap = isSnap(c);
  try {
    let mine, secrets = {};
    if (stored && stored.g === w.g && snap) {
      // Snapshot-Karte: Basis muss passen, der Stand wird mit dem eigenen vereinigt statt fortgesetzt
      if (stored.bh !== baseHash(w) || !stored.pub) return { ok: false, reason: "manipuliert" };
      mine = [stored.seat]; if (stored.salt) secrets[stored.seat] = stored.salt;
      let session = S.fromWire(c, w, { mine, secrets });
      if (w.h && S.pubHash(session) !== w.h) return { ok: false, reason: "abweichung" };
      const merged = { pub: c.merge(stored.pub, session.state.pub), priv: session.state.priv };
      const log = c.compact(session.log, merged);
      const again = S.fromWire(c, { ...w, m: log }, { mine, secrets });
      if (stateHash(again.state.pub) !== stateHash(merged.pub)) return { ok: false, reason: "abweichung" };
      session = again;
      const due = applyDue({ cardId: c.manifest.id, session });
      return { ok: true, kind: "challenge", cardId: c.manifest.id, params: w.p, session: due.ctx.session, gameId: w.g, revealed: due.out.length > 0 };
    }
    if (stored && stored.g === w.g) {
      const bad = continues(stored, w);
      if (bad) return { ok: false, reason: bad };
      mine = [stored.seat]; if (stored.salt) secrets[stored.seat] = stored.salt;
    }
    else {
      const probe = S.fromWire(c, w, { mine: [] });
      const st = S.status(c, probe);
      if (st.over) mine = [];
      else {
        mine = [st.turn];
        if (S.secretSeats(c).includes(st.turn)) {
          if (w.k[st.turn] !== null) return { ok: false, reason: "nicht-deins" };
          const salt = rand[0]; secrets[st.turn] = salt;
          w.k = w.k.slice(); w.k[st.turn] = S.commitOf(salt);
        }
      }
    }
    let session = S.fromWire(c, w, { mine, secrets });
    if (w.h && S.pubHash(session) !== w.h) return { ok: false, reason: "abweichung" };
    const due = applyDue({ cardId: c.manifest.id, session });
    session = due.ctx.session;
    return { ok: true, kind: "challenge", cardId: c.manifest.id, params: w.p, session, gameId: w.g, revealed: due.out.length > 0 };
  } catch (e) {
    return { ok: false, reason: e.code || "zug-ungueltig" };
  }
}

// ---------- Phasen fuer SYNC ----------
export function phase(ctx) {
  if (ctx.error) return "error";
  if (!ctx.session) return "hand";
  const st = gameStatus(ctx), mine = mySeats(ctx), log = ctx.session.log;
  // Link: senden, wenn mein letzter Zug noch nicht unterwegs ist – oder wenn ich die Partie eroeffne und der
  // andere beginnt (dann ist der Link die Einladung)
  const lastMine = log.length === 0 ? !mine.includes(st.turn) : mine.includes(log[log.length - 1].seat);
  if (ctx.mode === "link" && lastMine && !ctx.sent && (st.over || !mine.includes(st.turn))) return st.over ? "over" : "send";
  if (st.over) return "over";
  // Abdecken auch vor dem ersten Zug (Z2, 13 §6.4): im Modus allein, sobald ein anderer Sitz dran ist als zuletzt aufgedeckt
  if (ctx.mode === "alone" && card(ctx).manifest.players.max > 1 && st.turn !== (ctx.coveredFor === undefined ? ctx.viewer : ctx.coveredFor)) return "cover";
  if (ctx.botSeats && ctx.botSeats.includes(st.turn)) return "wait";
  if (mine.includes(st.turn)) return "turn";
  return "wait";
}
