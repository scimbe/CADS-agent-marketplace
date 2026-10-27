# Mobile-Apps (Android und iOS)

Verbraucher-Apps fuer den CADS-Marktplatz. Beide Apps nutzen denselben Rust-Kern (`crates/mobile-core`, UniFFI):

| Funktion | Wo |
|---|---|
| Signierte Prompt-Vorlagen auf dem Geraet pruefen (Signatur, Ablauf, Herkunft der Komponenten) und ausfuellen | `verify_prompt_template`, `render_prompt_template` (nutzt `manifest-core`, keine zweite Implementierung) |
| Installationen speichern, anpassen, abrufen | `InstallationsClient` gegen `/me/installations` der CADS-Tunnel-Control-Plane (Bearer-Token, `If-Match`-Revision, Fehler `Conflict`, `NotFound`, `Rejected422{path}`, `Unauthorized`) |
| Wasm-Installationen auf dem Geraet ausfuehren (spaeter) | Trait `WasmExecutor` mit Stub in `crates/mobile-core/src/wasm.rs` (TODO: `installer-engine::wasm_runtime` anbinden, sobald `feat/wasm-installer` gemergt ist) |

Screens in beiden Apps: **Vorlagen**, **Vorlage-Detail** (Vertrauensanzeige, Formular, Vorschau, Speichern), **Meine Installationen** (Liste, Detail/Bearbeiten, Duplizieren, Loeschen, Konfliktbehandlung bei 409: neu laden oder ueberschreiben). Texte auf Deutsch und Englisch. Die Beispielvorlagen werden direkt aus `manifests/prompt-templates/` gebuendelt.

## Anmeldung (OIDC)

Authorization Code + PKCE (S256) im System-Browser, oeffentlicher Client ohne Secret, gegen das bestehende Keycloak-Realm:

* iOS: `ASWebAuthenticationSession`; Tokens im Keychain (`WhenUnlockedThisDeviceOnly`, kein iCloud-Sync).
* Android: AppAuth (Custom Tabs); Zustand in `EncryptedSharedPreferences` (Schluessel im Android Keystore), von Backup und Geraete-Transfer ausgeschlossen.
* Die Apps senden das Access-Token als `Authorization: Bearer`; die Control-Plane nimmt Bearer-Anfragen vom CSRF-Schutz aus, Cookies werden nie verwendet.
* Der Rust-Kern speichert kein Token; er fragt es pro Anfrage ueber `TokenProvider` ab. Es wird nichts geloggt, TLS wird strikt geprueft (rustls, gebuendelte Wurzelzertifikate; `http` nur fuer localhost), Redirects werden nicht verfolgt.

Konfiguration (Standardwerte, ueberschreibbar): API `https://bunsenbrenner.org`, Issuer `https://auth.bunsenbrenner.org/realms/ct-demo`, Client `cads-mobile`, Redirect `org.bunsenbrenner.cads:/oauth2redirect`.
Android: `gradle -PcadsApiBase=... -PcadsIssuer=... -PcadsClientId=...`; iOS: Info.plist-Schluessel `CadsApiBase`, `CadsOidcIssuer`, `CadsOidcClientId` (in `apps/ios/project.yml`).
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
  "fullScopeAllowed": true,
  "redirectUris": ["org.bunsenbrenner.cads:/oauth2redirect"],
  "webOrigins": [],
  "attributes": {
    "pkce.code.challenge.method": "S256",
    "post.logout.redirect.uris": "org.bunsenbrenner.cads:/oauth2redirect"
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
