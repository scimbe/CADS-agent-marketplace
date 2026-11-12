// Bauernskat: Karte nach dem Kartenvertrag ueber die Tisch-Engine (src/engines/tisch, Regeln bauernskat.js aus dem Altcode).
import manifest from "./manifest.json" with { type: "json" };
import B from "../../engines/tisch/bauernskat.js";
import { makeTable } from "../../engines/tisch/table.js";
import { tableView } from "../../engines/tisch/view.js";
import { botMove } from "../../engines/tisch/bot.js";

const T = makeTable(B, "bauernskat");

export default {
  manifest,
  init: T.init, deal: T.deal, step: T.step, status: T.status, moves: T.moves, observe: T.observe, accepts: T.accepts,
  // Determinisierung auf Vertragsebene: fremde Schluessel lassen sich nicht auslosen (sie muessten zum oeffentlichen
  // Deck passen). Die Welt enthaelt deshalb nur die eigene Sicht; gespielt wird ueber bot() auf Regelebene.
  sample: (obs, seat) => ({ pub: obs.pub, priv: obs.pub.score.map((_, s) => (s === seat ? obs.mine : null)) }),
  view: (obs, seat, ctx) => tableView(T, manifest, obs, seat, ctx),
  // Bot (Strang F ruft ihn ueber den Bot-Agenten): Stufe 1 = Auto-Zug wie im Altcode, 2/3 = Regeln + ISMCTS
  bot: (obs, seat, opts) => botMove(T, obs, seat, opts),
  // Auto-Zug nach 20 s im Live (Host-Zeitgeber, ADR 0001): der Auto-Zug des Altcodes (Regeln auto(), Stufe 1)
  auto: (obs, seat) => botMove(T, obs, seat, { level: 1, seed: "auto" }),
  engine: T
};
