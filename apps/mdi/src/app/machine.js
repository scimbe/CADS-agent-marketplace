// App-Statechart: drei parallele Regionen (KONZEPT §2). Inhalt = was sehe/spiele ich, Raum = mit wem bin ich
// verbunden, Konto = wer bin ich. Regionen sprechen nur ueber Ereignisse (raise), nie ueber fremde Zustaende.
// Alle Sichtbarkeit in der UI wird aus diesem Zustand abgeleitet (gegen A2). Ein Ereignis BACK fuer Zurueck/Escape/
// System-Zurueck; "consumed" meldet dem Host, ob die App es verbraucht hat (Android Predictive Back).
import { createMachine } from "./statechart.js";
import * as G from "./game.js";
import { cardOf, modesOf, validParams } from "../cards/index.js";
import { encode } from "./link.js";
import { paramsForLink } from "../contract/fields.js";

const T = (p) => p; // Lesbarkeit: absolute Zielpfade
const leaveIfLive = (ctx) => (ctx.mode === "live" ? { type: "LEAVE" } : null);

export const chart = {
  type: "parallel",
  states: {
    inhalt: {
      initial: "shelf",
      on: {
        COPIED: { actions: ["markCopied"] },
        SHARE_FAIL: { actions: ["markShareFail"] },
        COPY: { actions: ["copyLink"] },
        COPY_FAIL: { actions: ["markCopyFail"] },
        LINK: [
          { target: T("inhalt.receive.live"), cond: "linkLive", actions: ["takeLink"] },
          { target: T("inhalt.receive.show"), cond: "linkOk", actions: ["takeLink"] },
          { target: T("inhalt.receive.reject"), actions: ["takeLink"] }
        ]
      },
      states: {
        shelf: { on: { OPEN: { target: T("inhalt.card"), cond: "cardExists", actions: ["openCard"] } } },
        card: {
          initial: "view",
          states: {
            view: {
              on: {
                MODE: { actions: ["setMode"] }, SEAT: { actions: ["setSeat"] }, LEVEL: { actions: ["setLevel"] },
                CUSTOMIZE: T("inhalt.card.customize"),
                GO: [
                  { target: T("inhalt.card.share"), cond: "goStaticLink" },
                  { target: T("inhalt.card.lobby"), cond: "goLive", raise: "INVITE" },
                  { target: T("inhalt.card.play"), cond: "goBot", actions: ["startBot"] },
                  { target: T("inhalt.card.play"), cond: "goLocal", actions: ["startLocal"], raise: "SYNC" }
                ],
                BACK: T("inhalt.shelf")
              }
            },
            customize: {
              initial: "bubbles",
              states: {
                bubbles: { on: { BUBBLE: { target: T("inhalt.card.customize.dialog"), cond: "partExists", actions: ["setPart"] }, DONE: T("inhalt.card.view"), BACK: T("inhalt.card.view") } },
                dialog: { on: { PARAM: { actions: ["setParam"] }, CLOSE: T("inhalt.card.customize.bubbles"), BACK: T("inhalt.card.customize.bubbles") } }
              }
            },
            share: { entry: ["makeCardLink", "autoShare"], on: { SHARE: { actions: ["share"] }, SENT: { actions: ["markSent"] }, BACK: T("inhalt.card.view"), DONE: T("inhalt.card.view") } },
            lobby: {
              on: {
                LIVE_UP: [{ target: T("inhalt.card.view"), cond: "isStatic", actions: ["sendShow"] }, { target: T("inhalt.card.play"), actions: ["sendHello"] }],
                LIVE_FAIL: { actions: ["raumFailed"] },
                AGAIN: { actions: ["clearRaumError"], raise: "INVITE" },
                SHARE: { actions: ["shareInvite"] },
                BACK: { target: T("inhalt.card.view"), raise: "LEAVE" }
              }
            },
            play: {
              initial: "hand",
              on: {
                SYNC: [
                  { target: T("inhalt.card.play.error"), cond: "phError" },
                  { target: T("inhalt.card.play.over"), cond: "phOver" },
                  { target: T("inhalt.card.play.send"), cond: "phSend" },
                  { target: T("inhalt.card.play.cover"), cond: "phCover" },
                  { target: T("inhalt.card.play.turn"), cond: "phTurn" },
                  { target: T("inhalt.card.play.wait"), cond: "phWait" }
                ],
                JOIN: { actions: ["onJoin"], raise: "SYNC" },
                START: { actions: ["onStart"], raise: "SYNC" },
                PEER_IN: { actions: ["onPeerIn"], raise: "SYNC" },
                LIVE_DOWN: { actions: ["peerGone"], raise: "SYNC" },
                FAIL: { actions: ["setError"], raise: "SYNC" },
                BACK: { target: T("inhalt.card.view"), actions: ["endGame"], raise: leaveIfLive }
              },
              states: {
                hand: {},
                turn: { on: { INPUT: { actions: ["onInput"], raise: "SYNC" } } },
                cover: { on: { COVER_OK: { actions: ["flipViewer"], raise: "SYNC" } } },
                send: { entry: ["makeChallenge", "autoShare"], on: { SHARE: { actions: ["share"] }, SENT: { actions: ["markSent"], raise: "SYNC" } } },
                wait: {},
                over: {
                  entry: ["makeChallengeIfPending"],
                  on: { SHARE: { actions: ["share"] }, SENT: { actions: ["markSent"] }, AGAIN: { target: T("inhalt.card.view"), actions: ["endGame"], raise: leaveIfLive } }
                },
                error: {}
              }
            }
          }
        },
        receive: {
          initial: "show",
          on: { BACK: { target: T("inhalt.shelf"), actions: ["dropIncoming"], raise: (ctx) => (ctx.incoming && ctx.incoming.kind === "live" ? { type: "LEAVE" } : null) } },
          states: {
            show: {
              on: {
                ACCEPT: [
                  { target: T("inhalt.card.view"), cond: "inCard", actions: ["acceptCard"] },
                  { target: T("inhalt.card.play"), cond: "inChallenge", actions: ["acceptChallenge"], raise: "SYNC" }
                ]
              }
            },
            reject: { on: { DONE: { target: T("inhalt.shelf"), actions: ["dropIncoming"] } } },
            live: { on: { ACCEPT: { target: T("inhalt.receive.wait"), raise: (ctx) => ({ type: "JOIN_LIVE", token: ctx.incoming.token }) } } },
            wait: {
              on: {
                HELLO: [{ target: T("inhalt.card.play"), cond: "helloOk", actions: ["onHello"] }, { target: T("inhalt.receive.reject"), actions: ["helloBad"], raise: "LEAVE" }],
                SHOW: [{ target: T("inhalt.receive.show"), cond: "showOk", actions: ["takeShow"] }, { target: T("inhalt.receive.reject"), actions: ["helloBad"], raise: "LEAVE" }],
                LIVE_FAIL: { target: T("inhalt.receive.reject"), actions: ["liveFailed"] }
              }
            }
          }
        }
      }
    },
    raum: {
      initial: "allein",
      states: {
        allein: { on: { INVITE: { target: T("raum.einladen"), cond: "raumErlaubt", actions: ["fxInvite"] }, JOIN_LIVE: { target: T("raum.beitreten"), cond: "raumErlaubt", actions: ["fxAccept"] } } },
        einladen: { on: { LIVE_TOKEN: { actions: ["setToken"] }, LIVE_STEP: { actions: ["setStep"] }, LIVE_UP: T("raum.verbunden"), LIVE_FAIL: { target: T("raum.getrennt"), actions: ["setRaumError"] }, LEAVE: { target: T("raum.allein"), actions: ["fxClose"] } } },
        beitreten: { on: { LIVE_STEP: { actions: ["setStep"] }, LIVE_UP: T("raum.verbunden"), LIVE_FAIL: { target: T("raum.getrennt"), actions: ["setRaumError"] }, LEAVE: { target: T("raum.allein"), actions: ["fxClose"] } } },
        verbunden: { on: { LIVE_DOWN: T("raum.getrennt"), LEAVE: { target: T("raum.allein"), actions: ["fxClose"] } } },
        getrennt: { on: { LEAVE: { target: T("raum.allein"), actions: ["fxClose"] }, INVITE: { target: T("raum.einladen"), cond: "raumErlaubt", actions: ["fxClose", "fxInvite"] } } }
      }
    },
    konto: {
      initial: "anonym",
      states: { anonym: { on: { KONTO_IN: T("konto.angemeldet") } }, angemeldet: { on: { KONTO_OUT: T("konto.anonym") } } }
    }
  }
};

function memo(ev, k, f) { if (!(k in ev)) ev[k] = f(); return ev[k]; }
function linkResult(ev) { return memo(ev, "_r", () => G.receive(ev.hash, ev.stored || null, ev.rand || [])); }
function helloResult(ctx, ev) { return memo(ev, "_h", () => { try { return G.joinFor(ctx, ev.msg, ev.rand); } catch (e) { return { error: e.code || "zug-ungueltig" }; } }); }
function guard(fn) { return (ctx, ev) => { try { return fn(ctx, ev); } catch (e) { return false; } }; }
function safe(ctx, f) { try { return f(); } catch (e) { return { ...ctx, error: e.code || "zug-ungueltig" }; } }

export const guards = {
  cardExists: (ctx, ev) => !!cardOf(ev.id),
  partExists: (ctx, ev) => G.card(ctx).manifest.parts.some((p) => p.id === ev.part),
  goStaticLink: (ctx) => G.card(ctx).manifest.mode === "static" && ctx.mode === "link",
  goLive: (ctx) => ctx.mode === "live",
  goBot: (ctx) => ctx.mode === "bot" && G.card(ctx).manifest.mode !== "static",
  goLocal: (ctx) => (ctx.mode === "alone" || ctx.mode === "link") && G.card(ctx).manifest.mode !== "static",
  isStatic: (ctx) => G.card(ctx).manifest.mode === "static",
  phError: guard((ctx) => G.phase(ctx) === "error"),
  phOver: guard((ctx) => G.phase(ctx) === "over"),
  phSend: guard((ctx) => G.phase(ctx) === "send"),
  phCover: guard((ctx) => G.phase(ctx) === "cover"),
  phTurn: guard((ctx) => G.phase(ctx) === "turn"),
  phWait: guard((ctx) => G.phase(ctx) === "wait"),
  linkLive: (ctx, ev) => { const r = linkResult(ev); return r.ok && r.kind === "live"; },
  linkOk: (ctx, ev) => linkResult(ev).ok,
  inCard: (ctx) => !!ctx.incoming && ctx.incoming.kind === "card",
  inChallenge: (ctx) => !!ctx.incoming && ctx.incoming.kind === "challenge",
  helloOk: (ctx, ev) => !helloResult(ctx, ev).error,
  showOk: (ctx, ev) => !!cardOf(ev.msg.c) && cardOf(ev.msg.c).manifest.mode === "static" && validParams(ev.msg.c, ev.msg.p),
  // Entscheidung 2026-11-11: Raum nur mit Anmeldung. D0 hat noch kein Konto (S8); der Live-Datenkanal der Bruecke
  // (/api/play) ist kontofrei. Deshalb steht die Pruefung hier, ist aber per raumBrauchtKonto=false abgeschaltet.
  raumErlaubt: (ctx, ev, inState) => !ctx.raumBrauchtKonto || inState("konto.angemeldet")
};

export const actions = {
  openCard: (ctx, ev) => ({ ...ctx, cardId: ev.id, mode: modesOf(cardOf(ev.id))[0], seat: 0, session: null, hs: null, error: null, note: null, link: null, part: null }),
  setMode: (ctx, ev) => (modesOf(G.card(ctx)).includes(ev.mode) ? { ...ctx, mode: ev.mode, note: null } : ctx),
  setSeat: (ctx, ev) => (Number.isInteger(ev.seat) && ev.seat >= 0 && ev.seat < G.card(ctx).manifest.players.max ? { ...ctx, seat: ev.seat } : ctx),
  setLevel: (ctx, ev) => ([1, 2, 3].includes(ev.level) ? { ...ctx, level: ev.level } : ctx),
  setPart: (ctx, ev) => ({ ...ctx, part: ev.part }),
  setParam: (ctx, ev) => {
    const c = G.card(ctx), part = c.manifest.parts.find((p) => p.id === ctx.part);
    if (!part || !part.params.includes(ev.key)) return ctx;
    const next = { ...G.paramsOf(ctx), [ev.key]: ev.value };
    if (!validParams(ctx.cardId, next)) return { ...ctx, paramError: ev.key };
    return { ...ctx, params: { ...ctx.params, [ctx.cardId]: next }, paramError: null };
  },
  makeCardLink: (ctx) => {
    const c = G.card(ctx);
    try { return { ...ctx, link: encode("card", { c: c.manifest.id, v: c.manifest.version, p: paramsForLink(c.manifest.params, G.paramsOf(ctx)) }), linkError: null, sent: false }; }
    catch (e) { return { ...ctx, link: null, linkError: e.code || "zu-lang" }; }
  },
  share: (ctx, ev, emit) => { if (ctx.link) emit({ type: "share", fragment: ctx.link }); return ctx; },
  // Teilen sofort beim Eintritt (der Tipp auf Senden ist die Nutzergeste fuer das Systemblatt): ein Tipp weniger
  autoShare: (ctx, ev, emit) => { if (ctx.link) emit({ type: "share", fragment: ctx.link }); return { ...ctx, copied: false, shareFailed: false, copyFailed: false }; },
  markCopied: (ctx) => ({ ...ctx, copied: true, shareFailed: false }),
  markShareFail: (ctx) => ({ ...ctx, shareFailed: true }),
  copyLink: (ctx, ev, emit) => { const f = ctx.link || (ctx.raum && ctx.raum.inviteLink); if (f) emit({ type: "copy", fragment: f }); return ctx; },
  markCopyFail: (ctx) => ({ ...ctx, copyFailed: true }),
  shareInvite: (ctx, ev, emit) => { if (ctx.raum && ctx.raum.inviteLink) emit({ type: "share", fragment: ctx.raum.inviteLink }); return ctx; },
  markSent: (ctx) => ({ ...ctx, sent: true }),
  startLocal: (ctx, ev, emit) => safe(ctx, () => {
    const n = G.startLocal(ctx, ev.rand);
    if (n.mode === "link") { const seat = n.session.mine[0]; emit({ type: "store", entry: { g: n.gameId, seat, salt: n.session.secrets[seat] } }); }
    return n;
  }),
  startBot: (ctx, ev, emit) => safe(ctx, () => {
    const r = G.helloFor(ctx, ev.rand);
    emit({ type: "bot.new", seat: 1 - ctx.seat, level: ctx.level || 2 });
    emit({ type: "peer", msg: r.msg });
    return r.ctx;
  }),
  sendHello: (ctx, ev, emit) => safe(ctx, () => { const r = G.helloFor(ctx, ev.rand); emit({ type: "peer", msg: r.msg }); return r.ctx; }),
  sendShow: (ctx, ev, emit) => { const c = G.card(ctx); emit({ type: "peer", msg: { t: "show", c: c.manifest.id, v: c.manifest.version, p: G.paramsOf(ctx) } }); return { ...ctx, note: "gezeigt" }; },
  onJoin: (ctx, ev, emit) => {
    if (!ctx.hs || ctx.session) return { ...ctx, error: "abweichung" };
    return safe(ctx, () => { const r = G.startFor(ctx, ev.msg); emit({ type: "peer", msg: r.msg }); return r.ctx; });
  },
  onStart: (ctx, ev) => (!ctx.hs || ctx.session ? { ...ctx, error: "abweichung" } : safe(ctx, () => G.beginFor(ctx, ev.msg))),
  onPeerIn: (ctx, ev, emit) => {
    if (!ctx.session) return { ...ctx, error: "abweichung" };
    return safe(ctx, () => { const r = G.applyPeer(ctx, ev.msg); for (const m of r.out) emit({ type: "peer", msg: m }); return r.ctx; });
  },
  onInput: (ctx, ev, emit) => safe(ctx, () => {
    const r = G.applyMine(ctx, ev.input);
    if (ctx.mode === "bot" || ctx.mode === "live") for (const m of r.out) emit({ type: "peer", msg: m });
    return r.ctx;
  }),
  flipViewer: (ctx) => ({ ...ctx, viewer: G.gameStatus(ctx).turn }),
  makeChallenge: (ctx) => { try { return { ...ctx, link: encode("challenge", G.challengeOf(ctx)) }; } catch (e) { return { ...ctx, link: null, error: e.code || "zu-lang" }; } },
  makeChallengeIfPending: (ctx) => {
    if (ctx.mode !== "link" || ctx.sent) return ctx;
    const log = ctx.session.log; if (!log.length || !ctx.session.mine.includes(log[log.length - 1].seat)) return { ...ctx, link: null };
    try { return { ...ctx, link: encode("challenge", G.challengeOf(ctx)) }; } catch (e) { return { ...ctx, link: null }; }
  },
  endGame: (ctx) => ({ ...ctx, session: null, hs: null, error: null, link: null, sent: false }),
  peerGone: (ctx) => (ctx.session && G.gameStatus(ctx).over ? ctx : { ...ctx, error: "partner-weg" }),
  setError: (ctx, ev) => ({ ...ctx, error: ev.reason || "zug-ungueltig" }),
  takeLink: (ctx, ev, emit) => {
    const r = linkResult(ev);
    emit({ type: "url.clear" });
    if (r.ok && r.store) emit({ type: "store", entry: r.store });
    return { ...ctx, incoming: r.ok ? r : null, reason: r.ok ? null : r.reason };
  },
  dropIncoming: (ctx) => ({ ...ctx, incoming: null, reason: null }),
  acceptCard: (ctx) => ({ ...ctx, cardId: ctx.incoming.cardId, params: { ...ctx.params, [ctx.incoming.cardId]: ctx.incoming.params }, mode: "link", seat: 0, session: null, note: "empfangen", incoming: null }),
  acceptChallenge: (ctx) => {
    const inc = ctx.incoming, seat = inc.session.mine.length ? inc.session.mine[0] : 0;
    return { ...ctx, cardId: inc.cardId, params: { ...ctx.params, [inc.cardId]: inc.params }, mode: "link", session: inc.session, gameId: inc.gameId, sent: false, error: null, viewer: seat, seat, incoming: null, link: null };
  },
  onHello: (ctx, ev, emit) => { const r = helloResult(ctx, ev); emit({ type: "peer", msg: r.msg }); return { ...r.ctx, mode: "live", incoming: null }; },
  helloBad: (ctx, ev) => ({ ...ctx, reason: (ev._h && ev._h.error) || "karte-unbekannt" }),
  takeShow: (ctx, ev) => ({ ...ctx, incoming: { ok: true, kind: "card", cardId: ev.msg.c, params: ev.msg.p } }),
  liveFailed: (ctx, ev) => ({ ...ctx, reason: "verbindung", raum: { ...(ctx.raum || {}), error: ev.reason || "verbindung" } }),
  raumFailed: (ctx, ev) => ({ ...ctx, raum: { ...(ctx.raum || {}), error: ev.reason || "verbindung" } }),
  clearRaumError: (ctx) => ({ ...ctx, raum: { ...(ctx.raum || {}), error: null } }),
  fxInvite: (ctx, ev, emit) => { emit({ type: "live.invite" }); return { ...ctx, raum: { token: null, inviteLink: null, step: null, error: null } }; },
  fxAccept: (ctx, ev, emit) => { emit({ type: "live.accept", token: ev.token }); return { ...ctx, raum: { token: ev.token, step: null, error: null } }; },
  fxClose: (ctx, ev, emit) => { emit({ type: "live.close" }); return { ...ctx, raum: null }; },
  setToken: (ctx, ev) => { try { return { ...ctx, raum: { ...ctx.raum, token: ev.token, inviteLink: encode("live", { t: ev.token }) } }; } catch (e) { return ctx; } },
  setStep: (ctx, ev) => ({ ...ctx, raum: { ...(ctx.raum || {}), step: ev.step } }),
  setRaumError: (ctx, ev) => ({ ...ctx, raum: { ...(ctx.raum || {}), error: ev.reason || "verbindung" } })
};

export const machine = createMachine(chart, { guards, actions });

export function initialContext(lang) {
  return { lang, cardId: null, params: {}, mode: null, seat: 0, level: 2, part: null, session: null, hs: null, error: null, incoming: null, reason: null, link: null, raum: null, note: null, raumBrauchtKonto: false };
}
