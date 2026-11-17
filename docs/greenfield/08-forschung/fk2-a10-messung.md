# Freie Karte 2, A10: Messung des echten Bau-Workers gegen Nullmessung und Prototyp

Stand: 18.11.2026, Messung 23:18–23:39 UTC (Lauf 2) auf ssh-united. Gemessen wird erstmals der ganze Produktionsweg: der
echte Klärungsdialog P1 (`lib/duell-klaerung.mjs`, Wrapper `feat/fk2-p34` 3e3f93d) und der echte Bau-Worker P3
(`apps/mdi/bau/`, App `feat/fk2-p34` 58d137e0) mit Rollenverteilung A (Planer, Bauer und Abnahme mit Haiku 5.5, Bauer bis 32k
Ausgabe-Tokens, gestreamt). Die Wünsche, Erwartungen, Personas und das Urteil sind dieselben wie in der Nullmessung
(`fk2-nullmessung.md`) und im Prototyp (`fk2-p3-messung.md`). Die Rohdaten liegen in `fk2-a10-messung/`; die Quelle steht
jeweils in Klammern.

## Kurzfassung

Gemessen sind 15 Spielwünsche mit je 3 Läufen, also 45 Aufträge, alle geurteilt. Die Erfüllung ist gerechnet wie in den
beiden früheren Messungen: erfüllt = 1, teilweise = 0,5, sonst 0, erst gemittelt je Lauf, dann über die Wünsche.

| Kennzahl | Null | Prototyp A | **A10 gesamt (P1 + P3)** | A10, nur Aufträge, die den Bau erreichen |
|---|---|---|---|---|
| Erfüllung, 15 Spielwünsche | 0,20 | 0,85 | **0,51** | **0,77** (gelieferte Karten allein: 0,82) |
| – Arcade / andere Spiele | 0,23 / 0,13 | 0,85 / 0,85 | 0,45 / 0,67 | – |
| Karte geliefert | – | 44/45 | 28/45 | 28/30 |
| Scheinangebot, Anteil der Punkte / Karten | 14 % / 18 % | 0,5 % / 2,2 % | **0,5 % / 2,2 %** | – |
| ehrliches „fehlt“ an allen nicht voll erfüllten Punkten | 51 % | 21 % | **47 %** | – |
| Abnahme der Pipeline gegen Urteil | – | 91 % der machbaren Haken / 76 % der Erwartungen | 68 % der P1-Punkte / 74 % der Erwartungen (gelieferte Karten) | – |
| davon von Szenario-Bots gespielt | – | – | 46 % der P1-Punkte | – |
| Kosten je Karte (Worker, Mittel / Max) | 0,0011 $ | 0,0097 / 0,035 $ | **0,0114 / 0,021 $**, dazu P1 0,0009 $ | – |
| Latenz bis Ergebnis, Median / p90 / max | 5 / 18 / 52 s | 63 / 163 / 314 s | 89 / 146 / 201 s (davon Bau 96 / 138 / 192 s) | – |
| abgeschnittene Antworten des Bauers | – | 12 von 90 Versuchen (16k) | **0 von 50 Aufrufen** (32k; höchstens 21 248 Tokens, Median 5 015) | – |
| abgeschnittene Antworten des Planers | – | – | 6 von 34 (8k), 2 Aufträge ohne Spiel | – |
| überblockt | 0 | 0 | 5 von 45 | – |

Quelle: `fk2-a10-messung/kennzahlen.json` sowie Null und Prototyp aus deren `kennzahlen.json`.

**Was das heißt:**
- Der Bau selbst hält, was der Prototyp versprach:
  - Gelieferte Karten erfüllen 0,82, über die Wünsche mit Bau 0,77.
  - Die Scheinangebote bleiben bei 0,5 % der Punkte.
  - Fehlende Punkte werden mehr als doppelt so oft ehrlich benannt (47 % statt 21 %); das tragen die festen Sätze der
    Szenario-Bots und die Kundensprache.
  - Kein Bauer-Aufruf läuft mehr ins Ausgabelimit, die häufigste Fehlerart des Prototyps ist weg.
  - Kosten und Latenz liegen im Rahmen des Prototyps (0,011 $ statt 0,010 $ je Karte; p90 kürzer, Median länger).
- Die Gesamterfüllung von 0,51 senkt der Klärungsdialog P1, nicht der Bau. 15 von 45 Aufträgen erreichen den Bau nicht:
  - 13 werden schon beim ersten Satz abgelehnt, alle mit dem Grund „brand“: P02 Breakout/Lego, P08 „sowas wie pacman“,
    P09 Flappy Bird, P11 Tetris sowie einmal P01 Space Invaders.
  - 2 Listen lehnt die Moderation der fertigen Liste ab („other“, P01 und P12).
  - Die Gutachterinnen werten 40 dieser Erwartungspunkte als ehrlich abgesagt und 20 als „nicht“. 5 Fälle gelten als
    überblockt: P08 dreimal („pauschal wegen ‚pacman‘ abgelehnt, die Meldung nennt nicht, was zu ändern ist“), P01 L1 und
    P12 L3.
  - Im Prototyp gab es keinen P1. Dort wurde die Marke ersetzt und das ehrlich gesagt.
- Vergleich mit 0,85: Auf den Aufträgen, die den Bau erreichen, liegt A10 bei 0,77 und auf den gelieferten Karten bei 0,82.
  Den Abstand zum Prototyp erklären vor allem zwei Dinge. Erstens wählt P1 mit „Egal, überrasch mich“ selbst
  (z. B. Holzkisten statt Segelboote als Ziele bei P01). Zweitens scheitern zwei Pläne am Ausgabelimit des Planers
  (Abschnitt 4).

**API-Kosten gesamt: 0,53 $**, die harte Grenze lag bei 4 $.
- Lauf 2: 0,382 $, davon P1 0,041 $ und Worker 0,341 $.
- Abgebrochener Lauf 1: 0,124 $.
- Pilot: 0,019 $.
- Gerechnet mit denselben Preisen wie im Prototyp (`roh/log-a10-bau-*.txt` Ereignisse `fk2-llm`, `roh/p1-budget.json`).

## 1 Aufbau

**Ort und Netztrennung wie im Release** (`deploy/fk2-p34`, Skript `skripte/a10-lauf.sh`): Wegwerf-Container auf ssh-united,
alle mit Präfix `a10-` und ohne veröffentlichten Port.

| Container | Netze | Geheimnisse | Aufgabe |
|---|---|---|---|
| `a10-wrapper` | `a10-p1` (normal, für P1 wie der Produktions-Wrapper), `a10-intern` | Key, Token | echter P1 und echte Bau-Warteschlange (`skripte/a10-wrapper.mjs` mit `createKlaerung`, `createBau`, interner Listener 8791) |
| `a10-bau-1..3` | nur `a10-intern` und `a10-pruef`, beide `--internal` | Key, Token | echter Worker `bau/main.mjs`, `HTTPS_PROXY`, Tagesgrenze je Worker 1,10 $ (`MDI_BAU_TAGESGRENZE_USD`) |
| `a10-pruef` | nur `a10-pruef` (`--internal`) | keine | Chromium mit Sandbox: seccomp-Profil von Playwright v1.56.1 (sha256 geprüft), `--cap-drop ALL --cap-add SYS_CHROOT` |
| `a10-egress` | `a10-egress` (normal) und `a10-intern` | keine | Egress-Proxy, nur `CONNECT api.anthropic.com:443` |

Bei jedem Start belegt (`roh/`, Ausgabe von `a10-lauf.sh`):
- Der Worker kommt direkt nicht hinaus („direkt: zu“).
- Der Prüf-Container kommt nicht hinaus („pruef: zu“).
- Der Proxy lehnt `example.org:443` mit 403 ab.
- Der Prüf-Container sieht keinen Key.

**Ablauf je Auftrag:**
1. Der Satz der Persona geht an `fragen`.
2. Jede Frage wird mit „Egal, überrasch mich“ beantwortet. Das ist persona-blind: die Erwartungen kennt nur das Urteil, und
   die Eingabe ist dieselbe wie im Prototyp (`id`, `wunsch`, `genre`, `wer_spielt`; das Skript bricht ab, wenn `erwartung`
   vorkommt).
3. Dann `liste`, `auftrag` mit 1 Guthaben vorgemerkt (Guthaben-Double), Warteschlange.
4. Der Worker baut. Abgefragt wird der Status, bis er nicht mehr „baut“.

Nachbesserungen gab es nicht; geurteilt wird die erste Auslieferung, wie im Prototyp. Es liefen 3 Aufträge parallel; die
Bot-Läufe sind im Prüf-Dienst serialisiert.

**Urteil:**
- Fünf Subagenten (Sonnet 5.5, nicht über die API) mit dem wörtlichen Prompt des Prototyps (`urteil/prompt-1.txt`; nur die
  Dateipfade sind andere).
- Die Anzeige ist das, was die App zeigt:
  - Titel.
  - „Das kann dein Spiel“ = die erfüllten P1-Punkte.
  - „Fehlt“ = die nicht erfüllten Punkte mit dem Satz für die Person. Ein Punkt, der nur gelesen wurde, trägt den Zusatz
    „(nicht automatisch prüfbar)“.
  - Hinweise = „Ehrlich gesagt“ aus der Liste.
  - Ohne Karte: der Text der App zum Grund bzw. zur Absage von P1.
- Dazu zwei Fotos aus dem echten Spielmodus (lokal erzeugt aus dem gelieferten Code, gleiche Sandbox) und der Spielcode.
- Die Fall-ID ist ein Hash. Je Wunsch urteilt eine Gutachterin über alle 3 Läufe (`skripte/prep-a10.mjs`).

## 2 Ergebnisse je Wunsch

| ID | Wunsch (gekürzt) | Null | Prototyp A | A10 (Läufe) | Bemerkung |
|---|---|---|---|---|---|
| P01 | Space Invaders mit Segelbooten | 0,00 | 1,00 | 0 / 0 / 0,88 | L1 Liste abgelehnt („other“), L2 Marke, L3 Karte |
| P02 | Breakout, Lego, Pizza | 0,00 | 0,75 | 0 / 0 / 0 | Marke beim Satz |
| P03 | Schlange wie Nokia | 1,00 | 0,88 | 1 / 1 / 1 | |
| P04 | Rennspiel roter Sportwagen | 0,00 | 0,87 | 0,9 / 0,9 / 0,9 | Überholen vereinfacht |
| P05 | Asteroids | 0,21 | 1,00 | 0,88 / 0,63 / 0,63 | Drehen fehlt bzw. Zerfall fehlt |
| P06 | Katze auf Dächern | 0,63 | 0,92 | 0,75 / 0,88 / 0,63 | |
| P07 | Wasserballon-Duell zu zweit | 0,00 | 0,67 | 0,5 / 0 / 0,75 | L2 Plan abgeschnitten, kein Spiel |
| P08 | Donut im Labyrinth (pacman) | 0,00 | 0,54 | 0 / 0 / 0 | Marke beim Satz, 3× überblockt |
| P09 | Flappy Bird mit Huhn | 0,00 | 0,83 | 0 / 0 / 0 | Marke beim Satz |
| P10 | Pong gegen Computer | 0,67 | 1,00 | 1 / 0,75 / 1 | |
| P11 | Tetris mit Kuchen | 0,00 | 0,92 | 0 / 0 / 0 | Marke beim Satz |
| P12 | Memory mit Enkel-Fotos | 0,50 | 0,67 | 0,75 / 0,5 / 0 | L2 einziges Scheinangebot, L3 Liste abgelehnt (überblockt) |
| P13 | Würfeln zu viert bis 100 | 0,00 | 0,96 | 1 / 0,63 / 1 | |
| P15 | Schätzspiel Gummibärchen | 0,00 | 0,79 | 0 / 0,63 / 0,5 | L1 Plan abgeschnitten, kein Spiel |
| P16 | Mau-Mau gegen Computer | 0,00 | 1,00 | 1 / 1 / 1 | |

Quelle: `kennzahlen.json` (`quote_je_wunsch`) und `urteile.jsonl`.

**Häufigste Abweichungen auf gelieferten Karten** (Muster laut Urteil): „Detail ignoriert“ (7), „Steuerung anders“ (6),
„Funktion fehlt“ (2), Drehen bzw. Zerfall bei Asteroids, vereinfachtes Überholen. Das ist dasselbe Bild wie im Prototyp: Details
sind teilweise, die Kern-Mechanik stimmt.

**Das einzige Scheinangebot** (P12 L2, Memory): Die Gutachterin schreibt „Gefundene Paare werden leer statt offen gezeigt, und
die ‚fehlt‘-Liste enthält Punkte, die das Spiel tatsächlich erfüllt“. Die Abnahme war also hier zu streng, nicht zu großzügig.

## 3 Abnahme gegen Urteil

- Der Server-Lauf hat 68 % der P1-Punkte gelieferter Karten als erfüllt abgenommen. Die Gutachterinnen sehen 74 % der
  Erwartungspunkte dieser Karten als erfüllt.
- Im Prototyp war es umgekehrt (91 % gegen 76 %): Die Abnahme war dort zu großzügig, jetzt ist sie eher streng. Das passt zur
  neuen Regel: Ein Punkt mit Szenario ist nur erfüllt, wenn der Bot ihn beim Spielen findet.
- 46 % der P1-Punkte wurden von Szenario-Bots gespielt, der Rest ist „nicht automatisch prüfbar“ gelesen.
- 11 von 30 Bauten ersetzten mindestens einen Satz des Modells durch den festen Satz, weil er Technik enthielt (`ersetzt` in
  `roh/log-a10-bau-*.txt`). Kein Satz mit Code-Zeilen erreichte die Person; kein Inhaltsfehler betrifft mehr Code im
  „fehlt“ (Prototyp: 7×).
- Dafür gibt es jetzt **falsche „fehlt“**: In 6 Karten steht unter „fehlt“ etwas, das das Spiel laut Gutachterin doch tut.
  - Betroffen sind P01 L3, P03 L1, P04 L3, P12 L2, P16 L2 sowie eine Zusage in P16 L2.
  - Beispiele: „Spielende bei Wand/Selbstbiss gehe nicht, obwohl es funktioniert“ (P03 L1); „Wasserbomben und Versenken
    funktionierten nicht, obwohl der Code beides umsetzt“ (P01 L3).
  - Das ist die Kehrseite der strengen Abnahme: Ein Szenario, das zu knapp gewählt ist (Frames, Richtung, Emoji), fällt
    durch, obwohl das Spiel es kann.
  - Für die Person ist das ehrlich im Ergebnis (nichts abgebucht, kostenlos nachbessern), aber irreführend im Text.

## 4 Befunde und was daraus folgt

1. **P1-Ausgabelimit (behoben, Wrapper 3e3f93d).**
   - Im ersten Lauf endeten 16 von 42 Generierungen des Klärungsdialogs mit `stop_reason = max_tokens` bei 1500 Tokens.
   - Die Liste war dann kein gültiges JSON und nach der Reparaturrunde ein 502 „bad-output“: 9 von 25 Aufträgen ohne Liste
     (`vorlaeufe/lauf1/`).
   - Lauf 1 wurde abgebrochen und nicht geurteilt.
   - Fix: `GEN_MAX_TOKENS = 4096`; eine abgeschnittene Antwort bekommt eine Runde „kürzer“, mit Test. In Lauf 2 gab es 0
     abgeschnittene P1-Antworten.
2. **Planer-Ausgabelimit (offen).**
   - 6 von 34 Planer-Aufrufen erreichten `max_tokens` bei 8000.
   - Zwei Aufträge (P07 L2, P15 L1) endeten nach zwei Versuchen ohne Spiel. Grund „fehler“, nichts abgebucht, Vormerkung
     zurück.
   - Vorschlag: Planer wie Bauer auf 16k–32k mit Streaming. Außerdem bei `max_tokens` „kürzer“ verlangen statt mit gleichem
     Budget zu wiederholen, und den Fall als eigenen Grund protokollieren (heute ohne Logzeile).
3. **Marken-Regel im Klärungsdialog (Produktentscheidung).**
   - P1 lehnt jeden Satz mit einem Markennamen sofort ab („Marken und bekannte Spiele … kommen nicht vor. Beschreib es mit
     eigenen Worten.“). Das trifft 4 der 15 Wünsche vollständig.
   - Die Meldung ist ehrlich, für die Gutachterinnen aber teils überblockt (P08), weil sie nicht sagt, was zu ändern ist.
   - Der Prototyp ersetzte die Marke stattdessen und sagte es; das brachte dort 0,54–0,92 auf diesen Wünschen.
   - Optionen:
     - (a) die Marke ersetzen und offen sagen, wie im Prototyp;
     - (b) bei der Absage das Wort nennen und einen Vorschlag ohne Marke machen;
     - (c) so lassen.
   - Das ist eine Produktentscheidung (Board, Fragen).
4. **Moderation der fertigen Liste.** Zweimal wurde die Liste eines harmlosen Spiels als „passt nicht zu dieser App“
   abgelehnt (P01 L1, P12 L3). Das ist ein Fehlalarm der Moderation, mit Falldaten in `roh/karten.jsonl` zum Nachstellen.
5. **Falsche „fehlt“ durch zu knappe Szenarien** (Abschnitt 3, 6 Karten).
   - Vorschlag 1: Szenarien mit Reserve wählen lassen (längere Frames, mehrere Anläufe).
   - Vorschlag 2: Ein durchgefallenes Szenario erst nach einer zweiten Variante mit doppelter Dauer als „fehlt“ werten.
   - Vorschlag 3: Den festen Satz so formulieren, dass er das Gespielte beschreibt („Beim Ausprobieren haben wir … nicht
     gesehen“) statt eine Behauptung über das Spiel aufzustellen.
6. **„Egal“ für jede Frage** ist eine Grenze der Messung (siehe unten), kein Fehler: P1 wählt dann frei, z. B. Holzkisten statt
   Segelboote.

## 5 Produktion unverändert

- `demos-wrapper` vorher und nachher: `StartedAt=2026-11-17T22:28:02.473798375Z`, `RestartCount=0`, gleiches Image
  `sha256:a8be1b60…`, Status running.
- Die Tunnel wurden nicht angefasst. Auf 127.0.0.1 lauscht nach wie vor nur der Wrapper auf 8794; 8795 war und ist frei.
- `~/mdi-runner` und `~/mdi-staging` wurden nicht berührt.
- Nach der Messung entfernt: alle Container `a10-*`, die Netze `a10-intern`, `a10-pruef`, `a10-egress` und `a10-p1`, das Image
  `mdi-bau:a10`, das Arbeitsverzeichnis `~/a10-fk2` und das Datenarchiv.
- Was bleibt, ist Build-Cache des Docker-Daemons (gemeinsam genutzt). Er wurde nicht geleert, weil das auch fremde Caches
  träfe.
- Die Platte stieg von 72 % auf 78 %. Den größten Teil machen die Fix-Release- und Staging-Images derselben Stunde aus, nicht
  diese Messung.

## 6 Grenzen der Messung

- Personas und Urteile stammen von LLM-Subagenten (Sonnet 5.5), wie in den beiden früheren Messungen; es gibt keine
  Kappa-Kalibrierung.
- Im Klärungsdialog antwortet niemand wie die Persona: Jede Frage bekommt „Egal, überrasch mich“, und nach einer Absage formuliert
  niemand neu. Echte Personen würden ihre Erwartungen in den Fragen geltend machen und nach der Marken-Absage umformulieren.
  Die Werte für P1 sind darum eine Untergrenze.
- n = 15 Wünsche × 3 Läufe. Unterschiede von wenigen Hundertsteln liegen im Rauschen; belastbar sind der Abstand zur
  Nullmessung, das Verschwinden der abgeschnittenen Bauer-Antworten und der Einfluss von P1.
- Geurteilt wird die erste Auslieferung; Nachbesserungen wurden nicht gemessen.
- Die Kosten stammen aus der Buchung von Worker und P1 zu den Preisen des Prototyps.

## Rohdaten (`fk2-a10-messung/`)

- `roh/karten.jsonl`: 45 Aufträge mit P1-Fragen und -Liste, Status, Ergebnis je Punkt, Bau (Dauer, Kosten), Plan und
  Spielcode.
- `roh/spiele/`: die Module nach sha256.
- `roh/log-a10-*.txt`: Protokolle aller Container (Modellaufrufe nur mit Rolle, Tokens, Stop-Grund, Kosten; keine Inhalte).
- `roh/wrapper.log`: P1-Aufrufe und Kartenende.
- `urteil/`: Fälle (`judge-*.json`), Urteile (`urteile-*.jsonl`), Zuordnung (`faelle-map.jsonl`), Fotos, wörtlicher Prompt.
- `urteile.jsonl`, `kennzahlen.json`: Auswertung (`skripte/agg-a10.mjs`).
- `skripte/`: Aufbau und Lauf (`a10-lauf.sh`), Wrapper-Teil (`a10-wrapper.mjs`), Fälle (`prep-a10.mjs`), Auswertung.
- `vorlaeufe/`: Pilot (1 Auftrag) und der abgebrochene Lauf 1 (Befund 1), nicht in den Kennzahlen.
