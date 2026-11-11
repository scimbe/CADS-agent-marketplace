# 13 – Produktverständnis: der alte Client aus Sicht der Nutzenden

Ziel: Das alte Produkt so verstehen, wie es sich bedienen lässt, damit der Neubau die **ganze Vielfalt behält** und nur
die **Benutzerführung ordnet und zusammenfasst**. Auftrag des Nutzers (sinngemäß): nicht vereinfachen, sondern die Vielfalt
besser strukturieren. Regal und Archiv der versendeten Links gab es. Das alte Design passte in Teilen gut zur Zielgruppe,
das neue soll interessanter werden. Ergänzt um die Kritik des Nutzers an der D0-Bluff-Karte: „wenig intuitiv und inklusiv,
eigentlich schlechter als bisher“ (Abschnitt 6).

Dieses Dokument ergänzt das Inventar `12-paritaet.md` (Was gibt es?) um die Frage, **wie es sich nutzt**. Was dort steht,
wird hier nicht wiederholt.

**Quellen (nur gelesen, nichts geändert)**
- `alt:` = CADS-agent-marketplace, Tag `pre-legacy-removal`, `apps/duell-web/` (z. B. `alt:src/app.js:371`). Die Zeilen
  beziehen sich auf den Export dieses Tags.
- `d0:` = `apps/mdi` auf `origin/main` @ `9a80c87` (z. B. `d0:src/ui/view.js:140`).
- Entwurfsunterlagen im Scratchpad (nicht im Repo): `konzept2/` mit Endbericht, `design-briefs.md`, `kritik-1…5.md`,
  `personas/personas.json` mit 8 Personas zwischen 17 und 79 Jahren, `personas/BEFUNDE.md` sowie die freigegebene Design-Canvas
  `design-canvas/project/*.dc.html` (5 Boards: „Start: Absicht statt Menü“ … „Empfang: Antworten zuerst“).

**Methode.** Den alten Client mit seinem eigenen `scripts/build.js` gebaut (Kern 698 KB, Teile 1,7 MB, dazu der Flavor
`business`). Ihn dann lokal über `http://127.0.0.1` mit Playwright 1.56.1 und Chromium-Headless-Shell 1243 bedient. Das
Netz war gesperrt: Jede Anfrage an einen anderen Host wurde abgebrochen, deshalb gibt es weder Kurzlinks noch KI, Deck oder
Login. Bildschirmgröße 390×844 (DPR 2), einige Aufnahmen bei 1280×800. D0 wurde zum Vergleich genauso gebaut und bedient.
Skripte: `scratchpad/alt-tools/shoot.js` und `d0shoot.js`. Das Protokoll mit den sichtbaren Texten jedes Schritts liegt in
`alt-shots/log.txt`.

**Screenshots:** `/private/tmp/claude-502/-Users-dev-claude-workspace-Praktikum-RN-ITS-BOARD/3812bc6a-ee0c-420e-9db1-ce45770241b4/scratchpad/alt-shots/`
(im Folgenden `[NN]`, Index im Anhang).

---

## 0. Kurzfassung: die größten Erkenntnisse

1. **Das Produkt ist ein Abreißkalender und kein Regal.** Die Startseite ist ein Kalenderblatt mit Lochrand, großem Datum
   und einem Stapel Blätter darunter. Wischen reißt das Blatt ab, der nächste Tag kommt mit einem Reißgeräusch und einer
   Vibration (`alt:src/app.js:385-438`, `alt:src/style.css:19-39`, [01], [04]). Alle sehen am selben Tag dieselbe Karte
   (`alt:src/daily.js:109-132`). D0 hat davon nichts: Dort steht „HEUTE“ über einer fest einprogrammierten Reihenfolge
   (`d0:src/cards/index.js:9` `ORDER = ["gruss","bluff"]`, [90]).
2. **„Die tägliche Idee“ heißt: eine Karte am Tag zum Weitermachen, nicht zum Konsumieren.** Die Paketbeschreibung lautet
   „taegliche Remix-Idee“ (`alt:package.json`), der Standardknopf „Mach's zu deinem“ (`texts.json go`). Wer per Link etwas
   bekommt, liest „Geschickt bekommen. Mach deins draus.“ Jedes Werk trägt eine Spur, wer was geändert hat
   (`alt:src/app.js:493-496`).
3. **Es gab sechs Wege in den Katalog, die sich überschneiden:** Tagesblatt, Absicht (Satz oder Kachel), „Alle Karten“,
   „N Spiele zu zweit und mehr“, „Letzte Tage“ mit Suche und „Selber bauen“. Dazu kommen die freie Karte und der Ticker
   „Mehr von bunsenbrenner“. Genau hier lohnt sich das Zusammenfassen, ohne dass eine Fähigkeit verloren geht (Abschnitt 4).
4. **Regal und Archiv gab es, aber versteckt.** „Meine Wand“ hat zwei Reiter: Wand (fertige und gemerkte Werke, Rückgängig
   6 s) und „Einladungen (n)“, also jeder auf diesem Gerät angelegte Kurzlink mit Bild, Ablaufdatum, „Teilen“ und „Löschen“
   (`alt:src/app.js:892-968`, [10], [11]). Erreichbar war das nur über einen unterstrichenen Textlink ganz unten auf der Startseite [02].
5. **Das Adventstürchen ist eine Karte, die die Nutzenden selbst gestalten.** Text, Stil, Farbe und Sticker-Set „Advent“
   werden frei gewählt. Die Nummer kommt aus dem Datum (1–24 im Dezember, sonst 1), verschickt wird per Link. Der Empfänger
   sieht eine geschlossene Tür „Tippen zum Öffnen“. Sie ist nie gesperrt, wer früh öffnet, erfährt nur, für welchen Tag sie
   gedacht war (`alt:src/daily.js:321-322`, `alt:src/door.js:1-11`, [61], [62]). Die Variante mit 24 Türen (`zug-advent`) war
   eingeklappt.
6. **Die Designsprache passte zur Zielgruppe, weil sie zwei Welten verbindet:** ein Papierkalender, den 70- bis 85-Jährige
   kennen, und Meme-Ästhetik für 16-Jährige (Anton-Versalien, Sternplakette „Per Link 40 Sek“, harte Schatten, Stempel-Animation).
   Abgesichert ist sie durch Mindestgrößen und Kontrastregeln (Abschnitt 3).
7. **Schwach war die Dichte, nicht die Sprache:** rund 25 Bedienziele auf der Startseite, fünf Blasen über der Tageskarte [01],
   „Alle Karten“ als 64 Textzeilen (3968 px) **vor** den 64 Bildkacheln [07], [08b], und Vorschaubilder, die den
   **Endstand** zeigen („UNENTSCHIEDEN“, „KREIS GEKNACKT!“) statt den Anfang [08b].
8. **Die Vielfalt in Zahlen:** 64 Regalkarten (52 Zug-Karten, 5 Arcade, 2 Tisch, je 1 Flug, Meme, Beat, Quest, Grußkarte),
   84 eingeklappte Varianten und 8 Business-Karten. Die Zug-Karten waren schon nach Situation gruppiert („grip“): abends im
   Chat 15, Pause oder Bus 13, für jemanden, der es verdient hat 11, alle im selben Raum 7, wenn ihr euch nicht einig seid 6.
9. **Wo D0 das Produkt falsch verstanden hat:** Kalender, Tageslogik, Absichten, Wand, Einladungen, Bilder, Schriftgröße,
   einfache Sprache und Sprachwahl fehlen. Bei Zwei-Personen-Spielen setzt D0 eine **Modus-Abfrage vor das Spiel** („Wie spielst
   du?“ mit 4 Optionen, [91]), wo das alte Produkt einen sinnvollen Standard hatte (per Link) und die Alternative erst anbot,
   wenn sie gebraucht wurde („Selbes Handy: weitergeben“ nach dem eigenen Zug, [33]). Im Modus „Ein Gerät“ zeigt D0 die
   geheimen Karten des Boten sofort nach LOS, ohne „gib weiter, die anderen schauen weg“ [92] (Abschnitt 6).
10. **Das alte Produkt war aber auch nicht vorbildlich.** Beim alten Bluff liegt die erste Handlung hinter einer Blase „Zug“
    [31], [32a], die Rollen „Bote“ und „Prüfer“ werden nie genannt, und das Ergebnis „9 zu 9“ sagt nicht, wer welche 9 hat [37].
    D0 ist hier besser: Es nennt die Rollen beim Abdecken und erklärt am Ende die Wertung [94], [96]. Der Neubau muss das
    Beste aus beiden zusammenführen (Muster in 6.4).

---

## 1. (a) Navigationskarte: Informationsarchitektur, wie sie wirklich war

### 1.1 Bildschirme
Fünf Vollbilder, von denen immer genau eines sichtbar ist (`alt:src/app.js:36-41` `show()`), dazu Ebenen darüber:

| Bildschirm | Template | Inhalt |
|---|---|---|
| `home` | `alt:src/index.template.html:17-43` | Kalenderblatt (Tageskarte oder empfangene Karte), Hauptknopf, Block der freien Karte, Startbox mit den Absichten, Werkzeugzeile |
| `editor` | `:45-54` | Karte groß mit **Blasen** (Titel, Zug, Farbe, Mit KI, Würfel …), darunter eine Zeile „Noch offen: …“ und der Hauptknopf |
| `done` | `:56-66` | „Fertig. Wer bekommt sie?“, Bild, TEILEN, unter „Mehr“ Status- und Story-Bild, Speichern, Weiter ändern, Zum Kalender, Konto-Angebot |
| `shelf` | `:68-71` | **Ein** generischer Listenbildschirm für alles: Alle Karten, Spiele, Letzte Tage, Selber bauen, Meine Wand, Mein Stil, „Deine Karte“, freie Karte |
| `game` | `:73-86` | Flug- und Lauf-Engine mit HUD, Ergebnis und Herausforderung |
| Ebenen | – | `.liveov` (Arcade- und Tischmenü, Live) [47b], [49b], [58b] · `#door` (Adventstür) [62] · `#cosheet` (Zusammen bauen) · Blasen-Dialog [32a] · Melden-Dialog |

### 1.2 Startseite von oben nach unten (390×844) [01], [02], [03]
1. Kopfzeile: Marke „MY DAILY IDEA“ (Anton, um −1,5° gedreht), Sprache `DE`, Ton, Emoji für „Mein Stil“ (`:21`).
2. **Kalenderblatt** `#leaf`: Tag „11“, „NOV / MITTWOCH“, Sternplakette mit Art und Dauer („Bild 20 Sek“, „Per Link 40 Sek“,
   `alt:src/app.js:69-70`), Vorschau (Spiel live, Karte gezeichnet, Screenshot oder KI-Bild), Titel als Stempel, Unterzeile,
   Daumen, und auf der Tageskarte **Blasen** (Look, Farbe, Titel, Mit KI, Magie) sowie „Look würfeln“ (`alt:src/start-ui.js:294-302`).
3. **Hauptknopf** je Art: „MEME BAUEN“, „LOS, DU FÄNGST AN“, „LOSFLIEGEN“, „TISCH AUFMACHEN“, „TON BAUEN“, „KARTE MACHEN“
   (`texts.json go_*`, `alt:src/app.js:94`).
4. **Freie Karte** (roter Block): „DEINE IDEE. DEINE KARTE.“, Chips Karte/Meme/Spiel/Quiz, „ERSCHAFFEN“ (`:37`, `alt:src/app.js:268-303`).
   Er erscheint nur auf der Tageskarte, nicht beim Empfang.
5. **Startbox** (cremefarbenes Blatt): „WEM WILLST DU HEUTE EINE FREUDE MACHEN?“, Satzfeld (Mikrofon nur bei Erkennung auf dem
   Gerät), vier Absichtskacheln (Gruß schicken · Zusammen planen · Gegeneinander spielen · Stimme) und „Alle Karten“
   (`alt:src/start-ui.js:139-196`).
6. **Werkzeugzeile** (unterstrichene Textlinks): Nächster Tag · Selber bauen · Letzte Tage · Meine Wand (`:40-42`, `alt:src/app.js:1022-1025`).
7. „Mehr von bunsenbrenner“ (zugeklappt) öffnet den alten Ticker: „🎲 57 Spiele“, Webconference, Flappy, Karte, Foto, Beat,
   Agent … (`alt:src/start-ui.js:166-170`, `alt:src/app.js:306-326`).

Ab 900 px Breite gibt es zwei Spalten: links das Blatt (sticky), rechts Hauptknopf, freie Karte und Startbox [70].

### 1.3 Einstiege und Rückwege

```
                    Link #i= / #c= / #s=  ──► home (Empfang: „Von {Name}, für dich“, 1 Hauptaktion) ─┐
                                                                                                     │
 App öffnen ──► home: KALENDERBLATT (heute) ◄──wischen──► ±31 Tage                                   │
                 │  Hauptknopf ───────────────────────────────► editor ──Fertig──► done ──► Teilen   │
                 │                                    (Arcade/Tisch: Ebene mit Bot/Live/Link)       │
                 ├─ Freie Karte „Erschaffen“ ─────────► shelf (Login, 16+, Kategorie) ──► editor      │
                 ├─ Satz / Absichtskachel ────────────► shelf „Deine Karte“ ──Karte machen──► Blatt/editor
                 ├─ Alle Karten ──────────────────────► shelf (Liste + Bildkacheln) ──► Blatt ──► …   │
                 ├─ Nächster Tag ── (wie Wischen)                                                    │
                 ├─ Selber bauen ─────────────────────► shelf (leere Arten + Adventstür + Einkauf)    │
                 ├─ Letzte Tage ──────────────────────► shelf (7 Tage + Suche + Community-Karten)     │
                 ├─ Meine Wand ───────────────────────► shelf [Wand | Einladungen (n)]               │
                 ├─ 🐸 Mein Stil ─────────────────────► shelf (Stil, Schrift, Konto, Lesen & Bedienen)│
                 └─ Mehr von bunsenbrenner ──► Ticker ──► „57 Spiele“-Regal nach Situation ──► editor
 ✕ / Escape / Zurück: shelf → home (`alt:src/app.js:781`), game → editor, wenn aus dem Editor gespielt (`:542-545, 791`),
 Wand-Großansicht → Raster (`:940-941`); ein Arcade- oder Tisch-Spiel fragt beim ersten Escape nach (`:1046-1056`).
```

Links: `#i=<id>` öffnet eine Katalogkarte als Einladung, `#c=` ein Werk oder Zug, `#s=` einen Kurzlink, `#todo=` eine
Aufgabenliste aus dem Protokoll, `?go=erschaffen` kehrt vom Login zur freien Karte zurück (`alt:src/app.js:1063-1114`,
`alt:src/start-ui.js:281-284`). Eine Adventstür kommt geschlossen an (`alt:src/app.js:1096`).

### 1.4 Wie Tageskarte, Regal und Archiv zusammenhängen
- **Tageskarte = Kalender.** Jedes Ziel aus einem Regal landet wieder **auf dem Kalenderblatt** (`A().sheet(...)`,
  `alt:src/start-ui.js:325, 486`). Von dort führt derselbe Hauptknopf weiter. Ein Regal ist also nur ein Weg, das Blatt neu zu
  belegen. Das Blatt ist der einzige Ort, an dem eine Karte „vorgestellt“ wird.
- **Regal** heißt im Code „Alle Karten“ (64, `alt:src/start-ui.js:305-335`). Daneben gibt es das ältere Spiele-Regal nach
  Situation (`alt:src/turn-ui.js:719-745`, [22]). Beide zeigen dieselben Zug-Karten, gruppiert nach unterschiedlicher Logik.
- **Archiv:** „Letzte Tage“ zeigt die letzten 7 Kalenderblätter. Eine Suche durchsucht alle Karten in beiden Sprachen und nennt
  den Tag, an dem die Karte zuletzt kam (`alt:src/daily.js:139-167`, [05], [06]). Darunter steht „Community-Karten“
  (`alt:src/app.js:889`). Persönliche Ablage ist „Meine Wand“: Werke und Einladungen (1.3). Über das Profil synchronisiert sich
  die Wand, Fotos bleiben auf dem Gerät (`alt:src/daily.js:505-524`).
- **Beobachtung:** Nach einem verschickten Bluff-Zug blieb die Wand im Testlauf leer [34c]. Werke landen laut Code bei „Fertig“
  (`makePicture`) oder über ♡ „Merken“ auf der Wand. Die Ursache wurde nicht geklärt. **Offen.**

---

## 2. (b) Die Produktidee in den Worten der alten App

- **Leitfrage der Startseite:** „Wem willst du heute eine Freude machen?“ Darunter: „Sag in einem Satz, was du vorhast“
  mit dem Beispiel „Danke an Oma“ (`alt:src/start.json texts.de st_ask, st_field, st_hint`).
- **Haltung zum Teilen:** „Dein Satz bleibt auf dem Gerät. Erst bei ‚Fertig‘ legen wir einen kurzen Link zu deiner Karte an.“
  (`st_local`). „Du machst deinen Zug und schickst den Link. Der Spielstand steckt im Link.“ (`texts.json turnH`).
- **Grußkarten:** „Whoever gets one can send one too, never has to: no counter, no ‚send it on‘“ (`alt:src/warm.js:1-3`).
- **Ehrlichkeit:** Was es nicht gibt, wird genannt: „{w} habe ich noch nicht. Stattdessen:“ (`st_missing`). Fehlt ein Treffer,
  heißt es „Dazu habe ich noch keine passende Karte“ (`st_none`).

### 2.1 Eine Karte pro Tag: die Kalenderlogik
- Alle Karten ohne festes Datum bilden eine **Runde**. Sie wird je Rundennummer gemischt, sodass sich nichts wiederholt, bevor
  alles einmal dran war. Zwei Tage hintereinander haben nie dieselbe Art und bei Zug-Karten nie dieselbe Situation („grip“)
  (`alt:src/daily.js:28-37, 62-87`).
- **Kalenderkarten** (21 Karten mit `on: "MM-DD"`, z. B. Wichteln 11-28, Geld sammeln 12-02, Adventstür 12-22/12-24)
  erscheinen nur an ihren Tagen (`:28`, `:104-108`).
- Jeder 6. Tag kann eine Bonuskarte aus der Liste `gated` bringen (`:11, 118`). Kann ein Gerät eine Karte nicht ausführen,
  bekommt es eine Ersatzkarte (`:109-131`). Sonst sehen **alle am selben UTC-Tag dieselbe Karte** (`:54, 132`).
- Wischen und „Nächster Tag“ blättern bis zu 31 Tage vor und zurück. Das Blatt darunter zeigt schon grau den Tag, zu dem
  geblättert wird (`alt:src/app.js:370-419`). Um Mitternacht wechselt das Blatt von selbst, es sei denn, ein empfangener Link
  ist offen (`:372-380`).
- Gemessen am 11.11.2026: heute „Beweisfoto: Alien“ [01], morgen „Insel-Panzer“ [04], an den letzten 7 Tagen Stangen-Kick,
  Termin, Ziegel-Duell, Dart, Stangen-Kick, Pokal, Einig [05].

### 2.2 Freie Karte und Community-Deck
- Der Einstieg sitzt **unter dem Hauptknopf des Tagesblatts** und **ganz oben in „Alle Karten“** („Erschaffe deine Karte –
  Ein Satz, die KI baut sie“, [07]). Ohne Netz erscheint „Gerade kein Netz.“ [24]. Den Ablauf mit Login, 16+, Warten,
  Übernehmen und Deck beschreibt `12-paritaet.md` §3.
- Community-Karten erscheinen in „Letzte Tage“ (Knopf „Community-Karten“) und als Treffer der Suche (`alt:src/app.js:884-889`).
- **Sie speisen die Tagesrotation nach dem Code nicht.** `ideaForDay` greift nur auf `IDEAS` und `GATED` aus `ideas.json` zu
  (`alt:src/daily.js:103-132`). **Offen:** Soll eine angenommene Community-Karte auch einmal „Karte des Tages“ werden können?

### 2.3 Adventstür
- Die Katalogkarte `advent-tuer` ist eine Grußkarte (`kind: card`, `style: advent`, `door: true`, `set: advent`) mit den
  Kalendertagen 12-22 und 12-24 (`ideas.json`). Über „Selber bauen“ lässt sie sich an jedem Tag machen (`alt:src/app.js:975-976`, [09]).
- **Die Nutzenden gestalten die Tür selbst:** Im Editor stehen die Blasen Text, Stil, Farbe, Magie, Mit KI und Würfel, der
  Hauptknopf heißt „TÜRCHEN VERSCHICKEN“ [45b]. Die Nummer setzt das Programm (`doorNumber`, `alt:src/daily.js:321-322`).
  Am 11.11. war es deshalb Tür „1“ [61].
- Der Empfänger sieht eine geschlossene Tür und „Tippen zum Öffnen“ [62]. Die Tür ist nie gesperrt
  (`alt:src/door.js:1-11`).
- Die Variante mit 24 Türen, die eine Person füllt und die andere nach Datum öffnet (`zug-advent`, Widget `doors`,
  `alt:src/turn-ui.js:335-343`), ist eingeklappt. Der Design-Brief B10 schlägt beide Modi vor: „Wir füllen abwechselnd“ und
  „Ich fülle für dich (3–24 Türen)“ (`konzept2/design-briefs.md:99-106`). **Offen** (wie in 12-paritaet).

---

## 3. (c) Designsprache: was trug und was störte

### 3.1 Was trug
| Element | Beleg | Warum es zu 16–85 passt |
|---|---|---|
| **Abreißkalender** mit Lochrand, 2 Blättern darunter (eines rot), −0,8° Drehung, Schatten 5/6 px | `alt:src/style.css:19-29` | Ein bekanntes Ding aus dem Alltag: „ein Blatt pro Tag“ erklärt sich selbst, ganz ohne Onboarding |
| **Datum groß** (Anton 62 px) + Monat/Wochentag | `:30-32` | Orientierung, sozusagen das Ritual |
| **Sternplakette** mit Art + Dauer („Per Link 40 Sek“) | `:33`, `alt:src/app.js:69-70` | Zwei Fakten vor dem Tippen: wie man spielt und wie lange es dauert |
| **Titel als Stempel** (Anton, Versalien, roter Versatzschatten, Stempel-Animation 110 ms gestaffelt) | `:36-39` | Plakativ und laut, wie Memes oder Thumbnails, bleibt aber auf 2–4 Wörter begrenzt |
| **Hauptknopf** 68 px, Anton 30 px, schwarz mit gelber Schrift und roter Schattenkante | `:42-43` | Ein unverwechselbares Ziel, groß genug bei Zittern oder Arthrose (Personas P7, P8) |
| **Gesperrter Knopf sagt, warum** („Noch offen: …“, gestrichelter Rahmen) | `:44-48`, `alt:src/app.js:463-487` | Keine toten Knöpfe, der Grund steht als Satz da |
| **Freigegebene Canvas-Tokens** Gelb `#F9D84A`, Creme `#FBF5DD`, Tinte `#17140F`, Rot `#B3321F`, harte Schatten, Ecken Karte 22/Knopf 16 | `alt:src/start-ui.js:33-35`, `konzept2/design-briefs.md:9-14` | Hoher Kontrast; Rot nie als Fließtext auf Gelb |
| **Strich-Icons statt Emoji in Bedienelementen** | `alt:src/start-ui.js:14-31` | Ruhiger, plattformunabhängig |
| **Kategorie-Farben (grip)**: streit `#ff3b1d`, pause `#1d7cff`, abend `#7a3bff`, geschenk `#ff5fa2`, raum `#12a150` + Vektorform je Karte | `alt:src/turn-ui.js:722-740`, [22] | Situation statt Spielgenre: „Wenn ihr euch nicht einig seid“, „Abends im Chat“ |
| **Bildkacheln 3:4** (echter Screenshot 216×288, Dauer-Badge, Titel in Anton) | `alt:src/start-ui.js:198-232`, [08b] | Zeigt das Spiel, bevor man es öffnet |
| **KI-Bilder 16:9 im „YouTube-Thumbnail“-Stil** | `alt:src/thumbs.json style`, `alt:src/app.js:163-203` | siehe 12-paritaet §5 |
| **Ton und Haptik**: tap/thud/pop/win als synthetische Töne + Vibration, Reißgeräusch beim Blättern | `alt:src/kit.js:40-42, 97-101`, `alt:src/app.js:413` | Rückmeldung ohne Text; Ton-Schalter in der Kopfzeile |
| **Bewegung mit Rücksicht**: Strahlenhintergrund (80 s pro Umdrehung), slap/stamp/pop; `prefers-reduced-motion` an 30 Stellen | `alt:src/style.css:11-12, 27-39` | Lebendig, abschaltbar |
| **Mein Stil**: Vorschau „So sehen deine Karten aus“, Überrasch mich, **Schrift Normal/Groß/Sehr groß** (`--fs` skaliert `rem` app-weit), Spitzname „z. B. Oma Gisela“, Emoji, Farbpaare, Sticker-Sets (Tiere … Advent), **Lesen & Bedienen: Einfache Sprache** | `alt:src/style.css:5`, `alt:src/stil.js:170-174`, [12], [13] | Personalisierung **und** Barrierefreiheit an einem Ort, im Ton nicht klinisch |
| **Mindestgrößen**: Titel nie unter 14 px („readers up to 85“), Hauptknopf auf dem ersten Bildschirm auch bei 200 % (Regel A4), Ziele ≥ 44 px | `alt:src/start-ui.js:400-440` | ausdrücklich für Ältere geschrieben |
| **Kontrast automatisch**: Schrift auf Farbe schwarz oder weiß nach WCAG | `alt:src/app.js:19-24`, `alt:src/turn-ui.js:98-100` | Freie Farbwahl ohne unlesbare Kombinationen |
| **Empfang**: Avatar-Initiale, „Von {Name}, für dich“, Karte groß, eine Hauptaktion („Dein Zug“, „Antworten“, „Mitspielen“), Sprachwahl Deutsch/English | `alt:src/start-ui.js:337-367`, [35] | Board 5 der Canvas: „Empfang: Antworten zuerst“ |
| **„Wer sieht was?“** als eine Zeile, Details unter „ⓘ Mehr“ | `alt:src/turn-ui.js:570-577`, [42c] | Datenschutz in einem Satz statt in einem Dokument |

### 3.2 Was störte (mit Belegen)
- **Überfrachtete Startseite:** Allein bis zur Werkzeugzeile zähle ich auf [01]–[03] etwa 25 tippbare Ziele: 3 Kopf, 5 Blasen,
  2 Daumen, Look würfeln, Hauptknopf, 4 Chips + Erschaffen, Feld + Pfeil, 4 Kacheln, Alle Karten, 4 Werkzeuge, Mehr von bunsenbrenner.
  Drei Blöcke konkurrieren um Aufmerksamkeit: Tageskarte, freie Karte und Absicht.
- **Blasen über der Tageskarte** (Look, Farbe, Titel, Mit KI, Magie) zeigen Bearbeitung, bevor man weiß, was die Karte ist [01].
  Im Editor verstecken sie sogar die eigentliche Spielhandlung (Abschnitt 6.1).
- **Doppelte Liste in „Alle Karten“:** Erst 64 Textzeilen mit dem Etikett „Mit Freunden“ (bei 52 Karten), Höhe 3968 px, darunter
  noch einmal dieselben 64 als Bildkacheln (`alt:src/start-ui.js:312-333`; gemessen: `#alllist` 3968 px, `#allshots` ab 4165 px;
  [07], [08], [08b]). Die schönere Ansicht steht damit am Ende.
- **Vorschaubilder zeigen den Endstand** einer Partie („UNENTSCHIEDEN“, „KREIS GEKNACKT!“, „GLEICHSTAND. HÖFLICH BIS ZUM
  SCHLUSS.“, [08b]). Das ist bekannt: `alt:src/start-ui.js:237-239` nimmt solche Bilder deshalb vom Tagesblatt.
- **Zwei Stilschichten:** altes `style.css` (Radius 6 px, Emoji im Ticker, 900er-Gewichte) neben der Canvas-Schicht
  (Radius 22/16, Strich-Icons, Systemschrift). Sichtbar an Ticker-Knöpfen mit Emoji gegenüber Kacheln mit Icons [02], [22].
- **Anton als Lesetext** (Dialogtitel „Karte 1: Du hast 6. Was sagst du an?“ in Anton-Versalien [32a]); Kritik 4 B11
  (`konzept2/kritik-4.md:166`).
- **Irreführender Satz bei Katalog-Links:** `#i=`-Links zeigen „Geschickt bekommen. Mach deins draus.“, auch wenn niemand etwas
  geschickt hat [30].
- **Daumen beim Empfang** erreichen den Absender nie (Kritik 4 B3). Ein Screenreader liest den Karteninhalt im Canvas nicht vor
  (B1), bei 200 % Zoom wird abgeschnitten (B2) (`konzept2/kritik-4.md:15-60`).
- **Etiketten ohne Information:** „Mit Freunden“ für 52 Karten [07]; „Arcade“ und „Meme“ als Fachwörter. Start-UI ersetzt nur auf
  dem Blatt durch „Spiel“ und „Bild“ (`alt:src/start-ui.js:288-290`).

---

## 4. (d) Vielfalt: Familien, Überschneidungen und eine strukturierte Führung

### 4.1 Zählung
- Regal 64 (`ideas.json`): Zug 52 · Arcade 5 · Tisch 2 · Flug, Meme, Beat, Quest, Grußkarte je 1.
- Spielweise der Zug-Karten (`Turns.who`, `alt:src/turns.js:1225-1226`): per Link 38, ein Handy reihum 11. Alleine und gegen den
  Bot gibt es keine. Gegen den Bot spielen Arcade, Dart (Bert), Bauernskat und Nim.
- Dauer laut Katalog: 20 s bis 10 min, Median 60 s.
- Dazu 84 eingeklappte Varianten (Themen und Modi des Trägers), 8 Business-Karten, freie Karte, Community-Deck und Protokoll.

### 4.2 Familien (vorgeschlagen; jede Karte aus 12-paritaet §1 gehört genau einer an)
| Familie | Was man tut | Karten (Beispiele) | Engine |
|---|---|---|---|
| **Grüßen & Schenken** | jemandem etwas Persönliches schicken | karte-danke (+12 warm-Varianten), advent-tuer, zug-umschlag, zug-kapsel, zug-gutschein, zug-lob, zug-reihum, raum-damals | Renderer, Zug |
| **Planen & Organisieren** | gemeinsam entscheiden, sammeln, verteilen | zug-termin, zug-einkauf, zug-wichteln, zug-sammeln, zug-einig, zug-wunschzettel, geschenk-finder, raum-streichen | Zug + Satz-zu-Formular |
| **Kennen & Raten** | Fragen über uns, Quiz, Schätzen | zug-kennst, zug-abfragen, zug-typen, quiz-preis, zug-snack, zug-luecke, zug-woerter, zug-stimme | Zug + Fragepakete |
| **Bluff & Taktik** | verdeckt bieten, schwindeln, Regeln knacken | zug-bluff, zug-luege, zug-auktion, zug-kreis, zug-steine, zug-socken, zug-hoeflich, zug-reaktion, zug-pokal | Zug |
| **Wort & Kreativ** | malen, dichten, bauen | zug-malrat, zug-wort, zug-schmuggel, zug-blitz, zug-rap, karte-ausrede, karte-regel, beat-pausenhof, foto-alien, spiel-lava (Level bauen) | Zug, Klang, Renderer, Flug |
| **Vor Ort, ein Handy** | gemeinsam im Raum | beat-disco, mut-tierstory, mut-werbung, raum-erklaeren, raum-maschine, raum-suche, raum-maus, raum-papagei, raum-sorry | Zug lokal |
| **Geschick (Arcade, live/Bot)** | Echtzeitduell | arcade-kick, -elfer, -ziegel, -panzer, -stock, spiel-dart | Arcade, Dart |
| **Kartentisch** | klassische Kartenspiele | tisch-skat (+Doko), tisch-bauernskat | Tisch |
| **Rätsel & Geheim** | Schlüssel durch Wissen | kanal-geheim (+5) | Quest |
| *quer:* **Freie Karte** | ein Satz → eigene Karte (Karte, Meme, Spiel, Quiz) | – | alle |

### 4.3 Überschneidungen, die sich zusammenfassen lassen (ohne Funktionsverlust)
| Heute | Überschneidung | Zusammengefasst |
|---|---|---|
| Alle Karten (Liste + Kacheln), Spiele-Regal nach grip, Letzte Tage + Suche, Selber bauen, Intent-Ergebnis „Deine Karte“, Ticker | sechs Katalogansichten mit eigener Logik | **ein Regal**, Filter Familie/Situation/Spielweise, eine Suche, die Kalender-Historie als Reiter |
| Freie Karte (rot) + „Selber bauen“ (leere Arten) + „Erschaffe deine Karte“-Kachel | drei Wege zu „etwas Eigenem“ | **ein Einstieg „Eigene Karte“**: Satz an die KI **oder** leer anfangen (Arten als Chips) |
| Absicht-Kachel → Blatt „Deine Karte“ → Blatt → Hauptknopf | 3 Schritte über zwei Zwischenseiten | Kachel öffnet direkt die Familienseite, Satz zeigt die Treffer dort |
| Spielweise: Plakette („Per Link“), Arcade-Menü (Bot/Live), Dart „Gegen wen?“ im Zug-Dialog, Tisch (Bot/Link), „Selbes Handy“ nach dem Zug | fünf Orte, an denen „mit wem“ entschieden wird | **ein Baustein „Mit wem?“** an derselben Stelle, mit Standard (6.4) |
| Wand + Einladungen + Gemerkt (♡) + Letzte Tage | Archiv auf drei Orte verteilt | **„Meins“**: Gemacht · Verschickt (mit Ablauf) · Gemerkt; die Kalender-Historie bleibt beim Kalender |
| Tageskarte mit Blasen + Editor mit Blasen | Bearbeiten erscheint vor dem Verstehen | Blatt zeigt nur, was die Karte ist; Anpassen erst nach „Los“ |

### 4.4 Vorschlag: Führung in höchstens 3 Taps
```
Start = Kalenderblatt (heute, wischbar)  +  „Wem willst du heute eine Freude machen?“ (Satz)
        + 4 Absichten  +  „Eigene Karte“  +  „Alles“
Tap 1: Absicht (Grüßen · Planen · Spielen · Stimme/Vor Ort)  ODER  Satz
Tap 2: Karte in der Familienseite (Bildkachel 3:4 mit Plakette „per Link · 40 s“, Situationsfarbe)
Tap 3: „Los“, dabei die Spielweise vorgewählt (6.4); Abweichung „Mit wem?“ 1 Tap
```
- „Alles“ ist das eine Regal mit Filterchips (Familie · Situation · Spielweise · Dauer) und Suche; die Kalender-Historie ist dort
  ein Reiter. Jede der 64 Karten und jede eingeklappte Variante (als Thema oder Modus ihrer Trägerkarte) ist so in ≤ 3 Taps
  erreichbar: Alles → Filter → Karte.
- „Meins“ (Gemacht · Verschickt · Gemerkt) steht in der Kopfzeile neben „Mein Stil“, nicht als Textlink am Fuß.
- Business bleibt ein Flavor mit eigenem Regal (8 Vorlagen, [80]–[82]) und folgt derselben Struktur.

---

## 5. (e) Liste: genau behalten, zusammenfassen, neu gestalten

### Genau behalten
| Was | Grund |
|---|---|
| Kalenderblatt als Startseite, Wischen/Abreißen ±31 Tage, Reißgeräusch + Haptik | Kern der Produktidee „ein Blatt pro Tag“; selbsterklärend für alle Altersgruppen |
| Tageslogik: gleiche Karte für alle am UTC-Tag, Runde ohne Wiederholung, nie zweimal dieselbe Art/Situation, Kalenderkarten, Bonus | `alt:src/daily.js:54-132`; Gesprächsanlass (BEFUNDE B02) |
| Plakette „Spielweise + Dauer“ vor dem Öffnen | zwei Entscheidungsfakten ohne Lesen |
| Ein Hauptknopf je Zustand mit Verb der Karte („Dein Zug“, „Wurf schicken“, „Türchen verschicken“) und „Noch offen: …“ bei gesperrtem Knopf | Führung ohne Anleitung |
| Empfang „Von {Name}, für dich“ + eine Hauptaktion + Sprachwahl | Canvas Board 5 |
| Situations-Gruppen (grip) mit Farbe und Form | ordnet nach Anlass statt nach Genre |
| Mein Stil inkl. Schrift 3 Stufen, Einfache Sprache, Spitzname, Farben, Sticker-Sets | Inklusion und Identität an einem Ort |
| Meine Wand und Einladungen mit Ablaufdatum, Teilen und Löschen | vom Nutzer ausdrücklich genannt; Transparenz über Serverdaten |
| Adventstür: selbst gestaltet, Nummer aus Datum, nie gesperrt | ★ vom Nutzer genannt |
| „Wer sieht was?“-Zeile, ehrliche Absage „habe ich noch nicht“ | Vertrauen, keine Manipulation |
| Canvas-Tokens, harte Schatten, Anton nur für Titel und Zahlen | freigegebenes Design |
| Arcade-Menü: Bild des Spielfelds + Regelzeile mit Steuerung und Ziel + 2 große Knöpfe | bestes Einstiegsmuster im alten Client [47b] |

### Zusammenfassen
| Was | Wie | Grund |
|---|---|---|
| sechs Katalogansichten | ein Regal „Alles“ mit Filtern und Suche | Abschnitt 4.3 |
| Freie Karte / Selber bauen / Erschaffe-Kachel | „Eigene Karte“ | drei Wege, eine Absicht |
| Wand / Einladungen / Gemerkt | „Meins“ mit 3 Reitern | ein Ort für alles Eigene |
| Spielweise an fünf Orten | Baustein „Mit wem?“ | 6.4 |
| 84 eingeklappte Varianten | als Themen/Modi der Trägerkarte, im Editor „Thema“ | Vielfalt bleibt, Regal bleibt überschaubar |

### Neu gestalten
| Was | Richtung | Grund |
|---|---|---|
| Startseite | Blatt groß + Satz + 4 Absichten; freie Karte als 5. Absicht statt roter Block | ~25 Ziele → ≈ 10 |
| Blasen auf Tagesblatt und als Zugang zur Spielhandlung | auf dem Blatt keine; im Spiel ist der Zug die Fläche, Blasen nur für Aussehen | 6.1 |
| Vorschaubilder | Anfangszustand oder KI-Thumbnail ohne Ergebnis-Spoiler, textfrei, Titel als Overlay | [08b]; 12-paritaet §5 |
| Lesetext in Anton | Systemschrift ≥ 18 px | Kritik 4 B11 |
| Ergebnisanzeige der Zug-Spiele | Namen/Rollen + Wertung erklärt (D0-Muster) | [37] gegenüber [96] |
| Text auf Katalog-Links | „Eine Idee für dich“ statt „Geschickt bekommen“ | [30] |
| Daumen beim Empfang | entfernen oder an Absender zurückführen | Kritik 4 B3 |
| Spielweise „Mit wem?“ | vorgewählt, nicht vorgeschaltet | 6.4 |

---

## 6. Zwei-Personen-Spiele: alter Client und D0 Schritt für Schritt

### 6.1 Alt: „Mein Bote lügt“ (zug-bluff, `alt:src/turns.js:202-224`)
| Schritt | Was man sieht | Bild |
|---|---|---|
| 1 Blatt | Kalenderblatt mit Kartenbild, Titel, Unterzeile „Ansagen, glauben oder aufdecken.“, Plakette „Per Link 40 Sek“, Hauptknopf „LOS, DU FÄNGST AN“ | [30] |
| 2 Editor | Karte groß mit Blasen Titel · Zug · Farbe · Mit KI · Würfel; auf der Karte „Du fängst an.“; unten „Noch offen: Karte 1: Du hast 6. Was sagst du an?“ und gesperrtes WEITER | [31] |
| 3 | Tippen auf das gesperrte WEITER zeigte im Testlauf keine sichtbare Reaktion (der Code springt zum offenen Feld, das hier aber in einer geschlossenen Blase liegt, `alt:src/app.js:480-487`) | [32] |
| 4 | Erst die Blase **„Zug“** öffnet den Dialog: „Karte 1: Du hast 6. Was sagst du an?“ mit Chips 6 (nur gleich oder höher erlaubt) | [32a] |
| 5 | Eine Wahl rückt automatisch zur nächsten Karte (`auto: true`, `alt:src/turn-ui.js:645`), 5 Karten nacheinander, je eine Frage | [32b] |
| 6 | „Zug steht. Unten verschicken.“ + Nebenknopf „Selbes Handy: weitergeben“; Hauptknopf „ZUG VERSCHICKEN“ | [33] |
| 7a Link | „FERTIG. WER BEKOMMT SIE?“, TEILEN, ehrliche Zeile zum Link, Konto-Angebot „Geht auch ohne“ | [34] |
| 7b selbes Handy | „Handy weitergeben“ + „ICH BIN DRAN“ (`alt:src/turn-ui.js:590-596`) | [38] |
| 8 Empfang | „J · Von Jemand, für dich“, Karte „Zug 2 von 2“, „Du bist dran. Zug 2 von 2.“, Hauptknopf „DEIN ZUG“ | [35] |
| 9 | wieder Blase „Zug“: „Karte 1: angesagt 6. Glaubst du das?“ Glauben / Aufdecken | [36b] |
| 10 Ergebnis | „9 zu 9“ und 5 Zeilen „Ansage 6, in Wahrheit 6.“; NEUE PARTIE; Hauptknopf ERGEBNISBILD | [37] |

**Stark:** Spielweise per Link als Standard ohne Frage; Alternative „Selbes Handy“ erst, wenn der Zug steht; eine Frage pro
Bildschirm als ganzer Satz mit dem eigenen Wert; Empfang mit Absender, Zugnummer und einem Knopf; Sprachwahl beim Empfang;
Schrift und einfache Sprache global in Mein Stil.
**Schwach:** Die Handlung steckt hinter einer Blase; WEITER bleibt gesperrt, ohne dass man sieht, warum oder wo; Rollen werden nie
benannt; die Regel steht nur als Unterzeile; kein Abdecken vor dem ersten Zug auf demselben Handy; das Ergebnis sagt nicht, wer
gewonnen hat; kein Bot und kein Üben allein.

### 6.2 Weitere alte Zwei-Personen-Karten
- **Dart im Wohnzimmer** [42a]–[42c]: Der erste Schritt fragt **im Spiel** „Spiel“ (4 Varianten mit je einer Erklärzeile) und
  „Gegen wen? Per Link mit jemandem · Gegen Bert, den Bot“, darunter „Du wirfst zuerst.“ und „Wer sieht was? Im Link stehen
  Zahlen und Namen. ⓘ Mehr“. Gegner und Erklärung stehen zusammen, ein Standard ist vorgewählt.
- **Stangen-Kick** [47b]: dunkle Ebene, Spielfeld als Bild, eine Zeile mit **Steuerung und Ziel** („Zieh: beide Stangen fahren
  mit. Tippen: kicken. Wer zuerst 3 Tore hat, gewinnt.“), zwei große Knöpfe „GEGEN DEN BOT“ / „LIVE GEGEN FREUND“.
- **Bauernskat** [49b]: „GEGEN DEN BOT“ / „FREUND PER LINK“ + eine Regelzeile („Vorhand sagt an, 61 Augen gewinnen“).
- **Worauf einigen wir uns?** [40b], [63]: „Noch offen: Tippe fünf Möglichkeiten, zum Beispiel Filme oder Pizzen.“ Die Aufgabe
  steht mit Beispiel in der Zeile über dem Knopf; die Handlung liegt aber wieder hinter der Blase „Zug“.
- **Skat live** [58b]: Sitzplätze mit „PLATZ 2 EINLADEN“, Hausregeln, „Seht ihr alle dieselben drei Bilder? Dann sitzt ihr am
  selben Tisch.“: verständliche Prüfung ohne Fachwort.

### 6.3 D0: „Mein Bote lügt“ (`d0:src/ui/view.js`, `d0:src/cards/bluff/manifest.json`)
| Schritt | Was man sieht | Bild |
|---|---|---|
| 1 Regal | „HEUTE · EIN GRUSS FÜR DICH“, „NOCH EINE KARTE · MEIN BOTE LÜGT“; Reihenfolge fest (`d0:src/cards/index.js:9`) | [90] |
| 2 Karte | Regel in zwei Zeilen (howto), 5 rote „?“-Kartenrücken, **„Wie spielst du?“** mit 4 Chips (Ein Gerät · Gegen den Computer · Abwechselnd per Link · Gleichzeitig (live)), Hinweiszeile, LOS, Anpassen (`d0:src/ui/view.js:139-150`). Bei Bot zusätzlich Stärke, sonst „Du spielst als“ (Bote/Prüfer) | [91] |
| 3 nach LOS (Ein Gerät) | „Sag jede Karte an – gleich hoch oder höher.“, **die 5 geheimen Werte offen**, Frage „Karte 1: Du hast 4. Was sagst du an?“, runde Knöpfe 4/5/6. Kein Hinweis, wer Bote ist; die Sitzzeile ist im Modus „alone“ ausgeblendet (`d0:src/ui/view.js:177`) | [92], [93] |
| 4 Wechsel | „GERÄT WEITERGEBEN – Gib das Gerät jetzt an: Prüfer. Die anderen schauen weg. ICH BIN PRÜFER – ZEIGEN“ | [94] |
| 5 Prüfer | „Glaub die Ansage oder deck sie auf.“, Rücken mit „Ansage n“, Glauben/Aufdecken | [95] |
| 6 Ende | „ES GEWINNT: BOTE.“, Liste geglaubt/aufgedeckt, „Bote 19 – Prüfer 0“, Satz zur Wertung, „So zählt es: …“, NOCHMAL | [96] |

### 6.4 Gegenüberstellung
| Frage | Alt | D0 | Neubau soll |
|---|---|---|---|
| Wie wird das Spiel erklärt? | Unterzeile + Frage pro Schritt | 2-Zeilen-Regel vorab + Regel pro Phase + Wertung am Ende | eine Satz-Regel mit Ziel; Frage pro Schritt; Wertung am Ende (D0) |
| Wer spielt (Bot/Freund/selbes Handy)? | Standard per Link, keine Frage; „Selbes Handy“ nach dem Zug; Bot nur bei Dart/Arcade/Tisch, dort 2 große Knöpfe oder „Gegen wen?“ im ersten Schritt | 4 Modi als Pflichtentscheidung vor dem Spiel, abstrakte Wörter („live“, „Abwechselnd per Link“) | Standard vorgewählt und benannt („Du spielst mit jemandem per Link“), Wechsel mit 1 Tap; höchstens 2–3 Optionen in Alltagssprache: „Mit jemandem per Link“, „Hier auf diesem Handy“, „Gegen den Computer (üben)“; „live“ nur, wo es nötig ist |
| Rollen | nie benannt | im Abdeck-Bildschirm benannt, nicht am Anfang | vor dem ersten Zug: „Du bist der Bote: Du kennst die Karten und darfst schwindeln.“ |
| Erste Handlung | hinter Blase „Zug“ | sofort sichtbar | sofort sichtbar, groß, ohne Umweg über „Anpassen“ |
| Wessen Zug? | Empfang „Du bist dran. Zug 2 von 2.“ + Knopf „DEIN ZUG“ | Abdeck-Bildschirm mit Rolle; im Link-Modus Sitzzeile | Name/Rolle + Zugnummer immer oben; beim Weitergeben Abdecken **auch vor dem ersten Zug** |
| Lesen, große Schrift, einfache Sprache | global Schrift 3 Stufen, Einfache Sprache, Sprachwahl beim Empfang | in `d0:src/ui` nicht gefunden | übernehmen (alt) |
| Üben/Onboarding | keins; Bot nur bei einigen Spielen | Bot für alle Karten (ISMCTS) | Bot als „Üben“ für jedes Zwei-Personen-Spiel (D0-Stärke), aber nicht als vierte Pflichtwahl |
| Ergebnis | „9 zu 9“ ohne Namen | Sieger, Punkte je Rolle, Erklärung | D0-Muster + Revanche/Antwort als Hauptknopf |

**Muster für Zwei-Personen-Spiele im Neubau** (inklusiv für 16–85, verständlich ohne vorheriges Regellesen)
1. **Ein Satz Regel mit Ziel und Steuerung** über dem Spiel (Vorbild Stangen-Kick [47b]); Details unter „ⓘ Mehr“.
2. **Spielweise vorgewählt, nicht vorgeschaltet.** Standard je Karte aus dem Katalog („per Link“ bei Zug-Karten, „gegen den Bot“
   bei Arcade allein). Sichtbar als Zeile „Du spielst mit jemandem per Link · ändern“. Höchstens drei Alternativen in
   Alltagssprache.
3. **Rolle vor dem ersten Zug benennen**, mit Name aus „Mein Stil“, und sagen, was die Rolle darf.
4. **Abdecken immer, wenn das Gerät den Besitzer wechselt** – auch vor dem ersten Zug („Nur der Bote schaut hin“).
5. **Eine Frage pro Bildschirm als ganzer Satz mit dem eigenen Wert** („Karte 1: Du hast 4. Was sagst du an?“), Antwortknöpfe
   ≥ 60 px, Auto-Weiter mit kurzer Pause (alt: 450 ms, `alt:src/turn-ui.js:645`).
6. **Die Handlung ist die Fläche.** Anpassen (Farbe, Titel, Thema) ist ein Nebenknopf und blockiert das Spiel nie.
7. **Wessen Zug, wie weit:** „Du bist dran · Zug 2 von 2“ oben, beim Empfang „Von {Name}, für dich“ + ein Knopf.
8. **Ergebnis erklärt sich:** Namen/Rollen, Punkte, ein Satz „So zählt es“, dann ein Rückweg (Revanche, Antworten) und „Fertig“.
9. **Üben gegen den Computer** für jedes Spiel, angeboten als „Erst mal üben“, nicht als Gleichrang zur Einladung.
10. **Lesehilfen global:** Schrift 3 Stufen, Einfache Sprache, Sprache beim Empfang wählbar, Systemschrift ≥ 18 px für Sätze,
    Anton nur für Titel und Zahlen.

---

## 7. Wo D0 das Produkt falsch verstanden hat (zusammengefasst)
| Thema | Alt (Beleg) | D0 (Beleg) |
|---|---|---|
| Tageskarte | Rotation nach UTC-Tag, Kalenderkarten, Blättern (`alt:src/daily.js:54-132`) | feste Reihenfolge, „HEUTE“ ohne Bedeutung (`d0:src/cards/index.js:9`) |
| Startseite | Kalenderblatt + Absichten + Satz (`alt:src/start-ui.js:139-196`) | zwei Textkacheln [90] |
| Archiv | Wand, Einladungen, Letzte Tage | nicht vorhanden |
| Bilder | Screenshots je Karte, KI-Thumbnails | keine (12-paritaet §5) |
| Lesehilfen | Schrift 3 Stufen, Einfache Sprache, Sprachwahl | nicht vorhanden |
| Spielweise | Standard + späte Alternative | Pflichtwahl aus 4 vor dem Spiel [91] |
| Verdeckte Information auf einem Gerät | Weitergeben + „Ich bin dran“ nach jedem Zug [38] | erster Zug ohne Abdecken [92] |
| Design | Kalender-Metapher, Plakette, Stempel, Strahlen, Ton/Haptik | flache Cremefläche, keine Metapher, kein Ton |

D0 hat dafür etwas, das alt fehlte: ein Kartenvertrag mit verdeckter Information (commit-reveal), ein Bot für jede Karte, die
Rollen beim Abdecken und die erklärte Wertung. Diese Stärken soll der Neubau behalten.

---

## 8. Offene Fragen an den Nutzer
1. Sollen angenommene Community-Karten in die Tagesrotation kommen (heute nach Code nicht, `alt:src/daily.js:103-132`)?
2. Adventskalender: nur die selbst gestaltete Einzeltür, die 24-Türen-Variante oder beides als Modi (B10)?
3. Ist „per Link“ der richtige Standard für alle Zug-Karten, oder soll die Karte den Standard aus der Situation nehmen
   (raum → „Hier auf diesem Handy“)?
4. Vier Absichten (Gruß · Planen · Spielen · Stimme) beibehalten oder „Stimme“ durch „Vor Ort“ ersetzen und „Eigene Karte“ als
   fünfte aufnehmen?
5. Wand leer nach verschicktem Zug [34c]: war das beabsichtigt (nur „Fertig“-Bilder) oder ein Fehler im alten Client?
6. Nutzungszahlen (`GET /api/duell/stat?days=90`) für die Reihenfolge im Regal abrufen? (wie 12-paritaet)
7. Vorschaubilder: Screenshot des Anfangszustands oder KI-Thumbnail (12-paritaet §5)?

---

## Anhang: Screenshot-Index (`alt-shots/`)
- 01–04 Startseite (Blatt, Absichten, Werkzeuge, nächster Tag) · 05–06 Letzte Tage + Suche · 07–08c Alle Karten (Liste, Kacheln)
- 09 Selber bauen · 10–11 Wand/Einladungen leer · 12–13 Mein Stil · 14–16 Absicht Spielen/Planen, Satz „Danke an Oma …“
- 17 Danke-Karte im Editor mit Blasen · 22–23 Spiele-Regal nach Situation · 24 freie Karte offline
- 30–39 Bluff alt komplett (Blatt, Editor, gesperrtes Weiter, Zug-Dialog, Zug steht, Teilen, Wand, Empfang, Prüfen, Ergebnis, selbes Handy)
- 40–59 je Karte Blatt (a) und geöffnet (b): einig, malrat, dart (+c Dialog), sammeln, termin (+c), advent, danke, kick (+c Bot),
  lava, bauernskat, abfragen, beat, kennst, sorry, umschlag, foto-alien, kanal-geheim, einkauf, skat, tierstory
- 60–62 Adventstür verschicken und empfangen · 63 Einig Zug 1 · 70–72 Desktop 1280 · 80–82 Business
- 90–96 D0 Bluff (Regal, Kartenansicht mit Moduswahl, Bote, Weitergeben, Prüfer, Ende)
