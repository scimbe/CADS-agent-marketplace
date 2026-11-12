// Zugkarte "Was kostet das?" (alt quiz-preis, quizspiele.js preis) mit der eingeklappten Variante "Fünf mal schätzen"
// (alt raum-schaetzen, turns.js GAMES.schaetzen: Tageskarte, eine Person; mit Paket die Schätzfragen der Quiz-Engine).
// Tageskarte: params.tag = Tagesnummer (UTC-Tage seit 1970) als Seed – wie alt turn-ui (seed = Turns.today()); die
// Karte kennt keine Uhr, den Tag setzt der Host.
import manifest from "./manifest.json" with { type: "json" };
import TEXTS from "../../engines/quiz/texts.json" with { type: "json" };
import { makeCard } from "../../engines/quiz/flow.js";
import { packOf, packGame, preisGame, schaetzenGame } from "../../engines/quiz/games.js";
import { gameSeed } from "../../engines/seed32/seed32.js";

export const VARIANTS = { preis: { de: "Was kostet das?", en: "Guess the price" }, schaetzen: { de: "Fünf mal schätzen", en: "Five guesses" } };

export default makeCard(manifest, {
  texts: TEXTS,
  setup(params, rng) {
    const g = params.variante === "schaetzen" ? "schaetzen" : "preis";
    const seed = Number.isInteger(params.tag) && params.tag > 0 ? String(params.tag) : gameSeed(rng);
    return { g, seed, pk: g === "schaetzen" ? packOf(params, "schaetzen") : null };
  },
  game(pub) { return pub.g === "preis" ? preisGame() : pub.pk ? packGame(pub) : schaetzenGame(); }
});
