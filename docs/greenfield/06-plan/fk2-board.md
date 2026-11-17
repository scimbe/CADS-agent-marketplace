# Board: Freie Karte 2 und Fix-Release

Dieses Board ist die einzige Koordinationsstelle für alle Agenten. Freigabe des Users vom 17.11. abends: „dann baue es und nutze gerne auch einen swarm wenn dies arbeiten beschleunigen kann, nutze aber nur zentrale dateien als koordination und dieses agenten als mediator“.

## Regeln
- Lies das Board vor Arbeitsbeginn und trage deinen Stand hier ein: Status, Commit, Zahlen.
- Ändere nur deine eigene Zeile und die Abschnitte „Ergebnisse“ und „Fragen“, nichts anderes.
- Jeder Agent arbeitet auf einem eigenen Branch. Zwei Agenten fassen nie dieselben Dateien an. Überschneidungen trägst du unter „Abhängigkeiten“ ein.
- Entscheidungen stehen nur in `docs/greenfield/entscheidungen.md`, Releases nur im Release-Protokoll unter `07-protokoll/`.
- Kein Agent spricht den User oder andere Sessions direkt an. Fragen an den User schreibst du unten unter „Fragen“. Der Integrator (Session Marketplace) gibt sie an den Vermittler weiter.
- Für jeden Release gilt: Labor (fail=0, cancelled=0), Review, Staging, Rollback-Container, Live-Prüfung. core und Keycloak fasst niemand an. Am 18.11. ab 08:15 ist Antestat.
- Statuswerte: offen · läuft · PR offen · Labor grün · gemergt · live · blockiert

## Aufgaben

| ID | Aufgabe | Agent | Repo/Branch | PR | Status | Abhängigkeiten |
|---|---|---|---|---|---|---|
| A1 | P2 Spiel-API, Sandbox, Bot-Runner | fk2-api-fix | app `feat/fk2-spiel-api` | #329 | Labor grün (1443/0, e6082a3e) | – |
| A2 | P1 Klärungsdialog + Tester-Modus `DUELL_KLAERUNG=tester` + ehrlicher Bau-Zustand ohne P3 | fk2-p1-dialog | app `feat/fk2-klaerung`, wrapper `feat/fk2-klaerung` | #330, wrapper #144 | PR offen (Draft): app c7e5f343 (npm test 1096/0, e2e 19/0), wrapper 6795a3c (duell-klaerung 14/0; Gesamt 750/3/1, die 3 Zeittests bei Load 260 ohne Bezug, vorher 751/0/1) | `lib/duell-tester.mjs` von A2 angelegt (A5-Branch war noch nicht auf origin): `parse(raw)`, `createTesters({ env, acctOf }) -> { isTester(acct), size }`; beim Zusammenführen bleibt eine Datei |
| A3 | P3 Bau-Worker (eigener Container), Spiel-Ursprung :8794, P4 Push/Mail „Karte fertig“ | fk2-p3p4 | app `feat/fk2-p34`, wrapper `feat/fk2-p34` | – | läuft (Code + Unit/E2E lokal grün, PRs folgen) | baut auf A1, A2, Prototyp #331 auf; ändert `lib/duell-klaerung.mjs`, `features/frei/klaerung.js`/`klaeren*.js` (Überschneidung mit A2-Tester-Modus) |
| A4 | Fix: Klick/Doppelklick/Enter auf dem Kalenderblatt | fix-blatt-klick | app `fix/blatt-klick` | #332 | PR offen, Labor läuft | – |
| A5 | Fix: KI-Ausfall sichtbar, Betreiber-Warnung, cron-Probe, Tester-Tagesgrenze `DUELL_TESTER_ACCTS` | ki-ausfall-fix | app + wrapper `fix/ki-ausfall-hinweis` | – | läuft | `lib/duell-tester.mjs` gemeinsam mit A2 |
| A6 | Fix: Flug-Spiel (Sprite-Mitte, Rundenende), Ziegel/Breakout-Steuerung, Desktop-Layout des Echtzeit-Hosts | fix-flugspiel | app `fix/flugspiel` | – | läuft | Echtzeit-Host: A7 und A8 nur minimal |
| A7 | Fix: Farbfelder statt Hex, Blasen-Muster für alle Karten | fix-editor-blasen | app `fix/editor-farben-blasen` | – | läuft | Host-Layout: A6 |
| A8 | Fix: Demo-Hinweis und Info-Seite „Über diese Demo“ | fix-demo-hinweis | app `fix/demo-hinweis` | – | läuft | Kopfzeile/Host: A6 |
| A9 | Test: alle Echtzeitspiele auf Desktop und Handy | tester-echtzeit | – (Bericht `07-protokoll/2026-11-17-echtzeit-test.md`) | – | läuft | Funde gehen an A6 bzw. A7 |
| A10 | Messung P3-Job gegen 0,41 (Variante A, unter 4 $) | offen | – | – | offen | A3 |
| A11 | Gesammeltes Fix-Release (A4–A8, A5-Tester, A2-Tester-Modus) | Integrator | Staging/ssh-united | – | offen | A2, A4–A8, Review |
| A12 | Release „Karte fertig“ für das Tester-Konto | Integrator | – | – | offen | A3, A10 |
| A13 | Deck-Befüllung: 70 Agenten (50 Spiele, 20 Karten), disjunkt, „(KI)“ | offen | – | – | offen | A12; Budget: Nachfrage ab 30 $ |
| R1 | Impressum und Datenschutz (Plan `06-plan/recht-plan.md`) | – | – | – | blockiert | Angaben des Users |

## Meilensteine
| Meilenstein | Ziel | Stand |
|---|---|---|
| Klärungsdialog live, nur für den Tester | 18.11. | offen |
| Messung P3-Job | 19.11. | offen |
| „Karte fertig“ live, nur für den Tester | 19.11. (20.11. bei Review-Befunden) | offen |
| Deck-Befüllung mit 70 Agenten | nach dem Tester-Durchlauf | offen |
| Für alle Nutzer | Ende der Woche | offen |

## Ergebnisse
- Null-Messung: Erfüllung 0,41, Spiele 0,20 (`08-forschung/fk2-nullmessung.md`)
- P3-Prototyp: Variante A, Spiele 0,85, Scheinangebote 0,5 %, 0,010 $ je Karte (`08-forschung/fk2-p3-messung.md`)
- Budget: verbraucht 5,71 $ von 100 $
- A2: Klärungsdialog P1 mit Review-Fixes, Tester-Modus und ehrlichem Bau-Zustand (`bau: 'nicht-verfuegbar'` ohne Worker). Wrapper #144, App #330, beide Draft. Gemeinsame Datei `lib/duell-tester.mjs` (Signatur siehe A2-Zeile).

## Fragen an den User
- Impressum und Datenschutz: Name bzw. Firma, Anschrift, Kontakt, Dienstleister, Log-Fristen (siehe `recht-plan.md`)
- A2: Wo soll die Löschung je Konto (`forget(owner)` in lib/duell-klaerung.mjs) an die Konto-Löschung angeschlossen werden? Im Wrapper gibt es dafür noch keinen gemeinsamen Haken.
