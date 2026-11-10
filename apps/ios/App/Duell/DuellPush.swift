import Foundation

/// "Bescheid geben": how this app can wake the device, for `DuellHost.push()` (bridge v1, the same contract as Android and
/// the page: apps/duell-web/test/fixtures/bridge-push-v1.json). APNs needs the Apple Developer Program (team, push key,
/// signed build); until then this build says "none" and the page says honestly that the app cannot do it yet.
/// A wake-up carries only its kind ("reply" | "live"); the sentence comes from the app, nothing else is read or shown.
enum DuellPush {
    static let version = 1
    static let kinds: Set<String> = ["none", "fcm", "unifiedpush", "apns"]
    static let states: Set<String> = ["unsupported", "default", "granted", "denied"]
    static let none = "{\"v\":1,\"kind\":\"none\",\"state\":\"unsupported\"}"
    /// What this build offers.
    static var current: String { capability(kind: "none", state: "unsupported") }

    /// Only listed values; anything else reads as "none", so the page never gets a stray string.
    static func capability(kind: String, state: String) -> String {
        guard kinds.contains(kind), states.contains(state), kind != "none" else { return none }
        return "{\"v\":\(version),\"kind\":\"\(kind)\",\"state\":\"\(state)\"}"
    }

    /// "reply" | "live" | nil (neutral sentence).
    static func kindOf(_ payload: String?) -> String? {
        guard let p = payload, !p.isEmpty, p.utf8.count <= 4096, let d = p.data(using: .utf8),
              let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any], let r = o["r"] as? String,
              r == "reply" || r == "live" else { return nil }
        return r
    }
}
