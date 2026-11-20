# Plattform: i18n, offline, Budgets, CSP, Apps, Datenschutz

## i18n
- Sprachen = Blöcke der Textdaten {de:{}, en:{}}; Lücke → Deutsch via Prototyp (core.js:426-451 textsFor);
  "de|en"-Paare (pick); Plural/Zahl/Geld über Intl (de-DE, en-GB). Sprachwechsel zeichnet alles neu (app.js:1007-1015).
  Tests: i18n.test, layout-lang.e2e, cards-*-en, texte.e2e.

## Offline und Teile
- Kern inline ohne externe Ressource (build.test.js:27-29); Teile mit Inhalts-Hash im Namen und SRI auf http(s)
  (parts.js:12-29); Web lädt alle Nicht-ONDEMAND-Teile im Leerlauf; Apps tragen die Dateien im Bundle
  (ios/copy-duell.sh, Android assets).

## Budgets (test/build.test.js; letzte Messung)
| Budget | Grenze | gemessen |
|---|---|---|
| Kern dist/index.html | < 716 800 B (700 KiB) | 686 281 B |
| je Teil | < 300 KB | – |
| Kern + vorgeladene Teile | < 1.75 MiB (1 835 008 B) | 1 575 044 B |
| nur bei Bedarf (ONDEMAND) | ≤ 512 KiB | 248 007 B |
| Vorschaubilder zusammen / je Teil | < 560 KiB / < 96 KiB | – |
| Katalog-Index | < 27 000 B | – |

## CSP (index.template.html:7)
default-src 'none'; script-src 'unsafe-inline' 'self' webconference 'wasm-unsafe-eval'; style-src 'unsafe-inline';
img-src data: blob: <api-host>; connect-src <api-host> webconference wss://webconference; base-uri/form-action 'none'.
Kein innerHTML/eval/new Function im Bundle (build.test.js:250-253).

## Apps
- iOS: Seite aus Bundle per file://, jedes Netz geblockt außer /api/s (DuellView.swift:128-148); DuellHost: share,
  shareFile, saveFile, haptic, more, push, peerReady/Invite/Accept/Send/Leave, ai(path, body) mit fester Pfadliste,
  ≤ 2048 B, ohne Cookie (DuellAi.swift:7-27). navigator.share entfernt.
- Android: WebViewAssetLoader https://appassets.androidplatform.net, mayLoad nur Assets + API-Host; DuellHost ohne ai().
- Fragment-Übergabe: location.hash = validFragment (DuellView.swift:150-155), Seite hört auf hashchange.

## Datenschutzregeln (build.test.js:183-249)
- fetch nur an genannten Stellen je Datei; kein XHR/sendBeacon/EventSource/Worker im App-Bundle; kein Tracker; Push nur
  im Teil push. KI fasst kein Bild an (ai.js). Nur getippter Text verlässt das Gerät.
- Server speichert nur HMACs und Zähler, keine IP, keine E-Mail, keinen Eingabetext (duell-ai.mjs:19-26).
- WIDERSPRUCH zu 00-auftrag.md: Altcode schickt Fotos nirgends hin (auch nicht ins Fragment), Audio nur als Datei per
  Teilen-Menü. → offen.md.

## Flavor Business
- --flavor business: eigener Katalog, Texte überlagert, stat:false, keine freie Karte (scripts/build.js:11-20, 127).
  Tests: business.e2e (11), cards-business.e2e, biz.test. Entscheidung 2026-11-11: Business-Sicht kommt mit.
