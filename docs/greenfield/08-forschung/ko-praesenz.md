# Ko-Präsenz und gemeinsames Spielen (Sprache/Video, dauerhafte Räume)

Frage aus `KONZEPT.md` §4: Trägt die Idee „ein Raum, viele Tätigkeiten“ (Raum bleibt, Karten wechseln) gegenüber
Einladungen je Aktivität, und was folgt für Sprache/Video beim Spielen? Stand: 2026-11-11.

## Quellen

| # | Quelle | Kern für uns |
|---|---|---|
| K1 | B. Gajadhar, Y. de Kort, W. IJsselsteijn, „Shared Fun Is Doubled Fun: Player Enjoyment as a Function of Social Setting“, Fun and Games 2008, LNCS 5294, doi:10.1007/978-3-540-88322-7_11. *(nur Abstract + Sekundärquellen)* | Mitspieler im selben Raum steigert Spaß, Herausforderung und erlebte Kompetenz; gegen Menschen macht mehr Spaß als gegen den Computer; Vertrautheit (Freund vs. Fremder) wirkt. |
| K2 | D. Williams, S. Caplan, L. Xiong, „Can You Hear Me Now? The Impact of Voice in an Online Gaming Community“, Human Communication Research 33(4):427–449, 2007. *(Befunde nur aus Sekundärquelle, nicht nachgeprüft)* | Feldexperiment zu Sprachchat in einem Online-Spiel; Sprache wirkt auf Beziehungen, v. a. unter Spielern, die sich schon kennen. |
| K3 | M. G. Ames, J. Go, J. Kaye, M. Spasojevic, „Making Love in the Network Closet: The Benefits and Work of Family Videochat“, CSCW 2010, S. 145–154, doi:10.1145/1718918.1718946. *(nur Abstract)* | Familien-Videochat stärkt Familienidentität, kostet aber Arbeit, den Anruf am Laufen zu halten (v. a. mit Kindern). |
| K4 | S. Follmer, H. Raffle, J. Go, R. Ballagas, H. Ishii, „Video Play: Playful Interactions in Video Conferencing for Long-Distance Families with Young Children“, IDC 2010, S. 49–58, doi:10.1145/1810543.1810550. *(nur Abstract)* | Gemeinsame Spielaktivitäten im Videoanruf stützen Verbundenheit zwischen Kindern und entfernten Erwachsenen; reines Reden reicht Kindern nicht. |
| K5 | S. Bly, S. Harrison, S. Irwin, „Media Spaces: Bringing People Together in a Video, Audio, and Computing Environment“, CACM 36(1):28–47, 1993, doi:10.1145/151233.151235. https://www.lri.fr/~mbl/ENS/CSCW/2013/papers/Bly-mediaspaces-CACM93.pdf *(Sekundärdarstellung)* | Dauerhafte Audio/Video-Verbindungen (Xerox PARC) wirken wie gemeinsamer Raum; die Teilnehmenden prägen die Nutzung stärker als die Technik. |
| K6 | J. Kim, T. Klein-Balajee, R. M. Kelly, A. Hiniker, „‚A Party That Never Stops‘: Designing Digital Third Places for Young People's Friendships on Discord“, arXiv 2501.09951 (v2 2026), Preprint. https://arxiv.org/abs/2501.09951 | Interviews (n = 25, 15–24 J.): dauerhafte, erkennbare Räume + **steuerbare Präsenz** + **abgestufte Sichtbarkeit** tragen Freundschaften. |
| K7 | J. N. Bailenson, „Nonverbal Overload: A Theoretical Argument for the Causes of Zoom Fatigue“, Technology, Mind, and Behavior 2(1), 2021. https://vhil.stanford.edu/sites/g/files/sbiybj29011/files/media/file/bailenson-apa-nonverbal-overload.pdf *(theoretisch, nicht empirisch)* | Ermüdung durch Nah-Blickkontakt, kognitive Last, **Selbstansicht als Dauerspiegel**, Bewegungseinschränkung; Empfehlung: Selbstansicht ausblenden, Audio-Pausen. |
| K8 | Pandemie-Studien zu Spielen/Video und Verbundenheit (u. a. Frontiers in Public Health 2022, doi:10.3389/fpubh.2022.1020114). *(Querschnitt, nur Sekundärzusammenfassung)* | Uneinheitlich: Spielen stützt bestehende Freundschaften; Video-Treffen teils mit *geringerer* Verbundenheit assoziiert. Keine Kausalaussage möglich. |

## Befund

1. **Gemeinsame Tätigkeit trägt die Begegnung** (K1, K4): Spielen mit vertrauten Menschen ist der Kern, nicht das
   Medium. Das stützt „Raum = Verbindung, Karte = Tätigkeit“.
2. **Präsenz muss steuerbar und abgestuft sein** (K6, K5): dauerhafte Räume funktionieren, wenn man leise dabei sein,
   einsteigen und ohne Reibung gehen kann.
3. **Video ist teuer** (K3 Arbeit, K7 Ermüdung, K8 gemischte Befunde). Sprache ist das leichtere Grundmedium;
   Video lohnt sich bei Familie/Kindern (K3, K4) und für kurze Momente (Reaktion, Jubel).
4. Für casual Party-Spiele mit Sprache/Video im Browser fand sich **keine direkte Primärstudie**; die Ableitung
   überträgt Befunde aus Familien-Videochat, Spiele-Sprachchat und Discord. Unsicherheit: mittel bis hoch.

## UX-Folgerungen

- **Stufen der Präsenz:** verbunden (nur Daten, sieht wer da ist) → Sprache → Video. Jede Stufe einzeln per Tipp,
  jederzeit zurück; Standard beim Betreten ist *Daten*, Sprache ein Tipp, Video ein weiterer.
- **Bühne vor Kacheln:** Im Spiel bleibt die Karte groß; Gesichter als kleine Kacheln am Sitzplatz des Spielers statt
  Galerie. Selbstansicht klein, nach wenigen Sekunden ausblendbar (K7).
- **Raum bleibt, Einladung einmal:** Karte anbieten/annehmen statt neuer Einladung je Spiel (K6: geteilte Geschichte im
  selben Raum). Der Raum zeigt die zuletzt gemeinsam gespielten Karten als Verlauf.
- **Gehen ohne Reibung:** ein Tipp, keine Rückfrage, keine Schuldformulierung. Kein „X wartet auf dich“-Druck
  (Bindung ohne Manipulation, `05-bindung/`).
- **Sichtbarkeit opt-in:** „online/im Raum“ sehen nur Kontakte, die der Nutzer freigibt (K6 abgestufte Sichtbarkeit).

## Ableitung für das Konzept

1. Bestätigt: Raum als eigene, dauerhafte Schicht mit wechselnden Karten (K1, K5, K6).
2. **Präzisierung:** „Daten immer, Sprache/Video optional“ wird zu drei expliziten Präsenzstufen mit *Daten* als
   Standard und Sprache vor Video. Video nie automatisch.
3. **Ergänzung:** Lebensdauer des Raums festlegen (z. B. bleibt bestehen, bis alle gegangen sind, oder als benannter
   Raum für feste Gruppen). Dauerhafte Räume nur mit opt-in-Sichtbarkeit.
4. **Ergänzung:** Layout-Regel „Bühne vor Kacheln“ und ausblendbare Selbstansicht als feste Design-System-Komponenten.
5. Messen statt annehmen: im Durchstich D1 Anteil Sprache/Video je Sitzung und Abbrüche protokollieren (aggregiert,
   ohne Inhalte).
