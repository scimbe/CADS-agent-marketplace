# Auftrag

**Ziel:** Radikale Konsolidierung von My Daily Idea: Analyse, Schnitt, Neuentwurf (Architektur + Harness), Benutzerführung mit Progressive Disclosure, Bindung. Danach: „plane, evaluiere, baue, debugge, teste und mach es produktiv.“

**Vorgaben des Users (Wortlaut):**
- „der alte code dient dir als genauere spezifikatione von fragmenten“
- „bitte dokumnetiere auch alles in markdown und baue fuer alle agenten ein gemeinsames dateistruktur auf“
- Prämisse: Best Practices, FOSS, plattformunabhängig, keine proprietären Lock-ins.

**Feste Regeln (gelten weiter):**
- Keine Manipulation/Dark Patterns; Zufall nur aus dem Seed. Phase „Bindung“ wird ohne Zwangs- oder Verlustangst-Mechanik umgesetzt (siehe `05-bindung/`).
- Fotos und Audio nie über unseren Server, nur im Link-Fragment.
- Bestehende geteilte Links müssen nicht weiter funktionieren (User: „nein getielte links muessen nicht funktionieren“).
- **Keine Vermischung:** Neue Quellen liegen in einem eigenen Quellbaum und importieren nichts aus `apps/duell-web`. Nach der Umschaltung wird der Altcode aus `main` entfernt (User: „der alte code muss danach auch aus der base raus, es darf zu keiner vermischung von alten und neuen sourcen kommen.“).
- Deploy nur nach grünen Tests und Review, mit Rollback-Tag; Umschaltung erst bei Parität.
- Neuer Client läuft bis zur Parität parallel unter eigenem Pfad.
