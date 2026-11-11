# ADR-0005: Daily Business als Build-Flavor von My Daily Idea

## Status

Abgelöst. Die Umsetzung (Flavor `business` im Build des alten Clients, Bürokarten, Firmenfarbe im
Link, Tests und Screenshots) lag vollständig im alten Client und ist mit ihm aus `main` entfernt
(S16). Der neue Client `apps/mdi` setzt keinen Flavor um. Der vollständige Text dieser ADR steht im
Tag `pre-legacy-removal`.

## Was als Entscheidung bleibt

- **Eine Codebasis, getrennte Auslieferung.** Eine Business-Variante wäre ein eigener Build mit
  eigenem Katalog, Titel und Pfad, kein Laufzeit-Schalter. Jugendschutz- und Zahlungsregeln liegen
  dann nicht in derselben Datei wie die Business-Variante.
- **Organisation im Link.** Firmenfarbe und ein Kürzel aus 1–3 Zeichen reisen neben der Karte im
  Link. Es gibt dafür keinen Server und keinen Upload.
- **Regeln für Erwachsene.** Höhere Beträge beim Geld-Einsammeln, echte Namen statt Spitznamen,
  Feedback ohne Namen. Der Freitextfilter und „das Geld läuft nie über uns“ gelten unverändert.
- **Firmennetze.** Ohne Netz lauffähig, keine Echtzeitkanäle, kurze Fristen und eine klare Meldung,
  wenn ein Dienst aus dem Netz nicht erreichbar ist.

## Offen (Entscheidung des Owners)

Ob und wann der neue Client eine Business-Variante bekommt. Dann sind auch Host und Pfad,
Kurzlinks pro App, die Webconference in Firmennetzen und der KI-Wunsch im Business-Ton neu zu
entscheiden.
