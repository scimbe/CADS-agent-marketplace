# Werkzeuge (Status: app #221 offen; Relay-Grant in Arbeit)

- Notizzettel: bis 12 Zettel, 6 Farben, Sticker, lokal (`daily.notes`); teilen nur im Fragment ≤ MAX_FRAGMENT mit
  Füllanzeige; Filter beim Teilen UND Öffnen; Empfänger liest zuerst, „Behalten“ übernimmt. Live zu zweit: ganzer Zettel
  mit Zähler, spätere Änderung gewinnt, Gleichstand → Einladender; kein CRDT (Zeichenverlust bei Gleichzeitigkeit
  dokumentiert).
- Datei rüber: Verbinden zeigt QR + Link (#tl=<token>&w=datei), danach senden beide; direkt Ende-zu-Ende verschlüsselt.
  Relay nur mit Guthaben, sonst nur direkt mit Weg zum Aufladen (Commit fe0c234).
- Entscheidungen 2026-11-11: Relay nur für zahlende Konten (Guthaben > 0); Gratis-Nutzer darf über das Relay eines
  zahlenden Partners empfangen; Durchsetzung serverseitig (POST /api/duell/relay-grant, Cookie oder App-Bearer,
  lib/duell-relay.mjs + lib/oidc-bearer.mjs; Grant-Secret gemeinsam mit der webconference-Bridge).
- Werkzeuge sind nie Tageskarte; eigene Ebene im Editorrahmen; Escape schließt.
