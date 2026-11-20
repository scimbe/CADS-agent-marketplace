# Varianten-Bewertung

Gemeinsam für alle: Karten-Vertrag, Sandbox, Broker, Schemata, ein Auth-Modell. Unterschied: UI-/Zustands-Technik.

| Kriterium | A Vanilla TS + eigene Statechart | B Preact + XState v5 | C Lit + XState v5 |
|---|---|---|---|
| Laufzeit-Bibliotheken (min / gzip) | ~2 KB / <1 KB (Schätzung) | preact 11.2.0 12 083/5 021 + xstate 5.33.4 46 824/14 547 = 58,9 KB / 19,6 KB | lit 3.3.3 15 455/6 024 + xstate = 62,3 KB / 20,6 KB |
| Anteil am Kern-Budget 700 KiB | ~0,3 % | 8,2 % | 8,7 % |
| CSP ohne unsafe-eval | ja | ja | ja |
| Statechart-Semantik | SCXML-Teilmenge, selbst zu testen | vollständig, Visualisierung | wie B |
| Modellbasiertes Testen | eigener Pfad-Enumerator (~150 Zeilen) | @xstate/graph | @xstate/graph |
| Migrationsrisiko | mittel | niedrig-mittel | mittel (Shadow DOM vs. a11y-/E2E-Annahmen) |
| Testbarkeit | hoch | hoch | mittel |
| Lock-in | keiner | gering (MIT) | gering (BSD-3) |

Spike je Variante (1 Tag): (1) App-Maschine mit 25 Zuständen und 2 parallelen Regionen, (2) alle Pfade bis Tiefe 6
automatisch durchlaufen, (3) Bundle-Anteil gemessen, (4) d1-Szenario grün.

Empfehlung des Agenten: A (Budget-Reserve des Altkerns lag bei 30 KB; benötigte Semantik klein und durch SCXML
spezifiziert). Gate am Ende von S1: wächst die Maschine über ~60 Zustände oder braucht History/verzögerte Ereignisse,
ist B billiger.
Bundle-Größen: bundlephobia, Abruf 2026-11-11.
