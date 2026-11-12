# Design: wie aus einem Ei, plattformtreu

User (Wortlaut): „wichtig ist das die App, trotz webconference, den spielen, die karten und co wie aus einem Ei erscheint.
Claude design soll auch moeglichst intensiv nach loesungen befragt und im swarm (ohne vorwissen) und mit saubren
retieren befragt und kritisiert und optimiert werden. Recherchiere hier auch wichtige wissenschaftlcihe erkenntnise um
auch eine hohe plattformatrue zu erzuegen. Dies git fuer die normale sicht, die buisness sicht und den jeweiligen
android oder ios apps“

## Geltungsbereich
Vier Oberflächen: Web normal, Web Business, iOS-App, Android-App. Jede Karte, jedes Spiel, Live/Webkonferenz, Werkzeuge.

## Ein Design-System für alles
- Design-Tokens (Farbe, Typografie, Abstand, Radius, Bewegung, Elevation) als eine Quelle; Karten und Spiele bekommen
  Tokens über den Karten-Vertrag (view-Anzeigeliste nutzt nur Token-Namen) → erzeugte Spiele sehen aus wie handgebaute.
- Komponenten für Rahmen um jede Karte (Kopf, ✕, Blasen, Dialog, Hauptaktion unten) sind fest; Karten zeichnen nur
  innerhalb ihrer Bühne.
- Live/Webkonferenz nutzt dieselben Komponenten (keine eigene Optik).
- Plattformtreue: Navigation, Zurück-Geste, Teilen, Haptik, Systemschrift, Safe Areas, Dark Mode je Plattform nach
  Apple Human Interface Guidelines bzw. Material Design 3; Marke bleibt erkennbar (Gelb #FFD400, Tinte #111111,
  Rot #FF3B1D, Papier #FFF6DC).

## Prozess je Slice
1. Entwurf mit Claude Design (Design-Canvas), mehrere Varianten.
2. Swarm-Kritik ohne Vorwissen: Personas aus `scratchpad/personas` (16–85, verschiedene Hintergründe), die Bildschirme
   nur sehen und Aufgaben lösen; Ergebnis: Befunde mit Schwere.
3. Sauberes Iterieren: Befunde → Änderung → erneute Kritik, bis keine kritischen Befunde mehr; jede Runde in
   `07-protokoll/` mit Screenshots und Befundliste.
4. Prüfung auf echten Ansichten (Web 328/390/1280, iOS-Simulator, Android-Emulator), Hell/Dunkel, Zoom 200 %.

## Werkzeug-Hinweis
Der Claude-Design-Konnektor meldet zurzeit „FIRST_PARTY_AUTH_REJECTED“ (HTTP 403). Er braucht ein erneutes Anmelden
(`/design-login`) durch den User; bis dahin laufen Design-Varianten als HTML-Canvas und die Swarm-Kritik über Subagenten.
