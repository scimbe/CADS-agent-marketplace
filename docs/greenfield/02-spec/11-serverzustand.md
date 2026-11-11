# Serverzustand heute (wrapper origin/main 5d8e938) und nötige Änderung

Alle Dateien liegen im Volume neben DUELL_AI_STATE_FILE (docker-compose.yml:22, 40), werden in den Prozess geladen
(Map) und atomar per tmp+rename geschrieben, debounced; server.mjs:1098 flush beim Beenden. **Eine Instanz, ein Volume.**
Zwei Repliken würden sich Guthaben, Kontingente und Grenzwerte gegenseitig überschreiben.

| Zustand | Ort heute | Quelle | Schlüssel | Ziel |
|---|---|---|---|---|
| KI-Kontingent/Töpfe, Quittungen | state.json (Map) | duell-ai.mjs:825-833, 921 | Topf-Schlüssel | DB, Shard nach Konto/Geräte-HMAC |
| Guthaben | credit.json | duell-credit.mjs:25, 54-69 | Topf-Schlüssel des Kontos | DB mit Transaktion (Buchungszeilen), Shard Konto |
| Gutscheine | Env DUELL_VOUCHERS (Hash:Menge:Grenzen) | duell-voucher.mjs:7-14 | Code-Hash | Codes bleiben Konfiguration; Einlöse-Zähler → DB (heute RAM :48) |
| Deck freier Karten | deck.json | duell-deck.mjs:176-218 | Karten-id, Konto | DB; Lesen über Cache (signiert, versioniert) |
| Moderation/Strikes | mod.json | duell-mod.mjs:88-108 | Konto | DB, Shard Konto |
| Profil inkl. Wand | Datei je Profil in DUELL_PROFILE_DIR | duell-profile.mjs:75-117 | HMAC(Konto\|Gerätecode) | Objektspeicher (S3-API, FOSS) oder DB |
| Kurzlinks | JSON-Lines + Map | shortlink.mjs:20-27, 127-139 | 8-Zeichen-id | DB/KV; /s/<id> cachebar |
| Push-Abos | push.json | duell-push.mjs:30-31, 112-118 | Mark | DB; Versand über Worker-Queue |
| Statistik/Stimmen | stat.json, votes.json | duell-stat.mjs:141-155 | Karten-id/Tag | Append-only Ereignisse → Aggregation |
| Meldungen | JSON-Lines | duell-report.mjs:44-71 | Meldungs-id | DB |
| KI-Bilder | Dateien + index.json | duell-bild.mjs:45, 233 | Bild-id (22) | Objektspeicher (inhaltsadressiert) |
| Warteschlange Modell | RAM, concurrency 1, maxLen 30 | duell-queue.mjs:1-30 | Ticket | geteilte Queue (FOSS) mit Worker-Pool je Ort |
| Ratenbegrenzer, IP-Treffer, Config-Cache | RAM | duell.mjs:248, 291-293; voucher.mjs:48; shortlink.mjs:218-221 | gehashte IP / Schlüssel | L7-Eingang + geteilter Zähler-Speicher |
| Live-Kanäle, Einladungen, TURN | webconference-Bridge /api/play | scimbe/CADS-webconference-demo `bridge/server.js` (vom Agenten nicht gelesen) | Kanal-id | Kanal-Affinität per Rendezvous-Hash; TURN-Pool getrennt |
| Relay-Grant (in Arbeit) | HMAC-Secret Wrapper↔Bridge | – | Konto | zustandslos ✓ |
| Login | Gate-Cookie + RAM-Cache | auth.mjs:45-67 | Cookie-Hash | Bearer-JWT über JWKS lokal prüfbar ✓ |

Folgerung: nur Live-Signalisierung braucht Affinität; alles andere ist ein Speicherwechsel hinter Repository-Schnittstellen.
Heute mehrere Hosts fest eingetragen: core.js:5-7, live.js:7, index.template.html:7, DuellAi.swift:8, shortlink.mjs:136.
