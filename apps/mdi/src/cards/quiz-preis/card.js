// Zugkarte "Was kostet das?" (alt quiz-preis, quizspiele.js preis) mit der eingeklappten Variante "Fünf mal schätzen"
// (alt raum-schaetzen, turns.js GAMES.schaetzen: Tageskarte, eine Person; mit Paket die Schätzfragen der Quiz-Engine).
// Tageskarte ohne Paket: Seed = Tagesnummer (UTC-Tage seit 1970) wie alt turn-ui (seed = Turns.today()). Die Karte kennt
// keine Uhr: manifest.inputDay, der Host stempelt jede Eingabe mit d; der erste Zug legt den Seed fest (flow.js), die
// Ansicht davor nimmt ctx.today.
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
    const pk = g === "schaetzen" ? packOf(params, "schaetzen") : null;
    return { g, seed: g === "schaetzen" && !pk ? "" : gameSeed(rng), pk };
  },
  game(pub) { return pub.g === "preis" ? preisGame() : pub.pk ? packGame(pub) : schaetzenGame(); }
});
