# Blueprint (Entwurf, wird nach der Varianten-Bewertung als ADR festgeschrieben)

1. **Karten-Vertrag** für alle Karten: Manifest (`id`, `kind`, Capabilities `solo|bot|duel|image|relay|photo`, JSON-Schema für Parameter und Zustand) + `init/step/view/status` (Verallgemeinerung des Code-Modus-SDK). Handgebaute und erzeugte Karten sind gleich; Robot/Magie gelten damit überall.
2. **Zentrale State-Machine** besitzt den App-Zustand: Regal → Karte → Anpassen → Spielen(allein|bot|duell) → Teilen → Empfangen. Karten ändern keine fremde UI.
3. **Zero-Trust-Grenzen:** erzeugte Karten in Sandbox (iframe `sandbox="allow-scripts"`, CSP `default-src 'none'`); Schema-Prüfung an jeder Grenze (Link-Fragment, postMessage, LLM-Antwort); bei Fehler ablehnen mit Grund.
4. **Capability-Broker:** Live (ct-agent WASM + WebRTC), Bild, Speicher, Relay nur über den Broker; Berechtigung entscheidet der Server per signiertem Grant.
5. **Ein Auth-Modell** für Web und Apps.
6. **Ein Erzeugungsweg:** Basis (Prompt oder Deck-Karte) ist nur Eingabe → feste Felder oder Code → statische Prüfung → Bot-Playtests → Signatur.
7. **Harness:** Belohnung = Übereinstimmung mit eingefrorenem, menschlich bewertetem Gold; Judge wird dagegen kalibriert.

Nur FOSS. State-Machine: XState vs. kleine eigene Implementierung, Entscheidung nach Bundle-Budget.

## Verbindliches Ziel: Skalierung hinter einer Domain

User (Wortlaut): „Ziel in der Architektur muss sein, das das system hinter einer domain über loadsharign und sharding auf verschiede systeme aufgeteilt werden kann um nutzungspitzen auch mit hybirden cloud strukturen abzufangen“

Folgerungen für den Entwurf (werden in der Bewertung mit Forschung/Best Practice belegt):
- **Zustandslose App-Schicht:** Jede Instanz kann jede Anfrage bedienen (12-Factor); Sitzungs- und Kontozustand liegt nicht im Prozess.
- **Load Sharing** über einen L7-Eingang vor der Domain (FOSS, z. B. HAProxy/Traefik/Envoy; Health-Checks, Drain beim Deploy).
- **Sharding des Zustands** nach stabilem Schlüssel (Konto-ID für Guthaben/Karten, Kanal-ID für Live-Signalisierung), z. B. Consistent/Rendezvous Hashing; Kanal-Affinität nur dort, wo Signalisierung es braucht.
- **Hybride Kapazität:** dieselben Container laufen on-prem (ssh-united, labor-setup.de), im ICC-Kubernetes und bei Bedarf in einer Cloud; Burst-Kapazität wird über den Eingang zugeschaltet.
- **Teure Dienste entkoppelt** (Haiku-Erzeugung, Bilder, Code-Playtests) über Warteschlangen mit Rückdruck und ehrlicher „busy“-Antwort statt Überlast.
- **Statische Teile** (Client-Bundle) über CDN/Cache, unabhängig von der App-Schicht.
- **Portabilität:** OCI-Container, Konfiguration über Umgebung, keine anbieterspezifischen APIs im Kern.
