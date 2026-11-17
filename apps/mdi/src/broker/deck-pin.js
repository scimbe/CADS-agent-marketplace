// Gepinnter oeffentlicher Schluessel des Community-Decks (Ed25519, roh, base64url) je Host der Seite. Ein gepinnter Host
// nimmt nur ein Deck an, das mit genau diesem Schluessel signiert ist; der Schluessel vom Server zaehlt dort nicht.
// Herkunft: GET /api/duell/deck/key der Produktion am 2026-11-12, kid 6Ijl6K6M. Der Server liest den privaten Schluessel
// aus DUELL_DECK_SIGN_KEY (CADS-DEMO-wrapper lib/duell-deck.mjs loadKey; ohne ihn startet ein Deck mit Datei nicht,
// strict). Schluesselwechsel: neuen oeffentlichen Schluessel hier eintragen und ausliefern, bevor der Server wechselt.
// Andere Hosts (lokal, Tests, Staging): kein Pin, der Schluessel kommt vom selben Server (wie im Altcode PIN = "").
export const DECK_PINS = Object.freeze({
  "demos-34a13a96.bunsenbrenner.org": "Fb1VF61mb3WdeKMETv-x1keoo4IqMmHKIZ2x1KM2wok",
  "bunsenbrenner.org": "Fb1VF61mb3WdeKMETv-x1keoo4IqMmHKIZ2x1KM2wok"
});
/** Pin fuer einen Host oder "" */
export function pinFor(host) { const h = String(host || "").toLowerCase(); return Object.prototype.hasOwnProperty.call(DECK_PINS, h) ? DECK_PINS[h] : ""; }
