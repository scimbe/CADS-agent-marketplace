# Spielbeschreibung: Stufen S-Daten → S-Regeln → S-Code für Haiku

Frage aus `KONZEPT.md` §3: Verbessert ein gestufter Weg (Daten → deklarative Regeln aus Bausteinen → Code-Hooks)
Erfolgsquote und Sicherheit bei einem kleinen Modell (Claude Haiku)? Welche Bausteine decken die meisten Casual-, Party-,
Arcade- und Zugspiele ab?

Stand der Recherche: 2026-11-11. Wo nur Abstract oder Sekundärquelle gelesen wurde, steht *(nur Abstract)* bzw.
*(Sekundärquelle)*.

## Quellen

| # | Quelle | Kern für uns |
|---|---|---|
| Q1 | T. Schaul, „A Video Game Description Language for Model-based or Interactive Learning“, IEEE CIG 2013. https://course.khoury.northeastern.edu/cs5150f13/readings/schaul_vgdl.pdf *(nur Abstract)* | VGDL: einfache Bausteine (Sprites mit Ort und Dynamik) + Interaktionseffekte bei Kollision + Endbedingungen. |
| Q2 | D. Pérez-Liébana, J. Liu, A. Khalifa, R. D. Gaina, J. Togelius, S. M. Lucas, „General Video Game AI: A Multitrack Framework …“, IEEE Trans. Games 11(3):195–214, 2019, doi:10.1109/TG.2019.2901021. https://arxiv.org/abs/1802.10363 *(nur Abstract)* | GVGAI: Hunderte VGDL-Spiele, generische Agenten und Generatoren auf einer Plattform. |
| Q3 | É. Piette, D. Soemers, M. Stephenson, C. Sironi, M. Winands, C. Browne, „Ludii – The Ludemic General Game System“, ECAI 2020, S. 411–418. https://arxiv.org/abs/1905.05013 *(nur Abstract)* | Spiele als Baum aus „Ludemen“ (verständliche Spielkonzepte); >1000 Brettspiele beschrieben. |
| Q4 | S. Lavelle (increpare), PuzzleScript. https://www.puzzlescript.net *(nicht nachgeprüft: Doku nicht abgerufen)* | Regelsprache für rasterbasierte Rätselspiele als Umschreiberegeln. |
| Q5 | C. Hu, Y. Zhao, J. Liu, „Game Generation via Large Language Models“, IEEE CoG 2024. https://arxiv.org/abs/2404.08706 | LLM erzeugt VGDL-Regeln + Level. Ohne Grammatik/Beispiele selten parsebar (GPT-3.5: 1–2/10, GPT-4: 4–8/10). Mit Grammatik im Prompt: GPT-3.5 10/10 parsebar, aber 0/10 korrekt. Vollkontext: GPT-4 10/10 korrekt, GPT-3.5 1/10. **Gemma 7B scheitert fast immer schon an der Syntax.** |
| Q6 | T. Tanaka, E. Simo-Serra, „Grammar-based Game Description Generation using Large Language Models“, IEEE Trans. Games 2024. https://arxiv.org/abs/2407.17404 *(nur Abstract)* | Ludii-GDL: Grammatik als Zwischenschritt + iterative Verbesserung schlägt direkte LLM-Ausgabe deutlich. |
| Q7 | G. Todd, A. Padula, M. Stephenson, É. Piette, D. Soemers, J. Togelius, „GAVEL: Generating Games Via Evolution and Language Models“, NeurIPS 2024. https://arxiv.org/abs/2407.09388 *(nur Abstract + Sekundärquelle)* | Ludii-Spiele per MAP-Elites; LLM (CodeLlama-13B) **musste auf Ludii feinjustiert werden**; Bewertung über Agenten-Playtests. |
| Q8 | G. Todd, A. Padula, D. Soemers, J. Togelius (+S. Earle), „Ludax: A GPU-Accelerated Domain Specific Language for Board Games“, arXiv 2506.22609 (2025), RLJ/RLC 2026. https://arxiv.org/abs/2506.22609 *(nur Abstract)* | Regelsprache, die in schnellen Code kompiliert → viele Playtests billig. |
| Q9 | S. Earle, A. Khalifa, M. U. Nasir, Z. Jiang, G. Todd, A. Banburski-Fahey, J. Togelius, „ScriptDoctor: Automatic Generation of PuzzleScript Games via LLMs and Tree Search“, IEEE CoG 2025 (short). https://arxiv.org/abs/2506.06524 *(nur Abstract)* | Schleife: LLM schreibt PuzzleScript, **Compiler-Fehler und ein Suchagent als Spieler** liefern Rückmeldung. |
| Q10 | Á. G. Becker, G. Bauer de Oliveira, L. B. Rossato, A. R. Tavares, „Boardwalk: Towards a Framework for Creating Board Games with LLMs“, arXiv 2508.16447 (2025). https://arxiv.org/abs/2508.16447 | 12 Spiele, 3 LLMs, Python frei vs. in einer GGP-API. Bestes Modell (Claude 3.7 Sonnet) 55,6 % fehlerfrei. **API-Konformität erhöht die Fehlerhäufigkeit**, die Schwere hängt stärker vom Modell ab. Autoren meiden Ludii, weil dessen Grammatik für LLMs schwer ist (zitierte 72 % Kompilierquote). |
| Q11 | S. Geng, M. Josifoski, M. Peyrard, R. West, „Grammar-Constrained Decoding for Structured NLP Tasks without Finetuning“, EMNLP 2023, doi:10.18653/v1/2023.emnlp-main.674. https://aclanthology.org/2023.emnlp-main.674 | Grammatik-beschränktes Dekodieren übertrifft unbeschränkte LMs deutlich. |
| Q12 | Anthropic, „Structured outputs“ / „Strict tool use“, Claude-Doku (abgerufen 2026-11-11). https://platform.claude.com/docs/en/build-with-claude/structured-outputs | `strict: true` beschränkt das Sampling auf schema-gültige Ausgaben; Haiku 4.5 ist gelistet. Garantiert Form, nicht Sinn. *(Unterstützung für Haiku 5.5 nicht nachgeprüft.)* |
| Q13 | M. Sicart, „Defining Game Mechanics“, Game Studies 8(2), 2008. https://gamestudies.org/0802/articles/sicart | Mechanik = von Agenten aufgerufene Methode, die Spielzustand ändert; direkt auf objektbasierte Engines abbildbar. |
| Q14 | G. Engelstein, I. Shalev, „Building Blocks of Tabletop Game Design: An Encyclopedia of Mechanisms“, CRC Press 2019 (2. Aufl. 2022). *(Inhaltsverzeichnis nicht eingesehen; Kategorien laut Verlagsangaben)* | Katalog von ~200 Mechanismen in 13 Gruppen (Spielstruktur, Zugreihenfolge, Aktionen, Auflösung, Spielende/Sieg, Unsicherheit, Ökonomie, Auktion, Arbeiter, Bewegung, Gebiet, Sets, Karten). |
| Q15 | A. Järvinen, „Games without Frontiers“, Diss. Univ. Tampere 2008. https://trepo.tuni.fi/bitstream/10024/67820/1/978-951-44-7252-7.pdf *(nicht gelesen)* | Mechanik-Bibliothek als Analyseinstrument. |

## Befund

1. **Unbekannte Textsyntax ist die erste Fehlerquelle, und sie trifft kleine Modelle am härtesten** (Q5: Gemma 7B
   fast nie parsebar; Q10: Ludii-Grammatik schwer, 72 % Kompilierquote). Grammatik im Kontext (Q5, Q6) oder
   beschränktes Dekodieren (Q11, Q12) beseitigt Syntaxfehler weitgehend bzw. vollständig.
2. **Syntax gültig ≠ Spiel korrekt.** Q5: GPT-3.5 erreicht mit Grammatik 10/10 parsebar, aber 0/10 korrekt. Die
   semantische Lücke schließen nur ausführbare Prüfungen: Compiler + Suchagent als Spieler (Q9), Agenten-Playtests (Q7).
3. **Eine API/ein SDK ist kein Selbstläufer.** Q10: Konformität zu einer fremden API erhöht die Fehlerhäufigkeit
   gegenüber freiem Python. Ein SDK hilft nur, wenn es klein ist und mit Beispielen im Kontext steht.
4. **Feinjustierung ist in der Forschung üblich, für uns nicht vorgesehen** (Q7 justiert CodeLlama-13B). Ohne
   Feinjustierung muss der Kontext (Katalog + Beispiele) die Sprache lehren → Katalog muss klein bleiben.
5. **Kein Paper vergleicht genau unsere drei Stufen mit Haiku.** Die Stufung ist durch Befund 1–3 *plausibel*, aber
   nicht belegt. Unsicherheit: hoch; nur ein eigener Benchmark klärt sie.

## Antwort auf die Frage

Ja, mit zwei Bedingungen: (a) S-Regeln ist **keine eigene Textsprache**, sondern JSON nach JSON-Schema, erzeugt per
Strict Tool Use (Syntaxfehler ausgeschlossen, Q12); (b) **jede** Stufe läuft durch denselben ausführbaren Harness
(Determinismus, Bot-Playtests, Q9), denn der Gewinn der Stufung liegt in weniger Freiheitsgraden, nicht in
automatischer Korrektheit.

## Empfohlener Bausatz (Bausteine für S-Regeln)

Ableitung: VGDL-Struktur (Q1: Objekte, Kollisions-Interaktionen, Endbedingungen) + Mechanik-Kategorien (Q14) +
vorhandene Engines (`02-spec/05-spielen.md`: Flug, Lauf, Arcade, Zug, Tisch, Dart, Malrat, Agent-Duell/RPS).
18 Bausteine in fünf Gruppen; jeder ist ein getestetes SDK-Modul mit JSON-Schema und Testvektoren.

| Gruppe | Baustein | Parameter (Auszug) | deckt ab |
|---|---|---|---|
| Raum | `grid` | Breite, Höhe, Nachbarschaft 4/8/hex, Wände | Zug-Brettspiele, Match-3, Labyrinth, Rätsel |
| | `track` | Bahnen, Länge, Abschnitte aus Seed | Lauf, Flug (Scroller) |
| | `field` | Größe in ganzzahligen Einheiten, Ränder (Wand/Wrap/Tod) | Arcade, Dart, Ballduell |
| Dinge | `entity` | Typ, Eigenschaften, Token-Name für Optik, Start | alle |
| | `spawner` | Typ, Rate in Ticks, Muster aus Seed | Arcade, Lauf, Flug |
| | `deck` | Karten (Daten), Stapel/Hand/Ablage/Auslage, verdeckt/offen je Sitz | Skat, Doppelkopf, Memory, Quartett |
| | `pieces` | Steine je Spieler, Platzieren/Ziehen/Schlagen | Mühle, Vier gewinnt, Dame-artige |
| Bewegung | `kinematics` | Geschwindigkeit, Schwerkraft, Sprung, Reibung (Festkomma) | Flug, Lauf, Arcade |
| | `collide` | Form (Box/Kreis/Zelle), Paare → Ereignis | Arcade, Flug, Ballduell |
| | `aim` | Winkel, Kraft, Streuung aus Seed | Dart, Wurf-/Zielspiele |
| Ablauf | `turns` | Reihenfolge, Phasen, **simultan-verdeckt** | Zug, Tisch, RPS, Schätzen |
| | `timer` | Ticks, Runden, Countdown | alle Echtzeit- und Rundenspiele |
| | `input` | Tap/Halten/Wisch/Richtung/Ziehen → Aktion | alle |
| Regeln | `rule` | wenn Ereignis ∧ Bedingung → Effekte (Punkte, entfernen, erzeugen, setzen, Zug beenden) | Kern der deklarativen Ebene (VGDL-Interaktionen) |
| | `pattern` | n-in-Reihe, Set, Match-n, Fläche umschlossen | Vier gewinnt, Match-3, Sammeln |
| | `score` | Punkte, Leben, Kombo, Stiche/Augen | alle |
| | `end` | Ziel, Zeit, Leben 0, Brett voll, Muster, Rundenzahl; Sieger-Regel | alle |
| Party | `prompt` | Fragen/Wörter (Daten), Antworttyp (Wahl, Zahl, Text, Zeichnung), Wertung, Aufdecken | Quiz, Schätzen, Malrat, Abstimmen |

Grenzen: Physik mit vielen Körpern, Erzählspiele, freie Zeichen-Erkennung und alles mit eigener Geometrie bleiben
S-Code (Bausteine dort als Bibliothek). Ob die 18 Bausteine „die meisten“ Karten tragen, ist **nicht belegt**; Prüfung:
die 64 Regal-Karten einzeln als S-Daten/S-Regeln/S-Code einordnen (Paritätsliste).

## Ableitung für das Konzept

1. **Änderung:** S-Regeln wird als **JSON-Dokument nach Schema** definiert (Bausteinliste + `rule`-Einträge), nicht als
   Textsprache à la VGDL/Ludii. Erzeugung per Strict Tool Use; das Schema *ist* die Grammatik (Q11, Q12).
2. **Änderung:** Die Einordnung („welche Stufe?“) ist selbst ein schema-beschränkter Aufruf mit festen Kategorien und
   „gibt es noch nicht“ als erlaubter Antwort.
3. Bausteinkatalog + 2–3 vollständige Beispielspiele stehen bei jeder Erzeugung im Kontext (Q5: ohne Kontext keine
   korrekten Spiele); Katalog per Prompt-Caching wiederverwenden, deshalb klein halten (≈18 Bausteine).
4. Der Harness ist für alle Stufen gleich und ausführbar (Determinismus-Hash, Bot-Playtests, Reparaturrunden mit
   Fehlermeldung als Rückmeldung, Q9). Auch S-Daten braucht Playtests, wenn params Spielwerte ändern.
5. S-Code-SDK minimal halten (Vertrag + Bausteine als reine Funktionen, Typdeklarationen, Beispiele), weil eine fremde
   API sonst Fehler erzeugt statt verhindert (Q10).
6. **Spike vor D2:** Benchmark mit ~30 eingefrorenen Absichten × 3 Stufen × Haiku, Kennzahlen: schema-gültig,
   Harness bestanden, menschlich „spielt sich wie gemeint“. Erst dieser Benchmark belegt oder widerlegt die Stufung.
