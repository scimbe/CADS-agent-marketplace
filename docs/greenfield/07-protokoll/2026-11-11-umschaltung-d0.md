# Umschaltung /duell auf D0 (2026-11-11)

Auftrag des Users: „1  ja und 2 du kannst die alte komplett deaktivieren , es muss keinen neuen Pfad geben der alte kann weg“

## Ausgerollt
- **Webkonferenz** (ssh-united, Container `cads-webconference-demo-webconference-demo-origin-1`): PR scimbe/CADS-webconference-demo#156 gemergt (4ab9406), nur der Origin-Container neu gebaut. `/play-frame.html` liefert 200, Inhalt gleich dem Build aus apps/mdi, `frame-ancestors` nur App-Ursprünge. Der Rest der Webkonferenz bleibt `X-Frame-Options: DENY`.
  - Rollback: Image-Tag `cads-webconference-demo-webconference-demo-origin:pre-pf-202611111701`, Caddyfile-Kopie `Caddyfile.selfservice.bak-pf-202611111701`.
  - CI: unit grün; e2e zweimal an DNS des GitHub-Runners gescheitert (`Temporary failure resolving azure.archive.ubuntu.com`), dritter Lauf 5/5 grün.
- **App** (ssh-united, Container `demos-wrapper`): Image `cads-demos-wrapper:d0-202611111702` = laufendes Image, nur `apps/duell-web/dist` ersetzt durch die D0-Seite (sha256 729ba231…). Server-Code und Volumes unverändert.
  - `/duell` = D0; `/duell/business/`, `/duell/protokoll`, `/duell/parts/*` = 404.
  - Rollback: `docker stop demos-wrapper && docker rm demos-wrapper && docker rename demos-wrapper-pre-d0-202611111702 demos-wrapper && docker start demos-wrapper` (Tag `cads-demos-wrapper:pre-d0-202611111702`).
- **main**: D0 gemergt (PR #236, 45e33e9). Git-Tag `pre-legacy-removal` auf 61cd02e (Stand davor).

## Nachweis
- Öffentlich `/duell` sha256 = Release.
- Live-Partie „Mein Bote lügt“ über die echte Bridge, zwei Tabs im eingebauten Browser: Einladung → Annahme → 5 Ansagen → 3× glauben, 2× aufdecken → beide Seiten „Bote 8 – Prüfer 12“. Der Prüfer sah bis zum Aufdecken nur „?“.
- Einschränkung: zwei Tabs eines Browsers, nicht zwei Geräte in verschiedenen Netzen (CGNAT-Fall noch offen).

## Offen
- S16: Altcode aus main entfernen (PR in Arbeit).
- PRs für die alte App (#221, #234, #235; Wrapper #128, #129; Bridge #155) sind durch die Abschaltung überholt – schließen oder auf den Neuentwurf übertragen (Entscheidung User).
