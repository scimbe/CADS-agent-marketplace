# O4a: Composer, Teil 1 — Katalog und Absichtserkennung ohne Sprachmodell

Repo: cads-agent-marketplace, Branch feat/phase2-blueprints. Neues Crate `crates/composer` (Workspace-Mitglied).

## Zweck
Der Marktplatz soll aus einem einzigen Prompt eine individuelle Architektur erzeugen — mit möglichst wenig Tokens.
Darum löst der Composer die Absicht **deterministisch** auf: Katalog-Schlüsselwörter, Zahlen mit Einheiten, Merkmale.
Ein Sprachmodell kommt nur, wenn das nicht reicht, mit hartem Token-Deckel (Teil O4b), und nie für das, was Code kann.

## Auftrag
1. `catalog`: Typen für `cads-blueprint-v1` (siehe `blueprints/collab-crdt/blueprint.json`); der Katalog der Blueprints in
   `blueprints/*/blueprint.json` wird zur Übersetzungszeit eingebettet (`include_str!`), optional ein Verzeichnis zur Laufzeit.
   Beim Laden prüfen: eindeutige ids, Parameter mit `default` in `[min, max]`, `threshold > 0`.
2. `intent`:
   - Normalisierung: Kleinschreibung, ä→ae, ö→oe, ü→ue, ß→ss, Satzzeichen zu Leerraum (Ziffern-Trenner `.`/`,` und
     Bindestriche in Zahlen und Wörtern wie `local-first`, `sub-50ms` erhalten).
   - Schlüsselwörter: mehrteilige (`google docs`) als Wortfolge; einteilige mit ≥ 5 Zeichen als Wortanfang (Stamm),
     kürzere nur als ganzes Wort (`pos` darf `position` nicht treffen). Punktzahl = Summe der Gewichte; gewählt sind alle
     Blueprints mit Punktzahl ≥ `threshold` (ein Prompt kann mehrere verlangen).
   - Zahlen: `10.000`, `10,000`, `10000`, `10k`, `10 tsd`, `10 tausend`, `1 mio`, `1,5 millionen`, `2 million`,
     `1.5` (Dezimalpunkt, wenn keine Dreiergruppe), `1,5` (Dezimalkomma). Ergebnis als Zahl.
   - Parameter: für jeden Parameter mit `units` die nächste Zahl bis drei Wörter vor oder zwei nach einem Einheitswort;
     Grenzen `min`/`max` anwenden (außerhalb: Wert verwerfen und als Rückfrage melden, nicht stillschweigend klemmen).
     `flags`: Merkmalswörter setzen einen Float-Parameter (mehrere: Mittelwert).
   - Latenz-Angaben (`sub-50ms`, `< 50 ms`, `unter 50 ms`) als Parameter `latency_ms`, falls der Blueprint ihn hat.
   - Ausgabe `Intent { blueprints: [(id, score)], params: {id: {name: value}}, questions: [String], confidence }`;
     keine Wahl → `questions` nennt die zwei besten Kandidaten.
3. Tests `crates/composer/tests/intent.rs` mit mindestens diesen Prompts (deutsch und englisch):
   - Der Prompt aus der Aufgabenstellung des Betreibers zur Kollaboration („Echtzeit-Kollaborations-Engines im Web (z. B. Figma,
     Google Docs bei 10.000 simultanen Editoren) … CRDTs … Operational Transformation …“) → `collab-crdt`, `editors = 10000`.
   - „Build a local-first whiteboard for 500 people on iPad and Android, works offline“ → `collab-crdt`, `editors = 500`,
     `mobile_share ≥ 0.9`.
   - „Baustellen-App: 40 Bauleiter erfassen Mängel offline im Keller“ → `collab-crdt`, `editors = 40`.
   - „Eine Kasse für ein Festival“ (zu wenig) → keine Wahl oder Wahl mit Rückfrage, nie stilles Raten.
   - Grenzfall: „10 Mrd. Editoren“ → Rückfrage wegen `max`.
   - Zahlenformate einzeln (Tabelle), Umlaute, `pos` vs. `position`.
   - Determinismus: gleicher Prompt, gleiches Ergebnis (Reihenfolge eingeschlossen).

## Erlaubte Dateien
crates/composer/**, Cargo.toml (nur `members`), Cargo.lock

## Akzeptanz
- `cargo test --offline -p composer` grün, `RUSTFLAGS=-D warnings cargo build --offline -p composer` sauber.
- Keine neue externe Abhängigkeit außer serde/serde_json (schon im Workspace); kein Regex-Crate nötig.
