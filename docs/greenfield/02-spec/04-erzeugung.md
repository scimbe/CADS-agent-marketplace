# Erzeugung: freie Karte, Robot/Magie, Warten, Code-Modus, Deck

## Freie Karte (Teil erschaffen, create-ui.js; Server lib/duell-karte.mjs, lib/duell-ai.mjs)
- Kategorien (Client) ARTS card|meme|game|quiz|faehigkeit (create-ui.js:8); Server ARTS zusätzlich sound, lauf
  (duell-karte.mjs:39) – sound wird serverseitig fest abgelehnt (duell-karte.mjs:1037-1039, lib/duell-absage.mjs).
- Erwartete doc-Art je Kategorie, sonst verwerfen und zurückbuchen (create-ui.js:9-17): card→card, meme→photo,
  game→game|lauf, quiz→turn mit pk, faehigkeit→turn|duel mit Katalog-id.
- Spiel-Genres G1 flug, G2 lauf (GENRE_ENGINE, duell-karte.mjs:1000); „Wer spielt?“ allein/duell (Link), kein Bot für
  diese Genres (create-ui.js:30-33). „Bald“-Liste ehrlich mit nächstliegenden Katalogkarten (create-ui.js:34-36).
- Routing ohne Basis: engineOf(text) → lauf | flug | {notyet} | offen; „offen“ entscheidet das Modell, nie stilles Flug-
  spiel (duell-karte.mjs:985-998, 1035-1077). notyet → 200 {notyet, catalog}.
- Protokoll (ai.js:66-80): POST "" {kind,input,device,proof,lang,queue:"ticket"} → 200 {options,seals,cost,receipt,
  meter} | 202 {ticket,position,etaS} → POST /queue | 429 quota/busy | 409 | 422 blocked (why crisis|kind_ok);
  POST /accept bzw. /discard {device,receipt}; kein Cancel, Ticket verfällt nach 15 s.
- Gerät: zufällige aiDev-id lokal + Proof-of-Work 16 Bit (ai.js solve, PROOF_BITS) für neue Geräte.
- Krise: Client prüft CRISIS vor dem Senden (ai.js:7-23), zeigt eigenen Hilfetext aiCrisis, nie Servertext.
- Siegel: ki {k:"karte", s, h=b64url(SHA-256(canonical(option))), o=Creator-HMAC} (ai.js:46-63, daily.js:346-355).
- Login nur Konto, 16+; freie Karte nur mit Konto (duell-ai.mjs:1162); eigener Topf „create“ (duell-ai.mjs:995).
- Tests: create-*.e2e.js (13), frei.e2e (4), ki.e2e (11), kimark.e2e, ai.test, wish.test, frei.test,
  test/fixtures/frei-vectors.json, karte-sanitize.json, karte-vorschlag.json; Wrapper test/duell-karte.test.mjs.

## Warten (Teil warten, warten.js:1-9)
- Jeder sichtbare Schritt ist ein echter Zustand (gesendet, Platz N, KI arbeitet, Prüfung, Karte); kein Prozent, keine
  erfundene Dauer; Bewegung aus Seed des Satzes; Abbrechen immer; reduced-motion → Text. Tests: create-warten.e2e (5),
  warten.test.

## Robot und Magie (Teil robot, robot-ui.js:1-12; parts.js:47-51)
- Robot: Deck-Karte (+ eigene Änderungen) wird über DENSELBEN Verfeinerungsschritt der freien Karte zur freien Karte
  (runKarte mit data.base). Weitere Sätze verfeinern das letzte Ergebnis.
- Magie: füllt leere Listeneinträge / würfelt Stil, Farben, Sticker – lokal, aus dem Seed, ohne KI und Netz.
- Entscheidung: Robot/Magie für ALLE Kartenarten ohne Ausnahme. Heute Sonderwege: arcade/tool (robot-ui.js:152-158),
  Dice nur card/photo/sound/game (parts.js:49).
- Tests: robot.e2e (5).

## Deck (Teil deck, deck.js:1-10; Server lib/duell-deck.mjs)
- GET deck signiert und versioniert (älter ersetzt nie neuer), jede Karte durch sanitizeDoc.
- Nutzung nur mit Login melden (start, done nach ≥ 20 s mit Aktion). Daumen erst nach Öffnen. Ersteller sieht Status,
  Guthaben, Gründe, Widerspruch – nie Spielerzahlen.
- gate(): freie Karte/Remix öffnet erst nach Serverantwort „nicht gesperrt“ (fail closed, parts.js:74-79, app.js:1090-1092).
- Genau fünf POSTs: /deck/use, /deck/vote, /deck/me, /mod/me, /mod/appeal (build.test.js:204).
- Tests: deck.test, deck.e2e (6).

## Code-Modus (Status: app #229 DRAFT, wrapper #126 DRAFT)
- SDK byte-gleich in App und Server (SHA-256 gepinnt): init(rng, params, players), step(state, input, rng),
  view(state, seat) → Anzeigeliste (bg/rect/circle/line/text/emoji), status(state) → {over, score[], winner, turn},
  moves?; meta {players{min,max}, mode turn|realtime, inputs}. Deterministisch (sfc32-rng, keine Math.random/sin/pow,
  Budgets statt Zeitlimits, Zustand friert nach over).
- Server: acorn-Allowlist + Instrumentierung + Isolation (nicht QuickJS), Bot-Playtests, Ed25519-Signatur.
- Client: Code nur vom eigenen Server per GET ohne Cookie; läuft nur bei passender id/hash/Signatur gegen eingebauten
  Schlüssel (heute leer → fail closed); verstecktes iframe sandbox="allow-scripts" mit CSP default-src 'none'; nur
  JSON-Text über postMessage vom genau diesem Rahmen; Anzeigeliste erneut gesäubert.
- Spielen: allein, Bot, Duell per Link (Seed + Eingaben), live Lockstep (3 Ticks Vorlauf, Hash alle 20 Ticks;
  Abweichung → Ende ohne Sieger). Teil `code` 47 KB, nur bei Bedarf.

## Harness (Status: wrapper #125 DRAFT)
- 66 Personas × 16 Aufgaben = 1056 Prompts; Judge Sonnet 5.5 kalibriert gegen Opus 5.5; Gold (karte-v21-a/-b) NICHT
  eingefroren, `bin/duell-karte-golden.mjs --v21` verweigert echte Läufe. Ergebnis ausdrücklich „kein Gold-Ergebnis“.
