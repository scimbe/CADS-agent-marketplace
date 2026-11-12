# Entscheidungslog

| Datum | Entscheidung | Quelle |
|---|---|---|
| 2026-11-11 | Relay für Dateien nur für zahlende Kunden (Guthaben > 0) | User |
| 2026-11-11 | Gratis-Nutzer darf über das Relay eines zahlenden Partners empfangen | User: „Ja“ |
| 2026-11-11 | Relay-Regel serverseitig durchsetzen, auch für iOS/Android | User |
| 2026-11-11 | KI-Bilder: 3 pro Monat gratis, danach 1 Guthaben pro Bild | User: „OK“ |
| 2026-11-11 | Bild-Host: vorhandener ICC-Dienst `z-image` (SDXL `realvisxl`), `sdturbo` nicht (nicht kommerziell) | Messung 768 px ≈ 4,8 s; Anbindung offen |
| 2026-11-11 | Greenfield-Neuentwurf, Altcode = Spezifikation | User |
| 2026-11-11 | Sound nur als eine professionelle Strassenrap-Beat-Karte | User |
| 2026-11-11 | Robot/Magie ohne Ausnahmen für alle Kartenarten | User |
| 2026-11-11 | Haiku schreibt Spielcode nur im kontrollierten Harness; Kunde ohne Codezugang | User |
| 2026-11-11 | Geteilte Links müssen nicht kompatibel bleiben | User |
| 2026-11-11 | Keine Vermischung alter und neuer Quellen; Altcode nach Umschaltung aus `main` entfernen | User |
| 2026-11-11 | Bei jedem Schritt aktuelle Forschung recherchieren und Best-Practice-Lösungen ableiten (`08-forschung/`) | User |
| 2026-11-11 | Eine Sprecher-Session vermittelt mit dem User, leitet nicht | User |
| 2026-11-11 | Architekturziel: hinter einer Domain per Load Sharing und Sharding auf mehrere Systeme verteilbar, Lastspitzen auch hybrid (Cloud) abfangen | User |
| 2026-11-11 | Builds/Tests auf labor-setup.de auslagern (28 Kerne, 62 GB); labor-setup.com nur mit Rücksicht auf die Praktikums-LLM | User |
| 2026-11-11 | Einheitliches Design „wie aus einem Ei“ für Web, Business, iOS, Android, inkl. Webkonferenz, Spiele, Karten; Plattformtreue; Claude Design + Swarm-Kritik ohne Vorwissen mit Iteration | User |
| 2026-11-11 | Business-Sicht kommt mit in den Neuentwurf | User |
| 2026-11-11 | Grundstock-Karten und Spiel-Engines neu; Baukasten, der freie Designs/Mechaniken mit Harness und Haiku erlaubt | User |
| 2026-11-11 | Auf Systemhygiene achten (`00-hygiene.md`) | User |
| 2026-11-11 | Nahtlose Integration der Webkonferenz (Daten, Sprache, Video, ein Raum über Tätigkeiten hinweg) | User |
| 2026-11-11 | Kontobild darf aus den 3 freien Bildern pro Monat kommen | User: „JA“ |
| 2026-11-11 | Fehlgeschlagene Bildaufträge zählen weiter zum Tageslimit (ohne Abbuchung) | User: „JA“ |
| 2026-11-11 | Preisregeln für Bilder per Konfiguration änderbar bauen | User: „aber bau es so das es noch geandert werden kann“ |
| 2026-11-11 | TURN-Relay für kleine Spieldaten gratis mit Ratenlimit (Datei-Relay bleibt zahlend) | User: „ja“ |
| 2026-11-11 | Verdeckte Information: Geber dürfen Geräte (P2P) und Server sein | User: „Die Geräte und server“ |
| 2026-11-11 | Raum und Kontakte nur mit Anmeldung | User: „nur mit anmeldung“ (Auslegung: Raum braucht Konto; Kontakte gehören zum Konto) |
| 2026-11-11 | Fotos: Nutzer entscheidet je Teilen, ob ein Foto mitreist (Standard: bleibt auf dem Gerät) | User: „man kann es entscheiden“ (Auslegung) |
| 2026-11-11 | /duell bleibt beim Neuentwurf, kein Rollback auf die alte App bis zur Parität | User: „1 Nein“ |
| 2026-11-11 | Volles Feature-Set der alten App ist Ziel (Spiele, beste Karten, freie Karte, Konto/Login) | User: „Das Feature Set sollte schon erreicht werden“ |
| 2026-11-11 | Design-Teile der alten App, die zur Zielgruppe passten, übernehmen (vor P3 gezielt sichten) | User: „die alte app hatte in Teilen ein angemessener Design für die Zielgruppe“ |
| 2026-11-11 | „Beste Karten“ ohne Nutzungszahlen vom Live-System bestimmen | User: „2. Nein“ |
| 2026-11-11 | Adventskalender: Türchen gestaltet der Nutzer selbst | User: „So daß Nutzer sich die Türchen selbst gestalten können“ |
| 2026-11-11 | Thumbnails im Format 16:9 | User: „16:9 Format“ |
| 2026-11-11 | Spiele bleiben im Umfang: Flipper, Flappy-artiger Flug, Skat, Doppelkopf u. a. | User: „Flipper, flappy bird und Co, wie skat, Doppelkopf … auch gut“ |
| 2026-11-11 | Freie Karten sollen auch völlig neue Spiele erzeugen können (nicht nur Genres G1/G2) | User: „freie Karten auch völlig neue Spiele erzeugen können“ |

- 2026-11-12 Annahmen für Gate A (User hat nicht geantwortet, Auftrag „Do! Push!“): Community-Karten nicht als Tageskarte; Zug per Link, Raum auf diesem Handy, Echtzeit gegen Bot; 4 Absichten plus „Eigene Karte“; Thumbnails 16:9, zuerst Screenshot, dann KI-Bild. Details: 06-plan/welle-1.md
- 2026-11-12 Strang P: Adventstür im Format 16:9 mit denselben Bauteilen wie Altstil „advent“; eigenes Foto oder KI-Bild füllt das Textfeld unter einem Schleier (statt Überlagerung wie alt). Nummer aus dem UTC-Tag, beim Absenden eingefroren (card.stamp). Beat-Karte der Untergrenze ist beat-pausenhof (strassenrap-beat nur in offenem PR #227). Geheimer Kanal versiegelt synchron in card.prepare (Antworten nie im Log). Details: 07-protokoll/2026-11-12-strang-p.md
- 2026-11-12 Strang B (Spiel-Baukasten): Neue Spiele der freien Karte entstehen als deklarative Beschreibung „mdi-bau/1“ (JSON, keine Textsprache), die derselbe Interpreter in App und Server abspielt; nur Spiele, die Bot-Playtests bestehen, gehen an Menschen, sonst ehrliche Absage mit festem Gegenvorschlag. Genre G3 nur auf ausdrückliche Wahl; Spielwünsche ohne Genre bleiben „noch nicht“, tragen aber den G3-Tipp. Echtzeit wird in zwei Aufrufen erzeugt (Szene, dann Regeln), weil die API das ganze Schema als zu große Grammatik ablehnt. Zwei Karten (`baukasten` Echtzeit, `baukasten-zug` Zug), weil ein Manifest genau einen Modus hat. Solo-Spiele zu zweit (Geist) laufen auf getrennten Bahnen. Schwellen siehe `08-forschung/spiel-baukasten.md` (Setzungen, an Beispielen und Dev-Teil kalibriert).
