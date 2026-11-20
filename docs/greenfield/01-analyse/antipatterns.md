# Anti-Patterns (im Neuentwurf verboten)

Belege mit Datei:Zeile ergänzt die Spezifikation in `02-spec/`.

| # | Anti-Pattern | Beleg | Leidende Qualität |
|---|---|---|---|
| A1 | Globale `window.*`-Singletons, Koordination über Ladereihenfolge (`Magic`, `FreeFromCard`, `Live`, `ToolsUI`, `DailyFlags`) | Tab-Leisten-Blitzer beim Öffnen aus Start-Bubble; e2e-Wettlauf (PR #232) | Konzeptuelle Integrität, Testbarkeit |
| A2 | Zustand in CSS/DOM statt State-Machine | `#editor:has(.timed) #stagewrap{display:none}` blendete Bühne aus (PR #215); Warte-Overlay verdeckte Knöpfe (PR #230) | Vorhersagbarkeit |
| A3 | Sonderfälle je Kartenart statt Vertrag | Robot-Ausnahmen Arcade/Bauernskat/Tools | Erweiterbarkeit |
| A4 | Stille Rückfälle | `engineOf` → `flug`; „2024“ wurde Flug-Spiel | Ehrlichkeit gegenüber der Prompt-Absicht |
| A5 | Policy nur im Client; zwei Auth-Wege | Relay/Guthaben im Client (PR #221); Web Cookie vs. Apps Bearer | Security, Konsistenz Web/App |
| A6 | Zwei Erzeugungswege für dasselbe | freie Karte (Prompt-Basis) vs. Robot (Karten-Basis) | Wartbarkeit |
| A7 | Harness-Belohnung nur per LLM-Judge ohne eingefrorenes Gold | 142 offene Gold-Einträge; Korrekturen greifen 43 % | Validität der Messung |
