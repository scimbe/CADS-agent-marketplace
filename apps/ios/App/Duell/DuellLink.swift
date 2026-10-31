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

    /// Only `c=` followed by base64url characters (padding allowed), `p=` with an invite to build together, or `i=` followed by an idea id
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
        if fragment.hasPrefix("p=") { return peerValue(String(fragment.dropFirst(2))) != nil ? fragment : nil }
        return nil
    }

    /// The secret part of an invite to build together: base64url, it never reaches a server.
    private static func peerValue(_ v: String) -> String? {
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
        return (40...1024).contains(v.count) && v.unicodeScalars.allSatisfy(allowed.contains) ? v : nil
    }
    private static let coreBase = "https://\(host)/p#"

    /// The core's invite link as the Universal Link people share. `/p` has neither a page nor an entry in the app links.
    static func shareLink(_ coreLink: String?) -> String? {
        guard let coreLink, coreLink.hasPrefix(coreBase), let v = peerValue(String(coreLink.dropFirst(coreBase.count))) else { return nil }
        return "https://\(host)\(path)#p=\(v)"
    }

    /// The other way, for `peerAcceptInvite`. Only a valid `#p=` link of this app.
    static func coreLink(_ link: String?) -> String? {
        guard let link, let url = URL(string: link), let f = challengeFragment(from: url), f.hasPrefix("p=") else { return nil }
        return coreBase + f.dropFirst(2)
    }
}
