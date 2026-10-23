# O3b: spatial-audio — Stromwechsel senken, Kosten pro Hörer-Stunde messen

Repo: cads-agent-marketplace, Branch feat/phase2-blueprints, Crate blueprints/spatial-audio. Folgeauftrag zum Review von O3.

## Befund (aus reports/budget-7000.json und budget-50000.json)
1. `direct_changes_per_listener_per_s` ≈ 13: In mehr als einem Viertel der Frames ändert sich die Menge der direkt
   weitergeleiteten Stimmen eines Hörers. Jede Änderung startet oder stoppt einen Strom auf dem Gerät. Die Hysterese
   (3 dB Bonus) hilft nicht, weil Sprecher mit dem Ende ihrer Sprechphase (Markov, ~1 s) aus der Kandidatenmenge fallen.
2. Die Kosten sind Egress, nicht CPU: ~183–206 kbit/s pro Hörer (ohne Header), für 1 Mio. Hörer ~395 Gbit/s mit Headern.
   Es fehlt ein Kostenmodell und die Messung der Hebel.

## Auftrag
1. Plätze halten: Ein gewählter Sprecher behält seinen Platz für eine Haltezeit (Parameter, Vorschlag 500 ms) nach seiner
   letzten aktiven Frame, außer ein Herausforderer ist um mehr als die Hysterese hörbarer und der Platz ist der leiseste;
   ein frei gewordener Platz wird erst nach der Haltezeit neu besetzt. Die Messgröße `direct_changes_per_listener_per_s`
   bleibt so definiert wie heute (Mengenänderung pro Frame).
2. Stille Teppiche: ein Teppich (Zelle/Sektor) ohne aktive Stimme in diesem Frame wird nicht enkodiert und nicht gesendet
   (wie Opus-DTX), und das zählt in Bytes und Strömen.
3. Kostenmodell im `event_plan`: Kosten pro Hörer-Stunde aus Egress (USD/GB) und Kernen (USD/Kern-Stunde), beides als
   benannte Annahmen mit Parametern `--usd-per-gb` (Vorschlag 0,02) und `--usd-per-core-hour` (Vorschlag 0,04); Ausgabe
   getrennt nach Egress und CPU.
4. Hebel messen und als Bericht ablegen: Bitrate der Teppiche (16 vs. 8 kbit/s), Teppiche pro Hörer (4+2 vs. 2+1), mit
   Wirkung auf Egress, CPU und die Zahl der Ströme. Keinen Hebel als Standard setzen, ohne ihn in blueprint.json zu begründen.

## Erlaubte Dateien
blueprints/spatial-audio/**

## Akzeptanz
- `cargo test --offline --release -p bp-spatial-audio` grün; neuer Test `blueprints/spatial-audio/tests/slots.rs`: ein Sprecher
  mit Sprechpause unter der Haltezeit behält seinen Platz; ein deutlich lauterer Herausforderer verdrängt den leisesten;
  ein stiller Teppich erzeugt keinen Strom.
- `budget --listeners 7000 --frames 250`: `direct_changes_per_listener_per_s` ≤ 3, Abnahme weiter bestanden; Bericht als
  `reports/budget-7000-slots.json`; ein Bericht pro gemessenem Hebel unter `reports/levers/`.
- blueprint.json: `capacity` aktualisiert, Kosten pro Hörer-Stunde mit den Annahmen genannt.

## Review des ersten Versuchs (pull/9, Gate: ContractViolation)
- Inhaltlich erfüllt: `direct_changes_per_listener_per_s` 2,66 bei 7 000 Hörern, Abnahme bestanden, stille Teppiche
  entfallen (Egress 185 → 109 kbit/s), Kosten pro Hörer-Stunde mit Annahmen im Bericht.
- Das Gate scheitert an der Diff-Grenze des Vertrags (1 200 Zeilen): 3 477 Zeilen, fast alles formatierte JSON-Berichte
  (~380 Zeilen je Datei). Die Grenze bleibt.
- Neuer Versuch: auf dem fertigen Stand aufsetzen (`git fetch origin refs/pull/9/head && git switch -c <branch> FETCH_HEAD`
  statt Schritt 2 des Ablaufs) und **nur** die Berichte unter `blueprints/spatial-audio/reports/` als einzeiliges JSON
  ablegen (`python3 -c 'import json,sys; json.dump(json.load(open(sys.argv[1])), open(sys.argv[1],"w"), separators=(",",":"))' F`),
  dann committen und wie üblich pushen. Den Code nicht noch einmal ändern.
