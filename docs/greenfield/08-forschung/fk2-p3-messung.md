# Freie Karte 2, P3: Prototyp der Spiel-Pipeline und Messung gegen die Nullmessung

Stand: 17.11.2026, Messung 18:24–19:50 UTC. Gemessen wird ein Prototyp von P3: eine Hintergrund-Pipeline, in der Haiku 5.5
echten Spielcode gegen die Spiel-API `mdi-spiel/1` schreibt. Der Code wird automatisch geprüft und gegen eine Häkchenliste
abgenommen. Wünsche, Erwartungen, Personas und Urteilsverfahren stammen aus der Nullmessung (`fk2-nullmessung.md`).
Alle Zahlen kommen aus den Rohdaten in `fk2-p3-messung/`. Die Datei steht jeweils in Klammern.

Code: Draft-PR https://github.com/scimbe/CADS-agent-marketplace/pull/331, Branch `feat/fk2-p3-proto`, Basis
`feat/fk2-spiel-api` (nach dem Rebase auf 2f50eecb).

## Kurzfassung

Gemessen sind 15 Spiel-Wünsche × 3 Läufe je Rollenverteilung. Es fehlt eine Karte (B-P16-L3), siehe Abschnitt 7.
Erfüllung: erfüllt = 1, teilweise = 0,5, sonst 0. Gerechnet wird als Mittel je Lauf, dann über die Wünsche.

| Kennzahl | Null | A: alles Haiku | C: Sonnet plant + nimmt ab | B: Sonnet nur Abnahme |
|---|---|---|---|---|
| Erfüllung, 15 Spiel-Wünsche (P3) | 0,20 | **0,85** | 0,75 | 0,82 |
| – Arcade (11 Wünsche) | 0,23 | **0,85** | 0,81 | 0,87 |
| – andere Spiele (P12, P13, P15, P16) | 0,13 | **0,85** | 0,57 | 0,69 |
| Erfüllung gesamt, 26 Wünsche (Nicht-P3 mit Nullwert) | 0,41 | **0,79** | 0,73 | 0,77 |
| andere Spiele, 6 Wünsche (Quiz P14/P17 mit Nullwert) | 0,33 | 0,81 | 0,63 | 0,70 |
| Karte geliefert | – | 44/45 | 40/45 | 43/44 |
| Abnahme-Quote der Pipeline (machbare Haken erfüllt) | – | 91 % | 88 % | 85 % |
| Ehrliches „fehlt“ an allen nicht voll erfüllten Punkten | 51 %¹ | 21 % | **53 %** | 20 % |
| Scheinangebot (Anteil der Punkte / Karten) | 14 % / 18 %¹ | 0,5 % / 2 % | 0 / 0 | 0 / 0 |
| Erster Bauversuch grün / Reparaturrunden im Mittel | – | 64 % / 0,47 | 78 % / 0,51 | 73 % / 0,32 |
| Latenz bis Karte, Median / p90 / max | 5,3 s / 18 s / 52 s | 63 s / 163 s / 314 s | 70 s / 309 s / 318 s | 63 s / 121 s / 313 s |
| Kosten je Karte, erste Auslieferung | 0,0011 $ | **0,0097 $** | 0,047 $ | 0,025 $ |
| Kosten je Karte, 3 Nachbesserungen dazu | – | 0,0019 $ | 0,019 $ | 0,021 $ |

¹ Nullmessung nur auf denselben 15 Spiel-Wünschen (`fk2-nullmessung/urteile.jsonl`). Dort waren 43 % der Punkte ehrlich
abgesagt, weil keine Karte kam. Bei P3 kommt fast immer eine Karte. Ehrliche Absagen betreffen dann nur einzelne Punkte.

Quellen: `kennzahlen.json` (`varianten.*`, `null`) und `urteile.jsonl`.

**API-Kosten gesamt: 5,65 $** zu den Preisen des Auftrags: Hauptlauf 5,502 $ (`roh/budget.json`), Pilot 0,149 $
(`pilot/budget.json`). Die harte Grenze lag bei 15 $ (Hauptlauf 14,3 $). Sie wurde nicht erreicht. Abgebrochen hat zuletzt
das Kontolimit des Keys (Abschnitt 7).

## 1 Aufbau

**Pipeline** (`apps/mdi/scripts/fk2-p3/pipeline.mjs`). Jeder Schritt ist ein einzelner Aufruf ohne Gesprächsverlauf.
1. **Planer:** Aus Wunsch und Knöpfen werden eine Häkchenliste (3–7 beobachtbare Punkte, je „machbar“ mit Grund), ein
   Spielplan und Hinweise für die Person. Er entscheidet „bauen“ oder „absagen“. Die Ausgabe ist strukturiertes JSON
   (`output_config.format`).
2. **Bauer:** Haiku schreibt das Modul aus Auftrag und Spielplan. Die nicht machbaren Haken stehen ausdrücklich als „nicht
   vortäuschen“ im Auftrag.
3. **Prüfung:** Statik (`checkSpielSource`), Content-Policy (`policy.mjs`, Server-Prüfung ohne Modell) und Bot-Runner in der
   echten Sandbox. Drei Bots spielen je 60 s; geprüft werden alle Invarianten aus P2.
4. **Reparatur:** Höchstens 3 Runden. Die Befunde gehen als Sätze mit Abhilfe an den Bauer zurück (`befund.mjs`), z. B.
   „Statt Math.sin: g.sin(grad)“. Die Bauzeit ist auf 15 min begrenzt.
5. **Abnahme:** Jeder machbare Haken wird geprüft, mit Belegen. Belege sind Code mit Zeilennummern, der Bot-Bericht und zwei
   Fotos aus dem echten Spielmodus (nach 1 s und 4 s Zufallseingabe). Ergebnis je Haken: erfüllt oder fehlt.
6. **Anzeige:** Titel, „Das kann dein Spiel“, „Fehlt“ (nicht machbar laut Planer oder fehlt laut Abnahme) und Hinweise.
   Besteht ein Spiel die Prüfung nicht, kommt keine Karte, sondern eine ehrliche Meldung. Es gibt keinen Strike.
7. **Nachbesserung** (neu nach der Vorgabe „höchstens 3× kostenlos, danach Melden“). Eingabe: bestehendes Spiel,
   Häkchenliste, fehlt-Punkte der Abnahme, optional ein Kundentext. Die Pipeline repariert gezielt, ohne neu zu bauen, prüft
   erneut und nimmt erneut ab. Scheitert die Prüfung, bleibt die alte Version. Beim 4. Aufruf kommt `{ melden: true }`.
   In der Messung lief die Nachbesserung bis zu 3× ohne Kundentext, nur mit den fehlt-Punkten.

**Klärungsdialog P1:** nicht simuliert. Die Pipeline startet direkt mit Wunsch und Knöpfen; der Planer erzeugt die
Häkchenliste selbst. Die Erwartungen der Personas kennt die Pipeline nicht: Die Eingabedatei
`roh/eingabe-wuensche-p3.jsonl` enthält nur `id`, `wunsch`, `genre` und `wer_spielt`, und `messung.mjs` bricht ab, wenn
`erwartung` vorkommt.

**Modelle:**
- `claude-haiku-5-5` und `claude-sonnet-5-5`, Aufwand `medium` für alle Rollen.
- Gecachter Präfix für alle Rollen: Kopfkommentar von `src/spiel/api.js`, Plattformgrenzen, Code-Regeln, Bot-Invarianten,
  Policy und drei Vorlagen (invaders, snake, plattformer); er wird aus den Quellen erzeugt. Breakout, Asteroids und Rennen
  sind bewusst nicht dabei.
- Gesamt: 1,99 M Input-, 2,93 M Output- und 5,97 M Cache-Read-Tokens sowie 26.905 Cache-Write-Tokens.

**Rollen-Varianten:** A = Haiku/Haiku/Haiku, C = Sonnet/Haiku/Sonnet, B = Haiku/Haiku/Sonnet (Reihenfolge Planer, Bauer,
Abnahme). B ist im Budget geblieben.

**Kosten:**
- Vor jedem Aufruf wird der schlimmste Fall reserviert: Eingabe zum Cache-Write-Preis plus `max_tokens` Ausgabe.
- Passt die Reserve nicht mehr unter die Grenze, geht kein Request raus (`BudgetAbbruch`).
- Danach wird mit `usage` abgerechnet (`llm.mjs`).
- Jeder Aufruf steht mit Tokens und Kosten in `roh/aufrufe.jsonl`.

**Messumgebung:**
- ssh-united, Wegwerf-Container `fk2-p3-setup`, `fk2-p3-pilot` und `fk2-p3-haupt` mit Label `org.mdi.p3=1`.
- Image `mcr.microsoft.com/playwright:v1.56.1-noble`, Nutzer 1000.
- Begrenzt auf 1,5 CPU und 2 GB, kein Port, keine Produktions-Volumes.
- Der Key war read-only eingebunden und wurde nie ausgegeben.
- 3 Karten liefen parallel, die Bot-Läufe hintereinander (Mutex), damit die Zeitgrenze von 4 ms je Frame nicht unter
  Parallellast fällt. Die sechs Referenzspiele bestanden im Container vorher alle.

**Urteil wie in der Nullmessung:**
- Fünf Subagenten (Sonnet 5.5, nicht über die API) mit dem wörtlichen Prompt der Nullmessung.
- Angepasst ist nur die „Anzeige“: Listen „Das kann dein Spiel“ und „Fehlt“, Hinweise, zwei Bildschirmfotos und der
  Spielcode als sachliche Beschreibung des Verhaltens.
- Ergänzt sind zwei Sätze: Ein zutreffender Eintrag unter „fehlt“ gilt als ehrlich abgesagt; ein Versprechen in „Das kann
  dein Spiel“, das der Code nicht hält, gilt als Scheinangebot.
- Die Variante ist für die Gutachter nicht erkennbar (Fall-ID = Hash). Jeder Wunsch wurde mit allen 9 Karten von derselben
  Gutachterin bewertet (`skripte/prep.mjs`).

**Abgrenzung:** P3 sind die 15 Wünsche mit Art „Spiel“: P01–P13, P15, P16. Nicht Teil von P3 sind die Quiz-Wünsche P14 und
P17 sowie die 9 Nicht-Spiele P18–P26; sie laufen weiter über den Baukasten-Pfad. Für „gesamt“ und „andere Spiele (6)“
stehen bei diesen Wünschen die Werte der Nullmessung. Das ist in der Tabelle getrennt ausgewiesen.

## 2 Ergebnisse je Wunsch

Erfüllung als Mittel der Läufe (B-P16: 2 Läufe).

| ID | Wunsch (gekürzt) | Null | A | C | B |
|---|---|---|---|---|---|
| P01 | Space Invaders mit Segelbooten | 0,00 | 1,00 | 1,00 | 1,00 |
| P02 | Breakout, Lego-Steine, Pizza-Ball | 0,00 | 0,75 | 0,62 | 0,75 |
| P03 | Schlangenspiel wie Nokia | 1,00 | 0,88 | 0,88 | 0,88 |
| P04 | Rennspiel, roter Sportwagen | 0,00 | 0,87 | 0,90 | 0,90 |
| P05 | Asteroids | 0,21 | 1,00 | 1,00 | 0,96 |
| P06 | Katze auf Dächern, Fischgräten | 0,63 | 0,92 | 0,92 | 0,92 |
| P07 | Wasserballon-Duell zu zweit | 0,00 | 0,67 | 0,38 | 0,58 |
| P08 | Donut im Labyrinth (Pac-Man) | 0,00 | 0,54 | 0,29 | 0,83 |
| P09 | Flappy Bird mit Huhn | 0,00 | 0,83 | 1,00 | 0,83 |
| P10 | Pong gegen den Computer | 0,67 | 1,00 | 1,00 | 1,00 |
| P11 | Tetris mit Kuchenstücken | 0,00 | 0,92 | 0,96 | 0,92 |
| P12 | Memory mit Enkel-Fotos | 0,50 | 0,67 | 0,75 | 0,67 |
| P13 | Würfelspiel zu viert bis 100 | 0,00 | 0,96 | 0,71 | 0,79 |
| P15 | Schätzspiel Gummibärchen | 0,00 | 0,79 | 0,83 | 0,79 |
| P16 | Mau-Mau gegen den Computer | 0,00 | 1,00 | 0,00 | 0,50 |

Quellen: `kennzahlen.json` (`quote_je_wunsch`) und `urteile.jsonl`.

**Was sich gegenüber der Nullmessung ändert:**
- Space Invaders, Asteroids, Rennen, Flappy Bird und Tetris liefen in der Nullmessung auf Scheinangebot oder Absage. Jetzt
  entstehen die gewünschten Mechaniken.
- Marken werden nicht mehr abgesagt. Die Mechanik wird gebaut, der Name wird ersetzt, und das wird gesagt.
- Das Wasserballon-Duell (P07) wird nicht mehr überblockt. Es fehlt ehrlich der zweite Mensch gleichzeitig.
- Fotos der Enkel (P12) stehen ehrlich unter „fehlt“.
- Überblockt: 0 von 134 Karten.

**Wo C schlechter ist:** P16 (Mau-Mau) scheitert in C dreimal, P08 (Pac-Man) zweimal. Grund ist das Abschneiden in der
Reparaturschleife (Abschnitt 4). Ohne Karte urteilen die Gutachter „ehrlich abgesagt“ (Quote 0). Auf den gelieferten
Karten liegen die Varianten nah beieinander: A 0,87, B 0,85, C 0,84.

**Häufigste Abweichungen laut Urteil:**
- Ein Detail ist nicht ganz getroffen, z. B. ein Zusammenstoß kostet ein Leben statt das Spiel zu beenden, oder der Sieg
  kommt erst nach Level 3.
- Die Optik ist angenähert (Lego).
- Bei Mehrspieler-Wünschen spielt ein Computer-Gegner.

Diese Fälle sind meist „teilweise“, selten „nicht“ (0,6 % bzw. 1,1 % der Punkte in B und C).

## 3 Nachbesserung: offene fehlt-Punkte nach 0, 1, 2 und 3 Runden

Gezählt von der Pipeline-Abnahme, nicht von den Gutachtern, über alle gelieferten Karten (`kennzahlen.json`, `nachbesserung`).

| Variante | Karten | alle fehlt-Punkte nach 0 / 1 / 2 / 3 | davon fehlt laut Abnahme (reparierbar) | Karten ohne reparierbares fehlt nach 0 / 1 / 2 / 3 |
|---|---|---|---|---|
| A | 44 | 49 / 34 / 29 / 28 | 22 / 7 / 2 / 1 | 28 / 38 / 42 / 43 |
| C | 40 | 56 / 44 / 40 / 38 | 26 / 14 / 10 / 8 | 19 / 30 / 32 / 35 |
| B | 43 | 61 / 40 / 32 / 32 | 37 / 16 / 8 / 8 | 17 / 31 / 36 / 37 |

**Wirkung:**
- Die erste Nachbesserung schließt 46–68 % der reparierbaren Punkte (A 68 %, B 57 %, C 46 %), die zweite die meisten übrigen.
- Die dritte bringt kaum noch etwas (A 2→1, C 10→8, B 8→8).
- Der Rest sind ehrlich nicht machbare Punkte, z. B. Fotos, zwei Menschen gleichzeitig, Markenoptik.
- Eine Nachbesserung dauert im Median 27–29 s.
- Kosten je Karte für alle Runden zusammen: A 0,002 $, B und C ~0,02 $.

Vorsicht: In A nimmt Haiku die eigenen Spiele ab. Die niedrigen Restzahlen in A sind deshalb weniger belastbar. Die
Abnahme-Quote liegt über dem Urteil der Gutachter: 91 % machbare Haken erfüllt, aber nur 76 % erfüllte
Erwartungspunkte. Eine Gutachter-Bewertung der Versionen nach der Nachbesserung steht aus.

**Datenformat für Meldungen:** `abweichungen.jsonl` hat das Format `fk2-abweichung/1`, eine Zeile je Karte, Runde und Punkt.
- Felder: `quelle`, `karte`, `wunsch_id`, `variante`, `lauf`, `runde`, `punkt_id`, `punkt`, `status`, `grund`,
  `fehlerarten`, `kundentext`.
- `quelle` ist heute `abnahme` (Pipeline) oder `erwartung` (Urteil). Meldungen kommen später als `quelle: "meldung"` mit
  Begründung in `grund` bzw. `kundentext` dazu.
- So lassen sich Meldungen und Erwartungsabweichungen nach Wunsch, Karte, Runde und Fehlerart gemeinsam auswerten.

## 4 Häufigste Fehlerarten von Haiku gegen die API

Basis sind 316 Bauversuche aus erster Auslieferung, Reparatur und Nachbesserung, davon 235 grün (`roh/karten.jsonl`,
`versuche[].fehlerarten`). Ein Versuch kann mehrere Fehlerarten haben.

| Fehlerart | Versuche | Bemerkung |
|---|---|---|
| `format:abgeschnitten` | 45 | `max_tokens` 16.000 erreicht, fast ganz vom Denken verbraucht; der Code ist nur 3–6 KB groß. Ursache aller 12 Syntaxfehler und aller 7 Fehlschläge (P08, P16). Verteilung: C 25, A 12, B 8; Sonnet-Pläne sind ausführlicher, Haiku denkt dann länger. |
| `invariante:scoreChanges` | 21 | Punkte gibt es erst am Ende (Würfel, Memory, Schätzen, Kartenspiel). Die Bots erreichen das in 60 s nicht. |
| `invariante:gameOverReachable` | 13 | Rundenspiele ohne Zeitlimit, Spiele ohne Gefahr |
| `laufzeit:syntax` / `statisch:Syntax` | 12 / 12 | nur in abgeschnittenen Antworten, kein einziger echter Syntaxfehler |
| `policy:mensch` | 2 | Fehlalarm der eigenen Policy: 🏆 lag im Menschen-Bereich 1F3C3–1F3CC; behoben und getestet |
| `statisch:global:parent` | 1 | Fehlalarm der Statik im Basis-Branch: Parametername `parent` in `childRock(g, parent, size)` |
| `invariante:inputsEffective` | 1 | eine Steuerung ohne Wirkung |

Was Haiku nicht falsch macht: kein `Math.sin`/`Math.random`/`**`, kein `Date`, keine falsche Farbe, kein geteiltes Objekt,
kein NaN, keine Policy-Verletzung außer den Fehlalarmen. API-Doku, Regeln und Vorlagen im Präfix wirken. Der Engpass sind
Ausgabebudget und Abnahme-Invarianten, die zu Echtzeit-Arcade passen, aber nicht zu Runden- und Brettspielen.

## 5 Härtung 2f50eecb: Nachprüfung der erzeugten Spiele

**Rebase:** Der Branch ist auf `feat/fk2-spiel-api` 2f50eecb rebased. Es gab einen Konflikt in `scripts/spiel/runner.mjs`.
`openSandbox` hat jetzt die Option `view`, und der Prüfstand nutzt `launchBrowser()` mit der Heap-Grenze von 256 MB.
Danach liefen alle 1117 Unit-Tests und der P3-E2E-Test grün.

**Nachprüfung:**
- Alle 235 gespeicherten Spielversionen (erste Auslieferung und Nachbesserungen) liefen lokal ohne API erneut durch den
  gehärteten Bot-Runner (`scripts/fk2-p3/nachpruefen.mjs`).
- Ergebnis: 235 von 235 unverändert, 0 jetzt durchgefallen (`roh/nachpruefung-2f50eecb.jsonl`).
- Kein Spiel nutzt `Date`. Die gesperrten Worker, SharedWorker und BroadcastChannel und die eingefrorenen Prototypen
  betreffen die erzeugten Spiele nicht.

## 6 Die 5 wichtigsten Harness-Verbesserungen

1. **Ausgabebudget des Bauers:**
   - `max_tokens` für den Bauer auf 32k–64k setzen, mit Streaming; das Denken verbraucht das Budget.
   - Oder Aufwand `low` für Reparaturrunden. Belegt ist das nicht, weil das Kontolimit den Nachversuch A2 verhinderte.
   - Bei `stop_reason = max_tokens` nicht reparieren, sondern mit kürzerem Plan neu bauen.
   - Behebt die häufigste Fehlerart (45) und alle 7 Fehlschläge.
2. **Invarianten je Spieltyp:**
   - Für Runden- und Brettspiele „Punkte erst am Ende“ zulassen: scoreChanges über Zwischenpunkte oder Spielende statt
     60 s Echtzeit.
   - Im Präfix eine Vorlage für ein Rundenspiel mit Cursor, z. B. Memory, und eine Regel „Zwischenpunkte je Zug“.
   - Betrifft 34 Versuche.
3. **Kundensprache im „fehlt“:**
   - Die Abnahme schreibt Belege mit Zeilennummern und Bot-Werten. Die Gutachter werten das 7× als Inhaltsfehler
     („fehlt-Eintrag mit Code-Zeilen“).
   - Die Abnahme soll je Haken zusätzlich einen Satz für die Person liefern. Code und Bot-Werte bleiben intern.
4. **Abnahme strenger und unabhängig vom Bauer:**
   - Die Haiku-Abnahme bestätigt 91 % der machbaren Haken, die Gutachter erkennen 76 % der Erwartungen als erfüllt.
   - Spielend prüfen statt nur lesen: Szenario-Bots je Haken, z. B. „Zusammenstoß beendet das Spiel“ mit Zustandsprüfung.
   - Planer-Haken mit expliziten Zahlen und Bedingungen (sofort Ende oder Leben, Sieg bei X) ausgeben, damit der häufigste
     Teilfehler „Detail anders“ prüfbar wird.
5. **Statische Regeln und Policy ohne Fehlalarm:**
   - Menschen-Emojis über eine Liste aus Unicode-Daten statt grober Bereiche prüfen (🏆-Fehlalarm, behoben).
   - `checkSpielSource` soll Parameter- und lokale Namen wie `parent` nicht als Global werten (Basis-Branch).
   - Das passende Referenzspiel per Mechanik in den Präfix holen (Breakout, Rennen, Asteroids) statt immer derselben drei.

## 7 Vorfall Kontolimit und fehlende Karte

**Was passiert ist:**
- Um 19:49 UTC antwortete die API auf den Aufruf `B-P16-L3:rep1` mit HTTP 400: „You have reached your specified API usage
  limits. You will regain access on 2026-12-01 at 00:00 UTC.“ (`roh/aufrufe.jsonl`).
- Das ist ein Ausgabenlimit im Anthropic-Konto, nicht die Grenze dieser Messung. Bis dahin hatte die Messung 5,65 $
  ausgegeben.
- Die Karte B-P16-L3 fehlt deshalb. Sie zählt in keiner Kennzahl; B-P16 ist das Mittel aus 2 Läufen.
- Der Koordinator hat das Limit mit einem 1-Token-Aufruf bestätigt.

**Folgen:**
- Danach gab es keine weiteren Aufrufe.
- Der geplante Nachversuch A2 (Bauer mit Aufwand `low`, Option `--effort-bauer` liegt im PR) entfällt.
- Wenn `demos-wrapper` denselben Key nutzt, kann Produktion bis zur Anhebung des Limits keine Modellaufrufe machen.
- Bis 19:51 UTC zeigten die Logs von `demos-wrapper` keinen Fehler dazu. Der Container lief unverändert.

## 8 Empfehlung zur Rollenverteilung

**Variante A, alles Haiku, mit der Harness-Verbesserung 1, ist das lokale Optimum:**
- beste Erfüllung: 0,85 auf den Spiel-Wünschen, 0,79 gesamt;
- niedrigste Kosten: 0,01 $ je Karte, ein Fünftel von C;
- gleiche Latenz wie B.

**Warum Sonnet in den getesteten Rollen keinen Gewinn bringt:**
- Als Planer (C) macht Sonnet ehrlichere fehlt-Listen: 53 % statt 21 % der Abweichungen offen gesagt. Seine längeren Pläne
  treiben Haiku aber in das Ausgabelimit, sodass 5 von 45 Karten nicht entstanden.
- Als Abnehmer (B) ist Sonnet strenger: Abnahme-Quote 85 % statt 91 %, mehr Nachbesserungsarbeit. Die Erfüllung steigt
  dadurch nicht (0,82 gegenüber 0,85). Die Kosten steigen um den Faktor 2,5.

**Vorschlag:**
- A als Standard.
- Sonnet nur für eine stichprobenartige Zweitabnahme (z. B. jede 10. Karte oder nach einer Kundenmeldung), um die
  Haiku-Abnahme zu kalibrieren.
- Die Ehrlichkeit von C durch Planer-Regeln nachholen: jeden Ersatz als „fehlt“ melden.
- Vor der Entscheidung einmal mit Verbesserung 1 nachmessen (A und C, je 15 × 3, geschätzt unter 4 $), sobald der Key
  wieder geht.

## 9 Grenzen der Messung

- Personas und Urteile stammen von LLM-Subagenten (Sonnet 5.5), wie in der Nullmessung. Es gibt keine Kappa-Kalibrierung.
- Je Wunsch urteilte eine andere Gutachterin; über Varianten hinweg ist der Vergleich fair, über Wünsche hinweg nur grob.
- Die Gutachter sahen den Spielcode. Das ist strenger und genauer als die Engine-Beschreibung der Nullmessung, aber nicht
  identisch damit.
- n = 15 Wünsche × 3 Läufe; Unterschiede von wenigen Hundertsteln zwischen A und B liegen im Rauschen. Belastbar sind der
  Abstand zur Nullmessung und der Rückstand von C bei P08/P16.
- Die Personas haben nicht selbst gespielt. „Erfüllt“ heißt: Code und Fotos zeigen das Verhalten.
- Kein Klärungsdialog: Die Häkchenliste kommt vom Planer allein. Mit P1 könnte die Erfüllung höher liegen.
- Nachbesserung ohne Kundentext und nur nach Pipeline-Abnahme gezählt (Abschnitt 3).
- Die Latenz enthält den Mutex für die Bot-Läufe bei 3 parallelen Karten. Einzeln wäre sie etwas kürzer.

## Rohdaten (`fk2-p3-messung/`)

- `roh/eingabe-wuensche-p3.jsonl`: die 15 Wünsche ohne Erwartungen, so wie die Pipeline sie bekam.
- `roh/karten.jsonl`: 135 Karten mit Plan, Häkchenliste, allen Bauversuchen samt Code, Fehlerarten, Bot-Bericht,
  Abnahme, Anzeige (`anzeige0` = erste Auslieferung) und Nachbesserungen. Keine Secrets.
- `roh/aufrufe.jsonl`: 688 Modellaufrufe mit Rolle, Modell, Tokens, Stop-Grund, Dauer und Kosten.
- `roh/fotos/`: Bildschirmfotos aller Versionen.
- `roh/nachpruefung-2f50eecb.jsonl`: Nachprüfung gegen die gehärtete Sandbox.
- `roh/abweichungen.jsonl`: nur Pipeline-Abnahme.
- `abweichungen.jsonl`: Pipeline-Abnahme und Urteil im Format `fk2-abweichung/1`.
- `roh/budget.json`, `roh/lauf.log`: Kostenstand und Ablaufprotokoll.
- `pilot/`: Pilotlauf mit 4 Karten (A und C, P01 und P12), nicht in den Kennzahlen.
- `urteil/`: Fall-Zuordnung (`faelle-map.jsonl`) und Gutachterurteile (`urteile-1..5.jsonl`).
- `urteile.jsonl`: Urteil je Karte mit Quote.
- `kennzahlen.json`: alle Zahlen dieses Berichts.
- `skripte/`: `prep.mjs` (Urteilsfälle, blind) und `agg.mjs` (Kennzahlen). Die Pipeline selbst liegt im PR:
  `apps/mdi/scripts/fk2-p3/`, Messlauf mit `npm run spiel:p3`.
