// Generischer Bot: Single-Observer-ISMCTS (Cowling, Powley, Whitehouse 2012) ueber den Kartenvertrag.
// Plant nur aus observe(); verdeckte Teile kommen aus card.sample() (Determinisierung). Budget in Iterationen,
// Zufall nur aus dem Seed: gleicher Seed + Budget => gleicher Zug auf jedem Geraet (08-forschung/generische-bots.md).
import { rng as mkRng, canon, logD } from "../contract/sdk.js";

export const LEVELS = [{ id: 1, iterations: 60 }, { id: 2, iterations: 400 }, { id: 3, iterations: 2000 }];
const C = 0.7, MAX_DEPTH = 64;

function key(m) { return canon(m); }
function reward(status, seat) {
  if (status.winner === seat) return 1;
  if (status.winner === -1) return 0.5;
  return 0;
}

/**
 * @param card    Kartenmodul (Vertrag)
 * @param obs     card.observe(state, seat) – alles, was der Bot wissen darf
 * @param seat    Sitz des Bots
 * @param opts    { iterations, seed }
 * @returns       Eingabe (eine der card.moves(obs, seat))
 */
export function chooseMove(card, obs, seat, { iterations, seed }) {
  const legal = card.moves(obs, seat);
  if (!legal.length) throw new Error("bot: keine Zuege");
  if (legal.length === 1) return legal[0];
  const r = mkRng("bot|" + seed);
  // Knoten: { visits, avail, wins, kids: Map<key, node>, move }
  const root = { visits: 0, avail: 0, wins: 0, kids: new Map(), move: null, who: -1 };
  for (let it = 0; it < iterations; it++) {
    let state = card.sample(obs, seat, r);
    let node = root;
    const path = [root];
    let depth = 0;
    // Auswahl/Erweiterung ueber die in dieser Welt verfuegbaren Zuege
    for (;;) {
      const st = card.status(state);
      if (st.over || depth > MAX_DEPTH) break;
      const who = st.turn;
      const moves = card.moves(card.observe(state, who), who);
      if (!moves.length) break;
      for (const m of moves) { const c = node.kids.get(key(m)); if (c) c.avail++; }
      const untried = moves.filter((m) => !node.kids.has(key(m)));
      if (untried.length) {
        const m = untried[r.int(untried.length)];
        const child = { visits: 0, avail: 1, wins: 0, kids: new Map(), move: m, who };
        node.kids.set(key(m), child);
        state = card.step(state, m, r);
        path.push(child); node = child; depth++;
        break;
      }
      let best = null, bv = -1;
      for (const m of moves) {
        const c = node.kids.get(key(m));
        const v = c.wins / c.visits + C * Math.sqrt(logD(c.avail) / c.visits);
        if (v > bv) { bv = v; best = c; }
      }
      state = card.step(state, best.move, r);
      path.push(best); node = best; depth++;
    }
    // Zufalls-Rollout bis zum Ende
    for (let d = 0; d < MAX_DEPTH; d++) {
      const st = card.status(state);
      if (st.over) break;
      const moves = card.moves(card.observe(state, st.turn), st.turn);
      if (!moves.length) break;
      state = card.step(state, moves[r.int(moves.length)], r);
    }
    const fin = card.status(state);
    for (const n of path) { n.visits++; if (n.who >= 0) n.wins += reward(fin, n.who); }
  }
  // robustes Kind: meiste Besuche; Gleichstand nach Reihenfolge der legalen Zuege (deterministisch)
  let best = legal[0], bv = -1;
  for (const m of legal) { const c = root.kids.get(key(m)); const v = c ? c.visits : 0; if (v > bv) { bv = v; best = m; } }
  return best;
}
