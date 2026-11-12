# Plan

> Ersetzt als Vorgehen durch [vorgehen.md](vorgehen.md); diese Datei bleibt als Inventar der Slices.

1. Planen: Fragment-Spezifikation aus dem Altcode (`02-spec/`) – läuft.
2. Evaluieren: 2–3 Varianten mit messbaren Kriterien (Bundle, Risiko, Testbarkeit) → ADR.
3. Bauen: neuer Client unter eigenem Pfad neben dem alten, dünne vertikale Schnitte.
4. Debuggen/Testen: alte e2e-Tests als Paritäts-Orakel.
5. Produktiv: Umschaltung bei Parität, mit Rollback-Tag und Prüfskript.
6. Altcode entfernen: `apps/duell-web` und alle nur von ihm genutzten Teile (Tests, Skripte, iOS/Android-Kopierschritt) aus `main` löschen; CI-Prüfung, dass kein neuer Code auf alte Pfade verweist.

Laufende Server-Arbeit, die unverändert übernommen wird: serverseitiger Relay-Grant (Bridge + Wrapper + Apps), Bildpreis (3 gratis/Monat, dann 1 Guthaben).

Slice-Liste folgt aus der Spezifikation.
