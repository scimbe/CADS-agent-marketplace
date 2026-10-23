# O4c: Composer erkennt die Prompts des Betreibers — Vokabular, Zahlwörter, Einheiten

Folgeauftrag zum Review von O4a. Repo: cads-agent-marketplace, Branch feat/phase2-blueprints.

## Befund (Review-Prompts gegen O4a, `recognize`)
| Prompt | Ergebnis O4a | Soll |
|---|---|---|
| Audio-Teil der Aufgabe des Betreibers (unten A) | keine Wahl, spatial-audio 5/6 | spatial-audio, `listeners = 1 000 000`, `latency_ms = 50` |
| Gesamte Aufgabe (unten B) | nur collab-crdt | collab-crdt (`editors = 10000`) **und** spatial-audio (`listeners = 1 000 000`) |
| „Virtual stadium watch party: 1.5 million fans hear friends next to them with spatial audio on AirPods, phones only“ | spatial-audio ohne Parameter | `listeners = 1 500 000`, mobil |
| „Inventur-App für 300 Lagerarbeiter, Android, offline“ | keine Wahl, collab 4/6 | collab-crdt, `editors = 300`, `mobile_share ≥ 0.9` |
| „Mach mir eine Webseite für meinen Bäcker“ | Rückfrage | Rückfrage (bleibt) |

A: „Audio-Spatialization & Live-Streaming für Großevents (z. B. virtuelle Konzerte / Metaverse): Millionen simultane
Audioströme müssen basierend auf der 3D-Distanz und Raumakustik der Avatare zueinander gemischt und mit Sub-50ms-Latenz
kodiert an die Endgeräte zurückgespielt werden“

B: „Der Market Place soll eine Echtzeit-Kollaborations-Engine (Figma, Google Docs bei 10.000 simultanen Editoren, CRDTs)
erstellen und ein Audio-Spatialization & Live-Streaming für Großevents mit Millionen Audioströmen unter 50 ms bauen.“

## Auftrag
1. Vokabular der Blueprints (`blueprints/*/blueprint.json`, `intent.keywords`, deutsch und englisch), ausgehend von den
   Anwendungsfeldern des Betreibers: collab — Baustelle, Bauleiter, Gutachter, Mängel, Pläne, Checklisten, Funkloch, Keller,
   Notizen, Tablet/Stift, Vektor, unendliche Canvas, Inventur, Lager, Logistik, Kasse/PoS, Festival, Bestände, Over-Selling,
   Double-Spending; audio — Spatial Audio, Audioströme, Raumakustik, 3D-Distanz, Avatar, Großevent, Konzert, Metaverse,
   Stadion, Fan-Block, Watch-Party, Second Screen, Social Audio, Clubhouse/Discord-artig, Voice-Chat, Squad, Esports,
   AirPods/Head-Tracking, Live-Streaming. Gewichte so, dass ein Feld allein nicht reicht, aber zwei passende Begriffe es tun.
2. Zahlwörter ohne Ziffer: „Millionen“ / „millions“ / „tausende“ / „thousands“ / „hunderte“ vor einem Einheitswort ergeben
   1 000 000 / 1 000 / 100 (Größenordnung, in `report` als geschätzt markierbar: `Intent` bekommt dafür ein Feld).
3. Einheiten: audio `listeners` mit fans, zuschauer, hörer, listeners, besucher, spectators, avatare, teilnehmer, nutzer;
   collab `editors` zusätzlich mit lagerarbeiter, mitarbeiter, bauleiter, worker; `latency_ms` für audio.
4. Mehrfachwahl: Prompt B muss beide Blueprints mit ihren eigenen Parametern liefern (eine Zahl gehört zum Einheitswort,
   nicht zum ersten Blueprint).

## Erlaubte Dateien
crates/composer/**, blueprints/collab-crdt/blueprint.json, blueprints/spatial-audio/blueprint.json

## Akzeptanz
- `crates/composer/tests/operator.rs` mit genau den fünf Fällen der Tabelle (wörtlich), alle grün;
  `cargo test --offline -p composer` grün (die O4a-Tests unverändert grün).
- Kein Fall durch Senken der Schwellen gelöst, ohne dass die Bäcker-Rückfrage und `pos` ≠ `position` weiter halten.
