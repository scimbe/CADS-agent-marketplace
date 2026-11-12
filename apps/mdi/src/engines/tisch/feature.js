// Erweiterung der App (ADR 0001 g): Strang T stellt dem Renderer das Kartenbild fuer das Widget pcard bereit.
import { cardSvg } from "./deck.js";

export default { id: "tisch", env: { cardSvg } };
