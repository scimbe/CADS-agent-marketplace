# Generische Bots für beliebige deterministische Spiele

Frage aus `KONZEPT.md` §3: „`moves` vorhanden → Bot (generischer Suchbot mit Budget)“. Trägt ein einziger Bot alle
Zugspiele, und was gilt für Echtzeitspiele? Stand: 2026-11-11.

## Quellen

| # | Quelle | Kern für uns |
|---|---|---|
| B1 | C. Browne, E. Powley, D. Whitehouse, S. Lucas, P. Cowling, P. Rohlfshagen, S. Tavener, D. Perez, S. Samothrakis, S. Colton, „A Survey of Monte Carlo Tree Search Methods“, IEEE TCIAIG 4(1):1–43, 2012, doi:10.1109/TCIAIG.2012.2186810. https://ieeexplore.ieee.org/document/6145622 | MCTS/UCT braucht nur Zuggenerator + Vorwärtsmodell + Ergebnis; „anytime“ (jederzeit abbrechbar); Stand der Varianten. |
| B2 | Y. Björnsson, H. Finnsson, „CadiaPlayer: A Simulation-Based General Game Player“, IEEE TCIAIG 1(1):4–15, 2009, doi:10.1109/TCIAIG.2009.2018702. https://staff.ru.is/yngvi/pdf/BjornssonF09.pdf *(nur Abstract)* | Reine Simulationssuche (MCTS) ohne spielspezifisches Wissen gewinnt die AAAI-GGP-Wettbewerbe 2007 und 2008. |
| B3 | M. Genesereth, N. Love, B. Pell, „General Game Playing: Overview of the AAAI Competition“, AI Magazine 26(2), 2005. *(nicht nachgeprüft)* | Definition GGP: Agent erhält Regeln erst zur Laufzeit. |
| B4 | P. Cowling, E. Powley, D. Whitehouse, „Information Set Monte Carlo Tree Search“, IEEE TCIAIG 4(2):120–143, 2012, doi:10.1109/TCIAIG.2012.2200894. https://eprints.whiterose.ac.uk/75048/ *(nur Abstract)* | ISMCTS sucht über Informationsmengen statt Zuständen; schlägt Determinisierung bei verdeckter Information (u. a. Kartenspiele). |
| B5 | D. Perez, S. Samothrakis, S. Lucas, P. Rohlfshagen, „Rolling Horizon Evolution versus Tree Search for Navigation in Single-Player Real-Time Games“, GECCO 2013, S. 351–358, doi:10.1145/2463372.2463413. *(Abstract nicht verfügbar; Inhalt laut Folgeliteratur)* | Ursprung von RHEA: Aktionsfolgen über kurzen Horizont evolvieren, mit Vorwärtsmodell bewerten; für Echtzeit. |
| B6 | Pérez-Liébana et al., GVGAI, IEEE Trans. Games 2019 (siehe `spielbeschreibung.md` Q2). | Generische Agenten (MCTS, RHEA u. a.) auf vielen Echtzeit-VGDL-Spielen mit festem Zeitbudget je Tick. Kein Agent dominiert alle Spiele. *(Budgetwert je Tick nicht nachgeprüft)* |
| B7 | Piette et al., Ludii, ECAI 2020 (siehe `spielbeschreibung.md` Q3). | Ein System, generische KI-Spieler für >1000 beschriebene Spiele. |
| B8 | S. Earle et al., ScriptDoctor, 2025; G. Todd et al., GAVEL, 2024 (siehe `spielbeschreibung.md` Q7, Q9). | Suchagenten dienen als automatische Playtester für erzeugte Spiele. |

## Befund

1. **Zugspiele mit vollständiger Information:** UCT/MCTS ist der etablierte generische Ansatz (B1, B2, B7). Er braucht
   genau das, was der Karten-Vertrag liefert: `moves`, `step` (Vorwärtsmodell), `status`. Spielstärke wächst mit dem
   Budget; Heuristiken sind optional.
2. **Verdeckte Information** (Skat, Doppelkopf, Memory, Bluff): Naive Suche über den echten Zustand „schummelt“, weil
   sie verdeckte Karten sieht. ISMCTS (B4) ist der passende Standard. Voraussetzung: `view(state, seat)` bzw. eine
   Funktion „bestimme eine zur Sicht passende Welt“ (Determinisierung aus dem Seed).
3. **Echtzeit:** Pro Tick gibt es wenige Aktionen, aber lange Horizonte. GVGAI zeigt, dass MCTS und RHEA mit
   Vorwärtsmodell generisch spielen, aber je Spiel stark schwanken (B5, B6). Für Casual-Arcade reicht oft eine billigere
   Regel: wenige Aktionsfolgen über kurzen Horizont simulieren, die beste wählen („Rollout-Greedy“). *(Eigene
   Einschätzung, nicht durch eine Quelle belegt; im Spike messen.)*
4. **Bots als Playtester** sind in der Forschung zu Spielgenerierung Standard (B8): „endet“, „gewinnbar“, „nicht
   trivial“ lassen sich als Siegquoten Zufallsbot vs. Suchbot messen.

## Empfehlung

| Spielart | Bot | Budget |
|---|---|---|
| Zug, vollständige Info | UCT mit Zufalls-Rollouts, Rollout-Tiefe begrenzt, optional `heuristic(state, seat)` aus dem Manifest | **Iterationen**, nicht Millisekunden |
| Zug, verdeckte Info | Single-Observer-ISMCTS (B4) | Iterationen |
| simultan-verdeckt (RPS, Schätzen) | Gleichverteilt/Regret-Matching über `moves`; keine Baumsuche nötig | – |
| Echtzeit | Rollout-Greedy über k Aktionsfolgen × h Ticks; RHEA nur, wenn der Spike Bedarf zeigt | Simulationsschritte je Entscheidung |

Gründe für Iterationen statt Zeit: (a) **Determinismus** – gleicher Seed + Budget ⇒ gleicher Zug auf jedem Gerät; damit
bleiben Bot-Partien als Geist wiederholbar und Harness-Ergebnisse reproduzierbar; (b) **Fairness** – die Spielstärke
hängt nicht von der Gerätegeschwindigkeit ab; (c) **Ehrlichkeit** – Stärke = sichtbare Stufe (z. B. 50/400/3000
Iterationen), keine verdeckte Anpassung an den Spieler (Regel „Keine Manipulation“). Rechnen im Web Worker, damit die
Oberfläche flüssig bleibt.

## Ableitung für das Konzept

1. Bestätigt: `moves` → generischer Bot ist durch GGP/MCTS-Literatur gut gedeckt (B1, B2).
2. **Ergänzung des Vertrags:** `step` muss billig kopierbaren Zustand liefern (reine Funktion, `stateBytes`-Grenze);
   optional `heuristic(state, seat)`; für verdeckte Information `observe(state, seat)` + `sample(view, rng)`
   (Determinisierung) oder die Regel, dass der Bot nur `view` sieht. Ohne das ist ein Tisch-Bot (Skat/Doppelkopf)
   nicht ehrlich.
3. **Ergänzung:** `mode: realtime` erhält einen Bot ohne `moves`: die Eingabemenge aus `input` (Baustein) dient als
   Aktionsraum, `step` als Vorwärtsmodell.
4. **Budget in Iterationen** festschreiben; Stufen im UI benennen, Bot nie heimlich anpassen.
5. Derselbe Bot ist der Playtester des Harness: Kennzahlen „endet in ≤ N Zügen“, „Suchbot schlägt Zufallsbot
   signifikant“ (nicht trivial), „jede Seite gewinnt manchmal“ (nicht entschieden). Schwellen im Spike gegen
   menschlich bewertetes Gold kalibrieren.
