# Plattformtreue vs. Markenkonsistenz (gemeinsame Web-UI in iOS, Android, Web)

Frage aus `KONZEPT.md` §7: Was muss in den Apps nativ sein, was bleibt Marke? Stand: 2026-11-11.

## Quellen

| # | Quelle | Kern für uns |
|---|---|---|
| P1 | J. Grudin, „The Case Against User Interface Consistency“, CACM 32(10):1164–1173, 1989, doi:10.1145/67933.67934. https://www.microsoft.com/en-us/research/publication/case-user-interface-consistency/ *(nur Abstract + Sekundärquelle)* | Konsistenz ist kein verlässliches Primärziel; unterscheidet innere Konsistenz, äußere Konsistenz (mit vertrauten anderen Oberflächen) und analoge Konsistenz. Maßstab ist die Arbeitsumgebung der Nutzer. |
| P2 | C. Denis, L. Karsenty, „Inter-Usability of Multi-Device Systems – A Conceptual Framework“, in A. Seffah, H. Javahery (Hg.), Multiple User Interfaces, Wiley 2004. *(nicht gelesen; Inhalt laut Sekundärquellen)* | „Inter-Usability“: Leichtigkeit des Wechsels zwischen Geräten; Prinzipien Konsistenz, Transparenz, Anpassung, Kontinuität von Wissen und Aufgabe. |
| P3 | K. Majrashi, M. Hamilton, A. Uitdenbogerd, S. Al-Megren, „Cross-Platform Usability Model Evaluation“, Multimodal Technol. Interact. 4(4):80, 2020, doi:10.3390/mti4040080. https://www.mdpi.com/2414-4088/4/4/80 *(nicht gelesen)* | Empirisches Modell plattformübergreifender Usability. Befunde nicht ausgewertet. |
| P4 | Apple, Human Interface Guidelines – Branding (abgerufen 2026-11-11). https://developer.apple.com/design/human-interface-guidelines/branding | Akzentfarbe sparsam (Hauptaktionen, Status); eigene Schrift gut für Überschriften, **Systemschrift für Fließtext**; Schrift muss Dynamic Type und Fettschrift unterstützen; Marke **mit vertrauten Komponenten** ausdrücken, Größe/Platzierung/Verhalten plattformgerecht lassen. |
| P5 | Apple HIG – Dark Mode. https://developer.apple.com/design/human-interface-guidelines/dark-mode | Systemeinstellung respektieren; **keine app-eigene Hell/Dunkel-Einstellung anbieten**; beide Modi und „Kontrast erhöhen“ testen. |
| P6 | Apple HIG – Activity views (Teilen-Blatt). https://developer.apple.com/design/human-interface-guidelines/activity-views | Systemblatt für Teilen nutzen; vorhandene Systemaktionen nicht duplizieren. |
| P7 | Apple HIG – Playing haptics. https://developer.apple.com/design/human-interface-guidelines/playing-haptics | System-Haptikmuster nur gemäß ihrer dokumentierten Bedeutung verwenden. |
| P8 | Apple HIG – Typography. https://developer.apple.com/design/human-interface-guidelines/typography | iOS: Standard 17 pt, Minimum 11 pt; dünne Schnitte meiden; wenige Schriften. |
| P9 | Apple, App Store Review Guidelines 4.2 „Minimum Functionality“. https://developer.apple.com/app-store/review/guidelines/ | App muss über eine „umverpackte Website“ hinausgehen. Native Integration ist auch Zulassungsfrage. |
| P10 | Android Developers, „Add support for the predictive back gesture“ (abgerufen 2026-11-11). https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture | Predictive Back ist Standard; Zurück-Logik über `OnBackPressedCallback`/`OnBackInvokedCallback`, nicht über `KEYCODE_BACK`; Callbacks nur für UI-Logik. |
| P11 | Android Developers, „Display content edge-to-edge“. https://developer.android.com/develop/ui/views/layout/edge-to-edge | Ab targetSdk 35 auf Android 15+ ist Edge-to-Edge erzwungen; Insets muss die App selbst behandeln. |
| P12 | Google, Material Design 3. https://m3.material.io *(nicht inhaltlich ausgewertet; Seite nicht maschinell lesbar)* | Referenz für Android-Komponenten, Bewegung, dynamische Farben. |

## Befund

1. Die Forschung stützt **keine** Pauschalregel „überall gleich“ (P1). Wichtiger als visuelle Gleichheit ist, dass
   Nutzer beim Wechsel zwischen Geräten ihre Aufgabe und ihr Wissen mitnehmen (P2: Kontinuität). Äußere Konsistenz mit
   dem Betriebssystem (Zurück, Teilen, Schrift, Dunkelmodus) zählt, weil Nutzer diese aus allen anderen Apps kennen.
2. Die Plattformhersteller trennen dasselbe: **Verhalten und Systemdienste plattformtreu, Ausdruck markentreu** (P4).
   Apple empfiehlt ausdrücklich das Muster „Markenschrift für Überschriften, Systemschrift für Fließtext“ (P4) – genau
   die Aufteilung Anton/Systemschrift.
3. Zwei Punkte sind harte Plattformpflichten statt Geschmack: Android-Zurück (P10) und Insets/Edge-to-Edge (P11).
   iOS-Zulassung verlangt erkennbaren App-Mehrwert gegenüber einer Website (P9).
4. Empirische Studien zur Gewichtung „innerhalb vs. zwischen Plattformen“ (P3) wurden nicht im Volltext gelesen;
   die Empfehlung unten stützt sich daher vor allem auf Herstellerrichtlinien und P1/P2. Unsicherheit: mittel.

## Empfehlung: was nativ, was Marke

| Bereich | nativ (Host-Bridge) | Marke (Web-UI, Tokens) |
|---|---|---|
| Navigation | Zurück-Geste/-Taste → Ereignis an die Statechart; iOS-Wischen vom Rand; Android Predictive Back (P10) | Aufbau der Bildschirme, Übergänge innerhalb der Bühne |
| Teilen | Systemblatt (P6), Empfang über Universal/App Links | Linkvorschau-Bild, Texte |
| Haptik | Systemmuster nach Bedeutung (Erfolg, Warnung, Auswahl) (P7) | Wann es haptisches Feedback gibt (sparsam) |
| Safe Areas / Insets | Werte aus dem Host (P11), Tastatur-Insets | Layout innerhalb der sicheren Fläche |
| Schrift | Systemschrift für Fließtext; Dynamic Type bzw. Android-Schriftgröße respektieren (P4, P8) | Anton für Überschriften/Karten-Titel, mit Skalierung |
| Hell/Dunkel | Systemeinstellung folgen, **kein eigener Schalter** (P5) | Token-Paare hell/dunkel, Kontrast geprüft |
| Systemdienste | Push, Berechtigungen (Mikro/Kamera), Kauf, Anmeldung, Audio-Sitzung | Erklärtext vor der Systemabfrage |
| Spiel/Bühne | – | vollständig Marke (Renderer, Anzeigeliste) |
| Rahmen (Kopf, ✕, Blasen, Hauptaktion) | Verhalten wie Systemkomponenten (Trefferflächen, Fokus, Zurück schließt Dialog) | Form, Farbe, Bewegung |

## Ableitung für das Konzept

1. Bestätigt: „Plattformtreue über die Host-Bridge, Marke über Tokens“ entspricht P4 und P2.
2. **Präzisierung Dark Mode:** „Dark Mode“ heißt *Systemeinstellung folgen*; ein app-eigener Hell/Dunkel-Schalter
   entfällt (P5). Falls die Altapp einen hat, ist das ein Paritäts-Ausnahmefall mit Begründung.
3. **Präzisierung Zurück:** Die Bridge (DuellHost v2) braucht ein Ereignis `back` vom Host an die Web-Statechart und eine
   Antwort „verbraucht/nicht verbraucht“, damit Android Predictive Back und iOS-Randwischen den richtigen Zustand
   verlassen (Dialog → Karte → Regal → App verlassen). Ohne Antwortkanal bricht die System-Animation (P10).
4. Insets, Schriftgröße und Farbschema als **Host-Zustand** in der Bridge (lesend, mit Änderungsereignis).
5. Anton nur für Überschriften und Kartentitel; Fließtext in Systemschrift; Mindestgrößen nach P8 in die Token-Prüfung
   des Harness („Optik-Prüfung“) aufnehmen.
6. Persona-Kritik (16–85) soll ausdrücklich Zurück, Teilen und große Schrift je Plattform prüfen, weil dort die
   Plattformerwartung am stärksten ist.
