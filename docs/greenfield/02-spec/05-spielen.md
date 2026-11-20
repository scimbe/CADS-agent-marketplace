# Spielen: Allein, Bot, Duell, Live, Tisch, Zusammen bauen

- Allein: Flug (engine.js, game.js), Lauf (lauf-engine.js), Arcade (arcade*.js), Zug-Karten.
- Duell per Link (asynchron): Flug-Herausforderung mit Punktzahl, ohne Namen (daily.js:240-246) und Geist als Bytes
  (spur.js: LEB128-Varints je Eingabeänderung); Lauf: Punkte zum Schlagen. Zug per Link: der Link IST das Spiel, jedes
  Spiel eigener Seed (turns.js:1-3). Tests: spur.test + fixtures/spur-golden.js, lauf-replay.e2e, flug-replay.e2e,
  turns.test, turn.e2e.
- Bot: Arcade, Agent-Duell (rps), Dart, Tisch; Bot-Gesicht aus Seed (daily.js:412 botSeed), nie Uhr/Math.random.
- Live (live.js:1-60, live-ui.js): ct-agent WASM von https://webconference.bunsenbrenner.org/pkg/ct_agent_wasm.js,
  Holder- und Noise-Identität, Attestation "ct-a2a-noise-attest-v1", Edge-Join per WebSocket (3 Versuche),
  WebRTC-Datenkanal, nur kleine Spielnachrichten, TURN nur wenn nötig, ICE-Server nur vom Server,
  Einladung einmalig (22 Zeichen), JOIN_MS 30 s, WAIT_MS 15 min. Nichts startet vor dem Tipp „live“.
  Eigene Einladungen nicht selbst verbrauchen (own.js). Hinweis „IP-Adresse des anderen sichtbar“ (texts.json).
  Registrierung weiterer Live-Spiele: window.LiveGames[g] (live-ui.js:7-8).
- Tisch: Doppelkopf, Skat, Bauernskat live über live.js; ein Token je freiem Platz; Hausregeln (table-ui.js:166).
- Invarianten (build.test.js:237-240): genau EIN WebSocket und EINE RTCPeerConnection im ganzen Bundle, nur in live.js;
  Live spricht nur mit /api/play; keine stun:/turn:-Literale.
- Zusammen bauen (collab.js:1-6, collab-ui.js:1-3): Sync-Protokoll ohne DOM; Last-Writer-Wins je Feld nach (lamport,
  actor), Sticker mit Grabsteinen, Digest-Reparatur, idempotent. Transport NUR über DuellHost.peer* der Apps; im
  Browser ehrlich „nicht verfügbar“. Tests: collab.test, collab.e2e (10).
- Tests gesamt: live.e2e (2, mit Fake-Live), rpslive.*, table.*, arcade.*, dart.*, malrat.*, bauernskat.*.
