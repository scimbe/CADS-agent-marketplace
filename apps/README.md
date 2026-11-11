# Mobile-Apps (Android und iOS)

Verbraucher-Apps fuer den CADS-Marktplatz. Beide Apps nutzen denselben Rust-Kern (`crates/mobile-core`, UniFFI):

| Funktion | Wo |
|---|---|
| Signierte Prompt-Vorlagen auf dem Geraet pruefen (Signatur, Ablauf, Herkunft der Komponenten) und ausfuellen | `verify_prompt_template`, `render_prompt_template` (nutzt `manifest-core`, keine zweite Implementierung) |
| Installationen speichern, anpassen, abrufen | `InstallationsClient` gegen `/me/installations` der CADS-Tunnel-Control-Plane (Bearer-Token, `If-Match`-Revision, Fehler `Conflict`, `NotFound`, `Rejected422{path}`, `Unauthorized`) |
| Wasm-Installationen auf dem Geraet ausfuehren | `run_wasm_installation(component, spec_json, args, work_dir)` ueber `installer-engine::wasm_runtime` (Cargo-Feature `wasm`, von den Build-Skripten aktiviert; wasmtime-Komponentenmodell, WASI 0.2, Grenzen und Rechte aus der signierten `WasmSpec`). Pulley-Interpreter auf iOS (kein JIT erlaubt), Cranelift-JIT auf Android. Ohne das Feature liefert `WasmExecutor` einen Stub, der ablehnt. Test mit den WAT-Gaesten des Repos: `cargo test -p mobile-core --features wasm` (benoetigt Rust >= 1.97) |

Beide Apps heissen **My Daily Idea** (Paket und Bundle-ID bleiben `org.bunsenbrenner.cads`, sonst bricht `assetlinks.json`/Universal Link). Der Bildschirm gehoert der gebuendelten Seite `duell/index.html`; es gibt keine gleichrangige Tab-Leiste. Bis der neue Client `apps/mdi` eigene native Hosts bekommt (Slice D1b), ist das der neutrale Platzhalter `apps/native-placeholder/duell/index.html` (Marke, Knopf Mehr, Anzeige eines empfangenen Links; kein Spiel, keine Karten). Der Knopf **Mehr** (in der Seite, nur sichtbar, wenn die Huelle `DuellHost.more` anbietet) oeffnet die nativen Bereiche: **Vorlagen**, **Vorlage-Detail** (Vertrauensanzeige, Formular, Vorschau, Speichern) und **Meine Installationen** (Liste, Detail/Bearbeiten, Duplizieren, Loeschen, Konfliktbehandlung bei 409: neu laden oder ueberschreiben). Texte auf Deutsch und Englisch (Systemsprache). Die Beispielvorlagen werden direkt aus `manifests/prompt-templates/` gebuendelt. Marke: Gelb `#FFD400`, Tinte `#111111`, Rot `#FF3B1D`, Papier `#FFF6DC`; Icon (abreissbares Kalenderblatt mit Gluehbirne im Zackenstern) als Master `apps/assets/icon-master.svg`, Android als Vektor in `res/drawable/ic_launcher_*.xml` (adaptiv, plus Monochrom fuer Themed Icons), iOS als 1024-px-PNG im Asset-Katalog.

## Anmeldung (OIDC)

Authorization Code + PKCE (S256) im System-Browser, oeffentlicher Client ohne Secret, gegen das bestehende Keycloak-Realm:

* iOS: `ASWebAuthenticationSession` (ephemere Sitzung, es bleibt kein Keycloak-SSO-Cookie in Safari), Redirect `org.bunsenbrenner.cads:/oauth2redirect` (kein `CFBundleURLTypes` noetig); Tokens im Keychain (`WhenUnlockedThisDeviceOnly`, kein iCloud-Sync). Beim ersten Start nach einer Installation wird der Keychain-Eintrag verworfen; ein fehlgeschlagenes Speichern gilt nicht als angemeldet; Token-Refreshes laufen seriell.
* Android: AppAuth (Custom Tabs) mit **App-Link-Redirect** `https://bunsenbrenner.org/app/oauth2redirect` (verifiziertes `https`, kein Custom-Scheme, das eine andere App beanspruchen koennte); Zustand in `EncryptedSharedPreferences` (Schluessel im Android Keystore), von Backup und Geraete-Transfer ausgeschlossen.
* **Abmelden:** der lokale Token-Zustand wird sofort geloescht, das Refresh-Token wird per RFC 7009 am Keycloak-Endpunkt `/protocol/openid-connect/revoke` widerrufen (Best effort im Hintergrund); Android beendet zusaetzlich die Browser-Sitzung per `end_session` (ID-Token-Hint), iOS nutzt dafuer die ephemere Sitzung.
* Die Apps senden das Access-Token als `Authorization: Bearer`; die Control-Plane nimmt Bearer-Anfragen vom CSRF-Schutz aus, Cookies werden nie verwendet.
* **DPoP (RFC 9449) fuer das Refresh-Token:** jede Anfrage an Token- und Revoke-Endpunkt traegt einen DPoP-Beweis eines Geraeteschluessels (P-256), der bei jeder Anmeldung neu entsteht und beim Abmelden geloescht wird: iOS Secure Enclave (sonst Keychain `WhenUnlockedThisDeviceOnly`), Android Keystore (StrongBox, wo vorhanden; nicht exportierbar). Keycloak bindet per Client-Policy nur das Refresh-Token an diesen Schluessel (`allow-only-refresh-token-binding`); das Access-Token bleibt Bearer. Ein kopiertes Refresh-Token ist ohne den Schluessel wertlos (RFC 9700 §2.2.2), ohne die realmweite Rotation, die alle anderen Clients des Realms traefe. Code: `apps/ios/App/Auth/DPoP.swift`, `apps/android/.../auth/DPoP.kt`, Tests `DPoPTests`/`DPoPTest`.
* **My Daily Idea (Konto-Bruecke v1):** die Seite bekommt nie ein Token. `DuellHost.account(req)` (iOS, `WKScriptMessageHandlerWithReply` „account“) bzw. `window.MdiAccount` (Android, `WebViewCompat.addWebMessageListener`, nur fuer die Herkunft `https://appassets.androidplatform.net` und nur im Hauptrahmen) nehmen `state`, `login`, `logout` und `api` an; bei `api` ruft die Huelle `https://demos-34a13a96.bunsenbrenner.org` selbst mit `Authorization: Bearer` auf (**exakte** Liste von 12 Aufrufen, aus `bridge-account-v1.json` mit `apps/gen-account-routes.py` fuer beide Plattformen erzeugt – `AccountRoutes.generated.swift`, `AccountRoutes.kt`; keine Muster, keine Praefixe; keine Cookies, keine Weiterleitungen, Antwort hoechstens 1 MiB, beim Lesen begrenzt). `login` nur direkt nach einer Beruehrung der Seite (nativer Gesten-Erkenner, nicht durch Skript ausloesbar), nie zweimal gleichzeitig und hoechstens alle 3 s.
* **Ein Token je Resource-Server:** die App fordert bei der Anmeldung die optionalen Scopes `ct-api` und `mdi-api` an und holt danach per Refresh mit `scope=openid ct-api` bzw. `scope=openid mdi-api` je ein eingeengtes Access-Token (Keycloak verkleinert dabei nur das Access-Token). Das Token der Control-Plane (`aud: ct-api`) liegt fuer den Rust-Kern im Keychain/AuthState, das des Wrappers (`aud: mydailyidea-api`) nur im Speicher. Ein an einer Stelle abgegriffenes Token gilt an der anderen nicht (Control-Plane `CT_OIDC_CLIENT_AUD`, CADS-Tunnel#899; Wrapper `DEMO_OIDC_AUDIENCE`). Weist Keycloak einen DPoP-Beweis ab (`invalid_dpop_proof`, meist eine falsch gehende Geraeteuhr) oder verlangt eine Nonce, bleiben die Tokens erhalten; nur ein ungueltiger Grant meldet ab. Eine zweite Anmeldung bei bestehender ist ausgeschlossen (sie ersetzte den Geraeteschluessel). Der Wrapper loest Bearer und Gate-Cookie zur selben Identitaet auf (CADS-DEMO-wrapper `lib/auth.mjs`, `lib/oidc.mjs`). Gegenstueck in der Seite: `apps/mdi/src/broker/native.js`. Tests: `AccountRouteTests`/`AccountRouteTest`, `apps/mdi/test/native.test.js`, `konto.e2e.js` (App-Huelle).
* Der Rust-Kern speichert kein Token; er fragt es pro Anfrage ueber `TokenProvider` ab. Es wird nichts geloggt, TLS wird strikt geprueft (rustls, gebuendelte Wurzelzertifikate; `http` nur fuer localhost), Redirects werden nicht verfolgt.

Konfiguration (Standardwerte, ueberschreibbar): API `https://bunsenbrenner.org`, Issuer `https://auth.bunsenbrenner.org/realms/ct-demo`, Client `cads-mobile`, Redirect iOS `org.bunsenbrenner.cads:/oauth2redirect`, Android `https://bunsenbrenner.org/app/oauth2redirect`.
Android: `gradle -PcadsApiBase=... -PcadsIssuer=... -PcadsClientId=... -PcadsRedirectUri=...`; iOS: Info.plist-Schluessel `CadsApiBase`, `CadsOidcIssuer`, `CadsOidcClientId` (in `apps/ios/project.yml`).
Der Issuer-Host `auth.bunsenbrenner.org` ist gegen den echten Keycloak geprueft: `/.well-known/openid-configuration` liefert genau diesen `issuer`, und der Client `cads-mobile` existiert mit dem App-Link-Redirect (Autorisierungsanfrage mit diesem Redirect wird dorthin zurueckgeleitet, ein fremder Redirect nicht).

### Deployment-Schritt fuer den Betreiber (Realm wurde nicht veraendert)

Das Realm `ct-demo` (`docker/deploy/keycloak/ct-demo-realm.json` in CADS-Tunnel) enthaelt keinen oeffentlichen Client mit Standard-Flow (`ct-portal` ist vertraulich, `ct-agent-cli` erlaubt nur den Device-Flow). Anzulegen ist dieser Client:

```json
{
  "clientId": "cads-mobile",
  "name": "CADS Marktplatz (Android/iOS)",
  "description": "Oeffentlicher Client der Mobile-Apps: Authorization Code + PKCE (S256) im System-Browser, kein Client-Secret.",
  "protocol": "openid-connect",
  "enabled": true,
  "publicClient": true,
  "standardFlowEnabled": true,
  "implicitFlowEnabled": false,
  "directAccessGrantsEnabled": false,
  "serviceAccountsEnabled": false,
  "fullScopeAllowed": false,
  "redirectUris": [
    "https://bunsenbrenner.org/app/oauth2redirect",
    "org.bunsenbrenner.cads:/oauth2redirect"
  ],
  "webOrigins": [],
  "attributes": {
    "pkce.code.challenge.method": "S256",
    "access.token.lifespan": "300",
    "post.logout.redirect.uris": "https://bunsenbrenner.org/app/oauth2redirect"
  },
  "defaultClientScopes": ["email", "profile"],
  "optionalClientScopes": ["offline_access"],
  "protocolMappers": [
    {
      "name": "sub",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usermodel-property-mapper",
      "consentRequired": false,
      "config": {
        "user.attribute": "id",
        "claim.name": "sub",
        "jsonType.label": "String",
        "access.token.claim": "true",
        "id.token.claim": "false",
        "userinfo.token.claim": "false"
      }
    }
  ]
}
```

Erlaeuterung: `fullScopeAllowed=false` mit ausdruecklichen Scopes (`email`, `profile`; `offline_access` nur optional, die Apps fordern es an) – die Control-Plane braucht nur `sub` und `iss`, es sind keine Rollen-Mappings noetig. Das Access-Token lebt 5 Minuten. Redirect-URIs sind exakt, ohne Wildcards; PKCE S256 ist erzwungen.

**Refresh-Token-Schutz:** statt der realmweiten Rotation (`revokeRefreshToken`, gilt fuer alle Clients des Realms) bindet eine Client-Policy die Refresh-Tokens von `cads-mobile` per DPoP an den Geraeteschluessel; dazu zwei optionale Client-Scopes `ct-api` und `mdi-api` mit je einem Audience-Mapper (ein Token je Resource-Server). Schritte, Pruefung und Rueckweg: `mdi-greenfield/docs/greenfield/07-protokoll/2026-11-11-oidc-apps.md` (Keycloak-Aenderungen nur mit Freigabe und Vorwarnung).

### Android App Links (Betreiber)

Die Domain `bunsenbrenner.org` muss unter `https://bunsenbrenner.org/.well-known/assetlinks.json` (ohne Redirect, `Content-Type: application/json`) die App freigeben, sonst oeffnet Android den Redirect nicht in der App:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "org.bunsenbrenner.cads",
    "sha256_cert_fingerprints": ["<SHA-256 des Signaturzertifikats der Release-App>"]
  }
}]
```

Achtung: die Relation schreibt sich mit **Punkt** (`common.handle_all_urls`). Stand 2026-11-11 liefert `https://bunsenbrenner.org/.well-known/assetlinks.json` noch die Schraegstrich-Form; korrigiert in scimbe/CADS-Tunnel#898 (Control-Plane). Bis das deployt ist, verifiziert Android den Login-Redirect nicht und die Anmeldung in der Android-App kommt nicht in die App zurueck. Mit Schraegstrich verwirft Android die ganze Datei; pruefen mit `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://bunsenbrenner.org&relation=delegate_permission/common.handle_all_urls` (muss `statements` liefern, kein `ERROR_CODE_MALFORMED_CONTENT`).

Der Pfad `/app/oauth2redirect` muss serverseitig nicht existieren oder darf eine leere Seite liefern; die App faengt ihn ab. In die `assetlinks.json` der Produktion gehoert **nur** der Fingerabdruck des Release-Zertifikats; ein Debug-Zertifikat dort liesse jeden mit dem (weitergegebenen) Debug-Schluessel signierten Build den Login-Redirect empfangen. Debug-Builds testen den Login gegen einen eigenen Host (`-PcadsRedirectUri=...`) mit eigener `assetlinks.json`.

Hinweise: Der `sub`-Mapper entspricht dem von `ct-agent-cli`, weil die Control-Plane das Konto ueber `sub` und `iss` aufloest. Erzwingt der Betreiber `CT_OIDC_ACCESS_AUD`, braucht der Client zusaetzlich einen Audience-Mapper fuer diesen Wert. Ohne diesen Client scheitert die Anmeldung mit `invalid_client`; die Vorlagen-Funktionen (pruefen, ausfuellen) laufen auch ohne Anmeldung.

## My Daily Idea (Android)

Die App startet in der Seite `duell/index.html` der Assets. Gradle nimmt dafuer `apps/native-placeholder/` als zusaetzliches Asset-Verzeichnis (`sourceSets["main"].assets.srcDir`); es wird nichts aus einem anderen Build kopiert.

* **Navigation:** die WebView fuellt den ganzen Bildschirm (Systemleisten ausgeblendet, per Wischen vom Rand sichtbar). Der Knopf "Mehr" der Seite ruft `DuellHost.more()` auf und zeigt eine Auswahl Vorlagen / Meine Installationen; dort fuehrt Zurueck (Taste oder Knopf oben) in die Seite. In der Seite geht Zurueck in der Seitenhistorie bzw. beendet die App.
* **WebView:** laedt nur ueber `WebViewAssetLoader` (`https://appassets.androidplatform.net/assets/duell/index.html`), JavaScript an, kein Datei-/Content-Zugriff, kein Mixed Content. Unterressourcen sind auf diese Assets und den Config-API-Host (`-PcadsDuellApiBase`, Standard `https://demos-34a13a96.bunsenbrenner.org`) beschraenkt; alle anderen Links oeffnen im System-Browser. Die Config-API muss CORS fuer den Origin `https://appassets.androidplatform.net` erlauben, sonst laeuft die Seite mit ihrer lokalen Rueckfalllogik.
* **Links:** `https://bunsenbrenner.org/duell#c=<base64url>` (Herausforderung, geteiltes Werk) **und** `#i=<id>` (Einladung zur Idee eines Tages, `[a-z0-9-]{1,32}`) sind App-Links (autoVerify) und oeffnen die Seite; der Betreiber traegt das Paket (gleicher Fingerabdruck wie beim Login-Link) in `/.well-known/assetlinks.json` ein. `DuellLink.FRAGMENT` laesst nur diese beiden Formen an die Seite (`c=` max. 8 KiB), Tests in `DuellLinkTest`.
* **Bruecke `window.DuellHost`** (alles wird in der Huelle erneut geprueft, die Seite ist kein vertrauenswuerdiger Aufrufer):
  * `share(url, text)`: Share-Sheet fuer einen Duell-Link.
  * `shareFile(b64, typ, name, url, text)`: Share-Sheet mit Datei. Erlaubt sind nur `image/png`, `image/jpeg`, `audio/wav`; die Bytes muessen zur Typangabe passen (Magic Number), hoechstens 8 MiB; der Dateiname wird auf ein Segment aus `[A-Za-z0-9._-]` (max. 64 Zeichen) reduziert, die Endung bestimmt der Typ. Die Datei liegt in `cache/share/` und wird per `FileProvider` (`<applicationId>.fileprovider`, nur `cache/share/`) mit Leserecht fuer das gewaehlte Ziel freigegeben; aufgeraeumt wird beim naechsten Aufruf, nach 10 Minuten und beim App-Start (`DuellFiles.sweep`). Ein `url`, der kein Duell-Link ist, wird weggelassen.
  * `saveFile(b64, typ, name)`: gleiche Pruefungen; Bilder landen ueber MediaStore in `Pictures/My Daily Idea`, Klaenge in `Music/My Daily Idea` (keine Speicher-Berechtigung noetig). Vor Android 10 gibt es dafuer keinen berechtigungsfreien Weg, dort uebernimmt das Share-Sheet.
  * `haptic()`, `more()`.
  * `push()`: wie die App die Person benachrichtigen kann („Bescheid geben“), als JSON der Bruecke v1 `{"v":1,"kind":"none|fcm|unifiedpush|apns","state":"unsupported|default|granted|denied"}`; nur gelistete Werte, sonst `none`. Vertrag der Huellen: `apps/android/app/src/test/resources/bridge-push-v1.json` (Tests `PushBridgeTest`, `DuellPushTests`). Dieser Build hat keinen Anbieter (`NoPush`, Schnittstelle `push/PushChannel.kt`); FCM braucht ein Firebase-Projekt, APNs das Apple Developer Program, UnifiedPush eine Verteiler-App (z. B. ntfy) auf dem Geraet. Eine Weckmeldung traegt nur ihre Art (`reply` | `live`, `PushMessage.kindOf`), den Satz setzt die App.
  Tests: `DuellFilesTest`, `DuellLinkTest`.
* **Foto:** `WebChromeClient.onShowFileChooser` oeffnet die System-Auswahl (`ACTION_GET_CONTENT`, `image/*`); die Kamera erscheint darin nur als ein Eintrag (`ACTION_IMAGE_CAPTURE` in den Cache, ohne `CAMERA`-Berechtigung, nur wenn die Person ihn waehlt). Der Rueckruf wird immer beantwortet (Abbruch = `null`).
* **Zusammen bauen:** `DuellHost.peerReady/peerInvite/peerAccept/peerSend/peerLeave` binden `PeerBridge` (Android und iOS gleich) an `mobile-core` (Feature `peer`); Antworten kommen ueber `window.DuellPeer.onPeerMessage(json)`. Es passieren nur Frames des Namensraums `mdi.collab.v1`, hoechstens 16 KiB; Freitext und Faehigkeitsanfragen enden in der Bruecke, der Kontakt bleibt im Speicher. Einladungslink nach aussen: `https://bunsenbrenner.org/duell#p=<fragment>` (die Bruecke setzt ihn in die `/p#`-Form des Kerns um, der Teil hinter `#` erreicht nie einen Server). Eingeschaltet nur mit `-PcadsPeerFrontDoor=host:443 -PcadsPeerEdgeCaB64=<DER als Base64>` und optional `-PcadsPeerSni=...`, iOS: `CadsPeerFrontDoor`, `CadsPeerEdgeCaBase64`, `CadsPeerSni`; ohne diese Werte meldet die Seite "noch nicht freigeschaltet".
* **Mikrofon:** Berechtigung `RECORD_AUDIO` (Hardware-Feature nicht erforderlich). `onPermissionRequest` gewaehrt nur dem eigenen Origin (`https://appassets.androidplatform.net`) und nur `AUDIO_CAPTURE` allein (`DuellLink.micAllowed`, getestet); die Laufzeitabfrage kommt erst, wenn die Seite nach dem Tippen auf "Aufnehmen" `getUserMedia` aufruft. Bei Ablehnung schlaegt `getUserMedia` fehl.
* Hochformat, keine Analytics, kein Tracking. Name `app_name` in `res/values*/strings.xml`, Theme-Farbe (Fenster, Status- und Navigationsleiste) Gelb in `res/values/themes.xml`.

## Bauen

Voraussetzungen: Rust (rustup) mit den Zielen, Xcode bzw. Android SDK/NDK.

```bash
# iOS: XCFramework + Swift-Bindings, Xcode-Projekt aus project.yml (XcodeGen), dann xcodebuild
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
apps/ios/build-rust.sh
cd apps/ios && xcodegen generate && xcodebuild -project CadsMarketplace.xcodeproj -scheme CadsMarketplace \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build

# Android: cargo-ndk + Kotlin-Bindings, dann Gradle ueber den eingecheckten Wrapper (Gradle 8.11.1, Distribution per SHA-256 gepinnt)
rustup target add aarch64-linux-android x86_64-linux-android && cargo install cargo-ndk
apps/android/build-rust.sh
cd apps/android && ./gradlew testDebugUnitTest assembleDebug assembleRelease   # Release ist unsigniert; Signatur siehe unten
```

Das CI (`.github/workflows/mobile.yml`) fuehrt beides aus. Nur in Debug-Builds der iOS-App gibt es die Startargumente `-UIMockInstallations`, `-UITab <0..3>` (0 Seite, 1 Vorlagen, 2 Installationen, 3 Vorlage-Detail), `-DuellChallenge <c=...|i=...>` und `-DuellScenario <probe|more>`: sie zeigen Beispieldaten in "Meine Installationen" ohne Server, oeffnen einen Link wie ein Universal Link und treiben die Seite ueber ihr DOM durch einen Ablauf (der Simulator kann nicht tippen); der Ablauf schreibt `Documents/duell-scenario.json` (was die Seite zeigte, was nativ ankam). Sie werden fuer die CI-Screenshots und -Pruefungen genutzt (`apps/ios/simulator-smoke.sh`, `check-scenarios.py`). In Release-Builds sind sie nicht enthalten.

### My Daily Idea (iOS)

Die Seite `duell/index.html` (der Ordner `apps/native-placeholder/duell` wird per `project.yml` als Ressourcen-Ordner `duell/` gebuendelt, ohne Build-Skript) fuellt den ganzen Bildschirm, ohne Tab-Leiste. Der Knopf "Mehr" der Seite (`DuellHost.more`) oeffnet ein natives Sheet mit Vorlagen und Meine Installationen. Name, Icon (`App/Assets.xcassets/AppIcon`, 1024 px aus `apps/assets/icon-master.svg`) und Startbildschirm-Farbe (`LaunchYellow`) folgen der Marke; Bundle-ID bleibt `org.bunsenbrenner.cads`.

* **WKWebView:** laedt nur die gebuendelte Seite, Netzwerk-Laden der Seite ist per Content-Rule-Liste gesperrt, externe Links oeffnen in Safari. Der Datenspeicher ist persistent (das CI prueft, dass `localStorage` einen Neustart ueberlebt).
* **Bruecke `window.DuellHost`** (Script-Handler `share`, `shareFile`, `saveFile`, `haptic`, `more`; alles wird nativ erneut geprueft): `shareFile(b64, typ, name, url, text)` zeigt `UIActivityViewController` mit der Datei; erlaubt sind nur `image/png`, `image/jpeg`, `audio/wav`, passend zur Magic Number, hoechstens 8 MiB, Dateiname auf `[A-Za-z0-9._-]` (max. 64) gesaeubert, Endung nach Typ (`DuellFiles`). Die Datei liegt in `Caches/duell-share/<uuid>/`, wird nach dem Sheet entfernt, nach 10 Minuten bzw. beim naechsten Aufruf und beim App-Start aufgeraeumt. `saveFile(b64, typ, name)` prueft gleich und bietet die Datei ueber die Dateien-Auswahl (`UIDocumentPickerViewController`, Export) an, ohne Fotomediathek-Berechtigung. `navigator.share` wird per Start-Script entfernt, damit jeder Weg durch diese Pruefungen geht. Tests: `apps/ios/Tests` (`DuellLinkTests`, `DuellFilesTests`, im CI auf dem Simulator).
* **Links:** `DuellLink.validFragment` laesst `c=<base64url>` (max. 8 KiB) und `i=<id>` (`[a-z0-9-]{1,32}`) zu, getestet; `DuellLink.isShareable` nur `https://bunsenbrenner.org/duell...`.
* **Foto:** `<input type="file" accept="image/*">` zeigt das System-Blatt von WebKit (Mediathek/Foto aufnehmen/Dateien); die Mediathek laeuft ueber PHPicker ohne Berechtigung, `NSCameraUsageDescription` gilt nur fuer "Foto aufnehmen" (die Kamera startet nur, wenn die Person es dort waehlt).
* **Mikrofon:** `NSMicrophoneUsageDescription`; `getUserMedia` steht auf der per `file://` geladenen Seite zur Verfuegung (im Simulator geprueft: `navigator.mediaDevices` vorhanden, die Anfrage erreicht den nativen Delegate), ein `WKURLSchemeHandler` ist daher nicht noetig; `requestMediaCapturePermissionFor` gewaehrt nur dem eigenen Origin und nur dem Mikrofon, alles andere wird abgelehnt. Die System-Abfrage kommt erst, wenn die Seite nach dem Tippen auf "Aufnehmen" `getUserMedia` aufruft; bei Ablehnung schlaegt `getUserMedia` fehl.
* Hochformat, keine Analytics.

Universal Link `https://bunsenbrenner.org/duell#c=...` oeffnet My Daily Idea mit dem Link (`#c=...` oder `#i=...`; Entitlement `applinks:bunsenbrenner.org` in `project.yml`). Das wirkt erst in einem signierten Build mit Apple-Team (Associated Domains). Dazu liefert der Server unter `https://bunsenbrenner.org/.well-known/apple-app-site-association` (Content-Type `application/json`, ohne Redirect):

```json
{"applinks":{"details":[{"appIDs":["<TEAM_ID>.org.bunsenbrenner.cads"],"components":[{"/":"/duell"},{"/":"/duell/*"}]}]}}
```

`<TEAM_ID>` ist ein Platzhalter bis zum Apple-Developer-Konto.

### Release-Signatur und Emulator-Test (Android)

* Das CI baut `assembleRelease` **unsigniert** und fuehrt die App in einem Emulator aus (`apps/android/emulator-smoke.sh`, prueft die Ausgabe ueber den UI-Dump): Start zeigt die Marke und keine Tab-Leiste; Mehr fuehrt zu Vorlagen (lokal gepruefter Signaturstatus, Vertrauensanzeige, Formular mit Vorschau) und Installationen; ein App-Link `i=` erreicht die Seite. Teilen, Speichern, Mikrofon und Foto pruefen die Tests der Bruecke (`DuellFilesTest`, `DuellLinkTest`), nicht der Emulator: der Platzhalter ruft sie nicht auf. Die Anmeldung wird nicht geprueft. Fuer den Emulator wird eine Kopie mit einem Wegwerf-Schluessel signiert.
* Die Release-Signatur erfolgt ausserhalb des CI mit dem Schluessel des Maintainers (`apksigner sign`); der Schluessel liegt nicht im Repository und nicht in CI-Secrets. Der SHA-256-Fingerabdruck des Zertifikats gehoert in `assetlinks.json` (siehe oben).
