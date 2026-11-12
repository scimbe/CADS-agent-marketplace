# Spiel-Baukasten: LLM-erzeugte Spiele aus deklarativen Beschreibungen

Frage: Ein Nutzer gibt einen Satz ein, Claude Haiku erzeugt daraus eine deklarative JSON-Spielbeschreibung (Entitäten,
Formen, Physik, Steuerung, Regeln „wenn X berührt Y → Effekt“, Zeit/Runden, Siegbedingung, Zug/Echtzeit, 1–2 Spieler,
Bot-Heuristik). Ein deterministischer Interpreter spielt sie ab, ein Harness prüft sie vor der Auslieferung (Schema,
Grenzen, Bot-Playtests: gewinnbar, nicht trivial, endet). Bewertet wird gegen ein eingefrorenes Gold-Korpus.
Welche Belege gibt es (vorrangig 2023–2026) für (1) LLM-Spielgenerierung über DSLs, (2) automatische Playtest-Kennzahlen
mit Schwellen, (3) beschränktes Dekodieren, Beispiele im Prompt und Reparaturschleifen, (4) Gold-Korpus vs.
LLM-as-a-Judge?

Ergänzt `spielbeschreibung.md` (Q1–Q15), `generische-bots.md` (B1–B8), `determinismus.md` und
`harness-bewertung.md`; dort genannte Quellen werden nur referenziert, nicht wiederholt.

Stand der Recherche: 2026-11-12. Lesetiefe je Quelle: *(Volltext)*, *(Volltext, Auszug)* = die genannten Abschnitte/
Tabellen gelesen, *(nur Abstract)*, *(Sekundärquelle)* = nur über Suchzusammenfassung/Drittseite, *(nicht nachgeprüft)*.

## Quellen

### A. LLM-Spielgenerierung aus Beschreibungen/DSLs

| # | Quelle | Kern für uns |
|---|---|---|
| S1 | R. Gallotta, G. Todd, M. Zammit, S. Earle, A. Liapis, J. Togelius, G. N. Yannakakis, „Large Language Models and Games: A Survey and Roadmap“, IEEE Trans. Games 2024 (early access). https://arxiv.org/abs/2402.18659 *(nur Abstract)* | Übersicht der Rollen von LLMs in/für Spiele, u. a. als Designer/Inhaltsgenerator. Einordnungsrahmen, keine Zahlen für uns. |
| S2 | M. Farrokhi Maleki, R. Zhao, „Procedural Content Generation in Games: A Survey with Insights on Emerging LLM Integration“, AIIDE 2024, 20(1):167–178, doi:10.1609/aiide.v20i1.31877. https://arxiv.org/abs/2410.15644 *(nur Abstract)* | PCG-Übersicht (suchbasiert, ML, LLM); LLM-Integration als neuer Zweig. |
| S3 | M. U. Nasir, S. James, J. Togelius, „Word2World: Generating Stories and Worlds through Large Language Models“, arXiv:2405.06686 (2024). https://arxiv.org/abs/2405.06686 *(Volltext, Auszug: Tab. 1, Ablation, Bewertung)* | Geschichte → spielbare 2D-Level, ohne Feinjustierung, gestuft. Spielbarkeit per A*-Agent (max. 1000 Iterationen). Spielbar in je 10 Läufen: GPT-4-Turbo 9, Claude 3 Opus 8, GPT-4 8, Claude 3 Sonnet 7, GPT-3.5 7, **Claude 3 Haiku 5**. Rückmeldung der Bewertung über mehrere Runden; **nur eine Runde statt drei: 6/10 statt 9/10.** n = 10, also grobe Werte. |
| S4 | G. Todd, S. Earle, M. U. Nasir, M. C. Green, J. Togelius, „Level Generation Through Large Language Models“, FDG 2023. https://arxiv.org/abs/2302.05817 *(nur Abstract)* | Sokoban-Level per LLM; Qualität wächst stark mit Datenmenge (Feinjustierung). Bewertung: Spielbarkeit, Neuheit, Vielfalt. |
| S5 | S. Sudhakaran, M. González-Duque, C. Glanois, M. Freiberger, E. Najarro, S. Risi, „MarioGPT: Open-Ended Text2Level Generation through Large Language Models“, NeurIPS 2023. https://arxiv.org/abs/2302.05981 *(nur Abstract)* | Feinjustiertes GPT-2 für Mario-Level, per Text steuerbar. Nur am Rande: Level, keine Regeln. |
| S6 | S. Earle, A. Khalifa, M. U. Nasir, Z. Jiang, G. Todd, A. Banburski-Fahey, J. Togelius, „ScriptDoctor …“, IEEE CoG 2025 (short), arXiv:2506.06524 (= `spielbeschreibung.md` Q9). https://arxiv.org/html/2506.06524 *(Volltext, Auszug: Methode, Tab. I–III; Textextraktion bei einzelnen Ziffern unsicher)* | Vertiefung zu Q9: **bis zu 10 Versuche**, Rückmeldung = Compilerfehler + Grammatikfehler + Löser-Ergebnis. Löser: **Breitensuche bis 1 Mio. Knoten**. Erfolg = kompiliert **und jedes Level hat eine Lösung mit > 10 Zügen**. GPT-4o ohne Beispiele 30 % kompilierbar, 0 % lösbar; **mit Beispielen 70–80 % kompilierbar**. „Alle Level nicht trivial lösbar“ bleibt auch bei o1/o3-mini bei **7–20 %**, „irgendein Level lösbar“ 40–80 %. |
| S7 | G. Todd et al., GAVEL, NeurIPS 2024 (= `spielbeschreibung.md` Q7). https://arxiv.org/html/2407.09388 *(Volltext, Auszug: Fitness-Definition)* | Vertiefung zu Q7, **konkrete Prüfkaskade**: −3 nicht kompilierbar; −2 nicht spielbar (keine Züge/Steine); −1 wenn Zufallsspiel (100 Partien) Seitenungleichgewicht > 0,5 oder < 50 % der Zustände mehr als einen legalen Zug haben; sonst 10 Partien MCTS vs. MCTS (0,25 s/Zug, **max. 50 Züge je Spieler**, sonst Remis): Balance, Entschiedenheit, Abschluss, Handlungsfreiheit (Agency), Abdeckung, strategische Tiefe (= Siegquote MCTS gegen Zufall). **Harmonisches Mittel** (jeder Wert ≥ 0,01) bestraft Ausreißer nach unten; „lohnend“ ab Fitness > 0,5. Prosa und Pseudocode widersprechen sich bei der Balance-Richtung. |
| S8 | T. Tanaka, E. Simo-Serra, „Grammar and Gameplay-aligned RL for Game Description Generation with LLMs“, IEEE CoG 2025. https://arxiv.org/abs/2503.15783 *(nur Abstract)* | Nachfolger von Q6: SFT + RL mit Grammatik- und Konzept-Belohnung für Ludii-Beschreibungen; schlägt reines SFT. Feinjustierung nötig → für uns nicht direkt übertragbar. |
| S9 | A. G. Padula, D. J. N. J. Soemers, „Exploring RL-based LLM Training for Formal Language Tasks with Programmed Rewards“, BNAIC 2024. https://arxiv.org/abs/2410.17126 *(nur Abstract; Metrikdetails Sekundärquelle)* | Reines RL mit programmierten Belohnungen (u. a. Spielsynthese) ist schwer und instabil. Laut Sekundärquelle: Abschluss = Anteil Partien, die in 500 Zügen enden. |
| S10 | S. Earle, G. Todd, Y. Li, A. Khalifa, J. Togelius u. a., „PuzzleJAX: A Benchmark for Reasoning and Learning“, arXiv:2508.16821 (2025). https://arxiv.org/abs/2508.16821 *(Sekundärquelle)* | PuzzleScript nach JAX kompiliert, kompatibel mit vorhandenen Beschreibungen; Baumsuche löst viele Spiele leicht, LLM- und RL-Spieler kaum. → Suchbot, nicht LLM, als Playtester. |
| S11 | H. Wu, Y. Wang, X. Liu, H. Zhao, M. Zhang, „Instruction-Driven Game Engines on Large Language Models“, arXiv:2404.00276 (2024). https://arxiv.org/abs/2404.00276 *(nur Abstract + Sekundärquelle)* | Gegenentwurf: das LLM *ist* die Engine (nächsten Zustand vorhersagen), Prototyp Poker. Nicht deterministisch prüfbar → für uns ungeeignet. |
| S12 | D. Chen et al., „GameGPT: Multi-agent Collaborative Framework for Game Development“, arXiv:2310.08067 (2023, v2 2025). https://arxiv.org/abs/2310.08067 *(nur Abstract + Sekundärquelle)* | Mehragenten-Codeerzeugung (Planer, Engine-Entwickler, Tester); Halluzination und Redundanz als Hauptprobleme. Kein deklaratives Format. |
| S13 | D. Valevski, Y. Leviathan, M. Arar, S. Fruchter, „Diffusion Models Are Real-Time Game Engines“ (GameNGen), ICLR 2025, https://arxiv.org/abs/2408.14837; J. Li et al., „Unbounded: A Generative Infinite Game of Character Life Simulation“, arXiv:2410.18975 (2024); J. Yu et al., „GameFactory: Creating New Games with Generative Interactive Videos“, ICCV 2025, https://arxiv.org/abs/2501.08325 *(alle nur Abstract/Sekundärquelle)* | „Generative Engines“: neuronale Netze erzeugen Bild/Verhalten direkt. Kein expliziter Zustand, kein Determinismus, kein Bot-Playtest → nur als Abgrenzung relevant. |
| S14 | T. Luo et al. (25 Autoren), „GameCraft-Bench: Can Agents Build Playable Games End-to-End in a Real Game Engine?“, arXiv:2606.17861 (2026). https://arxiv.org/abs/2606.17861 *(nur Abstract)* | 140 Godot-Aufgaben, 15 Spielfamilien; Prüfung über abgespielte Demonstrationen + Rubrik-Judge. Bester Coding-Agent 41,46 %. Mechaniken gelingen, vollständige Spiele selten. |
| S15 | Y. Huang et al., „GUI Agents for Continual Game Generation“ (PlaytestArena/Play2Code), arXiv:2605.28258 (2026). https://arxiv.org/abs/2605.28258 *(nur Abstract)* | Generator + rubrikblinder GUI-Playtester in Schleife: 66,8 % Rubrik-Quote, +37,1 Punkte gegenüber einem Durchgang; **Werte steigen monoton über Verfeinerungsrunden**. Endbewertung durch LLM-Judge (kein menschliches Gold). |

### B. Automatisches Playtesting und Qualitätsmaße

| # | Quelle | Kern für uns |
|---|---|---|
| S16 | C. Browne, F. Maire, „Evolutionary Game Design“, IEEE TCIAIG 2(1):1–16, 2010, doi:10.1109/TCIAIG.2010.2041928. *(nur Abstract; Kriterienzahlen Sekundärquelle)* | Ludi: Spielqualität per Selbstspiel messen und für evolutionäre Suche nutzen; erzeugte Spiele veröffentlicht (Yavalath). Laut Sekundärquelle 57 ästhetische Kriterien, davon 16 (oder 17) mit Spielerpräferenz korreliert *(nicht nachgeprüft)*. |
| S17 | C. Browne, „Measuring Games: Typicality, Novelty and Quality“, Vortrag, 2nd DLP Workshop, Maastricht, 11.04.2022. https://ludii.games/TalksWorkshop/Metrics.pdf *(Volltext, Folien)* | **Typikalität = fair, entschieden (mehr Siege als Remis), gute Länge**; mit Zufallspartien billig, filtert grob kaputte Regeln, sagt aber wenig über Qualität. **Strategie-Leiter:** UCT mit m·b gegen 2m·b Iterationen (b = Verzweigungsgrad), Verdopplungsreihe; Siegquote des Stärkeren über die Reihe = Potenzial für Strategie; reine Zufallsspiele zeigen kein Signal. 100 Partien je Paarung oder 95 %-Konfidenz, ca. 20 s je Spiel. |
| S18 | M. J. Nelson, „Game Metrics Without Players: Strategies for Understanding Game Artifacts“, AIIDE-Workshop AI in the Game Design Process 2011 (AAAI WS-11-19). https://www.kmjn.org/publications/Metrics_IDP11.pdf *(nur Abstract)* | Das Spiel selbst ist Metrikquelle; sieben Strategien, Information ohne Spieler zu gewinnen, als Ergänzung zu echten Playtests. |
| S19 | J. Togelius, G. N. Yannakakis, K. O. Stanley, C. Browne, „Search-Based Procedural Content Generation: A Taxonomy and Survey“, IEEE TCIAIG 3(3):172–186, 2011, doi:10.1109/TCIAIG.2011.2148116. *(nur Abstract)* | Taxonomie: was erzeugt wird, Repräsentation, **wie Qualität bewertet wird** (direkt, simulationsbasiert, interaktiv). Unser Harness = simulationsbasierte Bewertung. |
| S20 | A. Isaksen, D. Gopstein, J. Togelius, A. Nealen, „Exploring Game Space of Minimal Action Games via Parameter Tuning and Survival Analysis“, IEEE TCIAIG/Trans. Games 10(2):182–194, 2018, doi:10.1109/TCIAIG.2017.2750181. *(nur Abstract)* — Vorläufer: A. Isaksen, D. Gopstein, A. Nealen, „Exploring Game Space Using Survival Analysis“, FDG 2015 *(nicht gelesen)*; A. Isaksen, A. Nealen, „Comparing Player Skill, Game Variants, and Learning Rates Using Survival Analysis“, AIIDE 2015 *(Sekundärquelle)* | Parametrisiertes Flappy Bird: Schwierigkeit per automatischem Playtest, Monte-Carlo, **Spielermodell aus motorischer Präzision und Aktionen pro Sekunde**, Überlebensanalyse der Punkteverteilung (Hazard-Raten, Schwierigkeitskurve); abgeglichen mit über 106 Mio. echten Sitzungen. Punkte = „Lebensdauer“. Direkt übertragbar auf Echtzeit-Arcade-Karten. |
| S21 | T. S. Nielsen, G. A. B. Barros, J. Togelius, M. J. Nelson, „General Video Game Evaluation Using Relative Algorithm Performance Profiles“, EvoApplications 2015, LNCS 9028, doi:10.1007/978-3-319-16549-3_30. https://www.kmjn.org/publications/GVGprofiles_Evostar15.pdf *(Volltext)* | **RAPP:** gute Spiele trennen gute und schlechte Spieler stärker. 7 Agenten (Explorer, MCTS, GA, OneStep-Score/-Heuristik, Random, DoNothing), max. 800 Ticks, 50 ms/Tick. 18 handgemachte Spiele: Siegquote Explorer 0,447, MCTS 0,249, **Random 0,056, DoNothing 0,056**. Bei Zufallsspielen liegen die Agenten eng beieinander und Random/DoNothing schneiden relativ gut ab. **DoNothing gewinnt in handgemachten Spielen fast nie → billiger Zusatzindikator.** Ausfall: 54 von 200 Mutanten und 335 von 400 Zufallsspielen wegen „nie Punkte“ oder zu langsam aussortiert. Autoren nennen es selbst vorläufig. |
| S22 | K. Kunanusont, R. D. Gaina, J. Liu, D. Perez-Liebana, S. M. Lucas, „The N-Tuple Bandit Evolutionary Algorithm for Automatic Game Improvement“, arXiv:1705.01080 (2017; IEEE CEC 2017 *nicht nachgeprüft*). https://arxiv.org/abs/1705.01080 *(Volltext, Auszug: Abstract, Einleitung, Agenten)* | Spielparameter so tunen, dass drei Agenten verschiedener Stärke (One-Step-Lookahead, Rotate-and-Shoot, MCTS) klar getrennt werden („Skill-Depth“); Bandit-Modell wegen verrauschter, teurer Agenten-Bewertungen. |
| S23 | F. Lantz, A. Isaksen, A. Jaffe, A. Nealen, J. Togelius, „Depth in Strategic Games“, AAAI-Workshop „What's Next for AI in Games?“ 2017 (WS-17-15). *(Sekundärquelle; Seitenzahlen widersprüchlich)* | Tiefe als messbare Eigenschaft: wie lange ein Spiel Lernfortschritt trägt (Strategie-Leiter). Grundlage für S17. |

### C. Strukturierte Ausgabe, Beispiele im Prompt, Reparaturschleifen

| # | Quelle | Kern für uns |
|---|---|---|
| S24 | Anthropic, „Structured outputs“, Claude-Doku, abgerufen 2026-11-12. https://platform.claude.com/docs/en/build-with-claude/structured-outputs *(Volltext bis Zeichen 100 000)* | Klärt den offenen Punkt aus Q12: **`claude-haiku-5-5` ist gelistet.** Grenzen des Schemas: **keine rekursiven Schemata**, kein `minimum`/`maximum`/`multipleOf`, kein `minLength`/`maxLength`, `minItems` nur 0/1 (also kein `maxItems`), `additionalProperties` nur `false`. Je Anfrage max. 20 Strict-Tools, **24 optionale Parameter, 16 Parameter mit Union-Typ** (`anyOf`/Typ-Arrays); weitere, nicht offengelegte Grenzen der Grammatikgröße. |
| S25 | Z. R. Tam, C.-K. Wu, Y.-L. Tsai, C.-Y. Lin, H.-y. Lee, Y.-N. Chen, „Let Me Speak Freely? A Study on the Impact of Format Restrictions on Performance of Large Language Models“, arXiv:2408.02442 (2024). *(nur Abstract + Sekundärquelle)* | Formatzwang senkt Schlussfolgerungsleistung, je strenger desto mehr; erst frei antworten, dann umformatieren erhält die Leistung weitgehend. (Konkrete GSM8K-Zahlen nur aus Sekundärquelle, daher nicht übernommen.) |
| S26 | M. Schall, G. de Melo, „The Hidden Cost of Structure: How Constrained Decoding Affects Language Model Performance“, RANLP 2025, S. 1074–1084. https://aclanthology.org/2025.ranlp-1.124 *(nur Abstract)* | 11 Modelle: Instruktions-Modelle verlieren unter Beschränkung bei Generierungsaufgaben, Basismodelle gewinnen. **Beschränkte Generierung braucht angepasste Prompts und genug Beispiele; sie profitiert stärker von zusätzlichen Beispielen als unbeschränkte.** |
| S27 | A. Chavan, „Constrained Decoding Eliminates Structural Failures in Small LLMs but Reveals a Scale-Dependent Semantic Gap“, arXiv:2609.23742 (2026). *(nur Abstract)* | 5 offene Modelle 0,6–4 B, 14 Aufgaben: Schema-Gültigkeit 78,6–92,9 % → 100 %; **inhaltliche Fehler bleiben, Lücke hängt von der Modellgröße ab.** |
| S28 | J. Ray, „The Constraint Tax: Measuring Validity-Correctness Tradeoffs in Structured Outputs for Small Language Models“, arXiv:2605.26128 (2026). *(nur Abstract)* | 0,5–1,7 B-Modelle: Schema-Gültigkeit 61,5 % → 100 %, Antwortgenauigkeit 19,7 % → 11,0 %; „gültig, aber falsch“ steigt von 49,5 % auf 88,9 %. Empfehlung: erst frei denken, spät beschränken; **Schema-Gültigkeit, Genauigkeit und „gültig-aber-falsch“-Quote getrennt berichten.** |
| S29 | K. Park, J. Wang, T. Berg-Kirkpatrick, N. Polikarpova, L. D'Antoni, „Grammar-Aligned Decoding“, NeurIPS 2024, doi:10.52202/079017-0774. https://arxiv.org/abs/2405.21047 *(nur Abstract)* | Grammatik-beschränktes Dekodieren verzerrt die Modellverteilung (grammatisch, aber unwahrscheinliche Ausgaben); Gegenmittel ASAp. Erklärt mechanisch S26–S28. |
| S30 | S. Geng et al., „JSONSchemaBench: A Rigorous Benchmark of Structured Outputs for Language Models“ (v1: „Generating Structured Outputs from Language Models: Benchmark and Studies“), arXiv:2501.10868 (2025). *(nur Abstract + Sekundärquelle)* | ~10 000 reale Schemata; Frameworks unterscheiden sich etwa um Faktor 2 in der Schema-Abdeckung. → Schema-Komplexität ist ein eigenes Risiko. |
| S31 | A. Madaan et al., „Self-Refine: Iterative Refinement with Self-Feedback“, arXiv:2303.17651 (2023; NeurIPS 2023 *Venue nicht nachgeprüft*). *(nur Abstract)* | Selbst-Rückmeldung und Überarbeitung; im Mittel etwa 20 Prozentpunkte besser über 7 Aufgaben. |
| S32 | N. Shinn, F. Cassano, E. Berman, A. Gopinath, K. Narasimhan, S. Yao, „Reflexion: Language Agents with Verbal Reinforcement Learning“, arXiv:2303.11366 (2023; *Venue nicht nachgeprüft*). *(nur Abstract)* | Verbale Reflexion über Umgebungsrückmeldung (u. a. Testergebnisse); HumanEval pass@1 91 %. |
| S33 | X. Chen, M. Lin, N. Schärli, D. Zhou, „Teaching Large Language Models to Self-Debug“, ICLR 2024. https://arxiv.org/abs/2304.05128 *(nur Abstract)* | Ausführen + Erklären als Rückmeldung, nur per Few-Shot; bis zu +12 % wo Unit-Tests verfügbar sind, 2–3 % ohne. |
| S34 | T. X. Olausson, J. P. Inala, C. Wang, J. Gao, A. Solar-Lezama, „Is Self-Repair a Silver Bullet for Code Generation?“, ICLR 2024. https://arxiv.org/abs/2306.09896 *(nur Abstract)* | **Rechnet man die Kosten der Reparatur ein, sind Gewinne oft klein oder fehlen.** Engpass ist die Qualität der Rückmeldung; bessere Rückmeldung → deutlich größere Gewinne. |
| S35 | J. Huang et al., „Large Language Models Cannot Self-Correct Reasoning Yet“, ICLR 2024. https://arxiv.org/abs/2310.01798 *(nur Abstract + Sekundärquelle)* | Ohne externe Rückmeldung (intrinsisch) gelingt Selbstkorrektur kaum, teils wird es schlechter. |
| S36 | R. Kamoi, Y. Zhang, N. Zhang, J. Han, R. Zhang, „When Can LLMs Actually Correct Their Own Mistakes? A Critical Survey of Self-Correction of LLMs“, TACL 12:1417–1440, 2024, doi:10.1162/tacl_a_00713. https://arxiv.org/abs/2406.01297 *(nur Abstract)* | **Selbstkorrektur wirkt dort, wo zuverlässige externe Rückmeldung existiert**; mit rein gepromptem LLM-Feedback bei allgemeinen Aufgaben nicht belegt; viele Studien überschätzen sie. |
| S37 | X. Wang et al., „Compilable Neural Code Generation with Compiler Feedback“, Findings of ACL 2022. https://arxiv.org/abs/2203.05132 *(nur Abstract)* | Compiler-Rückmeldung (per Training) hebt Kompilierquote z. B. von 44 % auf 89 %. Älter, aber Grundbeleg für Compiler-in-the-loop. |

### D. Bewertung: Gold-Korpus vs. LLM-as-a-Judge

| # | Quelle | Kern für uns |
|---|---|---|
| S38 | A. S. Thakur, K. Choudhary et al., „Judging the Judges: Evaluating Alignment and Vulnerabilities in LLMs-as-Judges“, arXiv:2406.12624 (2024). *(nur Abstract + Sekundärquelle)* | Selbst auf einfacher Aufgabe (TriviaQA) liegen beste Judges klar unter menschlicher Übereinstimmung; **Cohen-κ trennt Judges besser als prozentuale Übereinstimmung**; Judges eher nachsichtig und durch Floskeln täuschbar. Konkrete κ-Werte nur aus Sekundärquelle, daher nicht übernommen. |
| S39 | A. Bavaresco et al., „LLMs instead of Human Judges? A Large Scale Empirical Study across 20 NLP Evaluation Tasks“, ACL 2025 (Short), S. 238–255. https://arxiv.org/abs/2406.18403 *(nur Abstract + Sekundärquelle)* | 11 LLMs auf 20 annotierten Datensätzen: Übereinstimmung mit Menschen schwankt stark je Aufgabe und Eigenschaft → **Judge je Aufgabe gegen Menschen validieren.** |
| S40 | S. Shankar, J. D. Zamfirescu-Pereira, B. Hartmann, A. G. Parameswaran, I. Arawjo, „Who Validates the Validators? Aligning LLM-Assisted Evaluation of LLM Outputs with Human Preferences“, UIST 2024, doi:10.1145/3654777.3676450. *(nur Abstract)* | „Criteria drift“: Bewertungskriterien entstehen erst beim Bewerten → Rubrik iterativ festlegen, dann einfrieren. |
| S41 | P. Wang et al., „Large Language Models are not Fair Evaluators“, arXiv:2305.17926 (2023). *(nur Abstract)* | Positionsbias; Kalibrierung durch mehrere Begründungen, Mittelung über vertauschte Reihenfolge, Mensch bei schwierigen Fällen. |
| S42 | M. L. McHugh, „Interrater reliability: the kappa statistic“, Biochemia Medica 22(3):276–282, 2012, doi:10.11613/BM.2012.031. https://pmc.ncbi.nlm.nih.gov/articles/PMC3900052 *(nur Abstract + Sekundärquelle)* | κ korrigiert Zufallsübereinstimmung, hat aber Grenzen; Cohens Einstufung (0,41 schon „moderat“) gilt als zu nachsichtig; κ zusammen mit prozentualer Übereinstimmung berichten. |
| S43 | L. Gao, J. Schulman, J. Hilton, „Scaling Laws for Reward Model Overoptimization“, ICML 2023, PMLR 202:10835–10866. https://arxiv.org/abs/2210.10760 *(nur Abstract + Sekundärquelle)* | Optimiert man gegen einen Proxy (gelerntes Bewertungsmodell), steigt der Gold-Wert erst und fällt dann (Goodhart, empirisch vermessen). → Harness-Kennzahlen und Judge sind Proxies; Gold-Testteil darf nie Optimierungsziel werden. |

Zu Determinismus/Lockstep: keine neue Quelle, die über `determinismus.md` hinausgeht. Ludax (Q8) und PuzzleJAX (S10)
zeigen nur, dass kompilierte, deterministische Engines viele Playtests billig machen.

## Befund

1. **Zwei Lager, nur eines passt.** (a) LLM schreibt eine Beschreibung in einer DSL, eine Engine führt sie aus,
   Agenten prüfen sie (S3, S6, S7, S8, Q5). (b) Das Modell *ist* die Engine (S11, S13). Lager (b) liefert weder
   expliziten Zustand noch Determinismus noch Bot-Playtests. Unser Konzept liegt eindeutig in (a). Sicherheit: hoch.

2. **Ausführbare Rückmeldung über mehrere Runden wirkt, intrinsische Selbstkritik nicht.** Word2World: 1 statt 3 Runden
   senkt die Spielbarkeit von 9/10 auf 6/10 (S3; n = 10). Play2Code: +37,1 Punkte gegenüber einem Durchgang und
   monoton steigend über Runden (S15). ScriptDoctor nutzt bis zu 10 Versuche mit Compiler- und Löser-Rückmeldung (S6).
   Übersicht: Selbstkorrektur gelingt mit zuverlässiger externer Rückmeldung (S36), ohne sie kaum (S35). Gegenbefund:
   Kosten eingerechnet sind Reparaturgewinne oft klein; Engpass ist die Qualität der Rückmeldung (S34). Sicherheit:
   mittel. Keine Quelle misst Reparaturrunden für Haiku auf einer JSON-Spiel-DSL.

3. **Kleine Modelle fallen zurück, und Strict-Schema schließt nur die Formlücke.** Claude 3 Haiku war in Word2World
   das schwächste getestete Modell (5/10 vs. 9/10, S3). Beschränktes Dekodieren bringt 100 % Schema-Gültigkeit, aber die
   inhaltliche Lücke bleibt und hängt von der Modellgröße ab (S27). Bei sehr kleinen Modellen kann die Genauigkeit
   sogar sinken; „gültig, aber falsch“ wird dann zum Normalfall (S28). Ursache: Die Beschränkung verzerrt die
   Verteilung (S29); Instruktions-Modelle leiden bei Generierungsaufgaben (S26). Einschränkung: S26–S28 messen offene
   Modelle bis 4 B Parameter. Ob das für Haiku 5.5 gilt, ist **nicht belegt**. Die Richtung (Form gelöst, Sinn nicht)
   stimmt aber mit Q5 überein (GPT-3.5 10/10 parsebar, 0/10 korrekt).

4. **Beispiele im Prompt sind der größte billige Hebel.** ScriptDoctor: GPT-4o ohne Beispiele 30 % kompilierbar und
   0 % lösbar, mit Beispielen 70–80 % kompilierbar (S6). Unter Schema-Beschränkung bringen zusätzliche Beispiele mehr als
   ohne (S26). Mehr Kontext hilft nicht monoton (S6, Tab. III: 30k besser als 50k/70k bei „alle lösbar“; n = 10).
   Sicherheit: mittel bis hoch für die Richtung, Zahlen modellspezifisch.

5. **Haikus Strict-Modus begrenzt die Form der DSL hart** (S24): keine Rekursion (also keine beliebig tief
   verschachtelten Bedingungsbäume), keine Zahlengrenzen im Schema, kein `maxItems`, höchstens 24 optionale Felder und
   16 Union-Felder je Anfrage, dazu eine nicht offengelegte Grenze der Grammatikgröße. Alle Wertebereiche und
   Mengengrenzen muss also der Harness prüfen, nicht das Schema. Sicherheit: hoch (Herstellerdoku). Die Doku kann sich
   aber ändern; vor jedem Release erneut prüfen.

6. **„Lösbar“ ist leicht, „nicht trivial lösbar“ ist schwer.** ScriptDoctor: „irgendein Level lösbar“ 40–80 %, „alle
   Level mit > 10 Zügen lösbar“ nur 0–20 %, auch bei starken Modellen (S6). Die Hürde des Harness liegt also bei
   Nicht-Trivialität und Tiefe, nicht bei Syntax.

7. **Kennzahlen für Spielqualität: der Leistungsabstand zwischen starkem und schwachem Agenten ist der am besten
   gestützte generische Indikator.** RAPP (S21, Volltext): Bei handgemachten Spielen liegt die Siegquote des besten
   Agenten bei 0,447, Random und DoNothing bei je 0,056; bei Zufallsspielen liegen die Agenten eng zusammen. GAVEL nimmt
   „MCTS schlägt Zufall“ als Teil der Fitness (S7); Browne misst Tiefe als Siegquote bei Budget-Verdopplung (S17);
   NTBEA tunt Parameter auf Trennung dreier Agentenstufen (S22). Dazu kommt Typikalität: fair, entschieden, gute
   Länge (S17, S16). Einschränkung: RAPP nennen die Autoren selbst vorläufig; das Maß ist an Brett- bzw.
   GVGAI-Arcadespielen entwickelt, nicht an Casual-/Party-Spielen.

8. **Für Echtzeit ist ein perfekter Bot der falsche Playtester.** Isaksen et al. modellieren Spieler über motorische
   Präzision und Aktionsrate und lesen Schwierigkeit aus Überlebenskurven (Hazard-Raten) ab (S20). Ein rauschfreier
   Suchbot meldet „gewinnbar“, wo Menschen scheitern. Sicherheit: hoch für das Prinzip, Parameterwerte nur im
   Abstract nicht angegeben.

9. **Alle Schwellen in der Literatur sind Setzungen, keine validierten Grenzwerte.** Beispiele: GAVEL 0,5
   (Zufallsfilter), 50 Züge je Spieler, „lohnend“ > 0,5 (S7); ScriptDoctor Lösung > 10 Züge, 1 Mio. Knoten (S6);
   Padula/Soemers 500 Züge (S9, Sekundärquelle); Word2World A* 1000 Iterationen (S3); RAPP 800 Ticks (S21); Browne 100
   Partien oder 95 %-Konfidenz (S17). Keine Quelle kalibriert Schwellen gegen menschliche Urteile für Casual-Spiele.
   Also: Startwerte übernehmen, gegen eigenes Gold kalibrieren.

10. **Statistische Schärfe wird oft unterschätzt.** GAVEL bewertet die MCTS-Kennzahlen mit n = 10 Partien (S7). Eigene
    Rechnung (Wilson-Intervall, 95 %): Siegquote 0,5 bei n = 10 → etwa [0,24; 0,76]; bei n = 100 → etwa [0,40; 0,60].
    Schwellen nahe 0,3–0,5 lassen sich mit 10 Partien nicht trennen.

11. **LLM-Judges sind aufgabenabhängig und verzerrt.** Die Übereinstimmung schwankt je Aufgabe stark (S39); Positionsbias
    ist nachgewiesen und teilweise kalibrierbar (S41); κ statt Prozent (S38, S42); Kriterien driften beim Bewerten
    (S40); Optimieren gegen einen Proxy schadet ab einem Punkt dem Gold-Wert (S43). Die neuen End-to-End-Benchmarks
    (S14, S15) bewerten mit LLM-Judges ohne menschliches Gold. Ihre Zahlen sind also selbst Proxy-Werte.

12. **Lücke:** Keine Quelle untersucht genau die Kombination aus kleinem Modell, JSON-DSL für Echtzeit *und* Zugspiele,
    deterministischem Interpreter und Bot-Gate. Alle Ableitungen unten sind Übertragungen. Sicherheit insgesamt: mittel.
    Nur der eigene Spike entscheidet.

## Ableitung für das Konzept

### 1. Bausteine und Form der DSL

Der Bausatz aus `spielbeschreibung.md` (18 Bausteine) bleibt. Aus S24 und S3/S6 folgen diese Formregeln:

1. **Flach statt rekursiv** (S24): Entitäten, Regeln, Spawner, Endbedingungen sind Listen mit `id`; Verweise laufen über
   `id`-Strings (vom Harness aufgelöst), nicht über Verschachtelung. `rule` = `{on: Ereignis-Enum, a: typId, b: typId |
   "wall" | "edge" | null, if: [≤ 3 flache Bedingungen, UND-verknüpft], then: [Effekt-Enum + Parameter]}`. Tiefere
   Logik nur über zusätzliche Regeln oder Zustandsvariablen, nicht über Bäume.
2. **Pflichtfelder mit expliziten Standardwerten statt optionaler Felder** (Grenze 24 optional / 16 Union, S24).
   Beispiel: `gravity: 0` statt Feld weglassen.
3. **Zahlen als ganze Zahlen in festen Einheiten** (Festkomma, `determinismus.md`). Wertebereiche, Listenlängen
   (max. Entitätstypen, Regeln, gleichzeitige Objekte) prüft der Harness (Gate G0), da das Schema sie nicht ausdrücken kann.
4. **Bot-Heuristik deklarativ aus Enum-Primitiven** mit ganzzahligen Gewichten (z. B. „Punkte maximieren“, „Abstand zu
   Typ X minimieren“, „Typ Y meiden“, „Leben erhalten“). Der generische Bot (`generische-bots.md`) nutzt sie als
   Bewertungsfunktion; das LLM schreibt keinen Bot-Code.
5. **Zwei Aufrufe statt einem** (S25, S28, eigene Ableitung): (a) kurzer freier oder schwach strukturierter Plan
   (Genre, Spieler, Modus, Kernmechanik, Siegbedingung, Bausteine), (b) strikte JSON-Beschreibung mit Plan im Kontext.
   Ob das bei Haiku 5.5 hilft, ist **nicht belegt**. Im Spike A/B gegen direkten Strict-Aufruf messen.
6. **2–3 vollständige Beispielspiele** (je eins Echtzeit-Arcade, Zug-Brett, Party) im gecachten Kontext (S6, S26, Q5).
   Mehr Kontext nicht automatisch besser (S6, Tab. III), daher Beispielzahl im Spike variieren (1 / 3 / 5).

### 2. Playtest-Kennzahlen mit Schwellen-Vorschlägen

Agenten: **R** = Zufall, **N** = Nichtstun/Standardeingabe, **S** = generischer Suchbot (UCT bzw. Rollout-Greedy,
Budget in Iterationen), **S½** = Suchbot mit halbem Budget, **M** = Echtzeit-Bot mit menschlichem Rauschen
(Reaktionsverzögerung, Zielstreuung, max. Aktionen/s; nach S20). Alle Läufe mit festen Seeds, damit reproduzierbar.

| Gate | Kennzahl | Schwelle (Start) | Herkunft / Begründung |
|---|---|---|---|
| G0 hart | Schema gültig + Grenzen (Wertebereiche, Listenlängen, Budget je Tick) | 100 % | S24 (Schema kann Grenzen nicht ausdrücken); `schema-grenzen.md` |
| G1 hart | Determinismus: gleicher Seed + Eingabefolge → gleicher Zustands-Hash, zwei Läufe | 100 % | `determinismus.md` |
| G2 hart | Spielbar: ≥ 1 legale/wirksame Aktion am Start; kein Absturz in allen Partien | 100 % | GAVEL −2-Stufe (S7) |
| G3 hart | **Endet:** Anteil Partien (R und S), die vor der Obergrenze enden | ≥ 95 % | GAVEL „Completion“ (S7), Browne „gute Länge“ (S17); Obergrenze Zug: 50 Züge je Spieler (S7); Echtzeit: 2 × Zieldauer *(eigene Setzung)* |
| G4 hart | **Gewinnbar:** S gewinnt (1 Spieler) bzw. jede Seite gewinnt in S-gegen-S mindestens einmal (2 Spieler) | S-Siegquote ≥ 0,3; Echtzeit zusätzlich M ≥ 0,1 | ScriptDoctor-Lösbarkeit (S6); M nach S20. Zahlenwerte *eigene Setzung* |
| G5 hart | **Nicht trivial (N):** Siegquote von N | ≤ 0,05 | RAPP: N = 0,056 bei handgemachten Spielen (S21) |
| G6 hart | **Nicht trivial (Abstand):** Siegquote(S) − Siegquote(R) bzw. mittlerer Punkteabstand normiert | ≥ 0,25 | RAPP-Abstand handgemachter Spiele ≈ 0,39 (Explorer 0,447 − Random 0,056, S21); Schwelle bewusst darunter, weil unsere Bots schwächer sein können *(Unsicherheit hoch)* |
| G7 weich | **Tiefe:** Siegquote S gegen S½ (Zugspiele) | > 0,55 | Browne-Strategie-Leiter (S17), GAVEL „strategic depth“ (S7) |
| G8 weich | **Handlungsfreiheit:** Anteil Entscheidungspunkte mit > 1 sinnvoller Aktion | ≥ 0,5 | GAVEL-Zufallsfilter (S7) |
| G9 weich | **Balance (2 Spieler):** Siegquotendifferenz Sitz 1 vs. Sitz 2 bei S-gegen-S | verwerfen > 0,5; warnen > 0,2 | 0,5 aus GAVEL (S7); 0,2 *eigene Setzung* |
| G10 weich | **Entschiedenheit:** Anteil Remis | ≤ 0,2 | Browne „decisive“ (S17); Zahl *eigene Setzung* |
| G11 weich | **Dauer:** Median-Partiedauer (S bzw. M) im Zielband der Karte (Casual z. B. 30 s – 3 min) | im Band | Browne „gute Länge“ (S17); Band *Produktsetzung* |
| G12 weich (Echtzeit) | **Schwierigkeitskurve:** Überlebenskurve von M; Hazard in den ersten 5 s < 0,5 und Median-Überleben im Zielband | im Band | Überlebensanalyse nach S20; Zahlen *eigene Setzung* |

Regeln dazu:
- **Stichprobe sequenziell:** R mit 100 Partien (billig, wie S7); S so lange, bis das 95 %-Intervall die Schwelle nicht
  mehr überdeckt, maximal 100 Partien (wie S17). Mit festen 10 Partien sind Schwellen um 0,3–0,5 nicht trennbar
  (Befund 10).
- **Harte Gates G0–G6 sind Ja/Nein.** Weiche Gates G7–G12 bilden zusammen einen Rangwert (harmonisches Mittel wie
  GAVEL, S7). Damit wird unter mehreren gültigen Kandidaten ausgewählt; ein Kandidat wird nicht wegen eines einzelnen
  weichen Werts verworfen.
- **Alle Zahlen sind Startwerte.** Kalibrierung: Für jede Kennzahl im Spike prüfen, wie gut sie das menschliche Urteil
  „spielt sich wie gemeint“ vorhersagt (z. B. ROC über das Gold-Dev-Set), und dann die Schwelle festlegen (Befund 9).

### 3. Reparaturrunden: ja, begrenzt, nur mit Harness-Rückmeldung

- **Ja**, weil externe, zuverlässige Rückmeldung genau unser Fall ist (S36) und Mehrrunden-Rückmeldung in S3, S6 und S15
  deutlich hilft.
- **Rückmeldung nur aus dem Harness, nicht aus Selbstkritik** (S35): welches Gate, welcher Messwert gegen welche
  Schwelle, betroffene `id`s, kurze Spur (z. B. „N gewinnt 0,40: Endbedingung `time` feuert vor jeder Gefahr“).
  Ausführliche Diagnose erhöht die Wirkung (S34).
- **Höchstens 2 Reparaturrunden (3 Versuche)**, danach von vorn neu ziehen oder zur nächsten passenden Vorlage
  zurückfallen und das dem Nutzer offen sagen (keine stillen Rückfälle). Begründung: S34 zeigt, dass Reparatur
  gegenüber Neuziehen bei gleichen Kosten oft kaum gewinnt. Die Zahl 2 ist *eigene Setzung*. ScriptDoctor erlaubt 10
  (S6), Word2World nutzt 3 Runden (S3).
- **Im Spike messen:** Erfolg bei gleichem Token-Budget für „1 Entwurf + 2 Reparaturen“ gegen „3 unabhängige Entwürfe,
  bester nach Harness“ (pass@Kosten statt pass@1).

### 4. Gold-Korpus-Methodik

1. **Eingefroren und versioniert:** Inhalt per Hash festhalten; Änderungen nur als neue Version mit Begründung.
2. **Zwei Teile:** *Dev* (Prompt, Beispiele und Schwellen daran tunen) und *Test* (gesperrt, nur zur Release-Entscheidung).
   Der Testteil ist nie Optimierungsziel (Goodhart, S43).
3. **Schichtung:** Absichtssätze gleichmäßig über Echtzeit/Zug, 1/2 Spieler, Arcade/Brett/Party/Rätsel; dazu absichtlich
   mehrdeutige Sätze und Sätze außerhalb des Bausatzes (erwartete Antwort „gibt es noch nicht“).
4. **Erwartung als prüfbare Eigenschaften, nicht als eine Referenz-JSON** (viele gültige Lösungen): Modus, Spielerzahl,
   Typ der Siegbedingung, Pflicht-Mechaniken (Menge von Baustein-/Regeltypen), verbotene Mechaniken. Automatisch messbar
   als exakte Übereinstimmung bzw. F1 über Mengen.
5. **Menschliches Urteil:** zwei Bewerter je Eintrag, binär „spielt sich wie gemeint“ plus 2–3 Teilfragen (erkennbar
   gleiche Idee / fair / macht Sinn). Rubrik an 20 Dev-Einträgen iterieren, dann einfrieren (criteria drift, S40).
   Cohen-κ **und** prozentuale Übereinstimmung berichten (S38, S42); Zielwert κ ≥ 0,6 *(eigene Setzung, strenger als
   Cohens 0,41-Grenze, die McHugh für zu nachsichtig hält, S42)*. Darunter die Rubrik schärfen, nicht weitermessen.
6. **Judge nur sekundär:** fremde Modellfamilie, Reihenfolge vertauschen und mitteln (S41), je Spieltyp gegen das
   menschliche Dev-Urteil per κ validieren (S39). Unter dem Zielwert entscheidet der Judge nichts.
7. **Getrennt berichten** (nach S28): schema-gültig, Harness bestanden (je Gate), Eigenschafts-Übereinstimmung,
   Mensch „wie gemeint“, **„gültig, aber falsch“-Quote** (Harness bestanden, Mensch nein). Die letzte Zahl misst, wie gut
   der Harness als Proxy taugt.
8. **Größe:** 30 Einträge reichen für einen Spike, aber nicht für Release-Vergleiche. Eigene Rechnung: Bei Quote 0,7 und
   n = 30 umfasst das 95 %-Intervall etwa ±0,16. Für Release-Entscheidungen ≥ 100 Test-Einträge und gepaarte Vergleiche
   (McNemar) zwischen Varianten auf denselben Sätzen.

### Offene Punkte / nicht belegt

- Übertragbarkeit von S26–S28 (Modelle ≤ 4 B) auf Haiku 5.5: offen; Spike-Variante „Plan → Strict“ vs. „direkt Strict“.
- Welcher Echtzeit-Bot reicht für G4–G6 (Rollout-Greedy vs. RHEA) und welche Rauschparameter für M (S20 nennt im
  Abstract keine Werte; Volltext von S20 nicht gelesen).
- Ob RAPP-Abstände (S21, GVGAI-Arcade) auf Party- und Casual-Spiele übertragbar sind.
- Browne/Maire-Kriterienliste (S16) nur über Sekundärquelle; Volltext nicht eingesehen.

## Umsetzung in Strang B (Stand 2026-11-12) – was übernommen wurde und was abweicht

Code: `apps/mdi/src/engines/baukasten/` (Sprache, Prüfer, Interpreter, Bots) auf `feat/mdi-w1-b`; Server
`lib/duell-bau.mjs` auf `feat/duell-baukasten` (CADS-DEMO-wrapper), dort byte-gleich vendiert.

| Ableitung | Umsetzung | Abweichung / Grund |
|---|---|---|
| Flach statt rekursiv, Pflichtfelder statt optionaler (S24) | Eine Feldtabelle (`spec.js`) erzeugt das volle Schema (mit Grenzen), das LLM-Schema (alles Pflicht, keine Grenzen/Unions) und den Normalisierer | Bedingungen (`if`) gibt es nicht; Logik nur über mehrere Regeln. Grund: Grammatikgröße (unten) |
| Grammatikgröße (S24, „nicht offengelegte Grenze“) | **Gemessen:** Die API lehnt das ganze Echtzeit-Schema ab („compiled grammar is too large“), auch ohne jede Aufzählung; ohne eines von rules/spawn/world/things kompiliert es. Echtzeit wird deshalb in zwei Aufrufen erzeugt: Szene (VGDL: SpriteSet + Level), dann Erzeuger + Regeln (VGDL: InteractionSet) mit der Szene als Daten | Entspricht zufällig Ableitung 1.5 („zwei Aufrufe“), aber als Szene/Regeln statt Plan/Strict |
| Beispiele im Kontext (S6, S26, Q5) | 10 Beispielspiele in Kurzform im gecachten Präfix; Standardwerte als Block | Anzahl nicht variiert (offen) |
| Reparaturrunden ≤ 2, Rückmeldung nur aus Prüfer/Harness (S34–S36) | Umgesetzt; Rückmeldung = Schemagründe, S1-Kategorie, Playtest-Kennzahl mit Wert und Schwelle **plus Diagnose** (welche Regel kostet ohne Eingabe nach wie vielen Sekunden das erste Leben, fehlender Boden) | „1 + 2 Reparaturen“ vs. „3 unabhängige Entwürfe“ nicht verglichen (offen) |
| G0–G1 (Schema, Grenzen, Determinismus) | `check.js` (Sinn, Verweise, Kontrast WCAG ≥ 3:1, Steuerung je Sitz, Ende vorhanden, Boden für Sprung, Sitz-Erreichbarkeit der Wertung), Laufzeitgrenzen (200 Dinge, 300 s), Hash zweier identischer Läufe | – |
| G3 endet ≥ 95 %, G5 Nichtstun ≤ 0,05, G6 Abstand | Umgesetzt; Abstand **0,2** (Siegquote) *oder* 0,25 (Punkte) | 0,2 statt 0,25: unsere Bots sind schwächer als GVGAI-Agenten; an den 14 Beispielen und 7 Seeds kalibriert |
| G4 gewinnbar | Solo: bester Bot ≥ 0,3; zu zweit: Stark schlägt Schwach | Kein Bot mit menschlichem Rauschen (M) – nur Stufen über Reaktionszeit, Zielfehler, Horizont und (Tippen) Aktionsrate. Offen |
| G9 Balance | Anteil > 0,85 **und** exakter Binomialtest p < 0,05 | Abweichend von „> 0,5 verwerfen“: mit 4–8 entschiedenen Partien meldete die einfache Schwelle in 12,5 % der Fälle Zufall als Schieflage (gemessen am Pong-Beispiel) |
| G7, G8, G10–G12 (weich) | Nur Dauer (Median ≥ 4 s) | Tiefe, Handlungsfreiheit, Überlebenskurve offen |
| Stichprobe sequenziell bis 100 | Fest 8 je Agent (Budget 6 Mio. Schritte, ~0,2–1 s je Spiel im Worker) | Statistische Schärfe begrenzt (Befund 10); offen |
| Gold-Korpus: eingefroren, Dev/Test, Eigenschaften statt Referenz-JSON, κ mit zwei Menschen | 44 Sätze (32 Spiel, 12 Absage), SHA-256 im Test, Dev/Test 22/22, ausführbare Merkmale | Menschliches Urteil „spielt sich wie gemeint“ mit κ fehlt (offen); Größe 44 < 100 für Release-Entscheidungen |

Befunde aus den eigenen Läufen, die die Literatur nicht hatte: (1) der Pong-Aufschlag ging nach jedem Tor zur selben
Seite – der Fairness-Test fand eine echte Schieflage des Interpreters; (2) gleichzeitiges Erreichen des Punkteziels
entschied stets für Sitz 0; (3) ein Pfirsich-Emoji in einem Obst-Memory traf die Wortregeln (S1) und wurde ohne
Reparaturschleife zur harten Absage – jetzt eine Reparaturrunde; (4) ein schneller Ball tunnelte bei Höchsttempo durch
den Schläger – jetzt bewegt sich kein Ding je Tick weiter als seine halbe kleinste Seite.

### Entscheidungen des Users vom 2026-11-12 (Startschwellen)

1. **Echtzeit-Quote 77 % reicht für den Start.**
   - Messung: Auf dem unabhängigen, eingefrorenen Korpus v3 (SHA-256 `6cab89d2…`) bestanden 58 von 75 erwarteten Echtzeitspielen die Bot-Playtests und wurden geliefert. Das sind 77,3 %, 95 %-Wilson-Intervall 66,7–85,3 %. Protokoll: `07-protokoll/2026-11-12-strang-b.md`, Runde 3.
   - Entscheidung: Der User sagt „77 % ok“. Das Ziel von 80 % gilt damit nicht als Startbedingung. Die Playtest-Schwellen selbst bleiben unverändert: endet ≥ 0,95, Nichtstun ≤ 0,05, Abstand 0,2 bzw. 0,25, gewinnbar ≥ 0,3, Dauer ≥ 4 s, Balance > 0,85 bei p < 0,05.
   - Angenommen ist die gemessene Quote, nicht eine abgesenkte Prüfung.
2. **Faktenprüfung der Quizfragen geht vor der menschlichen Kalibrierung in Betrieb.**
   - Entscheidung: Der User sagt „Erst akzeptieren“. `DUELL_BAU_FAKTEN` ohne Wert ist jetzt `aktiv`.
   - Was `aktiv` tut: Markierte Fragen gehen als Reparaturgrund zurück. Bleiben sie markiert, werden sie offen weggelassen. Bleiben weniger als 3 Fragen, gibt es eine ehrliche Absage `bau_fakten`.
   - Liefert der Prüfer keine Antwort, gelten die Fragen als unsicher (fail closed).
   - **Die Kalibrierung steht weiter aus:** 50 Fragen, Bogen `07-protokoll/strang-b/fakten-kalibrierung.csv`, Auswertung mit `bin/duell-bau-fakten-kalib.mjs vergleich`.
   - Bis dahin gilt `FAKTEN_KALIBRIERT = false`. Jedes geprüfte Quiz trägt den Hinweis `bau:fakten-unkalibriert`, den die App anzeigt.
   - Bekannte Lücke aus dem Vorlauf: Der Prüfer übersah mindestens 2 echte Sachfehler (f01, f28) und markierte 16 von 50 Fragen als unsicher. Wie oft er richtige Fragen streicht und wie viele falsche er übersieht, ist ohne die menschliche Bewertung nicht bekannt.
