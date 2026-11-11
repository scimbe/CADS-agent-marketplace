# Offene Fragen an den User

- Tunnel-Pod (cloudflared + Token-Prüfung) im ICC-Namespace `wte586` zum Dienst `z-image` bauen? Nutzt ein anderes Projekt `z-image` mit?
- Rap-Beat-Karte (#227): Urteil nach Anhören.
- Signatur: Mosaik-Hintergrund, lange Links bei Fotokarten, Reihenfolge.
- Umgang mit neckenden Memes.
- Gold-Liste: 142 offene Einträge bewerten (Voraussetzung für gültige Harness-Belohnung).
- Auth: OIDC+PKCE mit Bearer für Web und Apps (Gate-Cookie nur noch für Server-HTML) einverstanden?
- Zusammen bauen: auch im Browser (über den Live-Broker) oder weiter nur in den Apps?
- Statechart: Gate am Ende von S1 (Eigenbau vs. XState) einverstanden?
- Ziel-Domain für „eine Domain“ (heute bunsenbrenner.org zum Teilen, demos-34a13a96… für API, webconference… für Live)?
- Darf eine DB-Replik oder ein Objektspeicher außerhalb on-prem liegen (Cloud-Burst), oder nur zustandslose Teile?
- Claude-Design-Konnektor: braucht erneutes Anmelden (`/design-login`).
- labor-setup.com für Builds/Tests freigeben (nur wenige Kerne, niedrige Priorität)?
- KI-Bild als Kontobild: weiter nur mit Guthaben (Betreiber, #123) oder auch aus den 3 freien Bildern pro Monat? (wrapper#128 lässt es bei „nur mit Guthaben“)
- KI-Bild-Tageslimit (10): sollen fehlgeschlagene Aufträge (Worker, Frist) mitzählen? Abgebucht wird dabei nichts.
- Datei rüber/Live in den Apps: Die App-Hüllen sperren heute das Netz der Seite (iOS Content-Rule `duell-no-network`, Android
  `DuellLink.mayLoad`), `live.js` braucht aber `webconference.bunsenbrenner.org` (`/api/play/*`, WASM-Import, WSS) und die
  Bridge-CORS müsste die App-Herkunft zulassen (iOS `null`, Android `https://appassets.androidplatform.net`). Freigeben, oder
  Live in den Apps nativ über die Hülle (wie `DuellHost.relay`)? Ohne das läuft Datei rüber in den Apps nicht (vor #235 auch nicht).
