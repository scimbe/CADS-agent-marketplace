// Gemeinsame Treiber fuer die Tisch-Tests: ganze Partien ueber den Kartenvertrag (session.js), ohne Host.
// Pflichtschritte (status.auto) und die Aufloesung fuehrt der Treiber aus, wie es der Host fuer eigene Sitze tut.
import { CARDS } from "../src/cards/index.js";
import * as S from "../src/contract/session.js";
import { rng, sha256 } from "../src/contract/sdk.js";

export const IDS = { skat: "tisch-skat", doko: "tisch-doko", bauernskat: "tisch-bauernskat" };
export function cardFor(game) { return CARDS[IDS[game]]; }
export function entropy(tag) { let i = 0; return () => sha256(tag + "|" + (i++)).slice(0, 32); }

/** Pflichtzug oder Aufloesung fuer einen Sitz dieses Geraets (wie der Host), sonst null. */
export function due(card, s) {
  const r = S.dueReveal(card, s); if (r) return r;
  const st = S.status(card, s);
  if (st.over || !st.auto || !s.mine.includes(st.turn)) return null;
  const mv = card.moves(card.observe(s.state, st.turn), st.turn);
  return mv.length === 1 ? mv[0] : null;
}

/**
 * Regelentscheidung per Seed-RNG aus den Regelaktionen (gleiche Liste wie im Altcode: R.actions mit der eigenen Hand).
 * Liefert {input, action} – action ist die Regelaktion, wie sie der Altcode anwenden wuerde (push mit Karten).
 */
export function randomChooser(tag) {
  const r = rng(tag);
  return (card, obs, seat) => {
    const T = card.engine, R = T.R, pub = obs.pub, cards = T.myCards(obs, seat);
    if (pub.ph === "next") return { input: { t: "next", seat } };
    if (pub.r.phase === "push") {
      const own = T.ownPositions(pub, seat), i = r.int(own.length); let j = r.int(own.length - 1); if (j >= i) j++;
      const [a, b] = i < j ? [own[i], own[j]] : [own[j], own[i]];
      return { input: { t: "push", seat, c: T.pushCommit(obs.mine.sec.k, a, b) }, action: { t: "push", seat, cards: [a, b].map((p) => R.DECK[obs.mine.hand[p]]) } };
    }
    // Ansagen nur am eigenen Zug (Vertrag), Offenlegen ist ein Pflichtschritt
    const acts = R.actions(pub.r, seat, cards).filter((x) => x.seat === seat && x.t !== "show");
    const a = acts[r.int(acts.length)];
    return { input: T.toInput(obs, seat, a), action: a };
  };
}

/** Eine ganze Partie auf einem Geraet (alle Sitze hier). chooser(card, obs, seat) -> {input, action}. */
export function playAlone(game, { tag, params, chooser, onAction, onState }) {
  const card = cardFor(game), n = card.manifest.players.max, all = [...Array(n).keys()];
  let s = S.newSession(card, { params, seed: sha256("seed|" + tag).slice(0, 32), mine: all, ...S.makeSecrets(card, all, entropy(tag)) });
  for (let guard = 0; guard < 5000; guard++) {
    if (onState) onState(s);
    const st = S.status(card, s); if (st.over) return s;
    const d = due(card, s);
    if (d) { s = S.apply(card, s, d); continue; }
    const c = chooser(card, card.observe(s.state, st.turn), st.turn);
    if (onAction && c.action) onAction(c.action, s);
    s = S.apply(card, s, c.input);
  }
  throw new Error("Partie endet nicht");
}

/**
 * Dieselbe Partie auf n getrennten Geraeten (je ein Sitz, eigenes Salz), Eingaben im Gleichschritt wie im Live-Raum.
 * Prueft nach jeder Eingabe: gleicher oeffentlicher Hash, kein fremdes Geheimnis auf einem Geraet.
 */
export function playDevices(game, { tag, params, pick, check }) {
  const card = cardFor(game), n = card.manifest.players.max, ent = entropy(tag);
  const mine = [...Array(n).keys()].map((s) => S.makeSecrets(card, [s], ent));
  const commits = mine.map((m, s) => m.commits[s]);
  const seed = sha256("seed|" + tag).slice(0, 32);
  let dev = mine.map((m, s) => S.newSession(card, { params, seed, mine: [s], secrets: m.secrets, commits }));
  for (let guard = 0; guard < 5000; guard++) {
    const st = S.status(card, dev[0]); if (st.over) return dev;
    const owner = st.turn, d = due(card, dev[owner]);
    const input = d || pick(card, card.observe(dev[owner].state, owner), owner);
    dev = dev.map((x) => S.apply(card, x, input));
    const h = S.pubHash(dev[0]);
    for (const x of dev) if (S.pubHash(x) !== h) throw new Error("Hash weicht ab nach " + JSON.stringify(input).slice(0, 80));
    if (check) check(dev, input);
  }
  throw new Error("Partie endet nicht");
}

/** Der Auto-Zug des Altcodes (Regeln auto()) als Entscheidung. */
export function autoChooser() {
  return (card, obs, seat) => {
    const T = card.engine, R = T.R, pub = obs.pub, cards = T.myCards(obs, seat);
    if (pub.ph === "next") return { input: { t: "next", seat } };
    const a = R.auto(pub.r, seat, cards);
    if (a.t === "push") {
      const own = T.ownPositions(pub, seat), used = [];
      for (const c of a.cards) used.push(own.find((p) => !used.includes(p) && R.DECK[obs.mine.hand[p]] === c));
      used.sort((x, y) => own.indexOf(x) - own.indexOf(y));
      return { input: { t: "push", seat, c: T.pushCommit(obs.mine.sec.k, used[0], used[1]) }, action: a };
    }
    return { input: T.toInput(obs, seat, a), action: a };
  };
}
