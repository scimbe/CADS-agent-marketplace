# Push, KI-Bilder, Wand, Kurzlinks, Statistik, Melden

- Push (push.js:1-12; lib/duell-push.mjs): Weckreiz ohne Inhalt (nur Ereignisart). Kanäle: host (DuellHost.push() JSON
  v1 kind none|fcm|apns|unifiedpush), webpush (SW /duell/push-sw.js, Scope /duell), none mit Grund app|install|browser.
  Eigener Dialog zuerst; requestPermission genau einmal, nur aus enable(), nur vom Ja-Knopf (build.test.js:242-248).
  Server: subscribe {sub, mark?, del?} → {mark, del, days}; ein Mark je Endpoint; VAPID RFC 8292, aes128gcm RFC 8291;
  Mark verfällt nach 30 Tagen ohne Erneuerung (app.js:1019-1020). Tests: push.test, test/fixtures/bridge-push-v1.json.
- KI-Bilder (kibild.js:1-10; lib/duell-bild.mjs:7-18): can(kind card|logo|avatar), open() mit Satz, Stil, ehrlichen
  Schritten (Prüfung, Platz, Machen, Prüfen), Nehmen/Nochmal (kostet, gesagt)/Melden. Nur POST same-origin; nur Satz,
  Zweck, Stil, Sprache – nie Foto oder Geräte-id (build.test.js:206-211). Ins doc nur Referenz "<22>.(jpg|png)".
  Tests: kibild.e2e (6), kibild.test.
- Meine Wand (daily.js:506-524; app.js:895-962): ≤ MAX_WALL Einträge {id, ts, th Daten-URL ≤ MAX_THUMB, f c=-Fragment,
  k, h Inhaltshash}; gleicher Inhalt ersetzt den alten; Löschen mit Rückgängig (Commit 294f1c9). Test: wand.e2e.
- Kurzlinks (shortlink.js; lib/shortlink.mjs): POST /api/s → {id,url,token,exp}; DELETE/PUT img mit Bearer-Token des
  Erstellers; /s/<id> OG-Seite; genau zwei Aufrufer (Fertig, Status/Story; build.test.js:171-182). PR wrapper #109:
  24 h bis zum ersten Öffnen, dann 90 Tage (offen).
- Statistik (stat.js:1-6): nur id, Ereignis share|open|vote, bei share die Bereiche; share/open ohne Cookie, Stimme mit
  Login; Schalter statOff; Business sendet nichts. Tests: stat.e2e (11), stat.test.
- Melden (melden.js; lib/duell-report.mjs): Meldung ohne Cookie; Gründe harm|sex|hate|private|wrong|other (ai.js:7).
