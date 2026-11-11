# 2026-11-11 Relay-Grant: Datei rüber nur mit Guthaben, serverseitig

**Ziel:** Das TURN-Relais für „Datei rüber“ bekommen nur zahlende Konten (Guthaben > 0). Die Bridge setzt das durch, im Browser und in den Apps gleich. Gratis-Nutzer dürfen über das Relais eines zahlenden Partners empfangen. Ohne gültigen Grant gibt es nur STUN (fail closed). Entscheidungen: `entscheidungen.md`, Zeilen 5–7.

## Ergebnis (nur PRs, nichts gemergt, nichts deployt)

| Repo | PR | Inhalt |
|---|---|---|
| CADS-DEMO-wrapper | https://github.com/scimbe/CADS-DEMO-wrapper/pull/129 | `POST /api/duell/relay-grant` (`lib/duell-relay.mjs`); HMAC-Grant (`lib/relay-grant.mjs`); Bearer-Prüfung der Apps (`lib/oidc-bearer.mjs`, RS256 gegen JWKS des Realms `ct-demo`, `azp` gleich `cads-mobile`, `email_verified`); `acctOf` in `lib/duell-ai.mjs` |
| CADS-webconference-demo | https://github.com/scimbe/CADS-webconference-demo/pull/155 | `purpose` an `/api/play/open\|join`; `/api/play/ice` gibt TURN für file-Kanäle nur gegen `X-Relay-Grant` (`bridge/relay-grant.js`); Spiel-Kanäle unverändert |
| CADS-agent-marketplace | https://github.com/scimbe/CADS-agent-marketplace/pull/235 (Basis #221) | `live.js` minimal (purpose, Grant-Header, Fix der Überschattung von `o` in `invite`); `tools.js` `relayAsk`; iOS `DuellRelayBridge`, Android `DuellHost.relay` mit Bearer |

**Grant:** `rg1.<b64url(payload)>.<b64url(HMAC-SHA256)>` mit Payload `{sub, purpose:"file", ch, iat, exp}`.
- `sub` ist der pseudonyme Pot-Schlüssel, nie die E-Mail.
- Lebensdauer ≤ 15 min, an den Kanal gebunden.
- Vergleich mit `timingSafeEqual`.
- Format und fester Testvektor sind in Wrapper und Bridge identisch.

**Schnittstelle, unabhängig vom Client:** Ein Neuentwurf des Clients braucht nur drei Dinge:
1. `POST /api/duell/relay-grant` mit `{}` (darf ich?) oder `{channel}` (Grant).
2. `purpose:"file"` bei open und join.
3. Den Header `X-Relay-Grant` an `/ice`.

Die App-Hüllen bieten `DuellHost.relay(id, body)`; die Antwort kommt über `window.DuellHostReply(id, status, body)`.

**Wie sich die App anmeldet:** Die App hat kein Gate-Cookie. Die Hülle fragt den Wrapper nativ mit `Authorization: Bearer <Access-Token>`, das vorher aufgefrischt wird (iOS `AppModel.prepareRequest`, Android `beforeRequest`). Es gehen keine Cookies mit, Weiterleitungen werden nicht verfolgt, und die Seite sieht das Token nie. Der Wrapper bildet das Konto aus der verifizierten E-Mail, so wie beim Gate-Cookie. Damit treffen App und Browser dasselbe Guthaben.

## Deploy-Reihenfolge und Env

1. Wrapper deployen (`DUELL_RELAY_GRANT_SECRET` ≥ 32 Zeichen; `DUELL_BEARER_ISSUER`, `DUELL_BEARER_AZP`).
2. Bridge deployen (`DUELL_RELAY_GRANT_SECRET` mit demselben Wert, `PLAY_FILE_RELAY=grant`, `PLAY_FILE_TURN_PER_HOUR=30`).
3. Erst dann den Client (#221 + #235). Ein älterer Client schickt keinen `purpose`, sein Kanal gilt also als Spiel, wie bisher.

## Testbelege

- Wrapper `node --test test/`: **646/646** grün. Neu ist `test/duell-relay.test.mjs` mit 10 Tests, darunter der App-Pfad mit Bearer.
- Bridge `npm test`: **35/35** grün. Neu ist `test/play-relay-grant.test.mjs` mit 11 Tests. Sie laufen gegen den echten Bridge-Prozess mit Fake-Grant-Binary und Fake-Control-Plane:
  - file ohne Grant: STUN
  - gemischtes Paar
  - fremder Kanal, abgelaufen oder gefälscht: STUN
  - Spiel unverändert
- duell-web:
  - Unit: 668 Tests, 667 grün. Der eine rote, `table.test.js`, lief unter Volllast in einen Timeout; allein laufen die beiden Tisch-Dateien mit 19/19 grün, der Test ist nicht berührt.
  - `build`, `tools`, `ai` und `parts` zusammen **48/48** grün.
  - E2E `tools.e2e.js` und `live.e2e.js`: **6/6** grün.
- iOS:
  - `swiftc -typecheck` meldet in den geänderten Dateien keine Fehler; die einzigen Fehler stehen im vorhandenen `PeerCoreAdapter.swift`, dem die Rust-Bindings fehlen.
  - Die Logik von `DuellRelay.request` lief auf macOS mit 14/14 Prüfungen.
  - XCTest läuft im CI.
- Android: `DuellRelayTest.kt` nur im CI, lokal gibt es kein SDK.

## Offene Punkte

- **Datei rüber und Live laufen in den Apps grundsätzlich nicht.** Die Hüllen sperren das Netz zur Bridge; das war schon vor #235 so. Siehe `offen.md`.
- Ein veränderter Client kann einen Dateikanal als `game` öffnen und bekommt dann das Spiel-TURN-Budget. Begrenzt wird das nur über `PLAY_TURN_PER_HOUR` und 15 min je Kanal. Stärker wird es erst mit Mengen- und Dauerlimits in coturn je Benutzername.
- Beim Deploy prüfen:
  - Das Access-Token von `cads-mobile` enthält `email` und `email_verified`.
  - Gate-E-Mail und Keycloak-E-Mail sind dieselbe Identität.
- Kein echter Lauf mit coturn und zwei Geräten.
