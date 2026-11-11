// Laufzeit: haelt den Zustand der Statechart, fuehrt deren Effekte aus und meldet Aenderungen an die Ansicht.
// Keine globalen Singletons (A1): alles kommt als Abhaengigkeit herein (Broker, Speicher, Zufall, Planer).
import { machine, initialContext } from "./machine.js";
import { cardOf } from "../cards/index.js";
import { createBotAgent } from "../bot/agent.js";
import * as V from "../gen/validators.js";
import { decode } from "./link.js";

const EVENT_OF = { hello: "HELLO", join: "JOIN", start: "START", in: "PEER_IN", show: "SHOW", bye: "LIVE_DOWN" };

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
 */
export function createRuntime(deps) {
  const schedule = deps.schedule || ((f) => setTimeout(f, 0));
  let state = machine.initial(initialContext(deps.lang));
  let bot = null, live = null, liveGen = 0;
  const rand = () => [deps.entropy(), deps.entropy(), deps.entropy(), deps.entropy()];

  function dispatch(ev) {
    ev = typeof ev === "string" ? { type: ev } : { ...ev };
    if (!ev.rand) ev.rand = rand();
    const before = state;
    state = machine.send(state, ev);
    for (const fx of state.effects) run(fx);
    deps.onChange(state, { consumed: state.consumed, event: ev, before });
    return state.consumed;
  }

  /** Nachricht vom Partner (Bot oder Live): erst Schema, dann Ereignis. */
  function fromPeer(msg) {
    if (V.liveMsg(msg) !== true) { dispatch({ type: "FAIL", reason: "schema" }); return; }
    dispatch({ type: EVENT_OF[msg.t], msg });
  }

  function liveCallbacks(gen) {
    const ok = () => gen === liveGen;
    return {
      onToken: (token) => ok() && dispatch({ type: "LIVE_TOKEN", token }),
      onStep: (step) => ok() && dispatch({ type: "LIVE_STEP", step }),
      onUp: () => ok() && dispatch({ type: "LIVE_UP" }),
      onDown: () => ok() && dispatch({ type: "LIVE_DOWN" }),
      onFail: (reason) => ok() && dispatch({ type: "LIVE_FAIL", reason }),
      onMessage: (m) => ok() && fromPeer(m)
    };
  }

  function run(fx) {
    switch (fx.type) {
      case "peer":
        if (state.ctx.mode === "bot") { const m = fx.msg; schedule(() => bot && bot.receive(m)); }
        else if (live) live.send(fx.msg);
        break;
      case "bot.new":
        bot = createBotAgent(cardOf(state.ctx.cardId), { seat: fx.seat, level: fx.level, entropy: deps.entropy, send: (m) => schedule(() => fromPeer(m)) });
        break;
      case "live.invite": case "live.accept": {
        const gen = ++liveGen;
        deps.live().then((L) => {
          if (gen !== liveGen) return;
          live = fx.type === "live.invite" ? L.invite(liveCallbacks(gen)) : L.accept(fx.token, liveCallbacks(gen));
        }).catch(() => gen === liveGen && dispatch({ type: "LIVE_FAIL", reason: "verbindung" }));
        break;
      }
      case "live.close":
        liveGen++; if (live) { try { live.close(); } catch (e) { /* schon zu */ } } live = null;
        break;
      case "store": deps.storage.saveGame(fx.entry); break;
      // "shared" = Systemblatt abgeschlossen -> gesendet; "copied" = nur in der Zwischenablage; sonst Hinweis + Feld
      case "share": deps.share(fx.fragment).then((r) => dispatch({ type: r === "shared" ? "SENT" : r === "copied" ? "COPIED" : "SHARE_FAIL" })); break;
      case "copy": (deps.copy || (() => Promise.resolve(false)))(fx.fragment).then((ok) => dispatch({ type: ok ? "COPIED" : "COPY_FAIL" })); break;
      case "url.clear": deps.clearUrl(); break;
      default: throw new Error("Effekt unbekannt: " + fx.type);
    }
  }

  /** Fragment aus der Adresse (Start oder hashchange). */
  function link(hash) {
    let stored = null;
    const d = decode(hash);
    if (d.ok && d.type === "challenge") { try { stored = deps.storage.loadGame(d.data.g); } catch (e) { stored = null; } }
    return dispatch({ type: "LINK", hash, stored });
  }

  return { dispatch, link, get state() { return state; }, matches: (p) => machine.matches(state, p) };
}
