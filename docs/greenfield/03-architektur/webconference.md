# Nahtlose Integration der Webkonferenz

User (Wortlaut): „sehr wichtig ist auch die natlose integration der webconference moeglichkeiten. die jetzige app hat es
in teilen drin, aber da geht noch eine bessere integration“

## Heute (Altcode)
- Nur der Datenkanal wird genutzt: ct-agent WASM + WebRTC für Live-Spiele, Tisch, Datei rüber, Notiz zu zweit
  (02-spec/05-spielen.md, 06-werkzeuge.md). Audio/Video der Webkonferenz sind nicht eingebunden.
- Zusammen bauen nur in den Apps.

## Ziel (zu bewerten, mit Forschung belegen)
- **Ein Raum, viele Tätigkeiten:** Wer verbunden ist, bleibt verbunden – Spiel wechseln, Karte zusammen bauen, Datei
  schicken, reden/sehen, ohne neue Einladung. Raum = Live-Region der Statechart, unabhängig vom aktiven Bildschirm.
- **Fähigkeiten des Raums** über den Capability-Broker: Daten (immer), Sprache, Video, Bildschirm/Bühne teilen, Reaktionen;
  Karten melden im Manifest, was sie nutzen (`duel-live`, `voice`, `video`, `collab`).
- **Einheitliche Optik:** Teilnehmer-Kacheln, Mikro/Kamera, Verbindungsqualität und Prüfbilder als feste Komponenten
  des Design-Systems; gleich auf Web, Business, iOS, Android.
- **Datenschutz:** Medien Ende-zu-Ende (DTLS-SRTP), Server sieht keine Inhalte; Medien nur nach ausdrücklichem Tipp;
  Hinweis auf sichtbare IP bleibt; Relay-Regeln wie bei Dateien.
- **Business-Sicht:** dieselben Räume für Termin finden, Geld einsammeln, Protokoll.
- **Skalierung:** Signalisierung per Kanal-Affinität, TURN-Pool; ab mehr als 2–4 Personen SFU statt Mesh (FOSS z. B.
  mediasoup, LiveKit, Janus – Bewertung offen), passend zu 03-architektur/skalierung.md.

## Offen
- Funktionsumfang von scimbe/CADS-webconference-demo (Audio/Video/SFU/Bridge-API) wird erhoben.
