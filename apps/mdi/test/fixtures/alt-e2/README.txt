Alt-Orakel fuer die Engines E2 Flug und E3 Lauf (welle-1.md: "Der Altcode ist die Untergrenze").
Unveraenderte Kopien aus CADS-agent-marketplace @ Tag pre-legacy-removal, Ordner des alten Clients, src/{core,engine,spur,regeln,duel,lauf,lauf-engine}.js
und test/fixtures/{spur-golden,lauf-replay}.js. Geaendert sind nur die require-Pfade (.cjs) und in lauf.cjs Zeile 3 der Ordnername
im Kommentar (Sperre gegen Vermischung, scripts/legacy-check.js). Nur Tests lesen diese Dateien, nie der App-Code.
