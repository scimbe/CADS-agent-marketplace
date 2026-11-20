# Automatisierte Usability- und Verständlichkeitsprüfung der Dialoge

Frage: Wie lassen sich Dialoge und Benutzerführung von My Daily Idea, besonders der Klärungsdialog der freien Karte,
automatisch auf Usability und Verständlichkeit prüfen? Wie bleibt die App einfach genug für ein Kind, das kaum liest,
und bietet trotzdem einem Promovenden alle Einstellmöglichkeiten? Stand: 18.11.2026.

Auftrag des Users, wörtlich: „Die Dialoge muessen inharent inkludierend sein, das auch eine 5 jahrige ihr ziel erreicht
(ohne grosse sprachkenntnisse) aber auch der Promovent seine differenzierungmoeglichkeiten findet und da im Grunde
(mittels gamefikation) rangefuehrt wird. Es ist im moment noch zuu komplex“.

Kennzeichnung: **[B]** heißt belegt, die Quelle ist verlinkt. **[E]** heißt Einschätzung oder Ableitung durch uns.
*(nicht nachgeprüft)* bedeutet, dass nur Abstract, Inhaltsverzeichnis oder eine Sekundärquelle gelesen wurde.

## Kurzfassung

- Simulierte Nutzer (LLM-Agenten) eignen sich als **Frühwarnsystem**, aber nicht als Ersatz für echte Tests. Sie lösen
  Aufgaben glatter und häufiger als Menschen und finden weniger Stolperstellen
  ([Zhong et al. 2025, arXiv 2512.03568](https://arxiv.org/abs/2512.03568);
  [Lu et al., UXAgent, arXiv 2504.09407](https://arxiv.org/abs/2504.09407)). **[B]** Daraus folgt: Scheitert ein
  Agent, ist das ein starkes Signal. Kommt er durch, belegt das wenig. **[E]**
- Wenn man einem LLM nur sagt „spiel ein 5-jähriges Kind“, ist das keine valide Prüfung. Bei Theory-of-Mind-Aufgaben
  bilden Modelle Alterskurven teils nach
  ([Milička et al. 2024, PLOS ONE](https://pmc.ncbi.nlm.nih.gov/articles/PMC10936766/)). Soziales Verhalten von
  Kindern bilden sie dagegen nicht ab
  ([„Can LLMs Simulate Child Users' Behaviors?“, NeurIPS 2026](https://neurips.cc/virtual/2026/164521)).
  **[B]** *(nicht nachgeprüft)* Robuster ist es, die **Fähigkeit technisch zu entziehen**: Text im Screenshot wird
  geschwärzt, der Agent bekommt nur Bild, Ton und Vorlesetext. **[E]**
- Deterministische Prüfungen sind billig, reproduzierbar und gehören deshalb als harte Schranken in die CI: Schritte,
  Entscheidungen, Wörter je Bildschirm, Lesbarkeit, zugängliche Namen und Trefferflächen. **[E]**
- Für Kind bis Experte gibt es drei tragfähige Muster: „low floor, high ceiling, wide walls“
  ([Resnick et al. 2009, CACM](https://cacm.acm.org/research/scratch-programming-for-all/) *(nicht nachgeprüft)*),
  Training Wheels ([Carroll & Carrithers 1984](https://cacmb4.acm.org/magazines/1984/8/10472-training-wheels-in-a-user-interface))
  und **vom Nutzer gesteuerte** statt automatisch adaptiver Oberflächen
  ([Findlater & McGrenere 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)). **[B]**
- Gamification wirkt im Mittel klein bis mittel positiv, aber stark kontextabhängig
  ([Sailer & Homner 2020](https://doi.org/10.1007/s10648-019-09498-w);
  [Hamari et al. 2014](https://doi.org/10.1109/HICSS.2014.377)). Belohnungen, die an Leistung geknüpft sind, können die
  intrinsische Motivation senken ([Deci, Koestner & Ryan 1999](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf)).
  **[B]** Für MDI heißt das: Freischalten durch Entdecken, nicht durch Punkte oder Streaks. **[E]**

---

## 1 Automatisierte Methoden und ihre Belege

### 1.1 LLM-Agenten als simulierte Nutzer

| Quelle | Befund | Grenze |
|---|---|---|
| [UXAgent, Lu et al. 2025, arXiv 2504.09407](https://arxiv.org/abs/2504.09407), Vorläufer [2502.12561](https://arxiv.org/abs/2502.12561) | Ein Persona-Generator erzeugt viele Personas, ein Agent mit schneller und langsamer Schleife bedient die echte Webseite. Ergebnis sind Logs, Umfragen und „Interviews“ mit den Agenten. 16 UX-Forschende fanden das nützlich, um **Studiendesigns** zu prüfen. **[B]** | Das Verhalten ist „nicht wie echte Menschen“: glatte Pfade, kaum Umherirren oder Aufgeben. Die Autoren verstehen das System nicht als Ersatz für Teilnehmende. **[B]** |
| [Zhong, McDonald, Hsieh 2025, „Synthetic Cognitive Walkthrough“, arXiv 2512.03568](https://arxiv.org/abs/2512.03568) | Ein multimodaler Cognitive Walkthrough aus Screenshots: Die LLMs navigieren und begründen nachvollziehbar. Durch Ausrichtung auf Fehlerpunkte steigt die Übereinstimmung mit menschlichen Befunden. **[B]** | Die LLMs schließen **mehr** Aufgaben ab als Menschen, wählen optimalere Pfade und finden **weniger** Fehlerpunkte. Der F1-Wert von 0,72 stammt aus einer Sekundärquelle. **[B]** *(nicht nachgeprüft)* |
| [uxCUA, arXiv 2604.26020](https://www.alphaxiv.org/abs/2604.26020.md) | Ein eigens trainierter Computer-Use-Agent sagt Usability-Werte voraus und ist laut Autoren 25 % genauer als Baselines. **[B]** *(nicht nachgeprüft)* | Das Modell ist nicht frei verfügbar. Ob es auf deutschsprachige Spiele-UI übertragbar ist, ist offen. **[E]** |
| [Userbrain-Experiment](https://userbrain.com/blog/synthetic-users-experiment/) | Synthetische Nutzer scheiterten an der schwersten Aufgabe wie die echten, kamen aber auch dort durch, wo echte Nutzer scheiterten. **[B]** | Nur 5 Personen je Gruppe, also lediglich ein Indiz. **[B]** |
| [Milička et al. 2024, PLOS ONE](https://pmc.ncbi.nlm.nih.gov/articles/PMC10936766/) | GPT-4 als Kind von 1 bis 6 Jahren: Die False-Belief-Leistung steigt mit dem simulierten Alter ungefähr wie bei echten Kindern. **[B]** | Unter bestimmten Prompts zeigt das Modell Hyper-Akkuratheit, hat also mehr Können als das Kind. **[B]** |
| [NeurIPS 2026, „Can LLMs Simulate Child Users' Behaviors?“](https://neurips.cc/virtual/2026/164521) | Bei Vertrauens- und Konformitätsverhalten bilden die Modelle weder das Verhalten von Kindern noch die Altersmuster nach. Sie fassen soziale Hinweise als Anweisung auf. **[B]** *(nicht nachgeprüft)* | Konsequenz: Ein Prompt „Du bist 5“ ist **kein** valider Ersatz für ein Kind. **[E]** |

**Folgerung [E]:** Die bestehenden Erwartungs-Tests mit nicht informierten Personas sind methodisch richtig angelegt:
Erwartung vorher aufschreiben, danach die Abweichung berichten. Zwei Ergänzungen fehlen:
1. **Fähigkeitsentzug statt Rollenspiel.** Für „liest kaum“ wird der Text im Screenshot geschwärzt und der
   Accessibility-Tree ohne Text übergeben. Für „kaum Deutsch“ wird die UI in eine Pseudosprache übersetzt. So hängt die
   Prüfung nicht davon ab, dass das Modell die Rolle ehrlich spielt.
2. **Asymmetrische Auswertung.** Ein Scheitern des Agenten ist ein Befund. Ein Erfolg ist nur eine Obergrenze und wird
   nie als Beleg für Verständlichkeit gezählt.

### 1.2 Heuristische Evaluation und Cognitive Walkthrough durch LLMs

| Quelle | Befund |
|---|---|
| [Zhong et al. 2025, „Synthetic Heuristic Evaluation“, arXiv 2507.02306](https://arxiv.org/abs/2507.02306) | Das LLM fand 73 % bzw. 77 % der Probleme, fünf erfahrene Fachleute 57 % bzw. 63 %. Es ist stark bei Layout und über die Zeit stabil. **Schwach** ist es bei UI-Konventionen und bei Verstößen, die sich **über mehrere Bildschirme** erstrecken. Getestet wurden GPT-4 (am besten), Gemini 1.5 Pro und Claude 3.5 Sonnet. **[B]** |
| [arXiv 2506.16345 (GPT-4o, Nielsen-Heuristiken)](https://arxiv.org/abs/2506.16345) | Nur 21,2 % der Expertenbefunde wurden auch vom LLM gefunden. Dazu kamen 27 neue Befunde. **[B]** |
| [arXiv 2403.13139 (2024)](https://arxiv.org/abs/2403.13139) | GPT-4 gibt Feedback zu UI-Richtlinien bei 51 UIs. Fachleute bewerten es als teils hilfreich, aber mit Fehlalarmen. **[B]** *(Zahlen nicht nachgeprüft)* |

**Folgerung [E]:** Die Ergebnisse widersprechen sich (21 % gegenüber 77 %), je nach Aufbau und Modell. Ein LLM-Review
taugt daher als **Befundgenerator mit menschlicher Sichtung**, nicht als bestandene oder gescheiterte Schranke. Gerade
die Schwäche „über mehrere Bildschirme“ trifft einen Klärungsdialog über 3–5 Schritte. Das Review bekommt deshalb immer
die **ganze Bildfolge eines Laufs** und nicht einzelne Screens.

### 1.3 Modellbasierte Zählung: KLM/GOMS, Schritte, Entscheidungen, Lesestellen

- Das Keystroke-Level Model sagt Expertenzeiten aus Operatoren voraus (Tastendruck, Zeigen, mentale Vorbereitung M ≈ 1,35 s)
  ([Wikipedia: KLM](https://en.wikipedia.org/wiki/Keystroke-level_model)). **[B]** Für Touch gibt es eigene
  Erweiterungen: [El Batran & Dunlop 2014](https://stax.strath.ac.uk/downloads/j67314071?locale=en) ergänzen drei Operatoren auf
  Basis von Fitts *(nicht nachgeprüft)*, dazu das Touch Level Model von Rice & Lartigue. Ein Review findet rund 45
  zusätzliche Operatoren, von denen nur die Hälfte experimentell validiert ist
  ([Al-Megren et al.](https://library.kab.ac.ug/Record/doaj-art-3de87da54ab04398a46fb6f0e5a81fd5/Details)). **[B]**
- KLM modelliert **geübte, fehlerfreie** Nutzer. Für Kinder und Neulinge taugt es nicht als absolute Zeit, wohl aber
  als **relativer Vergleich** zwischen zwei Dialogvarianten. **[E]**
- Praktisch: Aus dem Playwright-Trace eines Referenzlaufs werden Operatoren gezählt: Taps, Texteingaben,
  Pflichtentscheidungen (je ein M) und Lesestellen (sichtbarer Text, den man lesen muss, um weiterzukommen). Daraus
  entstehen eine KLM-Schätzung in Sekunden und harte Zählwerte. **[E]**

### 1.4 Lesbarkeit fürs Deutsche, Leichte und Einfache Sprache

| Instrument | Stand und Nutzen |
|---|---|
| **LIX** (Björnsson): mittlere Satzlänge plus Anteil der Wörter mit mehr als 6 Buchstaben ([Wikipedia](https://en.wikipedia.org/wiki/Lix_(readability_test))) | Deutsche Bänder sind uneinheitlich: unter 40 gilt als leicht ([Uni Hamburg, Folien](https://www.korpuslab.uni-hamburg.de/lehrmaterialien/diverses/syntax-folien.pdf)), eine andere Quelle setzt Kinderbücher unter 25 an. **[B]** Der Wert ist sprachunabhängig, weil er keine Silben zählt, und deshalb für UI-Text robuster. **[E]** |
| **Wiener Sachtextformel** (WSTF 1–4), Skala ungefähr 4 (sehr leicht) bis 15 | In [`textstat`](https://pypi.org/project/textstat) mit `variant` umgesetzt, ebenso in [`textacy`](https://textacy.readthedocs.io/en/0.12.0/api_reference/text_stats.html) mit LIX. **[B]** |
| **Flesch-DE (Amstad)** | Ist in `textstat` und im PHP-Paket [TextStatistics](https://github.com/heiglandreas/TextStatistics) vorhanden. Silbenzählung je Bibliothek verschieden. **[B]** |
| **DIN SPEC 33429:2025-03** „Empfehlungen für Deutsche Leichte Sprache“, kostenlos ([DIN Media](https://dinmedia.de/de/technische-regel/din-spec-33429/387728031)) | Empfehlungen auf Wort-, Satz- und Textebene und zur Nutzungssituation, im Auftrag des BMAS ([Paritätischer](https://www.der-paritaetische.de/alle-meldungen/erstmals-einheitliche-empfehlungen-fuer-die-deutsche-leichte-sprache/)). **[B]** Einzelregeln *(nicht nachgeprüft)*: Wortlisten vor Ort gegen das PDF prüfen. |
| **DIN ISO 24495-1:2024** und **DIN 8581-1:2024** „Einfache Sprache“ ([DIN Media](https://www.dinmedia.de/de/norm/din-8581-1/377238273)) | Zielgruppe ist ausdrücklich **nicht** Menschen mit kognitiver Beeinträchtigung, für sie gilt Leichte Sprache. **[B]** Für den Promovenden-Pfad passt Einfache Sprache, für den Kinder-Pfad Leichte Sprache plus Bild und Ton. **[E]** |

**Grenze [E]:** Lesbarkeitsformeln sind für Fließtext kalibriert. Auf Buttontexten mit 2–5 Wörtern streuen sie stark.
Deshalb misst man **je Bildschirm aggregiert**, ergänzt durch Regelprüfungen: Satzlänge, Wortlänge, Negationen,
Passiv, Fremdwörter gegen eine Grundwortschatzliste. LLMs dürfen Text **umschreiben vorschlagen**, aber nicht allein
bewerten, ob er leicht ist. Eine [pedocs-Analyse 2025](https://www.pedocs.de/volltexte/2025/32378/pdf/Abend_2025_Foerdern_ChatGPT_und_die_DIN.pdf)
untersucht ChatGPT gegen die DIN SPEC. *(nicht nachgeprüft)*

### 1.5 Bilder und Icons ohne Text

- **ISO 9186-1:2014** normiert Verständnistests für grafische Symbole: Welcher Anteil der Menschen versteht ein Symbol
  richtig? ([ISO](https://www.iso.org/standard/59226.html)) **[B]** Die oft genannte Akzeptanzschwelle von 66–67 %
  konnte nicht nachgeprüft werden. *(nicht nachgeprüft)*
- NN/g: Kinder unter 6 erkennen subtile Hinweise nicht und brauchen ausdrückliche, gesprochene Rückmeldung. Vertraute,
  realistische Objekte wirken, etwa die Nudeltüte, die man in den Topf zieht. Undo/Redo verstehen sie nicht. Zahlen ohne
  Bild bleiben abstrakt, deshalb „2“ zusammen mit 2 Welpen-Icons zeigen.
  ([Liu 2018, NN/g „Designing for Kids: Cognitive Considerations“](https://www.nngroup.com/articles/kids-cognition/)) **[B]**
- Kinder verstehen App-Kategorie-Icons nur teilweise
  ([Wiebe et al., „Icons for Kids“, GI 2016](https://hci.cs.umanitoba.ca/Publications/details/icons-for-kids-can-young-children-understand-graphical-representations-of-a)).
  **[B]** *(Zahlen nicht nachgeprüft)*
- **Automatisierbar [E]:** eine Bild-Text-Konsistenzprüfung. Ein Vision-Modell bekommt nur das Kachelbild und muss aus
  den Antwortoptionen der Frage die richtige wählen. Trefferquote je Kachel unter 90 % heißt: Das Bild trägt die
  Bedeutung nicht. Das ist ein **Obergrenzen-Test**, denn Modelle erkennen mehr als Kinder. Ein echter Test nach
  ISO 9186 mit Kindern bleibt nötig.

### 1.6 W3C COGA, WCAG 2.2 und WCAG 3.0

- **COGA** „Making Content Usable for People with Cognitive and Learning Disabilities“
  ([W3C](https://www.w3.org/TR/coga-usable/)) ist eine Ergänzung zur WCAG und keine Konformitätsanforderung. **[B]**
  Sie hat 8 Ziele, darunter „Help Users Focus“, „Ensure Processes Do Not Rely on Memory“ und „Support Adaptation and
  Personalization“. Muster, die für MDI direkt relevant sind: 4.2.4 *Make Each Step Clear* (erledigte, aktuelle und
  offene Schritte zeigen), 4.2.7 *Use Icons that Help the User*, 4.4.1 *Use Clear Words*, 4.4.5 *Keep Text Succinct*,
  4.4.9 *Separate Each Instruction*, 4.5.2 *Let Users Go Back* („in einem einfachen Schritt zurück“),
  4.6.2 *Make Short Critical Paths*, 4.6.3 *Avoid Too Much Content*, 4.7.5 *Do Not Rely on … Memorizing Information*,
  4.8.3 *Clearly State the Results … of Actions*, 4.9.3 *Support Simplification*. **[B]**
- **WCAG 2.2** ist automatisch nur teilweise prüfbar. axe-core findet laut Hersteller im Mittel 57 % der Befunde aus
  über 2.000 Audits ([Deque 2021](https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues)).
  Die Studie stammt vom Anbieter. **[B]** Für MDI relevant sind 2.5.8 Target Size Minimum (24 px, AA),
  3.3.7 Redundant Entry und 3.3.8 Accessible Authentication. *(Kriterien bekannt, hier nicht neu nachgeprüft)*
- **WCAG 3.0** ist weiter ein Working Draft. Die Guidelines „Clear language“ und „Process cognitive load“ sind benannt,
  ihre Outcomes noch explorativ ([Editor's Draft](https://w3c.github.io/silver/guidelines/);
  [AbilityNet 2026](https://abilitynet.org.uk/resources/digital-accessibility/what-expect-wcag-30-web-content-accessibility-guidelines)).
  **[B]** Als Richtung taugt der Entwurf, als Prüfmaßstab nicht. **[E]**
- **ISO 9241-110:2020**, Interaktionsprinzipien: Aufgabenangemessenheit, Selbstbeschreibungsfähigkeit, Erwartungskonformität,
  Erlernbarkeit (mit Entdecken, Erkunden, Behalten), Steuerbarkeit, Robustheit gegen Benutzungsfehler, neu
  **User Engagement** ([ISO-Vorschau](https://cdn.standards.iteh.ai/samples/75258/83c8cf072187487686645aad04eff40e/ISO-9241-110-2020.pdf);
  [Wikipedia](https://www.wikipedia.org/wiki/ISO_9241)). **[B]** Diese Prinzipien bilden das Raster der LLM-Rubrik. **[E]**

### 1.7 Kinder-UX

- NN/g testete Kinder von 3 bis 12 Jahren in den USA und China. Die Altersbänder 3–5, 6–8 und 9–12 unterscheiden sich
  stark in Kognition, Motorik und Lesefähigkeit ([NN/g Young Users](https://www.nngroup.com/topic/young-users/);
  [Physical Development](https://www.nngroup.com/articles/children-ux-physical-development/)). **[B]** Kinder von 3 bis
  5 Jahren tippen und wischen, Tastatur ist ihnen kaum möglich (Sekundärquelle). *(nicht nachgeprüft)*
- Sechsjährige verstanden **animierte, visuelle Anleitungen** leicht. Siebenjährige scheiterten, wenn auf dem
  Bildschirm nicht erklärt war, wie man gewinnt. Kinder nehmen gesprochene Anweisungen **wörtlich**. Fehlt klares
  Feedback, steigt der Frust schneller als bei Erwachsenen. Das Arbeitsgedächtnis ist klein, also wenig merken lassen.
  ([NN/g kids-cognition](https://www.nngroup.com/articles/kids-cognition/)) **[B]**
- Ein Fall aus derselben Studie: Der Browser blockierte die Audio-Erklärung (Autoplay-Sperre), und das Kind blieb ohne
  Anleitung ([NN/g kids-cognition](https://www.nngroup.com/articles/kids-cognition/)). **[B]** Für eine Web-App heißt
  das: Vorlesen startet erst nach einer Geste, also braucht es einen sichtbaren Lautsprecher-Knopf als erste Aktion.
  **[E]**
- Für Kinder unter 13 gilt rechtlich und forschungsethisch: Tests nur mit Einwilligung der Eltern. **[B]** (Sekundärquelle)

---

## 2 Differenzierung von Kind bis Experte ohne Komplexität

| Prinzip | Beleg | Bedeutung für MDI |
|---|---|---|
| **Low floor, high ceiling, wide walls** | Leitmotiv von Scratch ([Resnick et al. 2009, CACM](https://cacm.acm.org/research/scratch-programming-for-all/) *(nicht nachgeprüft)*). „Wide walls“: nicht ein Pfad vom Boden zur Decke, sondern viele ([Resnick, *Lifelong Kindergarten*, zitiert nach](https://blogs.friendsseminary.org/lstech/?p=1677)). **[B]** | Boden: Satz und „Los“. Decke: alle Parameter. Wände: viele Spielarten statt immer tieferer Menüs. **[E]** |
| **Training Wheels** | Fehlerträchtige Funktionen werden für Neulinge gesperrt: 21 % schneller und höhere Erfolgsquote. Die Lernenden waren später auch im Vollsystem besser ([Carroll & Carrithers 1984, CACM](https://cacmb4.acm.org/magazines/1984/8/10472-training-wheels-in-a-user-interface); [Human Factors 1984](https://pure.psu.edu/en/publications/blocking-learner-error-states-in-a-training-wheels-system/)). **[B]** Die Stichprobe war mit 12 Personen klein. | Optionen sind im Kind- und Standardpfad nicht versteckt hinter einem Fehler, sondern **gar nicht da**. Sie erscheinen, wenn der Nutzer sie anfordert. **[E]** |
| **Progressive Disclosure** | Zuerst die wichtigen Optionen, Seltenes auf Anfrage ([Nielsen 2006, NN/g](https://www.nngroup.com/articles/progressive-disclosure/)). Siehe auch `progressive-disclosure.md`. **[B]** *(Volltext nicht nachgeprüft)* | Je Frage genau eine Ebene „Mehr einstellen“, nie zwei. **[E]** |
| **Adaptierbar statt adaptiv** | Statische Split-Menüs waren schneller als adaptive, die Mehrheit bevorzugte das anpassbare Menü ([Findlater & McGrenere 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)). **[B]** | Kein heimlich „schlauer“ Modus, der Optionen je nach vermutetem Können ein- und ausblendet. Das widerspräche auch dem Anti-Pattern „stille Rückfälle“ und „Client-Policy“. Der Nutzer wählt selbst. **[E]** |
| **COGA 4.9.3 Support Simplification** | Eine vereinfachte Fassung soll wählbar sein ([W3C COGA](https://www.w3.org/TR/coga-usable/)). **[B]** | Die einfache Fassung ist der **Standard**, Expertentiefe ist eine Erweiterung. **[E]** |

**Gamification, was wirkt und was nicht:**

- Wirkung im Mittel: kognitiv g = 0,49, motivational g = 0,36, Verhalten g = 0,25. Die motivationalen Effekte sind in
  strengen Studien **instabil**. Spielfiktion und Kooperation plus Wettbewerb moderieren positiv
  ([Sailer & Homner 2020](https://doi.org/10.1007/s10648-019-09498-w)). **[B]**
- Die Effekte hängen stark von Kontext und Nutzern ab ([Hamari, Koivisto, Sarsa 2014](https://doi.org/10.1109/HICSS.2014.377)). **[B]**
- Greifbare Belohnungen, die an Erledigung oder Leistung geknüpft sind, untergraben die intrinsische Motivation
  ([Deci, Koestner & Ryan 1999, Meta-Analyse über 128 Studien](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf);
  bestätigt für freie Wahl durch [Turku 2023](https://utupub.fi/handle/10024/173853)). **[B]**
- Dark Game Design Patterns: zeitliche (Grinding), monetäre (Pay-to-Skip) und soziale (Social Pyramid)
  ([Zagal, Björk, Lewis 2013](https://deceptive.design/articles/dark-patterns-in-the-design-of-games)). **[B]**
- **Ableitung für MDI [E]**, im Einklang mit der Regel „Keine Manipulation“:
  - Experten werden über **Neugier** herangeführt, nicht über Punkte. Nach dem ersten fertigen Spiel erscheint
    höchstens **ein** Hinweis: „Das kannst du auch ändern: Tempo“. Er zeigt auf ein echtes Bedienelement im fertigen
    Spiel und lässt sich ohne Folgen wegwischen.
  - Freigeschaltet wird durch **Tun**, etwa „du hast Tempo einmal geändert → Regler für Schwierigkeit erscheint“. Nie
    durch Warten, Streaks oder Bezahlen.
  - Keine Fortschrittsbalken über das Können des Nutzers, keine Verlustangst.

---

## 3 Vorschlag: automatisiertes Prüfverfahren für MDI

### 3.1 Pipeline

```
Stufe 0  statisch, je PR          <1 min   0 $          harte Schranke
Stufe 1  Playwright-Referenzläufe  ~3 min   0 $          harte Schranke
Stufe 2  Persona-Agenten (Haiku)   nachts   ~1–3 $       Trend, Schranke nur bei Kind-/Nichtleser-Erfolg
Stufe 3  LLM-Review (Sonnet)       nachts   ~0,5–2 $     Befundliste, menschliche Sichtung
Stufe 4  echte Nutzer              vor Release-Meilensteinen  nicht automatisierbar
```

**Stufe 0: Textprüfung der UI-Strings (deterministisch).** Alle Strings des Klärungsdialogs werden aus dem Quelltext
bzw. den i18n-Dateien extrahiert und mit `textstat` bzw. `textacy` sowie eigenen Regeln geprüft.

**Stufe 1: Playwright-Referenzläufe.** Ein Skript fährt den kürzesten Pfad je Wunschtyp (Viewport 390×844) und
schreibt je Bildschirm: sichtbare Wörter, Pflichtentscheidungen, Anzahl Optionen, Taps, Texteingaben, KLM-Schätzung,
axe-core-Befunde, Trefferflächen, zugängliche Namen sowie das Vorhandensein von Bild und Vorlese-Knopf je Kachel.

**Stufe 2: Persona-Agenten.** Basis sind die bestehenden Erwartungs-Tests mit fester Persona-Matrix und
**Fähigkeitsentzug**:

| Persona | Technischer Entzug | Ziel |
|---|---|---|
| K5 „Kind, 5, liest nicht“ | Text im Screenshot geschwärzt, A11y-Tree ohne Text. Nur Bilder plus Transkript des Vorlesens nach Tap auf 🔊 | Aus einem gesprochenen Wunsch wird ein spielbares Spiel. |
| K8 „Kind, 8, liest langsam“ | Pro Bildschirm werden nur die ersten 8 Wörter gezeigt, der Rest ist geschwärzt. | wie K5 |
| N „kaum Deutsch“ | UI-Text in Pseudosprache, Bilder unverändert | wie K5 |
| S „85, unsicher, wenig Technik“ | Schritt-Budget, bricht nach 2 unklaren Bildschirmen ab | Spiel fertig, ohne zurückzumüssen |
| E „Erwachsene, eilig“ | Budget von 4 Taps nach dem Satz | Ergebnis mit Standardwerten |
| P „Promovend, will alles einstellen“ | voller Zugriff, Auftrag mit 6 konkreten Parametern | Findet alle 6 Stellschrauben, ohne Hilfe zu suchen. |
| (bestehend) 16–85 Jahre, nicht informiert | wie bisher | Abweichung zwischen Erwartung und Ergebnis |

Je Persona laufen 5 disjunkte Wünsche in 3 Wiederholungen. Berichtet werden Erfolgsquote mit 95-%-Intervall,
Schritte, Abbruchgründe und **wörtliche Stolperstellen**.

**Stufe 3: LLM-Review mit Rubrik.** Sonnet bekommt die **ganze Bildfolge** eines Referenzlaufs, also nicht nur einzelne
Screens, und bewertet nach einer festen Rubrik aus COGA-Mustern, ISO 9241-110 und den Heuristiken von Nielsen. Jeder
Befund nennt Bildschirm, Prinzip, Zitat und Vorschlag. Das Ergebnis ist kein Gate, sondern eine Liste für die
Betreiber-Prüfansicht.

### 3.2 Messgrößen und Schwellen

Alle Schwellen sind **[E]**: Sie sind aus den Quellen abgeleitet, nicht empirisch geeicht. Nach den ersten echten Tests
werden sie nachjustiert.

| # | Messgröße | Schwelle Kind-/Standardpfad | Herleitung |
|---|---|---|---|
| M1 | Pflicht-Taps vom abgeschickten Satz bis zum spielbaren Spiel, mit Standardwerten | **≤ 3** | COGA 4.6.2 Short Critical Paths |
| M2 | Pflicht-Taps mit vollem Klärungsdialog | ≤ 7 | 3–5 Fragen + Abnahme |
| M3 | Pflichtentscheidungen je Bildschirm | **= 1** | COGA 4.4.9, Arbeitsgedächtnis (NN/g) |
| M4 | Optionen je Bildkachel-Frage | ≤ 4 plus „Überrasch mich“ | kleines Arbeitsgedächtnis bei Kindern (NN/g); keine Zahl aus der Quelle |
| M5 | Sichtbare Wörter je Bildschirm außerhalb der Kachel-Labels | **≤ 12** | COGA 4.4.5 und 4.6.3; DIN SPEC 33429 kurze Sätze |
| M6 | Wörter je Satz / Wörter > 6 Buchstaben | ≤ 8 / ≤ 15 % | Leichte Sprache; ergibt LIX ≲ 25 |
| M7 | LIX je Dialog (aggregiert) | ≤ 30 (Kind), ≤ 40 (Expertenebene) | Bänder Uni Hamburg und Kinderbuch-Band |
| M8 | Kacheln mit Bild **und** Vorlese-Knopf | 100 % | NN/g Kinder unter 6, COGA 4.2.7 |
| M9 | Bild-Text-Konsistenz (Vision-Modell wählt Option nur aus dem Bild) | ≥ 90 % je Kachel | Obergrenzen-Test, siehe 1.5 |
| M10 | Trefferfläche interaktiver Elemente | ≥ 44×44 CSS-px | über WCAG 2.5.8 (24 px) hinaus, Kinder-Motorik |
| M11 | axe-core: Verstöße der Stufen kritisch oder schwer | 0 | WCAG 2.2 |
| M12 | „Zurück“ erreichbar, ohne Eingaben zu verlieren | auf jedem Dialogschritt | COGA 4.5.2 und 4.5.9 |
| M13 | Erfolgsquote K5/K8/N (Agent) | ≥ 90 %, Gate | Agent-Erfolg ist eine Obergrenze. Liegt sie darunter, ist es sicher zu schwer. |
| M14 | Erfolgsquote S/E (Agent) | ≥ 90 % | — |
| M15 | Promovend: gefundene Stellschrauben | ≥ 5 von 6, jede ≤ 2 Taps von der zugehörigen Frage entfernt | high ceiling, Progressive Disclosure mit einer Ebene |
| M16 | KLM-Schätzung Standardpfad | Trend, keine Verschlechterung > 10 % gegenüber main | relativer Vergleich |

### 3.3 Was ein LLM-Agent kann und was nicht

| Zuverlässig genug (Signal) | Unzuverlässig | Nur echte Nutzer |
|---|---|---|
| Sackgassen, fehlender Weiter-Knopf, Abbrüche (Zhong 2025) **[B]** | Ob ein Kind ein Bild versteht: Modelle erkennen mehr **[E]** | Tatsächliches Verständnis von 5–6-Jährigen, Motorik, Frust |
| Layout- und Konsistenzprobleme auf einem Bildschirm (2507.02306) **[B]** | Verstöße über mehrere Bildschirme (2507.02306) **[B]** | Emotion, Langeweile, „anstrengend“ |
| Ob Textstellen gegen Regeln verstoßen, als Vorschlag **[E]** | Soziales und Vertrauensverhalten von Kindern (NeurIPS 2026) **[B]** | Ob Gamification motiviert oder nervt (Sailer & Homner: instabil) **[B]** |
| Abweichung zwischen Erwartung und Ergebnis bei Erwachsenen-Personas **[E]** | Absolute Zeiten und Fehlerraten | Akzeptanz durch Eltern, Einwilligung, Kontext Familie |
| Ob Expertenoptionen auffindbar sind | Schwierigkeit „wie ein Kind“ per Rollenprompt **[B]** | Vorlesestimme: Tempo, Verständlichkeit |

**Unverzichtbare echte Tests [E]:** Vor jedem großen Umbau des Dialogs testen je 5 Personen aus drei Gruppen: Kinder
von 5–7 Jahren mit Eltern, Senioren über 75 und Fachnutzer. Ziel ist, die Agent-Befunde zu kalibrieren: Wo scheitern
Menschen, wo Agenten nicht? Diese Differenz wird zum Prompt- und Schwellenkorrektiv. Fünf Personen je Runde folgen der
iterativen Praxis von NN/g. *(Quelle nicht neu nachgeprüft)*

### 3.4 Kosten pro Lauf

Preise laut [Anthropic-Preisliste](https://platform.claude.com/docs/en/about-claude/pricing), abgerufen am 18.11.2026:
Haiku 5.5 kostet 0,10 $ Input und 0,50 $ Output je Mio. Token (Batch 0,05 $ / 0,25 $). Sonnet 5.5 kostet 2 $ / 10 $
(Batch 1 $ / 5 $). Cache-Treffer kosten 0,01 $ bzw. 0,10 $. **[B]**

Annahmen **[E]**: Ein Persona-Lauf hat etwa 15 Schritte. Je Schritt fallen rund 6.000 Input-Token an (Screenshot etwa
1.500, A11y-Text etwa 2.000, Persona und Verlauf etwa 2.500) und etwa 300 Output-Token. Pro Lauf sind das rund
90.000 Input- und 4.500 Output-Token, mit 30 % Puffer für den Tokenizer.

| Posten | Menge | Haiku 5.5 | Sonnet 5.5 |
|---|---|---|---|
| 1 Persona-Lauf | 1 | ≈ 0,015 $ | ≈ 0,30 $ |
| Stufe 2 nachts: 7 Personas × 5 Wünsche × 3 | 105 Läufe | **≈ 1,60 $** | ≈ 31 $ |
| Bild-Text-Konsistenz M9: 50 Kacheln | 50 Aufrufe | ≈ 0,01 $ | ≈ 0,15 $ |
| Stufe 3 Review: 5 Bildfolgen à 12 Bilder | 5 | ≈ 0,02 $ | **≈ 0,40 $** |
| Bau der Spiele selbst (Nullmessung: 0,0011 $/Karte) | 105 | ≈ 0,12 $ | — |

Empfehlung **[E]**: Stufe 2 läuft mit Haiku, Stufe 3 mit Sonnet. Insgesamt kostet ein Nachtlauf **unter 5 $**. Eine
Stichprobe von 10 % der Haiku-Läufe wird mit Sonnet wiederholt. Weichen Haiku und Sonnet um mehr als 15 Prozentpunkte
voneinander ab, gilt der Haiku-Wert als unzuverlässig. Mit Batch und Cache halbieren sich die Kosten etwa. Haiku-Läufe
fallen deutlich unter das bestehende Budget für Erwartungs-Tests von 100 $.

---

## 4 Gestaltungsprinzipien für den Klärungsdialog

| # | Prinzip | Quelle |
|---|---|---|
| G1 | **Ein Ziel, eine Entscheidung pro Bildschirm.** Fortschritt als Bilder zeigen (erledigt, jetzt, offen), nicht als „Schritt 2 von 5“. | COGA 4.2.4, 4.4.9 **[B]**; Zahl abstrakt für Kinder (NN/g) **[B]** |
| G2 | **Bild zuerst, Wort darunter.** Kacheln mit vertrauten, realistischen Motiven; Zahlen als Mengenbild. | NN/g kids-cognition **[B]** |
| G3 | **Vorlesen überall.** Großer 🔊 auf jeder Frage und Kachel. Die erste Geste schaltet den Ton frei (Autoplay-Sperre). Gesprochen wird ausdrücklich und wörtlich gemeint. | NN/g (blockiertes Audio, wörtliche Auslegung) **[B]** |
| G4 | **Sprechen statt Tippen** als gleichwertige Eingabe für den Wunschsatz. Freie Texteingabe ist optional. | Tastatur für 3–5-Jährige kaum möglich *(nicht nachgeprüft)*; Ableitung **[E]** |
| G5 | **Standard-Antwort vorausgewählt und „Überrasch mich“** auf jeder Frage. „Fertig bauen“ ist ab der ersten Frage erreichbar, die übrigen Fragen übernehmen dann die Standardwerte. | COGA 4.6.2 Short Critical Paths **[B]**; Defaults offen benennen, keine versteckte Steuerung (Zufall nur aus dem Seed) **[E]** |
| G6 | **„So bauen wir es“ als Bildliste**, nicht als Textliste. Jede Zeile hat ein Icon und ist antippbar, um sie zu ändern. Für Experten gibt es eine Textansicht. | COGA 4.8.3 Results of Actions; 4.7.5 nicht auf das Gedächtnis verlassen **[B]** |
| G7 | **Eine Ebene „Mehr einstellen“ je Frage** für Experten. Sie ist sichtbar, aber zurückhaltend gestaltet, ohne zweite Unterebene. Experten-Abkürzung: Wer den Satz mit Parametern schreibt („schnell, 3 Leben, Weltraum“), überspringt die beantworteten Fragen. | Progressive Disclosure (NN/g) **[B]**; Training Wheels **[B]**; Ableitung **[E]** |
| G8 | **Adaptierbar, nicht adaptiv.** Ein Schalter „einfach / alles zeigen“ wird gemerkt. Das System schaltet nicht selbst um. | Findlater & McGrenere 2004 **[B]** |
| G9 | **Heranführen durch Entdecken.** Nach der Abnahme erscheint ein Hinweis auf eine echte Stellschraube im fertigen Spiel. Freischalten durch Tun, keine Punkte, keine Streaks. | Deci et al. 1999; Zagal et al. 2013 **[B]** |
| G10 | **Zurück ohne Verlust** in einem Tap auf jedem Schritt. Kein Undo/Redo-Symbol für Kinder, sondern sichtbares „Nochmal“ oder ein Radiergummi. | COGA 4.5.2 **[B]**; NN/g (Kinder bevorzugen den Radiergummi) **[B]** |
| G11 | **Warten im Hintergrund mit Bild und Ton.** Zeigen, was gerade gebaut wird, zum Beispiel das Figurenbild aus Frage 1. Nichts bewegt sich unerwartet. | COGA 4.5.1, 4.6.1 **[B]** |
| G12 | **Abnahme = Spielen.** Die Abnahme ist der erste Spielzug. „Passt“ und „Ändern“ sind als Daumen-Bilder dargestellt, nicht als Formular. | NN/g (explizites Feedback) **[B]**; Ableitung **[E]** |

---

## 5 Priorisierte Maßnahmen

1. **Fähigkeitsentzug in die Erwartungs-Tests einbauen.** Neue Personas K5, K8 (Text geschwärzt bzw. gekürzt) und
   N (Pseudosprache). Die Erfolgsquote K5/N ≥ 90 % wird nächtliches Gate. Kosten mit Haiku etwa 1–2 $ pro Nacht.
   Das ist der schnellste objektive Beleg für „5-Jährige erreicht ihr Ziel“. **[E]**
2. **Statische und Playwright-Schranken M1–M12 in die CI.** Wörter je Bildschirm, eine Entscheidung je Bildschirm,
   ≤ 3 Pflicht-Taps mit Standardwerten, LIX, Vorlese-Knopf je Kachel, axe-core, 44 px. Deterministisch, 0 $ pro Lauf.
3. **Klärungsdialog umbauen nach G1, G2, G3, G5.** Bild zuerst, Vorlesen, eine Frage je Bildschirm, Standardwert
   plus „Überrasch mich“, „Fertig bauen“ ab Frage 1. Das Ergebnis wird mit Maßnahmen 1 und 2 gemessen.
4. **Expertenpfad nach G7/G8 und Persona P.** Eine Ebene „Mehr einstellen“ je Frage, Parameter direkt im Satz
   erkennen, sichtbarer Schalter „einfach / alles zeigen“. Gate M15.
5. **LLM-Review mit Sonnet über ganze Bildfolgen** (Rubrik aus COGA, ISO 9241-110 und Nielsen) als nächtliche
   Befundliste in der Betreiber-Prüfansicht, ohne Gate. Etwa 0,40 $ pro Nacht.
6. **Bild-Text-Konsistenz M9 für alle Kacheln**, danach ein Verständnistest nach ISO 9186 mit Kindern für die
   Kacheln, die am schwächsten abschneiden.
7. **Heranführen durch Entdecken (G9)** statt Gamification mit Punkten: ein Hinweis nach der Abnahme, Freischalten
   durch Tun. Messgröße: Anteil der Nutzer, die beim zweiten Spiel eine Expertenoption nutzen. Kein Gate.
8. **Kalibrierung mit echten Nutzern** vor dem nächsten großen Dialog-Release: je 5 Kinder von 5–7 Jahren mit Eltern,
   Senioren und Fachnutzer. Die Differenz zwischen Agent und Mensch justiert Schwellen und Prompts.

## Offene Punkte

- Die Schwellen M4–M7 und M13 sind nicht empirisch geeicht und werden nach Maßnahme 8 überprüft.
- Die Einzelregeln der DIN SPEC 33429 und das ISO-9186-Kriterium wurden nicht im Volltext geprüft.
- Die Validität des Fähigkeitsentzugs als Kinder-Proxy ist nicht publiziert. Sie ist unsere Hypothese und wird mit
  Maßnahme 8 geprüft.
