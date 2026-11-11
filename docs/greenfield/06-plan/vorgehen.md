# Vorgehen: Phasen, Prüfpunkte, Definition of Done

Gilt für alle Agenten und Sessions am Neuentwurf. Es ersetzt das bisherige Vorgehen „dünne Slices direkt live“ (`slices.md`, `slices-detail.md` bleiben als Inventar).

## Auftrag des Users (2026-11-11)

> „versuch einfach professionell zu arbeiten und nicht andauernd workaround und vereinfachungen zu suchen. du hast tage zeit das projekt zuende zu bringen, mache es professional systematisch und methodenkorrekt“

> „Es soll nicht vereinfacht werden ganz im Gegenteil die Vielfalt ist nur besser zu Strukturieren und zu konsolidieren hinsichtlich der benutzerfuhrung“

## Was bisher falsch lief

| Fehler | Folge | Regel ab jetzt |
|---|---|---|
| D0 mit 2 Karten ersetzte die alte App live | Funktionsumfang für Nutzer weg | Umschaltung erst bei Parität und nach Abnahme auf Staging (Phase F) |
| Design ohne abgenommenen Entwurf gebaut | schlichte UI, Knöpfe übereinander, Bluff-Karte nicht intuitiv | erst Design-Abnahme (Gate C), dann Code |
| Tests prüften Zustände, nicht die Wahrnehmung | Verdeckung blieb unentdeckt | Verdeckungs-, Fit- und visueller Vergleich sind Pflicht |
| Produkt aus Sicht der Technik gedeutet (Regal ≈ Nebensache) | falsches Verständnis von Tageskarte, Regal, Archiv | Phase A: Ist-Produkt belegt verstehen, vom User bestätigen lassen |
| Werkzeug mit stillem Rückfall (Runner: kurze SHA → main) | falsch-grüne Läufe möglich | Werkzeuge lehnen ab statt auszuweichen |

## Phasen und Prüfpunkte

| Phase | Inhalt | Ergebnis | Gate (wer gibt frei) |
|---|---|---|---|
| **A Ist-Analyse** | Alte App ausführen und belegen: Navigation, Produktidee, alle Karten, Engines, Abläufe, Gestaltung. Die 166 alten Testdateien als ausführbare Spezifikation erfassen. | `02-spec/12-paritaet.md`, `02-spec/13-produktverstaendnis.md`, Screenshot-Atlas | **A: User bestätigt das Produktverständnis** |
| **B Anforderungen** | Nutzungsabläufe je Persona (16–85); funktionale Anforderungen je Funktion mit Akzeptanzkriterien; nichtfunktionale Anforderungen: WCAG 2.2 AA, Leistungsbudget, Sicherheit/Datenschutz, Betrieb und Skalierung. **Rückverfolgung**: Anforderung → Akzeptanztest → Code. | `02-spec/14-anforderungen.md`, `02-spec/15-traceability.md` | B: Review durch unabhängigen Agenten, offene Fragen an den User |
| **C Gestaltung** | Informationsarchitektur; Design-System und alle Bildschirme in Claude Design (Session „design“); klickbarer Prototyp. Bewertung: heuristische Evaluation (Nielsen), kognitiver Walkthrough je Persona, Kritik ohne Vorwissen, Barrierefreiheit. Iteration, bis keine schweren Befunde bleiben. | Design-Canvas plus Bewertungsprotokolle in `04-ux/` | **C: User nimmt die Entwürfe ab** |
| **D Architektur** | KONZEPT.md an Phase A–C anpassen (Tageskalender als Kern, Regal, Archiv, freie Karte für völlig neue Spiele); Entscheidungen als ADR; Schnittstellen zum Wrapper (vorhandene API wiederverwenden). | ADRs in `03-architektur/adr/` | D: Architektur-Review (unabhängig) |
| **E Umsetzung** | Abschnitte P1–P10 aus 12-paritaet.md, je Abschnitt vollständig, ohne Teilumfang. | PRs je Abschnitt | E: DoD (unten) erfüllt, Code-Review unabhängig |
| **F Freigabe** | Staging-Umgebung, gleiche Herkunft wie Produktion; Abnahmetest gegen Phase B; Rauchtest; Rollback geprobt. | Release-Protokoll | **F: User gibt Produktion frei** |

## Definition of Done je Abschnitt (Phase E)

1. **Akzeptanztests:** Jedes Akzeptanzkriterium aus Phase B hat einen automatischen Test. Die passenden alten Tests sind portiert („Alt-Orakel“), alles ist grün.
2. **e2e auf den Ansichten 360×740, 390×844, 412×915 und 1280×800:**
   - kein verdecktes Bedienelement
   - Kernhandlung im ersten Bildschirm
   - kein waagerechter Überlauf
   - axe 0 Verstöße (WCAG 2.2 AA)
   - große Schrift und einfache Sprache geprüft
3. **Visueller Vergleich:** gegen die abgenommenen Entwürfe aus Phase C; jede Abweichung ist begründet.
4. **Läufe:** Unit, e2e und Determinismus laufen auf labor-setup.de, mit Branch-Namen statt kurzer SHA. Die Ergebnisse stehen mit Zahlen im PR.
5. **Reviews:** Code-Review durch einen Agenten ohne Vorwissen. Bei Konto, Geld, Token oder Netz zusätzlich ein Security-Review.
6. **Doku:** Protokoll in `07-protokoll/`; Entscheidungen in `entscheidungen.md`.
7. **Kein Deploy ohne Phase F.**

## Methoden je Schritt

- Aktuelle Forschung und Best Practice recherchieren, mit Quellen in `08-forschung/`.
- Auftrag an einen Agenten = Ziel, Quellen, Abnahmekriterien. Ergebnisse prüfe ich selbst nach (Diff und Testläufe lesen), bevor ich sie dem User melde.
- Keine Abkürzung als Lösung. Muss etwas warten (z. B. Keycloak-Freigabe), wird es als offen geführt, nicht umgangen.
