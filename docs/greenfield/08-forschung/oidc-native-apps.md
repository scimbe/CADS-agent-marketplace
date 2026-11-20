# OIDC + PKCE für die nativen Apps (iOS, Android) – Stand der Technik und Entscheidungen

Frage aus `KONZEPT.md` §6 („Ein Auth-Modell (OIDC + PKCE, Bearer) für alle Oberflächen **[offen]**“) und
Anti-Pattern A5 (`01-analyse/antipatterns.md`: „Policy nur im Client; zwei Auth-Wege (Cookie Web vs. Bearer Apps)“).
Stand: 2026-11-11. Umsetzung: scimbe/CADS-DEMO-wrapper#130 (Server), scimbe/CADS-agent-marketplace#240 (Apps, apps/mdi).

## Quellen

| # | Quelle | Kern für uns |
|---|---|---|
| Q1 | RFC 8252, „OAuth 2.0 for Native Apps“ (BCP 212), 2017. https://www.rfc-editor.org/rfc/rfc8252.html *(gelesen)* | §5/§8.12: Autorisierung **nur über einen externen User-Agent** (System-Browser, In-App-Browser-Tab), keine eingebettete WebView. §7: drei Redirect-Arten – §7.1 Private-Use-Scheme (nur in umgekehrter Domain-Schreibweise), §7.2 beanspruchte `https`-URI (bevorzugt, „SHOULD … where possible“), §7.3 Loopback. §6/§8.1: native Clients MÜSSEN PKCE nutzen. §8.4/8.5: öffentliche Clients, keine Secrets in der App. Anhang B: iOS `SFAuthenticationSession`/Nachfolger, Android Custom Tabs. |
| Q2 | RFC 9700, „Best Current Practice for OAuth 2.0 Security“ (BCP 240), Januar 2025. https://www.rfc-editor.org/rfc/rfc9700.html *(gelesen bis §4.10; Rest nicht)* | §2.1.1: öffentliche Clients MÜSSEN PKCE nutzen; S256 ist die einzige Methode, die den Verifier nicht preisgibt. §2.1/§4.1.3: exakter Vergleich der Redirect-URI. §2.2.1: Access-Tokens SOLLTEN sender-gebunden sein (mTLS, DPoP). **§2.2.2: Refresh-Tokens öffentlicher Clients MÜSSEN sender-gebunden sein ODER rotieren.** §2.3: Access-Tokens SOLLTEN auf einen Resource-Server beschränkt sein (Audience) und nur die nötigen Rechte tragen. |
| Q3 | RFC 7636, „Proof Key for Code Exchange“, 2015. https://www.rfc-editor.org/rfc/rfc7636.html *(nicht erneut gelesen; Inhalt aus Kenntnis der RFC)* | `code_verifier` 43–128 Zeichen hoher Entropie, `code_challenge = BASE64URL(SHA256(verifier))`, Methode `S256`. |
| Q4 | RFC 9449, „OAuth 2.0 Demonstrating Proof of Possession (DPoP)“, September 2023. https://www.rfc-editor.org/rfc/rfc9449.html *(gelesen bis auf die letzten ~7 %)* | §4.2: Beweis-JWT mit `typ: dpop+jwt`, öffentlichem JWK im Kopf, Claims `jti`, `htm`, `htu` (ohne Query/Fragment), `iat`, ggf. `ath`, `nonce`. **§5: Refresh-Tokens an öffentliche Clients werden an den Schlüssel gebunden.** §6.1: `cnf.jkt` im Access-Token. §7.1/7.2: ein gebundenes Token als Bearer MUSS abgewiesen werden. §8: Server-Nonce. §10: `dpop_jkt` bindet den Code. |
| Q5 | RFC 9068, „JWT Profile for OAuth 2.0 Access Tokens“, 2021; RFC 8725, „JSON Web Token Best Current Practices“, 2020. *(nicht erneut gelesen; aus Kenntnis der RFCs)* | Prüfregeln für JWT-Access-Tokens: `iss`, `aud`, `exp`; feste Algorithmus-Liste, Algorithmus passend zum Schlüssel, keine Schlüssel aus dem Token (`jku`, `jwk`, `x5u`), Token-Typen nicht verwechseln (ID-Token ≠ Access-Token). |
| Q6 | Keycloak, „Securing applications with DPoP“. https://www.keycloak.org/securing-apps/dpop *(gelesen)* | Schalter „Require DPoP bound tokens“ (Client, Capability config). Öffentliche Clients: Access- **und** Refresh-Token gebunden; Variante „nur Refresh-Token“ über Client-Policy mit Executor `dpop-bind-enforcer`. Refresh verlangt einen Beweis desselben Schlüssels. Nonce optional. |
| Q7 | Keycloak-Blog, „Official Support for DPoP in Keycloak 26.4“ (2025-10). https://www.keycloak.org/2025/10/dpop-support-26-4 *(gelesen)* | DPoP seit 26.4 offiziell unterstützt (Vorschau seit 23.0); „Bind only refresh tokens for public clients“ neu in 26.4. |
| Q8 | Keycloak-Quellcode, `DPoPBindEnforcerExecutor(Factory).java` (Tag 26.4.0) und `ClientAttributesCondition.java` (Tag 26.7.3). https://github.com/keycloak/keycloak *(gelesen)* | Executor-Konfiguration `auto-configure`, `enforce-authorization-code-binding-to-dpop`, `allow-only-refresh-token-binding` (gilt nur für öffentliche Clients und nur, wenn am Client **nicht** „Require DPoP“ an ist). Beim Token-Request und beim Refresh ohne Beweis: `invalid_dpop_proof`. Beim Widerruf (`TOKEN_REVOKE`) wird ein Beweis verlangt und gegen die Bindung geprüft. Bedingung `client-attributes` vergleicht Client-Attribute exakt. |
| Q9 | Live-Discovery des Realms (öffentlich, nur gelesen): `https://auth.bunsenbrenner.org/realms/ct-demo/.well-known/openid-configuration` und `/protocol/openid-connect/certs`, abgerufen 2026-11-11 | `issuer = https://auth.bunsenbrenner.org/realms/ct-demo`; `code_challenge_methods_supported` enthält `S256`; **`dpop_signing_alg_values_supported` ist gesetzt** (Feature aktiv, u. a. ES256); `authorization_response_iss_parameter_supported = true`. JWKS: ein RS256-Signaturschlüssel und ein RSA-OAEP-Schlüssel mit `use: enc` (muss beim Prüfen ignoriert werden). Image laut CADS-Tunnel `compose.sso.yml`: `keycloak:26.7.3`. |
| Q10 | Android Developers, `EncryptedSharedPreferences` (Referenz). https://developer.android.com/reference/androidx/security/crypto/EncryptedSharedPreferences *(gelesen)* | Seit `security-crypto` 1.1.0 **veraltet**; Datei nicht sichern (Auto Backup ausschließen). |
| Q11 | Apple, `ASWebAuthenticationSession.Callback`. https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession/callback *(Seite nicht maschinell lesbar; Inhalt nicht verifiziert)* | Nach allgemeinem Kenntnisstand: `.https(host:path:)` ab iOS 17.4, verlangt Associated Domains (`webcredentials:`) und damit ein Apple-Team; sonst `.customScheme`. |
| Q13 | Keycloak-Quellcode (Tag 26.7.3): `common/.../Profile.java`, `protocol/oidc/resourceindicators/ResourceIndicatorsPostProcessor.java`, `protocol/oidc/refresh/AbstractRefreshTokenProvider.java`. https://github.com/keycloak/keycloak *(gelesen)* | `RESOURCE_INDICATORS` ist `EXPERIMENTAL`; die `resource` des Codes wird ins Refresh-Token geschrieben, ein Refresh mit anderer `resource` ergibt `invalid_target` (eine Ressource je Grant). Ein Refresh mit `scope=` verkleinert das **Access**-Token auf die angefragten Scopes; das neue Refresh-Token behält den Umfang des alten. |
| Q12 | Apple, Keychain Services / Secure Enclave (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, CryptoKit `SecureEnclave.P256`). *(nicht erneut gelesen)* | Geräte-gebundene Ablage ohne iCloud-Sync; nicht exportierbarer P-256-Schlüssel im Secure Enclave. |

## Befund

1. **Ein Anmeldeweg in der App, kein zweiter.** Die App hat schon eine OIDC-Anmeldung (Client `cads-mobile`, öffentlich,
   PKCE S256, iOS `ASWebAuthenticationSession`, Android AppAuth/Custom Tabs; `apps/README.md`). Ein eigener Client für
   My Daily Idea hieße zwei Logins in einer App. Entscheidung: `cads-mobile` bleibt der einzige App-Client.
   **Nach dem Review: ein Access-Token je Resource-Server** (Q2 §2.3). Zwei optionale Client-Scopes `ct-api`
   (Audience `ct-api`) und `mdi-api` (Audience `mydailyidea-api`); die App holt per Refresh mit `scope=` je ein
   eingeengtes Token (Q13). RFC 8707 Resource Indicators wären der Standardweg, sind in Keycloak 26.7.3 aber
   experimentell und erlauben nur eine Ressource je Grant (Q13) – also zwei Anmeldungen. Die Control-Plane verlangt
   für `cads-mobile` `aud: ct-api` (CADS-Tunnel#899), der Wrapper `aud: mydailyidea-api`. Der Client existiert live (Probe 2026-11-11: Fehlerseite „Invalid parameter:
   redirect_uri“ statt „Client not found“), steht aber nicht im Realm-Export von CADS-Tunnel.
2. **Eine Identitätsfunktion auf dem Server (A5).** `lib/auth.mjs identify()` nimmt Gate-Cookie ODER Bearer und liefert
   dieselbe E-Mail-Identität (das Gate schreibt die E-Mail in `X-Gate-Email`, CADS-Tunnel `gate.rs`). Alle Regeln
   (Töpfe, 16+, Moderation, Limits) bleiben, wo sie sind. Trägt eine Anfrage einen `Authorization`-Header, entscheidet er
   allein (kein stiller Rückfall aufs Cookie, A4).
3. **E-Mail nur bestätigt.** Das Realm hat `verifyEmail: true`; IdPs Google/GitHub/GitLab mit `trustEmail: false`,
   HAW-GitLab mit `trustEmail: true`. Der Bearer-Weg verlangt `email_verified: true` (fail closed). Das Gate selbst
   prüft `email_verified` nur für E-Mail-Zugriffslisten (`CT_GATE_REQUIRE_VERIFIED_EMAIL`), nicht bei „Allow any
   signed-in account“ – die App ist also strenger als das Web; das ist gewollt, weil Keycloak die Bestätigung bei der
   Anmeldung ohnehin erzwingt (Required Action `VERIFY_EMAIL`, CADS-Tunnel #535).
   **Nach dem Review:** zusätzlich bindet der Wrapper das erste `(iss, sub)` je Adresse (HMAC, Datei) und weist ein
   anderes Subjekt mit derselben Adresse ab. Eine bei einem IdP neu vergebene Adresse übernimmt so kein Konto. Die
   Realm-Vorbedingungen (Trust Email aus, keine automatische Verknüpfung, Bestätigung bei E-Mail-Änderung) prüft das
   Runbook vor dem Einschalten; `haw-gitlab` erfüllt „Trust Email aus“ laut Export nicht.
4. **Redirect-Art (Q1 §7, Q11).** Android: beanspruchte https-URI (`https://bunsenbrenner.org/app/oauth2redirect`, App
   Link) – bevorzugt nach Q1 §7.2. iOS: https-Callback geht erst mit Associated Domains und Apple-Team (fehlt noch,
   `TEAM_ID`-Platzhalter); daher Private-Use-Scheme `org.bunsenbrenner.cads:/oauth2redirect` (umgekehrte Domain,
   Q1 §7.1). `ASWebAuthenticationSession` liefert den Callback nur an die aufrufende Sitzung; PKCE (Q3) macht einen
   abgefangenen Code wertlos. Wechsel auf `.https` sobald das Apple-Team steht.
   **Befund am Rande:** `https://bunsenbrenner.org/.well-known/assetlinks.json` liefert die Relation
   `delegate_permission/common/handle_all_urls` (Schrägstrich; CADS-Tunnel `crates/control-plane/src/service.rs`
   `ASSETLINKS_JSON`). Android verwirft solche Erklärungen; der App-Link-Redirect ist damit heute nicht verifiziert.
   Muss vor dem Einschalten korrigiert werden (Runbook Schritt 0). Der Wrapper liefert für `demos-34a13a96…` die
   richtige Form.
5. **Refresh-Token (Q2 §2.2.2, Q4 §5, Q6–Q8).** Pflicht: Sender-Bindung ODER Rotation. Rotation (`revokeRefreshToken`)
   ist in Keycloak eine **Realm**-Einstellung und träfe alle Clients des Realms (u. a. `praktikum-creator` über
   oauth2-proxy, Portal/Gate) – nicht vertretbar. Keycloak 26.4+ kann für **öffentliche** Clients **nur das
   Refresh-Token** per DPoP binden (Executor `dpop-bind-enforcer`, `allow-only-refresh-token-binding`), eingegrenzt per
   Client-Policy auf einen Client. **Entscheidung: DPoP ja, nur für das Refresh-Token.** Das Access-Token bleibt Bearer
   (kurzlebig, 300 s, nur im nativen Speicher), der Wrapper muss keine DPoP-Beweise prüfen und weist gebundene Tokens
   als Bearer ab (Q4 §7.2).
6. **Token nie in JavaScript.** Die Seite (apps/mdi) läuft in einer WebView; ein Token im JS wäre bei jeder Lücke in der
   Seite lesbar. Entscheidung: **native Konto-Brücke** – die Hülle meldet an und führt die Server-Aufrufe selbst aus
   (feste Pfadliste, fester Host, keine Cookies, keine Weiterleitungen). CORS bleibt unverändert (nativer Aufruf ohne
   `Origin`; `Authorization` ist für fremde Herkünfte nicht freigegeben, also kein CSRF-Vektor).
7. **Ablage (Q10, Q12).** iOS: Keychain `WhenUnlockedThisDeviceOnly`, DPoP-Schlüssel im Secure Enclave (Simulator:
   Software-Schlüssel im Keychain). Android: AppAuth-Zustand in `EncryptedSharedPreferences` (Keystore-AES-Schlüssel),
   DPoP-Schlüssel im Keystore (StrongBox wo vorhanden). `EncryptedSharedPreferences` ist veraltet (Q10); durch die
   DPoP-Bindung ist ein ausgelesenes Refresh-Token aber ohne den nicht exportierbaren Schlüssel wertlos. Ablösung durch
   eine eigene Keystore-AES-GCM-Ablage ist ein Folgepunkt.
8. **Bibliotheken.** Android: AppAuth-Android 0.11.1 (Apache-2.0, OpenID Foundation) bleibt – PKCE, Custom Tabs,
   Browser-Auswahl und Zustandsverwaltung sind dort geprüft; DPoP wird über eine eigene `ClientAuthentication`
   (zusätzlicher `DPoP`-Header) eingehängt. iOS: eigene schlanke Umsetzung auf `ASWebAuthenticationSession` (bestehend,
   ~170 Zeilen); AppAuth-iOS brächte keinen Mehrwert.
9. **Server-Prüfung (Q2 §2.3, Q5).** `alg` nur RS256/ES256 und gleich dem des JWK; `kid` Pflicht; Schlüssel nur aus dem
   JWKS des Issuers (gecacht, begrenztes Nachladen bei Rotation); `iss` exakt; `aud` = `mydailyidea-api`; `azp` =
   `cads-mobile`; `typ` = `Bearer` (Keycloak; ID-/Refresh-Tokens fallen heraus); kein `cnf`; `exp`/`nbf`/`iat` mit 30 s
   Toleranz; `email` + `email_verified`. Ohne Schlüssel: 503 (fail closed).

## Entscheidungen (kurz)

| Punkt | Entscheidung | Ein-Satz-Grund |
|---|---|---|
| Client | bestehender öffentlicher Client `cads-mobile`, ein Access-Token je Resource-Server (Scopes `ct-api`/`mdi-api`, Refresh mit `scope=`) | Eine App, ein Login; ein abgegriffenes Token gilt nur an einem Dienst (Q2 §2.3); RFC 8707 in Keycloak noch experimentell (Q13). |
| Identität | E-Mail wie beim Gate, plus Bindung an das erste `(iss, sub)` | Gleiches Konto wie im Web, keine Übernahme über eine neu vergebene Adresse. |
| Redirect | iOS Private-Use-Scheme, Android App Link `https://bunsenbrenner.org/app/oauth2redirect` | Android nach Q1 §7.2; iOS-https braucht ein Apple-Team, das es noch nicht gibt. |
| Brücke | native Konto-Brücke, Token bleibt nativ | Kein Token im JS, keine CORS-Öffnung, ein Weg für beide Plattformen. |
| Ablage | Keychain / Keystore-gestützt, Geräteschlüssel nicht exportierbar | Gerätegebunden, kein Backup, kein iCloud. |
| DPoP | ja, nur Refresh-Token (Client-Policy) | Erfüllt Q2 §2.2.2 ohne realmweite Rotation; Wrapper bleibt einfach. |
| CORS | keine Änderung | Native Aufrufe haben keinen `Origin`. |

## Offene Punkte

- iOS auf `.https`-Callback umstellen, sobald Apple-Team und `webcredentials` stehen.
- Android-Ablage weg von `EncryptedSharedPreferences` (veraltet).
- `dpop_jkt` (Q4 §10) zusätzlich senden, sobald nötig; PKCE bindet den Code bereits.
- DPoP-Nonce (Q4 §8) wird nicht unterstützt; Keycloak verlangt sie nicht standardmäßig.
- `cads-mobile` in den Realm-Export von CADS-Tunnel aufnehmen (heute nur live vorhanden).
