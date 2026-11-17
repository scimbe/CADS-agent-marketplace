# Umsetzungsplan „Rechtliches“ für My Daily Idea (MDI)

Stand: 17.11.2026. Grundlage: `CADS-agent-marketplace` `origin/main` 16763f09 (apps/mdi) und `CADS-DEMO-wrapper` `origin/main` 254d4f7. Belege als `Datei:Zeile` auf diesen Ständen. Präfixe: `app/` = `apps/mdi/`, `srv/` = Wrapper-Repo.

> **Keine Rechtsberatung.** Dieser Plan ordnet Pflichten, Code-Befunde und Arbeit. Die Einordnungen sind Arbeitshypothesen. Vor dem ersten Euro Umsatz prüft eine rechtskundige Person alle Texte und Abläufe (WP 18). Stellen mit **⚖️** sind ausdrücklich offen.

---

## 0. Sofort-Befund

- **Die neue App hat keine Rechtsseiten und keinen Link darauf.** Weder „Impressum“ noch „Datenschutz“ kommen in `app/src` vor. Ausnahme ist ein Quiz-Paket (`app/src/engines/quiz/quiz-packs.json:1103`). Die App ist trotzdem schon live, mit Konto, KI über Anthropic und Kurzlinks.
- Die Galerie verlinkt nur das Portal-Impressum (`srv/lib/chrome.mjs:218-219`, bunsenbrenner.org/legal-notice). Ob es MDI abdeckt, ist offen.
- **Folge:** Impressum und Datenschutzerklärung sind schon heute nötig, unabhängig von Einnahmen (§ 5 DDG, Art. 13 DSGVO). WP 1 und WP 2 haben deshalb Vorrang vor allem anderen.

---

## 1. Offene Rechts-PRs: was wiederverwendbar ist und was veraltet

`#83` liegt im **Wrapper** und nicht im Marketplace. Das App-Gegenstück ist Marketplace `#112`. Beide sind überholt:

| PR | Stand | Inhalt |
|---|---|---|
| Wrapper #83 `feat/duell-rechtliches` | OPEN, CONFLICTING | ersetzt durch Wrapper #108 (gleicher Inhalt, auf main nachgezogen) |
| Wrapper #108 `feat/rechtsseiten-ausliefern` | OPEN | `lib/legal-pages.mjs`, Fuß der Kurzlinkseiten, `DUELL_AI_KEEP_DAYS` |
| Marketplace #112 `feat/duell-rechtliches` | OPEN, CONFLICTING | ersetzt durch #178 |
| Marketplace #178 `feat/recht-teil` | OPEN | `apps/duell-web/legal/operator.json`, `src/legal.json` (de/en), `scripts/check-legal.js`, statische Seiten aus `build.js` |

### Wiederverwendbar

1. **Auslieferung** `lib/legal-pages.mjs` (#108):
   - öffentliche Route vor dem Login-Gate,
   - CSP ohne Skript,
   - **nie mit Platzhalter `⟦…⟧`**, stattdessen 503,
   - Test als Release-Gate.

   Das passt zu den Architektur-Regeln: keine stillen Rückfälle. Anzupassen ist nur der Quellpfad. Heute lautet er `apps/duell-web/dist/legal`, künftig wird es das Build-Ergebnis von `apps/mdi`.
2. **Betreiberdaten als Datei mit Platzhaltern und `bestaetigt`-Flags**, dazu `check:release` mit Exit 1 (`operator.json`, `check-legal.js` aus #178). Die Feldliste passt fast unverändert (siehe Abschnitt 5).
3. **Statische Seiten statt Kern-Bytes.** Die Begründung aus #178 gilt auch für apps/mdi: Der Kern hat eine Größengrenze.
4. **Fuß der Kurzlinkseiten** mit Impressum und Datenschutz (`srv/lib/shortlink.mjs`, Texte `imprint`/`privacy` aus #108).
5. **Löschfrist im KI-Kontingent** (`DUELL_AI_KEEP_DAYS`, 365 Tage ab letzter Nutzung, aus #108). Auf main fehlt sie: Dort wird nur nach Menge verdrängt (`srv/lib/duell-ai.mjs:832`).
6. **Textbausteine** aus `legal.json` (#178), soweit sie den Server beschreiben und der noch gilt:
   - Kurzlinks (90 Tage plus 30 Tage Vermerk),
   - Wetter (Open-Meteo, nur Ortsname),
   - Live/WebRTC (IP sichtbar für das Gegenüber),
   - freie Karte, Anthropic (USA), 16+, Guthaben, Melden, Sperren, Strikes, Art. 17/20 DSA, Haftung, Jugendschutz-Notrufnummern,
   - Barrierefreiheitserklärung (Gliederung).

### Veraltet (alte App `apps/duell-web`, im Marketplace nicht mehr auf main)

- **Zielpfade:** Alle Dateien von #112 und #178 liegen unter `apps/duell-web/`. Auf main gibt es nur noch `apps/mdi`, `apps/ios`, `apps/android` und weitere. #178 muss neu auf `apps/mdi` portiert werden, ein Rebase reicht nicht.
- **Gerätespeicher:** Beschrieben ist `daily.v1` mit sessionStorage. Neu sind `mdi.*` im localStorage, die IndexedDB `mdi.media`, die Cache Storage `mdi-parts-v1` und das Cookie `ct_look` (Abschnitt 2.1).
- **KI:**
  - Alter Text: „läuft auf eigener Hardware, geht an keinen KI-Anbieter“.
  - Freie Karte, Bild-Prüfung und Moderation: laut Code Default Anthropic (`srv/lib/duell-llm.mjs:18`).
  - Die übrigen KI-Arten gehen über LiteLLM (`srv/lib/duell-ai.mjs:953-966`). Wohin LiteLLM weiterleitet, steht nicht im Code (siehe U-6).
- **Geld:** „Die Nutzung ist kostenlos“, „Guthaben nicht kaufbar“, Haftungsklausel „für ein kostenloses …“. Das ist mit Abo und Kauf falsch.
- **Alter:** „ab 13 Jahren“ und „keine Verarbeitung auf Einwilligung“ müssen mit Push und dem Abo ab 18 neu bewertet werden.
- **Melden:** „per E-Mail mit Betreff Meldung“. Heute läuft das in der App über `POST /api/duell/report` (`srv/lib/duell-report.mjs`).
- **Kennzeichnung:** „Mit KI erstellt“. Beschlossen ist „(KI)“ bzw. „(KI-unterstützt)“. Im Code steht noch „Mit KI erstellt“ (`app/src/cards/frei/card.js:10`).
- **Fehlende Themen:**
  - Freie Karte 2 (Klärungsdialog, Bau im Hintergrund, Benachrichtigung per Mail und Push, Spiele-Ursprung),
  - Teilerfolg, Nachbessern, Melden,
  - Push (`srv/lib/duell-push.mjs`),
  - Konto-IdPs Google, GitHub und GitLab,
  - Strato.
- **Meldungen:** Der Text sagt „Inhalt 30 Tage“, beschlossen sind 180 Tage. Der Code löscht den Inhalt nach 30 Tagen (`srv/lib/duell-report.mjs:16-17,47`). **Abweichung klären** (U-9).

**Empfehlung:**
- #83 und #112 schließen.
- #108 auf das neue Quellverzeichnis umstellen.
- #178 als Materialquelle in einen neuen PR auf `apps/mdi` überführen.

---

## 2. Bestandsaufnahme (Code)

### 2.1 Speicher auf dem Gerät (§ 25 TDDDG)

| Speicher | Inhalt | Beleg | Löschung | § 25 Abs. 2 Nr. 2 TDDDG? |
|---|---|---|---|---|
| localStorage `mdi.g.<id>` | je Partie: Salz, Hashes, eigener Stand, Merkzettel; höchstens 40 | `app/src/broker/storage.js:5,10-19` | älteste fallen weg (`:19`) | ja, Spielstand einer vom Nutzer gestarteten Partie |
| localStorage `mdi.konto` | Geräte-ID (128 Bit Zufall), Mein Stil, Lesen-Einstellungen, Verknüpfung (Konto/Geräte-Code), offener Anmeldeversuch (16+-Haken, 30 min) | `storage.js:26-31,47-53`; ID erzeugt `app/src/app/runtime.js:56`, gespeichert nur bei Nutzeraktion (`konto-chart.js:26-31`, `runtime.js:207`); Anmeldeversuch `app/src/app/konto.js:54-56` | in der App (Profil löschen) oder über Browserdaten | ja, für KI-Kontingent und Kurzlink-Limit der angeforderten Funktion. Empfehlung: die Geräte-ID erst bei der ersten KI- oder Kurzlink-Nutzung erzeugen und speichern (Datenminimierung) |
| localStorage `mdi.f.<id>` | Feature-Speicher, höchstens 8 KB | `storage.js:32-43,54-55` | | ja |
| localStorage `mdi.ton` | Ton an/aus | `storage.js:44-46` | | ja, Nutzereinstellung |
| localStorage `mdi.home.v1` | Wand (ohne Fotos), gemerkte Karten, Archiv versendeter Links samt **Kurzlink-Löschtoken** | `storage.js:56-63`, `app/src/ui/home/store.js:5,37-44` | „Weg damit“, Rückgängig 6 s (`store.js:6,51-52`) | ja |
| IndexedDB `mdi.media` | eigene Fotos, verkleinert, höchstens 2 MB, **nie hochgeladen** | `app/src/broker/media.js:1-8,41` | `media.js:61-66` | ja, vom Nutzer ausdrücklich gewählt |
| Cache Storage `mdi-parts-v1` | nachgeladener App-Code und Thumbnails (SRI) | `app/src/broker/parts.js:14,43,63` | | ja, technisch für die Auslieferung nötig |
| Cookie `ct_look` | zwei Farben des Login-Looks, `Domain=bunsenbrenner.org`, 1 Tag, Secure, SameSite=Lax; gesetzt direkt vor dem Sprung zum Gate | `app/src/broker/api.js:50-59`, `app/src/main.js:61` | Max-Age 86400 | **grenzwertig**: Komfort, kein Funktionszwang, und es gilt für die ganze Domain. Empfehlung: Farben als Parameter an das Gate geben oder das Cookie auf den Gate-Host begrenzen. Dann ist kein Einwilligungsfall denkbar ⚖️ |
| Cookie `ct_gate_session` | Login-Sitzung (vom Gate/CADS-Tunnel gesetzt, nicht von der App) | `srv/lib/auth.mjs:7,29` | Sitzungsende/Logout | ja, Login ist ausdrücklich gewünscht |
| Keycloak-/IdP-Cookies | auf `auth.…` bzw. Google/GitHub/GitLab | außerhalb der Repos | | ja (Login). Die IdP-Cookies verantworten die IdPs selbst |
| Push-Abo (Service Worker, Subscription) | Endpoint und Schlüssel | Server vorhanden (`srv/lib/duell-push.mjs:1-34`), App hat noch keinen Client (kein `serviceWorker`/`PushManager` in `app/src`) | `unsubscribe`, 30 Tage nach letzter Erneuerung (`duell-push.mjs:20,98`) | ja nach Nr. 2, wenn nur auf ausdrücklichen Tipp und mit Browser-Erlaubnis ⚖️ |

**Drittinhalte im Client:** keine.
- Schriften liegen im Build als `data:` vor (`app/scripts/build.js:134-136`, CSP `font-src data:` `:143`).
- CSP `connect-src 'self'` (`build.js:146`): Der Kern ruft nur die eigene Herkunft auf (`api.js:1-3`).
- Einzige weitere Herkunft ist der abgeschottete Live-Rahmen von `webconference.bunsenbrenner.org` (eigener Dienst; `build.js:112,146`, `app/src/broker/live.js:1-10`). Er lädt dort Code und baut WebRTC auf.

**Ergebnis TDDDG:** Kein Analyse-, Werbe- oder Tracking-Speicher und kein Drittanbieter-Embed. **Ein Einwilligungsbanner ist nicht nötig.** Es reicht ein Abschnitt „Speicher auf deinem Gerät“ in der Datenschutzerklärung. Voraussetzungen:
- `ct_look` wird bereinigt.
- Push wird nur auf ausdrücklichen Tipp angemeldet.
- Für jede künftige Analyse, Werbung oder SDK gilt diese Prüfung neu (WP 3).

### 2.2 Server (Wrapper auf OVH): was, wo, wie lange

| Daten | Ort | Frist laut Code | Beleg |
|---|---|---|---|
| Zugriffe/IP | im Arbeitsspeicher als gesalzener Hash für Limits; IP nur über den Socket, kein `X-Forwarded-For` (TLS-Durchleitung) | nicht gespeichert | `srv/lib/duell.mjs:274,300-310`, `srv/lib/shortlink.mjs:24,32-41` |
| Proxy-/Tunnel-/Docker-Logs | außerhalb der Repos (CADS-Tunnel, Docker) | **unbekannt** (`proxyLogDays` in #178 offen) | U-7 |
| KI-Kontingent | `DUELL_AI_STATE_FILE`, HMAC(Geräte-ID) bzw. HMAC(E-Mail), Zähler; kein Text, keine IP | **keine Zeitfrist auf main**, nur Mengengrenze | `srv/lib/duell-ai.mjs:21-25,832,952,988-998` |
| Profil (Mein Stil, Wand, gemerkte Karten, 16+-/18+-Tag) | `DUELL_PROFILE_DIR`, Datei je HMAC(Konto/Code) | 400 Tage ohne Nutzung; Löschen sofort | `srv/lib/duell-profile.mjs:10-24,85,229` |
| Kurzlinks | `SHORT_DATA_DIR/links.jsonl`: Fragment (Texte, Spitzname), Art, Punkte, Sprache, Hash des Löschtokens, Vorschaubild, Herkunft a/d | **90 Tage** (`SHORT_TTL_DAYS`) | `srv/lib/shortlink.mjs:22-27,194,350`. Die vorgegebenen „24 h“ kommen im Code nicht vor (U-9) |
| Freie Karten / Deck | `deck.json`: Karte, Owner-HMAC, Nutzungszählung, Melder-Tag | private ungenutzte Karte 180 Tage; Melder-Tag 7 Tage; entfernte Karte 183 Tage; Konto-Einträge 400 Tage | `srv/lib/duell-deck.mjs:148-170,612-620` |
| Guthaben | `credit.json`, Pot-HMAC, Buchungen | **keine Frist gefunden** | `srv/lib/duell-credit.mjs:1-27,54,69` |
| Moderation (Strikes, Pausen, Hinweise, Widersprüche) | `mod.json` | Strikes 30 Tage; Hinweise bis Ende der Beschwerdefrist (183 Tage) | `srv/lib/duell-mod.mjs:16-39,61,135` |
| Meldungen | `DUELL_REPORT_DIR/reports.jsonl`; Inhalt nur mit `consent` | Inhalt 30 Tage, Datensatz 30 Tage nach Entscheidung | `srv/lib/duell-report.mjs:12-17,47,78-85`. **Beschluss: 180 Tage** (U-9) |
| Stimmen (Daumen) | `votes.json`, HMAC(Konto, Karte) | **„kept for good“**, also ohne Frist | `srv/lib/duell-stat.mjs:8-13`; Statistik 400 Tage (`:22`) |
| KI-Bilder | `DUELL_BILD_DIR`, Owner-HMAC, kein Prompt | 30 Tage, behalten 365 Tage | `srv/lib/duell-bild.mjs:45-48,229-230,520-537` |
| Push | `push.json`: Mark, Endpoint, Schlüssel, Hash des Löschschlüssels | 30 Tage ab Erneuerung | `srv/lib/duell-push.mjs:18-34,112-131` |
| Konto | Keycloak Realm `ct-demo` (OVH): E-Mail, Name, IdP-Verknüpfung, Sitzungen, ggf. Login-Events mit IP | Realm-Einstellung, **unbekannt** | U-7 |

Wichtig für die Datenschutzerklärung: HMACs von E-Mail oder Geräte-ID sind **Pseudonyme** und bleiben personenbezogene Daten (Art. 4 Nr. 5 DSGVO). Formulierungen wie „anonym“ sind deshalb zu vermeiden.

**Lücke Konto-Löschung:** Es gibt nur `profile/delete` (`app/src/broker/api.js:191-197`, `srv/lib/duell-profile.mjs:5-8`). Für Guthaben, Deck-Owner, Moderation, Stimmen, Bilder, KI-Kontingent und den Keycloak-Nutzer fehlt eine Löschung über alle Dienste. Einen Export gibt es nicht. Die App zeigt die Profilfelder an (`app/src/app/texts.js:32`), das ist eine Teil-Auskunft.

### 2.3 Drittanbieter und Empfänger

| Empfänger | Daten | Rolle (Hypothese) | Beleg |
|---|---|---|---|
| Anthropic PBC (USA), Claude Haiku/Sonnet | Wunschsatz, Klärungsantworten, Kartenart, Sprache, Altersstufe; bei Bildern das generierte Bild zur Prüfung | Auftragsverarbeiter, Drittlandübermittlung | `srv/lib/duell-llm.mjs:1-27`, `duell-bild.mjs:36-37`, `duell-karte.mjs:1-10` |
| LiteLLM-Ziel | Texte der übrigen KI-Arten | **unklar** (eigene Hardware oder Anthropic?) | `srv/lib/duell-ai.mjs:953-966`, U-6 |
| GPU-Worker Bild (`DUELL_BILD_BACKEND=http`) | Prompt (Satz), Stil | eigener Betrieb oder AV, je nach Host | `duell-bild.mjs:50`, U-6 |
| OVH | Hosting Wrapper und Keycloak | Auftragsverarbeiter | Auftrag; #178 `operator.json` `hosting` |
| Strato (no-reply@bunsenbrenner.org) | E-Mail-Adresse, Inhalt der Benachrichtigung | Auftragsverarbeiter | geplant; im Wrapper ist kein SMTP-Code vorhanden. Das Entscheidungslog nennt noch „Mail über Brevo“ als offen (`entscheidungen.md`, 17.11.) |
| Google, GitHub, GitLab (IdPs), haw-gitlab | Login-Vorgang | eigene Verantwortliche | Auftrag |
| Web-Push-Dienste (Google, Mozilla, Apple, ntfy) | Endpoint, Zeit, Größe; Inhalt E2E-verschlüsselt | eigene Verantwortliche/Empfänger | `srv/lib/duell-push.mjs:12-16` |
| Open-Meteo | Ortsname (vom Server, ohne IP des Nutzers) | Empfänger, kaum Personenbezug | `srv/lib/duell-weather.mjs:1-3,35-38` |
| Gegenüber im Live-Spiel, TURN | IP-Adresse (WebRTC) | Nutzer/eigener Dienst | `app/src/broker/live.js:1-10` |
| Messenger (WhatsApp und andere) | laden das Vorschaubild des Kurzlinks | eigene Verantwortliche | `srv/lib/shortlink.mjs:6-8` |
| Fonts, CDN, Analyse, Werbung | – | keine | `app/scripts/build.js:134-147` |
| PayPal.me (in Karten als Link des Nutzers) | kein Datenfluss zum Betreiber | Hinweis in den AGB | `app/src/app/texts.js:17` |

---

## 3. Arbeitspakete

Aufwand: S ≤ 1 Tag, M 2–4 Tage, L ≥ 1 Woche (Umsetzung, ohne Prüfung durch Juristen). **MV** = gehört zur Mindestversion (Abschnitt 6).

### WP 1 Impressum (MV, S)
- **Inhalt:** § 5 Abs. 1 DDG:
  - Name bzw. Firma mit Rechtsform und Vertretungsberechtigten,
  - ladungsfähige Anschrift,
  - E-Mail und ein zweiter schneller Kontaktweg,
  - Register und Nummer,
  - USt-IdNr. (§ 27a UStG) bzw. Wirtschafts-ID, soweit vorhanden.

  Dazu § 18 Abs. 1 MStV (Name und Anschrift). § 18 Abs. 2 MStV (verantwortliche Person) gilt nur bei journalistisch-redaktionellen Angeboten; ob die Community-Karten dazugehören: ⚖️.
- **Weitere Pflichtangaben:**
  - DSA-Kontaktstellen Art. 11/12, mit Sprachen.
  - Hinweis nach § 36 VSBG. Bei höchstens 10 Beschäftigten entfällt die Pflicht (Abs. 3), die Angabe ist trotzdem üblich.
  - Den Link zur OS-Plattform **nicht** mehr aufnehmen: Die ODR-Verordnung ist zum 20.07.2025 aufgehoben (VO (EU) 2024/3228) ⚖️.
- **Dateien:**
  - neu: `apps/mdi/legal/operator.json` (aus #178),
  - neu: `apps/mdi/scripts/check-legal.js`,
  - Seitengenerierung in `apps/mdi/scripts/build.js`,
  - Link in `app/src/ui/home/views.js` und auf der Konto-Seite (`app/src/app/texts.js`),
  - Wrapper: `lib/legal-pages.mjs` (#108), `server.mjs`, Fuß in `lib/shortlink.mjs`.
- **Prüfung:** Release-Gate (Platzhalter → Exit 1 bzw. 503), E2E-Test „höchstens zwei Tipps von jeder Ansicht“.

### WP 2 Datenschutzerklärung, Art. 13/14 DSGVO (MV, M)
- **Gliederung nach Verarbeitung:** Auslieferung/Logs, Gerätespeicher (Tabelle 2.1), Konto/IdPs, Profil-Sync und Geräte-Code, KI-Aktionen und Kontingent, freie Karte (Anthropic), KI-Bilder, Deck/Statistik/Stimmen, Moderation/Meldungen/Beschwerden, Guthaben/Gutscheine, Kurzlinks, Wetter, Live/WebRTC, Push, E-Mail, Zahlung/Abo, Support.
- **Je Verarbeitung:** Zweck, Rechtsgrundlage, Empfänger, Drittland, Frist, Pflicht/Freiwilligkeit.
- **Rechtsgrundlagen:**
  - Art. 6 Abs. 1 lit. b (Vertrag, auch Abo und Guthaben),
  - lit. f (Missbrauchsschutz, Moderation),
  - lit. c (Aufbewahrung nach § 147 AO / § 257 HGB für Rechnungen: 8 bzw. 10 Jahre),
  - ggf. lit. a (Push, falls als Einwilligung gestaltet).
- **Weitere Inhalte:**
  - Art. 8 DSGVO: Einwilligungsalter 16 in Deutschland. Ob lit. b bei 16–17-Jährigen trägt (§§ 106 ff. BGB): ⚖️.
  - Art. 13 Abs. 2 lit. f: automatisierte Entscheidungen (automatische Sperre, Strikes) mit Hinweis auf menschliche Prüfung (`srv/lib/duell-mod.mjs:1-39`).
  - Kinderverständliche Sprache (Art. 12 Abs. 1, ErwG 58).
  - Drittlandübermittlung an Anthropic mit Grundlage DPF (Art. 45) oder SCC (Art. 46 Abs. 2 lit. c) (U-5).
  - Rechte nach Art. 15–21 und 77.
  - Fristen exakt wie im Code. Vorher U-9 klären und den Code angleichen.
- **Dateien:** `apps/mdi/legal/legal.json` (de/en, aus #178 portiert und neu geschrieben), Build und Wrapper wie in WP 1.
- **Prüfung:** Test, dass jede Frist im Text gleich der Default-Konstante im Code ist (Tabelle → Testvektoren).

### WP 3 Speicher-Info statt Banner (MV, S)
- **Entscheidung:** **kein Einwilligungsbanner** (Begründung in 2.1). Stattdessen ein Abschnitt in der Datenschutzerklärung plus eine Zeile „Was diese App auf deinem Gerät speichert“ unter „Mein Regal/Konto“, mit Link.
- **Code:**
  - `ct_look` umstellen (Parameter an das Gate statt Cookie, oder Host-Cookie nur für das Gate). Dateien: `app/src/broker/api.js:50-59`, `app/src/main.js:61`, CADS-Tunnel-Gate.
  - Die Geräte-ID erst bei der ersten KI- oder Kurzlink-Nutzung erzeugen (`app/src/app/runtime.js:56`).
- **Regel für später:** Jede neue Speicherung bzw. jeder neue Drittaufruf braucht eine Zeile in Tabelle 2.1. Ein Buildtest prüft die erlaubten Schlüssel-Präfixe (`mdi.g.`, `mdi.konto`, `mdi.f.`, `mdi.ton`, `mdi.home.v1`, `mdi.media`, `mdi-parts-v1`). Kommt je ein Speicher hinzu, der eine Einwilligung braucht: Ablehnen und Zustimmen gleichwertig auf der ersten Ebene, keine Vorauswahl, kein Nudging (§ 25 Abs. 1 TDDDG, Art. 7 DSGVO, Art. 25 DSA).
- **Aufwand:** S (Text) plus S (Cookie und Geräte-ID).

### WP 4 AGB / Nutzungsbedingungen (MV, M)
- **Basis:** #178 `agb`, neu für den Fall mit Entgelt.
- **Leistungsbeschreibung:** KI-Erstellung als Bemühen um ein Ergebnis gegen eine Häkchenliste, keine Erfolgsgarantie. ⚖️ Ob Werk- oder Dienstvertrag oder digitales Produkt (§§ 327 ff. BGB): Bei Bezahlung gelten die Mängelrechte der §§ 327e ff.
- **Teilerfolg:** „Fehlt ein Punkt → keine Abbuchung; Nachbessern kostenlos (höchstens 3×) oder ‚So behalten (1 Guthaben)‘“.
  - Für „So behalten“ die **negative Beschaffenheitsvereinbarung nach § 327h BGB** sauber gestalten: Vor dem Tipp konkret anzeigen, was fehlt, und eine eigene, ausdrückliche Bestätigung einholen.
  - „Melden statt Nachbessern“ darf bezahlte Mängelrechte nicht ausschließen (§ 327s BGB) ⚖️.
  - Annahme aus dem Entscheidungslog „Meldung → kostenlos“ bestätigen lassen (U-10).
- **Guthaben:**
  - Erwerb (verdient, Gutschein, ggf. gekauft), kein Geldwert, nicht übertragbar, nicht auszahlbar.
  - Verfall nur in den Grenzen der §§ 307, 195 BGB.
  - Rückbuchung bei Sperre einer verdienten Gutschrift (`srv/lib/duell-credit.mjs:11-27`).
  - Bei gekauftem Guthaben: ZAG-Ausnahme „begrenztes Netz“ (§ 2 Abs. 1 Nr. 10 ZAG), weil es nur für eigene Leistungen gilt ⚖️.
- **Abo:** Laufzeit und Verlängerung (§ 309 Nr. 9 BGB: nach der Erstlaufzeit nur unbefristet mit Monatsfrist), Leistungsumfang je Stufe (Pots aus `srv/lib/duell-pots.mjs:1-10`), Preisänderung nur mit Zustimmung.
- **Weitere Inhalte:**
  - Melden, Sperren, Strikes, Beschwerde: Inhalt nach Art. 14 DSA (Moderationsregeln, automatisierte Werkzeuge, Beschwerdeweg). Basis #178 Abschnitt 10.
  - Altersgrenzen 16/18.
  - PayPal.me-Links von Nutzern: kein Zahlungsdienst des Betreibers.
  - Haftung für den entgeltlichen Teil neu.
  - Rechtswahl: Zwingende Verbraucherschutzvorschriften bleiben (Art. 6 Abs. 2 Rom I).
- **Änderungen der AGB:** Bei Bestandskunden mit Abo nur mit Zustimmung (BGH XI ZR 26/20 zur Zustimmungsfiktion) ⚖️.

### WP 5 Widerrufsbelehrung, Formular, Widerrufsfunktion (MV, M)
- **Belehrung** nach Muster Anlage 1 zu Art. 246a § 1 Abs. 2 EGBGB, in zwei Varianten:
  - (a) digitale Inhalte: Guthaben-Pakete, einzelne Karte. Erlöschen nach **§ 356 Abs. 5 BGB**.
  - (b) Dienstleistung / digitale Dienstleistung: Abo. Erlöschen bzw. Wertersatz nach § 356 Abs. 4 und § 357a BGB.
- **Muster-Widerrufsformular** Anlage 2.
- **Vorzeitiges Erlöschen** braucht drei Schritte:
  1. ausdrückliche Zustimmung zum Beginn vor Ablauf der Frist,
  2. Bestätigung der Kenntnis vom Verlust,
  3. Bestätigung auf dauerhaftem Datenträger (§ 312f Abs. 3 BGB).

  Umsetzung: zwei getrennte, nicht vorausgewählte Häkchen im Kauf-Schritt und Text in der Bestätigungsmail (braucht WP 13 Mail).
- **Widerrufsfunktion („Widerrufsbutton“):** Art. 11a Verbraucherrechte-RL i. d. F. RL (EU) 2023/2673, anwendbar seit 19.06.2026. Deutsche Umsetzungsnorm und Gestaltung prüfen ⚖️. Umsetzung wie der Kündigungsbutton (WP 7).
- **Guthaben-Verbrauch:** Wird es sofort verbraucht, ist kein Widerruf möglich. Bei unverbrauchtem Guthaben besteht das Widerrufsrecht ohne Erlöschen fort → anteilige Erstattung. ⚖️
- **Dateien:** `legal.json` (Seite `widerruf`), Kauf-Dialog (neue Ansicht in `app/src/app/konto-chart.js`/`texts.js`), Server-Protokoll der Zustimmung (Zeitpunkt, Version des Textes) beim Zahlungsauftrag.

### WP 6 Button-Lösung (MV, S–M)
- § 312j Abs. 2 und 3 BGB: Unmittelbar vor dem Bestellbutton stehen klar und hervorgehoben:
  - wesentliche Merkmale,
  - Gesamtpreis inkl. USt,
  - Laufzeit,
  - Kündigungsbedingungen,
  - bei Abo der Preis je Periode.

  Der Button heißt eindeutig „zahlungspflichtig bestellen“ bzw. „kostenpflichtig abonnieren“.
- Keine Vorauswahl, keine Ablenkung. Kein Dark Pattern (Art. 25 DSA; UWG; Projektregel „Keine Manipulation“).
- **App-Stores:** Digitale Käufe in iOS/Android-Apps laufen über Apple/Google In-App-Kauf. Deren Kaufdialog ersetzt den eigenen Button, die Vorab-Informationen bleiben Pflicht (U-3).
- **Dateien:** Kauf-Dialog App, Seite „Preise“, Test: Screenshot-E2E prüft Text und Button-Beschriftung.

### WP 7 Kündigungsbutton (MV, wenn Abo; S–M)
- § 312k BGB:
  - Schaltfläche „Verträge hier kündigen“, ständig verfügbar und leicht zugänglich,
  - Bestätigungsseite mit Angaben (Name, Vertrag, Zeitpunkt, E-Mail für die Bestätigung) und Button „jetzt kündigen“,
  - sofortige Eingangsbestätigung in Textform mit Datum und Zeitpunkt der Beendigung.
- Erreichbarkeit ohne Login empfehlen. Die Rechtsprechung zu einer Login-Pflicht ist uneinheitlich ⚖️.
- Wenn ein Merchant-of-Record- oder Store-Abo genutzt wird: dessen Kündigungsweg verlinken. Die eigene Pflicht bleibt bestehen, wenn der Vertrag über die eigene Website zustande kommt ⚖️.
- **Dateien:** öffentliche Route im Wrapper (neu, z. B. `lib/duell-abo.mjs`), App-Link im Fuß und unter Konto, Mail-Bestätigung (WP 13).

### WP 8 Preisangaben (MV, S)
- PAngV § 3: Gesamtpreis inkl. USt. Bei Kleinunternehmern (§ 19 UStG) der Hinweis „ohne USt“. Abo: Preis je Periode und Mindestlaufzeit.
- Informationen nach Art. 246a § 1 EGBGB vor Vertragsschluss.
- Guthaben-Pakete: Preis je Paket. Kein „ab“-Preis ohne Klarheit. Keine künstliche Verknappung.
- **Steuer:** B2C-Leistung digital an EU-Verbraucher mit USt des Kundenlandes (§ 3a Abs. 5 UStG, OSS). Ein Merchant of Record übernimmt das (U-2).
- **Dateien:** Seite `preise` (statisch, aus `operator.json`/`prices.json`), Kauf-Dialog, Konfiguration statt Konstanten (passend zu „Preisregeln per Konfiguration“, Entscheidung 11.11.).

### WP 9 Altersprüfung 16/18 (MV für 18 bei Geld, M)
- **Heute:** Selbstangabe 16+ vor dem Login (`app/src/app/texts.js:12`, `srv/lib/duell-profile.mjs:10-16`) und 18+ (`texts.js:17`, „Wir prüfen die Angabe nicht“; `duell-profile.mjs:226-230`, Fail-closed `duell-karte.mjs:1340`).
- **Plan:**
  - Kauf und Abo nur mit 18+-Angabe. Dazu als Indiz der Zahlungsweg (der Kartenvertrag setzt meist 18 voraus).
  - Verkauf an 16–17-Jährige zunächst gar nicht (Risiko §§ 107, 108, 110 BGB: Rückabwicklung, für Abos greift § 110 nicht).
  - Den Zeitpunkt der Angabe speichern (geschieht bereits).
  - Text „eigene Angabe“ beibehalten, keine Ausweisprüfung.
- ⚖️ Ob die Selbstangabe für „Arcade-Schießen ab 16“ als technisches Mittel nach JMStV reicht: siehe WP 10.

### WP 10 Jugendschutz (M)
- **Einstufung der Inhalte:**
  - Grundstock und Community-Karten ohne Gewalt bzw. Arcade „ohne Gewalt ab 16“ (Entscheidung 17.11.).
  - Prüfen, ob Inhalte für unter 16 entwicklungsbeeinträchtigend sind (§ 5 JMStV). Wenn ja: technisches Mittel oder **Alterskennzeichnung für Jugendschutzprogramme** (`age-de.xml`, § 5 Abs. 3 Nr. 1 JMStV). Eine Checkbox reicht dafür vermutlich nicht ⚖️.
- **§ 24a JuSchG (Vorsorgemaßnahmen):** Die Ausnahme für Anbieter mit weniger als 1 Mio. Nutzern im Inland (Abs. 3) prüfen. Die Moderation erfüllt einen Großteil ohnehin: Melden, Sperren, Krisenhinweise (`srv/lib/duell-bild.mjs:29`, #178 Notrufnummern).
- **Jugendschutzbeauftragter** (§ 7 JMStV) nur bei entwicklungsbeeinträchtigenden Inhalten. Kleinere Anbieter können eine Selbstkontrolle beauftragen ⚖️.
- **Store-Altersfreigaben** (IARC, Apple) konsistent zu den Altersangaben setzen.
- **Dateien:** AGB-Abschnitt, Impressum-Kontakt „Jugendschutz“, ggf. `age-de.xml` im Wrapper-Root.

### WP 11 AI Act Art. 50 (MV, S–M)
- **Art. 50 Abs. 2:** Maschinenlesbare Kennzeichnung synthetischer Inhalte ist im Kern vorhanden: Siegel s2 mit HMAC (`srv/lib/duell-seal.mjs:1-10`), Prüfroute `POST /api/duell/seal` (`duell-report.mjs:5`).
  - Sichtbares Label von „Mit KI erstellt“ (`app/src/cards/frei/card.js:10`) auf „(KI)“ / „(KI-unterstützt)“ umstellen, wie beschlossen.
  - Für KI-Bilder zusätzlich Metadaten (C2PA/IPTC „trainedAlgorithmicMedia“) prüfen.
- **Art. 50 Abs. 1:** Im Klärungsdialog der freien Karte deutlich machen, dass man mit einer KI interagiert.
- **Art. 50 Abs. 4:** Deepfakes kommen nicht vor (keine echten Personen, `duell-karte.mjs:6-10`).
- Ab 02.08.2026 anwendbar. Mögliche Verschiebungen durch den „Digital Omnibus“ prüfen ⚖️.
- Art. 4 (KI-Kompetenz) für alle, die den Dienst betreiben oder moderieren: kurze interne Notiz.
- **Dateien:** `app/src/cards/frei/card.js`, Badge in den Kachel- und Deck-Ansichten, Text in der Datenschutzerklärung und den AGB.

### WP 12 DSA (MV in Grundzügen, M)
- **Art. 11/12:** Kontaktstellen (Impressum).
- **Art. 14:** Moderation in den AGB (WP 4).
- **Art. 16 Melden:** in der App vorhanden. Fehlt noch:
  - ein Meldeweg **ohne Konto** für Dritte (Webformular auf der Kurzlinkseite, E-Mail),
  - eine Eingangsbestätigung,
  - eine Entscheidungsmitteilung an Meldende (Abs. 4, 5).
- **Art. 17 Begründung:** vorhanden (`app/src/broker/api.js:210-237`, `srv/lib/duell-mod.mjs`). Prüfen, ob alle Pflichtfelder geliefert werden: Tatsachen, Automatisierung, Rechtsgrundlage oder AGB-Klausel, Rechtsbehelfe inkl. Art. 21 außergerichtliche Streitbeilegung.
- **Art. 18:** Meldung an Strafverfolger bei Gefahr für Leib oder Leben. Interner Ablauf mit Ansprechpartner.
- **Art. 20 Beschwerde:** vorhanden (183 Tage, `duell-mod.mjs:26`). Für Klein- und Kleinstunternehmen ist das nach Art. 19 freiwillig, behalten.
- **Art. 23:** Missbrauchsmaßnahmen sind dokumentiert (Strikes).
- **Art. 15/24 Transparenz:** Kleinst- und Kleinunternehmen sind weitgehend befreit (Art. 15 Abs. 2, Art. 19). Ob Art. 24 Abs. 2 (Nutzerzahlen) trotzdem gilt: ⚖️. Vorsorglich eine interne Kennzahl je Halbjahr aus `GET /api/duell/metrics` (`duell-report.mjs:8`).
- **Einordnung:** Kurzlinks sind Hosting (Art. 6), das Community-Deck ist eine Online-Plattform (öffentliche Verbreitung) ⚖️.

### WP 13 AV-Verträge und Drittlandübermittlung (MV, S Arbeit / Konto-Aktion des Users)
- **Anthropic:** Commercial Terms plus Data Processing Addendum (enthält SCC) im Anthropic-Konto akzeptieren. Prüfen, ob Anthropic PBC unter dem EU-US Data Privacy Framework zertifiziert ist (dataprivacyframework.gov). Aufbewahrung und Training laut aktuellem DPA dokumentieren. Transfer Impact Assessment kurz.
- **OVH:** AVV nach Art. 28 im OVH-Kundenkonto. Standort des Servers (EU) dokumentieren.
- **Strato:** AVV im Strato-Kundenkonto (für den Versand von no-reply@). Brevo nur, wenn doch gewählt.
- **Zahlungsanbieter:** meist eigener Verantwortlicher, nicht AV. Rolle je Anbieter dokumentieren.
- **GPU-Worker und LiteLLM-Ziel:** Betreiber und Standort klären. Bei fremdem Betrieb ein AVV (U-6).
- **IdPs, Push-Dienste, Messenger:** keine AVV, eigene Verantwortliche. Nur in der Datenschutzerklärung nennen.
- **Ablage:** Verträge außerhalb der Repos. Im Repo nur eine Liste „Vertrag vorhanden: ja/Datum“ (Feld `bestaetigt.*` in `operator.json`).

### WP 14 VVT, TOMs, Löschkonzept, DSFA-Schwelle (MV, M)
- **VVT (Art. 30):** eine Zeile je Verarbeitung aus WP 2. Die Ausnahme für unter 250 Beschäftigte greift nicht, weil die Verarbeitung nicht nur gelegentlich erfolgt.
- **TOMs (Art. 32):** aus dem Code ableiten:
  - CSP strikt (`app/scripts/build.js:138-147`),
  - HMAC-Pseudonyme, Dateien `0600`, atomare Schreibvorgänge,
  - keine IP auf der Platte,
  - Gate-Prüfung serverseitig (`srv/lib/auth.mjs:1-11`), OIDC-Härtung (`srv/lib/oidc.mjs:1-10`),
  - Admin-Bearer-Token, Backups, Zugriffskreis, Rollback-Container.
- **Löschkonzept:** Tabelle 2.2 als Soll mit **festen Fristen in Code und Text**. Lücken schließen:
  - KI-Kontingent zeitlich (#108 übernehmen),
  - `votes.json` mit Frist,
  - `credit.json` mit Frist nach Kontoende,
  - Meldungen auf die beschlossenen 180 Tage oder Beschluss anpassen,
  - Aufträge der freien Karte 2: 180 Tage,
  - Keycloak-Events und Sitzungen: Frist setzen,
  - Proxy- und Docker-Logs: Frist setzen,
  - Rechnungen: 10 bzw. 8 Jahre (lit. c).
- **DSFA-Schwellwertprüfung (Art. 35):** Minderjährige, KI, automatisierte Moderation und Drittland sprechen für eine DSFA. Wichtig: Ist eine DSFA Pflicht, ist auch ein **Datenschutzbeauftragter** nötig (§ 38 Abs. 1 S. 2 BDSG) (U-4) ⚖️.
- **Dateien:** `docs/greenfield/06-plan/recht/` bzw. außerhalb der Repos. Der Code-Teil geht in Wrapper-PRs je Modul.

### WP 15 Betroffenenrechte und Konto-Löschung (MV: Löschen; Export M; gesamt L)
- **Konto löschen** als ein Weg über alle Dienste:
  - Server-Route `POST /api/duell/account/delete` (neu, Wrapper), ruft `profile.delete`, Credit, Deck-Owner (Karten privat entfernen oder anonymisieren), Mod, Votes, Bild, KI-Pot und Push auf,
  - danach Löschen des Keycloak-Nutzers (Admin-API, Realm `ct-demo`),
  - in der App: Bestätigung, Hinweis auf Gerätedaten („Weg damit“), Löschen von IndexedDB und localStorage auf Wunsch.
- **Auskunft und Export (Art. 15/20):** JSON-Export aus denselben Modulen. Bis dahin manueller Prozess per E-Mail mit Identifikation über Konto-Login. Ohne Konto über Geräte-ID oder Kurzlink-Token (Art. 11 Abs. 2).
- **Löschen ohne Konto:** Kurzlink über Token (vorhanden, `api.js:270-276`), Profil über Code (vorhanden), Gerätedaten lokal.
- **Fristen:** 1 Monat (Art. 12 Abs. 3). Interne Vorlage.
- **Prüfung:** E2E-Test „Konto löschen → alle Stores leer für diesen Pot-Schlüssel“.

### WP 16 Zahlungsanbieter (offen; L inkl. Integration)
- **Optionen:**
  - (a) **Merchant of Record** (z. B. Paddle, Lemon Squeezy): übernimmt USt/OSS, Rechnungen, oft Widerruf und Kündigung. Die AGB des MoR gelten zusätzlich.
  - (b) Zahlungsdienst (z. B. Stripe, Mollie): Pflichten und USt beim Betreiber.
  - (c) In-App-Kauf in iOS/Android-Apps ist für digitale Güter Pflicht.
- **Kriterien:** Rechtsform, USt-Status, Aufwand, Gebühren, Kündigungsbutton-Unterstützung, EU-Datenverarbeitung.
- **Technik:** Webhook → Guthaben/Abo-Pot (`srv/lib/duell-credit.mjs` `aboStatus` ist nur eine Schnittstelle, `:23,48`). Kein Kartendatum auf dem eigenen Server.
- Entscheidung durch den User (U-2), danach WP 5–8 final.

### WP 17 Barrierefreiheit (S Text, Umsetzung laufend)
- Das BFSG gilt seit 28.06.2025 für Dienstleistungen im elektronischen Geschäftsverkehr (§ 1 Abs. 3 Nr. 5). Mit Abo oder Kauf ist MDI ein solcher Dienst.
- **Kleinstunternehmen** (unter 10 Beschäftigte und höchstens 2 Mio. € Umsatz/Bilanz) sind für Dienstleistungen ausgenommen (§ 3 Abs. 3 BFSG) ⚖️.
- Unabhängig davon die freiwillige Erklärung aus #178 portieren und aktualisieren. Kaufweg, Kündigungsbutton und Rechtsseiten nach WCAG 2.1 AA bauen. Das ist billig, weil es neue Ansichten sind.

### WP 18 Abschluss: Prüfung durch eine rechtskundige Person (MV, Termin)
- **Paket für die Prüfung:**
  - Impressum, Datenschutzerklärung, AGB, Widerruf, Preise, Kauf- und Kündigungsdialog (Screenshots),
  - Tabelle 2.1/2.2, VVT, DSFA-Schwelle,
  - Liste aller ⚖️-Fragen dieses Plans.
- **Ergebnis:** schriftliche Freigabe. Erst danach die Zahlungsfunktion freischalten (Schalter serverseitig, Default aus).

---

## 4. Reihenfolge

1. **Sofort, ohne Einnahmen:**
   - WP 1 Impressum, WP 2 Datenschutz (Ist-Stand), WP 3 (`ct_look`, Geräte-ID, Info-Abschnitt),
   - WP 11 Label „(KI)“,
   - #108 auf apps/mdi umstellen, Rechtslinks in App und Kurzlinkseiten.
   - Löschlücken in WP 14 (KI-Pot, Votes, Credit, Meldungen) im Code schließen.
2. **Verträge und Dokumentation:** WP 13 (AVV/DPA), WP 14 (VVT, TOMs, DSFA-Schwelle, ggf. DSB), WP 15 Konto-Löschung.
3. **Entscheidung Geld:** WP 16 (Anbieter, Preise, Rechtsform, USt) durch den User.
4. **Kaufstrecke:** WP 8 Preise → WP 6 Button → WP 5 Widerruf und Widerrufsfunktion → WP 7 Kündigung (bei Abo) → WP 9 18+ → WP 4 AGB (entgeltlich) → WP 2 Nachtrag (Zahlung, Mail).
5. **Parallel:** WP 10 Jugendschutz, WP 12 DSA-Lücken (Meldeweg ohne Konto, Art. 18), WP 17 Barrierefreiheit.
6. **WP 18** Prüfung durch eine rechtskundige Person → Freischaltung.

---

## 5. Was nur der User liefern bzw. entscheiden kann

| # | Punkt | Wofür |
|---|---|---|
| U-1 | Name/Firma mit Rechtsform und Vertretung, **ladungsfähige Anschrift**, E-Mail, zweiter Kontaktweg, ggf. USt-IdNr./Wirtschafts-ID, Register; verantwortliche Person nach § 18 MStV | WP 1, `operator.json` |
| U-2 | **Rechtsform** (Einzelunternehmen, UG, Hochschule ausgeschlossen?), USt-Status (Kleinunternehmer ja/nein), **Zahlungsanbieter** (MoR/Stripe/In-App), **Preise** (Abo-Stufen, Guthaben-Pakete, Laufzeit) | WP 5–8, 16 |
| U-3 | Sollen die iOS/Android-Apps kaufen können (In-App-Kauf, Store-Gebühren), oder Kauf nur im Web? | WP 6, 16 |
| U-4 | **Datenschutzbeauftragter nötig?** Nein, wenn weniger als 20 Personen ständig Daten verarbeiten **und** keine DSFA-Pflicht besteht. Sonst ja, auch extern | WP 14 |
| U-5 | **AV-Verträge abschließen** (Konto-Aktionen): Anthropic DPA, OVH AVV, Strato AVV; ggf. Zahlungsanbieter. Entscheiden: DPF oder SCC als Grundlage für Anthropic | WP 13 |
| U-6 | Wohin geht LiteLLM, wer betreibt den GPU-Bild-Worker (eigene oder fremde Hardware, Standort)? | WP 2, 13 |
| U-7 | Log-Fristen: CADS-Tunnel/Proxy, Docker, Keycloak-Events und -Sitzungen im Realm `ct-demo` | WP 2, 14 |
| U-8 | Mail-Dienst endgültig: Strato (Auftrag) oder Brevo (laut Entscheidungslog noch offen) | WP 5, 7, 13 |
| U-9 | Fristen festlegen, wo Code und Beschluss abweichen: Meldungen 30 Tage (Code) oder 180 Tage (Beschluss); Kurzlinks „24 h“ (Vorgabe) gegenüber 90 Tagen (einziger Wert im Code); Stimmen ohne Frist; Guthaben nach Kontoende | WP 2, 14 |
| U-10 | Bestätigen: Kostet eine Karte nach „Melden“ nichts? Verkauf von Guthaben auch an 16–17-Jährige: nein (Empfehlung)? | WP 4, 9 |
| U-11 | **Wer prüft rechtlich** (Anwalt/Anwältin IT-Recht, Datenschutz-Berater, Hochschul-Justiziariat ausgeschlossen?) und bis wann? | WP 18 |

---

## 6. Mindestversion: ohne sie keine Einnahmen

Alle Punkte erfüllt **und** von der rechtskundigen Person freigegeben (WP 18). Bis dahin bleibt der Zahlungsschalter serverseitig aus.

1. Impressum und DSA-Kontaktstelle, aus der App mit höchstens zwei Tipps erreichbar, ohne Platzhalter (WP 1).
2. Datenschutzerklärung inkl. Anthropic/USA mit Grundlage, Zahlung, Mail und Fristen gleich dem Code (WP 2, WP 14 Löschlücken).
3. Speicher-Info statt Banner, `ct_look` bereinigt (WP 3).
4. AGB für den entgeltlichen Dienst: Guthaben, Abo, Teilerfolg nach § 327h, Nachbessern/Melden, Sperren (WP 4).
5. Widerrufsbelehrung und Formular, Zustimmung zum vorzeitigen Erlöschen mit Bestätigungsmail, Widerrufsfunktion (WP 5).
6. Button-Lösung und Preisangaben (WP 6, WP 8). Kündigungsbutton, sobald ein Abo angeboten wird (WP 7).
7. Kauf nur mit 18+-Angabe (WP 9).
8. Kennzeichnung „(KI)“/„(KI-unterstützt)“ sichtbar, Siegel maschinenlesbar (WP 11).
9. Meldeweg auch ohne Konto, Begründungen vollständig (WP 12, Teil).
10. AVV/DPA mit Anthropic, OVH, Strato und Vertrag mit dem Zahlungsanbieter. VVT, TOMs, DSFA-Schwellwertprüfung, DSB-Frage beantwortet (WP 13, 14).
11. Konto-Löschung über alle Dienste. Auskunft zunächst manuell (WP 15).

Nicht in der Mindestversion, aber zeitnah:
- Self-Service-Export (WP 15),
- `age-de.xml` / Jugendschutz-Feinschliff (WP 10), sofern die Prüfung nichts anderes sagt,
- Barrierefreiheitserklärung (WP 17),
- Transparenzzahlen (WP 12).
