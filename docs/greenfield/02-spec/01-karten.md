# Kartenarten und Katalog

## Katalog
- Quelle: src/ideas.json { ideas (64), gated (0), retired (84), gone (37) }; Index im Kern, Volltext im Teil `katalog`
  (scripts/build.js:47-50, 137; daily.js:19-24 fill(), 170-185 index()).
- Regal (ideas) nach Art: turn 52, arcade 5, table 2, game 1, photo 1, sound 1, quest 1, card 1 (advent-tuer).
  turn-Spiele u. a.: disco, tier, werbung, danke, regel, einig, wort, schmuggel, lob, auktion, kapsel, kennst, snack, wette,
  luecke, streichen, erklaeren, sorry, bluff, auftrag, ausrede, gutschein, luege, blitz, recht, umschlag, steine, damals,
  kreis, hoeflich, woerter, abfragen, typen, maschine, suche, sammeln, wichteln, reihum, termin, einkauf, socken, rap,
  stimme, maus, papagei, pokal, reaktion, wunsch, malrat, dart, geschenk, preis.
  arcade: ziegel, panzer, kick, elfer, stock. table: skat, bauernskat.
- Tests: test/katalog.test.js, test/daily.test.js, test/ideas2.test.js, test/filter.test.js (Inhaltsfilter über
  ideaStrings, daily.js:527), test/build.test.js:103-114 (Index < 27 000 B), e2e cards-daily-{de,en}-{1,2}.e2e.js (jede
  Karte genau einmal je Sprache, build.test.js:318-326), test/fixtures/regal-74*.json.
- Invarianten:
  - Tagesrotation ist eine reine Funktion des UTC-Tages (daily.js:54 dayNumber, 66-86 draftRound/roundOrder,
    112-132 ideaOn): kein Server, kein Math.random; zwei Tage hintereinander nie dieselbe Mechanik (mech, daily.js:36).
  - Kalenderkarten (`on: "MM-DD"`) nur an ihren Tagen; `needs` (Fähigkeiten des Geräts) entscheidet available()
    (daily.js:89-101).
  - Werkzeuge (kind tool) sind nie Tageskarte (PR #221).
  - Suche: fold() ohne Umlaute/Trennzeichen, alle Wörter müssen treffen (daily.js:142-166).

## Kartenarten (doc.k) und ihr Zustand im Link (sanitizeDoc, daily.js:364-409)
Gemeinsam: col [hex,hex], by (Trail ≤ MAX_TRAIL, je {n,w:AREAS}), i (Katalog-id), t ≤40, s ≤70, n (Name ≤16),
ki {k,s,h,o} (KI-Siegel, daily.js:346-355), fr (Remix einer freien Karte, 22 Zeichen), gi {p,l} (KI-Bild-Referenzen).

| k | Felder | Engine/Datei | Tests |
|---|---|---|---|
| card | x ≤MAX_TEXT, st∈STYLES.card, sk Sticker ≤MAX_STICKERS, w Wetter, nr 1-24 (Adventstür) | render.js, warm.js, door.js, wetter.js | karte.e2e, warm.e2e, door.e2e, noto.e2e |
| photo | x,y ≤28, st∈STYLES.photo, sk – das Foto selbst ist NIE im doc (daily.js:463) | render.js, studio.js | own.e2e, vorschau.e2e |
| sound | m beat\|voice, x, fx∈FX, tp, bpm 70-170, p{k,s,h,b} 16-Schritt-Muster, ly ≤4 Zeilen | klang.js, klang-ui.js, kit.js | klang.e2e, klang.test |
| game | g {seed, params, theme, title, emoji, look, route, anim} über core.js sanitizeState | engine.js, game.js | d1.e2e, welt.e2e, anim.e2e |
| duel | Duel.sanitize | duel.js, modes.js | d1.test |
| quest | Quest.sanitize, braucht crypto (daily.js:99) | quest.js | – |
| turn | g, seed, q (versiegelt), pk … Turns.sanitize | turns.js, turn2.js, turn-ui.js, feier.js, malrat.js, dart.js | turns.test, turn.e2e (28), feier, malrat, dart, wichteln |
| table | g doko\|skat\|bauernskat, fa.r Hausregeln je Spiel | table.js, skat.js, doko.js, bauernskat.js | table.test, skat.test, doko.test, table.e2e |
| lauf | l (Lauf.sanitize) | lauf.js, lauf-engine.js | lauf.test, lauf-engine.test, lauf.e2e, lauf-replay.e2e |
| arcade | a ∈ ARCADE_GAMES, fa {e,w} – nie als Blatt-Link (daily.js:426-427) | arcade*.js, frei.js | arcade.test, arcade.e2e |
| tool | i ∈ {notizzettel, datei-rueber}, fa {v,x} – PR #221 | tools.js (PR) | tools.test (PR) |

- Invarianten des Flugspiels (core.js:11-16, 27-36, 128-146, 151-174, 188-224): Parameter nur in RANGES geklemmt;
  look ändert nie Physik/Hitbox (core.js:126-127); Hindernis nicht in Himmelfarbe (core.js:141-144); Route genau 3
  Abschnitte mit Deltas aus fester Tabelle (DELTA_MAX); anim nur aus festen Listen; Zufall nur aus seed (mulberry32,
  hash32 FNV-1a, core.js:309-324).
- Textfilter: core.js:47-90 (Stämme, Wörter, Leet, HURT-Sätze), CHECKS-Erweiterung (kontakt.js), Krisenwörter ai.js:14-23.
  Invariante: jeder eingehende Text (Eingabe, Link, Peer, LLM) läuft durch denselben Filter.

## Status offener PRs zu Karten
- #227 (offen): Sound-Karten verlassen das Regal; eine Karte `strassenrap-beat` (Boom Bap, Trap, Drill, Old School, WAV-
  Export). Entscheidung „Sound nur als eine Strassenrap-Beat-Karte“ ist im Log → im Neuentwurf: sound = genau diese Karte.
- #117 (offen, alt): 14 Datenkarten aus freien Web-APIs – nicht im Scope, solange nicht entschieden.
