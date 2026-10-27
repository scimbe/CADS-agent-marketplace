# Mobile-Apps (Android und iOS)

Verbraucher-Apps fuer den CADS-Marktplatz. Beide Apps nutzen denselben Rust-Kern (`crates/mobile-core`, UniFFI):

| Funktion | Wo |
|---|---|
| Signierte Prompt-Vorlagen auf dem Geraet pruefen (Signatur, Ablauf, Herkunft der Komponenten) und ausfuellen | `verify_prompt_template`, `render_prompt_template` (nutzt `manifest-core`, keine zweite Implementierung) |
| Installationen speichern, anpassen, abrufen | `InstallationsClient` gegen `/me/installations` der CADS-Tunnel-Control-Plane (Bearer-Token, `If-Match`-Revision, Fehler `Conflict`, `NotFound`, `Rejected422{path}`, `Unauthorized`) |
| Wasm-Installationen auf dem Geraet ausfuehren | `run_wasm_installation(component, spec_json, args, work_dir)` ueber `installer-engine::wasm_runtime` (Cargo-Feature `wasm`, von den Build-Skripten aktiviert; wasmtime-Komponentenmodell, WASI 0.2, Grenzen und Rechte aus der signierten `WasmSpec`). Pulley-Interpreter auf iOS (kein JIT erlaubt), Cranelift-JIT auf Android. Ohne das Feature liefert `WasmExecutor` einen Stub, der ablehnt. Test mit den WAT-Gaesten des Repos: `cargo test -p mobile-core --features wasm` (benoetigt Rust >= 1.97) |

Screens in beiden Apps: **Vorlagen**, **Vorlage-Detail** (Vertrauensanzeige, Formular, Vorschau, Speichern), **Meine Installationen** (Liste, Detail/Bearbeiten, Duplizieren, Loeschen, Konfliktbehandlung bei 409: neu laden oder ueberschreiben). Texte auf Deutsch und Englisch. Die Beispielvorlagen werden direkt aus `manifests/prompt-templates/` gebuendelt.

## Anmeldung (OIDC)

Authorization Code + PKCE (S256) im System-Browser, oeffentlicher Client ohne Secret, gegen das bestehende Keycloak-Realm:

* iOS: `ASWebAuthenticationSession` (ephemere Sitzung, es bleibt kein Keycloak-SSO-Cookie in Safari), Redirect `org.bunsenbrenner.cads:/oauth2redirect` (kein `CFBundleURLTypes` noetig); Tokens im Keychain (`WhenUnlockedThisDeviceOnly`, kein iCloud-Sync). Beim ersten Start nach einer Installation wird der Keychain-Eintrag verworfen; ein fehlgeschlagenes Speichern gilt nicht als angemeldet; Token-Refreshes laufen seriell.
* Android: AppAuth (Custom Tabs) mit **App-Link-Redirect** `https://bunsenbrenner.org/app/oauth2redirect` (verifiziertes `https`, kein Custom-Scheme, das eine andere App beanspruchen koennte); Zustand in `EncryptedSharedPreferences` (Schluessel im Android Keystore), von Backup und Geraete-Transfer ausgeschlossen.
* **Abmelden:** der lokale Token-Zustand wird sofort geloescht, das Refresh-Token wird per RFC 7009 am Keycloak-Endpunkt `/protocol/openid-connect/revoke` widerrufen (Best effort im Hintergrund); Android beendet zusaetzlich die Browser-Sitzung per `end_session` (ID-Token-Hint), iOS nutzt dafuer die ephemere Sitzung.
* Die Apps senden das Access-Token als `Authorization: Bearer`; die Control-Plane nimmt Bearer-Anfragen vom CSRF-Schutz aus, Cookies werden nie verwendet.
* Der Rust-Kern speichert kein Token; er fragt es pro Anfrage ueber `TokenProvider` ab. Es wird nichts geloggt, TLS wird strikt geprueft (rustls, gebuendelte Wurzelzertifikate; `http` nur fuer localhost), Redirects werden nicht verfolgt.

Konfiguration (Standardwerte, ueberschreibbar): API `https://bunsenbrenner.org`, Issuer `https://auth.bunsenbrenner.org/realms/ct-demo`, Client `cads-mobile`, Redirect iOS `org.bunsenbrenner.cads:/oauth2redirect`, Android `https://bunsenbrenner.org/app/oauth2redirect`.
Android: `gradle -PcadsApiBase=... -PcadsIssuer=... -PcadsClientId=... -PcadsRedirectUri=...`; iOS: Info.plist-Schluessel `CadsApiBase`, `CadsOidcIssuer`, `CadsOidcClientId` (in `apps/ios/project.yml`).
**Der Issuer-Host ist eine Annahme** und muss vor dem Produktivbetrieb mit dem tatsaechlichen Keycloak-Host abgeglichen werden.

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

**Refresh-Token-Rotation** ist in Keycloak eine Realm-Einstellung (gilt fuer alle Clients des Realms; Betreiber vorher pruefen): `"revokeRefreshToken": true` und `"refreshTokenMaxReuse": 0`. Damit ist jedes Refresh-Token nur einmal verwendbar; die Apps serialisieren deshalb ihre Refreshes.

### Android App Links (Betreiber)

Die Domain `bunsenbrenner.org` muss unter `https://bunsenbrenner.org/.well-known/assetlinks.json` (ohne Redirect, `Content-Type: application/json`) die App freigeben, sonst oeffnet Android den Redirect nicht in der App:

```json
[{
  "relation": ["delegate_permission/common/handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "org.bunsenbrenner.cads",
    "sha256_cert_fingerprints": ["<SHA-256 des Signaturzertifikats der Release-App>"]
  }
}]
```

Der Pfad `/app/oauth2redirect` muss serverseitig nicht existieren oder darf eine leere Seite liefern; die App faengt ihn ab. Der Fingerabdruck des Debug-Zertifikats ist fuer Entwicklung zusaetzlich einzutragen.

Hinweise: Der `sub`-Mapper entspricht dem von `ct-agent-cli`, weil die Control-Plane das Konto ueber `sub` und `iss` aufloest. Erzwingt der Betreiber `CT_OIDC_ACCESS_AUD`, braucht der Client zusaetzlich einen Audience-Mapper fuer diesen Wert. Ohne diesen Client scheitert die Anmeldung mit `invalid_client`; die Vorlagen-Funktionen (pruefen, ausfuellen) laufen auch ohne Anmeldung.

## Bauen

Voraussetzungen: Rust (rustup) mit den Zielen, Xcode bzw. Android SDK/NDK.

```bash
# iOS: XCFramework + Swift-Bindings, Xcode-Projekt aus project.yml (XcodeGen), dann xcodebuild
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
apps/ios/build-rust.sh
cd apps/ios && xcodegen generate && xcodebuild -project CadsMarketplace.xcodeproj -scheme CadsMarketplace \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build

# Android: cargo-ndk + Kotlin-Bindings, dann Gradle (Wrapper-JAR ist nicht eingecheckt; Gradle >= 8.11)
rustup target add aarch64-linux-android x86_64-linux-android && cargo install cargo-ndk
apps/android/build-rust.sh
cd apps/android && gradle testDebugUnitTest assembleDebug
```

Das CI (`.github/workflows/mobile.yml`) fuehrt beides aus. Nur in Debug-Builds der iOS-App gibt es die Startargumente `-UIMockInstallations` und `-UITab <0|1>`: sie zeigen Beispieldaten in "Meine Installationen" ohne Server und werden fuer die CI-Screenshots genutzt. In Release-Builds sind sie nicht enthalten.
