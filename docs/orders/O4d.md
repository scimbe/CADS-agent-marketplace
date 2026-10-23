# O4d: Composer verallgemeinert — kalibriert statt auswendig

Folgeauftrag zum Review von O4c. Repo: cads-agent-marketplace, Branch feat/phase2-blueprints.

## Befund
O4c erfüllt seine fünf Fälle. Auf Prompts, die nirgends im Code stehen, verallgemeinert der Composer kaum:

- **Verdeckter Prüfsatz** (32 Prompts, 21 mit Blueprint, 11 fachfremd; der Inhalt bleibt verdeckt): nur 2 der 21 Prompts
  mit Blueprint richtig, 6 Antworten **sicher falsch**. Die 11 fachfremden werden alle richtig abgelehnt.
- **Sichtbare Review-Prompts** (unten): 3 von 8 richtig.

Eine Enthaltung (Rückfrage, keine Wahl) ist nie falsch, sie geht an das LLM-Orakel (O4b) oder an den Kunden. Gefährlich
sind sichere Antworten mit falschem Inhalt, denn danach plant das System mit Default-Werten oder mit einer
falschen Komposition.

## Fehlerklassen (allgemein, nicht pro Prompt beheben)
1. **Zahlformate:**
   - Tausenderpunkt (`250.000`) und Tausender-Leerzeichen (`15 000`);
   - Suffixe `k` und `M` am Dezimalwert (`1.5M`, `30k`);
   - zusammengesetzte Zahlwörter (`twenty thousand`, `Zehntausende`, `Hunderttausende`, `tens of thousands`).
   Ein Zahlwort ohne Ziffer gibt eine Größenordnung und wird als `estimated` markiert. `tens of thousands` ist
   10 000 und nicht 1 000.
2. **Zahl → Parameter:**
   - Eine Zahl gehört zu dem Nomen, das sie zählt (`2.000 Künstler`, `500.000 Gäste`). Eine Zahl wird nie einem
     Parameter zugeschlagen, dessen Blueprint in einem anderen Teil des Prompts gemeint ist.
   - Zählt die Zahl Menschen, das Nomen steht aber nicht im Einheitenvokabular (z. B. ein Berufsname), wird
     nachgefragt; der Default wird nicht still eingesetzt.
3. **Mehrfachwahl:**
   - Ein Prompt mit mehreren Teilen (`und`, `sowie`, `plus`, `außerdem`, `;`) wird in Teilsätze zerlegt.
   - Jeder Teilsatz wird für sich bewertet und liefert seine Blueprint mit seinen Parametern.
4. **Kalibrierung:** Eine sichere Antwort braucht drei Dinge:
   - einen Kernbegriff der Blueprint, d. h. Signal statt Beiwort:
     - collab-crdt: mehrere bearbeiten gleichzeitig denselben Zustand;
     - spatial-audio: viele hören einander live und positionsabhängig;
   - genug Abstand zur zweitbesten Wahl;
   - jede genannte Menge einem Parameter zugeordnet.
   Fehlt eines davon, wird nachgefragt.
5. **Begriffe statt Wortlisten:**
   - Für normalisierte Tokens Stämme und Präfixe verwenden (`zeichn`, `bearbeit`, `hoer`, `edit`), DE und EN,
     statt immer längerer Listen ganzer Wörter.
   - Ein Beiwort allein (`offline`, `Android`, `Streaming`, `Google Docs`, `Millionen`) wählt nie eine Blueprint.

## Sichtbare Review-Prompts → `crates/composer/tests/generalize.rs`
Jeder Fall mit Blueprint darf **richtig oder Enthaltung** sein, nie sicher falsch. Mindestens 6 der 7 Fälle mit
Blueprint müssen richtig sein.

| Prompt | Soll |
|---|---|
| We host virtual concerts in the metaverse, tens of thousands of avatars should hear each other by distance with real room acoustics | spatial-audio, `listeners` 10 000–100 000, `estimated` |
| Squad voice chat for a mobile battle royale, 4 players per squad, 2 million concurrent players, must not drain the battery | spatial-audio, `listeners = 2 000 000`, `mobile_share ≥ 0.5` |
| Notiz-App fürs iPad mit Apple Pencil, Teams von 20 Leuten schreiben gleichzeitig, auch im Flugzeug | collab-crdt, `editors = 20`, `mobile_share ≥ 0.5` |
| Festival mit 80 Verkaufsständen, Kassen sollen offline buchen, ohne Over-Selling | collab-crdt (80 Stände sind keine Bearbeiter: kein `editors` oder Rückfrage) |
| Social-Audio-App wie Clubhouse, Räume mit 5.000 Zuhörern, man läuft mit dem Avatar zu Gruppen hin | spatial-audio, `listeners = 5 000` |
| Gutachterteam (12 Personen) markiert Schäden auf Plänen, oft im Funkloch | collab-crdt, `editors = 12` |
| make my app better | Rückfrage |
| build a figma-like editor for 2,000 designers plus spatial voice for our 300k-attendee live event | collab-crdt `editors = 2 000` **und** spatial-audio `listeners = 300 000` |

## Erlaubte Dateien
crates/composer/**, blueprints/collab-crdt/blueprint.json, blueprints/spatial-audio/blueprint.json

## Akzeptanz
- `cargo test --offline -p composer` grün. `tests/operator.rs` und `tests/intent.rs` werden nicht geändert.
- Neuer Test `tests/generalize.rs` mit der Tabelle oben, wörtlich.
- **Verdeckter Prüfsatz im Gate:**
  - 0 sichere Fehler und mindestens 11 von 21 Prompts mit Blueprint richtig.
  - Das Gate meldet nur Summen und Fall-IDs. Der Prüfsatz ist außerhalb der Sandbox und soll nicht gesucht werden.
  - Verbessert wird über die Fehlerklassen oben, nicht über einzelne Formulierungen.
- Kein Prompt-Text aus Tests in `src/` oder `blueprint.json` (keine Sonderfälle; wird im Review geprüft).
