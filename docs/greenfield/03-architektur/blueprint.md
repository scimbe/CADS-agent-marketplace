# Blueprint (Entwurf, wird nach der Varianten-Bewertung als ADR festgeschrieben)

1. **Karten-Vertrag** für alle Karten: Manifest (`id`, `kind`, Capabilities `solo|bot|duel|image|relay|photo`, JSON-Schema für Parameter und Zustand) + `init/step/view/status` (Verallgemeinerung des Code-Modus-SDK). Handgebaute und erzeugte Karten sind gleich; Robot/Magie gelten damit überall.
2. **Zentrale State-Machine** besitzt den App-Zustand: Regal → Karte → Anpassen → Spielen(allein|bot|duell) → Teilen → Empfangen. Karten ändern keine fremde UI.
3. **Zero-Trust-Grenzen:** erzeugte Karten in Sandbox (iframe `sandbox="allow-scripts"`, CSP `default-src 'none'`); Schema-Prüfung an jeder Grenze (Link-Fragment, postMessage, LLM-Antwort); bei Fehler ablehnen mit Grund.
4. **Capability-Broker:** Live (ct-agent WASM + WebRTC), Bild, Speicher, Relay nur über den Broker; Berechtigung entscheidet der Server per signiertem Grant.
5. **Ein Auth-Modell** für Web und Apps.
6. **Ein Erzeugungsweg:** Basis (Prompt oder Deck-Karte) ist nur Eingabe → feste Felder oder Code → statische Prüfung → Bot-Playtests → Signatur.
7. **Harness:** Belohnung = Übereinstimmung mit eingefrorenem, menschlich bewertetem Gold; Judge wird dagegen kalibriert.

Nur FOSS. State-Machine: XState vs. kleine eigene Implementierung, Entscheidung nach Bundle-Budget.
