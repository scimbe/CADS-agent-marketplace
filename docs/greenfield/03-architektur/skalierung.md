# Skalierung hinter einer Domain

## Eine Domain, Pfade statt Hosts
| Pfad | Dienst |
|---|---|
| `/` | Client (statisch, Cache/CDN, Dateinamen mit Inhalts-Hash) |
| `/api/mdi/*` | App-Schicht (zustandslos) |
| `/s/<id>` | Kurzlink-Seite (cachebar) |
| `/img/<id>` | KI-Bilder (Objektspeicher hinter Cache) |
| `/live/*` | Signalisierung (Kanal-Affinität), WASM unter `/live/pkg/` |
| `turn:`/`turns:<domain>:443` | TURN-Pool |
Client nutzt nur relative Pfade; CSP 'self'; Apps setzen nur die Basis-URL.

## Schichten
1. **L7-Eingang** (FOSS: HAProxy oder Envoy; Traefik in Kubernetes): TLS, Health-Checks, Drain, globale Ratenbegrenzung,
   gewichtete Backends je Ort (on-prem zuerst, Burst zuschaltbar), Konsistenz-Hash-Routing nur für /live/* nach Kanal-id.
2. **App-Schicht zustandslos** (12-Factor): Bearer-JWT lokal geprüft, keine Sitzung, keine Dateien, Konfiguration aus
   Umgebung, identisches OCI-Image an allen Orten.
3. **Zustand:** PostgreSQL für Konto, Guthaben (Buchungszeilen, Idempotenz-Schlüssel), Deck, Moderation, Kurzlinks,
   Push; Sharding nach Konto-Schlüssel zuerst logisch, physisch erst bei Bedarf (z. B. Citus). Objektspeicher (S3-API,
   FOSS) für Profile und Bilder.
4. **Teure Dienste über Queue:** Haiku, Bilder, Code-Playtests als Jobs; Pull-Worker je Ort (ICC-GPU, on-prem, Cloud)
   → Burst = mehr Worker. Rückdruck: begrenzte Länge, Priorität mit Ageing, ehrlich 202 {ticket, position, etaS} / 429
   busy; Kritikalitätsklassen (kritisch: accept/discard/Guthaben; abwerfbar: Statistik, Vorschau).
5. **Live:** Signalisierung mit Rendezvous-Hash Kanal-id → Instanz; Daten P2P, sonst TURN-Pool; Grants signiert, kurzlebig.
6. **Client-Bundle** über Cache; Budgets bleiben (begrenzen auch Egress im Burst).

## Hybride Kapazität
| Ort | Rolle |
|---|---|
| ssh-united, labor-setup.de (on-prem) | Basislast: Eingang, App, DB-Primär, Objektspeicher; Build/Test-Runner |
| ICC Kubernetes | App-Repliken (HPA), GPU-Worker (z-image), Playtest-Worker |
| Cloud-Burst | nur zustandslose Repliken und Worker; DB bleibt on-prem |
Verbindung: WireGuard (FOSS) zwischen Eingang und Backends.

## Anforderungen an den Client
- Idempotenz-Schlüssel auf allen schreibenden Aufrufen.
- Ehrliche Zustände busy/queued/offline in der Statechart; clientseitiges adaptives Drosseln (SRE-Muster).
- Keine Instanz-Affinität außer /live/*.

## Server-Variante
| Kriterium | S1 Wrapper umbauen (Dateien → DB) | S2 eigener mdi-API-Dienst, Wrapper nur Alt |
|---|---|---|
| Repliken > 1 | nach Umbau aller 12 Speicher | von Anfang an |
| Vermischungsregel | heikel | klar erfüllt |
Empfehlung des Agenten: S2 für neue Routen /api/mdi/*; Datenmigration je Speicher einmalig beim Umschalten.

## Abweichung (Befund D0, 2026-11-11): Live-Isolation braucht eine eigene Herkunft
Der Live-Rahmen (ct-agent, WebRTC) läuft getrennt von der App-Seite, die Hände und Salze hält. Teilen App und Webkonferenz
eine Herkunft, verliert der Rahmen diese Isolation. Deshalb: App unter `<domain>`, Live-Rahmen + `/api/play` unter einer
eigenen Herkunft (z. B. `live.<domain>`). Die einbettenden Herkünfte des Rahmens (`frame-ancestors`) und
`PLAY_ALLOWED_ORIGINS` der Bridge müssen synchron gepflegt werden (eine Konfigurationsquelle).
