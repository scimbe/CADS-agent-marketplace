# Design Phase C: Design-System und Bildschirme (Strang D)

Stand 2026-11-12. Vorlage für Gate C und für Strang H (`view.js`, `tokens.css`).

- **Canvas (Claude Design):** https://claude.ai/artifact/A1TeNNzXLAPbAMa9WS55ux. Der Link ist privat und muss vom User geteilt werden, bevor andere ihn öffnen können.
- **Tokens als CSS-Vorschlag:** `04-ux/tokens-phase-c.css`. Teil 1 enthält die Tokens, Teil 2 die Bausteine, Teil 3 die Motive, die nur auf der Canvas gebraucht werden.
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

## 2. Bildschirme (30 Artboards)

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

## 4. Offene Punkte

1. **Fehlende Bildschirme:** Das sind Folgezustände, keine neuen Muster.
   - Treffer nach dem Satzfeld („Passende Karten“)
   - Antwort nach „Antworten“
   - Bestätigung nach dem Senden und nach „Ich habe gezahlt“
   - Empfängersicht bei Barzahlung
   - Bote1 und Bote2 komplett im Modus „Ein Handy“
   - Ende beim Flipper
   - Was „AA“ öffnet (Vorschlag: ein kleines Auswahlfenster mit den 3 Stufen)
   - Anmeldung ohne Konto bei „Eigene Karte“
   - Liste „Verschickt“ nach dem Löschen
   - Schritt nach „Türchen verschicken“ (Vorschlag: der Teilen-Bildschirm wird wiederverwendet)
2. **Inline-px in den Artboards:** Die Mockups setzen viele Schriftgrößen inline in px. In `view.js` gelten nur die Tokens `--t-*` und `--d-*`.
3. **Flipper mit Zittern:** „Gemütlich“ hilft, aber Echtzeit bleibt schwer. Zu prüfen ist eine Hilfe, die nach Runden spielt.
4. **Annahmen zum Server, die Strang K prüfen muss:** Gibt „Abbrechen“ beim Warten die Einheit zurück? (So zeigt es der Entwurf.) Kosten die Gegenvorschläge der Absage 1 Einheit?
5. **Der 4-Farben-Satz beim Skat** ist als Option in „Mein Stil“ angedacht, aber nicht gezeichnet.
6. **Nicht geprüft:** Dunkelmodus, iOS und Android nativ, echte Bilder (FLUX). Die Motive auf der Canvas sind gezeichnete Platzhalter für textfreie Thumbnails.
7. **Die Canvas ist privat.** Der User muss sie über „Teilen“ freigeben.
