# Bewertung der Quizfragen (Kalibrierung der Faktenprüfung)

**Datei zum Ausfüllen:** `fakten-kalibrierung.csv` (50 Fragen aus echten Spielen des Baukastens, Haiku 5.5). Bitte die Datei
`fakten-pruefer-urteile*.json` **vorher nicht öffnen**; sie enthält die Urteile des Prüfers, und der Vergleich ist nur ohne sie fair.

Pro Zeile in Spalte `urteil` genau eins von:

- **sicher**: Die als richtig markierte Antwort stimmt, ist eindeutig, und keine der falschen Antworten ist ebenfalls richtig.
- **unsicher**: Die Frage ist mehrdeutig, hängt von Definition, Region oder Zeitpunkt ab, oder eine andere Antwort wäre genauso richtig.
- **falsch**: Die markierte Antwort ist falsch, oder die Frage behauptet etwas Falsches.

Bei unsicher und falsch kurz in `grund` schreiben, warum. In `bewertet_von` den eigenen Namen (in jeder Zeile oder mindestens einer).

**Spielart** (Spalte `art`), weil sie ändert, was „eindeutig“ heißt:

- **auswahl**: Man wählt zwischen der markierten und den falschen Antworten. Es zählt nur, ob unter diesen Optionen genau eine richtig ist.
- **eintippen**: Man tippt das Wort ein, nur genau die markierte Antwort zählt. Passt ein anderes Wort genauso gut zum Hinweis, ist das unsicher.
- **buchstaben**: Die Buchstaben der Antwort werden gemischt gezeigt. **luecke**: Jeder zweite Buchstabe der Antwort wird gezeigt.
  Die gezeigten Buchstaben schließen andere Wörter oft aus (bei „Wiese“ passt „Rasen“ nicht zu W_E_E). Bewertet wird, ob das Wort
  existiert, richtig geschrieben ist und zum Hinweis passt.

Nicht bewertet werden Stil, Schwierigkeit und Grammatik, solange der Sinn klar ist.

Auswertung: `node bin/duell-bau-fakten-kalib.mjs vergleich --set fakten-kalibrierung.json --urteile fakten-pruefer-urteile.json --csv <ausgefüllt>.csv`
(Wrapper-Repo). Bis diese Bewertung vorliegt, läuft die Prüfung nur als Vorschlag (`DUELL_BAU_FAKTEN=vorschlag`).
