// CSP des Spielrahmens und der lokalen Host-Seite: eine Quelle fuer Auslieferung (scripts/spiel/runner.mjs, spaeter der
// echte Spiel-Ursprung) und Einbettung (spiel-host.js setzt dieselbe Policy als iframe.csp). Rein, ohne Abhaengigkeiten.
//
// Fail closed ueber zwei Wege:
//  1. Host: iframe.csp = frameCsp(...). Chromium zeigt den Rahmen nur, wenn die ausgelieferte Kopfzeile diese Policy
//     mindestens erzwingt (CSP Embedded Enforcement); sonst laedt der Rahmen nicht und es laeuft kein Spielcode.
//  2. Rahmen: prueft beim Start opaken Ursprung (sandbox) und eine gesperrte, gemeldete Bild-Probe (CSP aktiv) und
//     verweigert sonst.
// "sandbox allow-scripts" steht zusaetzlich in der Kopfzeile: der Rahmen bleibt opak, auch wenn ihn jemand ohne
// sandbox-Attribut einbettet oder direkt oeffnet.

/** CSP des Spielrahmens: kein Netz, keine Bilder/Medien/Schriften von aussen, keine dynamische Code-Auswertung; Worker und Spielcode nur als blob:. */
export function frameCsp(frameOrigin, hostOrigin) {
  return ["default-src 'none'", "script-src " + frameOrigin + " blob:", "worker-src blob:", "style-src " + frameOrigin, "connect-src 'none'", "img-src 'none'",
    "media-src 'none'", "font-src 'none'", "frame-src 'none'", "object-src 'none'", "form-action 'none'", "base-uri 'none'", "frame-ancestors " + hostOrigin,
    "sandbox allow-scripts"].join("; ");
}
export function hostCsp(hostOrigin, frameOrigin) {
  return ["default-src 'none'", "script-src " + hostOrigin, "connect-src " + hostOrigin, "style-src " + hostOrigin, "frame-src " + frameOrigin, "base-uri 'none'"].join("; ");
}
