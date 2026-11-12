# 2026-11-11 Bildpreis (KI-Bilder)

**Ziel:** den freigegebenen Preis umsetzen (entscheidungen.md, 2026-11-11):
- 3 KI-Bilder pro Kalendermonat gratis, danach 1 Guthaben pro Bild.
- Abgebucht wird nur bei Lieferung, und keine Einheit wird doppelt ausgegeben.

Danach kamen zwei Entscheidungen des Users dazu (11.11., im Wortlaut über den Koordinator):
- Das Kontobild darf aus den 3 freien Bildern kommen: „JA“.
- Fehlgeschlagene Aufträge zählen weiter zum Tageslimit von 10: „JA“.
- Dazu: „aber bau es so das es noch geandert werden kann“.

**PRs (offen, nicht gemergt, nicht ausgerollt):**
- Server: scimbe/CADS-DEMO-wrapper#128 (Basis `origin/main`; der Bild-Dienst #123 ist gemergt)
- Alt-Client: scimbe/CADS-agent-marketplace#234. Die Änderung ist klein: nur `src/kibild.js`, `src/kibild.json` und Tests. Preis und Regeln entscheidet der Server.

## Ergebnis (Ist-Verhalten mit den PRs)

- **Reservieren statt abbuchen:** Ein angenommener Auftrag reserviert die Einheit nur. Das ist ein freier Platz des Monats oder ein Guthaben-Hold über `DUELL_BILD_PRICE` Einheiten (`lib/duell-credit.mjs` `hold/commit/release`).
- **Abbuchung:** erst bei der Auslieferung eines geprüften Bildes (`lib/duell-bild.mjs` `charge()`, Job `charged: 'free'|'credit'`).
- **Kostenlos und ohne Topfverbrauch:** Absage (Regel oder Modell), Prüfdienst aus, busy, Tageslimit, Worker-Fehler, Frist, Bildprüfung lehnt ab, Abbruch in der Schlange und während der Erzeugung.
- **Gleichzeitigkeit:** Preis und Tageslimit werden nach dem letzten `await` synchron neu entschieden.
  - Vorher gab es einen echten Fehler: 8 gleichzeitige Anfragen bekamen bei 3 frei + 1 Guthaben 8 Bilder. Der Test ist auf dem alten Code rot (`actual: 8, expected: 4`).
  - Ein gehaltenes Guthaben kann auch die freie Karte nicht ausgeben.
- **Monat:** Kalendermonat in UTC, Neustart am 1. um 00:00 UTC. Ein Bild zählt für den Monat seiner Anfrage.
- **Kontobild:** wie jedes Bild, also erst frei, dann Guthaben. Abschaltbar mit `DUELL_BILD_AVATAR_FREE=0`.
- **Tageslimit:** Fehlschläge zählen mit und kosten nichts. Mit `DUELL_BILD_CAP_COUNTS_FAILED=0` gibt ein nicht geliefertes Bild seinen Tagesplatz zurück.
- **Konfiguration** (Env, Vorgaben in Klammern):
  - `DUELL_BILD_FREE_PER_MONTH` (3)
  - `DUELL_BILD_PRICE` (1)
  - `DUELL_BILD_DAILY_CAP` (10)
  - `DUELL_BILD_AVATAR_FREE` (1)
  - `DUELL_BILD_CAP_COUNTS_FAILED` (1)

  Geprüft wird beim Start (`pricingConfig`). Ein gesetzter Wert außerhalb von ganzer Zahl und Bereich bricht den Start mit dem Namen ab. Die alten Namen `DUELL_BILD_FREE` und `DUELL_BILD_PER_DAY` gelten weiter, der neue Name gewinnt. `docker-compose.yml` reicht alle fünf Variablen durch; ein leerer Wert gilt als Vorgabe. Die Tabelle steht im Kopf von `lib/duell-bild.mjs`.
- **Schnittstelle:**
  - `/api/duell/bild/status` liefert `rules` (die wirksamen Werte), `next`, `free.resetAt` und `voucher`.
  - `/api/duell/ai/status` (mit Login) liefert `bild { freeLeft, freeSize, period, tz, resetAt, credit, price, avatarFree, next }`.
- **Client:**
  - Vor dem Bild steht der Preis dieses Bildes. `{p}` kommt aus `rules.price`, das Kontobild folgt `rules.avatarFree`. Dazu der Satz: „Abgebucht wird erst, wenn du ein geprüftes Bild bekommst …“.
  - Nach der Lieferung steht, was abgebucht wurde.
  - Gibt es weder ein freies Bild noch Guthaben, erscheinen „Guthaben aufladen“ (Gutschein) und das Datum, ab dem es wieder freie Bilder gibt.
  - Ohne `next` oder `rules` vom Server nennt die Seite keinen Preis.

## Testbelege

- Wrapper `node --test test/*.mjs`: 648/648 bestanden. `test/duell-bild-preis.test.mjs` hat 12 Tests:
  - 3 frei, dann Guthaben
  - kein Abzug bei 9 Fehlerarten
  - Abbruch
  - zu wenig Guthaben
  - Kontobild mit beiden Schalterstellungen
  - Tageslimit mit beiden Schalterstellungen
  - `DUELL_BILD_PRICE=2`
  - Startprüfung mit 10 Unsinnswerten
  - UTC-Monatswechsel
  - Gleichzeitigkeit, auch über Funktionen
  - Hold-Buchhaltung
- App `npm test`: 681/681 bestanden. kibild-E2E: 8/8 bestanden; neu sind „Preis ehrlich: Topf leer …“ und „Kontobild aus den freien Bildern …“.
- App `npm run test:e2e` (Endstand): 394 Tests, 375 bestanden, 18 rot, 1 übersprungen. Alle roten Tests liegen in `collab.e2e.js`, `noto.e2e.js` und `kimark.e2e.js` (KI-Siegel). Diese Dateien sind unverändert und auf `origin/main` 61cd02e lokal ebenso rot. Sie sind also umgebungsbedingt und kommen nicht von diesem Auftrag.

## Offene Punkte

- **Neustart:** Holds liegen nur im Speicher, wie die Jobs. Nach einem Neustart ist nichts Gehaltenes berechnet.
- **Reihenfolge:** den Server (#128) vor dem Client (#234) ausrollen. Ohne `next` und `rules` zeigt der Client keinen Preis an.
- **Neuer Client:** Er braucht nur `rules`, `next`, `free.left` und `free.resetAt` aus `/bild/status` (oder `bild` aus `/ai/status`) und keine eigene Preislogik.
