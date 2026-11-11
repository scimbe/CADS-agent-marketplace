# Greenfield: My Daily Idea (duell-web)

Gemeinsame Ablage für alle Agenten und Menschen, die am Neuentwurf des Web-Clients arbeiten.
Live-Stand bis zur Umschaltung: `apps/duell-web` (Altcode). Der Altcode wird nicht weiter umgebaut,
sondern dient als **genaue Spezifikation der Fragmente**.

## Struktur

| Ordner/Datei | Inhalt | Wer schreibt |
|---|---|---|
| `00-auftrag.md` | Auftrag, Entscheidungen des Users im Wortlaut, feste Regeln | Koordinator |
| `entscheidungen.md` | Entscheidungslog (Datum, Entscheidung, Quelle) | Koordinator |
| `offen.md` | offene Fragen an den User | alle (anhängen) |
| `01-analyse/` | Anti-Patterns mit Belegen | Analyse |
| `02-spec/` | Fragment-Spezifikation aus dem Altcode (je Bereich eine Datei) | Spezifikation |
| `03-architektur/` | Blueprint, Varianten-Bewertung | Architektur |
| `04-ux/` | Zustände, Progressive Disclosure | UX |
| `05-bindung/` | Bindung ohne Manipulation | UX |
| `06-plan/` | Schnitte (Slices), Abnahmekriterien, Stand | Koordinator |
| `07-protokoll/` | Ein Bericht je Agentenauftrag: `JJJJ-MM-TT-<thema>.md` | jeder Agent |
| `../adr/` | Architekturentscheidungen (ADR), fortlaufend nummeriert | Architektur |

## Regeln für Agenten

1. **Vor dem Start lesen:** `00-auftrag.md`, `entscheidungen.md`, `01-analyse/antipatterns.md`, den eigenen Slice in `06-plan/`.
2. **Nach dem Ende schreiben:** einen Bericht in `07-protokoll/` (Ziel, Ergebnis, PR-Links, Testbelege, offene Punkte). Offene Fragen zusätzlich in `offen.md`.
3. **Belege statt Behauptungen:** Datei:Zeile, Testname, Log-Auszug.
4. **Keine Geheimnisse** in dieser Ablage (keine Schlüssel, Tokens, Gutscheincodes, Passwörter).
5. **Nur Präsens, Ist-Zustand;** keine Zeitbezüge wie „bald“ oder „neu“ in Nutzertexten.
6. Schreibende Arbeit an Code nur in eigenen Worktrees/Branches; diese Ablage wird per PR auf `main` gebracht.
7. **Forschung je Schritt:** Vor jeder Entscheidung aktuelle Forschung und etablierte Best Practices recherchieren (Primärquellen bevorzugt: Paper, Standards, offizielle Doku). Ergebnis als `08-forschung/<thema>.md` mit Quellen (Titel, Autor/Herausgeber, Jahr, Link) und der daraus abgeleiteten Lösung. Keine Quelle erfinden; Unsicheres als unsicher kennzeichnen.
8. **Sprecher:** Mit dem User spricht nur die Sprecher-Session. Sie leitet nicht, sondern vermittelt; Entscheidungen stehen im Wortlaut in `entscheidungen.md`.
