# Link- und Fragmentformate

Entscheidung 2026-11-11: alte geteilte Links müssen NICHT funktionieren. Der Neuentwurf definiert EIN versioniertes
Format; die alten stehen hier als Referenz für Grenzen und Sicherheitsregeln.

## Alt (Referenz)
| Fragment | Bedeutung | Quelle |
|---|---|---|
| #i=<id> | Einladung zu Katalogkarte | daily.js:205-208, 235-239 |
| #c=<b64url JSON {v:1,i}> / {v:1,d:doc} | Karte oder Werk | daily.js:211-221, 491-503 |
| #c=<b64url state>[\0 spur-bytes] | Flug-Herausforderung mit Geist | core.js:263-302, spur.js |
| #s=<8 Zeichen> | Kurzlink in App-Shell | daily.js:209, shortlink.js |
| #live=<22>&g=<spiel> | Live-Einladung | app.js:1068, live-ui.js:42 |
| #tisch=<spiel>.<tok>[.tok]{0,2}&r=<regeln> | Kartentisch | app.js:1070, table-ui.js:166 |
| #todo=<b64url> | Protokoll → Aufgabenliste | app.js:1103-1114, protokoll.js:278 |
| #p=…&k=… | gestrichene Anrufkarte → „weg“ | app.js:1066 |
| #notiz=…, #tl=<tok>&w=datei | Werkzeuge | PR #221 |
| #aufladen | Guthaben-Ansicht | PR #231 |
| (Code-Spiel) id.hash.signatur | Code-Modus | PR #229 |

## Invarianten, die bleiben (Sicherheit/Größe)
- Harte Obergrenze für die Nutzlast vor dem Parsen: MAX_FRAGMENT 1200 (core.js:8, daily.js:214); UTF-8 fatal-Dekodierung
  (daily.js:231-234).
- Jede Nutzlast läuft vor jeder Verwendung durch die Schema-Prüfung; Unbekanntes wird verworfen, nie geraten.
- Beim Kürzen zur Größe fallen Teile in fester Reihenfolge weg (daily.js:489-503). Im Neuentwurf: kein stilles Kürzen –
  die UI zeigt, was wegfällt, oder teilt nicht (Anti-Pattern A4).
- Fragment wird nach dem Lesen aus der Adresse entfernt (app.js:42 clearLink, 1069, 1106).
- Kurzlinks nur nach Tippen auf Teilen, nur für c=/i= (shortlink.js:1, 7; build.test.js:171-182). p= (Schlüssel) nie.
- Nichts aus dem Fragment geht an einen Server, außer der Nutzer teilt aktiv (Kurzlink) oder meldet (Melden).

## Neu (Anforderung an 03-architektur)
- `#v2.<typ>.<b64url(cbor|json)>`: ein Präfix, ein Typ aus fester Liste (card, challenge, live, table, tool, code,
  route), Schema je Typ, Version im Präfix. Signierte Inhalte (freie Karte, Code-Spiel, Deck) tragen Server-Signatur
  (Ed25519), die der Client prüft (heute prüft nur der Server: daily.js:344-345).
- Testvektoren (Encode/Decode/Ablehnung) als gemeinsame Fixture für Client und Server (Vorbild:
  test/fixtures/frei-vectors.json).
