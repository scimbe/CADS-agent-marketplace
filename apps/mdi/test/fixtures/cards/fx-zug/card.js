// Testkarte fuer den Zugvertrag v0.2 (ADR 0001 f), keine Produktkarte: drei Sitze mit Geheimnis, Pflichtzuege
// (status.auto: jeder Sitz "teilt" zuerst seine verdeckte Zahl aus), freie Texteingaben (accepts), Tagesstempel (d),
// Snapshot-Link (compact/merge), lokales Ergebnis (status.local).
import manifest from "./manifest.json" with { type: "json" };
import { clean } from "../../../../src/contract/text.js";

function copy(p) { return { n: p.n, dealt: p.dealt.slice(), said: p.said.map((x) => x.slice()), turn: p.turn, days: p.days.slice() }; }
export default {
  manifest,
  init({ params }) { return { pub: { n: params.rounds, dealt: [false, false, false], said: [], turn: 0, days: [] }, priv: [null, null, null] }; },
  deal({ rng, seat }) { return { secret: rng.int(100), seat }; },
  step(state, input) {
    const p = copy(state.pub);
    if (input.seat !== p.turn) throw new Error("nicht dran");
    if (p.dealt.includes(false)) {
      if (input.t !== "deal") throw new Error("erst austeilen");
      p.dealt[input.seat] = true; p.turn = (p.turn + 1) % 3;
    } else {
      if (input.t !== "say" || typeof input.a !== "string" || clean(input.a, 40) !== input.a) throw new Error("say");
      if (!Number.isInteger(input.d)) throw new Error("Tag fehlt");
      p.said.push([input.seat, input.a]); p.days.push(input.d); p.turn = (p.turn + 1) % 3;
    }
    return { pub: p, priv: state.priv.slice() };
  },
  observe(state, seat) { return { pub: copy(state.pub), mine: state.priv[seat] }; },
  status(state) {
    const p = state.pub, over = p.said.length >= 3 * p.n;
    return { over, turn: over ? -1 : p.turn, reveal: false, auto: p.dealt.includes(false), local: true, score: [0, 0, 0], winner: -1, turnNo: p.said.length + 1, turns: 3 * p.n };
  },
  moves(obs, seat) {
    if (obs.pub.dealt.includes(false)) return obs.pub.turn === seat ? [{ t: "deal", seat }] : [];
    return obs.pub.turn === seat ? [{ t: "say", seat, a: "hallo" }] : [];
  },
  accepts(obs, seat, input) {
    if (obs.pub.dealt.includes(false)) return input.t === "deal" && input.seat === seat && obs.pub.turn === seat;
    return input.t === "say" && input.seat === seat && obs.pub.turn === seat && typeof input.a === "string" && clean(input.a, 40) === input.a && input.a.length > 0;
  },
  sample(obs, seat, rng) { return { pub: copy(obs.pub), priv: [0, 1, 2].map((s) => (s === seat ? obs.mine : { secret: rng.int(100), seat: s })) }; },
  compact(log) { return log; },
  merge(a, b) { return b.said.length >= a.said.length ? b : a; },
  view(obs) { return { t: "stack", children: [{ t: "text", role: "body", text: obs.pub.said.map((x) => x[1]).join(" ") }] }; }
};
