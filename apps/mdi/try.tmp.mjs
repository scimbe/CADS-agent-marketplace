import Skat from "./src/engines/tisch/skat.js";
import Doko from "./src/engines/tisch/doko.js";
import B from "./src/engines/tisch/bauernskat.js";
import { makeTable } from "./src/engines/tisch/table.js";
import { botMove } from "./src/engines/tisch/bot.js";
import * as S from "./src/contract/session.js";
import { sha256 } from "./src/contract/sdk.js";
const games = { skat: Skat, doko: Doko, bauernskat: B };
const lv = JSON.parse(process.argv[2] || "{}");
for (const g of Object.keys(games)) {
  const T = makeTable(games[g], g);
  const card = { manifest: { id: "t-" + g, version: "1.0.0", players: { max: T.n }, hidden: "commit-reveal", secretSeats: [...Array(T.n).keys()], limits: { stateBytes: 65536 } }, ...T };
  const all = [...Array(T.n).keys()];
  let i = 0; const ent = () => sha256("e" + g + (i++)).slice(0, 32);
  const { secrets, commits } = S.makeSecrets(card, all, ent);
  let s = S.newSession(card, { params: { runden: 2, regeln: [] }, seed: "seed-" + g, mine: all, secrets, commits });
  const t0 = Date.now(); let n = 0;
  for (;;) {
    const st = S.status(card, s); if (st.over) break;
    const mv = S.dueReveal(card, s) || botMove(T, card.observe(s.state, st.turn), st.turn, { level: lv[st.turn % 2] || 2, seed: "x" + n });
    s = S.apply(card, s, mv); n++;
  }
  const p = s.state.pub;
  console.log(g, "inputs", n, "ms", Date.now() - t0, "score", p.score, "hist", JSON.stringify(p.hist), p.last.audit, p.last.result && p.last.result.winner);
}
