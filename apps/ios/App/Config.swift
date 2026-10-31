import Foundation

/// Deployment configuration. Values come from Info.plist (set in project.yml) so a staging build
/// can point to another origin without code changes.
enum AppConfig {
    private static func plist(_ key: String, _ fallback: String) -> String {
        (Bundle.main.object(forInfoDictionaryKey: key) as? String).flatMap { $0.isEmpty ? nil : $0 } ?? fallback
    }

    /// Platform origin that serves `/me/installations`. Must be https (the Rust client refuses
    /// plain http except for localhost).
    static var apiBase: String { plist("CadsApiBase", "https://bunsenbrenner.org") }
    /// Keycloak realm issuer, e.g. https://<keycloak-host>/realms/ct-demo
    static var issuer: String { plist("CadsOidcIssuer", "https://auth.bunsenbrenner.org/realms/ct-demo") }
    /// Public client (no secret) that the operator has to create, see apps/README.md.
    static var clientId: String { plist("CadsOidcClientId", "cads-mobile") }
    /// Phone channels ("Zusammen bauen"): `host:port` of the edge's :443 front door, its CA root as base64 DER and the
    /// TLS name. Empty means the feature is off and the page says so.
    static var peerFrontDoor: String { plist("CadsPeerFrontDoor", "") }
    static var peerEdgeCaBase64: String { plist("CadsPeerEdgeCaBase64", "") }
    static var peerSni: String { plist("CadsPeerSni", "") }
    static let redirectScheme = "org.bunsenbrenner.cads"
    static var redirectURI: String { "\(redirectScheme):/oauth2redirect" }
}
