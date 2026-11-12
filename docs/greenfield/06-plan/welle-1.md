# Welle 1: Parität in parallelen Strängen

Auftrag des Users vom 2026-11-12: „Do! Push! Deliver a better product as the First attempt“. Die offenen Fragen aus Gate A hat er nicht beantwortet. Deshalb gelten die Annahmen unten. Sie stehen auch in `entscheidungen.md`. Der User kann sie ändern, die Arbeit wartet nicht darauf.

## Annahmen für Gate A (vom Agenten gesetzt, änderbar)

| Frage | Annahme | Grund |
|---|---|---|
| Community-Karten als Tageskarte? | Nein. Die Tageskarte bleibt der kuratierte Abreißkalender und kommt nur aus dem Seed des Tages. Community-Karten stehen im Regal unter „Von anderen“. | Gleiche Karte für alle, keine Manipulation, Moderation vor Reichweite |
| Standardmodus | Zugkarten per Link, Raumkarten auf diesem Handy, Echtzeitspiele gegen den Bot mit „Live mit Freund“ als zweitem Knopf | entspricht `Turns.who()` im Altcode |
| Absichten | Die 4 Absichten bleiben (Gruß, Planen, Spielen, Stimme). Dazu ist „Eigene Karte“ immer sichtbar. | Altcode `start.json`, freie Karte ist essenziell |
| Thumbnails | Format 16:9 mit Kurztitel als Overlay im Client. Startbild ist ein echter Spiel-Screenshot im Startzustand (deterministisch per Playwright). KI-Bilder (FLUX auf cs4f) ersetzen ihn je Karte, sobald sie erzeugt und geprüft sind. | Der Screenshot ist das gestaltete Basisbild, kein stiller Rückfall. Die Quelle steht im Manifest (`thumb.src`). |

## Grundregeln für alle Stränge

- Basis ist der Branch `feat/mdi-paritaet` in `scimbe/CADS-agent-marketplace`. Er enthält D0, P1 Konto (#238), App-OIDC (#240) und den Layout-Fix (#239). Jeder Strang arbeitet in einem eigenen Worktree auf `feat/mdi-w1-<strang>`. PRs gehen gegen `feat/mdi-paritaet`, nicht gegen `main`.
- **Der Altcode ist die Untergrenze, nicht Inspiration.** Quelle ist der Tag `pre-legacy-removal`, Pfad `apps/duell-web/` (`git show pre-legacy-removal:apps/duell-web/src/<datei>`). Jede Regel, jede Variante, jeder Text und jeder Bot wird übernommen. Nichts wird weggelassen, nur weil es aufwendig ist. Was fehlt, steht im PR unter „offen“, mit Grund.
- **Alt-Orakel:** Die passenden alten Tests (`apps/duell-web/test/*`, 166 Dateien) werden portiert, nicht neu erfunden. Fehlt ein alter Test, wird ein Golden-Test aus dem Altcode erzeugt: Den alten Code mit festen Seeds und Eingaben ausführen, die Zustände einfrieren und gegen die neue Engine vergleichen.
- Architektur nach `KONZEPT.md` und den Anti-Patterns: Kartenvertrag (`manifest.json` + `card.js` mit init/moves/step/view/status), Determinismus nur über das SDK (`src/contract/sdk.js`: Seed-RNG, Festkomma), keine Globals, keine stillen Rückfälle, Policy beim Server.
- **Gemeinsame Dateien** (`src/contract/*`, `src/app/*`, `src/render/*`, `src/ui/view.js`, `src/ui/tokens.css`, `scripts/*`) ändert nur ihr Besitzer (siehe Tabelle). Andere Stränge legen eigene Dateien an: `src/cards/<id>/`, `src/engines/<name>/` und `test/<name>*.test.js`. Brauchen sie eine Schnittstelle des Besitzers, fragen sie per Nachricht nach. Bis die Schnittstelle da ist, programmieren sie gegen den hier dokumentierten Stand.
- Kartenregister: Strang F erzeugt `src/cards/index.js` aus allen `src/cards/*/manifest.json`, damit niemand die Datei von Hand pflegt. Bis dahin trägt jeder Strang seine Karte mit einer Zeile ein. Konflikte löst der Integrator.
- **DoD:** wie `vorgehen.md`, Phase E.
  - Läufe auf labor-setup.de mit `tools/remote/labor-test.sh feat/mdi-w1-<strang>` aus `/Users/dev/claude-workspace/mdi-greenfield`. Der Branch muss vorher gepusht sein. Eine SHA lehnt das Skript ab.
  - Die Ergebnisse stehen mit Zahlen im PR.
  - `layout.e2e.js` (Verdeckung) und axe laufen für jede neue Ansicht.
- Kein Merge nach `main` und kein Deploy. Das macht der Integrator erst nach Phase F mit Freigabe des Users.
- Git: Commits mit `-c user.name=Dev -c user.email=dev@reagenzglas.local`, Trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. PR-Text endet mit `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Vor jedem Push `gh pr view --json state`.

## Stränge

| Strang | Besitz / Inhalt | Altcode (Untergrenze) | Ergebnis |
|---|---|---|---|
| **F Fundament** | Besitzer von contract/app/render/scripts. (1) Kartenregister automatisch aus Manifesten. (2) **Echtzeit-Vertrag**: `kind:"realtime"`, fester Tick, `step(state, inputs[seat])`, Zeichnen über eine Canvas-Anzeigeliste (Formen, Sprites, Text), Bot als zweite Seite, Geist-Replay, Live über den vorhandenen Broker. (3) **Widget-Bibliothek für Zugkarten**: alle Widgets aus `turn-ui.js` (pick, text, slide, list, rank, alloc, money, pay, shop, doors, nim, slots …) als Renderer-Primitive mit a11y. (4) Bildquelle für Thumbnails im Manifest (`thumb`). Die Schnittstellen werden zuerst dokumentiert (`03-architektur/adr/`) und früh gepusht, damit die anderen Stränge darauf aufbauen. | turn-ui.js, turn2.js, arcade-ui.js, game.js, live*.js, parts.js, build.js | ADR + Code + Tests |
| **H Heim** | Besitzer von view.js und tokens.css. Startseite als **Abreißkalender**: Tageskarte aus der Rotation (gemischte Runde, keine Wiederholung, nicht zweimal dieselbe Art hintereinander, 21 Kalenderkarten, Bonus an jedem 6. Tag), Absichten → Familie → Karte → Los in höchstens 3 Taps. Regal mit 16:9-Thumbnails in YouTube-Art, Suche, Kalender/Feiertage. **Meine Wand** und **Einladungen** (Archiv versendeter Links), gemerkte Karten. Teilen: Kurzlink, Story-Bild 9:16 mit QR. Designsprache: Papierkalender + Meme (Anton, 68-px-Hauptknopf, Titel ≥ 14 px), dichter und lebendiger als D0. | daily.js, kalender.*, start*.js, start.json, app.js, shortlink.js, statuscard.js, stil.js | Heimseite komplett |
| **Z1 Zug: Planen & Geld** | Regeln und Karten zug-sammeln (Geld einsammeln, PayPal.me ab 18), zug-termin (+ Satz zu Formular), zug-einkauf, zug-wichteln, zug-reihum, zug-einig, zug-wunschzettel, geschenk-finder, karte-danke inkl. warm-Varianten, zug-umschlag, zug-kapsel, zug-gutschein (+ rubbellos), raum-sorry | turns.js, turn2.js, satz*.js, geschenke.*, wish.js, turn.json | ★-Karten |
| **Z2 Zug: Rest** | alle übrigen Zug- und Raumkarten aus `12-paritaet.md` §1a, mit Varianten aus §1c | turns.js, turn.json, quizspiele.* | ≈35 Karten |
| **A Arcade** | Engine E4 mit kick, elfer, ziegel, panzer, stock und den Varianten puck, volley, flipper, snow, murmel. Bots, Live, Anpassung inkl. eigener Fotos. | arcade.js, arcade2.js, arcade-ui.js, arcade.json, frei.js, smooth.js, ballduell.js | 10 Spiele |
| **L Flug & Lauf** | Engine E2 Flug (spiel-lava + 15 Varianten, Geist-Duell, Regler) und E3 Lauf | core.js, engine.js, game.js, modes.js, duel.js, spur.js, welt-ui.js, regeln.js, lauf*.js | 2 Engines |
| **T Tisch** | E6: Skat live, Bauernskat (Bot und Link), Doppelkopf, mpoker; Kartendeck CC0 | table*.js, skat.js, bauernskat.js, doko.js, mpoker.js | 4 Spiele |
| **P Poster & Saison** | E7: **advent-tuer**, von Nutzern selbst gestaltet im Format 16:9, Nummer aus dem Datum, Aufklappen beim Empfänger. **zug-advent** (24 Türen). foto-alien (Foto bleibt lokal), Noto-Sticker, Wetter, Studio. E8 Klang (Beat, Stimme), E9 Quest (kanal-geheim). | render.js, door.js, warm.js, noto.js, stickers.js, studio.js, wetter.js, klang*.js, kit.js, quest.js | Karten + Engines |
| **S Spiele mit eigener Oberfläche** | spiel-dart (Bot Bert), zug-malrat, zug-abfragen/zug-typen mit Fragepaketen, quiz-preis | dart*.js, malrat*.js, quizpack.js, quizmake.js, quiz-ui.js, quiz-packs.json | 5 Karten |
| **K Freie Karte & KI** | Abschnitt 3 aus `12-paritaet.md` vollständig: Einstieg immer sichtbar, 16+, Zähler, Kategorie/Genre, Warten, Vorschau, Übernehmen/Verwerfen, Absage mit Gegenvorschlag, Deck mit Status-Gate, Daumen, /deck/me, Widerspruch, Robot. Dazu die KI-Arten wish/line/meme/plan/liste/quiz/welt/text/anlass und KI-Bild. Neue Spiele aus einem Satz über die Engines F/A/L. | create-ui.js, ai.js, warten.js, deck.js, robot-ui.js, kibild.js, texte.js, wish.js | P2 komplett |
| **D Design** (Session „design“, Claude Design) | Design-System und alle Bildschirme. Grundlage ist die alte Designsprache (Papierkalender + Meme, wie im Altcode), dichter und interessanter, Thumbnails 16:9. Kritik durch Swarm ohne Vorwissen. | alte Screenshots `alt-shots/`, 13-produktverstaendnis.md §3 | Canvas zur Abnahme (Gate C) |

Integrator (Hauptsession): führt die Stränge zusammen, prüft jeden PR selbst (Diff und Läufe), stellt Staging bereit und bereitet Phase F vor.

## Voraussetzungen für Phase F (Stand 2026-11-12, Integrator)

| # | Voraussetzung | Quelle |
|---|---|---|
| 1 | Der Wrapper liefert `/duell/parts/*.js` statisch aus (nachladbare Kartenteile, F2 #256). Fehlt das, zeigt jede Karte „Teil fehlt“. | F2 |
| 2 | Wrapper #131 (Deck-Status mit Inhalts-Hash) → #132 (v2-Kurzlinks, Profil) → #133 (eingebundener App-Code, Drift-Prüfung) in dieser Reihenfolge, davor ein Re-Vendor auf den Release-Commit. Danach wird der Parameter `d` im Status-Gate Pflicht. | K, W |
| 3 | `SHORT_V2_PATH`: In Produktion bleibt der Standard `/duell`. Auf Staging zeigt er auf den Staging-Pfad und wird im Runbook eingetragen. | W |
| 4 | App-OIDC: Keycloak-Scopes `ct-api`/`mdi-api` an `cads-mobile` vor CADS-Tunnel #899. Das gilt als Core-Eingriff mit 10 Minuten Vorwarnung und braucht die Freigabe des Users. Assetlinks-Fix #898. | OIDC |
| 5 | Gerätetest auf echten Handys (iOS und Android, Mittelklasse): 60 fps in Arcade und Flug, Mikrofon- und Ton-Karten, Teilen-Sheet, große Schrift. | A, Z2, D |
| 6 | Gate C: Der User nimmt die Design-Canvas ab. Offene Produktfrage: eigene Domain oder Logo auf der Anmeldeseite. | D |
| 7 | Staging mit gleicher Herkunft wie Produktion, Abnahmetest gegen Phase B, Rauchtest, Rollback geprobt. | vorgehen.md |

## Stand 2026-11-12, Integrationszweig

- `feat/mdi-paritaet` @ 6598752: labor-setup.de Unit 979/979, e2e 278/278 (Lauf 20261112-093931). Alle 64 Regalkarten des Altkatalogs vorhanden (Prüfung `newIdOf` für jede Katalog-ID).
- Danach gemergt: T #272, K #269 (Security H1/M6), H #270 (Kurzlink mit Gerät/Nachweis). Unit lokal 984/984 @ fa1447b.
- H1 aus dem Security-Review vom Integrator gegengeprüft: Der PoC-Link wird auf dem neuen Stand beim Empfang abgelehnt (vorher: Badge ohne Gate).
- Hinweis: Commit 2e7fc5e enthält versehentlich Zwischenstände von tools/staging/host.sh und smoke.mjs (Strang STAGE), nicht diesen Text.
- Offen vor Phase F: Teile-Pfad unter `/duell` (F, Staging L2), Teile-Namen im Wrapper (W, L1), Start-503 (W, L4), Baukasten-Siegel und -Aufwand (B, M1/M5), Wrapper-Kette #130–#137 neu vendoren, Gate C, Keycloak „Trust email“ (User), Live-Rahmen für Staging (User), Gerätetest.
