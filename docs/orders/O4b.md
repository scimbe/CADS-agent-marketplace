# O4b: Composer, Teil 2 — Architekturplan, Projekterzeugung, Token-Deckel, CLI

Setzt O4a voraus (crates/composer mit `catalog` und `intent`).

## Auftrag
1. `plan`: aus Intent und `capacity` des Blueprints eine Architektur mit Zahlen und Herleitung.
   - collab-crdt: `leaves = ceil(editors / editors_per_leaf)`; mehr als `leaves_per_root` → Zwischenebene
     (`mids = ceil(leaves / leaves_per_root)`), Baumtiefe angeben. Komponenten mit Anzahl, A2A-Kanten (leaf↔root bzw. mid).
   - spatial-audio (sobald dessen blueprint.json aus O3 da ist): Shards aus `capacity` und `scale`-Formel des Blueprints,
     Nachbar-Kanten zwischen Shards; Medienpfad ausdrücklich als Datagramm-Pfad (UDP/QUIC) markiert, nicht über den TCP-Forward.
   - Jede Zahl im Plan trägt ihre Herleitung (`"leaves": {"value": 100, "from": "ceil(10000 / 100)"}`).
2. `emit` in ein Zielverzeichnis:
   - `architecture.json` (Plan), `composition.unsigned.json` (Form des CompositionManifest aus manifest-core: Slots
     und Kanten per Index; **ausdrücklich unsigniert** — signieren setzt veröffentlichte ServiceManifests im Registry voraus),
   - `deploy/<komponente>/compose.yaml` pro Dienst, die den Guardrail-Scan von installer-engine bestehen
     (`installer_engine::guardrails::scan_compose`): nur Loopback-Ports, nichts privilegiert, keine Host-Binds außerhalb,
   - `deploy/<komponente>/ct-agent.env` mit der Kanal-Weiterleitung von ct-agent (`CT_CHANNEL_FORWARD=<lokal>=<ziel>`
     auf der initiierenden, `CT_CHANNEL_FORWARD_ALLOW=<ziel>` auf der annehmenden Seite, siehe ct-agent docs/channel.md
     „TCP forward over a paired channel“) und dem Hinweis, dass ct-agent diese Weiterleitung noch nicht für Produktion freigibt,
   - `gate.sh` mit den Abnahmebefehlen des Blueprints, Parameter eingesetzt,
   - `MIGRATION.md` aus `migration`/`portability` des Blueprints: wie Nutzer ihre Daten und Betreiber die Dienste
     mitnehmen, was ohne bunsenbrenner gilt,
   - `report.json`: Intent, Konfidenz, Rückfragen, verbrauchte Tokens (deterministisch: 0), Dauer.
3. Token-Deckel: Schnittstelle `IntentOracle` (ein Aufruf, JSON-Antwort gegen den Katalog geprüft, `max_tokens` hart,
   verbrauchte Tokens aus der Antwort, sonst ehrlich als geschätzt markiert); eine Implementierung gegen eine
   OpenAI-kompatible Schnittstelle (wie `harness-core::llm_client`), **standardmäßig aus**. Tests mit einer Attrappe:
   Deckel greift, ungültige Antwort wird abgewiesen, deterministischer Weg ruft das Orakel nie.
4. CLI `marketplace-compose --prompt TEXT --out DIR [--llm off|auto] [--max-tokens N] [--json]`;
   Exit 0 erzeugt, 3 Rückfrage nötig (dann nichts geschrieben), 2 Bedienfehler.

## Erlaubte Dateien
crates/composer/**, Cargo.lock

## Akzeptanz
- `cargo test --offline -p composer` grün; ein Test erzeugt für den Kollaborations-Prompt des Betreibers ein Projekt,
  scannt jede compose.yaml mit `scan_compose` (keine Verstöße) und prüft `report.json.tokens_used == 0`.
- Ein Test erzeugt für „10 000 Editoren“ einen Plan mit 100 Blättern und für „1 Mio. Editoren“ einen mit Zwischenebene.
