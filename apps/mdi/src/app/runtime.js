// Laufzeit: haelt den Zustand der Statechart, fuehrt deren Effekte aus und meldet Aenderungen an die Ansicht.
// Keine globalen Singletons (A1): alles kommt als Abhaengigkeit herein (Broker, Speicher, Zufall, Planer).
import { machine, initialContext, featureEffects } from "./machine.js";
import { FEATURES, featureNeeds } from "./features.js";
import { chooseMove, LEVELS } from "../bot/ismcts.js";
import * as S from "../contract/session.js";
import { createRtSession } from "./rt/session.js";
import * as G from "./game.js";
import { fromB64url } from "../contract/trace.js";
import { cardOf, isLoaded, loadCard, manifestOf } from "../cards/index.js";
import { createBotAgent } from "../bot/agent.js";
import * as V from "../gen/validators.js";
import { depthOk } from "../contract/equal.js";
import { decode } from "./link.js";
import { kontoSaved } from "./konto-chart.js";

const EVENT_OF = { hello: "HELLO", join: "JOIN", start: "START", in: "PEER_IN", show: "SHOW", bye: "LIVE_DOWN", again: "PEER_AGAIN" };
// Echtzeit-Nachrichten gehen direkt an die laufende Sitzung, nicht durch die Statechart (60–120 je Sekunde)
const RT_MSG = new Set(["rt", "rh", "rs", "pause", "resume"]);

/**
 * @param {object} deps
 * @param {string} deps.lang
 * @param {() => string} deps.entropy          32 Hex-Zeichen (nur fuer Salze/Seeds, nie fuer Spiellogik)
 * @param {{saveGame(e:object):void, loadGame(g:string):object|null}} deps.storage
 * @param {() => Promise<object>} deps.live     laedt den Live-Broker (Teil) erst bei Bedarf
 * @param {(fragment:string) => Promise<boolean>} deps.share
 * @param {() => void} deps.clearUrl
 * @param {(f:Function) => void} [deps.schedule]
 * @param {(state:object, info:object) => void} deps.onChange
 * @param {object} [deps.api]                    Server-API (src/broker/api.js); fehlt sie, sagt die Konto-Region „nicht hier“
 * @param {(url:string) => boolean} [deps.navigate]   Seite verlassen (Anmelden/Abmelden); false = geht hier nicht
 * @param {(name:string, data:object) => void} [deps.download]
 * @param {() => string} [deps.returnPath]       Pfad, zu dem das Gate nach dem Anmelden zurueckkehrt
 * @param {() => number} [deps.now]
 */
export function createRuntime(deps) {
  const schedule = deps.schedule || ((f) => setTimeout(f, 0));
  const now = deps.now || (() => Date.now());
  const saved = deps.storage.loadKonto ? (() => { try { return deps.storage.loadKonto(); } catch (e) { return null; } })() : null;
  let state = machine.initial(initialContext(deps.lang, saved));
  if (!state.ctx.device) state = { ...state, ctx: { ...state.ctx, device: deps.entropy() } };
  let bot = null, live = null, liveGen = 0, rtSess = null, rtGen = 0;
  const lives = new Map(); // Gruppe: Gastsitz -> Kanal
  const rand = () => [deps.entropy(), deps.entropy(), deps.entropy(), deps.entropy()];
  const api = deps.api || null;
  // Netzaufrufe enden immer als Ereignis (die API wirft nicht); ein Programmfehler dahinter wird laut, nicht verschluckt
  const later = (f) => { f().catch((e) => setTimeout(() => { throw e; }, 0)); };
  const fxTable = { ...featureEffects(FEATURES) };
  for (const [k, fn] of Object.entries(deps.effects || {})) { if (k in fxTable) throw new Error("Effekt doppelt: " + k); fxTable[k] = fn; }

  // Karten, die ein Ereignis braucht (ADR 0001 Nachtrag 2): vorher laden; fehlt ein Teil, ehrlich melden (PART_FAIL)
  function cardsFor(ev) {
    let id = null;
    if (ev.type === "OPEN") id = ev.id;
    else if (ev.type === "ACT" && ev.act === "open") id = ev.card;
    else if ((ev.type === "HELLO" || ev.type === "SHOW") && ev.msg) id = ev.msg.c;
    else if (ev.type === "LINK") { const d = decode(ev.hash); if (d.ok && d.data && typeof d.data.c === "string") id = d.data.c; }
    const ids = [...(typeof id === "string" ? [id] : []), ...featureNeeds(ev, state.ctx)];
    return [...new Set(ids)].filter((x) => manifestOf(x) && !isLoaded(x));
  }
  function dispatch(ev) {
    ev = typeof ev === "string" ? { type: ev } : { ...ev };
    if (!ev.rand) ev.rand = rand();
    if (ev.at === undefined) ev.at = now();
    const need = deps.loadPart ? cardsFor(ev) : [];
    if (need.length) {
      dispatchNow({ type: "LOADING", id: need[0] });
      Promise.all(need.map((id) => loadCard(id, deps.loadPart))).then(
        () => dispatchNow(ev),
        (e) => dispatchNow({ type: "PART_FAIL", id: need[0], reason: (e && e.code) || "teil-fehlt", retry: ev }));
      return true;
    }
    return dispatchNow(ev);
  }
  function dispatchNow(ev) {
    if (!ev.rand) ev.rand = rand();
    if (ev.at === undefined) ev.at = now();
    state = { ...state, ctx: { ...state.ctx, today: Math.floor(ev.at / 86400000) } }; // UTC-Tag fuer view (ADR 0001 f)
    const before = state;
    state = machine.send(state, ev);
    for (const fx of state.effects) run(fx);
    deps.onChange(state, { consumed: state.consumed, event: ev, before });
    return state.consumed;
  }

  /** Nachricht vom Partner (Bot oder Live): erst Schema, dann Ereignis. */
  // from = Sitz des Gastes, von dem die Nachricht kommt (nur beim Gastgeber einer Gruppe), sonst undefined
  function fromPeer(msg, from) {
    // Review M1: Tiefe vorher begrenzen, Validator darf nie werfen
    let ok = false; try { ok = depthOk(msg, 8) && V.liveMsg(msg) === true; } catch (e) { ok = false; }
    if (!ok) { dispatch({ type: "FAIL", reason: "schema" }); return; }
    if (RT_MSG.has(msg.t)) { if (rtSess) rtSess.receive(msg); return; }
    dispatch({ type: EVENT_OF[msg.t], msg, from });
  }

  // Ein Kanal je Gast (Gruppe, ADR 0001 f): seat = Gastsitz beim Gastgeber, undefined zu zweit und beim Gast
  function liveCallbacks(gen, seat) {
    const ok = () => gen === liveGen;
    return {
      onToken: (token) => ok() && dispatch({ type: "LIVE_TOKEN", token, seat }),
      onStep: (step) => ok() && dispatch({ type: "LIVE_STEP", step, seat }),
      onUp: () => ok() && dispatch({ type: "LIVE_UP", seat }),
      onDown: () => ok() && dispatch({ type: "LIVE_DOWN", seat }),
      onFail: (reason) => ok() && dispatch({ type: "LIVE_FAIL", reason, seat }),
      onMessage: (m) => ok() && fromPeer(m, seat)
    };
  }
  function sendPeer(fx) {
    if (live) { live.send(fx.msg); return; }
    for (const [seat, ch] of lives) if ((fx.to === undefined || fx.to === seat) && fx.except !== seat) ch.send(fx.msg);
  }

  function run(fx) {
    switch (fx.type) {
      case "peer":
        if (state.ctx.mode === "bot") { const m = fx.msg; schedule(() => bot && bot.receive(m)); }
        else sendPeer(fx);
        break;
      case "bot.new":
        bot = createBotAgent(cardOf(state.ctx.cardId), { seat: fx.seat, level: fx.level, today: fx.today, entropy: deps.entropy, send: (m) => schedule(() => fromPeer(m)) });
        break;
      case "live.invite": case "live.accept": {
        const gen = ++liveGen;
        deps.live().then((L) => {
          if (gen !== liveGen) return;
          if (fx.type === "live.accept") live = L.accept(fx.token, liveCallbacks(gen));
          else if (Array.isArray(fx.seats) && fx.seats.length > 1) for (const seat of fx.seats) lives.set(seat, L.invite(liveCallbacks(gen, seat)));
          else live = L.invite(liveCallbacks(gen));
        }).catch(() => gen === liveGen && dispatch({ type: "LIVE_FAIL", reason: "verbindung" }));
        break;
      }
      case "live.close":
        liveGen++; if (live) { try { live.close(); } catch (e) { /* schon zu */ } } live = null;
        for (const ch of lives.values()) { try { ch.close(); } catch (e) { /* schon zu */ } }
        lives.clear();
        break;
      // Eintraege behalten den Merkzettel der Partie (Z1), wenn ein neuer Stand gespeichert wird
      case "store": { let old = null; try { old = deps.storage.loadGame(fx.entry.g); } catch (e) { old = null; } deps.storage.saveGame(old && old.memo && fx.entry.memo === undefined ? { ...fx.entry, memo: old.memo } : fx.entry); break; }
      case "store.memo": { let old = null; try { old = deps.storage.loadGame(fx.g); } catch (e) { old = null; } if (old) deps.storage.saveGame({ ...old, memo: fx.memo }); else { const e = G.gameEntry(state.ctx.session, fx.g); deps.storage.saveGame({ ...e, memo: fx.memo }); } break; }
      // "shared" = Systemblatt abgeschlossen -> gesendet; "copied" = nur in der Zwischenablage; sonst Hinweis + Feld
      case "share": deps.share(fx.fragment).then((r) => dispatch({ type: r === "shared" ? "SENT" : r === "copied" ? "COPIED" : "SHARE_FAIL" })); break;
      case "copy": (deps.copy || (() => Promise.resolve(false)))(fx.fragment).then((ok) => dispatch({ type: ok ? "COPIED" : "COPY_FAIL" })); break;
      case "url.clear": deps.clearUrl(); break;
      case "redispatch": schedule(() => dispatch({ ...fx.ev, at: undefined, rand: undefined })); break;
      // ---- Konto (Ergebnisse kommen als Ereignisse zurueck; ohne API ehrlich „nicht hier“) ----
      case "konto.status":
        later(async () => {
          if (!api) { dispatch({ type: "STATUS", result: { ok: false, error: "nicht-hier" } }); return; }
          const result = await api.status(state.ctx.device);
          let logout = null;
          if (result.ok && result.canLogin && result.account && !result.app) { const m = await api.me(ret(), state.ctx.lang); logout = m.ok ? m.logoutUrl : null; }
          dispatch({ type: "STATUS", result, logout });
        });
        break;
      case "konto.login":
        // App-Huelle: die Huelle meldet an (System-Browser); danach wird das Konto neu geprueft, wie nach dem Gate
        if (api && api.app) { later(async () => { const r = await api.app.login(); dispatch(r.ok ? { type: "APP_DONE" } : { type: "NAV_FAIL", reason: "nicht-hier" }); }); break; }
        if (deps.setLook) deps.setLook(state.ctx.me && state.ctx.me.colors);   // Anmeldeseite im Look von My Daily Idea
        if (!api || !deps.navigate || !deps.navigate(api.loginHref(ret(), state.ctx.lang))) schedule(() => dispatch({ type: "NAV_FAIL", reason: "nicht-hier" }));
        break;
      case "konto.logout":
        if (api && api.app) { later(async () => { const r = await api.app.logout(); dispatch(r.ok ? { type: "APP_DONE" } : { type: "NAV_FAIL", reason: "nicht-hier" }); }); break; }
        if (!deps.navigate || !deps.navigate(fx.url)) schedule(() => dispatch({ type: "NAV_FAIL", reason: "nicht-hier" }));
        break;
      case "device.save": if (deps.storage.saveKonto) deps.storage.saveKonto(kontoSaved(state.ctx)); break;
      case "profil.get": case "profil.put": case "profil.delete": {
        const op = fx.type.slice("profil.".length), who = fx.who, body = fx.body;
        later(async () => {
          const call = api && { get: () => api.profileGet(who), put: () => api.profilePut(who, body), delete: () => api.profileDelete(who) }[op];
          if (api && !call) throw new Error("Profil-Aufruf unbekannt: " + op);
          const result = call ? await call() : { ok: false, error: "nicht-hier" };
          dispatch({ type: "PROFIL", op, who, body, result });
        });
        break;
      }
      case "redeem": later(async () => dispatch({ type: "REDEEMED", result: api ? await api.redeem(fx.code) : { ok: false, error: "nicht-hier" } })); break;
      case "mod.me": later(async () => dispatch({ type: "MOD", result: api ? await api.modMe() : { ok: false, error: "nicht-hier" } })); break;
      case "mod.appeal": later(async () => dispatch({ type: "APPEALED", result: api ? await api.appeal(fx.nid, fx.text) : { ok: false, error: "nicht-hier" } })); break;
      case "download": if (deps.download) deps.download(fx.name, fx.data); break;
      case "download.text": if (!deps.downloadText || !deps.downloadText(fx.name, fx.mime, fx.text)) schedule(() => dispatch({ type: "COPY_FAIL" })); break;
      case "copy.text": (deps.copyText || (() => Promise.resolve(false)))(fx.text).then((ok) => dispatch({ type: ok ? "COPIED" : "COPY_FAIL" })); break;
      case "rt.start": {
        if (rtSess) { rtSess.stop(); rtSess = null; }
        const gen = ++rtGen, c = cardOf(state.ctx.cardId);
        if (!deps.rt) { schedule(() => dispatch({ type: "RT", kind: "error", reason: "nicht-hier" })); break; }
        const ghost = fx.ghost ? fromB64url(fx.ghost) : undefined;
        const R = deps.rt;
        try {
          rtSess = createRtSession(c, { mode: fx.mode, seat: fx.seat, params: fx.params, seed: fx.seed, level: fx.level, ghost, serving: fx.serving, lang: state.ctx.lang, reduced: R.reduced ? R.reduced() : false }, {
            now: R.now, frame: R.frame, cancel: R.cancel,
            send: (m) => sendPeer({ msg: m }),
            draw: (node, info) => R.draw(node, info),
            onEvents: (ev) => { if (R.sound) R.sound(ev, c.manifest.rt.sounds || {}); },
            onChange: (info) => {
              if (gen !== rtGen) return;
              const extra = info.type === "over" ? { status: info.status, ghost: (() => { try { return rtSess.ghostWire(); } catch (e) { return null; } })() } : {};
              schedule(() => gen === rtGen && dispatch({ type: "RT", kind: info.type, ...extra }));
            }
          });
          rtSess.start();
        } catch (e) { rtSess = null; schedule(() => dispatch({ type: "RT", kind: "error", reason: e.code || "geist" })); }
        break;
      }
      case "rt.stop": rtGen++; if (rtSess) { rtSess.stop(); rtSess = null; } break;
      case "rt.pause": if (rtSess) rtSess.pause(); break;
      case "rt.resume": if (rtSess) rtSess.resume(); break;
      case "bot.local": {
        // Bot-Sitz auf diesem Geraet (mehr als zwei Sitze): plant nur aus observe() seines Sitzes, Zufall aus dem Seed
        const ctx = state.ctx, c = cardOf(ctx.cardId), s = ctx.session;
        if (!s) break;
        const obs = S.observe(c, s, fx.seat), seed = s.seed + "|bot|" + fx.seat + "|" + s.log.length;
        const input = typeof c.bot === "function" ? c.bot(obs, fx.seat, { level: fx.level, seed })
          : chooseMove(c, obs, fx.seat, { iterations: (LEVELS.find((l) => l.id === fx.level) || LEVELS[1]).iterations, seed });
        schedule(() => dispatch({ type: "BOT_IN", input }));
        break;
      }
      default:
        if (Object.prototype.hasOwnProperty.call(fxTable, fx.type)) { fxTable[fx.type](fx, { dispatch, state: () => state, api, deps }); break; }
        throw new Error("Effekt unbekannt: " + fx.type);
    }
  }

  /** Fragment aus der Adresse (Start oder hashchange). */
  function link(hash) {
    let stored = null;
    const d = decode(hash);
    if (d.ok && d.type === "challenge") { try { stored = deps.storage.loadGame(d.data.g); } catch (e) { stored = null; } }
    return dispatch({ type: "LINK", hash, stored });
  }

  function ret() { return deps.returnPath ? deps.returnPath() : "/duell"; }
  // Effekte des Anfangszustands (Konto pruefen; neue Geraete-id merken) laufen nach dem Aufbau
  const first = state.effects.slice();
  if (!saved || saved.device !== state.ctx.device) first.push({ type: "device.save" });
  schedule(() => { for (const fx of first) run(fx); });

  // Eingaben der Buehne (src/render/rt-stage.js) -> laufende Echtzeit-Sitzung; ohne Sitzung: nicht verbraucht
  const rt = {
    get active() { return !!rtSess; },
    get view() { return rtSess ? rtSess.view : null; },
    screenButtons: () => (rtSess ? rtSess.screenButtons() : []),
    get controls() { return rtSess ? rtSess.controls : null; },
    key: (code, down) => (rtSess ? rtSess.key(code, down) : false),
    pointer: (type, id, x, y) => { if (rtSess) rtSess.pointer(type, id, x, y); },
    button: (id, down) => { if (rtSess) rtSess.button(id, down); },
    blur: () => { if (rtSess) rtSess.blur(); },
    hidden: () => { if (rtSess && rtSess.phase === "run" && !rtSess.paused) dispatch({ type: "PAUSE" }); },
    status: () => (rtSess ? rtSess.status() : null)
  };
  return { dispatch, link, rt, get state() { return state; }, matches: (p) => machine.matches(state, p) };
}
