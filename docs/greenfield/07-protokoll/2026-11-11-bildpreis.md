# 2026-11-11 Bildpreis (KI-Bilder)

**Ziel:** Den freigegebenen Preis umsetzen (entscheidungen.md, 2026-11-11): 3 KI-Bilder pro Kalendermonat gratis, danach 1 Guthaben pro Bild. Es wird nur bei Lieferung abgebucht und nichts doppelt ausgegeben.

**PRs (offen, nicht gemergt, nicht ausgerollt):**
- Server: scimbe/CADS-DEMO-wrapper#128 (Basis `origin/main`; der Bild-Dienst #123 ist gemergt)
- Alt-Client: scimbe/CADS-agent-marketplace#234. Die Änderung ist klein, nur `src/kibild.js` und `src/kibild.json`. Den Preis entscheidet der Server.

## Ergebnis (Ist-Verhalten mit den PRs)

- Wenn ein Auftrag angenommen wird, wird die Einheit nur **reserviert**. Das ist ein freier Platz des Monats oder ein Guthaben-Hold (`lib/duell-credit.mjs` `hold/commit/release`).
- **Abgebucht** wird erst, wenn ein geprüftes Bild ausgeliefert wird (`lib/duell-bild.mjs` `charge()`, Job `charged: 'free'|'credit'`).
- **Ohne Abbuchung und ohne Topfverbrauch:** Absage (Regel oder Modell), Prüfdienst aus, busy, Tageslimit, Worker-Fehler, Frist, Bildprüfung lehnt ab, Abbruch in der Schlange und während der Erzeugung.
- **Gleichzeitigkeit:** Preis und Tageslimit werden nach dem letzten `await` synchron neu entschieden.
  - Vorher gab es einen echten Fehler: 8 gleichzeitige Anfragen bekamen bei 3 frei + 1 Guthaben 8 Bilder.
  - Der Test ist auf dem alten Code rot: `actual: 8, expected: 4`.
  - Ein gehaltenes Guthaben kann auch die freie Karte nicht ausgeben.
- **Monat:** Es gilt der Kalendermonat in UTC. Der Neustart ist am 1. um 00:00 UTC. Ein Bild zählt für den Monat seiner Anfrage.
- **`/api/duell/ai/status`** (mit Login) liefert `bild { freeLeft, freeSize, period, tz, resetAt, credit, price, next }`. `/api/duell/bild/status` liefert zusätzlich `free.resetAt`, `next` und `voucher`.
- **Client:**
  - Vor dem Bild steht der Preis dieses Bildes und der Satz „Abgebucht wird erst, wenn du ein geprüftes Bild bekommst …“.
  - Nach der Lieferung steht, was abgebucht wurde.
  - Gibt es weder ein freies Bild noch Guthaben, erscheinen „Guthaben aufladen“ (Gutschein) und das Datum, ab dem es wieder freie Bilder gibt.

## Testbelege

- Wrapper `node --test test/*.mjs`: 644/644 bestanden. Neu ist `test/duell-bild-preis.test.mjs` (8 Tests: 3 frei dann Guthaben, kein Abzug bei 9 Fehlerarten, Abbruch, zu wenig Guthaben, UTC-Monatswechsel, Gleichzeitigkeit, Gleichzeitigkeit über Funktionen, Hold-Buchhaltung).
- App `npm test`: 681/681 bestanden. kibild-E2E: 7/7 bestanden, davon ist „Preis ehrlich: Topf leer …“ neu.
- App `npm run test:e2e`: 374 bestanden, 14 rot. Alle roten Tests liegen in `collab.e2e.js` und `noto.e2e.js` und sind auf unverändertem `origin/main` 61cd02e lokal ebenso rot (17/17). Sie sind also umgebungsbedingt und kommen nicht von diesem Auftrag.

## Offene Punkte

- **Kontobild:** Es bleibt bei „nur mit Guthaben“, nie aus den 3 freien Bildern (Betreiberentscheidung aus #123). Die neue Entscheidung sagt allgemein „3 pro Monat gratis“. → offen.md
- **Tageslimit:** Es zählt angenommene Aufträge, auch fehlgeschlagene (Schutz der GPU). Das ist keine Abbuchung, aber ein Konto kann nach 10 Fehlschlägen am Tag kein Bild mehr anfragen.
- **Neustart:** Holds liegen nur im Speicher, wie die Jobs. Nach einem Neustart ist nichts Gehaltenes berechnet.
- **Reihenfolge:** Den Server (#128) vor dem Client (#234) ausrollen. Ohne `next` zeigt der Client keinen Preis an.
- **Neuer Client:** Er braucht nur `bild.next`, `bild.freeLeft` und `resetAt` aus `/ai/status` und keine eigene Preislogik.
