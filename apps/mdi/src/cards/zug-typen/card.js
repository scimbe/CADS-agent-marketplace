// Zugkarte "Wer von uns ist …?" (alt zug-typen): Gruppenquiz aus einem Gruppenpaket (m "g"). Wer die Karte macht,
// schickt nur; jede Person spielt allein auf dem eigenen Handy und sieht ihre Stärke, ohne Rangliste (alt quizpack.js).
import manifest from "./manifest.json" with { type: "json" };
import TEXTS from "../../engines/quiz/texts.json" with { type: "json" };
import { makeCard } from "../../engines/quiz/flow.js";
import { packOf, packGame } from "../../engines/quiz/games.js";
import { gameSeed } from "../../engines/seed32/seed32.js";

export default makeCard(manifest, {
  texts: TEXTS,
  setup(params, rng) { return { g: "typen", seed: gameSeed(rng), pk: packOf(params, "typen", true) }; },
  game(pub) { return pub.pk ? packGame(pub) : null; }
});
