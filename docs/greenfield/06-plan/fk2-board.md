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
| A3 | P3 Bau-Worker (eigener Container), Spiel-Ursprung :8794, P4 Push/Mail „Karte fertig“ | fk2-p3p4 | app `feat/fk2-p34` (03c13488), wrapper `feat/fk2-p34` (0585bc8) | app #334, wrapper #146 (Draft) | PR offen (App-Unit 1141/1 – nur Lizenztest, SDK fehlt in mdi-kopf-node_modules; e2e 17/0; Wrapper 758/1, flaky Zeittest einzeln grün) | baut auf #329, #330/#144, #331; ändert `lib/duell-klaerung.mjs`, `features/frei/klaerung.js`, `klaeren*.js` (Überschneidung mit A2-Tester-Modus: vor Merge rebasen) |
| A4 | Fix: Klick/Doppelklick/Enter auf dem Kalenderblatt | fix-blatt-klick | app `fix/blatt-klick` | #332 | PR offen, Labor läuft | – |
| A5 | Fix: KI-Ausfall sichtbar, Betreiber-Warnung, cron-Probe, Tester-Tagesgrenze `DUELL_TESTER_ACCTS` | ki-ausfall-fix | app + wrapper `fix/ki-ausfall-hinweis` | wrapper #145 (f16f39d), app #333 (4bbdedc1), beide Draft | PR offen (wrapper 750/0/1 skip; app npm test 1087/0, frei-e2e 17/0) | `lib/duell-tester.mjs` byte-gleich mit A2 (`createTesters({ env, acctOf }) -> { isTester(acct), size }`, `parse(raw)`); beim Zusammenführen kein Konflikt |
| A6 | Fix: Flug-Spiel (Sprite-Mitte, Rundenende), Ziegel/Breakout-Steuerung, Desktop-Layout des Echtzeit-Hosts | fix-flugspiel | app `fix/flugspiel` | – | läuft | Echtzeit-Host: A7 und A8 nur minimal |
| A7 | Fix: Farbfelder statt Hex, Blasen-Muster für alle Karten | fix-editor-blasen | app `fix/editor-farben-blasen` | – | läuft | Host-Layout: A6 |
| A8 | Fix: Demo-Hinweis und Info-Seite „Über diese Demo“ | fix-demo-hinweis | app `fix/demo-hinweis` | – | läuft | Kopfzeile/Host: A6 |
| A9 | Test: alle Echtzeitspiele auf Desktop und Handy | tester-echtzeit | – (Bericht `07-protokoll/2026-11-17-echtzeit-test.md`) | – | fertig: 14 Spiele, 19 Funde (2 blockiert, 10 stört, 7 kosmetisch), 0 Konsolenfehler | Funde gehen an A6 bzw. A7 |
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
- A3 (P3/P4): Bau-Worker mit Szenario-Bots, Spiel-Dienst :8794, Karte fertig per Mail/Push gebaut, nur mit Modell-Doubles getestet (0 $). Deploy-Doku und Trockenlauf-Skript: wrapper `deploy/fk2-p34/`. PRs app #334, wrapper #146.
- A5 KI-Ausfall: 503 `ki-nicht-verfuegbar` mit `grund` (ki-limit, ki-ueberlastet, ki-ausfall, ki-key), kein Strike/keine Abbuchung/kein Tageskontingent; Mail an `OPS_ALERT_MAIL` 1/Klasse/h; `/api/status` Feld `ki`; Host-Skript `bin/ki-pruefung.sh` (nicht installiert). Tester-Schlüssel = Login-E-Mail (who(): `'a'+mac('account:'+mail)`), nicht Keycloak-sub.
- A2: Klärungsdialog P1 mit Review-Fixes, Tester-Modus und ehrlichem Bau-Zustand (`bau: 'nicht-verfuegbar'` ohne Worker). Wrapper #144, App #330, beide Draft. Gemeinsame Datei `lib/duell-tester.mjs` (Signatur siehe A2-Zeile).
- A9 Echtzeit-Test (`07-protokoll/2026-11-17-echtzeit-test.md`, Screenshots daneben): blockiert 2 (F4: nach Klick auf Pause, Weiter oder Ton ignoriert das Spiel die Tasten und die Leertaste pausiert erneut, `rt-stage.js:66-68`; F9: Kick-Ball liegt tot in der Ecke, kein Ende). stört 10, u. a. F3: Endstand ohne letzten Punkt (`session.js:32`, „Gewonnen!“ bei 4:4); F6/F7: Sprite-Mitte auch in Lauf und Baukasten (`canvas.js:228` gegen `lauf/view.js`, `baukasten/engine.js:513`); F1: Desktop-Feld schmal und links in allen Echtzeitspielen (`tokens.css:50`); F5: „Nochmal“ auf dem Handy unter dem Rand. kosmetisch 7.

## Fragen an den User
- A3: Push „Karte fertig“ – der Neuentwurf hat kein Push-Abo (Service Worker). Server-Schnittstelle steht, die App bietet Mitteilungen darum nicht an. Soll das Push-Abo im Neuentwurf gebaut werden?
- A3: Guthaben weg zwischen Auftrag und Erfolg (anderweitig ausgegeben): Karte wird geliefert, aber nicht abgebucht (`kosten.offen`). So lassen oder vorher 1 Guthaben reservieren?
- A3: Benachrichtigung auch, wenn gar kein Spiel entstand („Deine Karte hat nicht geklappt – nichts abgebucht“)? Gebaut ist: ja, nur mit Opt-in.
- A3: Die CSP der App erlaubt zusätzlich genau den Spiel-Ursprung (connect-src, frame-src) für „Probe spielen“. Bitte im Review bestätigen.
- Impressum und Datenschutz: Name bzw. Firma, Anschrift, Kontakt, Dienstleister, Log-Fristen (siehe `recht-plan.md`)

## Geklärt (Integrator, 17.11. abends)
- A5: `OPS_ALERT_MAIL` ist bestätigt (User: „ja“) und steht in ~/demos-wrapper-secrets/smtp.env; eine Test-Mail ging raus. smtp.pass liegt vor (24 B, 600). `DUELL_TESTER_ACCTS` = Login-Mail des Users über Google (User: „tester ist scimbe@gmail.com (google konto)“). Den cron für `bin/ki-pruefung.sh` richte ich beim Release ein; er ist Teil des freigegebenen Ausfallschutzes.
- A2: Der Haken für die Konto-Löschung ist keine Frage an den User. Er kommt als Aufgabe in R1 (recht-plan, Paket 15 „Konto-Löschung“): ein gemeinsamer Haken im Wrapper, der `forget(owner)` aller Dienste aufruft.
