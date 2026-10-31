import Foundation

/// Pure rules for the files the page hands to the app (`DuellHost.shareFile` / `saveFile`):
/// which types, how big, what the name may look like, and the cache folder they live in.
/// Foundation only, so it is unit-tested without the app. The page only ever produces a PNG or
/// JPEG picture or a WAV sound; everything else is dropped.
enum DuellFiles {
    /// Largest file after decoding. A 1080x1350 PNG is a few hundred KB; this is a hard ceiling.
    static let maxBytes = 8 * 1024 * 1024
    static let maxName = 64
    static let defaultBase = "my-daily-idea"
    /// How long a file may stay in the cache folder before the next call or start removes it.
    static let staleSeconds: TimeInterval = 10 * 60
    static let folderName = "duell-share"

    enum Kind: String {
        case png, jpeg, wav
        var ext: String { self == .jpeg ? "jpg" : rawValue }
        var mime: String { self == .png ? "image/png" : self == .jpeg ? "image/jpeg" : "audio/wav" }
        var isImage: Bool { self != .wav }
    }

    /// The accepted type for a MIME string from the page (case and parameters ignored), else nil.
    static func kind(of type: String?) -> Kind? {
        guard let type else { return nil }
        let t = type.split(separator: ";", maxSplits: 1, omittingEmptySubsequences: false).first.map { $0.trimmingCharacters(in: .whitespaces).lowercased() } ?? ""
        switch t {
        case "image/png": return .png
        case "image/jpeg", "image/jpg": return .jpeg
        case "audio/wav", "audio/x-wav", "audio/wave": return .wav
        default: return nil
        }
    }

    /// Decodes the standard-alphabet base64 payload. Nil when it is too big, not base64, empty, or when
    /// the bytes are not what `kind` says (magic number), so a declared type cannot hide other content.
    static func decode(_ b64: String?, as kind: Kind) -> Data? {
        guard let b64, !b64.isEmpty, b64.utf8.count <= maxBytes / 3 * 4 + 8 else { return nil }
        guard let data = Data(base64Encoded: b64), !data.isEmpty, data.count <= maxBytes else { return nil }
        return matchesMagic(data, kind) ? data : nil
    }

    static func matchesMagic(_ d: Data, _ kind: Kind) -> Bool {
        let b = [UInt8](d.prefix(12))
        switch kind {
        case .png: return b.count >= 8 && Array(b[0..<8]) == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
        case .jpeg: return b.count >= 3 && Array(b[0..<3]) == [0xFF, 0xD8, 0xFF]
        case .wav: return b.count >= 12 && Array(b[0..<4]) == Array("RIFF".utf8) && Array(b[8..<12]) == Array("WAVE".utf8)
        }
    }

    /// A file name that is safe as a single path segment: no directories, only [A-Za-z0-9._-], no leading
    /// dots, at most `maxName` characters, and the extension always the one of `kind`.
    static func safeName(_ name: String?, kind: Kind) -> String {
        var base = name ?? ""
        if let i = base.lastIndex(where: { $0 == "/" || $0 == "\\" }) { base = String(base[base.index(after: i)...]) }
        if let dot = base.lastIndex(of: ".") { base = String(base[..<dot]) } // drop whatever extension was given
        var out = ""
        for u in base.unicodeScalars {
            let ok = (u.value >= 0x41 && u.value <= 0x5A) || (u.value >= 0x61 && u.value <= 0x7A) || (u.value >= 0x30 && u.value <= 0x39) || u == "-" || u == "_" || u == "."
            out.append(ok ? Character(u) : "-")
        }
        while out.contains("..") { out = out.replacingOccurrences(of: "..", with: ".") }
        while out.contains("--") { out = out.replacingOccurrences(of: "--", with: "-") }
        let trim = CharacterSet(charactersIn: ".-")
        out = out.trimmingCharacters(in: trim)
        out = String(out.prefix(maxName - 1 - kind.ext.count)).trimmingCharacters(in: trim)
        if out.isEmpty { out = defaultBase }
        return out + "." + kind.ext
    }

    /// Removes every entry directly under `dir` last modified at least `maxAge` seconds before `now`
    /// (all of it with `maxAge = 0`). Returns the number of removed entries.
    @discardableResult
    static func sweep(_ dir: URL, now: Date = Date(), maxAge: TimeInterval) -> Int {
        let fm = FileManager.default
        guard let entries = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey]) else { return 0 }
        var removed = 0
        for e in entries {
            let m = (try? e.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
            if now.timeIntervalSince(m) >= maxAge, (try? fm.removeItem(at: e)) != nil { removed += 1 }
        }
        return removed
    }

    /// `Caches/duell-share`: where files to share or save live until the sheet is done.
    static var cacheDir: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent(folderName, isDirectory: true)
    }

    /// Writes `data` as `<cache>/<uuid>/<safe name>` (one folder per call so names never collide) and returns the file.
    static func stage(_ data: Data, name: String) throws -> URL {
        let dir = cacheDir.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let file = dir.appendingPathComponent(name)
        try data.write(to: file, options: .atomic)
        return file
    }
}
