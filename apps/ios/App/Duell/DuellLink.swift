import Foundation

/// Links of My Daily Idea: https://bunsenbrenner.org/duell#c=<base64url(JSON)> (challenge, shared work) and #i=<id> (invite).
/// The state lives only in the URL fragment; nothing is sent anywhere.
enum DuellLink {
    static let host = "bunsenbrenner.org"
    static let path = "/duell"
    static let shortPrefix = "/s/"
    static let maxFragmentLength = 8192

    /// Short link id of the gallery: eight characters without 0, 1, O, o, I, l.
    private static func shortId(in url: URL) -> String? {
        guard url.scheme?.lowercased() == "https", url.host?.lowercased() == host, url.port == nil, url.user == nil, url.query == nil,
              url.path.hasPrefix(shortPrefix) else { return nil }
        let id = String(url.path.dropFirst(shortPrefix.count))
        let allowed = CharacterSet(charactersIn: "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ")
        guard id.count == 8, id.unicodeScalars.allSatisfy(allowed.contains) else { return nil }
        return id
    }

    /// Returns the fragment ("c=..." or "i=...") when `url` is a valid link of this app, else nil.
    /// A short link has no fragment of its own: it becomes `s=<id>` and the page fetches the rest.
    static func challengeFragment(from url: URL) -> String? {
        if let id = shortId(in: url) { return "s=" + id }
        guard url.scheme?.lowercased() == "https",
              url.host?.lowercased() == host,
              url.path == path || url.path == path + "/",
              let fragment = url.fragment else { return nil }
        return validFragment(fragment)
    }

    /// Links the page may pass to the share sheet: only the public Duell link (https, our host, path /duell),
    /// with a valid fragment if it has one.
    static func isShareable(_ string: String) -> Bool {
        if let short = URL(string: string), shortId(in: short) != nil, short.fragment == nil { return true }
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
        if fragment.hasPrefix("s=") {
            let value = fragment.dropFirst(2)
            let allowed = CharacterSet(charactersIn: "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ")
            guard value.count == 8, value.unicodeScalars.allSatisfy(allowed.contains) else { return nil }
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
