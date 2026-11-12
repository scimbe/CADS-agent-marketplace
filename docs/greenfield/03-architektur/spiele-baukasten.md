# Grundstock-Karten und Spiel-Engines neu: Baukasten für freie Spiele

User (Wortlaut): „und dauch die karten die als Grundstock dienen, wie auch die engines fuer die Spiele (und es soll
wirklich noch leichter sein neue spiele zu entwickeln, hier braucht es wirklich ein konzept das moeglichst freie designs
und spielmechaniken erlaubt aber mit einem guten harness und haiku moeglich ist“

## Ziel
- Grundstock-Karten und alle Engines (Flug, Lauf, Arcade, Zug, Tisch, Dart, Malrat …) werden im neuen Baum neu gebaut,
  alle über den Karten-Vertrag. Altcode nur als Spezifikation der Regeln/Physik.
- Neues Spiel = ein Modul nach Vertrag; möglichst freie Mechanik und Optik, trotzdem sicher, deterministisch, teilbar,
  live spielbar, und von Haiku im Harness erzeugbar.

## Konzept (zu bewerten, mit Forschung belegen)
1. **Kleiner, fester Kern (SDK):** init/step/view/status/moves, Seed-RNG, feste Tick-Rate, Eingaben als Ereignisse,
   Anzeigeliste aus Primitiven + Token-Namen. Kein DOM, kein Netz, keine Uhr im Spielcode.
2. **Bausteine statt Engines:** wiederverwendbare, getestete Module (z. B. Gitter, Kollision AABB/Kreis, Schwerkraft/
   Sprung, Züge/Runden, Kartenstapel/Hand, Timer in Ticks, Punktezählung, Bot-Strategien Greedy/Minimax/MCTS mit Budget).
   Haiku setzt Spiele aus Bausteinen + eigenem Code zusammen; Bausteine verkürzen Code und senken Fehlerquote.
3. **Deklarative Ebene zuerst, Code nur wo nötig:** ein Spiel kann rein deklarativ sein (Regeln/Entitäten als Daten,
   Schema-geprüft), Code-Hooks nur für Besonderheiten. Vorbild in der Forschung: Game Description Languages (z. B.
   VGDL, Ludii) – Prüfung nötig.
4. **Harness:** statische Prüfung (AST-Allowlist), Budgets, Determinismus-Hash, Bot-Playtests (Spiel endet, ist
   gewinnbar, nicht trivial, kein Absturz), erweiterte Eingaben (Fuzzing), Optik-Prüfung (Kontrast/Lesbarkeit der
   Anzeigeliste), Reparaturrunden; Belohnung gegen eingefrorenes Gold.
5. **Entwickler-Erlebnis:** Vorlage + Spielwiese (Hot Reload, Seed-Wiedergabe, Bot-gegen-Bot), ein Befehl für Test +
   Größenprüfung; dieselbe Spielwiese nutzt der Harness.
6. **Live gratis:** jedes Vertragsspiel ist automatisch über Lockstep (ct-agent/WebRTC) spielbar und per Link als Geist.
