import XCTest

final class DuellFilesTests: XCTestCase {
    private let png = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3])
    private let jpg = Data([0xFF, 0xD8, 0xFF, 0xE0, 1, 2])
    private let wav = Data("RIFF".utf8) + Data([36, 0, 0, 0]) + Data("WAVEfmt ".utf8)
    private func b64(_ d: Data) -> String { d.base64EncodedString() }

    func testOnlyPictureAndWavTypesAreAccepted() {
        XCTAssertEqual(DuellFiles.kind(of: "image/png"), .png)
        XCTAssertEqual(DuellFiles.kind(of: " IMAGE/PNG "), .png)
        XCTAssertEqual(DuellFiles.kind(of: "image/jpeg"), .jpeg)
        XCTAssertEqual(DuellFiles.kind(of: "audio/wav"), .wav)
        XCTAssertEqual(DuellFiles.kind(of: "audio/wav; codecs=1"), .wav)
        for bad in [nil, "", "text/html", "image/svg+xml", "application/pdf", "application/zip", "audio/mpeg", "video/mp4", "image/gif", "text/plain"] as [String?] {
            XCTAssertNil(DuellFiles.kind(of: bad), "type \(bad ?? "nil")")
        }
    }

    func testDecodeChecksMagicNumbersAgainstTheDeclaredType() {
        XCTAssertNotNil(DuellFiles.decode(b64(png), as: .png))
        XCTAssertNotNil(DuellFiles.decode(b64(jpg), as: .jpeg))
        XCTAssertNotNil(DuellFiles.decode(b64(wav), as: .wav))
        XCTAssertNil(DuellFiles.decode(b64(png), as: .wav), "png bytes declared as wav")
        XCTAssertNil(DuellFiles.decode(b64(Data("<html></html>".utf8)), as: .png), "html declared as png")
        XCTAssertNil(DuellFiles.decode(b64(Data("RIFF1234AVI LIST".utf8)), as: .wav), "riff but not wave")
    }

    func testDecodeRejectsBrokenOrOversizeInput() {
        XCTAssertNil(DuellFiles.decode(nil, as: .png))
        XCTAssertNil(DuellFiles.decode("", as: .png))
        XCTAssertNil(DuellFiles.decode("not base64!!", as: .png))
        XCTAssertNil(DuellFiles.decode("data:image/png;base64," + b64(png), as: .png))
        XCTAssertNil(DuellFiles.decode(b64(png + Data(count: DuellFiles.maxBytes)), as: .png))
        XCTAssertNil(DuellFiles.decode(String(repeating: "A", count: DuellFiles.maxBytes * 2), as: .png), "longer than any allowed payload")
        let atLimit = png + Data(count: DuellFiles.maxBytes - png.count)
        XCTAssertEqual(DuellFiles.decode(b64(atLimit), as: .png)?.count, DuellFiles.maxBytes)
    }

    func testNamesAreReducedToOneSafeSegmentWithTheExtensionOfTheType() {
        XCTAssertEqual(DuellFiles.safeName("my-daily-idea.png", kind: .png), "my-daily-idea.png")
        XCTAssertEqual(DuellFiles.safeName("my-daily-idea.wav", kind: .wav), "my-daily-idea.wav")
        XCTAssertEqual(DuellFiles.safeName("../../etc/passwd", kind: .png), "passwd.png")
        XCTAssertEqual(DuellFiles.safeName("C:\\Windows\\evil.exe", kind: .png), "evil.png")
        XCTAssertEqual(DuellFiles.safeName("a b/c\u{0}.sh/a b c.html", kind: .jpeg), "a-b-c.jpg")
        XCTAssertEqual(DuellFiles.safeName(nil, kind: .png), "my-daily-idea.png")
        XCTAssertEqual(DuellFiles.safeName("", kind: .png), "my-daily-idea.png")
        XCTAssertEqual(DuellFiles.safeName("...", kind: .png), "my-daily-idea.png")
        XCTAssertEqual(DuellFiles.safeName(".wav", kind: .wav), "my-daily-idea.wav")
        XCTAssertEqual(DuellFiles.safeName("Idee mit \u{DC}ml\u{E4}uten.png", kind: .png), "Idee-mit-ml-uten.png")
        let long = DuellFiles.safeName(String(repeating: "x", count: 500) + ".png", kind: .png)
        XCTAssertLessThanOrEqual(long.count, DuellFiles.maxName)
        XCTAssertTrue(long.hasSuffix(".png"))
        let shape = try! NSRegularExpression(pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*\\.png$")
        for n in ["../x", "a/b", "..", "x.png.exe", "\n.png", "a\u{202E}gnp.exe"] {
            let s = DuellFiles.safeName(n, kind: .png)
            XCTAssertEqual(shape.numberOfMatches(in: s, range: NSRange(s.startIndex..., in: s)), 1, "\(n) -> \(s)")
            XCTAssertFalse(s.contains(".."))
        }
    }

    func testStageWritesTheFileAndSweepRemovesIt() throws {
        let file = try DuellFiles.stage(png, name: "my-daily-idea.png")
        XCTAssertEqual(try Data(contentsOf: file), png)
        XCTAssertTrue(file.path.hasPrefix(DuellFiles.cacheDir.path))
        XCTAssertEqual(DuellFiles.sweep(DuellFiles.cacheDir, maxAge: 3600), 0, "a fresh file stays")
        XCTAssertTrue(FileManager.default.fileExists(atPath: file.path))
        XCTAssertGreaterThanOrEqual(DuellFiles.sweep(DuellFiles.cacheDir, maxAge: 0), 1)
        XCTAssertFalse(FileManager.default.fileExists(atPath: file.path))
    }

    func testSweepKeepsFreshAndRemovesOldEntries() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sweep-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let old = dir.appendingPathComponent("old"), fresh = dir.appendingPathComponent("fresh")
        for d in [old, fresh] { try FileManager.default.createDirectory(at: d, withIntermediateDirectories: true); try png.write(to: d.appendingPathComponent("a.png")) }
        try FileManager.default.setAttributes([.modificationDate: Date(timeIntervalSince1970: 1000)], ofItemAtPath: old.path)
        XCTAssertEqual(DuellFiles.sweep(dir, now: Date(timeIntervalSince1970: 10_000), maxAge: 5000), 1)
        XCTAssertFalse(FileManager.default.fileExists(atPath: old.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: fresh.path))
        XCTAssertEqual(DuellFiles.sweep(dir.appendingPathComponent("missing"), maxAge: 0), 0)
    }
}
