# Gesamtkonzept My Daily Idea (Neuentwurf)

Status: Entwurf zur Prüfung. Fasst `03-architektur/blueprint.md` und die Einzeldokumente zusammen.
Grundlage: Fragment-Spezifikation (`02-spec/`), Anti-Patterns (`01-analyse/`), Entscheidungen (`entscheidungen.md`).
Was noch durch Forschung oder Spike belegt werden muss, ist mit **[prüfen]** markiert.

## 1. Die Idee in einem Satz

**Eine Karte ist ein kleines, deterministisches Programm mit beschriebenen Einstellungen; ein Raum ist eine
Verbindung zwischen Menschen; ein Konto ist Besitz und Berechtigung.** Alles andere – Editor, Blasen, Robot, Magie,
KI-Bild, Allein/Bot/Duell, Live, Teilen, Business – wird aus diesen drei Dingen *abgeleitet* statt je Karte gebaut.

Das ist die Antwort auf die Anti-Patterns: Heute baut jede Kartenart ihren Editor, ihre Spielmodi und ihre Sonderfälle
selbst (A3, A6). Im Neuentwurf schreibt eine Karte nur Regeln und eine Beschreibung; die App erzeugt den Rest.

## 2. Drei unabhängige Achsen

| Achse | Frage | Zustände (Statechart-Region) |
|---|---|---|
| **Inhalt** | Was sehe/spiele ich? | Regal → Karte (ansehen, anpassen, spielen, erschaffen) → Teilen/Empfangen |
| **Raum** | Mit wem bin ich verbunden? | allein → einladen → verbunden (n Personen; Daten immer, Sprache/Video optional) → getrennt |
| **Konto** | Wer bin ich, was darf ich? | anonym (Gerät) → angemeldet (16+, Guthaben, Grants) |

Die drei sind **parallele Regionen einer Statechart** (Harel). Folge: Man kann im Raum bleiben, während man die Karte
wechselt; man kann sich anmelden, ohne das Spiel zu verlieren; die Business-Sicht ist nur ein anderer Katalog und ein
anderes Theme über denselben Achsen. Keine Region greift in eine andere hinein; sie sprechen über Ereignisse.

## 3. Die Karte: ein Vertrag, drei Stufen

Jede Karte – Grundstock, Haiku-erzeugt, Business – erfüllt denselben Vertrag:

```
manifest  { id, kind, title{de,en}, players{min,max}, mode: static|turn|realtime,
            params: JSON-Schema   ← was man einstellen kann (inkl. Slots für Text, Farbe, Bild, Logo)
            parts: [...]          ← welche Teile der Bühne zu welchen params gehören (→ Blasen)
            uses: [image, voice, video, collab, relay]  ← Fähigkeiten, die der Broker gewähren muss
            limits{stepBudget, stateBytes} }
module    init(rng, params, players) → state
          step(state, input, rng)    → state        (deterministisch, keine Uhr, kein Netz, kein DOM)
          view(state, seat)          → Anzeigeliste (Primitive + Token-Namen + Barrierefreiheits-Text)
          status(state)              → {over, score[], winner, turn}
          moves?(state, seat)        → legale Züge (ermöglicht generischen Bot)
```

**Drei Stufen, damit neue Spiele leicht und Haiku-tauglich sind:**

| Stufe | Wie entsteht die Karte | Wer kann sie bauen | Sicherheit |
|---|---|---|---|
| **S-Daten** | nur params eines bestehenden Bausatzes (Text, Farben, Bilder, Quizfragen) | Mensch, Magie, Haiku (Felder) | Schema genügt |
| **S-Regeln** | Spiel aus **Bausteinen** deklarativ zusammengesetzt (Gitter, Kollision, Schwerkraft, Züge, Stapel/Hand, Timer in Ticks, Punkte) | Haiku, Entwickler | Schema + Playtests |
| **S-Code** | eigener Code in den Hooks des SDK, Bausteine als Bibliothek | Haiku im Harness, Entwickler | AST-Allowlist, Budgets, Sandbox, Playtests, Signatur |

Haiku versucht **immer zuerst die niedrigste Stufe**, die die Absicht abbildet; erst wenn die Mechanik dort nicht
ausdrückbar ist, schreibt es Code. Das senkt Kosten und Fehlerquote und hält die Freiheit nach oben offen. Vorbild sind
Spielbeschreibungssprachen (VGDL, Ludii, PuzzleScript) **[prüfen: Forschung zu LLM + Spielbeschreibungssprachen]**.

**Was dadurch automatisch für jede Karte gilt (keine Ausnahmen mehr):**
- **Blasen und Editor** werden aus `parts` + `params` erzeugt: jede Blase öffnet den Overlay-Dialog mit den Feldern
  ihres Teils. Ein Bild-Slot im Schema bekommt automatisch „KI-Bild“, ein Text-Slot den Filter.
- **Magie** = Zufall aus dem Seed über das Schema (nur erlaubte Werte).
- **Robot** = derselbe Erzeugungsweg wie die freie Karte, mit der Karte als Basis: Haiku liefert einen *Patch* auf
  params, Regeln oder Code; der Harness prüft ihn wie jede neue Karte.
- **Allein · Bot · Duell** werden aus dem Manifest abgeleitet: `moves` vorhanden → Bot (generischer Suchbot mit Budget);
  deterministisches `step` → Duell per Link (Seed + Eingabe-Log = Geist/Zug) und live (Lockstep im Raum).
- **Teilen**: Karte = Referenz auf Code/Regeln (signiert) + params + Seed, ein Linkformat für alles.
- **Design**: `view` liefert nur Primitive mit Token-Namen; ein einziger Renderer zeichnet sie im Design-System.
  Dadurch sieht ein Haiku-Spiel aus wie ein handgebautes („wie aus einem Ei“). Text in der Anzeigeliste wird zusätzlich
  als zugängliche Beschreibung ausgegeben.

**Grundstock und Engines:** Die heutigen Engines (Flug, Lauf, Arcade, Zug, Tisch, Dart, Malrat …) werden als
**Bausätze** neu gebaut – S-Regeln/S-Code mit Bausteinen. Die ~52 Zugkarten sind fast nur Daten über wenige
Zug-Bausätze; sie werden S-Daten-Karten. Der Altcode dient als Spezifikation ihrer Regeln und Physik (Testvektoren).

## 4. Der Raum: Webkonferenz als Grundschicht, nicht als Funktion

Heute ist Live ein Modus einzelner Spiele. Im Neuentwurf ist der **Raum** eine eigene Schicht über allem:

- **Ein Raum, viele Tätigkeiten:** Wer verbunden ist, bleibt verbunden. Karte wechseln, zusammen anpassen, spielen,
  Datei schicken, Notiz schreiben, reden, sehen – ohne neue Einladung. Eine Karte im Raum zu öffnen heißt: „Karte
  anbieten“ → Gegenüber nimmt an → beide laden dieselbe Karte mit demselben Seed.
- **Technik aus vorhandenen Teilen:** Kanal und Identität aus ct-agent (Noise_IK, Edge-Join), Daten über den
  WebRTC-Datenkanal, **Sprache/Video über `apps/call-core`** (transportunabhängiger 1:1-Anrufkern, Medien erst nach
  Annahme, nichts aufgezeichnet), Rückfall „direct-channel“ und ICE-Watchdog aus der Webkonferenz, TURN nur per Grant.
  Diese Teile werden zu **einem Paket** zusammengeführt, das App, Business und Webkonferenz-Seite gemeinsam nutzen –
  kein zweiter Code. **[prüfen: Funktionsumfang und Schnittstellen der Webkonferenz und von call-core]**
- **Eine Identität:** Der ct-agent-Schlüssel wird an das Konto gebunden (heute: eigene Identität im localStorage der
  Webkonferenz). Kontakte und Raum-Einladungen sind dieselben in App und Webkonferenz.
- **Eine Optik:** Teilnehmerkacheln, Mikro/Kamera, Verbindungsqualität, Prüfbilder sind feste Komponenten des
  Design-Systems. Die Webkonferenz hat bereits ein „daily“-Theme mit denselben Farben und Anton – es wird zur
  gemeinsamen Token-Quelle statt einer Kopie.
- **Ehrlich und privat:** Medien nur nach Tipp, Ende-zu-Ende, Hinweis auf sichtbare IP, Relay-Regeln wie bei Dateien.
- **Apps:** Heute kann keine App eine Live-Verbindung aufbauen. Die Seite darf dort nur die API bzw. Kurzlinks
  erreichen, die Webkonferenz-Bridge liegt auf einem anderen Host (Befund Relay-Agent, `07-protokoll/2026-11-11-relay-grant.md`).
  Im Neuentwurf löst „eine Domain“ (`/live/*` neben `/api/*`) das: Die Apps erlauben genau eine Herkunft, CORS entfällt.
  Ob Live in den Apps über die Seite oder nativ über die Hülle läuft, ist **[Entscheidung offen]**.
- **Mehr als zwei:** 1:1 und kleine Gruppen per Mesh; ab etwa 4 Personen SFU (FOSS) **[prüfen: Schwelle, Auswahl]**.

## 5. Erzeugung und Harness: ein Weg

```
Absicht (Satz + Kategorie [+ Basis-Karte bei Robot])
  → Einordnung: Stufe S-Daten | S-Regeln | S-Code | „gibt es noch nicht“ (ehrlich, mit nächster Karte)
  → Haiku erzeugt Felder / Regeln / Code (Server, Queue, Budget)
  → Harness: Schema → statische Prüfung → Determinismus → Bot-Playtests (endet, gewinnbar, nicht trivial)
            → erweiterte Eingaben → Optik-Prüfung (Kontrast, Lesbarkeit) → bis zu n Reparaturrunden
  → Signatur → Vorschau → Annehmen/Verwerfen (Guthaben erst bei Annahme)
```

- Optimierung des Harness nur gegen **eingefrorenes, menschlich bewertetes Gold**; LLM-Judge nur für nicht
  ausführbare Qualität, per Kappa gegen Gold kalibriert, mit vertauschter Reihenfolge und fremdem Modell (Zheng et al. 2023).
- Ausführbare Prüfungen haben Vorrang vor Judge-Urteilen (EvalPlus, Liu et al. 2023).
- Der Kunde sieht nie Code; er sieht Vorschau, Einstellungen und ehrliche Gründe.

## 6. Konto, Berechtigung, Geld

- **Ein Auth-Modell** (OIDC + PKCE, Bearer) für Web, Business, iOS, Android **[Entscheidung offen]**.
- **Der Server entscheidet jede Berechtigung** und gibt kurzlebige, signierte Grants (Relay, Bild, Erzeugung).
  Der Client zeigt nur Bescheide. Gratis-Kontingente und Guthaben werden serverseitig gebucht (Buchungszeilen,
  Idempotenz-Schlüssel).
- Preise wie entschieden: Bild 3/Monat gratis, dann 1 Guthaben; Relay nur zahlend, Empfang über zahlenden Partner erlaubt.

## 7. Plattform und Design

- **Ein Design-System** (Tokens: Farbe, Typo, Abstand, Radius, Bewegung, Elevation) für App, Karten, Spiele, Raum,
  Business-Theme. Karten zeichnen nur in ihrer Bühne; der Rahmen (Kopf, ✕, Blasen, Dialog, Hauptaktion) ist fest.
- **Plattformtreue** in den Apps: native Navigation/Zurück-Geste, Teilen-Blatt, Haptik, Safe Areas, Systemschrift für
  Fließtext, Dark Mode – über die Host-Bridge (DuellHost v2, ein Schema für iOS und Android). Die Marke bleibt über
  Tokens erkennbar. **[prüfen: Forschung zu Konsistenz vs. Plattformkonvention]**
- **Progressive Disclosure** aus der Statechart: je Zustand eine Hauptaktion, höchstens drei Nebenaktionen.
- **Prozess:** Claude Design (Varianten) → Swarm-Kritik ohne Vorwissen mit Personas 16–85 → Iteration bis ohne
  kritische Befunde → Prüfung auf echten Geräten. (Konnektor braucht derzeit erneutes Anmelden.)

## 8. Betrieb und Skalierung

Eine Domain mit Pfaden; L7-Eingang (FOSS); zustandslose App-Repliken; PostgreSQL + Objektspeicher, Sharding nach Konto;
teure Arbeit (Haiku, Bilder, Playtests) als Jobs in einer Queue mit Pull-Workern an jedem Ort (on-prem, ICC-GPU,
Cloud-Burst); Live-Signalisierung mit Rendezvous-Hash nach Kanal; TURN-Pool. Details: `03-architektur/skalierung.md`.

## 9. Reihenfolge: das Rückgrat zuerst, dann in die Breite

Statt Bereich für Bereich zu portieren, wird **zuerst ein dünner Durchstich durch alle drei Achsen** gebaut, weil er das
Konzept beweist oder widerlegt:

1. **Durchstich D1:** Statechart + Vertrag + Renderer + Design-Tokens + Raum. Eine S-Daten-Karte und ein
   S-Regeln-Spiel (Flug als Bausatz) – allein, Bot, per Link, **live im Raum mit Sprache** – auf Web und iOS.
   Abnahme: dasselbe Spiel-Modul läuft in allen Modi ohne eine Zeile Sonderlogik; Design-Kritik bestanden.
2. **Durchstich D2:** Erzeugung – Haiku baut ein S-Regeln-Spiel und ein S-Code-Spiel durch den Harness; Robot als Patch
   auf D1-Karten.
3. **Breite:** Bausätze und Grundstock-Karten, Konto/Guthaben, Werkzeuge, Push, Wand, Business, Android.
4. **Skalierung** P0–P4 parallel ab D1 (Server-Seite).
5. **Umschaltung** bei Parität, dann **Altcode löschen** (S16) mit CI-Sperre.

Tests laufen parallel auf labor-setup.de; jeder Schritt: Forschung → Entwurf → Bau → Test → Kritik → Protokoll.
Diese Reihenfolge ersetzt die bereichsweise Reihenfolge in `06-plan/slices-detail.md` (die Slices bleiben als Inhaltsliste).

## 10. Bewusste Grenzen und Risiken

- **Umfang:** 64 Regal-Karten, ~12 Engines, Apps, Server-Umbau. Gegenmittel: Bausätze machen die meisten Karten zu Daten;
  Durchstich zuerst; Paritätsliste als Maßstab.
- **Freiheit vs. Sicherheit bei S-Code:** freie Mechanik heißt mehr Angriffsfläche; Gegenmittel Sandbox + Signatur +
  Budgets, und Haiku beginnt immer auf der niedrigsten Stufe.
- **Determinismus über Geräte:** Lockstep verlangt identische Arithmetik; Gegenmittel: keine plattformabhängigen
  Gleitkomma-Funktionen im SDK (wie im Code-Modus), Hash-Abgleich.
- **Raum-Identität an Konto binden** ändert die Webkonferenz; muss mit deren Sicherheitsmodell abgestimmt werden.
- **Bindung ohne Manipulation:** Wiederkehr entsteht aus Inhalt und Menschen im Raum, nicht aus Druck (`05-bindung/`).
