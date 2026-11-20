# Editor, Blasen, Overlay, Pinsel

- Bildschirme: home, editor, done, shelf, game (index.template.html:17-85) plus Ebenen (.liveov, Arcade, Werkzeug).
- Reiter/Panels: A.TABS/A.PANEL im Kern leer, gefüllt von modes.js, turn-ui.js (Kern), direkt-ui.js, regler-ui.js,
  blasen.js (Teile) – Ladereihenfolge entscheidet, wer was überschreibt (blasen.js:1-6; build.test.js:151-160).
- Teile einer Karte: teile(doc) → [{id,x,y,w,h,panel,label,ax,ay}], teilAt(x,y) kleinste Fläche (teile.js:1-12).
  Flug: figur, saeule, himmel, titel; Lauf: figur, hindernis, …
- Blasen-Ebene (blasen-ebene.js:1-9): je Teil eine runde Blase mit Faden; rote KI-Wunsch-Blase ohne Faden; gelbe für
  direkte Einstellungen; verschiebbar (Position nur lokal), ausblendbar per Pinsel im Kopf (localStorage `daily.blasen`).
  Mit Blasen: keine Reiterleiste; bei < 2 Teilen Reiterleiste.
- Overlay-Dialog (blasen-dialog.js:1-7): FLIP-Animation aus der Blase (~250 ms), Karte bleibt sichtbar und ändert sich
  live, Inhalt ist das eine #panel (nichts doppelt), ✕/Scrim/Escape/Zurück schrumpfen zurück, role=dialog aria-modal,
  Fokusfalle und Rückgabe, prefers-reduced-motion → nur Blende. „Alle Einstellungen“ = erster Tab-Stopp.
- Blasen auf der Startseite (blasen-start.js:1-5): Tipp öffnet Editor auf dem Blatt des Teils; freie Karte hat keine.
- Escape-Kaskade (app.js:1046-1060): erst Feld verlassen, dann Sheet, Live-Ebene (zweimal innerhalb 3 s), dann Bildschirm.
  Zurück-Geste: Arcade → Blasen → Wand → Spiel/Stil → home (app.js:1061).
- Trail: changedAreas(a,b) Bereiche text|farbe|stil|sticker|beat|stimme|idee|figur|regeln|welt (daily.js:464-488).
- Editor E1 (Teil direkt): ein Undo, Sticker ohne Ziehen, Ebenenliste, einfache Sprache (editmodel.js, direkt-ui.js).
- Tests: blasen*.e2e.js (12), direkt.e2e.js (10), teile.e2e/teile.test, editmodel.test, bedienung.e2e, a11y.e2e,
  d1-axe.e2e, canvas-fit.e2e, zoom-phone.e2e, layout-lang.e2e, home-layout.e2e, platz.e2e.
- Invarianten: eine Quelle für Panel-Inhalt; Fokus/ARIA wie oben; Animation abschaltbar; Positionen nur lokal.
