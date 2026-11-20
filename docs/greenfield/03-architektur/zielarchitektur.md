# Zielarchitektur (FOSS, ohne schweres Framework) – Vorschlag des Spezifikations-Agenten

## Quellbaum (keine Vermischung)
```
apps/mdi/                     neuer Client, importiert nichts aus apps/duell-web
  src/app/        statechart.ts, machine.ts (App-Zustand), router.ts (#v2-Fragment ↔ Ereignisse)
  src/contract/   card.ts (Vertrag), manifest.schema.json, registry.ts
  src/cards/      <id>/manifest.json + card.ts (handgebaut), alle gegen denselben Vertrag
  src/sandbox/    host.ts (iframe), guest.ts (läuft im iframe), protocol.schema.json
  src/broker/     live.ts (ct-agent+WebRTC), image.ts, storage.ts, relay.ts, ai.ts – einzige Netzpunkte
  src/schema/     *.schema.json → build: Ajv standalone → validators.js (kein new Function zur Laufzeit)
  src/ui/         Bildschirme als reine view(state) → DOM (keine Zustände in CSS)
  test/           unit, scenario (Paritäts-Szenarien), fixtures (kopiert, mit Herkunft)
packages/mdi-contract          Schemata, Testvektoren, SDK – geteilt von Client und Server (ersetzt lib/vendor/duell-web)
apps/ios, apps/android         neuer Kopierschritt auf apps/mdi/dist
```

## 1 Zentrale Statechart
Zustände (hierarchisch, parallele Regionen):
app ⟶ { boot, shelf{today, all, search}, card{view, customize{bubbles|tabs, dialog}, generate{input, waiting, preview},
play{solo, bot, duel{link, live{inviting, joining, connected, ended}}}, share{compose, done}}, receive{validate, gate,
show}, account{style, credit, topup}, wall } ‖ overlay{none, sheet, layer} ‖ net{online, offline}.
- Jede UI-Sichtbarkeit wird aus state.matches(...) abgeleitet; CSS kennt nur Darstellung (verbietet A2).
- Zurück/Escape = ein Ereignis BACK, die Maschine entscheidet.
- Karten senden nur Ereignisse an die Maschine; sie ändern keine fremde UI.

## 2 Karten-Vertrag (verallgemeinert Code-Modus-SDK aus #126/#229)
manifest: { id, kind, version, title{de,en}, capabilities: [solo|bot|duel-link|duel-live|image|relay|photo|audio|
  collab], players{min,max}, mode: turn|realtime|static, params: JSONSchema, state: JSONSchema, parts: [{id, panel,
  label}] (Blasen), limits{fragmentBytes, stepBudget} }
module: init(rng, params, players) → state; step(state, input, rng) → state; view(state, seat) → Anzeigeliste;
  status(state) → {over, score[], winner, turn}; moves?(state, seat); parts?(state) → Teile mit Koordinaten.
- Deterministisch: Zufall nur über rng (Seed); gleicher Code+Seed+Eingaben ⇒ gleicher Zustandshash (Lockstep, Geist).
- Handgebaute Karten laufen im Haupt-Thread (vertraut, im Build geprüft); erzeugte Karten NUR in der Sandbox. Gleiche
  Schnittstelle ⇒ Robot/Magie/Blasen/Teilen/Duell gelten für alle Karten (A3 weg).
- Fester Inhalt (Text, Farben, Sticker) ist eine Karte mit mode static und leerem step.

## 3 Sandbox
iframe sandbox="allow-scripts" (opaker Ursprung), srcdoc mit eigener CSP default-src 'none'; Code nur nach Prüfung von
id/hash/Ed25519-Signatur gegen eingebauten Schlüssel; postMessage nur JSON-Text, Absender = genau dieser Rahmen, jede
Nachricht gegen protocol.schema.json; Anzeigeliste erneut gesäubert; Budget je step (Abbruch ⇒ ehrliches Ende).

## 4 Capability-Broker
Einziger Ort für Netz/Gerät: live, image, storage, relay, ai, share, push. Server-Grant (signiert, kurzlebig, an
Konto/Gerät gebunden) entscheidet; Client zeigt nur den Bescheid (A5 weg). CI-Prüfung: fetch/WebSocket/
RTCPeerConnection nur in src/broker/*.

## 5 Schema an jeder Grenze
Fragment (#v2), postMessage, DuellHost-Bridge, Server-Antworten, LLM-Ausgabe (serverseitig, gleiche Schemata, gemeinsame
Testvektoren). Fehler ⇒ ablehnen mit Grund (A4 weg). Ajv standalone (Build-Zeit-Codegen), weil CSP kein unsafe-eval erlaubt.

## 6 Ein Auth-Modell
OIDC (Keycloak) Authorization Code + PKCE für Web und Apps; Server akzeptiert genau ein Token-Format (Bearer, kurzlebig)
auf allen /api/duell/*-Routen; Web hält Token im Speicher, Apps im Keychain/Keystore. Gate-Cookie nur für Server-HTML.
Geräte-id + Proof-of-Work bleibt für anonyme Kontingente.

## 7 Ein Erzeugungsweg
input{text|base:cardRef+edits, category, genre} → Route (fest/notyet/offen) → feste Felder ODER Code → statische Prüfung
→ Bot-Playtests → Signatur → Vorschau → accept/discard. Freie Karte und Robot = dieselbe Maschine, anderes Startereignis.
