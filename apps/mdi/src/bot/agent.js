// Bot als lokaler Partner: spricht dasselbe Protokoll wie ein Live-Partner (hello/join/start/in) und haelt seine
// eigene Partie mit seinem eigenen Geheimnis. Die Partie des Menschen erfaehrt die Karten des Bots erst bei der
// Aufloesung – wie bei einem echten Gegenueber. Kartenunabhaengig.
import * as S from "../contract/session.js";
import * as H from "../contract/handshake.js";
import { chooseMove, LEVELS } from "./ismcts.js";

export function createBotAgent(card, { seat, level, entropy, send }) {
  let local = null, session = null;
  const iterations = (LEVELS.find((l) => l.id === level) || LEVELS[1]).iterations;
  function out(s) { const x = s.log[s.log.length - 1]; send({ t: "in", i: s.log.length - 1, x, h: S.pubHash(s) }); }
  function act() {
    for (let guard = 0; guard < 16 && session; guard++) {
      const st = S.status(card, session);
      if (st.over) return;
      const rv = S.dueReveal(card, session);
      if (rv) { session = S.apply(card, session, rv); out(session); continue; }
      if (st.turn !== seat) return;
      const obs = S.observe(card, session, seat), seed = session.seed + "|" + session.log.length;
      // eigener Bot der Karte (ADR 0001 f), sonst generischer ISMCTS
      const mv = typeof card.bot === "function" ? card.bot(obs, seat, { level, seed }) : chooseMove(card, obs, seat, { iterations, seed });
      session = S.apply(card, session, mv); out(session);
    }
  }
  return {
    receive(msg) {
      if (msg.t === "hello") { const r = H.join(card, msg, [entropy(), entropy()]); local = r.local; send(r.msg); }
      else if (msg.t === "start" && local) { session = H.begin(card, local, msg); act(); }
      else if (msg.t === "in" && session) {
        if (msg.i !== session.log.length) return;
        session = S.apply(card, session, msg.x);
        if (S.pubHash(session) !== msg.h) return;
        act();
      }
    }
  };
}
