// App-Statechart: drei parallele Regionen (KONZEPT §2). Inhalt = was sehe/spiele ich, Raum = mit wem bin ich
// verbunden, Konto = wer bin ich. Regionen sprechen nur ueber Ereignisse (raise), nie ueber fremde Zustaende.
// Alle Sichtbarkeit in der UI wird aus diesem Zustand abgeleitet (gegen A2). Ein Ereignis BACK fuer Zurueck/Escape/
// System-Zurueck; "consumed" meldet dem Host, ob die App es verbraucht hat (Android Predictive Back).
import { createMachine } from "./statechart.js";
import * as G from "./game.js";
import * as S from "../contract/session.js";
import { cardOf, modesOf, validParams } from "../cards/index.js";
import { encode } from "./link.js";
import { sha256 } from "../contract/sdk.js";
import { paramsForLink, defaults } from "../contract/fields.js";
import { kontoRegion, stilState, kontoGuards, kontoActions, kontoContext } from "./konto-chart.js";
import { FEATURES } from "./features.js";
import { playOf } from "../contract/modes.js";

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
        // Entwurf ist reine Anzeige (auch im Ende und beim Empfang, Anfrage P); Merkzettel je Partie (Anfrage Z1)
        DRAFT: { actions: ["setDraft"] },
        // Nachladen der Karten (ADR 0001 Nachtrag 2): Ladeanzeige und ehrliche Meldung mit Wiederholen
        LOADING: { actions: ["setLoading"] },
        PART_FAIL: { target: T("inhalt.partfail"), actions: ["setPartFail"], raise: "LEAVE" },
        MEMO: { actions: ["setMemo"] },
        // Ein neuer Link ersetzt Lobby/Live-Partie ausdruecklich: laufender Raum wird geschlossen (Review M2)
        LINK: [
          { target: T("inhalt.receive.live"), cond: "linkLive", actions: ["takeLink"], raise: "LEAVE" },
          { target: T("inhalt.receive.show"), cond: "linkOk", actions: ["takeLink"], raise: "LEAVE" },
          { target: T("inhalt.receive.reject"), actions: ["takeLink"], raise: "LEAVE" }
        ]
      },
      states: {
        partfail: { on: { RETRY: { target: T("inhalt.shelf"), actions: ["retryPart"] }, BACK: { target: T("inhalt.shelf"), actions: ["clearPartFail"] }, DONE: { target: T("inhalt.shelf"), actions: ["clearPartFail"] } } },
        shelf: { on: { OPEN: { target: T("inhalt.card"), cond: "cardExists", actions: ["openCard"] }, STIL: T("inhalt.stil") } },
        stil: stilState,
        card: {
          initial: "view",
          states: {
            view: {
              on: {
                MODE: { actions: ["setMode"] }, SEAT: { actions: ["setSeat"] }, LEVEL: { actions: ["setLevel"] },
                CUSTOMIZE: T("inhalt.card.customize"),
                GO: [
                  { target: T("inhalt.card.rt"), cond: "goRt", actions: ["startRt"] },
                  { target: T("inhalt.card.share"), cond: "goStaticLink" },
                  { target: T("inhalt.card.lobby"), cond: "goLive", raise: "INVITE" },
                  { target: T("inhalt.card.play"), cond: "goBot", actions: ["startBot"], raise: "SYNC" },
                  { target: T("inhalt.card.play"), cond: "goLocal", actions: ["startLocal"], raise: "SYNC" }
                ],
                BACK: { target: T("inhalt.shelf"), raise: "LEAVE" } // zum Regal: offener Raum (z. B. nach Live-Zeigen) schliesst
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
                LIVE_UP: [
                  { target: T("inhalt.card.view"), cond: "isStatic", actions: ["sendShow"] },
                  // Gruppe (3+ Sitze): erst wenn alle Gaeste verbunden sind, geht hello an jeden (ADR 0001 f, Stufe 2)
                  { target: T("inhalt.card.play"), cond: "groupReady", actions: ["markUp", "sendHello"] },
                  { cond: "isGroup", actions: ["markUp"] },
                  { target: T("inhalt.card.play"), actions: ["sendHello"] }
                ],
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
                  { target: T("inhalt.card.play.vacant"), cond: "phVacant" },
                  { target: T("inhalt.card.rt"), cond: "rtHandshakeDone", actions: ["startRt"] },
                  { target: T("inhalt.card.play.over"), cond: "phOver" },
                  { target: T("inhalt.card.play.send"), cond: "phSend" },
                  { target: T("inhalt.card.play.cover"), cond: "phCover" },
                  { target: T("inhalt.card.play.turn"), cond: "phTurn" },
                  { target: T("inhalt.card.play.wait"), cond: "phWait" }
                ],
                JOIN: { actions: ["onJoin"], raise: "SYNC" },
                BOT_IN: { actions: ["onBotLocal"], raise: "SYNC" },
                // Aktionen aus Widgets (ADR 0001 c): weiter zu Karte, KI (Feature K), 18+, Kopieren, Datei
                ACT: [
                  { target: T("inhalt.card.view"), cond: "actOpen", actions: ["endGame", "openFromAct"], raise: leaveIfLive },
                  { cond: "actAi", raise: (ctx, ev) => ({ type: "KI_ASK", kind: ev.kind, input: ev.input, into: ev.into }) },
                  { cond: "actAge18", raise: { type: "AGE18", on: true } },
                  { actions: ["actEffect"] }
                ],
                START: { actions: ["onStart"], raise: "SYNC" },
                PEER_IN: { actions: ["onPeerIn"], raise: "SYNC" },
                // Gruppe (ADR 0001 Nachtrag 3): faellt ein Gast weg, faellt die Partie aus und sein Platz wird frei (Altcode
                // table.js); der Gastgeber besetzt ihn neu, dann beginnt eine neue Partie. Faellt der Gastgeber weg: Ende.
                LIVE_DOWN: [{ cond: "groupGuestDown", actions: ["groupVacant"], raise: "SYNC" }, { actions: ["peerGone"], raise: "SYNC" }],
                PEER_VOID: { cond: "isGroupGuest", actions: ["groupVoid"], raise: "SYNC" },
                HELLO: { cond: "groupRehello", actions: ["onHello"], raise: "SYNC" },
                LIVE_TOKEN: { cond: "groupHostVacant", actions: ["setToken"] },
                LIVE_UP: { cond: "groupHostVacant", actions: ["markUp", "reseatIfFull"], raise: "SYNC" },
                // Auto-Zug im Live (Anfrage T): nach AUTO_MS ohne eigene Eingabe spielt das Geraet card.auto(obs, seat)
                AUTO_MOVE: { cond: "autoDue", actions: ["onAutoMove"], raise: "SYNC" },
                FAIL: { actions: ["setError"], raise: "SYNC" },
                BACK: { target: T("inhalt.card.view"), actions: ["endGame"], raise: leaveIfLive }
              },
              states: {
                hand: {},
                turn: { entry: ["armAuto"], exit: ["disarmAuto"], on: { INPUT: { actions: ["onInput"], raise: "SYNC" }, PREPARE: { actions: ["onPrepare"], raise: "SYNC" } } },
                cover: { on: { COVER_OK: { actions: ["flipViewer"], raise: "SYNC" } } },
                send: { entry: ["makeChallenge", "autoShare"], on: { SHARE: { actions: ["share"] }, SENT: { actions: ["markSent"], raise: "SYNC" } } },
                wait: {},
                over: {
                  entry: ["makeChallengeIfPending"],
                  on: { SHARE: { actions: ["share"] }, SENT: { actions: ["markSent"] }, AGAIN: { target: T("inhalt.card.view"), actions: ["endGame"], raise: leaveIfLive } }
                },
                vacant: { on: { REINVITE: { actions: ["reinvite"] }, SHARE: { actions: ["shareInvite"] } } },
                error: {}
              }
            },
            // Echtzeitkarten (ADR 0001 b): die Bildschleife liegt in der Laufzeit (src/app/rt/session.js), hier nur Uebergaenge
            rt: {
              initial: "ready",
              on: {
                RT: [
                  { target: T("inhalt.card.rt.run"), cond: "rtIs:go" },
                  { target: T("inhalt.card.rt.run"), cond: "rtIs:resume" },
                  { target: T("inhalt.card.rt.run"), cond: "rtIs:flow" },
                  { target: T("inhalt.card.rt.pause"), cond: "rtIs:pause" },
                  { target: T("inhalt.card.rt.wait"), cond: "rtIs:stall" },
                  { target: T("inhalt.card.rt.over"), cond: "rtIs:over", actions: ["rtTakeResult"] },
                  { target: T("inhalt.card.rt.error"), actions: ["rtTakeError"] }
                ],
                LIVE_DOWN: { target: T("inhalt.card.rt.error"), cond: "rtRunning", actions: ["rtPeerGone"] },
                PEER_AGAIN: [{ target: T("inhalt.card.rt"), cond: "rtAgainMine", actions: ["rtRestartLive"] }, { actions: ["rtMarkPeerAgain"] }],
                BACK: { target: T("inhalt.card.view"), actions: ["stopRt", "endGame"], raise: leaveIfLive }
              },
              states: {
                ready: {},
                run: { on: { PAUSE: { actions: ["rtPause"] } } },
                pause: { on: { RESUME: { actions: ["rtResume"] }, PAUSE: { actions: ["rtResume"] } } },
                wait: {},
                over: {
                  entry: ["makeGhostLink"],
                  on: {
                    SHARE: { actions: ["share"] }, SENT: { actions: ["markSent"] },
                    AGAIN: [
                      { target: T("inhalt.card.rt"), cond: "rtAgainLocal", actions: ["startRt"] },
                      { target: T("inhalt.card.rt"), cond: "rtAgainPeer", actions: ["rtRestartLive"] },
                      { cond: "rtLive", actions: ["rtMarkMyAgain"] }
                    ]
                  }
                },
                error: {}
              }
            }
          }
        },
        receive: {
          initial: "show",
          on: { BACK: { target: T("inhalt.shelf"), actions: ["dropIncoming"], raise: "LEAVE" } },
          states: {
            show: {
              on: {
                ACCEPT: [
                  { target: T("inhalt.card.rt"), cond: "inGhost", actions: ["acceptGhost"] },
                  { target: T("inhalt.card.view"), cond: "inCard", actions: ["acceptCard"] },
                  { target: T("inhalt.card.play"), cond: "inChallenge", actions: ["acceptChallenge"], raise: "SYNC" }
                ]
              }
            },
            reject: { on: { DONE: { target: T("inhalt.shelf"), actions: ["dropIncoming"], raise: "LEAVE" } } },
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
        verbunden: { on: { LIVE_DOWN: [{ cond: "groupGuestDown" }, { target: T("raum.getrennt") }], LIVE_TOKEN: { cond: "groupHostVacant", actions: ["setToken"] }, LEAVE: { target: T("raum.allein"), actions: ["fxClose"] } } },
        getrennt: { on: { LEAVE: { target: T("raum.allein"), actions: ["fxClose"] }, INVITE: { target: T("raum.einladen"), cond: "raumErlaubt", actions: ["fxClose", "fxInvite"] }, JOIN_LIVE: { target: T("raum.beitreten"), cond: "raumErlaubt", actions: ["fxClose", "fxAccept"] } } }
      }
    },
    konto: kontoRegion
  }
};

function memo(ev, k, f) { if (!(k in ev)) ev[k] = f(); return ev[k]; }
function linkResult(ev) { return memo(ev, "_r", () => G.receive(ev.hash, ev.stored || null, ev.rand || [])); }
function helloResult(ctx, ev) { return memo(ev, "_h", () => { try { return G.joinFor(ctx, ev.msg, ev.rand); } catch (e) { return { error: e.code || "zug-ungueltig" }; } }); }
function guard(fn) { return (ctx, ev) => { try { return fn(ctx, ev); } catch (e) { return false; } }; }
function safe(ctx, f) { try { return f(); } catch (e) { return { ...ctx, error: e.code || "zug-ungueltig" }; } }

function variantParams(ctx, ev) {
  if (!ev.variant) return {};
  const c = cardOf(ev.id), v = c && (c.manifest.variants || []).find((x) => x.id === ev.variant);
  if (!v) return {};
  const p = { ...defaults(c.manifest.params), ...v.params };
  return validParams(ev.id, p) ? { params: { ...ctx.params, [ev.id]: p } } : {};
}

export const AUTO_MS = 20000;

export const guards = {
  cardExists: (ctx, ev) => !!cardOf(ev.id),
  partExists: (ctx, ev) => G.card(ctx).manifest.parts.some((p) => p.id === ev.part),
  goStaticLink: (ctx) => G.card(ctx).manifest.mode === "static" && ctx.mode === "link",
  goLive: (ctx) => ctx.mode === "live",
  goRt: (ctx) => G.card(ctx).manifest.mode === "realtime" && ["alone", "bot"].includes(ctx.mode),
  goBot: (ctx) => ctx.mode === "bot" && G.card(ctx).manifest.mode === "turn",
  goLocal: (ctx) => (ctx.mode === "alone" || ctx.mode === "link") && G.card(ctx).manifest.mode === "turn",
  isGroup: (ctx) => G.card(ctx).manifest.players.max > 2,
  phVacant: (ctx) => Array.isArray(ctx.vacant) && ctx.vacant.length > 0,
  groupGuestDown: (ctx, ev) => !!ctx.groupHost && ev.seat !== undefined,
  isGroupGuest: (ctx) => !ctx.groupHost && ctx.mode === "live" && !!ctx.cardId && G.card(ctx).manifest.players.max > 2,
  groupRehello: (ctx, ev) => !ctx.groupHost && ctx.mode === "live" && !ctx.session && !!ctx.awaitHello && !helloResult(ctx, ev).error,
  groupHostVacant: (ctx, ev) => !!ctx.groupHost && Array.isArray(ctx.vacant) && ctx.vacant.includes(ev.seat),
  autoDue: (ctx, ev) => !!ctx.session && ctx.mode === "live" && ctx.session.log.length === ev.n && typeof G.card(ctx).auto === "function" && G.phase(ctx) === "turn",
  groupReady: (ctx, ev) => {
    const c = G.card(ctx); if (c.manifest.players.max <= 2) return false;
    const up = new Set([...((ctx.raum && ctx.raum.up) || []), ev.seat]);
    for (let s = 0; s < c.manifest.players.max; s++) if (s !== ctx.seat && !up.has(s)) return false;
    return true;
  },
  rtHandshakeDone: (ctx) => !!ctx.session && !ctx.error && G.card(ctx).manifest.mode === "realtime",
  rtRunning: (ctx) => ctx.mode === "live" && !ctx.rtResult,
  rtLive: (ctx) => ctx.mode === "live",
  rtAgainLocal: (ctx) => ctx.mode === "alone" || ctx.mode === "bot",
  rtAgainPeer: (ctx) => ctx.mode === "live" && ctx.rtAgain === "peer",
  rtAgainMine: (ctx) => ctx.mode === "live" && ctx.rtAgain === "mine",
  actOpen: (ctx, ev) => ev.act === "open" && !!cardOf(ev.card),
  actAi: (ctx, ev) => ev.act === "ai",
  actAge18: (ctx, ev) => ev.act === "age18",
  inGhost: (ctx) => !!ctx.incoming && ctx.incoming.kind === "ghost",
  ...Object.fromEntries(["go", "resume", "flow", "pause", "stall", "over"].map((k) => ["rtIs:" + k, (ctx, ev) => ev.kind === k])),
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
  showOk: (ctx, ev) => !!cardOf(ev.msg.c) && cardOf(ev.msg.c).manifest.mode !== "turn" && validParams(ev.msg.c, ev.msg.p),
  // Entscheidung 2026-11-11: Raum nur mit Anmeldung. D0 hat noch kein Konto (S8); der Live-Datenkanal der Bruecke
  // (/api/play) ist kontofrei. Deshalb steht die Pruefung hier, ist aber per raumBrauchtKonto=false abgeschaltet.
  raumErlaubt: (ctx, ev, inState) => !ctx.raumBrauchtKonto || inState("konto.angemeldet"),
  ...kontoGuards
};

export const actions = {
  // OPEN {id, variant?}: eine Variante bringt ihre Parameter mit (Regal ueber LEGACY/VARIANTS, Anfrage H)
  openCard: (ctx, ev) => ({ ...ctx, loading: null, draft: null, memo: null, ...variantParams(ctx, ev), cardId: ev.id, variant: ev.variant || null, mode: playOf(cardOf(ev.id), ev.variant).default, seat: 0, session: null, hs: null, error: null, note: null, link: null, part: null }),
  setMode: (ctx, ev) => (modesOf(G.card(ctx), ctx.variant).includes(ev.mode) ? { ...ctx, mode: ev.mode, note: null } : ctx),
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
  makeCardLink: (ctx, ev) => {
    const c = G.card(ctx);
    // card.stamp friert tagesabhaengige Werte vor dem Senden ein (Adventstuer: Nummer aus dem Datum, Anfrage P)
    if (typeof c.stamp === "function") ctx = { ...ctx, params: { ...ctx.params, [ctx.cardId]: c.stamp(G.paramsOf(ctx), { today: G.todayOf(ev.at), nick: G.viewCtx(ctx).nick }) } };
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
  shareInvite: (ctx, ev, emit) => {
    // freier Platz (Gruppe): den Link genau dieses Platzes teilen
    const v = Array.isArray(ctx.vacant) && ctx.vacant.length && ctx.raum && ctx.raum.invites ? ctx.raum.invites[ctx.vacant[0]] : null;
    const f = v || (ctx.raum && ctx.raum.inviteLink);
    if (f) emit({ type: "share", fragment: f });
    return ctx;
  },
  markSent: (ctx) => ({ ...ctx, sent: true }),
  startLocal: (ctx, ev, emit) => safe(ctx, () => {
    const n = G.startLocal(ctx, ev.rand);
    if (n.mode === "link") emit({ type: "store", entry: G.gameEntry(n.session, n.gameId) });
    return n;
  }),
  startBot: (ctx, ev, emit) => safe(ctx, () => {
    const n = G.card(ctx).manifest.players.max;
    if (n > 2) { // n-1 Bots auf diesem Geraet (ADR 0001 f)
      const next = G.startBotsLocal({ ...ctx, level: ctx.level || 2 }, ev.rand);
      if (G.botTurn(next) !== null) emit({ type: "bot.local", seat: G.botTurn(next), level: next.level || 2 });
      return next;
    }
    const r = G.helloFor(ctx, ev.rand);
    if (n !== 2) throw Object.assign(new Error("bot"), { code: "eingabe" }); // Bot ist ein Partner (2 Sitze)
    emit({ type: "bot.new", seat: [0, 1].find((s) => s !== ctx.seat), level: ctx.level || 2, today: G.todayOf(ev.at) });
    emit({ type: "peer", msg: r.msg });
    return r.ctx;
  }),
  sendHello: (ctx, ev, emit) => safe(ctx, () => {
    if (G.card(ctx).manifest.players.max > 2) { const r = G.helloGroupFor(ctx, ev.rand); for (const m of r.msgs) emit({ type: "peer", to: m.to, msg: m.msg }); return r.ctx; }
    const r = G.helloFor(ctx, ev.rand); emit({ type: "peer", msg: r.msg }); return r.ctx;
  }),
  groupVacant: (ctx, ev, emit) => {
    // Partie faellt aus; uebrige Gaeste erfahren es, der Platz ist frei
    emit({ type: "peer", msg: { t: "void", q: ev.seat }, except: ev.seat });
    emit({ type: "live.drop", seat: ev.seat });
    const invites = { ...((ctx.raum && ctx.raum.invites) || {}) }; delete invites[ev.seat];
    return { ...ctx, session: null, hs: null, draft: null, vacant: [...new Set([...(ctx.vacant || []), ev.seat])], raum: { ...(ctx.raum || {}), invites, up: ((ctx.raum && ctx.raum.up) || []).filter((s) => s !== ev.seat) }, note: "platz-frei" };
  },
  groupVoid: (ctx) => ({ ...ctx, session: null, hs: null, draft: null, awaitHello: true, note: "partie-faellt-aus" }),
  reinvite: (ctx, ev, emit) => { emit({ type: "live.invite", seats: ctx.vacant.slice(), add: true }); return ctx; },
  reseatIfFull: (ctx, ev, emit) => {
    const vacant = (ctx.vacant || []).filter((s) => s !== ev.seat);
    if (vacant.length) return { ...ctx, vacant };
    // alle Plaetze wieder besetzt: neue Partie mit neuem Gruppen-Handshake (neuer Seed, neue Commitments)
    const r = G.helloGroupFor({ ...ctx, vacant: [] }, ev.rand);
    for (const m of r.msgs) emit({ type: "peer", to: m.to, msg: m.msg });
    return { ...r.ctx, vacant: [], note: "neue-partie" };
  },
  armAuto: (ctx, ev, emit) => { if (ctx.mode === "live" && ctx.session && typeof G.card(ctx).auto === "function") emit({ type: "timer.start", id: "auto", ms: AUTO_MS, ev: { type: "AUTO_MOVE", n: ctx.session.log.length } }); return ctx; },
  disarmAuto: (ctx, ev, emit) => { emit({ type: "timer.cancel", id: "auto" }); return ctx; },
  onAutoMove: (ctx, ev, emit) => safe(ctx, () => {
    const c = G.card(ctx), seat = ctx.viewer, input = c.auto(S.observe(c, ctx.session, seat), seat);
    return { ...actions.onInput(ctx, { ...ev, input }, emit), note: "auto-gespielt" };
  }),
  markUp: (ctx, ev) => ({ ...ctx, raum: { ...(ctx.raum || {}), up: [...new Set([...((ctx.raum && ctx.raum.up) || []), ev.seat])] } }),
  sendShow: (ctx, ev, emit) => { const c = G.card(ctx); emit({ type: "peer", msg: { t: "show", c: c.manifest.id, v: c.manifest.version, p: G.paramsOf(ctx) } }); return { ...ctx, note: "gezeigt" }; },
  onJoin: (ctx, ev, emit) => {
    if (!ctx.hs || ctx.session) return { ...ctx, error: "abweichung" };
    if (ctx.hs.guests) return safe(ctx, () => { const r = G.joinGroupFor(ctx, ev.from, ev.msg); if (r.msg) { emit({ type: "peer", msg: r.msg }); for (const m of r.out) emit({ type: "peer", msg: m }); } return r.ctx; });
    return safe(ctx, () => { const r = G.startFor(ctx, ev.msg); emit({ type: "peer", msg: r.msg }); for (const m of r.out) emit({ type: "peer", msg: m }); return r.ctx; });
  },
  onStart: (ctx, ev, emit) => (!ctx.hs || ctx.session ? { ...ctx, error: "abweichung" } : safe(ctx, () => { const r = G.beginFor(ctx, ev.msg); for (const m of r.out) emit({ type: "peer", msg: m }); return r.ctx; })),
  onBotLocal: (ctx, ev, emit) => {
    if (!ctx.session || !ctx.botSeats) return { ...ctx, error: "abweichung" };
    return safe(ctx, () => { const n = G.applyBotLocal(ctx, ev.input, G.todayOf(ev.at)); const t = G.botTurn(n); if (t !== null) emit({ type: "bot.local", seat: t, level: n.level || 2 }); return n; });
  },
  openFromAct: (ctx, ev) => actions.openCard(ctx, { id: ev.card }),
  actEffect: (ctx, ev, emit) => {
    if (ev.act === "copy" && typeof ev.text === "string") emit({ type: "copy.text", text: ev.text.slice(0, 4000) });
    else if (ev.act === "file" && typeof ev.name === "string") emit({ type: "download.text", name: ev.name, mime: ev.mime, text: String(ev.text || "").slice(0, 20000) });
    return ctx;
  },
  // ---- Echtzeit (ADR 0001 b) ----
  startRt: (ctx, ev, emit) => {
    const c = G.card(ctx), m = c.manifest;
    const live = ctx.mode === "live" && ctx.session;
    const seed = live ? ctx.session.seed : ev.rand[0];
    const seat = live ? ctx.session.mine[0] : Math.min(ctx.seat || 0, m.players.max - 1);
    emit({ type: "rt.start", mode: live ? "live" : ctx.mode, seat, seed, params: G.paramsOf(ctx), level: ctx.level || 2, serving: seat === 0 });
    return { ...ctx, rtSeed: seed, rtResult: null, rtAgain: null, link: null, sent: false, error: null, viewer: seat };
  },
  acceptGhost: (ctx, ev, emit) => {
    const inc = ctx.incoming, seat = inc.seat === 0 ? 1 : 0;
    emit({ type: "rt.start", mode: "ghost", seat, seed: inc.wire.s, params: inc.params, level: inc.wire.lv || 2, ghost: inc.wire.tr });
    return { ...ctx, cardId: inc.cardId, params: { ...ctx.params, [inc.cardId]: inc.params }, mode: "ghost", seat, viewer: seat, rtSeed: inc.wire.s, rtResult: null, incoming: null, link: null, sent: false, error: null, ghostOf: { sc: inc.wire.sc, n: inc.wire.n } };
  },
  stopRt: (ctx, ev, emit) => { emit({ type: "rt.stop" }); return { ...ctx, rtResult: null, rtAgain: null }; },
  rtPause: (ctx, ev, emit) => { emit({ type: "rt.pause" }); return ctx; },
  rtResume: (ctx, ev, emit) => { emit({ type: "rt.resume" }); return ctx; },
  rtTakeResult: (ctx, ev) => ({ ...ctx, rtResult: { status: ev.status || null, ghost: ev.ghost || null } }),
  rtTakeError: (ctx, ev) => ({ ...ctx, error: ev.kind === "desync" ? "abweichung" : ev.kind === "peer-lost" ? "partner-weg" : ev.reason || "verbindung" }),
  rtPeerGone: (ctx, ev, emit) => { emit({ type: "rt.stop" }); return { ...ctx, error: "partner-weg" }; },
  makeGhostLink: (ctx) => {
    const g = ctx.rtResult && ctx.rtResult.ghost;
    if (!g || !(ctx.mode === "alone" || ctx.mode === "bot")) return { ...ctx, link: null };
    try { return { ...ctx, link: encode("ghost", g), sent: false }; } catch (e) { return { ...ctx, link: null, linkError: e.code || "zu-lang" }; }
  },
  rtMarkMyAgain: (ctx, ev, emit) => { emit({ type: "peer", msg: { t: "again" } }); return { ...ctx, rtAgain: "mine" }; },
  rtMarkPeerAgain: (ctx) => (ctx.rtResult ? { ...ctx, rtAgain: "peer" } : ctx),
  rtRestartLive: (ctx, ev, emit) => {
    // Revanche: beide haben "again" gesendet; neuer Seed rein aus dem alten (beide rechnen denselben)
    if (ev.type === "AGAIN") emit({ type: "peer", msg: { t: "again" } });
    const seed = sha256(ctx.rtSeed + "|again").slice(0, 32), seat = ctx.session ? ctx.session.mine[0] : ctx.seat;
    emit({ type: "rt.start", mode: "live", seat, seed, params: G.paramsOf(ctx), level: ctx.level || 2, serving: seat === 1 ? true : false });
    return { ...ctx, rtSeed: seed, rtResult: null, rtAgain: null, error: null };
  },
  setLoading: (ctx, ev) => ({ ...ctx, loading: ev.id }),
  setPartFail: (ctx, ev) => ({ ...ctx, loading: null, partFail: { id: ev.id, reason: ev.reason || "teil-fehlt", retry: ev.retry || null } }),
  clearPartFail: (ctx) => ({ ...ctx, partFail: null }),
  retryPart: (ctx, ev, emit) => { if (ctx.partFail && ctx.partFail.retry) emit({ type: "redispatch", ev: ctx.partFail.retry }); return { ...ctx, partFail: null }; },
  // MEMO: JSON der Karte fuer genau diese Partie auf diesem Geraet (<= 512 B), verlaesst das Geraet nie
  setMemo: (ctx, ev, emit) => {
    let m; try { m = ev.memo === null ? null : JSON.parse(JSON.stringify(ev.memo)); } catch (e) { return ctx; }
    if (m !== null && (typeof m !== "object" || JSON.stringify(m).length > 512)) return ctx;
    const memo = m === null ? null : { ...(ctx.memo || {}), ...m };
    if (ctx.session && ctx.gameId) emit({ type: "store.memo", g: ctx.gameId, memo });
    return { ...ctx, memo };
  },
  // DRAFT {draft} ersetzt, DRAFT {patch} mischt in den aktuellen Entwurf (keine verlorenen Felder bei schnellen Eingaben)
  setDraft: (ctx, ev) => {
    try {
      if (ev.patch && typeof ev.patch === "object") return { ...ctx, draft: { ...(ctx.draft && typeof ctx.draft === "object" ? ctx.draft : {}), ...JSON.parse(JSON.stringify(ev.patch)) } };
      return { ...ctx, draft: ev.draft === undefined ? null : JSON.parse(JSON.stringify(ev.draft)) };
    } catch (e) { return ctx; }
  },
  onPeerIn: (ctx, ev, emit) => {
    if (!ctx.session) return { ...ctx, error: "abweichung" };
    return safe(ctx, () => {
      const r = G.applyPeer(ctx, ev.msg);
      // Gastgeber einer Gruppe: den Zug eines Gastes in derselben Reihenfolge an alle anderen weitergeben
      if (ctx.groupHost && ev.from !== undefined) emit({ type: "peer", msg: ev.msg, except: ev.from });
      for (const m of r.out) emit({ type: "peer", msg: m });
      return r.ctx;
    });
  },
  onInput: (ctx, ev, emit) => safe(ctx, () => {
    const r = G.applyMine(ctx, ev.input, G.todayOf(ev.at));
    if (ctx.botSeats) { const t = G.botTurn(r.ctx); if (t !== null) emit({ type: "bot.local", seat: t, level: r.ctx.level || 2 }); return r.ctx; }
    if (ctx.mode === "bot" || ctx.mode === "live") for (const m of r.out) emit({ type: "peer", msg: m });
    return r.ctx;
  }),
  // go mit prepare: die Karte baut aus dem Entwurf synchron die Eingabe (Geheimnis versiegeln, Pruefwert); der Entwurf
  // verlaesst das Geraet nie (ADR 0001 f, Anfragen P/S)
  onPrepare: (ctx, ev, emit) => safe(ctx, () => {
    const c = G.card(ctx);
    if (typeof c.prepare !== "function") throw Object.assign(new Error("prepare"), { code: "eingabe" });
    const seat = ctx.viewer, obs = S.observe(c, ctx.session, seat);
    const input = c.prepare(ev.draft !== undefined ? ev.draft : ctx.draft, { seed: ctx.session.seed, seat, obs, today: G.todayOf(ev.at) });
    return actions.onInput(ctx, { ...ev, input }, emit);
  }),
  flipViewer: (ctx) => { const t = G.gameStatus(ctx).turn; return { ...ctx, viewer: t, coveredFor: t }; },
  // Jeder erzeugte Link legt den eigenen Stand ab (Review H1): spaetere Links muessen ihn fortsetzen
  makeChallenge: (ctx, ev, emit) => { try { const link = encode("challenge", G.challengeOf(ctx)); emit({ type: "store", entry: G.gameEntry(ctx.session, ctx.gameId) }); return { ...ctx, link }; } catch (e) { return { ...ctx, link: null, error: e.code || "zu-lang" }; } },
  makeChallengeIfPending: (ctx, ev, emit) => {
    if (ctx.mode !== "link" || ctx.sent) return ctx;
    if (G.gameStatus(ctx).local === true) return { ...ctx, link: null }; // Ergebnis bleibt auf dem Geraet (status.local)
    const log = ctx.session.log; if (!log.length || !ctx.session.mine.includes(log[log.length - 1].seat)) return { ...ctx, link: null };
    try { const link = encode("challenge", G.challengeOf(ctx)); emit({ type: "store", entry: G.gameEntry(ctx.session, ctx.gameId) }); return { ...ctx, link }; } catch (e) { return { ...ctx, link: null }; }
  },
  endGame: (ctx) => ({ ...ctx, memo: null, vacant: null, awaitHello: false, groupHost: false, session: null, hs: null, error: null, link: null, sent: false, draft: null, botSeats: null, coveredFor: null, rtResult: null, rtAgain: null, ghostOf: null }),
  peerGone: (ctx) => (ctx.session && G.gameStatus(ctx).over ? ctx : { ...ctx, error: "partner-weg" }),
  setError: (ctx, ev) => ({ ...ctx, error: ev.reason || "zug-ungueltig" }),
  takeLink: (ctx, ev, emit) => {
    let r = linkResult(ev);
    // Merkzettel dieser Partie (falls das Geraet sie kennt), sonst null (neue Partie)
    if (r.ok && r.kind === "challenge") r = { ...r, memo: ev.stored && ev.stored.g === r.gameId && ev.stored.memo ? ev.stored.memo : null };
    emit({ type: "url.clear" });
    return { ...ctx, loading: null, incoming: r.ok ? r : null, reason: r.ok ? null : r.reason };
  },
  dropIncoming: (ctx) => ({ ...ctx, incoming: null, reason: null }),
  // Felder, die nicht im Link reisen (media.local, secret), bekommen beim Empfang ihren Standardwert (Anfrage P)
  acceptCard: (ctx) => ({ ...ctx, cardId: ctx.incoming.cardId, params: { ...ctx.params, [ctx.incoming.cardId]: { ...defaults(cardOf(ctx.incoming.cardId).manifest.params), ...ctx.incoming.params } }, mode: cardOf(ctx.incoming.cardId).manifest.mode === "static" ? "link" : playOf(cardOf(ctx.incoming.cardId)).default, seat: 0, session: null, note: "empfangen", incoming: null }),
  // erst beim Annehmen wird gespeichert (Review LOW: nicht angenommene Links verdraengen keine Salze)
  acceptChallenge: (ctx, ev, emit) => {
    const inc = ctx.incoming, seat = inc.session.mine.length ? inc.session.mine[0] : 0;
    ctx = { ...ctx, memo: inc.memo || null, draft: null };
    if (inc.session.mine.length) emit({ type: "store", entry: G.gameEntry(inc.session, inc.gameId) });
    return { ...ctx, cardId: inc.cardId, params: { ...ctx.params, [inc.cardId]: inc.params }, mode: "link", session: inc.session, gameId: inc.gameId, sent: false, error: null, viewer: seat, seat, incoming: null, link: null };
  },
  onHello: (ctx, ev, emit) => { const r = helloResult(ctx, ev); emit({ type: "peer", msg: r.msg }); return { ...r.ctx, mode: "live", incoming: null, awaitHello: false }; },
  helloBad: (ctx, ev) => ({ ...ctx, reason: (ev._h && ev._h.error) || "karte-unbekannt" }),
  takeShow: (ctx, ev) => ({ ...ctx, incoming: { ok: true, kind: "card", cardId: ev.msg.c, params: ev.msg.p } }),
  liveFailed: (ctx, ev) => ({ ...ctx, reason: "verbindung", raum: { ...(ctx.raum || {}), error: ev.reason || "verbindung" } }),
  raumFailed: (ctx, ev) => ({ ...ctx, raum: { ...(ctx.raum || {}), error: ev.reason || "verbindung" } }),
  clearRaumError: (ctx) => ({ ...ctx, raum: { ...(ctx.raum || {}), error: null } }),
  fxInvite: (ctx, ev, emit) => {
    const c = ctx.cardId ? cardOf(ctx.cardId) : null, n = c ? c.manifest.players.max : 2;
    const seats = []; for (let s = 0; s < n; s++) if (s !== ctx.seat) seats.push(s);
    emit({ type: "live.invite", seats: n > 2 ? seats : undefined });
    return { ...ctx, raum: { token: null, inviteLink: null, invites: n > 2 ? {} : null, up: [], step: null, error: null } };
  },
  fxAccept: (ctx, ev, emit) => { emit({ type: "live.accept", token: ev.token }); return { ...ctx, raum: { token: ev.token, step: null, error: null } }; },
  fxClose: (ctx, ev, emit) => { emit({ type: "live.close" }); return { ...ctx, raum: null }; },
  setToken: (ctx, ev) => {
    try {
      const link = encode("live", { t: ev.token });
      if (ev.seat !== undefined) { const invites = { ...((ctx.raum && ctx.raum.invites) || {}), [ev.seat]: link }; const first = invites[Object.keys(invites).sort()[0]]; return { ...ctx, raum: { ...ctx.raum, invites, token: ev.token, inviteLink: first } }; }
      return { ...ctx, raum: { ...ctx.raum, token: ev.token, inviteLink: link } };
    } catch (e) { return ctx; }
  },
  setStep: (ctx, ev) => ({ ...ctx, raum: { ...(ctx.raum || {}), step: ev.step } }),
  setRaumError: (ctx, ev) => ({ ...ctx, raum: { ...(ctx.raum || {}), error: ev.reason || "verbindung" } }),
  ...kontoActions
};

// ---------- Erweiterungen (ADR 0001 g) ----------
function cloneDef(n) {
  const out = { ...n };
  if (n.on) { out.on = {}; for (const [k, v] of Object.entries(n.on)) out.on[k] = Array.isArray(v) ? v.slice() : v; }
  if (n.entry) out.entry = n.entry.slice();
  if (n.states) { out.states = {}; for (const [k, v] of Object.entries(n.states)) out.states[k] = cloneDef(v); }
  return out;
}
const asList = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
function nodeAt(root, p) {
  let n = root;
  for (const part of p.split(".")) { n = n.states && n.states[part]; if (!n) throw new Error("feature: Zustand " + p + " fehlt"); }
  return n;
}
/** Setzt Features in Diagramm, Bedingungen, Aktionen und Kontext ein. Rein; Konflikte werfen. */
export function withFeatures(base, baseGuards, baseActions, feats) {
  const root = cloneDef(base), g = { ...baseGuards }, a = { ...baseActions }, ids = new Set();
  let shelfBy = null;
  for (const f of feats) {
    if (!f || typeof f.id !== "string" || ids.has(f.id)) throw new Error("feature: id fehlt oder doppelt");
    ids.add(f.id);
    const inhalt = root.states.inhalt;
    for (const [name, st] of Object.entries(f.states || {})) {
      if (name === "shelf") { if (shelfBy) throw new Error("feature: shelf schon ersetzt von " + shelfBy); shelfBy = f.id; inhalt.states.shelf = cloneDef(st); continue; }
      if (inhalt.states[name]) throw new Error("feature " + f.id + ": Zustand inhalt." + name + " existiert");
      inhalt.states[name] = cloneDef(st);
    }
    const on = { ...(f.on || {}) };
    if (f.shelfOn) on["inhalt.shelf"] = { ...(on["inhalt.shelf"] || {}), ...f.shelfOn };
    for (const [p, evs] of Object.entries(on)) {
      const n = nodeAt(root, p); n.on = n.on || {};
      for (const [ev, tr] of Object.entries(evs)) n.on[ev] = [...asList(tr), ...asList(n.on[ev])];
    }
    for (const [p, acts] of Object.entries(f.entry || {})) { const n = nodeAt(root, p); n.entry = [...(n.entry || []), ...acts]; }
    for (const [k, fn] of Object.entries(f.guards || {})) { if (k in g) throw new Error("feature " + f.id + ": Bedingung " + k + " doppelt"); g[k] = fn; }
    for (const [k, fn] of Object.entries(f.actions || {})) { if (k in a) throw new Error("feature " + f.id + ": Aktion " + k + " doppelt"); a[k] = fn; }
  }
  return { chart: root, guards: g, actions: a };
}
export function featureContext(feats, saved) {
  const out = {};
  for (const f of feats) if (typeof f.context === "function") for (const [k, v] of Object.entries(f.context(saved) || {})) { if (k in out) throw new Error("feature " + f.id + ": Kontext " + k + " doppelt"); out[k] = v; }
  return out;
}
/** Effekt-Tabelle aller Features (Typ -> Funktion); doppelte Typen sind ein Fehler. */
export function featureEffects(feats) {
  const out = {};
  for (const f of feats) for (const [k, fn] of Object.entries(f.effects || {})) { if (k in out) throw new Error("feature " + f.id + ": Effekt " + k + " doppelt"); out[k] = fn; }
  return out;
}

const composed = withFeatures(chart, guards, actions, FEATURES);
export const machine = createMachine(composed.chart, { guards: composed.guards, actions: composed.actions });

/** @param saved Konto-Daten aus dem Geraetespeicher (oder null) */
export function initialContext(lang, saved = null) {
  return { lang, cardId: null, params: {}, mode: null, seat: 0, level: 2, part: null, session: null, hs: null, error: null, draft: null, botSeats: null, coveredFor: null, incoming: null, reason: null, link: null, raum: null, note: null, raumBrauchtKonto: false, today: null, loading: null, partFail: null, ...kontoContext(saved), ...featureContext(FEATURES, saved) };
}
