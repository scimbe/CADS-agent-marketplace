import Foundation

/// Links of My Daily Idea: https://bunsenbrenner.org/duell#c=<base64url(JSON)> (challenge, shared work) and #i=<id> (invite).
/// The state lives only in the URL fragment; nothing is sent anywhere.
enum DuellLink {
    static let host = "bunsenbrenner.org"
    static let path = "/duell"
    static let maxFragmentLength = 8192

    /// Returns the fragment ("c=..." or "i=...") when `url` is a valid link of this app, else nil.
    static func challengeFragment(from url: URL) -> String? {
        guard url.scheme?.lowercased() == "https",
              url.host?.lowercased() == host,
              url.path == path || url.path == path + "/",
              let fragment = url.fragment else { return nil }
        return validFragment(fragment)
    }

    /// Links the page may pass to the share sheet: only the public Duell link (https, our host, path /duell),
    /// with a valid fragment if it has one.
    static func isShareable(_ string: String) -> Bool {
        guard let url = URL(string: string), url.scheme?.lowercased() == "https", url.host?.lowercased() == host, url.port == nil,
              url.path == path || url.path == path + "/", url.user == nil, url.query == nil else { return false }
        guard let fragment = url.fragment else { return true }
        return validFragment(fragment) != nil
    }

    /// Only `c=` followed by base64url characters (padding allowed), or `i=` followed by an idea id
    /// (`[a-z0-9-]`, 1 to 32 characters). This also makes the value safe to hand to the web page
    /// without any escaping.
    static func validFragment(_ fragment: String) -> String? {
        guard fragment.count <= maxFragmentLength else { return nil }
        if fragment.hasPrefix("c=") {
            let value = fragment.dropFirst(2)
            guard !value.isEmpty else { return nil }
            let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=")
            guard value.unicodeScalars.allSatisfy(allowed.contains) else { return nil }
            return fragment
        }
        if fragment.hasPrefix("i=") {
            let value = fragment.dropFirst(2)
            guard (1...32).contains(value.count) else { return nil }
            let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789-")
            guard value.unicodeScalars.allSatisfy(allowed.contains) else { return nil }
            return fragment
        }
        return nil
    }
}
