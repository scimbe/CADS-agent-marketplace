# Design Phase C: Design-System und Bildschirme (Strang D)

Stand 2026-11-12. Vorlage für Gate C und für Strang H (`view.js`, `tokens.css`).

- **Canvas (Claude Design):** https://claude.ai/artifact/A1TeNNzXLAPbAMa9WS55ux. Der Link ist privat und muss vom User geteilt werden, bevor andere ihn öffnen können.
- **Tokens als CSS-Vorschlag:** `04-ux/tokens-phase-c.css`. Teil 1 enthält die Tokens, Teil 2 die Bausteine (dazu Dunkelmodus und Plattform-Rahmen), Teil 3 die Motive, die nur auf der Canvas gebraucht werden.
- **Grundlage:** `02-spec/13-produktverstaendnis.md` (§3, §4.4, §6), `12-paritaet.md` §5, `06-plan/welle-1.md`, die alten Screenshots `alt-shots/`, `04-ux/` und die Personas.
- **Werkzeug:** Der Claude-Design-Konnektor meldet `FIRST_PARTY_AUTH_REJECTED`. Deshalb entsteht die Canvas über das Artifact-Werkzeug mit dem Design-Typ. Die Artboards sind statisches HTML und teilen sich ein Stylesheet.

## 1. Design-System (Board „Design-System“)

| Thema | Entscheidung |
|---|---|
| Stil | Papierkalender + Meme: Lochrand, Blattstapel, Sternplakette, Stempeltitel mit rotem Versatz, harte Tintenschatten, Strahlen. Die Bildschirme sind dichter als D0, Elemente überlappen sich nicht. |
| Grundfarben | Tinte `#17140F`, Creme `#FBF5DD`, Blatt `#FFFDF5`, Gelb `#F9D84A`. Text-Rot `#B3321F` steht nur auf Creme. Signal `#FF3B1D` ist nur Fläche oder Schattenkante. Nebentext `#5C5444`, Erfolg `#12753C`. |
| 9 Familien | Grüßen `#FF6FAE` · Planen `#3B8CFF` · Kennen `#FFA41B` · Bluff `#7A3BFF` (weiße Schrift) · Kreativ `#17B3A3` · Vor Ort `#2DB35E` · Geschick `#FF3B1D` · Kartentisch `#0F5C3A` (weiß) · Rätsel `#26305F` (weiß). Jede Schriftfarbe erreicht mindestens 4,5:1 (5,2 bis 12,6). Die Familie steht immer auch als Wort da. „Eigene Karte“ ist Gelb mit Streifen. |
| Schrift | Anton für Titel und Zahlen (22/30/44/76 px, Versalien, 1–4 Wörter). Alle Sätze in Atkinson Hyperlegible Next (15/18/22 px). Titel sind nie kleiner als 14 px. |
| Große Schrift | `--scale` 1 / 1,2 / 1,4 über `[data-schrift]`. Die Größen-Tokens stehen auf `:root, [data-schrift]`, weil sie sonst den Wert von `:root` erben und nicht mitwachsen. Ab „Groß“ fällt der Stempelschatten weg, die Titeltafel wandert unter das Bild und die Regalreihen werden zu Listen. Bei „Sehr groß“ werden die Knopfreihen einspaltig. |
| Knöpfe | Der Hauptknopf ist mindestens 68 px hoch, Gelb auf Tinte mit einer 6 px hohen Signalkante. Nebenknöpfe sind 56 px hoch, Ziele mindestens 48 px, Antwortknöpfe 64–88 px. Zwei Wahlen stehen nebeneinander (`.row21` = 2/3 + 1/3), nie als zwei volle Balken übereinander. |
| Zustände | Hover hebt den Knopf an, Drücken lässt ihn sinken. Der Fokus ist ein Tintenring mit gelbem Hof. Gewählte Elemente sind invertiert (Gelb auf Tinte) und tragen ein Häkchen, nie nur eine andere Farbe. Ein gesperrter Knopf ist gestrichelt und sagt „Noch offen: …“. Beim Laden bleibt der Text stehen. Löschen braucht immer eine Rückfrage oder ein Rückgängig. |
| Thumbnail 16:9 | Das Bild hat keinen Text. Zuerst zeigt es den Startzustand des Spiels, später ein geprüftes KI-Bild (`thumb.src`). Die Titeltafel sitzt unten links (Anton 22, Gelb auf Tinte 13,1:1, −1,5°). Die Dauer steht oben rechts, die Familie optional oben links. Unter dem Bild stehen Familie und Spielweise als Text. Verboten sind Endstand, Zähler und Köder. |
| Bewegung | Abreißen 420 ms, Stempel 220 ms, Knopf 120 ms, Tür 600 ms, Strahlen 80 s pro Umdrehung. Die reduzierte Fassung blendet nur über; sie greift bei `prefers-reduced-motion` und beim Schalter „Ruhige Bewegung“. |

## 2. Bildschirme (52 Artboards)

Handy 390×844, eine Fassung in 360×780 mit Schrift „Groß“, Desktop 1280.

| # | Board | Inhalt |
|---|---|---|
| 1 | Main | Start als Abreißkalender. Blatt mit Datum, Plakette „Zu zweit 40 Sek“, 16:9-Bild und Stempeltitel. Pfeile „gestern“ und „morgen“ (Wischen geht auch). „Jetzt spielen“ neben „Erst üben“. Satzfeld. 6 Absichten (Grüßen, Planen, Spiele, Stimme & Ton, Eigene Karte, Alle Karten). AA-Knopf in der Kopfzeile. |
| 2–3 | Absicht, Familie | Absicht „Spielen“: Filter „Mit wem?“, darunter eine Regalreihe je Familie mit Kachel „Alle N zeigen“. Die Familie „Bluff & Taktik“ zeigt Kacheln in voller Breite. Der Weg Absicht → Karte → Los braucht 3 Taps. |
| 4 | Regal | Suche. Reiter Alle 64 / Von anderen / Letzte Tage. Filterchips nach Familie. Der Einstieg „Eigene Karte“ ist immer sichtbar. Darunter die Reihe „Von anderen“ mit „von Emre · geprüft“. |
| 5–6 | Start360, Desktop | Große Schrift auf 360 px. Desktop mit zwei Spalten, das Blatt steht links. |
| 7–9 | Editor, Teilen, Empfang | Die Karte ist die Fläche, darunter beschriftete Reiter (Text, Stil, Farbe, Sticker, Mit KI) statt Blasen. Teilen zeigt Kurzlink, Kopieren/Senden, ein Bild für den Status (9:16) mit Code und die Zeile „Wer sieht was?“. Empfang: „Von Mira, für dich“, Sprache und AA, „Antworten“ neben „Aufheben“, keine Daumen. |
| 10–12 | Meins, Verschickt, Mein Stil | Meins mit Gemacht / Verschickt / Gemerkt. Jede Kachel hat ein Menü „⋯“, nach dem Löschen erscheint „Rückgängig“. Verschickt zeigt Ablaufdatum und Status, Löschen fragt nach. Mein Stil: Name, Schrift in 3 Stufen, Einfache Sprache, Ruhige Bewegung, Ton, Konto mit „noch 3 übrig · kostet nie Geld“. |
| 13–14b | Geld einsammeln | Anlegen als Satz mit gelben Lücken (Wofür, Betrag ±, bis wann), PayPal oder Bar, Hinweis, was die Gruppe sieht. Der Empfänger sieht den Topf, wer dabei ist und zwei Schritte. Neu: Bildschirm „Hast du bezahlt?“ nach der Rückkehr von PayPal. |
| 15–18 | Mein Bote lügt | Spielweise vorgewählt (Per Link / Ein Handy / Üben), wechselbar bis zur ersten Ansage. Die Rolle wird mit Namen genannt. Eine Frage pro Bildschirm. Die Antwortknöpfe sagen „ehrlich“ oder „Lüge“. Abdecken beim Weitergeben. Der Prüfer hat „Glauben – Das stimmt“ und „Aufdecken – Das ist gelogen!“. Das Ergebnis zeigt Tabelle, „So zählt es“ und „Revanche“. |
| 19–20 | Flipper | Einstieg: Bild, Regelzeile, Wahl „Wie schnell?“ vor dem Start, „Gegen den Computer“ neben „Mit Freund, live“. Im Spiel: Punkte, Pause, zwei echte Tippflächen unter dem Feld (am Rechner Pfeiltasten). |
| 21 | Skat | Plätze, Reizen als ganzer Satz mit „Ja, 18“ und „Passe“, nächste Reizwerte, 10 Karten ohne Überlappung, Tischzeichen. |
| 22–24 | Adventstür | Gestalten mit Reitern Tür und „Hinter der Tür“. Die Vorschau folgt dem Reiter. Text mit Zähler, Farben mit Namen, Sticker. Die Nummer kommt aus dem Datum. Der Empfänger sieht die geschlossene Tür und darf sie jederzeit öffnen; offen zeigt sie „Tür zurück“. |
| 25–28 | Eigene Karte | Satz → Warten → Vorschau → Übernehmen. Arten mit Beispielen, Zähler „noch 3 übrig“. Beim Warten haken sich echte Schritte ab, es gibt keinen Prozentbalken. Verwerfen gibt die Karte zurück. Absage „Das kann ich noch nicht“ mit zwei Gegenvorschlägen „Das bauen ›“. |

## 3. Bewertung

Die Bildschirme wurden lokal als statisches HTML gerendert (Playwright, `scratchpad/dc-tools/render.js`). Fünf Subagenten ohne Vorwissen haben sie bewertet, mit gemeinsamem Auftrag und 10 Aufgaben:

- heuristische Evaluation nach Nielsen
- kognitiver Walkthrough für Lena (16) und Daniel (35)
- kognitiver Walkthrough für Dragan (60, Deutsch als Zweitsprache) und Hildegard (85, Zittern)
- Walkthrough für Thomas (52, Makuladegeneration, Rot-Grün-Schwäche, VoiceOver)
- Barrierefreiheit nach WCAG 2.2 AA mit axe-core über alle Dateien, nachgerechneten Kontrasten und gemessenem Fokus

Es gab 2 Runden.

### Runde 1: schwere Befunde (Schwere 3–4) und Behebung

| Befund | Quelle | Behebung |
|---|---|---|
| Unsichtbare Knöpfe „AA“ und „Aufheben“ auf dunklem Grund: Weiß auf Creme 1,01:1 (Schwere 4) | alle 5 | `.btn-2`, `.iconbtn.box` und `.chip` haben jetzt eine feste Tintenfarbe statt `inherit`. |
| Die Schrift ließ sich nicht finden („Mein Stil“) | Nielsen, alle Walkthroughs | AA steht auf Start und Desktop in der Kopfzeile. Mein Stil trägt den Untertitel „Schrift, Name, Konto“. |
| „Ein Handy“ ließ sich nicht wählen; Knopf „Verschicken“ im Ein-Handy-Ablauf | Nielsen, Walkthroughs | Die Spielweise steht sichtbar in Bote1 (vorgewählt, wechselbar bis zur ersten Ansage). Der Knopf nennt den Empfänger. |
| Nach PayPal fehlte „Ich habe gezahlt“; die Angst vor dem Geldknopf | Nielsen, Walkthroughs | Der Knopf heißt „PayPal öffnen · danach hier bestätigen“. Neuer Bildschirm Sammeln3 mit „Ich habe gezahlt“, „Noch nicht“ und „Nichts passiert“. |
| Link löschen ohne Schutz | Nielsen, Walkthroughs | Löschen ist ein abgesetzter Textlink. Die Rückfrage nennt die Folge („Karl kann das Spiel dann nicht mehr öffnen“). |
| Bei „Sehr groß“ verschwanden die Kacheltitel; der Hauptknopf lief über (feste Höhe); Reihen blieben mehrspaltig | WCAG | Die Tafel liegt ab „Groß“ unter dem Bild. Knöpfe nutzen `min-height`. Reihen werden einspaltig, Regalreihen zu Listen. |
| Die Auswahl war nur an Gelb gegen Creme erkennbar (1,28:1) | WCAG, Thomas | Gewählte Elemente sind invertiert und tragen ein ✓; das gilt für Chips, Segmente, Arten und Farbfelder. |
| Die Umschalter waren `span role=switch` ohne Namen | WCAG, Thomas | Jetzt `button role=switch` über die ganze Zeile, mit sichtbarem „An“ oder „Aus“. |
| `.seg` schnitt den Fokus ab | WCAG | `overflow:hidden` ist entfernt, die Ecken sind an den Kindern gerundet. |
| Flipper ohne Tastatur und Screenreader | WCAG, Thomas | Zwei echte Knöpfe mit Pfeiltasten. „Gemütlich“ bedeutet eine große, langsame Kugel. |
| Der Kartentitel stand in Creme auf Rosa (2,5:1) | WCAG, Thomas | Jetzt Tinte auf Rosa (7,1:1). |
| Regel von Bote zu schwer für Deutsch als Zweitsprache | Dragan | Einfache Sätze: „Du darfst lügen, aber nur nach oben. Karl rät: Wahrheit oder Lüge?“ |
| Wischreihen: Hildegard findet weitere Karten nicht | Hildegard | Jede Reihe endet mit einer Kachel „Alle N zeigen“. Bei großer Schrift ist es eine senkrechte Liste. |

Behoben sind außerdem Befunde der Schwere 2:

- Hover-Rot überschrieb die Knopfschrift.
- Fachwörter (Story, QR, Meme, Fähigkeit, Bot).
- Die Advent-Vorschau folgt jetzt dem Reiter, das Textfeld ist mehrzeilig.
- Die Bot-Stärke steht jetzt vor dem Start.
- X und Zurück sind einheitlich: ein Ablauf hat ein X, Navigation einen Pfeil.
- Der Zähler „noch 3 übrig · kostet nie Geld“ steht überall.
- Die Reiter-Semantik stimmt (`aria-selected`, Tabpanel, `nav` mit `aria-current`).
- Jeder Bildschirm hat ein h1, Status ist für Screenreader lesbar.
- Avatar-Initialen sind in Atkinson gesetzt (O sah aus wie 0).
- Der Ton „nur Familie“ für Lena ist entschärft (Platzhalter „Wer zahlt die Pizza?“).

### Runde 2 (Nachprüfung durch dieselben Kritiker)

| Kritik | Ergebnis |
|---|---|
| Nielsen | Die meisten Befunde der Schwere 2 und höher sind behoben. Neu kamen „Hier im Raum“ und „Ein Handy“ als uneinheitliche Begriffe, ein Moduswechsel mitten im Zug und ein überladener Knopf „Verwerfen“; alle drei sind danach behoben. |
| Lena/Daniel | 10 Befunde behoben, 6 teilweise, 0 offen. Zwei neue: die doppelte Bestätigung bei PayPal und der fehlende Ausgang auf Sammeln3; beide sind behoben. |
| Dragan/Hildegard | 15 behoben, 5 teilweise, 2 offen (siehe Lücken). Die neuen Überläufe bei „Sehr groß“ (Antwortknöpfe, Kopfzeile) sind behoben: 3 Spalten und eine Kopfzeile, die umbricht. Das X im Editor heißt jetzt sichtbar „Später“. |
| WCAG | 14 von 18 behoben, 4 teilweise. Neu waren die feste Höhe von `.iconbtn`, ein `button role=img` beim Skat und eine Liste ohne `li`; alle drei sind behoben. Ein inline gesetztes `overflow:hidden` auf `main` scrollt jetzt. |

Nach Runde 2 bleibt kein Befund der Schwere 3 oder 4. Was noch offen ist (Schwere ≤ 2 oder fehlende Bildschirme), steht in Abschnitt 4.

## 4. Nachtrag: Folgebildschirme, Dunkelmodus, Plattformen (Auftrag des Integrators)

22 weitere Artboards, in drei neuen Reihen auf derselben Canvas:

| # | Board | Inhalt |
|---|---|---|
| 29 | Treffer | Satzfeld → „Passt dazu“: der beste Treffer groß, 2 weitere, „Nichts dabei? Eigene Karte“. Der Satz bleibt auf dem Gerät. |
| 30 | Antwort | Antwort an Mira ist vorbereitet (Überschrift, Satz, Farbe, Foto), „Antwort schicken“, geht als Link zurück. |
| 31 | Gesendet | „An WhatsApp übergeben“. Ehrlich: Ob die Nachricht rausging, weiß nur WhatsApp; der Status „Geöffnet“ steht in Meins › Verschickt. |
| 32 | Schrift | „AA“ öffnet ein Fenster: 3 Stufen mit Beispielsatz in Originalgröße, Einfache Sprache, „Mehr in Mein Stil“. Auf dem Start trägt „AA“ die Beschriftung „Schrift“. |
| 33 | Anmelden | Eigene Karte ohne Konto: Grund in einem Satz, 3 Vorteile, Häkchen „16 Jahre oder älter“ (anfangs leer; „Anmelden“ bleibt gesperrt, bis es gesetzt ist), Anmeldedienst erklärt, „Ohne Konto: fertige Karten ansehen“. |
| 34 | EinladungenNach | Verschickt nach „Ja, löschen“: Eintrag weg, Meldung „Karl kann ihn nicht mehr öffnen“. |
| 35 | AdventTeilen | Nach „Türchen verschicken“: „Für wen?“ (steht auf der Tür), Kurzlink, Kopieren/Senden. Der Empfänger sieht „für Jonas“. |
| 36 | Gezahlt | Nach „Ich habe gezahlt“: Gisela steht als **gemeldet** auf der Liste (gestrichelt, ohne Haken), der Topf zählt erst nach Daniels Haken. „Meinen Namen wieder entfernen“. |
| 37 | SammelnBar | Barzahlung: 3 Schritte; „Gisela · bar, noch offen“ → nach Daniels Haken „✓ Gisela · bar“. |
| 38–41 | Bote, Modus „Ein Handy“ | Abdecken vor dem ersten Zug („Gib das Handy an Mira, Karl schau weg“, Namen ändern) → Mira sagt an → Weitergeben (Board 16) → Karl prüft („Ein Handy · Karl ist dran“) → Ergebnis für beide, Revanche „jetzt ist Karl Bote“. Jeder Übergabe-Bildschirm hat ein X. |
| 42 | FlipperEnde | „Du gewinnst!“, Du 5 : Computer 3 (du immer links), Zeit, Tempo, längster Ballwechsel. „Revanche“ neben „Fordern per Link“; die eigene Runde wird aufgezeichnet. |
| 43 | FlipperRuhig | Tempo „Gemütlich“ für zitternde Hände: Zeitlupe 50 %, 2 Tasten von 177×150 px unter dem Feld, die Seite, auf die die Kugel zukommt, ist markiert, Doppeltippen zählt einmal, der Flipper bleibt oben, solange man drückt. FlipperStart sagt ehrlich: mit Sprachausgabe nicht spielbar; ohne Zeitdruck Skat oder Bote. |
| 44–46 | Dunkelmodus | Start, Regal, Karte anpassen. Tinte und Creme tauschen die Rollen, Gelb bleibt Marke, der Hauptknopf wird Tinte auf Gelb, harte Schatten werden schwarz. Der **Karteninhalt wird nicht umgefärbt**: Die Vorschau zeigt, was der Empfänger sieht. `view.js` setzt `data-theme` nach System und Mein Stil. |
| 47–50 | iOS und Android | Start und Teilen mit Systemleisten. iOS: Dynamic Island, Home-Leiste, Wischen vom Rand für Zurück (im Spiel gesperrt, Zurück = Pause), System-Teilen mit Personen, Apps, Kopieren und Bild sichern. Android: edge-to-edge, Gesten-Leiste, Predictive Back schließt zuerst die oberste Ebene, Android-Sharesheet mit Direct Share und Kopieren als Chip. |

**Eigene Karte, geprüft im Server** (`CADS-DEMO-wrapper/lib/duell-absage.mjs` @3d076e6, `duell-ai.mjs` @aa8ab0e):
- Eine Absage kommt aus einer festen Tabelle. Sie kostet nichts und zählt nie als Verstoß (Strike). Sie hat **höchstens einen** Gegenvorschlag. Die Canvas zeigt deshalb nur einen Gegenvorschlag; vorher waren es zwei.
- Gegenvorschlag „katalog“: Er öffnet eine fertige Karte und kostet nichts.
- Gegenvorschlag „genre“: Er bringt einen festen Beispielsatz, der wie ein neuer Wunsch gesendet wird und dann normal 1 Einheit kostet. Die Canvas zeigt diesen Fall („Diesen Vorschlag bauen lassen · braucht 1 von deinen 3“), mit dem echten Satz für „Autorennen“ aus der Tabelle.
- Nach 3 Absagen pro Tag (`DUELL_CREATE_BLOCKS_PER_DAY`) geht es erst am nächsten Tag weiter. Das steht auf FreiAbsage.
- „Verwerfen“ gibt die Einheit nur zurück, solange die Quittung gilt, und nur `refundsLeft`-mal pro Zeitraum (die Hälfte des Topfs). Die Canvas nennt deshalb das Datum aus `meter.resetAt` („noch 2-mal bis 1. Dezember“).
- „Abbrechen“ beim Warten gibt die Einheit zurück. Das hat der Integrator laut altem `create-ui.js` bestätigt.

## 5. Bewertung Runde 3 (drei neue Kritiker ohne Vorwissen, alle 52 Bildschirme)

- Nielsen mit Schwerpunkt Konsistenz, Plattformtreue und Dunkelmodus.
- Walkthrough mit 5 Personas (16, 35, 60 mit Deutsch als Zweitsprache, 85 mit Zittern, 52 mit Makuladegeneration und VoiceOver), 11 Aufgaben.
- WCAG 2.2 AA: axe über 62 Dateien, nachgerechnete Kontraste auch im Dunkelmodus, Tab-Durchlauf, Textabstände nach 1.4.12, Zielgrößen.

### Schwere 3 und Behebung

| Befund | Behebung | Nachprüfung |
|---|---|---|
| Alters-Häkchen vorausgefüllt, ohne Fokus und ohne Zustand | Echte Checkbox, anfangs leer, Fokusring über `:has(:focus-visible)`, ✓ über `:checked`, „Anmelden“ gesperrt mit „Noch offen“ | behoben |
| Gezahlt: selbst gemeldete PayPal-Zahlung zählte schon als bezahlt | „gemeldet“ gestrichelt, Topf zählt erst nach Daniels Haken, wie bei bar | behoben |
| Bei „Sehr groß“ wuchsen Inline-Texte nicht mit | Alle Inline-Größen der Artboards rechnen jetzt `calc(Npx * var(--scale))` | behoben |
| Anmeldung auf fremder Domain (bunsenbrenner.org) wirkt wie Phishing | Erklärt als „unser Anmeldedienst, dort steht oben My Daily Idea“ | teilweise, jetzt Schwere 2 (siehe offen) |
| Kartenvorschau schnitt bei Textabständen nach 1.4.12 den Satz ab | Die Karte wächst mit (`aspect-ratio` als Untergrenze, kein `overflow:hidden`) | behoben |

### Schwere 2: behoben

- **Begriffe:** „Merken“ statt „Aufheben“. „Selbst eine Tür schicken“. „Warteschlange geschafft“. „Diesen Vorschlag bauen lassen“. „Aufzeichnung“ statt „Geist“ beim Flipper. „Computer“ statt „Bot“. „Tempo“ durchgehend. „Skat“ ohne „live“. „Mein Stil & Konto“.
- **Abläufe:** Die Übergabe-Bildschirme haben ein X. „Zug abschicken“ vor der Wahl des Mitspielers. Namen bei „Ein Handy“ sichtbar und änderbar.
- **Flipper:** Du steht immer links. FlipperRuhig hat den Ton-Knopf zurück. Ehrlicher Hinweis zu VoiceOver.
- **Dunkelmodus:** Die Vorschau färbt den Karteninhalt nicht mehr um.
- **Eingaben:** Den Betrag kann man eintippen, dazu Schnellwahl 5/10/20/25 €. „Dein Satz“ ist mehrzeilig. „⋯“ ist 48 px groß.
- **Barrierefreiheit:**
  - Label in Name stimmt bei den Ansagen („3 – Lüge“).
  - Regal: Reiterbereich liegt im Hauptbereich.
  - Advent-Umschalter als `aria-pressed`, Editor-Reiter mit `aria-controls`.
  - `autocomplete` an den Namensfeldern, Ton-Knopf mit Zustand.
  - Teilen-Vorschau in Tinte auf Rosa.
  - „Namen ändern“ in Weiß auf Violett (5,4:1).
- **Sehr groß:** Die Plakette überlappt das Datum nicht mehr (die Datumszeile bricht um). Regel für `view.js`: Die Aktionsleiste unten bleibt stehen (`.actions`, sticky).

Nach Runde 3 und der Nachprüfung bleibt **kein Befund der Schwere 3**. Neue Befunde der Schwere 3 gibt es nicht.

## 6. Offene Punkte (Schwere ≤ 2, Entscheidung oder Umsetzung)

1. **Anmelde-Domain** bunsenbrenner.org: Das ist eine Produktentscheidung. Entweder eine Domain mit dem App-Namen oder das Logo von My Daily Idea auf der Keycloak-Seite (siehe Strang `mdi-login-theme`).
2. **Empfangs-Vorlage:** Empfang hat Sprache, „Was ist das?“ und einen Weg in die App. AdventZu, AdventAuf und Sammeln2 bekommen in der Umsetzung dieselbe Kopf- und Fußzeile.
3. **Wischreihen bei normaler Schrift** (Absicht, Regal): Das ist gewollt, für Dichte und das Regal-Bild. Jede Reihe endet mit „Alle N zeigen“, ab „Groß“ wird sie zur Liste. Bei Testnutzern über 80 nachprüfen.
4. **Begriffe beim Link-Erzeugen:** „Fertig, Link machen“, „Türchen verschicken“ und „Link für die Gruppe“ sind Verben der jeweiligen Karte (Regel „Hauptknopf mit dem Verb der Karte“). Der Teilen-Bildschirm ist einheitlich.
5. **Löschmuster:** Links auf dem Server werden mit Rückfrage gelöscht (danach kein Rückgängig), Lokales in Meins mit „Rückgängig“. Das ist bewusst und steht im Design-System.
6. **Ergebnistabelle Bote** bei 1.4.12: Sie steht in einem scrollbaren, fokussierbaren Bereich. Eine Alternative wäre eine Liste je Karte.
7. **Kleine Textlinks** (18–20 px) erfüllen AA, aber nicht AAA. Rückgängig-Links sollen in der Umsetzung als `btn-2 quiet` mit 48 px Höhe kommen.
8. **„Geist“** steht im festen Gegenvorschlag des Servers (`duell-absage.mjs`). Ändern müsste es der Server-Text, nicht der Client.
9. **Inline-Pixelgrößen** in den Artboards skalieren jetzt. `view.js` soll trotzdem nur die Tokens `--t-*` und `--d-*` nutzen.
10. **Nicht prüfbar:** Blitze im laufenden Spiel (2.3.1). Ob die Apps die Systemschrift übernehmen (Dynamic Type, Android-Skalierung). Echte FLUX-Bilder.
11. **Die Canvas ist privat.** Der User muss sie über „Teilen“ freigeben.

## 7. Gate C: Abnahme mit Auflagen, Blasen, Flipper, alle Spiele (Canvas Version 52)

Der User hat die Canvas abgenommen („Design ist gut, ich denke damit koennen wir starten“). Danach kamen Auflagen und Rückmeldungen. Sie sind hier in der Reihenfolge der Veröffentlichung umgesetzt. Die Blasen kamen zuerst (Version 50), alles andere danach (Version 52). Die Canvas hat jetzt 88 Bildschirme.

### 7.1 Blasen zurück (Version 50)
- **Warum sie fehlten:** In der ersten Phase-C-Fassung habe ich Befund 6.1 aus `13-produktverstaendnis` umgesetzt: „Blasen verdecken Text und Spielhandlung“. Dafür habe ich die Blasen durch eine beschriftete Reiterleiste unter der Karte ersetzt. Das war falsch verstanden. Gemeint war, dass Blasen weder Text noch die Spielhandlung verdecken dürfen, nicht dass sie verschwinden. Blasen sind ein festes Produktmuster für alle Karten und alle Spiele, auch in `apps/mdi` (`src/ui/view.js` `bubbleLayer`, `tokens.css` `.bubble`).
- **Jetzt:** Jedes anpassbare Teil trägt am Rand seines Teils eine Blase (`.blase`): gelbe Pille mit ✎, mindestens 44 px hoch, 3 px Tinte, Schatten 0 3px. Die Blase „Mit KI“ ist türkis mit ✦. Antippen öffnet genau dieses Feld (`aria-expanded`). Die geöffnete Blase ist invertiert, darunter steht nur das Feld dieser Blase mit „Würfeln“ und „Übernehmen“. Blasen liegen auf Bildfläche oder auf dem Kartenrand (32–38 px außerhalb), nie auf Text.
- **Boards:**
  - Karte anpassen (hell und dunkel): Titel, Mit KI, Sticker, Farbe, Satz, Unterschrift
  - Antwort: Titel, Bild, Farbe, Satz, Foto
  - Adventstür: Text, Tür, Farbe, Sticker, Mit KI
  - Geld einsammeln: Topf, dazu die gelben Lücken im Satz
  - Mein Bote lügt: Farbe, Kartenrücken
  - Flipper: Spielfeld, Farben, Eigenes Foto, Regeln
  - Vorschau der eigenen Karte: Titel, Bild, Fragen
  - jedes neue Spiel (siehe 7.4)

### 7.2 Gate-C-Auflagen
- **„Neu erfinden“:** ein eigener großer Block direkt unter der Tageskarte und unter „Jetzt spielen / Erst üben“. Er verdrängt den Hauptknopf nicht.
  - Gestaltung: Türkis der Kreativ-Familie (Tinte auf Türkis 7,0:1), Titel in Anton mit ✦.
  - Text: „Aus einem Satz wird eine ganz neue Karte oder ein ganz neues Spiel.“
  - Mehrzeiliges Feld „Beschreib deine Idee in einem Satz“, roter Knopf „Erfinden ›“ (Tinte auf Rot 5,2:1), Zeile „Karte, Spiel, Quiz oder Witzbild · ab 16“.
  - Umgesetzt auf hell, dunkel, iOS, Android, 360 px und Desktop. Die Abläufe heißen jetzt ebenfalls „Neu erfinden“.
  - Die frühere Absicht „Eigene Karte“ ist durch „Suchen“ ersetzt. Die Startseiten sind als ganze Seite gezeichnet (1160 px), damit der Block vollständig zu sehen ist.
  - In Runde 4 waren Warnstreifen und Gelb zu nah am Hauptknopf. Deshalb wurde der Block türkis und hat keine Streifen mehr.
- **„Mein Regal“ statt „Meins“:** in Navigation, Überschriften, Reitern, Texten und Hinweisen, mit Regal-Symbol (Bretter mit Büchern). Aus „in Meins“ wurde „in deinem Regal“.

### 7.3 Flipper zurück zur früheren Gestaltung
- **Vergleich der Fassungen:**
  - Runde 1 (vom User gemocht): dunkle Bühne, Spielfeldbild, eine Regelzeile, zwei gleich starke große Knöpfe nebeneinander („Gegen den Bot“ gelb, „Live mit Freund“ rot), unten nur „Aussehen“ und „Ton“.
  - Runde 2 und 3 haben dieses Bild verwässert:
    - Tempo-Wahl („Gemütlich/Normal/Schnell“) über den Knöpfen
    - Live-Knopf als weißer Nebenknopf
    - umrandeter Hinweiskasten zur Sprachausgabe
    - im Spiel gelbe Tastenleiste „◀ LINKS / RECHTS ▶“
    - „Fordern“ als weißer Nebenknopf
  - Unverändert blieben Farben, Bühne und Spielfeld.
- **Jetzt:**
  - Standard ist wieder das Bild aus Runde 1, mit „Gegen den Computer“ in Gelb und „Per Link“ in Rot.
  - Im Spiel ist die Leiste wieder zurückhaltend gestrichelt („LINKS TIPPEN / RECHTS TIPPEN“).
  - Am Ende stehen zwei gleich starke Knöpfe: „Revanche“ in Gelb, „Fordern“ in Rot.
  - Die Hilfen für zitternde Hände (große Tasten, Zeitlupe 50 %, Schutz vor Doppeltippen) sind ein schlanker Schalter „Gemütlich spielen“ über den Knöpfen, ab Werk aus. Board 43 zeigt, wie es eingeschaltet aussieht.
- **Alte App:** `arcade-ui.js` und `arcade.json` (Tag `pre-legacy-removal`) zeigen Flipper in derselben Arcade-Ebene wie Stangen-Kick [47b]: dunkle Ebene, Spielfeldbild, eine Regelzeile („Tipp links oder rechts: die Klappe schlägt. Lass den Ball nicht durch die Lücke.“), „GEGEN DEN BOT“ gelb und „LIVE GEGEN FREUND“ rot, dort übereinander. **Die Fassung aus Runde 1 kommt dem, was der User mochte, am nächsten:** Sie übernimmt genau diese alte Arcade-Ebene, nur mit den Knöpfen nebeneinander. Die Fassung aus Runde 3 hatte sich davon entfernt.

### 7.4 Alle Spiele ergänzt (36 Boards)
Für jedes Spiel gibt es Start mit Blasen, im Spiel, Ende (390 px) und Desktop (1280 px), alle nach demselben Muster:
- Kopf in der Familienfarbe und dunkle Bühne
- Spielfeld mit 4 Blasen
- Regelzeile, Schalter „Gemütlich spielen“
- links Gelb (ohne Link: Computer, allein oder hier im Raum), rechts Rot (Per Link); „Hier im Raum“ als dritter Textlink, wo es ihn gibt
- im Spiel: Pause/Beenden, Spielstand oder Kennzahlen, Ton, große Steuerung unten; immer auch eine Bedienung ohne Wischen
- Ende: Ergebnis, 3 Kennzahlen, „Nochmal/Revanche“ gelb und „Fordern“ rot

| Spiel | Besonderheit |
|---|---|
| Lava-Flug (Flappy-artig) | „Bau dein Lava-Level“ mit Reglern für Schwerkraft, Sprung, Lücke und Tempo, Varianten (Klassisch, Mond, Unterwasser, Nacht), gegen den Computer oder per Link gegen die eigene Aufnahme (das Geist-Duell, im Text „Aufnahme“) |
| Dach-Lauf | Tippen springt, langes Drücken springt weit; Meter und Münzen |
| Arcade | Auswahl aus 10 Spielen (Stangen-Kick, Elfer, Ziegel, Panzer, Eis-Stock, Puck, Volley, Flipper, Schnee, Murmel); im Spiel ◀ KICK ▶ als Tasten, Ziehen geht zusätzlich |
| Dart (Bert) | Scheibe mit Zahlen und Ringen; Varianten 301 Einsteiger, 301 mit Doppel am Ende, Rund um die Uhr, Cricket; Werfen über die Stärke SANFT, MITTEL oder FEST, Ziehen geht zusätzlich; Anzeige „Rest“ |
| Mal & Rat | Stufe statt Lösungswort am Start; im Spiel „nur du siehst: REGENBOGEN“; Stiftfarben und Radierer |
| Quiz „Was kostet das?“ | Fragepakete, 4 große Antworten |
| Bauernskat / Skat / Doppelkopf | Wahl der Spielart (2/3/4 Spieler), gegen Bert (Computer) oder per Link |
| Beat bauen | Raster aus 4 Instrumenten und 8 Schlägen, Spielen / Rückgängig / Fertig, weitergeben per Link |
| Pizza-Rettung (vom Baukasten neu erzeugt) | Herkunft „Neu erfunden aus dem Satz …“, Hinweis „KI-Spiel · geprüft“, Blase „Satz“ (✦) |

### 7.5 Runde 4 (Nielsen und Ingrid, 74, ohne Vorwissen) und Behebung
| Befund | Schwere | Behebung |
|---|---|---|
| Dart und Arcade nur mit Wischen bedienbar | 4 | Tasten-Steuerung in jedem Spiel (Dart: Stärke antippen und Werfen; Arcade: ◀ KICK ▶), Wischen bleibt als zweiter Weg |
| „Gemütlich“ nur beim Flipper und dort versteckt | 3 | Schalter „Gemütlich spielen“ auf jedem Spielstart direkt über den Knöpfen |
| Dart: Scheibe ohne Felder, Fachwörter, Anzeige „141 : 180“ wirkte verkehrt herum | 3 | Zahlen und Ringe, Varianten auf Deutsch, Anzeige „DU · REST / BERT · REST“, Ende „Dreifach-20 = 60“ |
| Flug ohne „Gegen den Computer“, Wort „Geist“ unklar | 3 | „Gegen den Computer“ / „Per Link (gegen deine Aufnahme)“; „Geist“ steht nur noch im festen Server-Text (siehe 6.8) |
| Rolle der beiden Knöpfe von Spiel zu Spiel anders | 3 | Feste Rollen: Gelb ohne Link, Rot „Per Link“ |
| Mal & Rat zeigte das Lösungswort am Start | 3 | Stufen ohne Wort; das Wort sieht nur, wer malt |
| Blase „Spiel: Doppelkopf“ widersprach der Auswahl | 3 | Blase heißt „Spielart“ |
| Abgeschnittene Wörter auf Knöpfen am Ende | 3 | kürzere Wörter („Fordern“), Schrift 24 px |
| Zweimal „Fertig“ im Editor; „Fertig“ im Dunkelmodus schlecht lesbar | 2 | Das kleine heißt „Übernehmen“, `.btn-2.gelb` hat immer Tinte als Schrift |
| Titel-Blase berührte „DANKE“ | 2 | Blasen am oberen Rand 38 px außerhalb der Karte |
| Antwort hatte doppelte Wege („Andere Farbe“ neben der Blase) | 2 | Doppelte Knöpfe entfernt, Feld heißt „Titel“ |
| Vorschau: Blasen und der Satz „nach dem Übernehmen ändern“ widersprachen sich | 2 | Satz gestrichen |
| Doppelpunkt auch bei Werten, die kein Spielstand sind | 2 | Doppelpunkt nur bei Spielständen, sonst „·“ |
| Start360: „Mein Stil“ verschwand | 2 | Kopfzeile bricht um |

**Offen (Schwere ≤ 2):**
- Beat: Zeilen beschriften.
- Bauernskat: offene Karten mit Werten zeichnen.
- Kartenwerte im Spielbild sind Platzhalter.
- Lava-Flug: Regler zusätzlich mit −/+.

**Abstimmung mit Strang L:**
- **Varianten-Chips beim Lava-Flug:** Klassisch = spiel-lava, Mond = spiel-mond, Unterwasser = spiel-tiefsee, Nacht = spiel-geist. Die übrigen 12 Varianten bleiben im Regal.
- **Regler-Wörter:** Es gelten die Stufennamen aus dem Altcode (Schwere: Mond … Jupiter; Lücke: sehr eng … sehr weit), dazu −/+ als Tipp-Alternative und `aria-valuetext`.
- **Wortwahl:** „Geist“ steht nirgends als Bedienwort, die Oberfläche sagt „Aufnahme“.
