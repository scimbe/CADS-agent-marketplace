# Testinventar und Paritäts-Orakel

- Unit: 66 Dateien test/*.test.js (node --test), 10 184 Zeilen. E2E: 75 Dateien test/e2e/*.e2e.js (Playwright 1.56.1,
  file:// und Web-Route 127.0.0.1, test/e2e/lib/grund.js; nolive.js stubbt /api/s und /api/duell/stat).
  Ansichten phone328, phone390, quer, tablet820, desk1280, zoom200, zoom200quer; Sprachen de, en.
- Wrapper: test/*.test.mjs (duell-karte, duell-bild, duell-code (PR), korpus-v21 …).

## 1:1 portierbar (als kopierte Erwartungen, KEIN Import aus apps/duell-web)
Reine Logik mit Fixtures: core.test (Filter, Klemmen, Seed), collab.test, turns.test, skat/doko/bauernskat(-table).test,
dart.test, malrat.test, mpoker.test, lauf-engine.test, spur.test (+spur-golden), frei.test (+frei-vectors, auch Server),
quizpack(-abstand).test, geschenke.test, feier.test, kalender.test, satz.test, smooth.test, warm.test, editmodel.test,
push.test (+bridge-push-v1), ai.test, i18n.test, own.test, search.test.
→ Fixtures werden in den neuen Baum KOPIERT (mit Herkunftsvermerk), damit nach der Löschung nichts referenziert wird.

## Als Paritäts-Orakel (verhaltensgleich, neue Selektoren)
Pro Szenario ein Szenario-Skript mit Seitenobjekt-Schnittstelle (openCard, customize(part), share, receive(link),
play(mode)); zwei Adapter (alt/neu) bis zur Umschaltung; danach nur noch der neue Adapter. Priorität: d1, karte, warm,
turn, start, create-*, robot, blasen-*, stil, profile, gutschein, kibild, live (Fake), collab, a11y/d1-axe, layout-lang,
zoom-phone, canvas-fit.

## Entfällt
Link-Kompatibilität (golden.test Teile, regal-74-alt.json, „gone“-Pfade), Build-/Teile-Spezifika. Budgets und
Datenschutz-Regeln aus build.test werden als neue Prüfungen gegen den neuen Build neu geschrieben.
