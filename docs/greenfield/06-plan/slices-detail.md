# Slices (dünn, vertikal; neuer Client unter /duell/neu bis Parität)

Grundregeln: eigener Baum apps/mdi; Feature-Schalter je Slice; jeder Slice: Unit + Szenario-Test grün, Budget-Prüfung,
Datenschutz-Prüfung, Design-Kritik (siehe 04-ux/design-prozess.md), Review. Tests laufen parallel auf labor-setup.de
(`tools/remote/labor-test.sh`).

| # | Slice | Abnahme | Alt-Orakel |
|---|---|---|---|
| S0 | Gerüst: Build, CSP, Budgets, Broker-Allowlist, CI-Sperre `apps/mdi` ↛ `apps/duell-web` | Build-Prüfungen neu | build.test.js Regeln |
| S1 | Statechart + Router #v2 + Schema-Codegen; Varianten-Gate (A vs B) | Pfad-Enumeration Tiefe 6, Fragment-Testvektoren | – |
| S2 | Heute-Blatt: Katalog, Rotation, Suche, i18n de/en, offline | Rotation = alte Rotation für 365 Tage, i18n.test portiert | start, home*, search, layout-lang |
| S3 | Karten-Vertrag + static-Karten + Teilen/Empfangen | karte, warm, door; Filter-Tests | karte, warm, d1 |
| S4 | Editor: Blasen, Overlay-Dialog, Pinsel, a11y | blasen-*, a11y, axe, zoom200 | blasen*, a11y, d1-axe |
| S5 | Spiel-Engine-Baukasten + Flug, Lauf als Vertragskarten; Geist/Duell per Link | spur-golden, lauf-replay, Determinismus-Hash | d1, lauf, welt, anim |
| S6 | Zug-Karten (turn) als Vertragskarten | turns.test portiert | turn (28), feier, wichteln |
| S7 | Broker live (ct-agent WASM, WebRTC), Bot, Arcade, Tisch | ein WS/ein PC, Fake-Live | live, rpslive, arcade, table |
| S8 | Auth (OIDC+PKCE, ein Bearer) – Server zuerst | gleiche Antwort Web/iOS/Android | ki, profile |
| S9 | Erzeugung (ein Weg): freie Karte + Robot + Magie + Warten | Protokoll-Verdikte, keine stillen Rückfälle | create-*, robot, frei |
| S10 | Code-Modus: Sandbox-Host, Signatur, Lockstep | Sandbox-Escape-Tests, fail closed | (#229) |
| S11 | Konto/Guthaben/Gutschein/Aufladen, Bildpreis, KI-Bilder | Grant-Ablehnung | gutschein, kibild, stil |
| S12 | Werkzeuge (Notiz, Datei rüber, Relay-Grant) | Relay nur mit Grant | (#221) |
| S13 | Push, Wand, Deck, Statistik, Melden, Kurzlinks | push.test portiert | push, wand, deck, stat |
| S14 | Apps iOS/Android: Kopierschritt auf apps/mdi/dist, DuellHost v2, Plattformtreue | Simulator/Emulator-Smoke | check-scenarios.py |
| S14b | Business-Sicht als Flavor des neuen Clients | business-Szenarien | business.e2e |
| P0 | Eine Domain, Pfad-Routing, relative Pfade | kein absoluter Host im Build | – |
| P1 | Zustandslose App, PostgreSQL + Objektspeicher | 3 Repliken grün; keine Doppelbuchung | gutschein, ki |
| P2 | Job-Queue + Worker, ehrliche 202/429 | Lasttest 3× Sättigung | create-warten, kibild |
| P3 | Live-Affinität, TURN-Pool | Ausfall trennt ≤ 1/n Kanäle | live |
| P4 | Hybrid: ICC-Worker + Cloud-Burst, WireGuard | Burst-Übung ohne Fehler | – |
| S15 | Umschaltung /duell → neu; /duell/alt 14 Tage; Rollback = Tag + Routen-Schalter | Paritätsliste 100 % | alle |
| S16 | Altcode entfernen | siehe unten | – |

## S16 Altcode-Entfernung
Löschen aus main: apps/duell-web/**, apps/ios/copy-duell.sh, apps/ios/Duell/placeholder.html, Android-Kopie der
duell-web-dist, CI-Jobs für duell-web, wrapper lib/vendor/duell-web/** (ersetzt durch packages/mdi-contract), Route
/duell/alt nach Ablauf.
CI-Sperre (ab S0): Job `no-legacy-refs`:
`git grep -nE 'apps/duell-web|duell-web/dist|copy-duell\.sh|vendor/duell-web' -- . ':!apps/duell-web' ':!docs/greenfield'`
plus Import-Prüfung im neuen Build. Rollback nach S16 nur per Git-Tag `pre-legacy-removal`.
