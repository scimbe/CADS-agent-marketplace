# 2026-11-11 Konzept-Review (adversarial, ohne Vorwissen)

**Ziel:** `KONZEPT.md` gegen `entscheidungen.md`, `00-auftrag.md`, `01-analyse/`, `02-spec/`, `03-architektur/`, `04-ux/`
prüfen. Gesucht sind Fehler, Risiken, Überbau, Widersprüche und fehlende Anforderungen.
**Methode:** Alle Dateien im Ordner gelesen. Jeder Befund nennt einen Beleg (Datei:Abschnitt) und eine konkrete Änderung.
Es wurde kein Code gelesen. Aussagen über den Altcode stützen sich nur auf `02-spec/`.
**Schwere:** kritisch = das Konzept ist in diesem Punkt falsch oder unsicher, so ist es nicht baubar.
hoch = großes Risiko oder fehlende Anforderung. mittel = Widerspruch oder Lücke, die man beheben kann.
niedrig = Hinweis.

---

## Kritisch

### K1 Verdeckte Information ist mit dem Vertrag nicht sicher abbildbar

**Befund:** Der Vertrag hat nur einen Zustand. Dieser Zustand liegt bei Lockstep auf jedem Gerät: `step(state, input, rng)`
läuft bei allen Spielern, und `view(state, seat)` filtert nur die **Anzeige** (KONZEPT §3). Damit gilt:
- **Tisch** (Skat, Doppelkopf, Bauernskat; `02-spec/05-spielen.md` „Tisch“): Jeder Client hält alle Hände im Speicher.
  Ein Spieler mit Devtools oder einem veränderten Client sieht die Karten der anderen.
- **Gemeinsamer Seed:** Der Seed ist geteilt (KONZEPT §3 „Duell per Link (Seed + Eingabe-Log)“, §4 „beide laden dieselbe
  Karte mit demselben Seed“). Damit kann jeder Spieler das Mischen und jedes spätere Ziehen vorausberechnen.
- **Versiegelte Zugkarten:** `turn` trägt `q (versiegelt)` im Link (`02-spec/01-karten.md` Tabelle Kartenarten). Bei
  Bluff, Lüge, Schmuggel, Wichteln und Umschlag trägt das Geheimnis das Spiel. „Der Link IST das Spiel“
  (`02-spec/05-spielen.md`) heißt: Der Empfänger dekodiert das Geheimnis aus dem Fragment, wenn es nicht verschlüsselt ist.
- **Rückschritt:** Der Altcode hat `mpoker.test` (Mental Poker, `02-spec/10-tests.md` „1:1 portierbar“) und ein
  Siegel-Verfahren. Im Konzept kommt keins von beiden vor.
- **Bot:** Der generische Suchbot (§3 „moves vorhanden → Bot“) bekommt den vollen Zustand und betrügt in Spielen mit
  verdeckter Information.

**Änderung:**
1. Den Vertrag um `secret` erweitern. Der Zustand teilt sich in `public` und `private[seat]`.
   `step` bekommt nur, was der Sitz sehen darf, und ein Ereignis `reveal(commitment, opening)`.
2. Je Kartenart eines von drei Modellen im Manifest festlegen (`hidden: none | commit-reveal | mental-poker | dealer`):
   - Zugkarten mit einem Geheimnis: Commit-Reveal (Hash im Link, Öffnung erst beim Aufdecken).
   - Tisch: Mental Poker (Altcode `mpoker` als Testvektor) oder ein Server-Dealer mit Grant. Das ist bewusst
     abzuwägen gegen „Server sieht nichts“.
   - Geist und Duell ohne Geheimnis: wie bisher.
3. Mischen nicht aus dem gemeinsamen Seed ableiten. Stattdessen kombinierte Commitments verwenden (jeder Spieler trägt
   Zufall bei und öffnet ihn erst später).
4. Bot nur mit Determinisierung (ISMCTS) über `view(state, botSeat)`, nie über den vollen Zustand.
5. Zur Abnahme ein Testfall „Gegnerhand aus dem Speicher lesen“: Der Test muss scheitern.
6. Eine Forschungsnotiz `08-forschung/verdeckte-information.md` anlegen (Mental Poker, Commit-Reveal, ISMCTS).

### K2 Foto, Audio und Kartentext können über params, Link und Robot das Gerät verlassen

**Befund:**
- Das Schema hat „Slots für Text, Farbe, **Bild**, Logo“. Teilen ist „Referenz + **params** + Seed, ein Linkformat für
  alles“ (KONZEPT §3). Ein Foto-Slot in `params` landet so entweder im Fragment oder auf dem Server.
  - Altcode: Das Foto ist nie im doc (`02-spec/01-karten.md` photo, daily.js:463).
  - `09-plattform.md` Datenschutz: „Nur getippter Text verlässt das Gerät“, „KI fasst kein Bild an“.
  - Die Frage ist ausdrücklich offen (`offen.md` „Datenschutz Fotos/Audio“, `09-plattform.md` „WIDERSPRUCH“).
    Das Konzept entscheidet sie stillschweigend.
- **Robot:** „Haiku liefert einen Patch auf params“ (§3). Haiku braucht dafür die aktuellen params als Eingabe. Damit
  gehen Fotoreferenzen, Sticker-Inhalte, versiegelte Fragen (siehe K1) und Notizen an das Modell. Heute gehen nur getippter
  Text und `prefContext` ohne Alter, Name und PayPal hinaus (`07-konto-guthaben.md`).
- **„Ein Bild-Slot bekommt automatisch KI-Bild“** (§3) vermischt eigene Fotos (lokal, nie über den Server) mit
  KI-Bildern (Server-Referenz `<22>.(jpg|png)`, `08-push-bilder-wand.md`). Der Vertrag unterscheidet die beiden nicht.

**Änderung:**
1. Im Schema getrennte Slot-Typen einführen:
   - `localMedia` (Foto, Audio): wird nie serialisiert, nie an Haiku geschickt, nie in `params` geteilt. Im Link steht
     nur ein Platzhalter.
   - `serverImage` (KI-Bild): nur als Referenz.
2. Robot bekommt eine **Projektion** der params, die der Build aus dem Schema erzeugt. Die Positivliste nennt Felder mit
   `llm: true`. `localMedia` und Geheimnisse sind nie dabei.
3. Die offene Foto-Frage vor D1 vom User entscheiden lassen und in `entscheidungen.md` eintragen.
4. CI-Prüfung: Kein Schema-Feld vom Typ `localMedia` erreicht `broker/ai.ts` oder einen Link-Encoder.

### K3 Der Raum als Grundschicht hat kein Modell für Kompatibilität und Erreichbarkeit

**Befund:**
- **Versionsunterschiede:** Lockstep verlangt byte-gleichen Code von Karte und SDK (`04-erzeugung.md` Code-Modus „SDK
  byte-gleich … gepinnt“).
  - Apps tragen das Bundle in sich (`09-plattform.md` Apps, „Apps tragen die Dateien im Bundle“). Sie hängen also
    Store-Freigaben hinter dem Web her.
  - Wenn ein App-Nutzer und ein Web-Nutzer im selben Raum dieselbe Karte öffnen, laufen verschiedene Versionen. Folge:
    Der Hash weicht ab, das Spiel endet ohne Sieger (`04-erzeugung.md` „Abweichung → Ende ohne Sieger“).
  - KONZEPT §4 („Karte anbieten → beide laden dieselbe Karte“) hat keine Versionsabsprache.
- **Getrennte Transporte:** „Zusammen bauen“ läuft heute nur über `DuellHost.peer*` der Apps. Live-Spiele laufen über
  ct-agent im Browser (`05-spielen.md`).
  - iOS blockt jedes Netz außer `/api/s` (`09-plattform.md` Apps).
  - Ein Raum mit einem Partner in der App und einem im Web hat heute zwei Transporte, die nicht zusammenpassen.
  - Das Konzept behauptet „ein Paket“, ohne die App-Bridge zu nennen.
- **TURN nur per Grant:** Relay ist nur für zahlende Konten erlaubt (`entscheidungen.md`). Das Konzept dehnt das auf
  Medien und den Raum aus („TURN nur per Grant“, „Relay-Regeln wie bei Dateien“, §4).
  - Zwei Gratis-Nutzer hinter symmetrischem NAT oder CGNAT (im Mobilfunk häufig) kommen gar nicht zusammen, auch nicht
    für Spieldaten.
  - Heute gilt „TURN nur wenn nötig“ für Live-Spiele (`05-spielen.md`), ohne Bezahlregel. Das ist ein Rückschritt.
  - Die Entscheidung des Users betrifft **Dateien** (`06-werkzeuge.md`).

**Änderung:**
1. Das Angebot „Karte anbieten“ trägt `{cardId, codeHash, sdkVersion, capabilities}`. Annehmen geht nur bei
   gleichem Hash. Sonst lädt der Empfänger die Version vom Server, wenn sie signiert ist, oder der Raum sagt ehrlich
   „Partner hat eine ältere App“.
2. Für Apps die Karten-Module per signiertem Download aus dem Bundle lösen. Den Kern im Bundle lassen.
3. Einen Transport für alle Plattformen festlegen: ct-agent WASM auch in der App-WebView, oder eine App-Bridge mit
   identischem Protokoll. Ein Szenario-Test „App ↔ Web“ ist Abnahmepflicht.
4. Vom User entscheiden lassen, ob TURN für **Spieldaten mit kleiner Rate** gratis bleibt. Vorschlag: Daten-TURN mit
   Ratenbegrenzung gratis, Datei- und Medien-Relay nach der Bezahlregel. In `entscheidungen.md` eintragen.

---

## Hoch

### H1 Fehlerfälle des Raums sind nicht beschrieben

**Befund:** KONZEPT §4 beschreibt nur den Erfolgsfall. Es fehlen:
- **Wiederverbinden:** ICE-Restart, Nachladen des Zustands per Snapshot und Hash. Bei verdeckter Information darf ein
  Snapshot keine fremden Hände enthalten (siehe K1).
- **Partner offline:** Hält der Raum? Wie lange? Die Einladung ist einmalig mit `WAIT_MS 15 min`, `05-spielen.md`.
- **Gleichzeitiges Anbieten zweier Karten (Glare):** keine Regel. Bei Notizen gibt es heute die Regel „Gleichstand →
  Einladender“ (`06-werkzeuge.md`).
- **Partner verlässt das Spiel:** keine Regel. Mögliche Antworten: Aufgabe, Bot übernimmt, oder als Geist weiter.
- **Missbrauch:** Blockieren, Stummschalten, Entfernen und Melden im Raum fehlen. Melden gibt es heute nur für Inhalte,
  `08-push-bilder-wand.md`.
  - Video unter Fremden mit 16+ über weitergereichte Links ist ein Schutzproblem.
  - Kontakte und Push-Einladungen in den Raum öffnen einen Belästigungskanal.
- **Lockstep mit n Personen:** Der langsamste Teilnehmer bremst alle. §4 erlaubt aber „n Personen“.

**Änderung:** Einen Abschnitt „Raum-Lebenszyklus“ als Statechart der Raum-Region anlegen, mit diesen Zuständen und
Ereignissen: `reconnecting(t)`, `peerAway`, `offerCollision` (niedrigere Peer-id gewinnt), `peerLeft` mit
Kartenregel aus dem Manifest (`onLeave: forfeit|bot|pause`), `blocked`. Dazu:
- Blockieren ist lokal und serverseitig. Medien sind beim Beitritt standardmäßig aus.
- Einladungen in Räume nur von bestätigten Kontakten, nie über Push von Fremden.
- Je Fall ein Fake-Live-Szenario-Test.

### H2 Die Stufe S-Regeln kostet mehr, als sie bringt

**Befund:**
- Eine eigene Spielbeschreibungssprache müsste Flugphysik, Läufer, Arcade, Zugkarten und Tischspiele mit verdeckter
  Information abdecken (KONZEPT §3 „Grundstock und Engines“). Das ist ein Forschungsprojekt.
  - Ludii und VGDL decken jeweils nur einen Teil ab. VGDL deckt im Kern 2D-Arcade auf Gittern ab.
  - §3 markiert die Frage selbst mit **[prüfen]**.
- Zwei Ausführungswege (Interpreter und Code) verdoppeln die Fläche für Determinismus, Budgets und Tests.
- Haiku kennt eine selbst erfundene Sprache nicht aus dem Training, JavaScript dagegen gut. Die Erfolgsquote ist
  vermutlich **schlechter** als bei Code mit gutem SDK. Das ist eine Annahme, aber das Konzept belegt das Gegenteil
  auch nicht.
- D1 verlangt „Flug als S-Regeln-Bausatz“ (§9.1). Damit muss die Sprache schon im ersten Durchstich entworfen sein.
- Die Sicherheit liegt im Interpreter, nicht in der Sandbox. Der Harness-Tabelle fehlt dafür ein Budget- und
  Sandbox-Eintrag (§3 Tabelle: „Schema + Playtests“).

**Änderung:** Nur zwei Stufen verwenden.
- **S-Daten:** params eines Bausatzes.
- **S-Code:** SDK, mit den Bausteinen als typisierter Bibliothek.

Die „Deklaration“ wird zur Konvention *innerhalb* von S-Code, zum Beispiel `defineGame({entities, rules})` als
Bibliotheksfunktion. Sie läuft in derselben Sandbox und hat denselben Harness. Eine echte DSL erst einführen, wenn
Messungen am Gold zeigen, dass S-Code bei einer Spielklasse oft scheitert.

### H3 D1 ist zu groß und hängt an offenen Entscheidungen

**Befund:** D1 enthält Statechart, Vertrag, Renderer, Tokens, Raum mit Sprache, eine S-Daten-Karte und Flug als
S-Regeln. Dazu kommen die Modi allein, Bot, Link und live, auf Web **und** iOS, mit bestandener Design-Kritik (§9.1).
Abhängigkeiten, die noch offen sind:
- Auth ist offen (§6 „[Entscheidung offen]“, `offen.md`). TURN-Grants brauchen aber Auth.
- call-core und die Webkonferenz sind nicht erhoben (§4 [prüfen], `webconference.md` „Offen“, `11-serverzustand.md`
  „vom Agenten nicht gelesen“).
- Ed25519 in der iOS-WebView ist unsicher (`08-forschung/sandbox-vertrag.md`).
- Das Gate „Statechart Eigenbau oder XState“ ist offen (`offen.md`).
- Für Flug gibt es heute ausdrücklich keinen Bot (`04-erzeugung.md` „kein Bot für diese Genres“). Ein generischer
  Suchbot für Echtzeitphysik ist eine eigene Aufgabe.
- Flug live ist der schwerste Fall für die Netzwerk-Synchronisation (siehe H7).
- D1 entspricht etwa S1+S3+S5+S7+S14 aus `06-plan/slices-detail.md`, plus den Raum, für den es keinen Slice gibt.

**Änderung:** D1 aufteilen. D0 wählt bewusst die **riskantesten Vertragsfragen**, nicht die eindrucksvollsten.
- **D0 (nur Web):** Statechart mit drei Regionen, Vertrag inklusive `secret` (K1), Renderer und Tokens.
  Zwei Karten:
  - eine static-Karte
  - eine Zugkarte mit Geheimnis (z. B. Bluff) mit allein, trivialem Bot, Link und live über den **vorhandenen**
    Datenkanal, ohne Sprache
  Abnahme:
  - Gegnerhand nicht auslesbar
  - Versionsabsprache greift
  - Glare und Abbruch getestet
  - Pfad-Enumeration grün
- **D1a:** Flug als S-Code-Bausatz mit Geist per Link. Dazu Lockstep live mit Messung der Latenz-Grenzen.
- **D1b:** Sprache im Raum, iOS mit Szenario App ↔ Web. Erst nach der Auth-Entscheidung.

### H4 Der Vertrag kann mehrere Kartenarten nicht ausdrücken (Blasen und Editor eingeschlossen)

**Befund (je Kartenart):**

| Kartenart | Warum sie nicht passt | Beleg |
|---|---|---|
| sound / Rap-Beat | Die Anzeigeliste hat nur Grafik-Primitive (`bg/rect/circle/line/text/emoji`). Es fehlt ein Audio-Ausgang. Der Sequencer braucht eine Audio-Uhr, `step` verbietet aber jede Uhr. WAV-Export fehlt. | `04-erzeugung.md` Code-Modus, `01-karten.md` sound und #227 |
| photo | Es fehlt ein Bild-Primitiv mit lokaler Referenz, die nie serialisiert wird (siehe K2). | `01-karten.md` photo |
| tool (Datei rüber, Notiz) | Kein deterministisches Programm. Die Bytes einer Datei gehören nicht in einen Lockstep-Zustand. Notizen nutzen Last-Writer-Wins (LWW), nicht Lockstep. Werkzeuge sind nie Tageskarte. | `06-werkzeuge.md` |
| Zusammen bauen | Gemeinsames Bearbeiten von params nutzt LWW mit (lamport, actor) und Grabsteinen, nicht `step`. Das Konzept sagt nicht, wie der Raum das abbildet. | `05-spielen.md` Zusammen bauen |
| malrat / Freihand | Striche sind lange Eingabefolgen, keine params. Eine Blase je Teil hat kein Ziel für „hier zeichnen“. | `01-karten.md` turn: malrat |
| Sticker | Platzieren ist direkte Manipulation auf der Bühne (E1 „Sticker ohne Ziehen“, Ebenenliste). Ein aus `parts` + `params` erzeugter Dialog bildet Position und Ebene nicht ab. | `03-editor.md` |
| Quiz und Listen | Für Fragenlisten fehlt ein Editor zum Hinzufügen, Entfernen und Sortieren. Wo sitzt die Blase eines Listeneintrags? | `04-erzeugung.md` quiz→turn mit pk |
| Arcade | Die Teile hängen vom Zustand ab und bewegen sich. KONZEPT nennt `parts` statisch im Manifest, `zielarchitektur.md` §2 nennt `parts?(state)`. | KONZEPT §3 vs `zielarchitektur.md` §2 |
| quest | braucht crypto; im Konzept ohne Spur | `01-karten.md` |
| Business (Termin, Geld einsammeln, Protokoll) | Das sind Werkzeuge für Abstimmen und Sammeln, keine Spiele. PayPal.me ist erst ab 18. Protokoll erzeugt `#todo`. | `webconference.md` Business, `07-konto-guthaben.md`, `02-links.md` |

**Änderung:**
1. Die Anzeigeliste um `image(localRef|serverRef)` und `audio(pattern|clip)` erweitern. Die Audio-Ausgabe ist eine
   Fähigkeit des Brokers, der Zustand bleibt deterministisch.
2. Einen zweiten Vertragstyp **„Tätigkeit“** für Werkzeuge und Zusammen bauen einführen: CRDT oder LWW-Dokument statt
   `step`. Damit ist ehrlich gesagt, dass „alles ist eine Karte“ hier nicht gilt.
3. Der Editor leitet nur Formulare ab. Für direkte Manipulation gibt es drei feste Editor-Primitive im Rahmen:
   `place` (Sticker oder Logo auf der Bühne), `draw` (Striche als Eingabelog) und `list` (Einträge sortieren).
   Karten deklarieren diese Primitive im Schema (`x-editor: place|draw|list`).
4. `parts` als Funktion `parts(state)` definieren und im Manifest nur die Bindung an params angeben.

### H5 Vertrauen in S-Daten und S-Regeln ist widersprüchlich festgelegt

**Befund:**
- Die Stufen-Tabelle nennt eine Signatur nur für S-Code (§3).
- „Teilen“ nennt „Code/Regeln (signiert)“ (§3), „Erzeugung“ signiert immer (§5).
- Erzeugte freie Karten tragen heute ein KI-Siegel (`04-erzeugung.md` Siegel).
- Wenn Regeln oder params aus einem Link ohne Signatur angenommen werden, kann jeder Regeln von Hand bauen und als
  „Haiku-Karte“ verschicken. Prüfung, Playtests und Moderation (Deck-`gate()` fail closed) werden dann umgangen.

**Änderung:** Jede erzeugte Stufe wird nach dem Harness signiert. Unsignierte params sind nur für Grundstock-Bausätze
erlaubt und laufen immer durch Schema und Textfilter. Der Textfilter gilt für jeden Text aus Eingabe, Link, Peer und LLM
(`01-karten.md` Invariante). Das gilt ausdrücklich auch für Raum-Nachrichten und Notizen.

### H6 Ende-zu-Ende mit SFU und die Verknüpfung der Identität sind nicht ehrlich beschrieben

**Befund:**
- **E2E mit SFU:** §4 verspricht Medien „Ende-zu-Ende“ und ab etwa 4 Personen eine SFU. Eine SFU terminiert
  DTLS-SRTP. E2E braucht dann zusätzlich Insertable Streams oder SFrame. `webconference.md` sagt „Server sieht keine
  Inhalte“. Mit SFU stimmt das ohne SFrame nicht.
- **Identität ans Konto binden:** Der ct-agent-Schlüssel wird an das Konto gebunden, Kontakte liegen gemeinsam vor
  (§4). Damit sind Live-Sitzungen über die Zeit einem Konto zuordenbar. Ein Kontakt-Graph ist neu gespeicherte
  Personenbeziehung.
- `09-plattform.md`: „Server speichert nur HMACs und Zähler, keine IP, keine E-Mail, keinen Eingabetext“. Ein
  Kontakt-Graph ist mit dieser Regel nicht vereinbar, ohne dass man ihn eigens begründet.
- **Anonyme Nutzer:** Ob sie überhaupt einen Raum öffnen dürfen, ist offen. KONZEPT §2 kennt „anonym (Gerät)“.

**Änderung:**
1. Bis SFrame belegt ist, die SFU als „nicht E2E“ kennzeichnen, oder auf Mesh mit höchstens 4 Personen begrenzen.
2. Raum-Identität **pro Raum** als Pseudonym ableiten. Kontakte nur lokal oder als gegenseitig bestätigte HMAC-Paare.
3. Anonymen Live-Zugang ohne Kontobindung beibehalten.
4. Das Datenschutz-Inventar aus `build.test.js` um diese Regeln ergänzen.

### H7 Echtzeit-Lockstep und der generische Bot sind nicht belegt

**Befund:**
- Lockstep mit 3 Ticks Vorlauf (`04-erzeugung.md`) gibt bei 60 Hz etwa 50 ms Puffer. Mobil liegt die RTT oft bei
  100–200 ms, das führt zu ständigem Stocken.
- Der Code-Modus mit Lockstep ist DRAFT (#229) und in der Praxis nicht belegt.
- Ein Suchbot für Echtzeit-Arcade ist auf dem Telefon im Budget nicht einfach zu haben.
- Für den Determinismus über verschiedene JavaScript-Engines (JSC und V8) fehlen weitere Verbote: Sortierstabilität bei
  eigenen Komparatoren, `localeCompare` und `Intl`, Reihenfolge von Objektschlüsseln bei Zahlschlüsseln.

**Änderung:**
1. Eine Forschungsnotiz `08-forschung/netcode.md` anlegen (Lockstep vs. Rollback/GGPO, adaptive Eingabeverzögerung).
2. Je Karte `netcode: lockstep|rollback|async` im Manifest angeben. Arcade live zunächst nur „async/Geist“.
3. Bot nur für `mode: turn` generisch. Für Echtzeit liefert der Bausatz seine eigene Bot-Strategie.
4. Die Verbotsliste im SDK erweitern und per AST prüfen.

---

## Mittel

### M1 Innere Widersprüche zwischen KONZEPT, zielarchitektur und blueprint

- **Fähigkeiten:**
  - KONZEPT: `uses: [image, voice, video, collab, relay]`
  - `zielarchitektur.md` §2: `capabilities: [solo|bot|duel-link|duel-live|image|relay|photo|audio|collab]`
  - `blueprint.md` 1: `solo|bot|duel|image|relay|photo`
  - KONZEPT nennt weder photo noch audio.
- **Zustandsschema:** KONZEPT hat kein `state: JSONSchema` und kein `version`. Ohne Zustandsschema lässt sich ein Link
  mit Spielzustand („Link IST das Spiel“) nicht prüfen. Das verletzt „Schema an jeder Grenze“
  (`zielarchitektur.md` §5).
- **Statechart:**
  - KONZEPT §2 nennt drei Regionen: Inhalt ‖ Raum ‖ Konto.
  - `zielarchitektur.md` §1 nennt `app ‖ overlay ‖ net`, und live hängt dort **unter**
    `card.play.duel.live`. Das widerspricht „Raum als Grundschicht“.
- **Plan:**
  - §9 ersetzt die Reihenfolge der Slices. `06-plan/slices-detail.md` ist aber nicht angepasst.
  - Für den Raum gibt es keinen Slice.
  - S7 (Broker live) ist nur Datenkanal.
- **Unabhängige Regionen:** „Keine Region greift in eine andere“ (§2) ist zu stark. Ein Logout mitten in einem bezahlten
  Relay entzieht den Grant (Konto → Raum). Ein Kontowechsel mitten im Spiel betrifft Inhalt und Raum.

**Änderung:**
1. Ein maßgebliches Manifest-Schema in `packages/mdi-contract` festlegen. KONZEPT und zielarchitektur verweisen nur
   darauf.
2. Die Statechart in `zielarchitektur.md` auf drei Regionen umstellen, Raum oben.
3. Ereignisse zwischen Regionen benennen, zum Beispiel `ACCOUNT.LOGOUT → ROOM.REVOKE_GRANTS`.
4. Die Slice-Liste auf D0, D1a und D1b umstellen und einen Raum-Slice ergänzen.

### M2 User-Entscheidungen ohne konkrete Abbildung im Konzept

| Entscheidung (`entscheidungen.md`) | Stand im KONZEPT |
|---|---|
| Relay nur zahlend, Empfang über zahlenden Partner, serverseitig | §6 ✓. Die Ausdehnung auf Medien und Raum ist nicht entschieden (siehe K3). |
| KI-Bilder 3/Monat, dann 1 Guthaben | §6 ✓. Kontobild offen (`offen.md`) – nicht erwähnt. |
| Bild-Host `z-image`, nicht `sdturbo` | **fehlt.** §8 sagt nur „ICC-GPU“. Die Anbindung (Tunnel-Pod) ist offen. |
| Sound nur als eine Strassenrap-Beat-Karte | **fehlt** völlig. Der Vertrag kann Audio nicht ausdrücken (H4). |
| Robot/Magie ohne Ausnahmen | behauptet (§3). Für Werkzeuge, Fotos und Geheimnisse ist nicht definiert, was Robot tut (H4, K2). |
| Haiku-Code nur im Harness, Kunde ohne Code | §5 ✓ |
| Links nicht kompatibel | ✓ implizit. Das `#v2`-Format aus `02-links.md` ist im KONZEPT nicht genannt. |
| Keine Vermischung, Altcode entfernen | §9.5 ✓. Die Zusammenführung von ct-agent, call-core und Webkonferenz zu „einem Paket“ (§4) ist eine Änderung über Repo-Grenzen hinweg, ohne Slice und ohne Eigentümer. |
| Forschung je Schritt | teilweise. Es fehlen Notizen zu verdeckter Information, Netcode, E2EE mit SFU und LLM + Spielbeschreibungssprachen, obwohl das Konzept darauf aufbaut. |
| Skalierung, hybrid | §8 ✓ (siehe M3) |
| Builds auf labor-setup.de | §9 ✓ |
| Design „wie aus einem Ei“ und Plattformtreue | §7 ✓. Der Konflikt zwischen einem einzigen Renderer und Systemschrift und Plattform-Navigation in der WebView ist nicht aufgelöst. |
| Business-Sicht | §2 „nur anderer Katalog und Theme“ – **zu kurz.** Business hat `stat:false`, keine freie Karte und überlagerte Texte (`09-plattform.md` Flavor Business). |
| Grundstock und Engines neu, Baukasten | §3 ✓ (siehe H2) |
| Systemhygiene | nicht im KONZEPT (eigene Datei, in Ordnung) |
| Webkonferenz nahtlos | §4 ✓ (siehe K3, H1, H6) |

Weitere Invarianten aus `02-spec/`, die im KONZEPT fehlen:
- Tagesrotation als reine Funktion des UTC-Tags, nie zweimal hintereinander dieselbe Mechanik, Kalenderkarten, `needs`
  (`01-karten.md`)
- Werkzeuge nie Tageskarte
- Deck-`gate()` fail closed
- Krisenpfad mit eigenem Hilfetext
- Statistik minimal, Business sendet nichts
- Kurzlinks nur nach Tippen auf Teilen

**Änderung:** Im KONZEPT einen Abschnitt „Invarianten aus der Spezifikation“ als Verweisliste anlegen. Je Zeile der
Tabelle oben einen Satz oder einen offenen Punkt ergänzen.

### M3 Der Skalierungsplan passt nicht durchgängig zum Client-Entwurf

- **SFU fehlt:** Die SFU ist ein zustandsbehafteter Mediendienst mit Raum-Affinität. Sie fehlt in
  `skalierung.md` (dort nur Signalisierung und TURN), auch in der Tabelle „Hybride Kapazität“.
- **Signaturschlüssel:** Der Harness signiert (§5). Laufen Playtest-Worker im Cloud-Burst, braucht entweder der Worker
  den Signaturschlüssel, oder die Signatur muss zentral on-prem erfolgen. Das ist nicht festgelegt.
  - Zusätzlich läuft dort nicht vertrauenswürdiger, erzeugter Code. Die Server-Isolation ist bewusst „nicht QuickJS“
    (`04-erzeugung.md`), und diese Wahl ist für fremde Hosts nicht bewertet.
- **Sharding nach Konto:** Es passt nicht für Deck und Stimmen (global über Konten), Kontakte und Räume (Beziehungen
  zwischen Konten) und Moderation über Karten.
- **Rendezvous-Hash:** Er verschiebt beim Hochskalieren etwa 1/n der Kanäle. Bei langlebigen Räumen trennt das laufende
  Spiele, wenn kein Drain vorgesehen ist.
- **Apps:** Die iOS-Netz-Positivliste (`09-plattform.md`) muss für `/api/mdi`, `/live`, `/img` und Bearer geändert
  werden. Das steht in keinem Slice.
- **Zeitpunkt:** P3 (Live-Affinität) und P4 (Cloud-Burst) „parallel ab D1“ (§9.4) ist Überbau, solange es keine
  messbare Last gibt.
  - Die User-Vorgabe verlangt, dass sich das System aufteilen **lässt**. Sie verlangt nicht, dass es von Anfang an
    aufgeteilt läuft.
  - P1 (zustandslose App, Postgres) ist dagegen sofort nötig. Grund: Doppelbuchung bei mehreren Repliken
    (`11-serverzustand.md`) und Holds nur im RAM (`07-protokoll/2026-11-11-bildpreis.md` „Neustart“).

**Änderung:**
1. Die SFU als eigene Zeile mit Affinität und Ort aufnehmen.
2. Signieren nur in einem on-prem-Dienst. Worker liefern nur ein Prüfergebnis.
3. Shard-Schlüssel je Speicher festlegen (global: Deck und Stimmen).
4. Drain-Regel für Live-Instanzen festlegen.
5. P0–P2 jetzt umsetzen, P3 und P4 hinter einen Messauslöser stellen (z. B. p95-Last oder Warteschlangen-Länge).

### M4 Der Domain-Wechsel verliert lokale Daten

**Befund:** „Eine Domain“ (§8, P0) wechselt den Origin. Damit sind localStorage-Daten weg:
- Wand, Notizen, gemerkte Karten
- Geräte-Code mit 128 Bit
- `aiDev`-id samt Proof-of-Work
- Blasen-Einstellung

Quellen: `07-konto-guthaben.md`, `08-push-bilder-wand.md`, `06-werkzeuge.md`, `03-editor.md`.

Auch Push-Abonnements hängen am Scope `/duell` (`08-push-bilder-wand.md`). Datenmigration erwähnt nur
`skalierung.md` („je Speicher einmalig“) und nur serverseitig.

**Änderung:** Einen Slice „Lokale Übernahme“ anlegen:
- einmaliger Export vom alten Origin per Fragment oder Datei, nach Nutzertipp
- Import mit Schema
- erneutes Push-Opt-in
- Abnahme: Wand und Notizen sind nach der Umschaltung vorhanden

### M5 Ein Datenkanal für alle Tätigkeiten blockiert das Spiel

**Befund:** Im Raum laufen Dateien, Notizen und Lockstep-Spiel parallel (§4). Heute sind über ct-agent „nur kleine
Spielnachrichten“ erlaubt (`05-spielen.md`). Eine Dateiübertragung auf einem zuverlässigen, geordneten Kanal blockiert die
Lockstep-Ticks (Head-of-line-Blocking). Folge: Das Spiel stockt oder endet wegen Hash-Abweichung.

**Änderung:** Getrennte SCTP-Kanäle je Tätigkeit, mit Priorität und Flusskontrolle für Dateien. Ein Test „Datei während
des Spiels“ gehört dazu.

### M6 Die [prüfen]-Marker haben weder Eigentümer noch Gate

**Befund:** Mehrere tragende Annahmen stehen auf [prüfen]: Spielbeschreibungssprache, call-core, SFU-Schwelle,
Plattformtreue. Keine davon hat einen Zeitpunkt, an dem sie spätestens geklärt sein muss.

**Änderung:** Je Marker festlegen, in welchem Durchstich er spätestens geklärt sein muss, und was passiert, wenn das
Ergebnis negativ ist.

---

## Niedrig

- **N1 Magie:** Zufall über das Schema erzeugt erlaubte, aber hässliche oder unlesbare Kombinationen (Kontrast).
  Änderung: Magie läuft durch dieselbe Optik-Prüfung wie der Harness (§5). Sonst wird neu gewürfelt, deterministisch
  aus dem Seed.
- **N2 Ein Renderer und Plattformtreue:** Ein Renderer mit Anton und Tokens zusammen mit „Systemschrift für Fließtext“
  (§7) ist nur im Rahmen vereinbar, nicht auf der Bühne. Das ausdrücklich so festlegen.
- **N3 Business-Theme:** „nur ein anderes Theme“ verdeckt Unterschiede in Texten und Funktionen (siehe M2). Ein
  Flavor-Schema mit Positivliste der Fähigkeiten verwenden.
- **N4 Bindung:** Kontakte und Raum-Einladungen per Push können Druck erzeugen. Einladungen sollten nur ereignisbasiert
  und abbestellbar sein, ohne Zähler „X wartet auf dich“ (`05-bindung/`).
- **N5 Abnahme D1 „ohne eine Zeile Sonderlogik“:** Das lässt sich nicht messen. Ersetzen durch eine CI-Prüfung: keine
  Verzweigung nach `kind` oder `id` außerhalb von `src/cards/*`.

---

## Offene Punkte für `offen.md` (nicht eingetragen, Auftrag erlaubt nur diese Datei)

1. TURN für Spieldaten gratis mit Ratenlimit? (K3)
2. Foto im Fragment: ja oder nein? (K2, bereits offen, blockiert D0)
3. Verdeckte Information: Server-Dealer zulässig, oder nur P2P (Mental Poker / Commit-Reveal)? (K1)
4. Raum für anonyme Nutzer? Kontakte serverseitig? (H6)
5. S-Regeln streichen zugunsten S-Code mit Bibliothek? (H2)
