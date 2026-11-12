# Inventar: CADS-webconference-demo und apps/call-core (nur lesend)

Frage aus `KONZEPT.md` §4: Funktionsumfang, Schnittstellen, Identitätsmodell; was wird *ein* Paket für App, Business und
Webkonferenz? Erhoben 2026-11-11 durch Lesen des Codes, nichts verändert.

## Quellen (Primär = Code)

| # | Quelle | Stand |
|---|---|---|
| I1 | scimbe/CADS-webconference-demo, öffentlich, `main` @ b1d9dd6 (2026-11-06), README.md und Kopfkommentare der Module. https://github.com/scimbe/CADS-webconference-demo | flacher Klon zum Lesen |
| I2 | `apps/call-core/` in mdi-greenfield: `src/call-core.js` (616 Z.), `src/protocol.js` (82 Z.), `server/turn-credentials.js`, `test/call-core.test.js` (19 Tests), `test/e2e/` | Commit 6857ece „feat(call-core): 1:1-Anruf …“ (#64) |
| I3 | `apps/duell-web/src/live.js` (159 Z.), `core.js:417-419`, `flavors/business/flavor.js` | heutige Nutzung durch die App |

## CADS-webconference-demo (I1)

**Was es kann (laut README, dort als live geprüft gekennzeichnet):**
- 1:1-Audio/Video-Anruf über WebRTC; Signalisierung Ende-zu-Ende verschlüsselt über einen CADS-Tunnel-Kanal
  (`ct-agent-wasm`: Channel-Join mit `SignedChannelGrant`, Noise_IK-Handshake, `encode/decodeSignalMessage`).
- **Direct-Channel-Transport** (`call-channel.js`): Audio/Video/Chat ohne WebRTC, getunnelt durch den Noise-Kanal über
  eine WSS-Verbindung (für UDP-gesperrte Netze); höhere Latenz, Durchsatz durch die Edge begrenzt.
- **ICE-Watchdog** (`ice-watchdog.js`, DOM-frei, Unit-Tests): wechselt automatisch auf Direct-Channel, wenn nach
  10 s (Server-konfigurierbar 3–60 s, `/api/media-fallback`) kein nominiertes Kandidatenpaar existiert; nur für
  gate-angemeldete Konten.
- STUN öffentlich; **kein TURN** in der Demo (README „Known limitations“).
- Messenger: persistenter Chat mit verschlüsselten Bodies (`chatStore.js`), Dateianhänge in Stücken, Kontakte/Sperrliste,
  Tab-Synchronisation (BroadcastChannel), Geräte-Kopplung (`pairing.js`, ECDH P-256 + AES-GCM über `/api/pair/*`),
  Geräte-Sync (`sync.js`, `/api/sync/*`), sieben Videofilter (face-api, nur WebRTC-Transport).
- Optik „daily“ für Besucher aus My Daily Idea (`theme.js`, `theme-daily.css`, Anton-Schrift): `?look=daily&a=…&b=…`,
  nur zwei Hex-Farben akzeptiert, Rücklink konstant.

**Schnittstellen:**
- Bridge `bridge/server.js` (≈114 KB) mit ≈37 HTTP-Endpunkten, u. a. `/api/register`, `/api/presence`, `/api/call`,
  `/api/incoming`, `/api/decline`, `/api/cancel`, `/api/ice-config`, `/api/ice-outcome(s)`, `/api/media-fallback`,
  `/api/contacts`, `/api/sync/{push,pull}`, `/api/pair/*`, `/api/access-requests*`, `/api/allowlist/*`,
  **`/api/play/{open,join,status,ice,attest,done}`** (Spiele ohne Konto für My Daily Idea).
- Client-Sitzungsschnittstelle `call-session.js`: zwei Fabriken (WebRTC, Channel), gleiche Form mit u. a.
  `getStream()` und `replaceOutgoingVideoTrack(track)`; `setActiveSession/getActiveSession` als globaler Zeiger.
- Kein Build, reine ES-Module; WASM `pkg/` aus gepinntem `scimbe/ct-agent`.

**Identitätsmodell:**
- Holder- und Noise-Schlüssel je **E-Mail** im `localStorage` (Präfix `ct-webconference-`), seit Fix in AES-GCM
  verpackt (`identity.js:96-193`); „Forget this identity“ löscht gezielt.
- Anmeldung über Gate (Keycloak/OIDC); die Bridge vertraut dem Header `x-gate-email` (`server.js:907`), ohne Gate
  wird nicht geblockt (`identityAllowed` gibt `true` zurück).
- Bridge hält den Operator-Schlüssel und stellt Grants aus. **Spiele** nutzen eigenen Service-Account und eigenen
  Operator-Schlüssel; Einladungs-Token einmalig, Grants kurzlebig (`server.js:917-923`).

**Struktur-Befunde:** Noise-Handshake-Aufbau (`NoiseHandshake.new…`) in vier Dateien (app.js, call-channel.js,
chat-glue.js, call-transport-shared.js); laut Kommentar in call-transport-shared.js bewusst nicht vereinheitlicht. Repo hat **keine LICENSE-Datei**
(GitHub-API: 404) – für Übernahme in ein gemeinsames Paket klären, auch wenn derselbe Eigentümer.

## apps/call-core (I2)

- Zweck: transportunabhängiger **1:1-Anrufkern ohne Konto**; der Kanal liefert `send()/onMessage()` und bestimmt den
  Absender. Medien erst nach Annahme, nichts aufgezeichnet.
- API: `CallEndpoint({transport, getIceServers, getPeerIceServers, allowedRelayHosts, rtc, timing, forceRelay,
  onChange, onRemoteStream, log})` mit `dial({video})`, `handle(raw)`, `close()`, `active`;
  `CallSession` mit `accept/decline/hangup/setMuted/networkChanged`; Zustände
  `idle → calling → ringing-out|ringing-in → connecting → connected ⇄ reconnecting → ended`; `stateLabel()` deutsch.
- Protokoll v1 (`protocol.js`): `call.invite|ringing|accept|decline|busy|offer|answer|ice|restart|bye`, strenge
  Validierung (Größen, IDs), nur der Anrufer erzeugt Offers (keine Glare), Wiederholung bis Antwort, Epochen für
  ICE-Neustart, Relay-Hosts des Gegenübers nur aus Allowlist.
- Robustheit: Zeitbudgets (`DEFAULT_TIMING`), Neustart-Backoff, Medienstillstand-Erkennung über `getStats()`.
- Server: `mintTurnCredential` (coturn „use-auth-secret“, HMAC-SHA1, TTL ≤ 1 h, Pseudonym statt E-Mail).
- **Fehlt:** Datenkanal, mehr als zwei Teilnehmer, Direct-Channel-Rückfall, UI.

## Heutige Nutzung durch die App (I3)

`live.js` lädt `ct_agent_wasm` direkt vom Webkonferenz-Host, führt Join + Noise-Handshake **ein weiteres Mal** selbst aus
und öffnet einen WebRTC-Datenkanal `game`; keine Medien. Business verlinkt die Webkonferenz mit `look=daily`.

## Was in ein gemeinsames Paket gehört

| Schicht | Herkunft | Inhalt |
|---|---|---|
| `kanal` | call-transport-shared.js + live.js | WASM laden, Join mit Grant, Noise-Handshake, gerahmter verschlüsselter Strom – **einmal** statt in fünf Dateien |
| `sitzung` | call-core | Zustandsautomat, Protokoll v1, Retry/Epochen; erweitert um Datenkanal und Präsenzstufen (Daten/Sprache/Video) |
| `transport` | call-webrtc.js, call-channel.js, ice-watchdog.js | WebRTC als Standard, Direct-Channel als Rückfall hinter derselben Sitzungsschnittstelle; Watchdog-Politik |
| `relay` | turn-credentials.js, `/api/ice-config`, `/api/play/*` | kurzlebige TURN/Grant-Ausgabe, serverseitig |
| `identitaet` | identity.js | Schlüsselablage hinter Schnittstelle; Bindung an Konto über vom Server signierte Bestätigung statt E-Mail-Schlüssel |
| `optik` | theme-daily.css | wird Teil der gemeinsamen Design-Tokens |

Bleibt in der Webkonferenz: Messenger (Chat, Kontakte, Sync, Pairing), Admin/Allowlist, Videofilter.

## Ableitung für das Konzept

1. Bestätigt: Die Bausteine für den Raum existieren, sind aber auf zwei Code-Basen verteilt, der Kanalaufbau steht in fünf Dateien.
   „Ein Paket“ ist berechtigt und spart echten Code.
2. **Änderung:** Draht-Protokoll festlegen: call-core-Protokoll v1 (validiert, getestet) über den Noise-Kanal als
   Transport, statt der WASM-eigenen `encode/decodeSignalMessage`-Signalisierung der Webkonferenz. Das ist eine
   Migration der Webkonferenz, nicht nur eine Extraktion → mit dem Betreiber abstimmen.
3. **Ergänzung:** call-core braucht Datenkanal und n-Teilnehmer (Mesh, später SFU, siehe `webrtc-topologie.md`), bevor er
   Raum-Kern sein kann.
4. **Identität:** Die heutige Kopplung „Schlüssel je E-Mail + Gate-Header, ohne Gate kein Block“ trägt nicht für
   Konto-Bindung. Server muss Konto ↔ Holder-Schlüssel signiert bestätigen; die getrennten Operator-Schlüssel für Spiele
   und Anrufe bleiben getrennt.
5. Lizenz des Webkonferenz-Repos klären, bevor Code ins gemeinsame Paket wandert.
6. TURN fehlt in der Webkonferenz; call-core bringt die Ausgabe mit. Das gemeinsame Paket schließt diese Lücke für beide.
