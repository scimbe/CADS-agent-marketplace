# 2026-11-11 Probelauf Test-Runner labor-setup.de

- Stand: `main` von scimbe/CADS-agent-marketplace (Klon ohne Zugangsdaten).
- Ablauf: Klon, `npm ci`, zwei Builds, Unit-Tests, 75 e2e-Dateien mit 10 parallelen Containern (je 2,5 Kerne, 4 GB).
- Gesamtdauer inkl. Klon, Install und Build: **12:45 min**.
- Ergebnis: Unit **680/680**, e2e **389/390**.
  - Einziger Fehler: `vorschau.e2e.js` „Screenshot-Vergleich“, `zug-auktion: mittlere Abweichung 7.30`. Vermutlich
    Unterschied der Schriftdarstellung Linux-Container vs. macOS-Aufnahme der Vorschaubilder; kein Funktionsfehler.
    Folge: Vorschaubilder künftig im selben Container aufnehmen wie prüfen.
  - `collab.e2e.js` und `noto.e2e.js` sind hier grün (lokal beim Bildpreis-Agenten rot) → lokale Umgebung war die Ursache.
- Hygiene: Container mit `--rm`; das Skript löscht Laufordner älter als 3 Tage unter `~/mdi-runner/`.
- Skript: `tools/remote/labor-test.sh <ref> [app-dir] [parallel]`, Auswertung über TAP-Zusammenfassung.
