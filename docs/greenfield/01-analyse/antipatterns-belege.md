# Belege (Datei:Zeile, app 61cd02e, wrapper 5d8e938)

## A1 Globale Singletons, Ladereihenfolge
- 98 verschiedene Zuweisungen root.X = / window.X = in src/*.js (z. B. Magic, FreeFromCard, LiveUI, ArcadeUI, Deck,
  KiBild, Blasen, DailyApp, DailyDebug, DailyShelfOpen).
- 30 <script>-Blöcke in fester Reihenfolge (index.template.html:90-121); Stand-ins mit Identitätsvergleich
  `root.Deck !== dk` (parts.js:34-46, 72-79, 92-99).
- window.DailyApp exportiert ~70 interne Funktionen inkl. TABS/PANEL (app.js:1145); Teile schreiben in A.TABS/A.PANEL
  in Ladereihenfolge (blasen.js:4-6).
- ONDEMAND nennt Teile, die es nicht gibt („bahn“, „raten“, parts.js:100; build.test.js:94); spur.js nennt Teil „bahn“
  (spur.js:2) – spur.js wird nicht gebaut.

## A2 Zustand in CSS/DOM
- `#editor:has(.timed.run) #stagewrap{display:none}` (style.css:445); `#leaf:has(.pv.tight) .dateline{display:none}`
  (style.css:116); `#home:has(#leaf.got)` (style.css:151); `body data-state` (index.template.html:15).
- Bildschirmzustand als Variable `screen` + hidden-Attribute; Zurück-Logik als Kette von Rückgabewerten (app.js:1061).

## A3 Sonderfälle je Art
- 37 Vergleiche `.k === "…"` in app.js, 9 in blasen.js; Robot arcade/tool-Sonderweg (robot-ui.js:152-158).
- Vier Art-Listen: daily.js:40 (9), parts.js:49 (10), robot-ui.js:17 (10), frei.js:41 (arcade/tool eigener Zweig).

## A4 Stille Rückfälle
- sanitizeTitle → "Duell", sanitizeTheme → "day", Parameter → Mittelwert (core.js:37-39, 104-107, 22-36).
- docUrl kürzt ohne Rückmeldung (daily.js:489-503).
- Stand-in ohne Teil: Promise.resolve() still (parts.js:39), Fehler verschluckt `.catch(function () {})` (parts.js:42).
- Ohne Katalog wird jede Karte zur Textkarte (daily.js:415-416); Speicher fällt still auf mem (kit.js:5).

## A5 Policy im Client, zwei Auth-Wege
- Web Cookie (lib/auth.mjs:57-67), Apps ohne Cookie (DuellAi.swift:25, duell-ai.mjs:23), Bearer nur Relay (in Arbeit:
  lib/oidc-bearer.mjs). Freie Karte deshalb in Apps nicht nutzbar (duell-ai.mjs:1162).
- Android-Shell ohne ai()-Bridge, iOS mit (DuellView.swift:109-121 vs DuellScreen.kt:57-176): zwei App-Pfade.
- Zusammen bauen nur in Apps (collab-ui.js:2-3).
- „Sound“-Verbot doppelt: Client ARTS ohne sound (create-ui.js:8), Server ARTS mit sound + Absage (duell-karte.mjs:39, 1039).

## A6 Doppelte Wege
- freie Karte (create-ui.js) und Robot (robot-ui.js) als getrennte UIs vor demselben runKarte.
- Server vendort Client-Code mit Drift: lib/vendor/duell-web/core.js 419 Zeilen vs src/core.js 465; daily.js 524 vs 545.
- Teilen: navigator.share in kit.js:124-131 und klang-ui.js:168-226 getrennt.

## A7 Harness
- wrapper #125: Judge-Wertung ohne eingefrorenes Gold, ausdrücklich „kein Gold-Ergebnis“.
