# 12 – Paritätsinventar: alter Client → apps/mdi

Ziel: Die Funktionen des alten Clients vollständig erfassen, damit `apps/mdi` sie wieder aufbauen kann.
Auftrag des Nutzers (sinngemäß): Die Spiele und die besten Karten (Geld sammeln, Adventskalender und Co.) sollen
wieder aufgebaut werden. Die freie Karte ist essenziell. Account und Login fehlen noch. Die Karten sollen mehr wie
YouTube-Thumbnails aussehen. Das Feature-Set soll erreicht werden.

**Quellen (nur gelesen)**
- `alt:` = CADS-agent-marketplace, Tag `pre-legacy-removal`, `apps/duell-web/` (z. B. `alt:src/turns.js:879`).
  `ideas.json` ist einzeilig, Karten werden deshalb über ihre `id` referenziert.
- `wr:` = CADS-DEMO-wrapper @ `5d8e938`, `lib/` und `server.mjs`.
- `neu:` = `apps/mdi` auf origin/main @ `45e33e9` (Slice D0).
- Bestehende Spezifikation: 01-karten.md, 04-erzeugung.md, 07-konto-guthaben.md, 08-push-bilder-wand.md,
  06-plan/slices-detail.md. Dieses Dokument verweist darauf und wiederholt nur, was für die Parität nötig ist.

**Legende Status in apps/mdi:** ✅ vorhanden · ◐ teilweise · ✗ fehlt.
**Nutzungsdaten:** Weder die Repos noch die Testdaten enthalten echte Nutzungszahlen. Der Server zählt sie
(`wr:lib/duell-stat.mjs:1-6`; Abruf `GET /api/duell/stat?days=…` bzw. Admin `GET /api/duell/admin/stat`,
`wr:lib/duell-deck.mjs:706-716`), der Abruf vom Live-System steht aber noch aus. Als Ersatz für „beste Karten“
dienen hier: ★ = vom Nutzer genannt, ◆ = kuratierte Startkachel der vier Absichten (`alt:src/start.json:2`,
`intents.*.ids`), ⌂ = immer erreichbarer Schnellknopf (`alt:src/app.js:975-978`).

---

## 1. Karten im Regal (64) und eingeklappte Varianten

Katalog: `alt:src/ideas.json` = { ideas 64, retired 84, gone 37, gated 0 }. Die Tagesrotation ist eine reine Funktion des UTC-Tages
(01-karten.md). `on` = Kalendertage im Format MM-DD. `min` = geschätzte Dauer in Sekunden aus dem Katalog.
Modus laut `Turns.who()` (`alt:src/turns.js:1225-1226`): **link** = Zug per Link (zwei Personen, der ganze Spielstand liegt im Link),
**room** = ein Gerät für die ganze Runde. Arcade- und Tischspiele laufen live über ct-agent (`alt:src/live.js:1-7`, `/api/play`).
Assets: Zu jeder Karte gibt es einen echten Screenshot `alt:src/shots/<id>.webp` (64 von 64, 216×288). Die Texte stehen in
`alt:src/turn.json` (1671 Zeilen). Weitere Assets sind in der Spalte genannt.

### 1a. Zug-Karten (kind `turn`, 52) – Engine „Zug“ (Abschnitt 2, E1)

| id | Titel (de) | Kategorie (grip) | Mechanik in einer Zeile | Regel (Datei:Zeile, ≈LOC) | Modus | on | Mark | mdi |
|---|---|---|---|---|---|---|---|---|
| zug-sammeln | Geld einsammeln | geschenk | Name (PayPal.me), Zweck, 1–20 Personen, Betrag → Link mit gleichem Anteil je Person; Rest bleibt beim Sammler; PayPal-Knopf nur ab 18, Minderjährige gesperrt | turns.js:850-904 (≈55) + Widgets `money`/`pay` turn-ui.js:170-195 | link (stay) | 12-02 | ★ ◆ | ✗ |
| zug-termin | Wann könnt ihr alle? | abend | Terminumfrage mit Slots, Feiertage ausgelassen, .ics; „Satz zu Formular“ per KI-Art `plan` | turns.js:578 (13) + satz.js (246) + satz-ui.js (249) | link (10 Züge) | 11-09, 12-04 | ◆ | ✗ |
| zug-einkauf | Einkaufszettel teilen | abend | Gemeinsame Liste, Merge als Vereinigung (CRDT-artig), „bringe ich / gekauft“ | turns.js:906-1000 (≈95) | link (snap) | – | ◆ ⌂ | ✗ |
| zug-wichteln | Wer beschenkt wen? | geschenk | Wichtel-Ziehung per Link | turns.js:506 (10) + satz-ui.js:116 | link (stay) | 11-28 | ◆ | ✗ |
| zug-reihum | Alle unterschreiben | geschenk | Reihum-Karte, jede Person unterschreibt | turns.js:544 (34) | link | – | ◆ | ✗ |
| zug-einig | Worauf einigen wir uns? | streit | Beide ordnen 5 Dinge, Übereinstimmung | turns.js:54 (16) | link | 11-04, 11-20 | ◆ | ✗ |
| zug-wunschzettel | Wunschzettel mit Geheimnis | geschenk | Wunschliste; Schenkende markieren, die wünschende Person sieht keine Markierung | turns.js:1001 (31) + turn2.js:63-79 | link (snap) | – | | ✗ |
| geschenk-finder | Geschenk in drei Fragen | geschenk | 3 Fragen → Ideen aus fester Liste mit Budget (ohne KI) | turns.js:1016-1032 (≈74) + geschenke.js (83) | link | – | | ✗ |
| zug-gutschein | Gutscheine ohne Geld | geschenk | Gutschein verschenken (Variante: rubbellos) | turns.js:238 (6) | link | – | | ✗ |
| karte-danke | Schick wem ein Danke | geschenk | Danke mit Grund (Varianten: 10× warm-*, karte-lob, karte-urkunde) | turns.js:591 (5) | link | – | ◆ | ◐ (`gruss` ist eine statische Grußkarte) |
| zug-umschlag | Mach auf, wenn … | geschenk | Briefumschlag, öffnen bei Anlass | turns.js:285 (6) | link | – | ◆ | ✗ |
| zug-kapsel | Das sag ich dir voraus | abend | Zeitkapsel, öffnet erst am Tag | turns.js:120 (29) | link | – | | ✗ |
| zug-lob | Was ich an dir sehe | geschenk | 3 Lobwörter wählen, vergleichen | turns.js:91 (14) | link | 12-09 | | ✗ |
| zug-kennst | Kennst du mich wirklich? | abend | 5 Fragen über mich | turns.js:149 (7) | link | – | ◆ | ✗ |
| zug-abfragen | Frag mich ab | pause | Lernkarten-Abfrage (Variante: zug-quiz) | turns.js:426 (21) + quizpack.js/quiz-ui.js, quiz-packs.json | link | – | ◆ | ✗ |
| zug-typen | Wer von uns ist …? | abend | Quiz aus Fragepaket (braucht `pk`) | turns.js:1107 | link | – | | ✗ |
| quiz-preis | Was kostet das? | pause | 8 von 12 Alltagspreisen schätzen (Schieber) | quizspiele.js:101-131 + quizspiele.json | link | – | | ✗ |
| zug-malrat | Mal & Rat | abend | Einer zeichnet ein Wort, Strich für Strich übertragen, der andere rät | malrat.js (176) + malrat-ui.js (321), malrat.json | link (snap, daily) | 12-25 | ◆ | ✗ |
| spiel-dart | Dart im Wohnzimmer | abend | Echte Dartscheibe, Zielen + Kraft + Streuung aus Seed; Bot „Bert“ | dart.js (381) + dart-ui.js (396), dart.json | link + Bot | – | ◆ | ✗ |
| zug-bluff | Mein Bote lügt | pause | Ansagen und bluffen, glauben oder aufdecken | turns.js:213 (13) | link | – | | ✅ `neu:src/cards/bluff` (alone/bot/link/live) |
| zug-luege | Eins davon ist gelogen | abend | Zwei Wahrheiten, eine Lüge | turns.js:256 (8) | link | – | | ✗ |
| zug-auktion | Auktion im Dunkeln | pause | 100 Münzen, verdeckte Gebote | turns.js:105 (15) | link | 11-26, 11-30, 12-11 | | ✗ |
| zug-wort | Ein Wort für drei | pause | Ein Hinweis für drei Wörter | turns.js:70 (10) | link | 12-17 | | ✗ |
| zug-schmuggel | Schmuggel das Wort | abend | 3 Wörter in den Chat schmuggeln | turns.js:80 (11) | link (3) | 12-19 | | ✗ |
| zug-snack | Pizza oder Pommes? | pause | Wie gleich tickt ihr? | turns.js:156 (8) | link | – | | ✗ |
| zug-wette | Versprochen ist versprochen | abend | Wette/Versprechen | turns.js:175 (10) | link | – | | ✗ |
| zug-luecke | Füll die Lücke blind | abend | Lückentext blind | turns.js:185 (10) | link | – | | ✗ |
| zug-auftrag | Ich geb dir eine Aufgabe | abend | Aufgabe stellen (Varianten mut-*) | turns.js:226 (7) | link | – | | ✗ |
| karte-ausrede | Die beste Ausrede | pause | Ausrede bauen | turns.js:233 (5) | link | – | | ✗ |
| zug-blitz | Sechs Wörter, eine Minute | pause | Wortblitz | turns.js:264 (9) | link | – | | ✗ |
| zug-recht | Wer hat recht? | streit | Streit schlichten | turns.js:273 (5) | link (3) | – | | ✗ |
| zug-steine | Gleiche Steine | pause | Steine-Spiel | turns.js:323 (22) | link | – | | ✗ |
| zug-kreis | Meine Regeln, dein Problem | pause | Geheime Regel erraten | turns.js:364 (16) | link | 11-02 | | ✗ |
| zug-hoeflich | Bloß nicht frech werden | streit | Höflichkeitsduell | turns.js:380 (27) | link (6) | 12-13 | | ✗ |
| zug-woerter | Wörterbuch für zwei | abend | Eigene Wörter definieren | turns.js:407 (19) | link (5) | 11-24 | | ✗ |
| zug-socken | Wo sind meine Socken? | pause | Suchspiel | turns.js:658 (11) | link (7) | 12-15 | | ✗ |
| zug-rap | Battle-Rap Zug um Zug | streit | Reimkarten wählen | turns.js:691 (10) | link | 12-07 | | ✗ |
| zug-stimme | Stimmen-Rätsel | abend | Stimme verzerren und raten | turns.js:712 (9) | link (stay) | 11-22 | ◆ | ✗ |
| zug-pokal | Der Pokal wandert | pause | Wanderpokal | turns.js:760 (18) | link | – | | ✗ |
| zug-reaktion | Wer zuckt zuerst? | streit | Reaktionsduell | turns.js:787 (24) | link | – | | ✗ |
| karte-regel | Neue Regel für alle | abend | Jeder tauscht ein Wort | turns.js:447 (11) | link (5) | – | | ✗ |
| beat-disco | Musik aus. Alle Statue | raum | Freeze-Spiel | turns.js:701 (11) | room | – | | ✗ |
| mut-tierstory | Tier-Aufstellung | raum | Tiergeräusche, wer war wer | turns.js:739 (11) | room | – | ◆ | ✗ |
| mut-werbung | Verkauf deinen Stift | raum | 30 s Dauerwerbung | turns.js:458 (23) | room | – | | ✗ |
| raum-streichen | Was machen wir jetzt? | raum | Vorschläge streichen | turns.js:829 (4) | room | – | | ✗ |
| raum-erklaeren | 60 Sekunden Erklären | raum | Begriff erklären | turns.js:837 (5) | room | – | | ✗ |
| raum-sorry | Der erste Satz | streit | Entschuldigung beginnen | turns.js:842 (37) | room | – | ◆ | ✗ |
| raum-damals | Damals mit 13 | geschenk | Erinnerungsrunde | turns.js:350 (14) | room | – | | ✗ |
| raum-maschine | Einer von uns ist Maschine | raum | Wer ist die Maschine? | turns.js:481 (8) | room | – | | ✗ |
| raum-suche | Such-Zettel | raum | Schnitzeljagd | turns.js:489 (17) | room | – | | ✗ |
| raum-maus | Drück mich | geschenk | Tipp-Spiel | turns.js:721 (7) | room | – | | ✗ |
| raum-papagei | Rückwärts-Papagei | pause | Rückwärts nachsprechen | turns.js:728 (11) | room | – | | ✗ |

### 1b. Weitere Arten

| id | Titel | kind | Mechanik | Engine (LOC) | Modi | Assets | on | Mark | mdi |
|---|---|---|---|---|---|---|---|---|---|
| advent-tuer | Dein Adventstürchen | card (Stil `advent`, `door: true`) | Türchen 1–24 gestalten (Nummer aus Datum, `alt:src/daily.js:321`), verschicken, Empfänger klappt auf (`alt:src/door.js`) | render.js (275), door.js (46), warm.js (182), noto.js | link | KI-Bild `wr:duell-img/advent-tuer.jpg`, Noto-Sticker-Set `advent` | 12-22, 12-24 (an jedem Tag über ⌂) | ★ ⌂ | ✗ |
| *(zug-advent, retired → advent-tuer)* | 24 Türen für eine Person | turn `advent` | Eine Person schreibt 24 Sätze, die andere öffnet Türen (Widget `doors`) | turns.js:668-673, turn-ui.js:336 | link (stay) | – | – | ★ (Adventskalender) | ✗ |
| arcade-kick | Stangen-Kick | arcade `kick` | Tischkicker, zwei Stangen, ein Daumen | arcade2.js:72-118 | Bot + live | – | 11-06/10/14/16 | ◆ | ✗ |
| arcade-elfer | Elfer-Duell | arcade `elfer` | Elfmeter | arcade2.js:283 | Bot + live | – | 12-05 | ◆ | ✗ |
| arcade-ziegel | Ziegel-Duell | arcade `ziegel` | Breakout im Duell | arcade.js:202-291 | Bot + live | – | 11-08 | | ✗ |
| arcade-panzer | Insel-Panzer | arcade `panzer` | Artillerie mit Wind | arcade.js:398 | Bot + live | – | 11-12, 11-18 | | ✗ |
| arcade-stock | Eis-Stock | arcade `stock` | Eisstock, rundenbasiert und deterministisch | arcade2.js:445 | Bot + live | – | 12-21, 12-23 | | ✗ |
| tisch-skat | Skat live | table `skat` | Skat zu dritt: reizen, drücken | skat.js (392), table.js (568), table-ui.js (505) | live | Kartendeck im Code gezeichnet (`alt:licenses/Kartendeck-CC0.txt`) | – | ◆ | ✗ |
| tisch-bauernskat | Bauernskat | table `bauernskat` | Skat zu zweit, 8 Stapel | bauernskat.js (231) | Bot oder Freund per Link (`alt:src/table-ui.js:1-3, 443-474`) | dto. | – | | ✗ |
| spiel-lava | Bau dein Lava-Level | game (Flug) | Flappy-artig, Parameter Schwerkraft/Sprung/Lücke/Tempo, Thema `lava` | core.js (465), engine.js (76), game.js (307), modes.js (365), duel.js (215), spur.js (119) | allein + Geist-Duell per Link | – | – | | ✗ |
| foto-alien | Beweisfoto: Alien | photo (Stil `glitch`) | Eigenes Foto als Poster/Meme; Foto nie im doc (`alt:src/daily.js:463`) | render.js, studio.js (153) | link (ohne Foto) | – | – | | ✗ |
| beat-pausenhof | Bau einen Beat | sound (`beat`) | 16-Schritt-Drumcomputer | klang.js (118), klang-ui.js (289), kit.js (147) | link | KI-Bild `wr:duell-img/beat-pausenhof.jpg` | – | | ✗ (PR #227: nur noch `strassenrap-beat`, 01-karten.md:48-50) |
| kanal-geheim | Geheimer Kanal | quest | Rätselfragen, die Antwort ist der Schlüssel (braucht `crypto`) | quest.js (76) | link | – | – | | ✗ |

### 1c. Eingeklappte Varianten (retired → Nachfolger, `ideas.json` Feld `to`)
Die Regeln vieler Varianten sind noch im Code. Sie können beim Wiederaufbau als Varianten der Nachfolgekarte zurückkommen.
Das betrifft besonders Arcade: `puck` (arcade.js:92), `volley` (arcade.js:292), `flipper` (arcade2.js:120), `snow` (arcade2.js:196)
und `murmel` (arcade2.js:463). Es folgen die Zuordnungen.
- spiel-lava ← spiel-mond, -pizza, -tiefsee, -neon, -geist, -einhorn, -retro, flug-agent, flug-mond, plan-01/08/13/18/22/28
- karte-danke ← karte-lob, karte-urkunde, warm-toll/-danke/-super/-denke/-daumen/-lachen/-freunde/-mutig/-besserung/-gruss
- advent-tuer ← plan-30, **zug-advent** · zug-gutschein ← zug-rubbellos · zug-abfragen ← zug-quiz · tisch-skat ← tisch-doko (doko.js 324 LOC)
- arcade-kick ← arcade-puck, -volley, -flipper · arcade-panzer ← arcade-snow · arcade-stock ← arcade-murmel
- zug-auktion ← auktion-quatsch, zug-deal, zug-teilen, zug-socke, zug-fallpreis · kanal-geheim ← kanal-link/-drei/-kennst/-staffel/-erfinder, raum-tunnel
- weitere: foto-alien ← foto-tour/-haustier/-essen; beat-pausenhof ← beat-boss, plan-05/12; zug-lob ← quiz-*; zug-auftrag ← mut-*;
  zug-termin ← karte-einladung, plan-09; zug-umschlag ← halloween, zug-morgen; zug-rap ← rap-*; zug-einig ← zug-rangliste;
  quiz-preis ← raum-schaetzen; zug-reihum ← zug-kerzen; zug-kapsel ← zug-post; zug-pokal ← raum-uhr; zug-kreis ← raum-tuer;
  raum-sorry ← warm-sorry; zug-stimme ← anruf-quiz/-stimme; mut-tierstory ← stimme-verzerren.

### 1d. Business-Regal (Flavor `business`, `alt:src/flavors/business/ideas.json`, 8 Karten)
biz-onboarding (`todo`), biz-umfrage-lunch (`umfrage`), biz-feedback-meeting (`feedback`), biz-aufgaben (`aufgaben`), biz-agenda (`agenda`),
biz-quiz-phishing (`phish`, quizspiele.js), biz-wichteln (`bwichteln`, flavors/business/games.js 68 + siegel.js 50),
biz-weihnachtsfeier (`feier`, feier.js 292 + feier-ui.js 280). Flavor-Schalter: `stat: false`, `eur: [1, 500]`, `adult: true`,
ohne `f_create` (`alt:src/flavors/business/flavor.json`). Dazu kommen biz.js (144) und das Protokoll (protokoll*.js, ≈590 LOC). Status in mdi: ✗.

---

## 2. Engines und ihre Karten

| # | Engine | Dateien (LOC) | Karten im Regal | Varianten / weitere Nutzer | mdi |
|---|---|---|---|---|---|
| E1 | **Zug per Link** (Regeltabelle `GAMES`, Seed im Link, kein Server) | turns.js 1228, turn-ui.js 777 (Widgets: pick 60×, text, slide, list, rank, alloc, money, pay, shop, doors, nim …), turn2.js 401, turn.json 1671 | 49 der 52 turn-Karten (Tab. 1a) | alle zug-/raum-/karte-Varianten | ◐ Kartenvertrag + Zug-Statechart vorhanden (`neu:src/contract/sdk.js`, `neu:src/app/machine.js`), nur bluff portiert |
| E1a | Zug-Plugins | feier (572), malrat (497 + malrat.json), dart (777 + dart.json), geschenke (83 + json), quizspiele (180 + json), siegel (50), satz (495), quizpack/quizmake/quiz-ui (386 + quiz-packs.json 1436), wish (84) | zug-malrat, spiel-dart, geschenk-finder, quiz-preis, zug-termin/einkauf/wichteln/reihum (Satz), zug-abfragen/typen | biz-weihnachtsfeier, biz-wichteln, biz-quiz-phishing | ✗ |
| E2 | **Flug** (Flappy-Physik, RANGES, Route, look, anim) | core.js 465, engine.js 76, game.js 307, modes.js 365, duel.js 215, spur.js 119, welt-ui.js 70, regeln.js/regler-ui.js 43 | spiel-lava | 15 Varianten; freie Karte Genre G1 (`wr:lib/duell-karte.mjs:1000`) | ✗ (Slice S5) |
| E3 | **Lauf** (Runner/Plattformer, „zweite Engine“) | lauf.js 44, lauf-engine.js 180, lauf-ui.js 357 | – (nur die freie Karte, Genre G2) | freie Karte | ✗ |
| E4 | **Arcade** (Echtzeitduell, deterministisch, „Bot = zweite Seite in derselben Seite“) | arcade.js 557, arcade2.js 528, arcade-ui.js 640, arcade.json 86, frei.js 71 | kick, elfer, ziegel, panzer, stock | puck, volley, flipper, snow, murmel | ✗ (S7) |
| E5 | **Live-Transport** (ct-agent WASM, WebRTC, `/api/play`) | live.js 159, live-ui.js 246, smooth.js 116, rpslive.js 64, ballduell.js 48, own.js 37 | alle Arcade- und Tischkarten | rps (`alt:src/live-ui.js:244`) | ◐ `neu:src/broker/live.js` (Protokoll wie Altcode), live-host/-frame |
| E6 | **Tisch** (Kartenspiele über E5) | table.js 568, table-ui.js 505, skat.js 392, bauernskat.js 231, doko.js 324, mpoker.js 116 | tisch-skat, tisch-bauernskat | tisch-doko | ✗ |
| E7 | **Karte/Poster-Renderer** (card, photo, Sticker, Wetter, Tür) | render.js 275, warm.js 182, door.js 46, wetter.js 30, noto.js 48 + noto-stickers.png, stickers.js 144, studio.js 153 | advent-tuer, foto-alien | warm-*, karte-* | ◐ `neu:src/render/render.js` (Primitive) + `gruss` |
| E8 | **Klang** (Beat, Stimme) | klang.js 118, klang-ui.js 289, kit.js 147 | beat-pausenhof | stimme-verzerren, zug-stimme | ✗ |
| E9 | **Quest** (verschlüsselte Rätsel) | quest.js 76 | kanal-geheim | kanal-* | ✗ |
| E10 | **Zusammen bauen** (Sync-Protokoll, LWW + Tombstones) | collab.js 314, collab-ui.js 166 | (Editor-Funktion) | – | ✗ |
| E11 | **Editor** (Blasen, Teile, Pinsel, Direkt) | blasen*.js 918, teile.js 140, direkt-ui.js 267, editmodel.js 116 | alle | – | ◐ Teile + Blasen-Ebene (`neu:src/ui/view.js:227`), Dialog |
| E12 | **Bot** | pro Engine eigen (nim turns.js:768, arcade `*Bot`, table Auto, Dart Bert) | – | – | ◐ generischer ISMCTS (`neu:src/bot/ismcts.js`) |

---

## 3. Freie Karte („Create your own card“)

### 3a. Ablauf im Client (alt)
1. **Einstieg:** Das Feld „Eigene Karte“ ist immer sichtbar im Regal (`alt:src/app.js:279` freeShow, Schalter `f_create`). Ohne Konto
   führt es zum Login und zeigt darunter Vorlagen (Memory project_karten_durchsicht). Robot: Aus jeder Deck-Karte wird eine freie Karte
   (`alt:src/robot-ui.js:1-10`, Blasen-Knopf).
2. **16+:** Ein Häkchen „16 oder älter“ setzt `profile = {via: "account", age16: true, t0}` (`alt:src/create-ui.js:136-142`). Danach
   folgt die Anmeldung, und die Rückkehr läuft über `?go=erschaffen`. Ohne `meter.age16` erscheint der Hinweis `create_age16` (`:155`).
3. **Zähler:** `POST /api/duell/ai/status` liefert `create: {size, remaining, credit, paused, off, age16, age18, topup…}`
   (`alt:src/create-ui.js:67-70`, `wr:lib/duell-ai.mjs:1299`). Die Zeile lautet „n von m übrig“ + Guthaben (`alt:src/create-ui.js:39-46`).
4. **Wahl:** Kategorie-Chip ohne Vorauswahl `card | meme | game | quiz | faehigkeit` (`:10`). Bei `game` folgt das Genre G1 Flug / G2 Lauf
   und „Wer spielt?“ (`:27-33`). Ehrliches „noch nicht“ mit Gegenvorschlag (`SOON`, `:34-36`; Server `wr:lib/duell-absage.mjs`). Kein Sound
   (Entscheidung 11.11., `:9`).
5. **Satz senden:** Die Krisenwörter werden zuerst auf dem Gerät geprüft (`alt:src/ai.js:8-26`). Dann folgt `POST /api/duell/ai {kind:"karte"}`
   (`alt:src/create-ui.js:219`), bei Andrang Ticket und `POST /api/duell/queue`.
6. **Warten:** ein Vollbild mit echten Zuständen, ohne Prozentangabe und ohne erfundenen Fortschritt. „Abbrechen“ ist immer da (`alt:src/warten.js:1-7`).
7. **Vorschau** mit KI-Badge. **Übernehmen** ruft `/ai/accept` auf und öffnet den Editor mit `own:true` und `doc.ki = {k:"karte", s, h}`
   (`alt:src/create-ui.js:304-308`). **Verwerfen** ruft `/ai/discard` auf, die Einheit kommt zurück.
8. **Teilen:** Den Kurzlink einer freien Karte gibt es nur, solange das Deck den Status „ok“ meldet (`wr:lib/shortlink.mjs:11-12`).
   Der Empfänger öffnet die Karte erst nach `GET /api/duell/deck/status` = ok (`alt:src/parts.js:73-78` gate).
9. **Deck:** Die Community-Karten kommen signiert (Ed25519) über `GET /api/duell/deck` und `/deck/key` (`alt:src/deck.js:1-8`).
   Nutzung zählt nur mit Login: `/deck/use` start→done nach ≥ 20 s. Daumen gibt es nach dem Öffnen über `/deck/vote`. Die erstellende
   Person sieht ihre Karten, ihr Guthaben und die Gründe unter `/deck/me`, Hinweise unter `/mod/me` und kann über `/mod/appeal`
   widersprechen (`alt:src/deck.js:22, 233, 247`).

### 3b. Server (alle vorhanden und unverändert nutzbar)
| Funktion | Endpunkt | Quelle |
|---|---|---|
| Erzeugen, Harness S0–S5 (Login, 16+, Pot `create`, Wortregeln, Moderation Ein-/Ausgabe, Siegel) | `POST /api/duell/ai` kind `karte`; `/queue`; `/ai/accept`; `/ai/discard`; `/ai/status` | `wr:lib/duell-karte.mjs:1-20`, `wr:lib/duell-ai.mjs:902-909, 1148-1210, 1295-1312`, `wr:lib/duell.mjs:633-635` |
| Robot (Deck-Karte → freie Karte, `data.base`) | dto. | `wr:lib/duell-frei.mjs:1-45` |
| Absage mit Gegenvorschlag | (Teil der Antwort) | `wr:lib/duell-absage.mjs:1-20` |
| Modell-Schicht (Haiku 5.5, Cache, Tages- und Monatsbudget, Anthropic/Ollama/LiteLLM) | – | `wr:lib/duell-llm.mjs:1-30` |
| Kontingent: 5 freie Karten „ever“ (`DUELL_CREATE_FREE`), 3 Ablehnungen/Tag, 30 Calls/Tag, Notschalter | – | `wr:lib/duell-ai.mjs:933-939` |
| Guthaben: +2 Nutzung (k Konten), +3 Deck-Aufnahme, Kappe 8/Karte, 30/Jahr; nicht käuflich | – | `wr:lib/duell-credit.mjs:1-30` |
| Gutschein | `POST /api/duell/credit/redeem` | `wr:lib/duell-voucher.mjs:1-25, 82` |
| Deck, Nutzung, Daumen, Status | `GET /api/duell/deck`, `/deck/key`, `/deck/status?c=`; `POST /deck/use`, `/deck/vote`, `/deck/me` | `wr:lib/duell-deck.mjs:1-60, 683-740` |
| Moderation (DSA Art. 17/20), Strikes, Widerspruch | `POST /api/duell/mod/me`, `/mod/appeal`; Admin `GET /api/duell/mod`, `POST /mod/<mid>` | `wr:lib/duell-mod.mjs:1-40` |
| Prüfansicht | `GET /duell/pruefen`, Admin `/api/duell/deck/review[/<cid>]`, `/api/duell/admin/stat` | `wr:lib/duell-deck.mjs:684, 706-722` |
| Siegel prüfen / Melden | `POST /api/duell/seal`, `POST /api/duell/report` | `wr:lib/duell-report.mjs:1-30, 177-197` |

Status in mdi: ✗. `neu:` enthält keinen einzigen Server-Aufruf außer `/api/play` (`neu:src/broker/live.js:11`). Die Kartenmanifeste
markieren KI-füllbare Felder bereits mit `x-model` (`neu:src/cards/gruss/manifest.json`). Daran kann die Erzeugung andocken (04-erzeugung.md).

---

## 4. Konto, Login und alle sichtbaren Funktionen mit Server-Anteil

| Funktion | Client (alt) | Endpunkt(e) | Server | mdi |
|---|---|---|---|---|
| **Login Web** (bunsenbrenner-Gate, Cookie `ct_gate_session`, Identität aus `X-Gate-Email` der Gate-Antwort, fail closed) | ai.js:18-22 (Rücksprungpfad), stimme-ui.js:30 | Gate `DEMO_GATE_CHECK_URL` | `wr:lib/auth.mjs:1-21, 45-67` | ✗ |
| **Login Apps** (heute: kein Cookie in den Shells → keine Konto-Funktionen; Bearer nur für Relay) | – | – | 07-konto-guthaben.md (Abschnitt Auth heute) | ✗; Ziel laut Plan: OIDC + PKCE, ein Bearer (KONZEPT.md:130 [offen], Slice S8). Keycloak steht hinter dem Gate; im Wrapper nur über das Gate sichtbar |
| **Profil „Mein Stil“** (Nick, Emoji, Farben, Sticker-Set, Lesen/große Schrift, einfache Sprache, Vorgaben, „Konto & Daten“) | stil.js 226, profile.js 303, app.js:816-832 | `POST /api/duell/profile/get|put|delete` | `wr:lib/duell-profile.mjs:1-20, 245` | ✗ |
| **16+ / 18+** (Selbstauskunft, Tag gespeichert; 18+ für PayPal.me und Abo) | create-ui.js:136-155, turn-ui.js:188-191 | profile/put `age16`, `age18` | `wr:lib/duell-profile.mjs:200, 268-271` | ✗ |
| **Geräte-Code (Sync ohne Konto, 128 Bit)**, Drei-Wege-Merge | profile.js:14-40 | profile/* `via:"code"` | dto. | ✗ |
| **KI-Zähler / Pots** (free 7/Woche, pro, business, trial) | ai.js | `/api/duell/ai/status` | `wr:lib/duell-pots.mjs:1-30` | ✗ |
| **Guthaben + Aufladen** (Ansicht PR #231 offen) | create-ui.js:39-50 | `/ai/status`, `/credit/redeem` | `wr:lib/duell-credit.mjs`, `wr:lib/duell-voucher.mjs` | ✗ |
| **KI-Bild** (Karte, Logo, Account-Bild; 3/Monat gratis, dann 1 Guthaben; Avatar nur mit Guthaben) | kibild.js 253 | `POST /api/duell/bild[/status|job|cancel|keep|avatar]`, `GET /duell/bild/<id>` | `wr:lib/duell-bild.mjs:1-45, 558-588` | ✗ |
| **KI-Wunsch / Zeile / Meme / Text / Welt / Plan / Liste / Quiz / Anlass** | wish.js, welt-ui.js, satz*.js, texte.js, quizmake.js | `POST /api/duell/ai` kinds `wish, line, meme, lyrics, plan, liste, quiz, welt, text, anlass` | `wr:lib/duell-ai.mjs:301-780` | ✗ |
| **Wetter auf der Karte** (Open-Meteo, keine KI) | wetter.js 30 | `POST /api/duell/ai/weather` | `wr:lib/duell-weather.mjs` | ✗ |
| **Push** („Bescheid geben“, nur Weckreiz `reply`/`live`) | push.js 158, push-sw.js | `GET /api/duell/push/key`, `POST …/subscribe|unsubscribe|wake`, `GET /duell/push-sw.js` | `wr:lib/duell-push.mjs:1-40, 219-236` | ✗ |
| **Statistik + Daumen** (Daumen nur mit Konto; Schalter „Statistik aus“) | stat.js 66, stimme-ui.js 72 | `POST /api/duell/stat`, `GET /api/duell/stat?days=` | `wr:lib/duell-stat.mjs:1-20, 299` | ✗ |
| **Melden** (Gründe harm, sex, hate, private, wrong, other) | melden.js 34, ai.js:110 | `POST /api/duell/report` | `wr:lib/duell-report.mjs` | ✗ |
| **Kurzlinks** (beim „Fertig“ angelegt, 90 Tage; Vorschaubild 1200×630) | shortlink.js 76 | `POST /api/s`, `GET/DELETE /api/s/<id>`, `PUT /api/s/<id>/img`, `GET /s/<id>`, `/s/img/…` | `wr:lib/shortlink.mjs:1-12, 412` | ✗ |
| **Status-/Story-Bild 9:16 mit QR** | statuscard.js 46 (+ qrcode-generator) | – | – | ✗ |
| **Meine Wand** (gespeicherte Werke, Rückgängig, Sync übers Profil, keine Fotos) | app.js:895-941, daily.js:506-524 | via profile/put | `wr:lib/duell-profile.mjs:18-22` | ✗ |
| **Gemerkte Karten** | profile.js:19-28 | via profile/put | dto. | ✗ |
| **Eigene Einladungen** (Einmal-Token nicht selbst verbrauchen) | own.js 37 | – | – | ◐ Live-Broker |
| **Moderationshinweise / Widerspruch** | deck.js:233-247 | `/mod/me`, `/mod/appeal` | `wr:lib/duell-mod.mjs` | ✗ |
| **Business-Sicht** (Onboarding, Feedback, Agenda, Wichteln, Feier) | flavors/business/*, biz.js | `/duell/business/`, AI-Pot business (Entitlement-Key) | `wr:lib/duell.mjs:641-643`, `wr:lib/duell-pots.mjs:6-11` | ✗ (Slice S14b) |
| **Protokoll** (whisper.cpp im Browser, Text nur nach Ja an KI-Art `protokoll`) | protokoll.js 286, protokoll-page.js 278 | `GET /duell/protokoll`, `/api/duell/ai` kind `protokoll` | `wr:lib/duell.mjs:637-638`, `wr:lib/duell-ai.mjs:349` | ✗ |
| **Startseite mit Absichten** (Gruß, Planen, Spielen, Stimme; ein Satz → passende Karte; „fehlt noch“) | start.js 105, start-ui.js 576, start.json | – | – | ✗ |
| **Tagesrotation, Suche, Kalender, Feiertage** | daily.js 545, kalender.js/json | – | – | ◐ Regal mit fester Reihenfolge (`neu:src/cards/index.js:9`), ohne Rotation |
| **Lizenzen, i18n de/en, offline-Teile** | parts.js, build.js | – | – | ◐ (09-plattform.md) |

---

## 5. Darstellung: alt, neu und „YouTube-Thumbnail-Stil“

**Alt (gemessen am Code):**
- Kachel „Alle Karten“: Raster `minmax(9.5rem,1fr)`, Bild 216×288 (3:4) als echter Screenshot des Spiels in einem festen Moment.
  Darunter der Titel in Großbuchstaben (Anton, 2 Zeilen), die Art klein und ein Dauer-Badge (`alt:src/start-ui.js:69-76, 199-232`).
  Die Screenshots erzeugt Playwright (`alt:scripts/shots.js:1-14`), sie werden als data:-URLs in Teile gepackt (`alt:scripts/build.js:165-176`).
- KI-Bilder der Tageskarten: FLUX.1-schnell, 960×540 (16:9). Der Stil-Prompt verlangt **bereits ausdrücklich**
  „youtube thumbnail style, bold graphic composition, one clear hero subject, strong rim light, saturated punchy colours, high contrast,
  … no text“ (`alt:src/thumbs.json` Feld `style`). Ausgeliefert werden sie über `GET /duell/img/<id>.jpg` (`wr:lib/duell.mjs:7, 644`), angezeigt auf dem
  Tagesblatt statt der gezeichneten Vorschau (`alt:src/app.js:163-171`). Abdeckung: 28 Einträge in thumbs.json, 48 JPGs in `wr:duell-img/`,
  davon passen nur **2 von 64** Regalkarten (advent-tuer, beat-pausenhof). Der Rest gehört zu eingeklappten oder Business-Karten.
- **Neu:** Das Regal besteht aus Textknöpfen (Kicker, Titel, Teaser) ohne Bild (`neu:src/ui/view.js:131-138`).

**Was der YouTube-Thumbnail-Stil ändern würde (Arbeitshypothese, nicht belegt):** ein großes Bild statt Text (16:9 oder 3:4 offen);
ein Motiv mit Gesicht oder Emotion; hoher Kontrast; ein fetter Kurztitel mit 2–4 Wörtern, den der Client darüberlegt (die Bilder bleiben
textfrei, also bleibt i18n möglich); eine Akzentfarbe je Kategorie (`grip`-Farben in `alt:src/turn-ui.js:722`).

**Recherche, die noch aussteht (bewusst nichts erfunden):**
1. Belege zur Wirkung von Gesichtern, Text im Bild und Kontrast auf die Klickrate von Vorschaubildern. Quellen: Creator-Leitfäden der Plattform und
   empirische Studien. Literatur prüfen, bevor sie zitiert wird.
2. Konflikt mit „Keine Manipulation“ (Memory feedback_no_dark_patterns): Der Titel muss halten, was die Karte tut. Clickbait-Regeln festlegen.
3. Gesichter: Echte Personen sind im KI-Bild verboten (`wr:lib/duell-bild.mjs:26-35`). Es bleiben gezeichnete oder generierte Figuren.
   Für eine Jugend-Zielgruppe klären.
4. Format 16:9 gegen 3:4 im Raster bei 360 px Breite, Lesbarkeit des Overlay-Titels (WCAG-Kontrast, Zoom 200 %), Alt-Texte.
5. Herkunft: KI-Thumbnail (FLUX auf cs4f, kommerziell nutzbar laut Memory project_gpu_commercial_use) oder echter Spiel-Screenshot oder eine Mischung.
   Bildbudget offline (Teile ≈ 80 KB, `alt:scripts/build.js:165`).
6. Design-Kritik nach 04-ux/design-prozess.md mit 2–3 Varianten am echten Regal.

---

## 6. Vorgeschlagene Slices (nach Nutzerwert)

Zuordnung zu den bestehenden Slices aus 06-plan/slices-detail.md in Klammern. „Server“ bedeutet, dass die Schnittstelle ohne
Änderung wiederverwendet werden kann, sofern nichts anderes dasteht.

| # | Slice | Inhalt (Abschnitte oben) | Server | Abnahme (Alt-Orakel) |
|---|---|---|---|---|
| **P1** | **Konto & Login** (S8 + Teil S11) | Login Web (Gate-Cookie, gleiche Herkunft), Anmelden/Abmelden, 16+/18+, „Mein Stil“ mit Profil-Sync (Konto und Geräte-Code), KI-Zähler, Guthaben-Anzeige, Moderationshinweise | profile/*, ai/status, mod/me: unverändert. **Neu nötig:** Bearer/OIDC für die Apps (KONZEPT.md:130) | profile.test, stil, ki, gutschein (07-konto-guthaben.md) |
| **P2** | **Freie Karte** (S9 + Teil S11/S13) | Abschnitt 3 komplett: Feld immer im Regal, Kategorie/Genre, Warten, Übernehmen/Verwerfen, Absage, Aufladen per Gutschein, Deck-Status-Gate beim Empfang, Deck-Regal, Daumen, /deck/me. Danach Robot und Magie | alles aus 3b | create-*, robot, frei-vectors.json, deck |
| **P3** | **Regal im Thumbnail-Stil + Tagesrotation** (S2/S3) | Bildkacheln, Rotation nach UTC-Tag, Kalenderkarten, Suche, Startabsichten; Recherche aus Abschnitt 5 vorher | `/duell/img/<id>.jpg`, `/duell/bild/` (vorhanden); **neue Bilder** für 62 Karten erzeugen | start, home*, search, vorschau |
| **P4** | **Top-Karten „Planen & Geld“** (S6, Teil 1) | ★ zug-sammeln, zug-termin, zug-einkauf, zug-wichteln, zug-reihum, zug-einig, zug-wunschzettel, geschenk-finder; Widgets money/pay/shop/slots/list; Satz zu Formular | `/api/duell/ai` kinds `plan`, `liste` | turns.test (Teil), turn.e2e, wichteln |
| **P5** | **Gruß & Saison** (S3 + S6) | ★ advent-tuer (Tür 1–24, Aufklappen) + 24-Türen-Variante (zug-advent), karte-danke inkl. warm-Varianten, zug-umschlag, zug-kapsel, zug-gutschein, raum-sorry, Wetter, Noto-Sticker | `/ai/weather` | door.e2e, warm.e2e, karte.e2e |
| **P6** | **Arcade + Live + Bot** (S7) | 5 Arcade-Karten + 5 Varianten (Volley u. a.), Live über vorhandenen Broker, Bot je Spiel oder ISMCTS, anpassbar inkl. eigener Fotos (Memory project_spiele_anpassbar) | `/api/play` (Webkonferenz) | arcade.test, arcade.e2e, live |
| **P7** | **Spiele mit eigener Oberfläche** (S6/S7) | spiel-dart (Bot Bert), zug-malrat, zug-abfragen/typen mit Fragepaketen, quiz-preis, zug-stimme | `/ai` kind `quiz` | malrat, dart, quizpack |
| **P8** | **Flug, Lauf, Tisch** (S5, S7) | spiel-lava + Geist-Duell, Lauf-Engine (für freie Karte G2), Skat live, Bauernskat Bot/Link, Doppelkopf als Variante | `/ai` kind `welt` | d1, lauf-replay, spur-golden, table |
| **P9** | **Restliche Zug- und Raum-Karten** (S6, Teil 2) | ≈30 Karten aus Tabelle 1a als Vertragskarten (Massenport, gleiche Widgets), kanal-geheim, foto-alien, Beat (strassenrap-beat) | – | turns.test portiert, turn.e2e (28) |
| **P10** | **Teilen & Rückkanal, Business** (S13, S14b) | Kurzlinks, Story-Bild/QR, Push, Wand, Statistik, Melden, KI-Bilder; danach Business-Flavor + Protokoll | shortlink, push, stat, report, bild: unverändert | push.test, wand, stat, kibild, business.e2e |

**Reihenfolge-Begründung:** Der Nutzer hat Konto/Login und die freie Karte ausdrücklich als fehlend bzw. essenziell genannt. Beide Server-Seiten sind
vollständig vorhanden, deshalb liefern P1 und P2 den größten Nutzen pro Aufwand. P2 hängt von P1 ab (Login, 16+). P3 macht das Regal
sichtbar. P4 und P5 tragen die vom Nutzer genannten Karten. Danach folgen die Engines (P6–P8) und der Rest (P9, P10).

**Offene Punkte für den Nutzer**
- Nutzungszahlen: Sollen wir `GET /api/duell/stat?days=90` vom Live-System abrufen, damit die „besten Karten“ belegt statt kuratiert sind?
- „Adventskalender“: einzelnes Türchen (advent-tuer), die 24-Türen-Karte (zug-advent) oder beides als Varianten?
- Thumbnail-Format (16:9 oder 3:4) und Bildquelle (KI oder Screenshot), siehe Abschnitt 5.
- Apps-Login: Bearer/OIDC braucht neue Server-Arbeit (S8), die Web-Variante funktioniert sofort mit dem Gate-Cookie.
