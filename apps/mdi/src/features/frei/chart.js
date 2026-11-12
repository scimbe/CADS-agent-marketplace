// Freie Karte als Feature der App-Statechart (ADR 0001 (g)): Zustaende unter inhalt.frei, Ereignisse im Regal, Wachen,
// Aktionen, Kontext und Effekte. Alle Sichtbarkeit folgt aus diesem Zustand (A2); Netz nur ueber Effekte (src/broker/*).
// Altcode (Untergrenze): create-ui.js (Form, Zaehler, Kategorie/Genre/Wer spielt, Bald, Absage, Vorschau, Uebernehmen/
// Verwerfen, Aufladen), warten.js (echte Zustaende, Abbrechen), robot-ui.js (Deck-Karte -> freie Karte), deck.js (Deck,
// Nutzung, Daumen, Gate, Meine Karten), melden.js, kibild.js, ai.js (KI-Arten fuer alle Karten).
//
// Zustaende:
//   start      Formular (Konto/16+/Zaehler/Aufladen kommen aus der Konto-Region), Absage und "noch nicht" mit Gegenvorschlag
//   warten     eine laufende Anfrage: gesendet | Platz N | KI baut | Pruefung; Abbrechen immer
//   vorschau   eine Karte mit KI-Badge: Uebernehmen (accept -> Editor own:true) | Verwerfen (discard) | anderes Genre
//   fehlt      die Zielkarte gibt es in diesem Stand nicht (ehrlich, die Karte ist trotzdem uebernommen)
//   robot      ein Satz verfeinert eine Karte (Deck-/Katalogkarte oder die eigene) ueber denselben Schritt
//   gate       Empfaenger: eine geteilte freie Karte oeffnet erst nach Status "ok" (fail closed)
//   sharegate  Absender: Teilen erst nach Status "ok"
//   deck       Community-Karten (signiert); deckkarte: eine davon, Nutzung, Daumen, Melden
//   meine      Meine freien Karten (/deck/me), Guthaben, Moderationshinweise mit Weg zum Widerspruch
//   melden     Meldung mit Grund und Einwilligung
//   bild, bildwarten  KI-Bild (Karte, Logo, Kontobild) mit Kontingent
//   ki         KI-Vorschlaege fuer die x-model-Felder eines Teils der offenen Karte
import { ARTS, GENRES, MODES, SOON, artOk, kindOk, sanitizeDoc, sanitizeKi, targetOf, freeIdOf, gateChecksOf } from "./doc.js";
import { cardOf as cardById, validParams, CARDS } from "../../cards/index.js";
import { defaults } from "../../contract/fields.js";
import * as G from "../../app/game.js";

const T = (p) => p;
/** Zielkarte nach id oder alter Katalog-id (manifest.legacy, Text oder Liste: eingeklappte Varianten) */
export function cardOf(id) { return cardById(id) || Object.values(CARDS).find((c) => [].concat(c.manifest.legacy || []).includes(id)) || null; }
const R = (ev) => (ev && ev.r) || { how: "off" };
const F = (ctx, o) => ({ ...ctx, frei: { ...ctx.frei, ...o } });
const kartePot = (ctx) => (ctx.konto && ctx.konto.st ? ctx.konto.st.karte : null);
const paramsOfCard = (ctx, id) => ({ ...defaults(cardOf(id).manifest.params), ...((ctx.params || {})[id] || {}) });
/** x-model-Felder eines Teils (Text) */
export function modelFields(manifest, partId) {
  const part = manifest.parts.find((p) => p.id === partId);
  if (!part) return [];
  return part.params.filter((k) => { const p = manifest.params.properties[k]; return p && p["x-model"] === true && p["x-field"] === "text"; });
}

const freshForm = { art: "", genre: "", mode: "", text: "", ask: "", fest: false, res: null, opt: null, note: null, soon: null, robot: null };

export const freiState = {
  initial: "start",
  // Abrechnung gescheitert (accept/discard ohne 200): sichtbar, nie still
  on: { SETTLE_FAIL: { actions: ["settleFail"] } },
  states: {
    start: {
      entry: ["freiRefresh"],
      on: {
        ART: { actions: ["setArt"] },
        GENRE: { actions: ["setGenre"] },
        PLAYMODE: { cond: "modeOk", actions: ["setPlayMode"] },
        TEXT: { actions: ["setText"] },
        EXAMPLE: { actions: ["setExample"] },
        SOON_PICK: { actions: ["setSoon"] },
        SEND: [{ target: T("inhalt.frei.warten"), cond: "canSend", actions: ["fxAsk"] }, { cond: "crisisText", actions: ["showCrisis"] }],
        ALT_SEND: { target: T("inhalt.frei.warten"), cond: "altOk", actions: ["takeAlt", "fxAsk"] },
        RESEND: { target: T("inhalt.frei.warten"), cond: "resendOk", actions: ["takeResend", "fxAsk"] },
        CATALOG: { target: T("inhalt.card.view"), cond: "catalogOk", actions: ["openCatalog"] },
        STIL_GO: { target: T("inhalt.stil") },
        // nur hier, wo keine Antwort offen ist (Review: kein Verlassen von warten/vorschau ohne Abrechnung)
        MINE: { target: T("inhalt.frei.meine") },
        DECK: { target: T("inhalt.frei.deck") },
        BILD: { target: T("inhalt.frei.bild") },
        // Profil eben mit 16+ angelegt (erste Anmeldung aus der freien Karte): den Stand neu fragen, sonst stuende "ab 16" da
        PROFIL: { cond: "profilCreated", actions: ["freiRefresh"] },
        BACK: { target: T("inhalt.shelf"), actions: ["clearForm"] }
      }
    },
    warten: {
      on: {
        FREI_PHASE: { cond: "curReq", actions: ["setPhase"] },
        FREI_RESULT: [
          { target: T("inhalt.frei.vorschau"), cond: "resultFits", actions: ["takeOption"] },
          { target: T("inhalt.frei.start"), cond: "resultBad", actions: ["badResult"] },
          { target: T("inhalt.frei.start"), cond: "curReq", actions: ["takeRefusal"] }
        ],
        CANCEL: { target: T("inhalt.frei.start"), actions: ["cancelAsk"] },
        BACK: { target: T("inhalt.frei.start"), actions: ["cancelAsk"] }
      }
    },
    vorschau: {
      on: {
        TAKE: [
          { target: T("inhalt.card.view"), cond: "targetReady", actions: ["freiAccept", "openTaken"] },
          { target: T("inhalt.frei.fehlt"), actions: ["freiAccept", "markMissing"] }
        ],
        DROP: { target: T("inhalt.frei.start"), actions: ["freiDiscard"] },
        RESEND: { target: T("inhalt.frei.warten"), cond: "resendOk", actions: ["freiDiscard", "takeResend", "fxAsk"] },
        REFINE: { target: T("inhalt.frei.robot"), actions: ["freiAccept", "refineOwn"] },
        BACK: { target: T("inhalt.frei.start"), actions: ["freiDiscard"] }
      }
    },
    fehlt: { on: { BACK: { target: T("inhalt.frei.start"), actions: ["clearForm"] }, DONE: { target: T("inhalt.shelf"), actions: ["clearForm"] } } },
    robot: {
      on: {
        TEXT: { actions: ["setText"] },
        SEND: [{ target: T("inhalt.frei.warten"), cond: "canRefine", actions: ["fxRefine"] }, { cond: "crisisText", actions: ["showCrisis"] }],
        FREI_PHASE: { cond: "curReq", actions: ["setPhase"] },
        BACK: [{ target: T("inhalt.card.view"), cond: "robotFromCard" }, { target: T("inhalt.frei.start"), actions: ["clearForm"] }]
      }
    },
    gate: {
      entry: ["fxGate"],
      on: {
        GATE: [{ target: T("inhalt.receive.show"), cond: "gateOk", actions: ["gateDone"] }, { target: T("inhalt.receive.reject"), actions: ["gateNo"] }],
        BACK: { target: T("inhalt.shelf"), actions: ["dropIncoming"] }
      }
    },
    sharegate: {
      entry: ["fxShareGate"],
      on: {
        GATE: [
          { target: T("inhalt.card.share"), cond: "gateOk", actions: ["gateDone"] },
          // veraendert (eigene Aenderungen an der freien Karte): als Remix teilen – ohne KI-Siegel, die Wurzel-id bleibt pruefbar
          { target: T("inhalt.frei.sharegate"), cond: "remixable", actions: ["toRemix"] },
          { target: T("inhalt.card.view"), actions: ["shareNo"] }
        ],
        BACK: T("inhalt.card.view")
      }
    },
    deck: {
      entry: ["fxDeckLoad"],
      on: {
        DECK_LOADED: { actions: ["takeDeck"] },
        DECK_OPEN: { target: T("inhalt.frei.deckkarte"), cond: "deckCardOk", actions: ["openDeckCard"] },
        AGAIN: { actions: ["fxDeckLoad"] },
        BACK: T("inhalt.shelf")
      }
    },
    deckkarte: {
      on: {
        USE: { actions: ["takeUse"] },
        ACTED: { actions: ["fxActed"] },
        VOTE: { actions: ["fxVote"] },
        VOTED: { actions: ["takeVote"] },
        PLAY: [{ target: T("inhalt.card.view"), cond: "deckPlayable", actions: ["fxActed", "openDeckPlay"] }, { target: T("inhalt.frei.fehlt"), actions: ["markDeckMissing"] }],
        ROBOT: { target: T("inhalt.frei.robot"), actions: ["robotFromDeck"] },
        MELDEN: { target: T("inhalt.frei.melden"), actions: ["openReport"] },
        BACK: T("inhalt.frei.deck")
      }
    },
    meine: {
      entry: ["fxMine"],
      on: {
        MINE_LOADED: { actions: ["takeMine"] },
        MOD: { actions: ["takeMod"] },
        APPEAL: { target: T("inhalt.stil.widerspruch"), cond: "appealable", actions: ["openAppeal"] },
        AGAIN: { actions: ["fxMine"] },
        BACK: T("inhalt.frei.start")
      }
    },
    melden: {
      on: {
        REASON: { actions: ["setReason"] },
        REPORT_SEND: { cond: "reasonOk", actions: ["fxReport"] },
        REPORTED: { actions: ["takeReported"] },
        BACK: [{ target: T("inhalt.frei.deckkarte"), cond: "reportFromDeck" }, { target: T("inhalt.card.view") }]
      }
    },
    bild: {
      entry: ["fxBildStatus"],
      on: {
        BILD_STATUS: { actions: ["takeBildStatus"] },
        BILD_USE: { actions: ["setBildUse"] },
        BILD_STYLE: { actions: ["setBildStyle"] },
        BILD_TEXT: { actions: ["setBildText"] },
        BILD_GO: [{ target: T("inhalt.frei.bildwarten"), cond: "bildOk", actions: ["fxBild"] }, { cond: "bildCrisis", actions: ["bildCrisis"] }],
        BILD_TAKE: { cond: "bildDone", actions: ["fxBildKeep"] },
        BILD_KEPT: { actions: ["takeBildKept", "fxBildStatus"] },
        BACK: T("inhalt.frei.start")
      }
    },
    bildwarten: {
      on: {
        BILD_PHASE: { cond: "bildCur", actions: ["setBildPhase"] },
        BILD_RESULT: { target: T("inhalt.frei.bild"), cond: "bildCur", actions: ["takeBild"] },
        CANCEL: { target: T("inhalt.frei.bild"), actions: ["cancelBild"] },
        BACK: { target: T("inhalt.frei.bild"), actions: ["cancelBild"] }
      }
    },
    ki: {
      on: {
        KI_RESULT: { cond: "kiCur", actions: ["takeKi"] },
        KI_PICK: { target: T("inhalt.card.customize.bubbles"), cond: "kiPickOk", actions: ["applyKi"] },
        KI_AGAIN: { actions: ["fxKi"] },
        BACK: { target: T("inhalt.card.customize.bubbles"), actions: ["cancelKi"] }
      }
    }
  }
};

/** Ereignisse im Regal (H haengt sie an seinen Regalzustand) */
export const FREI_SHELF = {
  FREI: { target: T("inhalt.frei.start"), actions: ["clearForm"] },
  DECK_OPEN: { target: T("inhalt.frei.deckkarte"), cond: "deckCardOk", actions: ["openDeckCard"] },
  DECK: { target: T("inhalt.frei.deck") },
  MINE: { target: T("inhalt.frei.meine") }
};
/** Ereignisse in inhalt.card.view (F setzt sie ein; GO-Uebergang VOR goStaticLink) */
export const CARD_VIEW_ON = {
  GO_FIRST: { target: T("inhalt.frei.sharegate"), cond: "goFreiShare" },
  ROBOT: { target: T("inhalt.frei.robot"), cond: "robotOk", actions: ["robotFromOpen"] },
  MELDEN: { target: T("inhalt.frei.melden"), cond: "cardFree", actions: ["openReportCard"] }
};
/** Ereignis in inhalt.card.customize.bubbles: KI-Vorschlaege fuer einen Teil */
export const CUSTOMIZE_ON = { KI: { target: T("inhalt.frei.ki"), cond: "kiOk", actions: ["openKi", "fxKi"] } };
/** Erster Uebergang bei LINK: eine geteilte freie Karte geht durch das Status-Gate */
export const LINK_FIRST = { target: T("inhalt.frei.gate"), cond: "linkFrei", actions: ["takeLink"], raise: "LEAVE" };

const ready = (f) => !!f.art && (f.art !== "game" || !!f.genre) && [...String(f.text || "").trim()].length >= 3;
function inputOf(f) {
  const g = f.ask || (f.art === "game" ? f.genre : "");
  return { text: [...String(f.text).trim()].slice(0, 200).join(""), art: f.art, ...(g ? { genre: g } : {}), ...(f.fest ? { fest: true } : {}) };
}
const potOk = (k) => !!k && !k.off && k.age16 === true && !k.paused && (k.remaining > 0 || k.credit > 0);

export const freiGuards = {
  kiAskOk: (ctx, ev) => ["wish", "line", "meme", "lyrics", "plan", "liste", "quiz", "welt", "text", "anlass"].includes(ev.kind) && !!ev.input && typeof ev.input === "object" && typeof ev.into === "string" && /^[A-Za-z][A-Za-z0-9]{0,15}$/.test(ev.into),
  kiDoneOk: (ctx, ev) => typeof ev.into === "string" && /^[A-Za-z][A-Za-z0-9]{0,15}$/.test(ev.into),
  profilCreated: (ctx, ev) => ev.op === "put" && !!ev.result && ev.result.ok === true && !!ev.body && ev.body.fresh === true,
  modeOk: (ctx, ev) => !!ctx.frei.genre && MODES[ctx.frei.genre] && MODES[ctx.frei.genre][ev.mode] === true,
  canSend: (ctx, ev, inState) => inState("konto.angemeldet") && potOk(kartePot(ctx)) && ready(ctx.frei) && !ev.crisis,
  crisisText: (ctx, ev) => ev.crisis === true,
  altOk: (ctx, ev, inState) => inState("konto.angemeldet") && potOk(kartePot(ctx)) && !!ctx.frei.res && !!ctx.frei.res.alt && ctx.frei.res.alt.kind === "genre" && /^G\d{1,2}$/.test(ctx.frei.res.alt.id) && [...String(ev.text || "").trim()].length >= 3 && !ev.crisis,
  resendOk: (ctx, ev, inState) => inState("konto.angemeldet") && potOk(kartePot(ctx)) && GENRES.includes(ev.genre) && [...String(ctx.frei.text || "").trim()].length >= 3,
  catalogOk: (ctx, ev) => !!cardOf(ev.id),
  curReq: (ctx, ev) => ev.req === ctx.frei.req,
  resultFits: (ctx, ev) => {
    if (ev.req !== ctx.frei.req || R(ev).how !== "result") return false;
    const o = R(ev).options[0], doc = o && sanitizeDoc(o.doc), asked = ctx.frei.robot ? o && o.art : ctx.frei.art;
    return !!doc && !!o && artOk(asked, o.art) && kindOk(o.art, doc) && !!R(ev).seals[0];
  },
  resultBad: (ctx, ev) => ev.req === ctx.frei.req && R(ev).how === "result",
  targetReady: (ctx) => !!ctx.frei.opt && !targetOf(ctx.frei.opt.doc, cardOf).missing,
  canRefine: (ctx, ev, inState) => inState("konto.angemeldet") && potOk(kartePot(ctx)) && !!ctx.frei.robot && [...String(ctx.frei.text || "").trim()].length >= 3 && !ev.crisis,
  robotFromCard: (ctx) => !!ctx.frei.robot && ctx.frei.robot.back === "card",
  robotOk: (ctx) => { const c = ctx.cardId && cardOf(ctx.cardId); return !!c && typeof c.toFree === "function"; },
  // jede Karte, deren Parameter eine freie Karte tragen (Siegel ki.h oder Remix fr, ueber den Adapter toFree der Karte)
  linkFrei: (ctx, ev) => { if (!("_r" in ev)) ev._r = G.receive(ev.hash, ev.stored || null, ev.rand || []); const r = ev._r; return !!(r && r.ok && r.kind === "card" && gateChecksOf(freeDocOf(r.cardId, r.params)).length); },
  remixable: (ctx, ev) => ev.st === "changed" && ctx.cardId === "frei" && !!paramsOfCard(ctx, "frei").hash,
  gateOk: (ctx, ev) => ev.st === "ok",
  goFreiShare: (ctx) => !!ctx.cardId && cardOf(ctx.cardId).manifest.mode === "static" && ctx.mode === "link" && gateChecksOf(freeDocOf(ctx.cardId, paramsOfCard(ctx, ctx.cardId))).length > 0,
  cardFree: (ctx) => ctx.cardId === "frei" && !!paramsOfCard(ctx, "frei").seal,
  deckCardOk: (ctx, ev) => !!(ctx.frei.deck.cards || []).find((c) => c.cid === ev.cid),
  deckPlayable: (ctx) => !!ctx.frei.card && !targetOf(ctx.frei.card.doc, cardOf).missing,
  reasonOk: (ctx) => !!ctx.frei.report.reason && !ctx.frei.report.sending && !ctx.frei.report.sent,
  reportFromDeck: (ctx) => ctx.frei.report.back === "deck",
  bildOk: (ctx, ev) => { const b = ctx.frei.bild, n = [...String(b.text || "").trim()].length; return !!b.st && b.st.login && b.st.can[b.use] === true && n >= 3 && n <= 200 && !ev.crisis; },
  bildCrisis: (ctx, ev) => ev.crisis === true,
  bildCur: (ctx, ev) => ev.req === ctx.frei.bild.req,
  bildDone: (ctx) => !!ctx.frei.bild.res && ctx.frei.bild.res.how === "done" && !ctx.frei.bild.kept,
  kiOk: (ctx, ev) => { const c = ctx.cardId && cardOf(ctx.cardId); return !!c && modelFields(c.manifest, ev.part).length > 0; },
  kiCur: (ctx, ev) => ev.req === ctx.frei.ki.req,
  kiPickOk: (ctx, ev) => { const k = ctx.frei.ki, o = k.opts[ev.i]; if (!o) return false; const next = { ...paramsOfCard(ctx, ctx.cardId), [k.field]: o }; return validParams(ctx.cardId, next); }
};

function openTarget(ctx, t) {
    const id = t.cardId, c = cardOf(id), params = t.params ? { ...defaults(c.manifest.params), ...t.params } : null;
    const base = { ...ctx, cardId: id, mode: c.manifest.mode === "static" ? "link" : "alone", seat: 0, session: null, hs: null, error: null, note: t.own ? "frei-own" : t.deck ? "frei-deck" : null, link: null, part: null };
    return params && validParams(id, params) ? { ...base, params: { ...ctx.params, [id]: params }, own: !!t.own } : { ...base, own: !!t.own };
  }

/** Die freie Karte hinter Kartenparametern (Adapter toFree der Karte) oder null */
function freeDocOf(cardId, params) {
  const c = cardId && cardOf(cardId);
  if (!c || typeof c.toFree !== "function" || !params) return null;
  try { return c.toFree(params); } catch (e) { return null; }
}
function reqOf(ctx) { return (ctx.frei.req || 0) + 1; }
function askFx(ctx, emit, input, robot) {
  const req = reqOf(ctx);
  emit({ type: "frei.ask", req, input });
  return F(ctx, { req, phase: "send", place: 0, res: null, opt: null, note: null, soon: null, ...(robot ? {} : {}) });
}

export const freiActions = {
  clearForm: (ctx) => F(ctx, { ...freshForm }),
  freiRefresh: (ctx, ev, emit) => { emit({ type: "konto.status" }); return ctx; },
  setArt: (ctx, ev) => (ARTS.includes(ev.art) ? F(ctx, { art: ev.art, genre: ev.art === "game" ? ctx.frei.genre : "", mode: ev.art === "game" ? ctx.frei.mode : "", res: null, soon: null }) : ctx),
  setGenre: (ctx, ev) => (GENRES.includes(ev.genre) && ctx.frei.art === "game" ? F(ctx, { genre: ev.genre, mode: "", res: null, soon: null }) : ctx),
  setPlayMode: (ctx, ev) => F(ctx, { mode: ev.mode }),
  setText: (ctx, ev) => F(ctx, { text: [...String(ev.value || "")].slice(0, 200).join(""), res: ctx.frei.res && ctx.frei.res.how === "crisis" ? null : ctx.frei.res }),
  setExample: (ctx, ev) => F(ctx, { text: [...String(ev.value || "")].slice(0, 200).join("") }),
  setSoon: (ctx, ev) => { const s = SOON.find((x) => x[0] === ev.id); return s ? F(ctx, { soon: { id: s[0], near: s[1] } }) : ctx; },
  showCrisis: (ctx) => F(ctx, { res: { how: "crisis" } }),
  fxAsk: (ctx, ev, emit) => {
    const f = ctx.frei;
    emit({ type: "frei.last", last: { art: f.art, genre: f.genre } });
    const c = askFx(ctx, emit, inputOf(f));
    return F(c, { last: { art: f.art, genre: f.genre }, ask: "", fest: false });
  },
  takeAlt: (ctx, ev) => F(ctx, { text: [...String(ev.text).trim()].slice(0, 200).join(""), ask: ctx.frei.res.alt.id, art: ctx.frei.res.alt.id === "G11" ? "quiz" : ctx.frei.res.alt.id.startsWith("G") && ["G1", "G2"].includes(ctx.frei.res.alt.id) ? "game" : ctx.frei.art, genre: ["G1", "G2"].includes(ctx.frei.res.alt.id) ? ctx.frei.res.alt.id : ctx.frei.genre }),
  takeResend: (ctx, ev) => F(ctx, { art: "game", genre: ev.genre, ask: ev.genre, fest: true }),
  openCatalog: (ctx, ev, emit) => openTarget(ctx, { cardId: ev.id, params: null, own: false }),
  setPhase: (ctx, ev) => F(ctx, { phase: ev.step, place: ev.n || 0 }),
  takeOption: (ctx, ev) => {
    const r = R(ev), o = r.options[0], doc = sanitizeDoc(o.doc);
    // das Siegel der eingefrorenen Karte (mit Ersteller-Kennung o) kommt vom Deck des Servers; sonst Siegel + eigener Hash
    // (das h des Deck-Siegels deckt {card, o} ab und ist die Karten-id; deshalb gilt hier das bereinigte h des Servers)
    const sk = sanitizeKi(o.ki);
    const ki = sk && sk.k === "karte" && sk.s ? sk : { k: "karte", s: r.seals[0], ...(r.hashes[0] ? { h: r.hashes[0] } : {}) };
    return F(ctx, { phase: null, opt: { art: o.art, doc: { ...doc, ki }, receipt: r.receipt, note: r.note || [], credit: r.credit === true }, res: null });
  },
  badResult: (ctx, ev, emit) => { const r = R(ev); if (r.receipt) emit({ type: "frei.settle", how: "discard", receipt: r.receipt }); return F(ctx, { phase: null, res: { how: "bad" } }); },
  takeRefusal: (ctx, ev) => F(ctx, { phase: null, res: R(ev), robot: ctx.frei.robot }),
  cancelAsk: (ctx, ev, emit) => { emit({ type: "frei.cancel", req: ctx.frei.req }); return F(ctx, { req: reqOf(ctx), phase: null, note: "cancelled" }); },
  freiAccept: (ctx, ev, emit) => { if (ctx.frei.opt && ctx.frei.opt.receipt) emit({ type: "frei.settle", how: "accept", receipt: ctx.frei.opt.receipt }); return F(ctx, { opt: ctx.frei.opt ? { ...ctx.frei.opt, receipt: "" } : null }); },
  freiDiscard: (ctx, ev, emit) => {
    const o = ctx.frei.opt;
    if (o && o.receipt) emit({ type: "frei.settle", how: "discard", receipt: o.receipt, refresh: true, was: kartePot(ctx) ? kartePot(ctx).remaining : 0 });
    return F(ctx, { opt: null, note: o ? "dropped" : null });
  },
  openTaken: (ctx) => { const t = targetOf(ctx.frei.opt.doc, cardOf); return F(openTarget(ctx, { ...t, own: true }), { taken: { ...ctx.frei.opt }, opt: null }); },
  markMissing: (ctx) => F(ctx, { missing: targetOf(ctx.frei.opt.doc, cardOf).missing, taken: { ...ctx.frei.opt }, opt: null }),
  refineOwn: (ctx) => F(ctx, { robot: { base: ctx.frei.opt.doc, back: "frei", title: ctx.frei.opt.doc.t || "" }, taken: { ...ctx.frei.opt }, opt: null, text: "", res: null }),
  robotFromOpen: (ctx) => {
    const c = cardOf(ctx.cardId), p = paramsOfCard(ctx, ctx.cardId);
    let base = null; try { base = c.toFree(p); } catch (e) { base = null; }
    const from = c.manifest.legacy || c.manifest.id;
    return F(ctx, { ...freshForm, robot: { base, from: base && base.ki ? "" : from, back: "card", title: c.manifest.title[ctx.lang] || c.manifest.title.de } });
  },
  robotFromDeck: (ctx) => F(ctx, { ...freshForm, robot: { base: ctx.frei.card.doc, back: "frei", title: ctx.frei.card.doc.t || "" } }),
  fxRefine: (ctx, ev, emit) => {
    const r = ctx.frei.robot, input = { text: [...String(ctx.frei.text).trim()].slice(0, 200).join(""), ...(r.from ? { from: r.from } : {}), ...(r.base ? { base: r.base } : {}) };
    return askFx(ctx, emit, input, true);
  },
  // Status-Gate
  // das Gate fragt mit dem Inhalt, den die Karte gleich zeigt (gateHash); ein Remix nur mit der id seiner Wurzel
  fxGate: (ctx, ev, emit) => { const inc = ctx.incoming; emit({ type: "frei.status", checks: inc ? gateChecksOf(freeDocOf(inc.cardId, inc.params)) : [] }); return F(ctx, { gate: "busy" }); },
  fxShareGate: (ctx, ev, emit) => { emit({ type: "frei.status", checks: gateChecksOf(freeDocOf(ctx.cardId, paramsOfCard(ctx, ctx.cardId))) }); return F(ctx, { gate: "busy", share: null }); },
  toRemix: (ctx) => { const p = paramsOfCard(ctx, "frei"); return { ...F(ctx, { share: "remix" }), params: { ...ctx.params, frei: { ...p, root: p.root || p.hash.slice(0, 22), seal: "", hash: "", owner: "" } }, note: "frei-remix" }; },
  gateDone: (ctx, ev) => F(ctx, { gate: ev.st }),
  gateNo: (ctx, ev) => ({ ...F(ctx, { gate: ev.st }), reason: ev.st === "blocked" ? "frei-gesperrt" : ev.st === "changed" ? "frei-geaendert" : "frei-ungeprueft" }),
  shareNo: (ctx, ev) => ({ ...F(ctx, { gate: ev.st, share: ev.st }), note: "frei-share-no" }),
  // Deck
  fxDeckLoad: (ctx, ev, emit) => { emit({ type: "frei.deck.load" }); return F(ctx, { deck: { ...ctx.frei.deck, load: "busy" } }); },
  takeDeck: (ctx, ev) => F(ctx, { deck: { load: ev.ok ? "ok" : ev.why || "netz", cards: ev.cards || ctx.frei.deck.cards, v: ev.v } }),
  openDeckCard: (ctx, ev, emit) => {
    const e = ctx.frei.deck.cards.find((c) => c.cid === ev.cid);
    emit({ type: "frei.use.start", ki: e.doc.ki });
    return F(ctx, { card: e, use: null, vote: null, acted: false });
  },
  takeUse: (ctx, ev) => F(ctx, { use: ev.ok ? "on" : ev.login ? "login" : "off" }),
  fxActed: (ctx, ev, emit) => { if (ctx.frei.card) emit({ type: "frei.use.acted", ki: ctx.frei.card.doc.ki }); return F(ctx, { acted: true }); },
  fxVote: (ctx, ev, emit) => ([1, -1, 0].includes(ev.v) && ctx.frei.card ? (emit({ type: "frei.vote", ki: ctx.frei.card.doc.ki, v: ev.v }), F(ctx, { vote: { v: ev.v, st: "busy" } })) : ctx),
  takeVote: (ctx, ev) => F(ctx, { vote: { v: ctx.frei.vote ? ctx.frei.vote.v : 0, st: ev.st } }),
  openDeckPlay: (ctx) => { const t = targetOf(ctx.frei.card.doc, cardOf); return openTarget(ctx, { ...t, deck: true }); },
  markDeckMissing: (ctx) => F(ctx, { missing: targetOf(ctx.frei.card.doc, cardOf).missing, taken: null }),
  // Meine Karten
  fxMine: (ctx, ev, emit) => { emit({ type: "frei.mine" }); emit({ type: "mod.me" }); return F(ctx, { mine: { load: "busy" } }); },
  takeMine: (ctx, ev) => F(ctx, { mine: ev.r && ev.r.ok ? { load: "ok", ...ev.r } : { load: (ev.r && ev.r.error) || "server" } }),
  // Melden
  openReport: (ctx) => F(ctx, { report: { reason: null, sending: false, sent: null, back: "deck", doc: ctx.frei.card.doc } }),
  openReportCard: (ctx) => F(ctx, { report: { reason: null, sending: false, sent: null, back: "card", doc: cardOf("frei").toFree(paramsOfCard(ctx, "frei")) } }),
  setReason: (ctx, ev) => (["harm", "sex", "hate", "private", "wrong", "other"].includes(ev.reason) && !ctx.frei.report.sent ? F(ctx, { report: { ...ctx.frei.report, reason: ev.reason } }) : ctx),
  fxReport: (ctx, ev, emit) => { emit({ type: "frei.report", doc: ctx.frei.report.doc, reason: ctx.frei.report.reason }); return F(ctx, { report: { ...ctx.frei.report, sending: true } }); },
  takeReported: (ctx, ev) => F(ctx, { report: { ...ctx.frei.report, sending: false, sent: ev.ok ? "ok" : "fail" } }),
  // KI-Bild
  fxBildStatus: (ctx, ev, emit) => { emit({ type: "frei.bild.status" }); return ctx; },
  takeBildStatus: (ctx, ev) => F(ctx, { bild: { ...ctx.frei.bild, st: ev.r && ev.r.ok ? ev.r : null, err: ev.r && !ev.r.ok ? ev.r.error : null } }),
  setBildUse: (ctx, ev) => (["card", "logo", "avatar"].includes(ev.use) ? F(ctx, { bild: { ...ctx.frei.bild, use: ev.use, res: null } }) : ctx),
  setBildStyle: (ctx, ev) => (["foto", "comic", "aquarell", "pixel", "sticker"].includes(ev.style) ? F(ctx, { bild: { ...ctx.frei.bild, style: ev.style } }) : ctx),
  setBildText: (ctx, ev) => F(ctx, { bild: { ...ctx.frei.bild, text: [...String(ev.value || "")].slice(0, 200).join(""), res: null } }),
  bildCrisis: (ctx) => F(ctx, { bild: { ...ctx.frei.bild, res: { how: "crisis" } } }),
  fxBild: (ctx, ev, emit) => { const b = ctx.frei.bild, req = (b.req || 0) + 1; emit({ type: "frei.bild.make", req, input: { use: b.use, text: b.text, style: b.style, lang: ctx.lang } }); return F(ctx, { bild: { ...b, req, phase: "send", place: 0, res: null, kept: false } }); },
  setBildPhase: (ctx, ev) => F(ctx, { bild: { ...ctx.frei.bild, phase: ev.step, place: ev.n || 0 } }),
  takeBild: (ctx, ev) => F(ctx, { bild: { ...ctx.frei.bild, phase: null, res: ev.r } }),
  cancelBild: (ctx, ev, emit) => { emit({ type: "frei.bild.cancel", req: ctx.frei.bild.req }); return F(ctx, { bild: { ...ctx.frei.bild, req: (ctx.frei.bild.req || 0) + 1, phase: null, res: { how: "gone" } } }); },
  fxBildKeep: (ctx, ev, emit) => { const b = ctx.frei.bild; emit({ type: "frei.bild.keep", id: b.res.id, avatar: b.use === "avatar" }); return ctx; },
  takeBildKept: (ctx, ev) => F(ctx, { bild: { ...ctx.frei.bild, kept: ev.ok === true } }),
  // KI-Arten fuer alle Karten: Vorschlaege fuer ein x-model-Feld (Art "line" fuer Text, "meme" fuer Meme-Zeilen)
  openKi: (ctx, ev) => { const c = cardOf(ctx.cardId), fields = modelFields(c.manifest, ev.part); return F(ctx, { ki: { part: ev.part, field: fields[0], fields, opts: [], res: null, req: ctx.frei.ki.req } }); },
  fxKi: (ctx, ev, emit) => {
    if (ctx.frei.ki.receipt) emit({ type: "frei.settle", how: "discard", receipt: ctx.frei.ki.receipt });
    const k = { ...ctx.frei.ki, receipt: "" }, req = (k.req || 0) + 1, p = paramsOfCard(ctx, ctx.cardId), field = ev.field && k.fields.includes(ev.field) ? ev.field : k.field;
    const max = cardOf(ctx.cardId).manifest.params.properties[field].maxLength || 90;
    emit({ type: "frei.ki", req, kind: "line", input: { text: String(p[field] || cardOf(ctx.cardId).manifest.title[ctx.lang] || "").slice(0, 90), style: "druck" }, max });
    return F(ctx, { ki: { ...k, field, req, opts: [], res: { how: "busy" } } });
  },
  takeKi: (ctx, ev) => F(ctx, { ki: { ...ctx.frei.ki, opts: ev.opts || [], res: ev.r, seal: ev.seal || null, receipt: ev.receipt || "" } }),
  applyKi: (ctx, ev, emit) => { const k = ctx.frei.ki; if (k.receipt) emit({ type: "frei.settle", how: "accept", receipt: k.receipt }); const next = { ...paramsOfCard(ctx, ctx.cardId), [k.field]: k.opts[ev.i] }; return { ...F(ctx, { ki: { ...k, opts: [], res: null } }), params: { ...ctx.params, [ctx.cardId]: next } }; },
  cancelKi: (ctx, ev, emit) => { const k = ctx.frei.ki; if (k.receipt) emit({ type: "frei.settle", how: "discard", receipt: k.receipt }); return F(ctx, { ki: { ...k, req: (k.req || 0) + 1, opts: [], res: null, receipt: "" } }); },
  fxKiAsk: (ctx, ev, emit) => { emit({ type: "frei.kiask", kind: ev.kind, input: ev.input, into: ev.into, cardId: ctx.cardId }); return ctx; },
  // Ergebnis eines KI-Knotens in den Entwurf der Karte (F: ctx.draft[into]); abgerechnet wird erst mit KI_SETTLE
  takeKiDone: (ctx, ev) => ({ ...ctx, draft: { ...(ctx.draft || {}), [ev.into]: { r: ev.r || { how: "off" }, option: ev.option === undefined ? null : ev.option, seal: ev.seal || null, receipt: typeof ev.receipt === "string" ? ev.receipt : "" } } }),
  fxKiSettle: (ctx, ev, emit) => { if (typeof ev.receipt === "string" && ev.receipt && (ev.how === "accept" || ev.how === "discard")) emit({ type: "frei.settle", how: ev.how, receipt: ev.receipt }); return ctx; },
  settleFail: (ctx) => F(ctx, { note: "settle-fail" })
};

/** Kontext der freien Karte (zuletzt gewaehlt nur als markierter Vorschlag, nie als stille Auswahl) */
export function freiContext(saved) {
  const l = saved && saved.freiLast && typeof saved.freiLast === "object" ? saved.freiLast : {};
  return {
    frei: { ...freshForm, last: { art: ARTS.includes(l.art) ? l.art : "", genre: GENRES.includes(l.genre) ? l.genre : "" }, req: 0, phase: null, place: 0, missing: null, taken: null, gate: null, share: null,
      deck: { load: null, cards: [], v: -1 }, card: null, use: null, vote: null, acted: false, mine: null,
      report: { reason: null, sending: false, sent: null, back: null, doc: null },
      bild: { use: "card", style: "comic", text: "", st: null, err: null, req: 0, phase: null, place: 0, res: null, kept: false },
      ki: { part: null, field: null, fields: [], opts: [], res: null, req: 0 } }
  };
}

import { freiEffects } from "./effects.js";
/** Das Feature im Format von ADR 0001 (g) (src/app/features.js) */
export const frei = {
  id: "frei",
  states: { frei: freiState },
  shelfOn: FREI_SHELF,
  on: {
    "inhalt.card.view": { GO: CARD_VIEW_ON.GO_FIRST, ROBOT: CARD_VIEW_ON.ROBOT, MELDEN: CARD_VIEW_ON.MELDEN },
    "inhalt.card.customize.bubbles": CUSTOMIZE_ON,
    "inhalt": { LINK: LINK_FIRST },
    // KI-Knoten der Zugkarten ({t:"ai", kind, input, into}, Z1 zug-termin/geschenk-finder): der Host (F) sendet KI_ASK, das
    // Ergebnis kommt als KI_DONE {into, option, seal, receipt}; die Karte uebernimmt -> KI_SETTLE {receipt, how:"accept"|"discard"}
    "inhalt.card": { KI_ASK: { cond: "kiAskOk", actions: ["fxKiAsk"] }, KI_DONE: { cond: "kiDoneOk", actions: ["takeKiDone"] }, KI_SETTLE: { actions: ["fxKiSettle"] } }
  },
  guards: freiGuards,
  actions: freiActions,
  context: freiContext,
  effects: freiEffects
};
