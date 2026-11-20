# Gesamtkonzept My Daily Idea (Neuentwurf) – Fassung 2

Status: überarbeitet nach Konzept-Kritik (`07-protokoll/2026-11-11-konzept-review.md`), Forschung (`08-forschung/`)
und Entscheidungen vom 2026-11-11. Fasst `03-architektur/blueprint.md` und die Einzeldokumente zusammen.
**[prüfen]** = noch durch Spike/Messung zu belegen. **[offen]** = Entscheidung steht aus (`offen.md`).

## 1. Die Idee in einem Satz

**Eine Karte ist ein kleines, deterministisches Programm mit beschriebenen Einstellungen; ein Raum ist eine
Verbindung zwischen Menschen; ein Konto ist Besitz und Berechtigung.** Editor, Blasen, Robot, Magie, KI-Bild,
Allein/Bot/Duell, Live, Teilen und Business werden daraus *abgeleitet* statt je Karte gebaut (gegen A3, A6).

## 2. Drei unabhängige Achsen (parallele Regionen einer Statechart)

| Achse | Frage | Zustände |
|---|---|---|
| **Inhalt** | Was sehe/spiele ich? | Regal → Karte (ansehen, anpassen, spielen, erschaffen) → Teilen/Empfangen |
| **Raum** | Mit wem bin ich verbunden? | allein → einladen → verbunden (Präsenz: Daten → Sprache → Video) → getrennt |
| **Konto** | Wer bin ich, was darf ich? | anonym (Gerät) → angemeldet (16+, Guthaben, Grants) |

Regionen greifen nicht ineinander, sie sprechen über Ereignisse. Der **Raum setzt Anmeldung voraus** (Entscheidung);
allein spielen, per Link duellieren und Karten teilen geht ohne Konto.

## 3. Die Karte: ein Vertrag

```
manifest  { id, version, codeHash, sdk, kind, title{de,en}, players{min,max}, mode: static|turn|realtime,
            params: JSON-Schema, parts: [...] (→ Blasen),
            uses: [image, voice, video, collab, relay, audio-out],
            hidden: none | commit-reveal | mental-poker | server-dealer,
            limits{stepBudget, stateBytes} }
module    init(rng, params, players)      → {pub, priv[seat]}
          step(state, input, rng)         → state             (deterministisch, Ganzzahl/Festkomma, kein DOM/Netz/Uhr)
          observe(state, seat)            → was dieser Sitz wissen darf
          view(obs, seat)                 → Anzeigeliste (Primitive + Token-Namen + Barrierefreiheits-Text)
          status(state)                   → {over, score[], winner, turn}
          moves?(obs, seat), heuristic?(obs, seat), sample?(obs, rng)   → für generische Bots
          audio?(state, tick)             → Klangereignisse (für Beat-Karte), vom Host abgespielt
```

### 3.1 Verdeckte Information (Kritik K1)
Zustand ist geteilt in **öffentlich** und **privat je Sitz**. Ein Gerät erhält nie den privaten Teil anderer Sitze.
Wer die verdeckte Information verwaltet, erklärt die Karte im Manifest; erlaubt sind **Geräte und Server**
(Entscheidung): Commit-Reveal (versiegelte Fragen, gleichzeitige Züge), Mental Poker (Kartenmischen ohne Geber, aus dem
Altcode `mpoker`), Server-Geber (signierte Ausgabe je Sitz). Bots planen nur aus `observe` (ISMCTS mit `sample`).
Abnahmetest je Karte: „gegnerische Hand aus Gerät/Link/Netz lesen“ muss scheitern.

### 3.2 Felder und Privatsphäre (Kritik K2)
params-Schema kennt Feldtypen mit Herkunft und Reiseregeln:
| Feldtyp | Beispiel | reist im Link | geht zum Modell (Robot) | geht zum Server |
|---|---|---|---|---|
| `text`, `color`, `choice`, `number` | Titel, Farben | ja | ja, wenn `model: true` | nur beim Teilen per Kurzlink |
| `media.local` | eigenes Foto, eigene Aufnahme | **nur wenn der Nutzer es beim Teilen wählt** (Entscheidung), Standard nein | nie | nie |
| `media.server` | KI-Bild, Logo | als Referenz | nein | ist dort |
| `secret` | versiegelte Frage, Notiz | nur versiegelt | nie | nie |

### 3.3 Drei Stufen für neue Spiele (Forschung spielbeschreibung.md, Kritik H2)
| Stufe | Form | Wer | Sicherheit |
|---|---|---|---|
| **S-Daten** | params eines Bausatzes | Mensch, Magie, Haiku | Schema |
| **S-Regeln** | **JSON-Dokument aus 18 Bausteinen** (Raum: grid, track, field; Dinge: entity, spawner, deck, pieces; Bewegung: kinematics, collide, aim; Ablauf: turns, timer, input; Regeln: rule, pattern, score, end, prompt), per Schema und strikter Tool-Nutzung erzeugt | Haiku, Entwickler | Schema + Harness + **Signatur** |
| **S-Code** | JS in den SDK-Hooks, Bausteine als Bibliothek | Haiku im Harness, Entwickler | AST-Allowlist, Budgets, Sandbox, Harness, Signatur |

Keine eigene Textsprache (VGDL/Ludii-Syntax scheitert an kleinen Modellen schon beim Parsen, Hu et al. 2024); S-Regeln
ist JSON, das derselbe Laufzeitkern interpretiert, den auch S-Code als Bibliothek nutzt (kein Doppelbau).
**Gate vor D2 [prüfen]:** Benchmark ~30 eingefrorene Absichten × 3 Stufen mit Haiku. Bringt S-Regeln keinen
messbaren Vorteil, entfällt die Stufe und die Bausteine bleiben nur Bibliothek.

### 3.4 Was automatisch für jede Karte gilt
- **Blasen/Editor** aus `parts` + `params`. Wo Ableitung nicht reicht (freies Zeichnen, Sticker platzieren, Listen),
  liefert der Vertrag **Editor-Bausteine** (Zeichenfläche, Platzierer, Liste) – weiterhin ohne Kartensonderlogik.
- **Magie** = Zufall aus dem Seed über das Schema. **Robot** = Patch über denselben Erzeugungsweg, nur Felder mit
  `model: true`.
- **Allein · Bot · Duell** aus dem Manifest: generischer Bot (MCTS/ISMCTS) mit **Budget in Iterationen**, damit Züge auf
  allen Geräten gleich und als Geist abspielbar sind; Stärke als sichtbare Stufe. Duell per Link = Seed + Eingabe-Log;
  live = Lockstep im Raum.
- **Design**: ein Renderer, nur Token-Namen → Haiku-Spiele sehen aus wie handgebaute.

### 3.5 Determinismus (Forschung determinismus.md)
Spielzustand in Ganzzahl/Festkomma; SDK liefert Tabellen-Trigonometrie und Seed-RNG; der Harness sperrt
`sin/cos/atan2/exp/log/pow/hypot` in Spiellogik. Pflichtprüfung: gleicher Zustandshash in V8 und JavaScriptCore,
bevor eine Karte als live-fähig gilt. Im Lockstep regelmäßiger Hash-Abgleich, Abweichung wird offen gemeldet.

### 3.6 Grundstock und Engines
Heutige Engines werden als Bausätze neu gebaut (S-Regeln/S-Code); die ~52 Zugkarten werden S-Daten-Karten. Altcode
liefert Regeln/Physik als Testvektoren. Sonderfälle der Kritik werden über Vertragsteile gelöst: Beat-Karte über
`audio`, Werkzeuge (Datei, Notiz) als Karten mit `mode: static` und Raum-Fähigkeiten, Zusammen bauen über `collab`.

## 4. Der Raum: Webkonferenz als Grundschicht

- **Ein Raum, viele Tätigkeiten**, nur mit Anmeldung. Karte anbieten → annehmen → beide laden dieselbe Karte.
- **Präsenzstufen:** Daten (Standard) → Sprache → Video. Video startet nie automatisch; Spielbühne bleibt größer als
  Videokacheln; Selbstansicht ausblendbar; Online-Anzeige nur nach Zustimmung; Raum hat eine definierte Lebensdauer
  (Forschung ko-praesenz.md).
- **Versionen (Kritik K3):** Jedes Kartenangebot trägt `codeHash` + `sdk`. Fehlt dem Gegenüber die Version, lädt es das
  signierte Kartenmodul nach; passt es nicht, wird das offen gesagt statt zu starten.
- **Ein Transport für alle Plattformen:** Kanal/Identität aus ct-agent (Noise_IK), Daten per WebRTC-Datenkanal,
  Sprache/Video über `call-core`, **das künftig über den Noise-Kanal signalisiert** statt über eigene Signalisierung der
  Webkonferenz. Kanalaufbau ist heute fünfmal implementiert → ein gemeinsames Paket mit sechs Schichten (Kanal, Sitzung,
  Transport, Relay, Identität, Design-Tokens) für App, Business und Webkonferenz (Forschung webconference-inventar.md).
  Das ist eine Migration der Webkonferenz, nicht nur ein Herauslösen **[mit Betreiber abstimmen]**. Lizenzdatei im
  Webkonferenz-Repo fehlt.
- **Apps:** heute ohne Live, weil die Seite nur die API erreichen darf. „Eine Domain“ (`/live/*` neben `/api/*`) löst das.
  Live über die Seite oder nativ über die Hülle **[offen]**.
- **Relay:** für kleine Spieldaten **gratis mit Ratenlimit**, für Dateien nur zahlend (Entscheidungen). Grund: hinter
  Mobilfunk-CGNAT mit adress- und portabhängiger Abbildung findet ICE oft kein direktes Paar.
- **Gruppen:** Daten und Sprache bleiben länger Mesh; **SFU ab der 4. Videoperson** (eigene Rechnung **[prüfen]**),
  mediasoup (ISC) als SFU, LiveKit (Apache-2.0) als Rückfall. Über eine SFU ist Ende-zu-Ende nur mit SFrame
  (RFC 9605) gegeben; bis das in iOS/Android-WebViews belegt ist, zeigt die Oberfläche ehrlich „über Server vermittelt“.
- **Identität:** ct-agent-Schlüssel an das Konto gebunden, vom Server per Signatur bestätigt; Kontakte gehören zum Konto.
  Speicherung serverseitig nur pseudonym (HMAC), passend zur Regel „Server speichert nur Hashes und Zähler“ **[prüfen]**.
- **Ausfälle (Kritik H):** Wiederverbinden mit Zustandsabgleich per Hash; gleichzeitige Angebote → das zuerst
  quittierte gilt; Partner geht → Spiel pausiert, dann ehrliches Ende; Blockieren/Melden aus dem Raum heraus.

## 5. Erzeugung und Harness: ein Weg

```
Absicht (Satz + Kategorie [+ Basis-Karte bei Robot, nur model:true-Felder])
  → Einordnung per strikter Tool-Nutzung: S-Daten | S-Regeln | S-Code | „gibt es noch nicht“ (ehrlich)
  → Haiku erzeugt (Server, Queue, Budget)
  → Harness: Schema → statische Prüfung (inkl. Sperre ungenauer Mathe) → Determinismus V8/JSC
            → Bot-Playtests (endet, gewinnbar, nicht trivial) → erweiterte Eingaben → verdeckte Info dicht
            → Optik (Kontrast, Lesbarkeit) → Reparaturrunden mit Compiler-/Spieler-Rückmeldung (ScriptDoctor-Muster)
  → Signatur → Vorschau → Annehmen/Verwerfen (Guthaben erst bei Annahme)
```
Optimierung nur gegen eingefrorenes, menschlich bewertetes Gold; Judge per Kappa kalibriert, Reihenfolge vertauscht,
fremdes Modell; ausführbare Prüfungen vor Judge-Urteil.

## 6. Konto, Berechtigung, Geld
Ein Auth-Modell (OIDC + PKCE, Bearer) für alle Oberflächen **[offen]**. Server entscheidet jede Berechtigung per
kurzlebigem, signiertem Grant; Buchungen mit Idempotenz-Schlüssel. Preise und Grenzen per Konfiguration änderbar
(Bild: 3/Monat gratis inkl. Kontobild, dann 1 Guthaben; Tageslimit zählt Fehlschläge).

## 7. Plattform und Design
- Ein Design-System (Tokens) für App, Karten, Spiele, Raum, Business-Theme; fester Rahmen um jede Karte.
- **Plattformtreue** (Forschung plattformtreue.md): Markenschrift für Überschriften, Systemschrift für Fließtext;
  Dark Mode folgt dem System (kein App-eigener Schalter); Host-Bridge v2 mit `back`-Ereignis inkl. „verbraucht?“
  (Androids vorausschauende Zurück-Geste), Insets, Schriftgröße, Farbschema als Host-Zustand; Edge-to-Edge.
- Progressive Disclosure aus der Statechart: je Zustand eine Hauptaktion, höchstens drei Nebenaktionen.
- Prozess: Claude Design (Varianten) → Swarm-Kritik ohne Vorwissen (Personas 16–85) → Iteration → echte Geräte.

## 8. Betrieb und Skalierung
Eine Domain mit Pfaden; L7-Eingang (FOSS); zustandslose App-Repliken; PostgreSQL + Objektspeicher; Jobs in einer Queue
mit Pull-Workern (on-prem, ICC-GPU, Cloud-Burst); Live-Signalisierung mit Rendezvous-Hash; TURN-Pool. Signierschlüssel
nie in Cloud-Workern (Kritik): signiert wird on-prem. P3/P4 erst nach D1 (`03-architektur/skalierung.md`).

## 9. Reihenfolge

| Schritt | Inhalt | Abnahme |
|---|---|---|
| **D0** (nur Web) | Statechart, Vertrag mit verdeckter Information, Renderer, Tokens; eine statische Karte und eine Zugkarte mit Geheimnis (Bluff): allein, Bot, per Link, live über den vorhandenen Datenkanal; ohne Sprache | gleiche Karte in allen Modi ohne Sonderlogik; Hand-lesen-Test scheitert; Design-Kritik bestanden |
| **D1a** | Flug als S-Code mit Bausteinen, Geist per Link, gemessene Live-Synchronität, V8/JSC-Hash | Determinismus über Engines |
| **D1b** | Raum mit Sprache, iOS-Hülle v2 (nach Auth-Entscheidung) | App↔Web im selben Raum |
| **Gate** | Haiku-Benchmark 3 Stufen | Entscheidung S-Regeln ja/nein |
| **D2** | Erzeugung durch den Harness, Robot als Patch | Gold-Vergleich |
| **Breite** | Bausätze, Grundstock, Konto, Werkzeuge, Push, Wand, Business, Android | Paritätsliste |
| **Server** | P0–P2 parallel ab D0; P3/P4 nach D1 | Lasttests |
| **Umschaltung, Löschen** | S15, S16 mit CI-Sperre | Parität 100 % |

Lokale Daten (Wand, Notizen, Gerätecode) gehen bei Domainwechsel verloren; Umzugshilfe beim Umschalten **[offen]**.

## 10. Risiken
Umfang (Gegenmittel: Bausätze, D0 klein, Gates); Freiheit vs. Sicherheit bei S-Code; Determinismus über JS-Engines;
Webkonferenz-Migration braucht Abstimmung; verdeckte Information ist der heikelste Teil des Vertrags; Haiku-Tauglichkeit
der Stufen ist unbelegt bis zum Benchmark. Bindung entsteht aus Inhalt und Menschen, nicht aus Druck (`05-bindung/`).
