# Systemhygiene

User: „und achte auf szstem hygiene“

- **Worktrees:** jede Arbeit in einem eigenen Worktree; nach Merge/Abbruch entfernen (`git worktree remove`, dann
  `git worktree prune`). Keine Arbeitsdateien im Repo-Root.
- **Branches:** gemergte Branches lokal und remote löschen; ein Branch je PR.
- **Remote-Runner labor-setup.de:** Läufe unter `~/mdi-runner/<lauf>`; Container mit `--rm`, CPU/RAM gedeckelt;
  Läufe älter als 3 Tage löschen; keine Zugangsdaten auf dem Host (Repo öffentlich, Klonen ohne Token).
- **Container auf Servern:** nur benannte, dokumentierte Container; alte Container/Images nach Go/No-Go entfernen
  (Rollback-Tag behalten); `docker image prune` nur für eigene, unbenutzte Images.
- **Prozesse:** keine `pkill`; Hintergrundprozesse mit harten Zeitgrenzen; nach Abschluss beenden.
- **Geheimnisse:** nur in Env-Dateien mit Modus 600 außerhalb von Repos; nie in Logs, Ablage oder Commits.
- **Abhängigkeiten:** gepinnte Versionen, Lockfiles, nur FOSS-Lizenzen; Audit im CI.
- **Logs/Artefakte:** Scratchpad-Dateien nicht in Repos; Testlogs nur als CI-Artefakt.
