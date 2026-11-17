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
| A3 | P3 Bau-Worker (eigener Container), Spiel-Ursprung :8795, P4 Push/Mail „Karte fertig“ | fk2-p3p4 | app `feat/fk2-p34` (8342d125), wrapper `feat/fk2-p34` (45c21f5) | app #334, wrapper #146 (Draft) | PR offen; Review behoben, Egress über Proxy (kein sudo/keine Host-Firewall), seccomp mit sha256; feat/fk2-spiel-api e6082a3e eingemergt; Labor-Befunde klaeren #4 behoben (CSP-Sonde zentral exakt gefiltert) (App-Unit 1148/1 Lizenztest-Umgebung, e2e 34/0; Wrapper 768/0) | Wrapper-Tausch durch den Integrator mit `deploy/fk2-p34/wrapper-zusatz.env` (neu: `DUELL_BAU_NETZ`) und `wrapper-mounts.txt` |
| A4 | Fix: Klick/Doppelklick/Enter auf dem Kalenderblatt | fix-blatt-klick | app `fix/blatt-klick` | #332 | PR offen, Labor läuft | – |
| A5 | Fix: KI-Ausfall sichtbar, Betreiber-Warnung, cron-Probe, Tester-Tagesgrenze `DUELL_TESTER_ACCTS` | ki-ausfall-fix | app + wrapper `fix/ki-ausfall-hinweis` | wrapper #145 (f16f39d), app #333 (4bbdedc1), beide Draft | PR offen (wrapper 750/0/1 skip; app npm test 1087/0, frei-e2e 17/0) | `lib/duell-tester.mjs` byte-gleich mit A2 (`createTesters({ env, acctOf }) -> { isTester(acct), size }`, `parse(raw)`); beim Zusammenführen kein Konflikt |
| A6 | Fix: Flug-Spiel (Sprite-Mitte, Rundenende), Ziegel/Breakout-Steuerung, Desktop-Layout des Echtzeit-Hosts; Funde A9 (F1–F11, F18) | fix-flugspiel | app `fix/flugspiel` | #335 | PR offen (26d757f5, 5a5f44b1; unit 1088/0, e2e echtzeit-steuerung 20/0, e2e gesamt 336/2 – beide behoben bzw. lastabhängig, siehe PR) | Echtzeit-Host geändert: `src/render/rt-stage.js`, `src/render/widgets.css`, `src/ui/tokens.css` (.main s-card-rt-*), `src/ui/view.js` (Siegername), `src/app/texts.js` (computer) – A7/A8 bitte nur minimal dort |
| A7 | Fix: Farbfelder statt Hex, Blasen-Muster für alle Karten | fix-editor-blasen | app `fix/editor-farben-blasen` (5925feb5) | #336 | PR offen, Review-Punkte 1+2 behoben (npm test 1094/0; e2e blasen 9/0, Regression 71/0; vorher weitere e2e 323/0) | Echtzeit-Host (A6): nur `src/engines/arcade/card.js` `paramsOf` (Palette, x-differs, x-names, x-unit, parts[].at); rt-stage.js, Steuerung und Kollision nicht angefasst. Außerdem `scripts/gen.js` FIELD_VOCAB (+x-palette, x-differs, x-dice) und die Generatoren mk-flug/mk-lauf (at, x-dice) |
| A8 | Fix: Demo-Hinweis und Info-Seite „Über diese Demo“ | fix-demo-hinweis | app `fix/demo-hinweis` | app #337 | PR offen (nicht gemergt) | Kopfzeile/Host: A6 (rt-stage unverändert) |
| A9 | Test: alle Echtzeitspiele auf Desktop und Handy | tester-echtzeit | – (Bericht `07-protokoll/2026-11-17-echtzeit-test.md`) | – | fertig: 14 Spiele, 19 Funde (2 blockiert, 10 stört, 7 kosmetisch), 0 Konsolenfehler | Funde gehen an A6 bzw. A7 |
| A10 | Messung P3-Job gegen 0,41 (Variante A, unter 4 $) | offen | – | – | offen | A3 |
| A11 | Gesammeltes Fix-Release (A4–A8, A5-Tester, A2-Tester-Modus) | Integrator | app + wrapper `release/fix3-20261118` (gepusht, kein PR, nicht in main) | app #332, #333, #335, #336, #337, #330; wrapper #145, #144 | Integrationsbranches bereit, Merge nach main und Deploy beim Integrator: app 5359c977 (npm test 1111/0, build ok, groesster Kartenteil 156143 B, e2e 361/0/8 skip), wrapper 68077d4 (vendor auf app 5359c977, Drift 5/0; Gesamt 766/0/1 skip; im ersten Lauf 1 Zeittest compress-queue L8 lastbedingt rot, einzeln 2x gruen) | Ohne #329/#331/#334 (#330 braucht nichts aus #329). Konflikte: codehash.js neu erzeugt; view.js/main.js beide Absichten erhalten; Wechselwirkung #335 x #337 (Nochmal auf Handy 861 > 844) per Fix-Commit behoben. Offen: Klaerung zeigt bei KI-Ausfall k_e_llm_off statt des A5-Satzes ki_aus |
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
- A3 (P3/P4): Bau-Worker mit Szenario-Bots, Spiel-Dienst 127.0.0.1:8795 (nur spiel-agent wird umgestellt, 8794 bleibt), „Karte fertig“ per Mail und Push (eigener Service Worker der neuen App), Guthaben vorgemerkt → gebucht/freigegeben; nur mit Modell-Doubles getestet (0 $). Deploy-Doku und Trockenlauf-Skript: wrapper `deploy/fk2-p34/`. PRs app #334, wrapper #146.
- A5 KI-Ausfall: 503 `ki-nicht-verfuegbar` mit `grund` (ki-limit, ki-ueberlastet, ki-ausfall, ki-key), kein Strike/keine Abbuchung/kein Tageskontingent; Mail an `OPS_ALERT_MAIL` 1/Klasse/h; `/api/status` Feld `ki`; Host-Skript `bin/ki-pruefung.sh` (nicht installiert). Tester-Schlüssel = Login-E-Mail (who(): `'a'+mac('account:'+mail)`), nicht Keycloak-sub.
- A2: Klärungsdialog P1 mit Review-Fixes, Tester-Modus und ehrlichem Bau-Zustand (`bau: 'nicht-verfuegbar'` ohne Worker). Wrapper #144, App #330, beide Draft. Gemeinsame Datei `lib/duell-tester.mjs` (Signatur siehe A2-Zeile).
- A9 Echtzeit-Test (`07-protokoll/2026-11-17-echtzeit-test.md`, Screenshots daneben): blockiert 2 (F4: nach Klick auf Pause, Weiter oder Ton ignoriert das Spiel die Tasten und die Leertaste pausiert erneut, `rt-stage.js:66-68`; F9: Kick-Ball liegt tot in der Ecke, kein Ende). stört 10, u. a. F3: Endstand ohne letzten Punkt (`session.js:32`, „Gewonnen!“ bei 4:4); F6/F7: Sprite-Mitte auch in Lauf und Baukasten (`canvas.js:228` gegen `lauf/view.js`, `baukasten/engine.js:513`); F1: Desktop-Feld schmal und links in allen Echtzeitspielen (`tokens.css:50`); F5: „Nochmal“ auf dem Handy unter dem Rand. kosmetisch 7.

- A7 (17.11.): Blasen-Ebene gab es (view.js/main.js), Blasen aber nur für Teile mit `part`-Knoten in der Vorschau. Echtzeitkarten zeichnen einen Canvas ohne `part`, daher die Chip-Leiste; 85 von 180 Teilen ohne Ort. Jetzt eine Schicht `src/ui/bubbles.js` mit `parts[].at`, Faden, Ziehen, Pinsel, Magie und Signatur; Farbfelder `src/ui/swatch.js`. PR #336.
- A8 (17.11.): Leiste „Demo – Testinstallation · Was heißt das?“ im Fluss unter der Kopfzeile in jedem Zustand (44 px, Link `?go=demo` in neuem Tab, damit eine Partie nicht verloren geht). Info-Seite `inhalt.demoinfo` mit Datenwegen, die gegen Wrapper und Keycloak-Realm geprüft sind. Kontakt über das optionale Feld `contact` der Status-API; der Wrapper braucht noch `MDI_CONTACT` in `duell-ai.mjs`, ohne den Wert steht dort der Hinweis auf „Melden“. Die Echtzeit-Bühne ist unverändert (endet auf 1280×800 bei 799 px, A6 beachten). Auf Telefonen bis 800 px Höhe zeigt das Blattbild 21:9, damit der Hauptknopf in home.e2e im ersten Bildschirm bleibt. Tests: unit 1086/1086, demo-hinweis.e2e 5/5, layout 7, a11y 6, rt 6, flug-lauf 20, home 11, startansicht 3, dunkel 2, arcade-app 3, links 2. Kern 655 985 B. PR #337.

- A6 (#335): Ursachen Flug = Sprite-Vertrag (x,y = Mitte) und rot in Bogenmaß in Flug/Lauf/Baukasten; Runde gegen den Computer lief nach dem Absturz weiter. A9 offen: F12 Startruckler, F13 Emoji-Größe, F14 Elfer-Hinweis, F16 Dart-Layout (Zugspiel), F17 Lauf-Streifen, F19 Lauf-Ansage.

## Fragen an den User
- Impressum und Datenschutz: Name bzw. Firma, Anschrift, Kontakt, Dienstleister, Log-Fristen (siehe `recht-plan.md`)
- A8: Das „grobe Mosaik im Link-Teil nach #“ für Fotos gibt es im Code nicht, Fotos reisen nie im Link. Die Info-Seite sagt deshalb nur „In einem Link reist nie ein Foto“. Ist das Mosaik geplant? Dann muss dieser Satz angepasst werden.
- A8: Welche Kontaktadresse soll in `MDI_CONTACT` stehen, und wann?

## Geklärt (Integrator, 17.11. abends)
- A5: `OPS_ALERT_MAIL` ist bestätigt (User: „ja“) und steht in ~/demos-wrapper-secrets/smtp.env; eine Test-Mail ging raus. smtp.pass liegt vor (24 B, 600). `DUELL_TESTER_ACCTS` = Login-Mail des Users über Google (User: „tester ist scimbe@gmail.com (google konto)“). Den cron für `bin/ki-pruefung.sh` richte ich beim Release ein; er ist Teil des freigegebenen Ausfallschutzes.
- A2: Der Haken für die Konto-Löschung ist keine Frage an den User. Er kommt als Aufgabe in R1 (recht-plan, Paket 15 „Konto-Löschung“): ein gemeinsamer Haken im Wrapper, der `forget(owner)` aller Dienste aufruft.
