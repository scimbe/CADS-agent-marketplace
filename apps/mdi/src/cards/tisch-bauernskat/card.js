// Bauernskat: Karte nach dem Kartenvertrag ueber die Tisch-Engine (src/engines/tisch, Regeln bauernskat.js aus dem Altcode).
import manifest from "./manifest.json" with { type: "json" };
import B from "../../engines/tisch/bauernskat.js";
import { makeTable } from "../../engines/tisch/table.js";
import { tableView } from "../../engines/tisch/view.js";
import { botMove } from "../../engines/tisch/bot.js";

const T = makeTable(B, "bauernskat");

export default {
  manifest,
  init: T.init, deal: T.deal, step: T.step, status: T.status, moves: T.moves, observe: T.observe,
  view: (obs, seat, ctx) => tableView(T, manifest, obs, seat, ctx),
  // Bot (Strang F ruft ihn ueber den Bot-Agenten): Stufe 1 = Auto-Zug wie im Altcode, 2/3 = Regeln + ISMCTS
  bot: (obs, seat, opts) => botMove(T, obs, seat, opts),
  engine: T
};
