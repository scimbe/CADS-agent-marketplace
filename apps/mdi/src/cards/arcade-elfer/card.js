// Elfer-Duell (Arcade-Duell, Engine E4 src/engines/arcade, Spiel "elfer"). Regeln, Bot und Anzeige liegen in der Engine.
import manifest from "./manifest.json" with { type: "json" };
import { makeCard } from "../../engines/arcade/card.js";

export default makeCard("elfer", manifest);
