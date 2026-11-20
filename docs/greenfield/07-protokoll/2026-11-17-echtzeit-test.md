# Echtzeit-Test My Daily Idea (Desktop und Handy)

Rolle: unabhängiger Tester. Es wurde nur getestet, nichts repariert und nichts committet.

- Stand: `origin/main` 16763f09 (gleich Produktion), Arbeitskopie `/Users/dev/Documents/git/mdi-tester` (detached worktree, node_modules als Symlink), `node scripts/build.js`, ausgeliefert wie die e2e als `file://…/dist/index.html` mit `nolive.js` (kein Netz).
- Browser: Playwright, chrome-headless-shell 1243. Desktop 1280×800 (Tastatur und Maus), Handy 390×844 mit `isMobile` und `hasTouch`. Touch kam als echte CDP-Touch-Ereignisse.
- Bot: ein Skript liest die gezeichneten Kreise, Rechtecke und Texte der Bühne in Spielkoordinaten mit (Hook auf `CanvasRenderingContext2D`) und steuert je Spiel sinnvoll: Ball verfolgen, kicken, springen, ausweichen, zielen, wischen, schleudern. Es nutzt nur die Steuerung, die auch ein Mensch hat (Pfeile, Leertaste, Maus, Touch). Je Spiel und Eingabeart wurden mindestens 60 s gespielt oder bis zum Spielende, danach „Nochmal“. Zusätzlich liefen Pause, Weiter, Taste P und Ton, eigene Figur 🐙, ein Abprall-Rekorder für die Kollisionen und eine Messung der Bildzeiten.
- Rohdaten und Skripte liegen im Scratchpad der Sitzung (nicht im Repo).
- Screenshots: `2026-11-17-echtzeit-test/`.

Die vom User gemeldeten Fehler in **Flug** (Röhre, Hitbox, „Du“ punktet nie, schmales Feld) und **Breakout/Ziegel** (keine Feinsteuerung, Stand doppelt) sind hier nicht noch einmal aufgeführt. Wo derselbe Fehler auch andere Spiele betrifft, steht er unten, weil eine Reparatur nur in Flug oder Ziegel ihn nicht beseitigen würde (F1, F2, F6).

## Getestete Spiele

| Spiel | Quelle | Desktop Tasten | Desktop Maus | Handy Touch | Ende erreicht |
|---|---|---|---|---|---|
| Ziegel-Duell (Breakout) | `src/cards/arcade-ziegel`, `src/engines/arcade/ziegel.js` | ja (2×) | ja | ja | ja |
| Puck-Duell | `arcade-puck`, `puck.js` | ja (2×) | ja | ja, +🐙 | ja |
| Netz-Volley | `arcade-volley`, `volley.js` | ja (2×) | ja | ja, +🐙 | ja |
| Stangen-Kick | `arcade-kick`, `kick.js` | ja (2×) | ja | ja (2×), +🐙 | 1 von 9 Läufen nein (F9) |
| Schnee-Schlacht | `arcade-snow`, `snow.js` | ja (2×) | ja | ja, +🐙 | ja |
| Flipper-Duell | `arcade-flipper`, `flipper.js` | ja (2×) | ja | ja, +🐙 | ja |
| Elfer-Duell | `arcade-elfer`, `elfer.js` | ja (2×) | ja | ja (2×) | ja |
| Insel-Panzer | `arcade-panzer`, `panzer.js` | ja (2×) | ja (2×) | ja, +🐙 | ja |
| Eis-Stock | `arcade-stock`, `stock.js` | ja (2×) | ja | ja | ja |
| Murmel-Ring | `arcade-murmel`, `murmel.js` | ja (2×) | ja (2×) | ja | ja |
| Flug („Bau dein Lava-Level“) | `src/cards/flug`, `src/engines/flug` | ja (2×) | ja | ja | ja |
| Lauf und Sprung | `src/cards/lauf`, `src/engines/lauf` | ja (2×) | ja | ja | ja |
| Spiel aus dem Baukasten (Flappy-Vorlage) | `src/cards/baukasten`, `src/engines/baukasten` | ja | ja | ja | ja |
| Dart im Wohnzimmer (Zugspiel mit Timing) | `src/cards/spiel-dart`, `src/engines/dart` | Maus, Timing | – | Touch, Timing und „gerade“ | ja |

Quelle der Liste sind die Manifeste mit `kind: "realtime"` (10× arcade, flug, lauf, baukasten). Dart ist ein Zugspiel, hat aber einen Timing-Wurf und wurde deshalb mitgetestet.

Nicht getestet:
- „Wer zuckt zuerst?“ (`zug-reaktion`, Reaktionszeit, Zugspiel).
- Live-Modus mit zwei Geräten.
- Escape-Taste.

## Was in Ordnung war

- **Konsole:** 0 Fehler, 0 CSP-Verstöße in allen ~60 Läufen. Kein Netzverkehr außer `file:`.
- **Pause:** Pause und Weiter halten das Spiel in allen 13 Spielen an (die Szene bleibt stehen, „Pausiert“ wird angesagt). Taste P pausiert und setzt fort.
- **Ton:** Der Schalter wechselt sichtbar und per `aria-pressed`.
- **Neustart:** „Nochmal“ startet in jedem Spiel neu (Countdown, dann Spiel).
- **Kollisionen in den Arcade-Ballspielen:** Ziegel, Puck, Volley, Kick und Flipper passen zum Bild. Ausgewertet wurden 472 Abpralle; keiner lag mehr als 40 Einheiten (von 1000) neben einem gezeichneten Objekt, der Median des Abstands lag zwischen −11 und 0.
- **Punkte für beide Seiten:** Gegen den Computer zählen in allen Arcade-Spielen Punkte für Du und Bot.
- **Bildrate:** 59 bis 60 fps, p95 18 ms (Ausnahme F12).
- **Touch-Ziele:** Alle Touch-Ziele sind mindestens 44 px groß.
- **Handy-Layout:** Kein waagrechter Überlauf und nichts verdeckt. Die Bühne ist auf dem Handy zentriert.
- **Tastenfahrt:** Mit Fokus auf dem Spielfeld sind Tasten und Maus gleich schnell. Puck: 856 Einheiten in 170 ms mit Tasten, 106 ms mit der Maus.

## Zusammenfassung der Funde

| Schwere | Anzahl |
|---|---|
| blockiert | 2 |
| stört | 10 |
| kosmetisch | 7 |

## Funde

### F1 – Desktop: Spielfeld klein, links statt mittig, Bedienung neben dem Feld (alle Arcade, Lauf, Baukasten)

- **Spiel / Viewport:** Alle 10 Arcade-Spiele, Lauf und Baukasten; Desktop 1280×800.
- **Schritte:** Regal → z. B. Stangen-Kick → „Gegen den Computer“.
- **Erwartet:** Das Spielfeld nutzt die Höhe und steht mittig.
- **Tatsächlich:**
  - Die Leinwand ist 288×460 px groß, das sind 13 % des Bildschirms (Flipper 18 %, Lauf 14 %).
  - Die Bühne steht in der linken Spalte, ihre Mitte liegt 192 px links der Bildschirmmitte.
  - Die rechte Spalte (360 px) bleibt während des Spiels leer.
  - Die runden Pfeilknöpfe (84 px) und die Kopfzeile nehmen dem Feld Höhe weg.
- **Schwere:** stört.
- **Ursache (vermutet):**
  - `src/ui/tokens.css:50` legt für `.main` ab 900 px zwei Spalten fest (`minmax(0,1fr) 360px`), auch im Zustand `card-rt-*`.
  - `src/render/widgets.css:60-63`: Die Bühne ist `calc(100dvh - 9rem)` hoch, die Leinwand bekommt nur die Resthöhe.
  - Für Flug ist der Fehler gemeldet; die Ursache ist dieselbe für alle Echtzeitspiele.
- **Screenshots:** `2026-11-17-echtzeit-test/01-desktop-feld-schmal-links-kick.png`, `01b-desktop-feld-schmal-puck.png`.

### F2 – Spielstand steht doppelt (alle Arcade, Baukasten)

- **Spiel / Viewport:** Alle 10 Arcade-Spiele und Baukasten; beide Viewports.
- **Schritte:** Ein beliebiges Arcade-Spiel starten.
- **Erwartet:** Der Stand steht einmal da.
- **Tatsächlich:** „Du 0 : 0 Bot“ steht oben im Feld (Canvas-HUD) und noch einmal unter dem Feld (`.rt-say`). Beim Baukasten steht „0 : 0“ zweimal.
- **Schwere:** kosmetisch.
- **Ursache:** `src/engines/arcade/card.js:75` (`hud: … + t.say`) und `src/render/rt-stage.js:110` (`.rt-say` zeigt `status.say`). Für Ziegel ist das gemeldet; die Reparatur muss im gemeinsamen Code erfolgen, sonst bleibt es in den anderen neun Spielen.
- **Screenshot:** `15-spielstand-doppelt-kick.png`.

### F3 – Der Endstand zeigt den letzten Punkt nicht („Gewonnen!“ bei 4 : 4)

- **Spiel / Viewport:** Alle Arcade-Spiele; beide Viewports. Belegt in Schnee, Puck, Volley, Ziegel, Kick, Flipper, Stock und Murmel.
- **Schritte:** Gegen den Computer spielen, bis jemand die Siegpunktzahl erreicht.
- **Erwartet:** Der Endbildschirm zeigt den Endstand, z. B. „Du 5 : 4 Bot“.
- **Tatsächlich:**
  - Schnee: „GEWONNEN!“ über „Du 4 : 4 Bot“.
  - Puck: „GEWONNEN!“ über „Du 4 : 1 Bot“.
  - Volley, Ziegel und Puck enden auf „Du 4 : 0“, obwohl auf 5 gespielt wird.
  - Der alte Zughinweis bleibt stehen, z. B. „Gegner ist dran …“ (Stock) oder „Du hältst – ziehen!“ (Elfer).
  - Gewinnt der Bot, stimmt es manchmal („Knapp! 2:5“), manchmal nicht („Du 0 : 4“).
- **Schwere:** stört (das Ergebnis wirkt falsch).
- **Ursache:** `src/app/rt/session.js:32-33`. `finish()` ruft `loop.stop()` auf, bevor noch einmal `onFrame` zeichnet. Die Leinwand und `.rt-say` behalten das Bild vor dem letzten Tick.
- **Screenshots:** `02-endstand-fehlt-schnee-gewonnen-4-4.png`, `02b-endstand-fehlt-puck-gewonnen-4-1.png`, `02c-endstand-fehlt-stock-hinweis-veraltet.png`.

### F4 – Nach Klick auf Pause, Weiter oder Ton reagiert das Spiel nicht mehr auf Tasten; die Leertaste pausiert erneut

- **Spiel / Viewport:** Alle Echtzeitspiele; Desktop mit Maus und Tastatur.
- **Schritte:**
  1. Puck starten.
  2. Mit der Maus „Ton“ klicken.
  3. → gedrückt halten.
  4. Leertaste drücken.
  5. Mit der Maus „Pause“, dann „Weiter“ klicken.
  6. Leertaste drücken.
- **Erwartet:** Pfeile und Leertaste steuern weiter das Spiel.
- **Tatsächlich:**
  - Der Fokus bleibt auf dem HUD-Knopf (`rt-btn rt-sound` bzw. `rt-pause`).
  - Pfeile tun nichts: Der Schläger blieb bei x = 72, gemessen.
  - Die Leertaste schaltet den Ton um bzw. pausiert sofort wieder. In 13 von 13 Spielen stand nach „Weiter“ und Leertaste wieder `card-rt-pause` da.
  - In Kick, Schnee und Volley (Spieltaste Leertaste) ist das Spiel per Tastatur damit nicht mehr spielbar, bis man ins Feld klickt.
- **Schwere:** blockiert (Tastaturbedienung).
- **Ursache:** `src/render/rt-stage.js:66-68` ignoriert jede Taste, deren Ziel ein `BUTTON` ist. Die HUD-Knöpfe geben den Fokus nach dem Klick nicht an die Leinwand zurück.
- **Screenshots:** `03-fokus-leertaste-pausiert-wieder.png`, `03b-fokus-auf-ton-tasten-tot-kick.png` (Kick: „Ton aus“ hat den Fokus).

### F5 – Handy: „Nochmal“ liegt am Spielende unter dem Bildschirmrand

- **Spiel / Viewport:** Alle Echtzeitspiele; Handy 390×844.
- **Schritte:** Ein Spiel bis zum Ende spielen.
- **Erwartet:** „Nochmal“ ist ohne Scrollen sichtbar.
- **Tatsächlich:** Der Ergebnistitel schiebt die Bühne nach unten. „Nochmal“ beginnt bei y = 858 (Arcade, Baukasten) bzw. 918 (Flug, Lauf), sichtbar sind 844 px. Auf dem Endbildschirm stehen noch die nutzlosen ←/→-Knöpfe.
- **Schwere:** stört.
- **Ursache (vermutet):** `.rt-stage` behält im Zustand `card-rt-over` die volle Höhe `calc(100dvh - 9rem)` (`widgets.css:60`), dazu kommt der Ergebnistitel (`ui/view.js:353`).
- **Screenshots:** `04-handy-nochmal-unter-dem-rand-volley.png`, `04b-handy-nochmal-unter-dem-rand-lauf-gewinnt-2.png`.

### F6 – Lauf: Figur, Münzen und Hindernisse sind gegen ihre Hitbox versetzt

- **Spiel / Viewport:** Lauf und Sprung; beide Viewports.
- **Schritte:** Lauf → „Gegen den Computer“ → Start. Auf den gestrichelten Ring des Computer-Läufers achten.
- **Erwartet:** Figur und Ring (Hitbox) decken sich.
- **Tatsächlich:**
  - Der Fuchs ist rund 30 Einheiten nach rechts und 30 nach oben verschoben (eine halbe Figurengröße). Die Hitbox (26×40) sitzt an der linken unteren Ecke des Bildes.
  - Münzen und Gegner sind um eine halbe Größe nach links oben verschoben.
  - Sprünge wirken dadurch zu früh oder zu spät.
- **Schwere:** stört.
- **Ursache:**
  - `src/render/canvas.js:228-233` zeichnet ein `sprite` mit x,y als Mitte. `arcade/view.js:119` nutzt diesen Vertrag.
  - `src/engines/lauf/view.js` übergibt dagegen links oben: Läufer `x:-30, y:-54`, Gegenstände `x:-sz/2`.
  - Im Flug ist dieselbe Ursache gemeldet. Wird nur `flug/view.js` korrigiert, bleibt Lauf falsch. Wird `canvas.js` umgestellt, verschiebt sich Arcade.
- **Screenshot:** `05-lauf-figur-neben-hitbox-ring.png`.

### F7 – Baukasten: Figur stirbt vor der Berührung mit der Röhre

- **Spiel / Viewport:** Spiel aus dem Baukasten (Flappy-Vorlage); beide Viewports.
- **Schritte:** Baukasten → „Gegen den Computer“ → flattern, bis die erste Röhre kommt.
- **Erwartet:** Die Figur stirbt, wenn sie die Röhre sichtbar berührt.
- **Tatsächlich:**
  - Die Figur verblasst im freien Spalt, noch vor der Röhrenkante.
  - In 4 von 4 Läufen kam der Bot nicht über 1 Punkt, der Computer kam auf 14.
- **Schwere:** stört.
- **Ursache:** Dieselbe wie F6. `src/engines/baukasten/engine.js:513` übergibt `x: cx - w*k/2, y: cy - h*k/2`, das Emoji wird also eine halbe Größe links oberhalb der Hitbox gezeichnet.
- **Screenshot:** `06-baukasten-tod-vor-beruehrung.png` (4 Bilder im Abstand von etwa 0,2 s).

### F8 – „Diesmal gewinnt: 2.“ statt „Computer“ (Flug, Lauf, Baukasten), Dart „Spieler 2“ statt „Bert“

- **Spiel / Viewport:** Flug, Lauf, Baukasten und Dart; beide Viewports.
- **Schritte:** Gegen den Computer verlieren.
- **Erwartet:** „Diesmal gewinnt: Computer.“ bzw. „… Bert.“
- **Tatsächlich:**
  - Der Titel lautet „DIESMAL GEWINNT: 2.“.
  - Dart: „DIESMAL GEWINNT: SPIELER 2.“, darunter „Bert gewinnt. Revanche?“.
  - Baukasten zeigt den Stand ohne Namen („1 : 14“).
- **Schwere:** kosmetisch.
- **Ursache:** `src/ui/view.js:353` mit `seatName(card, …, st.winner)`. Für Karten ohne Sitznamen fällt die Nummer heraus, der Modus „bot“ wird nicht berücksichtigt.
- **Screenshots:** `14-flug-gewinnt-2.png`, `04b-…-lauf-gewinnt-2.png`, `07-baukasten-gewinnt-2-pfeile-ohne-funktion.png`, `13-dart-gewinnt-spieler-2-statt-bert.png`.

### F9 – Stangen-Kick: Ball bleibt liegen, die Partie endet nie

- **Spiel / Viewport:** Stangen-Kick; Desktop, Tasten (1 von 9 Kick-Läufen).
- **Schritte:**
  1. Kick gegen den Computer spielen.
  2. Der Ball rollt in die obere rechte Ecke hinter den Torwart des Bots.
  3. Warten.
- **Erwartet:** Neuer Anstoß nach spätestens `HOLD` = 6 s.
- **Tatsächlich:**
  - Der Ball lag 90 s still, der Stand blieb „Du 2 : 1 Bot“.
  - Kein Anstoß, kein Ende; nach 180 s wurde abgebrochen.
  - Keine Seite kann den Ball erreichen.
- **Schwere:** blockiert (nur „Zurück“ hilft).
- **Ursache (vermutet):** Die Übergabe in `src/engines/arcade/core.js:113-125` (`halfStep`/`held`/`halfGive`). Vermutlich hält jede Seite den Ball für den der anderen (`held`), oder `HOLD` greift auf der Seite des Bots nicht. Nicht weiter eingegrenzt.
- **Screenshot:** `03b-fokus-auf-ton-tasten-tot-kick.png` (Ball oben rechts in der Ecke, 90 s unverändert).

### F10 – Handy: Bedienknöpfe passen nicht zum Spiel; die Hauptaktion hat keinen Knopf

- **Spiel / Viewport:** Panzer, Elfer, Stock, Murmel; außerdem Kick, Schnee und Volley; Handy.
- **Schritte:** Insel-Panzer auf dem Handy starten.
- **Erwartet:**
  - Ein Knopf für Feuer bzw. Werfen, oder ein sichtbarer Hinweis auf die Geste.
  - Knöpfe, die zur Steuerung passen.
- **Tatsächlich:**
  - Unter dem Feld stehen immer nur ← und →.
  - Panzer: ←/→ ändern nur die Kraft. Winkel und Feuer gehen nur per Schleuder-Wisch im Feld, und darauf weist nichts hin.
  - Stock und Murmel: ←/→ drehen den Wurf, werfen kann man nur per Wisch.
  - Elfer: Schießen geht nur per Wisch; der Text „wischen!“ steht im Feld.
  - Kick, Schnee und Volley: Kicken, Werfen bzw. Springen geht nur über Tippen ins Feld, einen Knopf gibt es nicht.
- **Schwere:** stört.
- **Ursache:** `src/engines/arcade/controls.js:13` legt für alle Aktionsknöpfe `zone: "none"` fest. `src/render/rt-stage.js:94-96, 120-133` zeichnet nur die x-Achse und Knöpfe mit `zone: "button"`.
- **Screenshot:** `08-panzer-handy-kein-feuerknopf.png`.

### F11 – Insel-Panzer: Der Bot gewinnt fast sofort

- **Spiel / Viewport:** Insel-Panzer; alle Viewports.
- **Schritte:** Panzer gegen den Computer, beliebig zielen.
- **Erwartet:** Eine Partie mit Chance.
- **Tatsächlich:**
  - 6 von 6 Partien verloren: 0:3 nach 13, 19, 23 und 36 s, 1:3 nach 20 s.
  - Der Bot traf zweimal innerhalb von 0,9 s (3,6 s und 4,5 s).
  - Mit 6 bis 18 eigenen Schüssen gelang 1 Treffer.
- **Schwere:** stört (Balance; ein Mensch zielt kaum besser als der Bot-Spieler hier).
- **Ursache (vermutet):** Bot-Genauigkeit und Feuerrate in `src/engines/arcade/panzer.js` (`RELOAD: 1.5`, Bot-Streuung).
- **Screenshot:** `09-panzer-bot-0-3-nach-13s.png`.

### F12 – Ruckler beim Spielstart (0,4 bis 0,7 s eingefroren)

- **Spiel / Viewport:** Panzer, Murmel, Stock (bei Elfer ähnlich); Desktop, einzeln gemessen ohne Parallel-Last.
- **Schritte:** Spiel starten und die Bildzeiten beim Übergang Countdown → Spiel messen.
- **Erwartet:** Kein Bild länger als 50 ms.
- **Tatsächlich:**
  - Genau beim Übergang stand ein Bild 450 ms (Panzer), 733 ms (Murmel) bzw. 433 ms (Stock).
  - Danach liefen 60 fps.
  - Unter Last (3 bis 4 Browser parallel) waren es bis 2,8 s (Panzer).
- **Schwere:** kosmetisch.
- **Ursache (vermutet):** Eine Vorarbeit beim ersten Tick, vermutlich Insel bzw. Ring (`panzer.js`, `murmel.js`, `stock.js`) oder `rt.preview` (`card.js:147`). Nicht profiliert.
- **Beleg:** Messung `lf.mjs` (Long-Frame-Liste), kein Screenshot möglich.

### F13 – Eigene Figur (Emoji) ist winzig und kaum sichtbar

- **Spiel / Viewport:** Arcade mit „Figur und Foto“ → 🐙; Handy.
- **Schritte:** Anpassen → Figur und Foto → 🐙 → Fertig → Spielen.
- **Erwartet:** Die eigene Figur ist gut zu erkennen.
- **Tatsächlich:**
  - Puck: 🐙 erscheint klein auf dem Schläger und ist auf Cyan kaum zu sehen.
  - Volley: 🐙 ist klein und blass auf dem Roboter.
  - Die Größe ist nicht wählbar, eine „große Figur“ ist nicht möglich.
- **Schwere:** kosmetisch.
- **Ursache:** `src/engines/arcade/view.js:121` (`mine()`: `r*1.3`), Aufrufe mit kleinen Radien (`:137, :160, :185, :213`).
- **Screenshots:** `11-emoji-figur-winzig-puck.png`, `11b-emoji-figur-winzig-volley.png`.

### F14 – Elfer: Hinweisleiste liegt über dem eigenen Tor

- **Spiel / Viewport:** Elfer-Duell; beide Viewports.
- **Schritte:** Elfer starten und halten.
- **Erwartet:** Die Torlinie ist frei sichtbar.
- **Tatsächlich:** Die Leiste „Du hältst – ziehen!“ wird im Feld genau über die Tormitte gezeichnet. Der Ball läuft beim Halten darunter durch.
- **Schwere:** kosmetisch.
- **Ursache:** `note` in `src/engines/arcade/view.js` (Text bei y ≈ 1564).
- **Screenshot:** `10-elfer-hinweis-ueber-tor.png`.

### F15 – Baukasten: Nach dem eigenen Tod 25 s zuschauen; ←/→ ohne Funktion; „Unentschieden“ allein

- **Spiel / Viewport:** Baukasten (Flappy-Vorlage); beide Viewports.
- **Schritte:** Baukasten gegen den Computer spielen und früh sterben.
- **Erwartet:** Ein Hinweis „Du bist raus“ und die Möglichkeit, gleich neu zu starten. Keine Knöpfe ohne Funktion.
- **Tatsächlich:**
  - Nach dem eigenen Tod läuft das Spiel rund 25 s weiter, bis der Computer 15 Punkte hat. Nur „Pause“ ist bedienbar.
  - Die großen Knöpfe ←/→ wirken in dieser Vorlage nicht.
  - Per Link allein ohne Eingabe: „Unentschieden.“ nach 3 s.
- **Schwere:** stört.
- **Ursache:** Das Manifest `src/cards/baukasten/manifest.json` meldet Achsen für alle Vorlagen, `rt-stage.js:94` zeichnet sie.
- **Screenshot:** `07-baukasten-gewinnt-2-pfeile-ohne-funktion.png`.

### F16 – Dart: Brett, Kraft und Werfen nicht auf einem Bildschirm

- **Spiel / Viewport:** Dart im Wohnzimmer; Handy 390×844 und Desktop 1280×800.
- **Schritte:** Dart → „Gegen den Computer“ → erster Pfeil.
- **Erwartet:** Zielen, Kraft (Timing) und Werfen ohne Scrollen.
- **Tatsächlich:**
  - Handy: Das Brett beginnt bei y = 583, Kraft liegt bei 955, „Werfen“ bei 1035, die Zielknöpfe ab 1182. Für jeden Pfeil muss man zwischen Zielen und Timing scrollen.
  - Desktop: Auch hier muss man scrollen, und die Seite ist nicht zentriert.
- **Schwere:** stört.
- **Ursache (vermutet):** Kopfbereich (Spielart, Regeln, Erklärtext) über dem Brett, `src/cards/spiel-dart/card.js`.
- **Screenshots:** `12-dart-handy-brett-und-wurf-getrennt.png`, `12b-dart-desktop-scrollen.png`.

### F17 – Lauf (Handy): Leerer weißer Streifen unter der Strecke

- **Spiel / Viewport:** Lauf und Sprung; Handy 390×844.
- **Schritte:** Lauf starten.
- **Erwartet:** Das Spielbild füllt die Leinwand.
- **Tatsächlich:** Die Leinwand ist 342×400 px groß, das Bild 400×360 mit `fit: "width"`. Unten bleiben etwa 90 px weiß.
- **Schwere:** kosmetisch.
- **Ursache:** `widgets.css:63`: Die Leinwand nimmt per `flex: 1 1 0` die Resthöhe. `fit: width` setzt das Bild oben an (`input.js:14`).
- **Screenshot:** `05-lauf-figur-neben-hitbox-ring.png`.

### F18 – Tasten: keine Feinsteuerung

- **Spiel / Viewport:** Puck, Volley, Ziegel, Kick, Schnee; Desktop, Tasten.
- **Schritte:** Pfeiltaste kurz antippen.
- **Erwartet:** Kleine Schritte zum Ausrichten.
- **Tatsächlich:**
  - Jede Pfeiltaste fährt mit voller Geschwindigkeit: Puck 856 Einheiten in 170 ms (≈ 5 Einheiten/ms), Kick 320 in 222 ms.
  - Ein kurzer Tipp von 30 ms verschiebt etwa 15 % der Feldbreite.
  - Mit Tasten verlor der Bot Puck 0:4, Volley 0:5, Ziegel 0:5 und Kick 2:3. Mit Maus oder Touch gewann er dieselben Spiele 4:0 bzw. 2:1 (Bot-Qualität spielt mit hinein).
- **Schwere:** stört.
- **Ursache:** `src/engines/arcade/controls.js:106-110` (`x: st.me + x*300` je Tick, also immer Höchstgeschwindigkeit). Für Ziegel ist das gemeldet, betrifft aber jede Achse.
- **Beleg:** Messung `speed.mjs`. Ein Screenshot zeigt hier nichts.

### F19 – Bildschirmleser: Stand wird in Flug und Lauf nicht angesagt

- **Spiel / Viewport:** Lauf (und Flug); beide Viewports.
- **Schritte:** Lauf spielen und `.rt-say` (aria-live) beobachten.
- **Erwartet:** Der Stand oder die Meter werden angesagt.
- **Tatsächlich:** `.rt-say` bleibt während des ganzen Laufs leer. Nur die Leinwand trägt ein `aria-label`.
- **Schwere:** kosmetisch.
- **Ursache:** `status().say` ist in `src/cards/lauf/card.js` leer.
- **Beleg:** Datensätze `lauf-*.json` (Spielstand-Verlauf leer).

## Hinweise zur Methode

- Die Siege und Niederlagen des Bots beschreiben die Bot-Qualität und keine Fehler. Ausnahmen sind F11 (Panzer, gleichbleibend chancenlos) und F7 (Baukasten, Tod im freien Spalt).
- Elfer: Wischen und Ziehen sind fein genug. Schüsse von 80 bis 250 ms werden erkannt, der Ball fliegt. Beide Torhüter halten sehr viel (1 Tor in 30 Schüssen); das ist ohne weitere Daten kein Fehler.
- Lauf und Flug: In der Pause drehen sich die Münzen weiter und die Figur wippt, das Spiel steht. Kein Fund.
- Am Anfang des Tests ging ein Hinweis zur gemeinsamen Ursache von F6 und F7 per Nachricht an `fix-flugspiel`, bevor die Regel „nur über das Board“ galt.
