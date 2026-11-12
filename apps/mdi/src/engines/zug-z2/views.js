// Ansichten fuer Prompt-Arten der Z2-Karten, die nicht im Zug-Kern liegen (src/engines/zug/widgets.js). Jede Funktion
// uebersetzt einen Alt-Prompt in ein Widget von Strang F (ADR 0001, Inventar) und gibt ihm nur Daten mit: die Uhr,
// das Mikrofon und das Zeichnen haelt das Widget, die Karte bekommt am Ende den Wert (Wertform wie okAnswer).
import { askText } from "../zug/widgets.js";
import { blockAt, MAX_BLOCKS } from "../../cards/zug-steine/game.js";
import { sockAnswer } from "../../cards/zug-socken/game.js";
import { DOOR_RULES, doorOrder, doorBeing, doorIn } from "../../cards/zug-kreis/game.js";
import { D, pair } from "./lib.js";

const MARK = ["far", "near", "hit"];
/** Vorlage der Eingabe: der Host setzt den Wert ein (Format laut Absprache Z1/F). */
export function submitOf(c) { return { t: "ans", seat: c.seat }; }
function base(p, c, extra) {
  const node = { t: p.w, id: "w" + c.step, label: askText(p, c), submit: submitOf(c), ...extra };
  if (p.peek) node.peek = p.peek(c.doc, c.m, c.now, c.lang);
  if (p.top) node.top = p.top(c.doc, c.m, c.lang);
  if (p.auto) node.auto = true;
  return node;
}
const ints = (n) => Array.from({ length: n }, (x, i) => i);

export const VIEWS = {
  grid: (p, c) => base(p, c, { rows: 5, cols: 5, n: p.n }),
  probe: (p, c) => {
    const socks = p.socks(c.doc, c.m), marks = {};
    for (const k of ints(25)) marks[k] = MARK[sockAnswer(socks, k)];
    return base(p, c, { rows: 5, cols: 5, n: p.n, marks, before: p.before(c.doc, c.m), key: c.X.sok_key });
  },
  blocks: (p, c) => base(p, c, { size: 8, max: p.max || MAX_BLOCKS, shapes: ints((p.max || MAX_BLOCKS) + 2).map((i) => blockAt(c.doc, i)) }),
  hunt: (p, c) => base(p, c, { words: p.list(c.doc, c.m, c.lang), max: p.max }),
  clock: (p, c) => base(p, c, { secs: p.secs, text: p.text ? p.text(c.doc, c.m, c.lang) : "" }),
  explain: (p, c) => base(p, c, { secs: p.secs, max: p.max, words: p.list(c.doc, c.lang).slice(0, p.max) }),
  drop: (p, c) => base(p, c, { max: p.max, item: p.item(c.doc, c.lang), worth: p.worth(c.doc), msPerStep: 80 }),
  inner: (p, c) => base(p, c, { targets: p.targets(c.doc) }),
  blind: (p, c) => base(p, c, { tries: p.tries, goal: p.goal }),
  react: (p, c) => base(p, c, { plan: p.plan(c.doc) }),
  // Tuersteher (alt w "door", F "tuer"): Regelfolge und je Regel 40 Wesen mit der Antwort, alles aus dem Seed
  door: (p, c) => {
    const order = doorOrder(c.doc), rules = order.map((r) => {
      const prev = [], beings = [];
      for (let i = 0; i < 40; i++) { const b = doorBeing(c.doc, r, i, prev); const inn = doorIn(r, b); beings.push({ b, in: inn }); prev.push(inn); }
      return { label: pair(D.doorRules, r, c.lang), beings };
    });
    return { ...base(p, c, { secs: p.secs, streak: p.streak, rules }), t: "tuer" };
  },
  freeze: (p, c) => {
    const beat = c.now[0] ? c.now[0][0] : 0;
    return base(p, c, { beat: p.beat(beat), pauses: ints(p.max).map((r) => p.pause(c.doc, r)), statues: ints(p.max).map((r) => p.statue(c.doc, r, c.lang)), max: p.max });
  },
  touch: (p, c) => base(p, c, { max: 5 }),
  rec: (p, c) => base(p, c, { ms: p.ms, slot: p.slot }),
  once: (p, c) => base(p, c, { slot: p.slot, fx: p.fx(c.m), who: p.who(c.m) }),
  parrot: (p, c) => base(p, c, { from: p.from, slot: p.slot }),
  whose: (p, c) => base(p, c, { slot: p.slot(c.doc), fx: p.fx(c.doc), options: p.from(c.doc, c.m) })
};
export { DOOR_RULES };
