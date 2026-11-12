// Zugkarte "Frag mich ab" (alt zug-abfragen) mit der eingeklappten Variante "Quiz aus Lernstoff" (alt zug-quiz).
// Ohne Paket: vier eigene Lernkarten je Person (alt turns.js GAMES.abfragen). Mit Paket (Nachtpaket oder eigenes, z. B.
// von der KI-Art quiz): die Spiele der Quiz-Engine (alt quizpack.js), Modus l/f/g wie im Altcode.
import manifest from "./manifest.json" with { type: "json" };
import TEXTS from "../../engines/quiz/texts.json" with { type: "json" };
import { makeCard } from "../../engines/quiz/flow.js";
import { packOf, packGame, ownGame } from "../../engines/quiz/games.js";
import { gameSeed } from "../../engines/seed32/seed32.js";

/** Titel der Spielarten (alt ideas.json zug-abfragen, zug-quiz). */
export const VARIANTS = { abfragen: { de: "Frag mich ab", en: "Quiz me" }, quiz: { de: "Quiz aus Lernstoff", en: "Quiz from your notes" } };

export default makeCard(manifest, {
  texts: TEXTS,
  setup(params, rng) {
    const g = params.variante === "quiz" ? "quiz" : "abfragen";
    return { g, seed: gameSeed(rng), pk: packOf(params, g) };
  },
  // Quiz braucht ein Paket (alt GAMES.quiz needs); ohne Paket gibt es keinen gültigen Zug (Ansicht: pk_need)
  game(pub) { return pub.pk ? packGame(pub) : pub.g === "abfragen" ? ownGame() : null; }
});
