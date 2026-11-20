# Freie Karte: Nullmessung vor „Freie Karte 2“ (FK2)

Stand: 17.11.2026, Messung 17:27–17:37 UTC. Gemessen wird die heutige freie Karte („Create your own card“) von My Daily
Idea. Simulierte, nicht informierte Kundinnen und Kunden haben ihre Wünsche und Erwartungen formuliert. Alle Zahlen
stammen aus den Rohdaten in `fk2-nullmessung/`. Die Datei steht jeweils in Klammern.

## Kurzfassung

| Kennzahl | Wert | Quelle |
|---|---|---|
| Wünsche × Läufe | 26 × 3 = 78 | `wuensche.jsonl`, `ausgaben.jsonl` |
| Erfüllungsquote, gesamt (Mittel über alle Erwartungspunkte; erfüllt = 1, teilweise = 0,5) | **0,41** | `kennzahlen.json` |
| davon Arcade / andere Spiele / Nicht-Spiele | 0,23 / 0,33 / 0,69 | `kennzahlen.json` |
| Erfüllungsquote, nur Läufe mit Karte (51) | 0,63 | `urteile.jsonl` |
| Gesamturteil je Lauf: erfüllt / teilweise / nicht / ehrlich abgesagt / Scheinangebot | 23,1 % / 21,8 % / 12,8 % / **24,4 %** / **17,9 %** | `kennzahlen.json` |
| Anteil Scheinangebote an den gelieferten Karten | 14 von 51 (27 %) | `urteile.jsonl` |
| Harmlose Wünsche blockiert, mit Strike (3 Strikes am Tag pausieren das Konto) | 5 von 78 Läufen | `anzeige.jsonl` (`strike`) |
| Läufe mit sachlichem Fehler im Karteninhalt | 16 von 78 | `urteile.jsonl` (`fehler_inhalt`) |
| Latenz je Karte, Median / p90 / Max | 5,2 s / 18,1 s / 25,6 s | `kennzahlen.json` |
| Kosten je Karte (Haiku 5.5), Mittel / Max | 0,0011 $ / 0,0064 $ | `kennzahlen.json` |
| API-Kosten der gesamten Messung | **0,055 $** zu den Preisen des Auftrags, 0,062 $ mit dem 1-h-Cache-Write-Preis des Codes | `kennzahlen.json` |

## 1 Aufbau

**Erzeugung.** Die freie Karte entsteht im Wrapper: `POST /api/duell/ai` mit `kind: karte` und `act()` in
`lib/duell-ai.mjs` ruft `runKarte()` in `lib/duell-karte.mjs` auf. Ergebnis ist kein Code. Das Modell füllt ein festes
Schema je Art, der Server baut daraus ein Doc: eine Grußkarte (`card`) oder ein Meme (`photo`), Parameter der
Flug-Engine (`game`) oder der Lauf-Engine (`lauf`), ein Quiz bzw. eine Katalogfunktion (`turn`). Beim Genre G3 entsteht
eine deklarative Baukasten-Beschreibung (`bau`, `lib/duell-bau.mjs`), die Bots vorher durchspielen. Rennspiele,
Schießspiele, Marken und einige benannte Spiele werden vor jedem Modellaufruf mit festen Texten abgesagt
(`lib/duell-absage.mjs`, `routeWish`).

**Messumgebung.**
- Wegwerf-Container `fk2-null-run`, `-2` und `-3` auf ssh-united.
- Image `cads-demos-wrapper:fix2-20261117`, Label `org.mdi.null=1`.
- Keine Produktions-Volumes, kein Port. Der Key war read-only eingebunden.
- Ein Node-Skript (`skripte/run.mjs`) ruft die Server-Reihenfolge von `act()` direkt auf: `read` → `need` →
  `screenInput` (S1) → weiche Absage oder harter Block → `runKarte` (S2–S5). Dabei läuft das echte Modell `claude-haiku-5-5`
  über `lib/duell-llm.mjs`. Die Tages- und Monatsgrenze lagen bei 7 $ bzw. 3 $, mit eigener Budgetdatei im Container.
- Login, Pot, Warteschlange, Siegel und Antwort-Cache laufen so nicht mit. Das ist die konservative Variante: Es gibt
  keinen HTTP-Schalter, um das Login zu umgehen, und Produktion bleibt unberührt.

**Code-Stand.** `lib/` und `bin/` im Image sind byteweise gleich mit CADS-DEMO-wrapper `main` 254d4f7 (sha256 über
303 Dateien). Abweichend sind nur `lib/vendor/mdi/PROVENANCE.json` und `lib/vendor/mdi-baukasten/PROVENANCE.json`. Das
Image-Label nennt den Wrapper-Commit 31f8aad. Diesen Commit gibt es im lokalen Klon nicht.

**Personas.**
- Ein Subagent (Sonnet 5.5) ohne Systemwissen hat 26 Personas von 16 bis 85 Jahren erzeugt (`wuensche.jsonl`).
- Er kannte nur, was die App zeigt: die Knöpfe „Was soll es werden?“ und „Welche Art?“ sowie den Platzhalter.
- Wünsche: 11 Arcade-Spiele, 6 andere Spiele, 9 Nicht-Spiele.
- Jede Persona hat die Knöpfe selbst gewählt und 3–6 Erwartungen notiert, bevor es ein Ergebnis gab.
- Alter ≥ 18 wird als „18+ im Profil erklärt“ angenommen (`a18`), 16–17 als `u18`.

**Anzeige.** `skripte/prep.mjs` übersetzt jedes Ergebnis in das, was die Person sieht (`anzeige.jsonl`):
- Meldungstexte und Alternativen nach `apps/mdi/src/features/frei/view.js` (refusalText, refusalBlock, noteLines) und
  `texts.js` (CADS-agent-marketplace 16763f09).
- Spiele mit einer sachlichen Beschreibung des Engine-Prinzips.
- Annahme: `bad-output` erscheint als „KI gerade nicht erreichbar“. Das kam in dieser Messung nicht vor.

**Urteil.**
- Zwei weitere Subagenten (Sonnet 5.5) haben die 58 verschiedenen Anzeigen bewertet (`urteile.jsonl`).
- Sie kannten nur Persona, Wunsch, Erwartungen und Anzeige.
- Je Erwartungspunkt gab es genau ein Urteil: erfüllt, teilweise, nicht, ehrlich abgesagt oder Scheinangebot.
- Dazu je Fall: ein Gesamturteil, „überblockt“, Inhaltsfehler und Muster.

**Rendern.** Nicht gemacht. Die App zeigt eine freie Karte nur mit einem gültigen Siegel aus Deck und Status-Gate an. Ein
Screenshot würde den Fake-Wrapper der E2E-Tests (`test/e2e/lib/fakefrei.mjs`) mit eigenen Aufnahmen brauchen. Das ist
kein kleiner Aufwand.

## 2 Ergebnisse je Wunsch

Spalte „Quote“: Mittel der drei Läufe. Spalte „Ergebnis“: Klasse je Lauf.

| ID | Alter | Knöpfe | Wunsch (gekürzt) | Ergebnis | Quote | Gesamt |
|---|---|---|---|---|---|---|
| P01 | 34 | Spiel/Fliegen | Space Invaders mit Segelbooten | Flugspiel ×3 | 0,00 | Scheinangebot ×3 |
| P02 | 16 | Spiel/Neu | Breakout, Lego-Steine, Pizza-Ball | Marken-Absage ×3 | 0,00 | ehrlich abgesagt |
| P03 | 72 | Spiel/Neu | Schlangenspiel wie auf dem Nokia | Baukasten-Snake ×3 | 1,00 | erfüllt |
| P04 | 45 | Spiel/Fliegen | Rennspiel, roter Sportwagen | Absage „Rennspiele“ + Flug-Wettrennen ×3 | 0,00 | ehrlich abgesagt |
| P05 | 58 | Spiel/Fliegen | Asteroids, Raumschiff schießt Felsen ab | Flugspiel ×3 | 0,21 | Scheinangebot ×3 |
| P06 | 19 | Spiel/Jump & Run | Katze auf Dächern sammelt Fischgräten | Lauf-Spiel ×3 | 0,63 | teilweise |
| P07 | 28 | Spiel/Fliegen | Wasserballon-Duell „ohne blut“ | S1-Block mit Strike ×3 | 0,00 | nicht, überblockt |
| P08 | 23 | Spiel/Neu | „wie pacman“, Donut im Labyrinth | Marken-Absage ×3 | 0,00 | ehrlich abgesagt |
| P09 | 17 | Spiel/Jump & Run | „flappy bird aber mit nem huhn“ | Marken-Absage ×3 | 0,00 | nicht, überblockt |
| P10 | 66 | Spiel/Neu | Pong gegen den Computer | Baukasten ×2, „nicht zu schaffen“ ×1 | 0,67 | erfüllt ×2 |
| P11 | 31 | Spiel/Neu | Tetris mit Kuchenstücken | Tetris-Absage + Katalog ×3 | 0,00 | ehrlich abgesagt |
| P12 | 81 | Spiel/Neu | Memory mit Fotos der Enkel, 12 Karten | Emoji-Memory ×2, Block mit Strike ×1 | 0,50 | teilweise ×2 |
| P13 | 52 | Spiel/Neu | Würfelspiel bis 100 Punkte | Absage ×3 | 0,00 | ehrlich abgesagt |
| P14 | 49 | Quiz | Buchstabensalat für die 7. Klasse | Quiz ×3 | 0,50 | teilweise / nicht |
| P15 | 24 | Spiel/Neu | Schätzspiel Gummibärchen | Baukasten-Zahlenquiz ×3 | 0,00 | Scheinangebot / nicht |
| P16 | 77 | Spiel/Neu | Mau-Mau gegen den Computer | Absage + Skat-Katalog ×3 | 0,00 | ehrlich abgesagt |
| P17 | 69 | Quiz | Rechenrätsel mit Tieren für Enkel | Quiz ×3 | 0,96 | erfüllt |
| P18 | 55 | Karte | Geburtstag Karin, 60, Frösche | Karte ×3 | 1,00 | erfüllt |
| P19 | 85 | Karte | Gute Besserung Herr Brandt | Karte ×3 | 0,92 | erfüllt / teilweise |
| P20 | 63 | Karte | Umfrage Vereinsausflug | statische Karte ×3 | 0,38 | Scheinangebot ×3 |
| P21 | 47 | Karte | Termin Doppelkopfrunde | statische Karte ×3 | 0,13 | Scheinangebot ×3 |
| P22 | 41 | Wie eine Karte | Grillen, Samstag oder Sonntag im Juli | Terminkarte + Hinweis 14 Tage ×3 | 0,63 | teilweise |
| P23 | 38 | Quiz | Hildesheim-Quiz, 8 Fragen | Quiz ×2, Block mit Strike ×1 | 0,50 | teilweise ×2 |
| P24 | 74 | Quiz | Gartenvögel erkennen | Quiz ×3 | 0,96 | erfüllt |
| P25 | 20 | Meme | Montagmorgen, Katze vorwurfsvoll | Meme ×3 | 0,88 | teilweise |
| P26 | 61 | Karte | Danke an Frau Meier vom Chor | Karte ×3 | 0,88 | erfüllt / teilweise |

Quellen: `kennzahlen.json` (`quote_je_wunsch`, `stabil`) und `urteile.jsonl`.

**Stabilität.** 23 von 26 Wünschen bringen in allen drei Läufen dieselbe Klasse. Bei drei Wünschen wechselt sie:
- P10: einmal nach zwei Reparaturrunden „nicht zu schaffen“, das dauerte 51,7 s.
- P12: einmal `ok:false` des Generators, das ergibt einen Strike.
- P23: einmal `output-drink` in S4, ebenfalls ein Strike.

## 3 Häufigste Abweichungsmuster

1. **Scheinangebot durch die gewählte Engine (Arcade unter „Fliegen“).**
   - Was passiert: „Space Invaders mit Segelbooten“ wird zu „Segel im All“, „Segelflug über den Wellen“ oder „Segel-Sturm
     über dem Meer“. „Asteroids …“ wird zu „Felsenflug im All“. Beides sind Flatter-Hindernisspiele ohne Gegner und ohne
     Schießen, und es kommt kein Hinweis (6 von 6 Läufen).
   - Ursache im Code: Das gewählte Genre gewinnt (`routeWish`). „Space Invaders“ und „Asteroids“ fehlen in `NAMED_GAMES`
     und in der Absage-Tabelle (`gameKeyOf` liefert ''). Die Regex `FLIGHT` trifft „Segel…“ in „Segelbooten“.
2. **Eine Funktion wird nur als Text versprochen (Nicht-Spiele unter „Karte“).**
   - Was passiert: Umfrage und Terminfindung ergeben eine statische Grußkarte mit „Stimmt ab: Harz, Ostsee oder
     Spreewald?“ bzw. „Wann passt es euch allen? Schreibt es uns!“. Es gibt keine Abstimmung und keine Terminwahl
     (6 von 6 Läufen).
   - Ursache im Code: Das Matching `needsOf`/`candidatesFor` läuft nur für `faehigkeit` und `game`. Die Prüfung `fitOf`
     greift nur bei Fähigkeiten. Die Katalogkarten `zug-termin` und `zug-einig` gibt es, sie wurden nicht angeboten.
3. **Harmlose Wünsche hart blockiert, mit Strike.**
   - P07: „… ohne blut“ trifft S1 hart. Geprüft mit `K.s1`: „ohne blut“ → `unkind`, derselbe Satz ohne diese zwei
     Wörter → ''. Die Meldung lautet „ohne echte Namen und ohne Gemeines“.
   - P12 und P23: je ein Lauf mit einer Modell-Absage. Meldung: „Probier einen freundlichen Wunsch“.
   - Zusammen sind das 5 Strikes in 78 Läufen. Bei `DUELL_CREATE_BLOCKS_PER_DAY` = 3 (Standard, in Produktion nicht
     gesetzt) pausiert das Konto nach drei Versuchen bis zum nächsten Tag.
   - Der Unterschied zwischen Schießen mit einer Waffe und Schießen auf Felsbrocken liegt nicht im Wunsch: „abschiesst“
     (P05) geht durch, „schiessen mit wasserballons … ohne blut“ nicht.
4. **Absage ohne Weg weiter.**
   - Marke: „lego“, „pacman“ und „flappy bird“ ergeben „Marken und ihre Figuren kommen nicht auf die freie Karte“ und
     „Im Katalog gibt es dafür noch keine Karte“, obwohl `arcade-ziegel` (Breakout) im Katalog ist und ein Huhn-Flugspiel
     genau G1 wäre (9 von 9 Läufen ohne Alternative).
   - Bei G3 sagen die Absagen zu Würfel- und Kartenspiel „Ein Flugspiel wäre etwas anderes“. Der Satz passt nicht zum
     gewählten „Neues Spiel“.
5. **Inhaltsfehler ohne Prüfung.** In 16 von 78 Läufen gibt es sachliche oder sprachliche Fehler:
   - Anagramm-Quiz: Mehrdeutig sind ULHSCE (Schule/Luchse) und LEMAP (Palme/Lampe). In Lauf 2 sind 3 von 5 Aufgaben
     unlösbar, z. B. „TAIMRE → Mariet“.
   - 5 statt der gewünschten 8 Fragen.
   - Duzen von „Herr Brandt“ und „Frau Meier“; „Froesche“ statt „Frösche“.
   - Eine Faktenprüfung gibt es nur im Baukasten (G3), nicht für die Art `quiz`.
6. **Details still ersetzt.** Nichts davon wird gesagt:
   - Fischgräten → Münze.
   - Dächer → Welt „stadt“.
   - Fotos der Enkel → Emoji-Paare.
   - Schätzspiel → Zahlen-Wissensquiz (3 von 3, Titel „Zahlenrätsel zu zweit“).
   - Die Liste `missing`/`skip:` gibt es nur beim Verfeinern (`anpassung`).

Was gut läuft: Grüße, Dank, Meme und Wissensquiz (P17–P19, P24–P26) erreichen eine Quote von 0,88–1,0. Snake und Pong im
Baukasten wurden bei 5 von 6 Versuchen sauber umgesetzt. Bei Renn- und Tetris-Wünschen und bei der Juli-Grenze der
Terminkarte sagt die App ehrlich ab bzw. weist auf die Grenze hin.

## 4 Latenz und Kosten

Basis: 78 Läufe, 190 Modellaufrufe (`kennzahlen.json`).

| Art | n Karten | Kosten je Karte (Mittel) | Latenz (Median) |
|---|---|---|---|
| Grußkarte | 15 | 0,00048 $ | 4,4 s |
| Meme | 3 | 0,00096 $ | 4,7 s |
| Flugspiel | 6 | 0,00101 $ | 7,0 s |
| Jump & Run | 3 | 0,00103 $ | 5,1 s |
| Quiz/Funktion | 14 | 0,00082 $ | 5,3 s |
| Baukasten (G3) | 10 | 0,00244 $ | 18,1 s |

**Tokens gesamt.** in 23.306, out 58.866, Cache-Read 1.072.142, Cache-Write 99.591.

**Kosten zu den Preisen des Auftrags.** In 0,10 $/MTok, out 0,50 $/MTok, Cache-Read 0,01 $/MTok, Cache-Write 0,125 $/MTok.
Das ergibt **0,0549 $**.

**Kosten zum Preis des Codes.** Der Code schreibt den Cache mit `ttl: 1h` und rechnet dafür 0,20 $/MTok (`PRICES` in
`lib/duell-llm.mjs`). Damit sind es 0,0624 $. Die eigene Buchung von `createLlm` ergab dieselbe Summe der drei Läufe
(0,0315 + 0,0176 + 0,0133 $).

**Abgesagte Läufe.** Absagen vor dem Modell dauern 1–14 ms und kosten 0 $. Eine Baukasten-Absage nach zwei Reparaturen
dauerte 51,7 s.

**Sonnet.** Personas und Urteile kamen von Claude-Code-Subagenten, nicht über die Anthropic-API. Sie belasten den Key
nicht.

**Gesamte API-Kosten: 0,06 $ von 10 $.**

## 5 Harness-Verbesserungen für FK2 (abgeleitet aus den Abweichungen)

1. **Mechanik gegen den Wunsch prüfen, auch bei gewähltem Genre.**
   - Bekannte Arcade-Titel und Mechaniken (Space Invaders, Asteroids, Galaga, Frogger, Pac-Man …) auf Mechanik-Schlüssel
     abbilden.
   - S2 soll das Feld `spiel` auch bei G1/G2 ausfüllen.
   - Bei einem Widerspruch: Rückfrage oder Absage mit Vorschlag (G3 bzw. die passende `arcade-*`-Katalogkarte), nie still
     das Flugspiel bauen.
   - `FLIGHT` darf „Segelboot“ nicht als Fliegen werten.
   - Betrifft Muster 1 (6 von 78 Läufen).
2. **Den Bedarf an Funktionen für jede Art erkennen.**
   - `needsOf` auch bei `card`, `meme` und `quiz` auswerten.
   - Bei Abstimmung oder Termin auf „Wie eine Karte“ umleiten (`zug-einig`, `zug-termin`) oder nachfragen.
   - Eine S5-Regel ergänzen: Ein Kartentext darf keine Handlung versprechen, die die Karte nicht hat („Stimmt ab“, „Wann
     passt es?“).
   - Betrifft Muster 2 (6 von 78).
3. **Ehrlich blockieren statt bestrafen.**
   - S1 soll Verneinungen verstehen: „ohne Blut“, „ohne Gewalt“, „ohne Waffen“.
   - Harmlose Wurfgeschosse wie Wasserballon, Schneeball und Farbe bekommen die weiche Absage `spielwaffe` oder eine
     Umleitung, keinen harten Block.
   - Kein Strike, wenn S2 `risk` 0 meldete und erst der Generator `ok:false` sagt oder S4 ein Getränkewort findet.
     Stattdessen eine weiche Absage mit Grund.
   - Betrifft Muster 3 (5 Strikes).
4. **Absagen mit einem Weg weiter.**
   - Bei Marken das Markenwort entfernen und den Rest neu routen: Lego-Steine → bunte Steine, Flappy Bird → G1 und
     dieselbe Figur, Pac-Man → Labyrinth in G3.
   - Katalog-Alternativen über die Mechanik anbieten (`arcade-ziegel` für Breakout).
   - Den Text `create_notyet_game` je Genre fassen, ohne den Flugspiel-Satz bei G3.
   - Betrifft Muster 4 (9 Marken-Absagen ohne Alternative und 6 unpassende G3-Texte, zusammen 15 von 78).
5. **Inhalte prüfen.**
   - Die Faktenprüfung (`duell-bau-fakten.mjs`) auch für die Art `quiz` nutzen.
   - Anagramme deterministisch prüfen: gleiche Buchstabenmenge; kein Distraktor ist ebenfalls eine Lösung.
   - Gewünschte Anzahlen übernehmen oder die Grenze ansagen.
   - Bei „Herr/Frau Name“ das Siezen erzwingen und prüfen.
   - Umlaute statt ae/oe/ue in Kartentexten.
   - Betrifft Muster 5 (16 von 78).
6. **Ersetzte Teile ansagen.**
   - Die Liste `missing`/`skip:` aus `duell-frei.mjs` auch für neue Karten aller Arten nutzen: Sammelobjekt, Welt,
     Fotos, Mechanik („Schätzen“ → Quiz).
   - Betrifft Muster 6.
7. **Stabilität messen.**
   - Jeder Wunsch mit k ≥ 3 Läufen, berichtet als pass^k.
   - Hier ist das 3 von 26 Wünschen mit wechselnder Klasse, darunter zwei Strikes.
   - Für G3 die Reparaturrunden und die Latenz bis 52 s im Blick behalten.
8. **Messung als Gold aufbauen.**
   - Diese 26 Wünsche mit den Erwartungen der Personas als festen Regressionssatz für FK2 nehmen.
   - Die Urteile per Kappa gegen eine menschliche Stichprobe kalibrieren (siehe `harness-bewertung.md`).

## 6 Grenzen der Messung

- Die Personas und die Urteile stammen von LLM-Subagenten (Sonnet 5.5), nicht von Menschen. Es gibt keine
  Kappa-Kalibrierung. Eine Stichprobe habe ich nachgeprüft: P14 Lauf 2, P20, P21 sowie die Routing-Funktionen lokal ohne
  Modell. Grenzfälle sind strittig: P09 „flappy bird“ ist eine Marke, die Gutachterin wertet die Absage trotzdem als
  überblockt, weil das Genre machbar wäre.
- Die Wünsche wurden einmal erzeugt, mit n = 26. Die Anteile sind grobe Schätzungen, ohne Konfidenzintervalle.
- Die Läufe gingen am HTTP-Pfad vorbei. Login, Pot, Strike-Zähler, Warteschlange und Cache liefen nicht mit. Die
  Strike-Folgen sind aus dem Code abgeleitet (`act()`), nicht beobachtet.
- 18+ wurde für alle Personas ab 18 angenommen. Ohne Profilangabe gilt `u18`. Das ändert nur die Geld-Fähigkeit, die
  hier nicht vorkam.
- Gerendert wurde nichts (siehe Abschnitt 1). Die Beschreibung der Engines in `anzeige.jsonl` ist meine Zusammenfassung
  aus dem Code (`flug/card.js`, Manifest `lauf`, Baukasten-Doc).
- Bei `zug-termin` hat das Doc leere Felder `t` und `s`. Die App zeigt dann vermutlich den Katalogtitel. Die Gutachterin
  wertete „Titel leer“, das drückt P22 leicht.

## Rohdaten (`fk2-nullmessung/`)

- `wuensche.jsonl`: 26 Personas mit Knopfwahl, Wunsch und Erwartungen, geschrieben vor dem Ergebnis.
- `ausgaben.jsonl`: 78 Läufe mit Eingabe, Stufe, Latenz, jedem Modellaufruf (Tokens, Stop, Kosten) und dem vollständigen
  Ergebnis von `runKarte` bzw. der Absage. Keine Secrets.
- `anzeige.jsonl`: was die App je Lauf zeigt, mit Klasse und Strike.
- `urteile.jsonl`: Urteil je Erwartungspunkt und Lauf, Gesamturteil, Muster und Begründung.
- `kennzahlen.json`: alle Zahlen dieses Berichts.
- `skripte/`: `run.mjs` (Messung im Container, Eingabe `/work/wuensche.jsonl`), `prep.mjs` (Anzeige; erwartet `texts.mjs`
  aus `apps/mdi/src/features/frei/texts.js` daneben) und `agg.mjs` (Kennzahlen).
