import Foundation

/// Challenge links of the Duell game: https://bunsenbrenner.org/duell#c=<base64url(JSON)>.
/// The state lives only in the URL fragment; nothing is sent anywhere.
enum DuellLink {
    static let host = "bunsenbrenner.org"
    static let path = "/duell"
    static let maxFragmentLength = 8192

    /// Returns the fragment ("c=...") when `url` is a valid Duell challenge link, else nil.
    static func challengeFragment(from url: URL) -> String? {
        guard url.scheme?.lowercased() == "https",
              url.host?.lowercased() == host,
              url.path == path || url.path == path + "/",
              let fragment = url.fragment else { return nil }
        return validFragment(fragment)
    }

    /// Only `c=` followed by base64url characters (padding allowed); this also makes the value
    /// safe to hand to the web page without any escaping.
    static func validFragment(_ fragment: String) -> String? {
        guard fragment.count <= maxFragmentLength, fragment.hasPrefix("c=") else { return nil }
        let value = fragment.dropFirst(2)
        guard !value.isEmpty else { return nil }
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=")
        guard value.unicodeScalars.allSatisfy(allowed.contains) else { return nil }
        return fragment
    }
}
