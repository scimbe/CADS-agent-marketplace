# WebRTC-Topologie: Mesh oder SFU, und welche FOSS-SFU

Frage aus `KONZEPT.md` §4: „1:1 und kleine Gruppen per Mesh; ab etwa 4 Personen SFU (FOSS)“ – Schwelle und Auswahl.
Stand: 2026-11-11.

## Quellen

| # | Quelle | Kern für uns |
|---|---|---|
| W1 | M. Westerlund, S. Wenger, RFC 7667 „RTP Topologies“, IETF, Nov. 2015. https://www.rfc-editor.org/rfc/rfc7667 | Definiert Punkt-zu-Mehrpunkt per Mesh (§3.4), Selective Forwarding Middlebox (SFU, §3.7), Mixer/MCU. |
| W2 | E. Omara, J. Uberti, S. Garcia Murillo, R. Barnes, Y. Fablet, RFC 9605 „Secure Frame (SFrame)“, IETF, Aug. 2024. https://www.rfc-editor.org/rfc/rfc9605 | Ende-zu-Ende-Verschlüsselung von Medienrahmen über SFUs; SFU sieht nur Metadaten; Schlüsselverteilung nicht Teil von SFrame. |
| W3 | W3C, „WebRTC Encoded Transform“, Working Draft 25. Juni 2026. https://www.w3.org/TR/webrtc-encoded-transform/ | Browser-API, um Rahmen vor dem Senden zu transformieren (Grundlage für SFrame im Browser). Browser-Unterstützung **nicht nachgeprüft** (v. a. Safari/WKWebView). |
| W4 | Repos (GitHub-API, 2026-11-11): versatica/mediasoup (ISC, C++/Node/Rust, Release rust-0.33.2 vom 2026-11-04); livekit/livekit (Apache-2.0, Go, v1.13.11 vom 2026-10-25); meetecho/janus-gateway (GPL-3.0, C); jitsi/jitsi-videobridge (Apache-2.0, Kotlin/Java). | Lizenz und Aktivität aller vier geprüft; alle 2026-11 aktiv. |
| W5 | mediasoup-Doku. https://mediasoup.org/documentation/v3/ | „C++ SFU and server side Node.js module“, Rust-Crate, mediasoup-client für Browser; **keine eigene Signalisierung**. |
| W6 | livekit/client-sdk-js, Quellbaum `src/e2ee/` (E2eeManager, KeyProvider). https://github.com/livekit/client-sdk-js | LiveKit bringt E2EE im JS-SDK mit. |
| W7 | Mesh-Messungen: „WebNSM“-Studie (core.ac.uk/download/286027051.pdf) und WebRTC.ventures, „Energy Efficiency in WebRTC Video Conferencing Topologies“ (2022). *(nicht im Volltext gelesen; Herstellerblog)* | Mesh scheitert zuerst an Upload-Bandbreite und CPU/Energie mobiler Geräte. |

Keine Primärquelle nennt eine allgemeingültige Teilnehmerzahl; Zahlen in Blogs widersprechen sich (W7). Die Schwelle
unten ist daher **gerechnet**, nicht zitiert.

## Rechnung

Im Mesh sendet jeder Teilnehmer seinen Strom an n−1 andere und kodiert ihn je Verbindung (W1 §3.4):
Upload = (n−1)·b, Encoder-Last ≈ (n−1) Instanzen (ohne Simulcast-Teilung). Mit SFU: Upload = b (bzw. Simulcast-Ebenen),
Download = (n−1)·b' mit vom SFU gewählter Ebene b'.

| Medium (Annahme b je Strom) | n = 3 | n = 4 | n = 6 | n = 8 |
|---|---|---|---|---|
| Spieldaten (≤ 10 kbit/s) | 20 kbit/s | 30 | 50 | 70 |
| Sprache Opus (≈ 32 kbit/s) | 64 kbit/s | 96 | 160 | 224 |
| Video mobil (≈ 600 kbit/s) | 1,2 Mbit/s | 1,8 | 3,0 | 4,2 |

Mobiler Upload und Akku begrenzen Video ab etwa 4 Personen; Sprache und Daten bleiben bis 8 unkritisch.
*(Bitraten sind Annahmen; im Durchstich mit `getStats()` messen.)*

## Empfehlung

- **Schwelle nach Medium statt Kopfzahl:** Daten immer Mesh (bis zur Raumobergrenze); Sprache Mesh bis 6; **Video Mesh
  bis 3, ab dem 4. Video-Teilnehmer SFU**. Zusätzlich auf SFU wechseln, wenn die gemessene Upload-Rate eines Teilnehmers
  nicht reicht.
- **SFU-Auswahl:**

| SFU | Lizenz | Passung | Urteil |
|---|---|---|---|
| mediasoup | ISC | Bibliothek, Signalisierung frei wählbar → passt zu Signalisierung über den vorhandenen ct-agent-Kanal; Node/Rust | **erste Wahl** |
| LiveKit | Apache-2.0 | Komplettsystem mit eigenem Raum-/Token-Modell (JWT) und nativen SDKs, E2EE im JS-SDK; zweites Identitätsmodell neben ct-agent | Rückfall, falls eigene Signalisierung zu teuer |
| Jitsi Videobridge | Apache-2.0 | stark im Verbund mit Jitsi Meet; als Einzelteil schwerer zu integrieren (JVM) | nicht empfohlen |
| Janus | GPL-3.0 | flexibel, Plugins in C; Copyleft bei eigenen Plugins beachten | nicht empfohlen |

- **Ende-zu-Ende bleibt nur mit SFrame** (W2) über Encoded Transform (W3). Ohne Browser-/WebView-Unterstützung auf iOS
  ist Video über SFU **nicht** Ende-zu-Ende, nur hop-by-hop (DTLS-SRTP bis zur SFU). Schlüssel über den Noise-Kanal
  der Teilnehmer verteilen, nicht über den SFU-Betreiber.

## Ableitung für das Konzept

1. **Änderung:** „ab etwa 4 Personen SFU“ wird zu „ab dem 4. *Video*-Teilnehmer SFU; Daten und Sprache bleiben länger
   Mesh“. Das spart SFU-Kosten für den häufigsten Fall (Spielen mit Sprache).
2. SFU: mediasoup (ISC), Signalisierung über denselben Kanal wie call-core; LiveKit als dokumentierter Rückfall.
3. **Präzisierung „Ende-zu-Ende“:** Das Versprechen gilt für Mesh uneingeschränkt; für SFU nur mit SFrame. Bis die
   iOS-Unterstützung von Encoded Transform geprüft ist, zeigt die UI im SFU-Fall ehrlich „über Server vermittelt“.
4. SFU-Zugang wie TURN nur per kurzlebigem Grant; SFU-Standorte im Rendezvous-Hash der Live-Signalisierung
   (`03-architektur/skalierung.md`) mitführen.
5. Offener Spike: Encoded Transform in WKWebView (iOS) und Android-WebView prüfen.
