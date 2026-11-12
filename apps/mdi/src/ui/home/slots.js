// Einhaengestellen fuer andere Straenge (abgestimmt mit Strang K und F). Ein Strang ersetzt hier genau sein null durch einen
// Import; die Heimseite rendert sonst ihren eigenen, ehrlichen Platzhalter (Route "Eigene Karte" sagt: kommt).
//   freiEntry(state, X, dispatch)      -> vnode   Einstieg "Eigene Karte" (Strang K), unter Hauptknopf, Regal oben, Route eigene
//   freiDeckShelf(state, X, dispatch)  -> vnode   Regal-Abschnitt "Von anderen" (Community-Deck, Strang K)
//   freiView(state, X, dispatch, L)    -> { body, panel, actions, heading }   Blaetter inhalt.frei.* (Strang K)
//   kiButton(state, X, dispatch, part) -> vnode   "Mit KI" im Bearbeiten-Dialog fuer Teile mit x-model (Strang K, Label von K)
//   thumbOf(id)                        -> data-URL | null   16:9-Startbild der Karte (Strang F, scripts/thumbs.js, ADR 0001 §d)
import { freiEntry, freiDeckShelf, freiView, kiButton } from "../../features/frei/view-core.js";   // Strang K (freiView aus dem Teil "frei-ui")

export const SLOTS = { freiEntry, freiDeckShelf, freiView, kiButton, thumbOf: null };
