#if DEBUG
import Foundation

/// DEBUG only, enabled by the launch argument `-UIMockInstallations`: in-memory data so the
/// "Meine Installationen" screens can be shown without a Keycloak account or server.
actor MockStore {
    var items: [InstallationRecord]
    init(_ items: [InstallationRecord]) { self.items = items }
    func all() -> [InstallationRecord] { items }
    func put(_ r: InstallationRecord) { items.removeAll { $0.id == r.id }; items.insert(r, at: 0) }
    func remove(_ id: String) { items.removeAll { $0.id == id } }
    func find(_ id: String) -> InstallationRecord? { items.first { $0.id == id } }
}

struct MockInstallationsAPI: InstallationsAPI {
    let store: MockStore
    init(templateJSON: String?) {
        let info = templateJSON.flatMap { try? verifyPromptTemplate(json: $0) }
        let h = info?.templateId ?? String(repeating: "a", count: 64)
        func rec(_ id: String, _ name: String, _ topic: String, _ rev: Int64, _ status: InstallationStatus) -> InstallationRecord {
            InstallationRecord(id: id, name: name, templateId: h, templateDigest: info?.templateDigest ?? h,
                               valuesJson: "{\"topic\":\"\(topic)\",\"audience\":\"Team\",\"sections\":[\"Risiken\"],\"max_items\":3,\"accent_color\":\"#336699\"}",
                               valuesDigest: h, components: info?.components.map { ComponentRecord(name: $0.name, sha256: $0.sha256) } ?? [],
                               manifestIds: [], target: TargetRecord(os: "ios", deviceLabel: "iPhone", agentHolderPubkey: nil),
                               status: status, createdAt: 1_790_000_000, updatedAt: 1_790_100_000, revision: rev)
        }
        store = MockStore([rec("m-1", "Quartals-Briefing", "Quartalszahlen", 2, .installed), rec("m-2", "Team-Newsletter", "Teamnews", 1, .draft)])
    }
    func list() async throws -> [InstallationRecord] { await store.all() }
    func get(id: String) async throws -> InstallationRecord {
        guard let r = await store.find(id) else { throw MobileError.NotFound }
        return r
    }
    func create(_ input: InstallationInput) async throws -> InstallationRecord {
        let r = InstallationRecord(id: UUID().uuidString, name: input.name, templateId: input.templateId, templateDigest: input.templateDigest,
                                   valuesJson: input.valuesJson, valuesDigest: input.valuesDigest, components: input.components, manifestIds: [],
                                   target: input.target, status: .draft, createdAt: Int64(Date().timeIntervalSince1970), updatedAt: Int64(Date().timeIntervalSince1970), revision: 1)
        await store.put(r); return r
    }
    func update(id: String, ifMatch: Int64, _ input: InstallationInput) async throws -> InstallationRecord {
        guard let cur = await store.find(id) else { throw MobileError.NotFound }
        if cur.revision != ifMatch { throw MobileError.Conflict(currentRevision: cur.revision) }
        var r = cur
        r.name = input.name; r.valuesJson = input.valuesJson; r.valuesDigest = input.valuesDigest
        r.revision += 1; r.updatedAt = Int64(Date().timeIntervalSince1970)
        await store.put(r); return r
    }
    func delete(id: String, ifMatch: Int64?) async throws { await store.remove(id) }
    func duplicate(id: String) async throws -> InstallationRecord {
        guard var r = await store.find(id) else { throw MobileError.NotFound }
        r.id = UUID().uuidString; r.name += " (copy)"; r.revision = 1; r.status = .draft
        await store.put(r); return r
    }
}
#endif
