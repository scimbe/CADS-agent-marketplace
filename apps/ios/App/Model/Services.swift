import Foundation

/// Token callback handed to the Rust client; reads the Keychain on each request.
final class KeychainTokenProvider: TokenProvider, @unchecked Sendable {
    func accessToken() -> String? { AuthService.currentAccessToken() }
}

/// The calls the UI needs. The Rust client is the production implementation; a DEBUG-only mock
/// backs UI screenshots without a server.
protocol InstallationsAPI: Sendable {
    func list() async throws -> [InstallationRecord]
    func get(id: String) async throws -> InstallationRecord
    func create(_ input: InstallationInput) async throws -> InstallationRecord
    func update(id: String, ifMatch: Int64, _ input: InstallationInput) async throws -> InstallationRecord
    func delete(id: String, ifMatch: Int64?) async throws
    func duplicate(id: String) async throws -> InstallationRecord
    /// Resolves a 409 in favour of the user's edit, built on the fresh server record (see mobile-core).
    func overwrite(id: String, name: String, valuesJson: String?, valuesDigest: String?) async throws -> InstallationRecord
}

/// Blocking Rust calls run off the main thread.
struct RustInstallationsAPI: InstallationsAPI {
    let client: InstallationsClient

    init() throws {
        client = try InstallationsClient(baseUrl: AppConfig.apiBase, tokens: KeychainTokenProvider())
    }
    func list() async throws -> [InstallationRecord] {
        try await run { try $0.list(status: nil, limit: 50, offset: 0).items }
    }
    func get(id: String) async throws -> InstallationRecord { try await run { try $0.get(id: id) } }
    func create(_ input: InstallationInput) async throws -> InstallationRecord { try await run { try $0.create(input: input) } }
    func update(id: String, ifMatch: Int64, _ input: InstallationInput) async throws -> InstallationRecord {
        try await run { try $0.update(id: id, ifMatch: ifMatch, input: input) }
    }
    func delete(id: String, ifMatch: Int64?) async throws { try await run { try $0.delete(id: id, ifMatch: ifMatch) } }
    func duplicate(id: String) async throws -> InstallationRecord { try await run { try $0.duplicate(id: id, name: nil) } }

    func overwrite(id: String, name: String, valuesJson: String?, valuesDigest: String?) async throws -> InstallationRecord {
        try await run { try $0.overwrite(id: id, name: name, valuesJson: valuesJson, valuesDigest: valuesDigest) }
    }

    private func run<T: Sendable>(_ f: @escaping @Sendable (InstallationsClient) throws -> T) async throws -> T {
        let c = client
        return try await Task.detached(priority: .userInitiated) { try f(c) }.value
    }
}

/// A bundled, signed template. `info` is nil when verification failed (shown as untrusted).
struct CatalogEntry: Identifiable {
    let id: String
    let json: String
    let info: TemplateInfo?
    let failure: String?
}

enum Catalog {
    /// Bundled samples. Later: fetched from the registry, verified by the same code path.
    static func bundled() -> [CatalogEntry] {
        // Folder reference from project.yml: the templates sit in the "prompt-templates" subdirectory.
        let urls = Bundle.main.urls(forResourcesWithExtension: "json", subdirectory: "prompt-templates") ?? []
        return urls.compactMap { url in
            guard let json = try? String(contentsOf: url, encoding: .utf8) else { return nil }
            do {
                let info = try verifyPromptTemplate(json: json)
                return CatalogEntry(id: info.templateId, json: json, info: info, failure: nil)
            } catch {
                return CatalogEntry(id: url.lastPathComponent, json: json, info: nil, failure: error.localizedDescription)
            }
        }.sorted { $0.id < $1.id }
    }
}

extension MobileError {
    /// Short, user-facing text; never contains customer values or tokens.
    var userMessage: String {
        switch self {
        case .Unauthorized: return String(localized: "err.unauthorized")
        case .NotFound: return String(localized: "err.notfound")
        case .Conflict: return String(localized: "err.conflict")
        case .Rejected422(let path, _): return String(format: String(localized: "err.rejected"), path.isEmpty ? "-" : path)
        case .Network: return String(localized: "err.network")
        case .BadSignature: return String(localized: "err.badsignature")
        case .Expired: return String(localized: "err.expired")
        case .InvalidValue(let p, let m): return "\(p): \(m)"
        default: return String(localized: "err.generic")
        }
    }
}
