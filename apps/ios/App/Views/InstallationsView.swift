import SwiftUI

struct InstallationsView: View {
    @EnvironmentObject var model: AppModel
    @EnvironmentObject var auth: AuthService
    @State private var items: [InstallationRecord] = []
    @State private var loading = false
    @State private var loadError: String?

    var body: some View {
        Group {
            if !model.canUseAccount {
                Form { Section { SignInPrompt() } }
            } else {
                List {
                    if let loadError { Label(loadError, systemImage: "exclamationmark.triangle").foregroundStyle(.orange) }
                    ForEach(items, id: \.id) { rec in
                        NavigationLink {
                            InstallationDetailView(record: rec) { Task { await load() } }
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(rec.name).font(.headline)
                                Text(statusText(rec.status)).font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                .overlay { if items.isEmpty && !loading && loadError == nil { ContentUnavailableView("inst.empty", systemImage: "tray") } }
                .refreshable { await load() }
            }
        }
        .navigationTitle("inst.title")
        .toolbar {
            if auth.isSignedIn && !model.isMock {
                Button("signout.button") { auth.signOut(); items = [] }
            }
        }
        .task(id: model.canUseAccount) { if model.canUseAccount { await load() } }
    }

    private func statusText(_ s: InstallationStatus) -> LocalizedStringKey {
        switch s { case .draft: "status.draft"; case .installed: "status.installed"; case .removed: "status.removed" }
    }

    private func load() async {
        guard let api = model.api else { return }
        loading = true; defer { loading = false }
        await model.prepareRequest()
        do { items = try await api.list(); loadError = nil }
        catch let e as MobileError {
            loadError = e.userMessage
            if case .Unauthorized = e { auth.signOut() }
        } catch { loadError = String(localized: "err.generic") }
    }
}

struct InstallationDetailView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State var record: InstallationRecord
    let onChange: () -> Void

    @State private var name: String
    @StateObject private var form: FormState
    @State private var params: [ParamInfo] = []
    @State private var templateJSON: String?
    @State private var message: String?
    @State private var conflictRevision: Int64?
    @State private var confirmDelete = false

    init(record: InstallationRecord, onChange: @escaping () -> Void) {
        _record = State(initialValue: record)
        self.onChange = onChange
        _name = State(initialValue: record.name)
        _form = StateObject(wrappedValue: FormState(params: []))
    }

    var body: some View {
        Form {
            Section("inst.name") { TextField("inst.name", text: $name) }
            Section("form.title") {
                if templateJSON != nil {
                    TemplateFormView(params: params, state: form)
                } else {
                    Text("inst.template_unknown").foregroundStyle(.secondary)
                }
            }
            Section("trust.components") {
                ForEach(record.components, id: \.name) { c in
                    VStack(alignment: .leading) {
                        Text(c.name).bold()
                        Text("sha256 " + c.sha256).font(.caption.monospaced()).lineLimit(2)
                    }.accessibilityElement(children: .combine)
                }
                Text("revision \(record.revision)").font(.caption).foregroundStyle(.secondary)
            }
            Section {
                Button("inst.save") { Task { await save() } }
                Button("inst.duplicate") { Task { await duplicate() } }
                Button("inst.delete", role: .destructive) { confirmDelete = true }
                if let message { Text(message).accessibilityAddTraits(.updatesFrequently) }
            }
        }
        .navigationTitle(record.name)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear(perform: setupForm)
        .confirmationDialog("inst.delete.confirm", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("inst.delete", role: .destructive) { Task { await delete() } }
        }
        .alert("conflict.title", isPresented: Binding(get: { conflictRevision != nil }, set: { if !$0 { conflictRevision = nil } })) {
            Button("conflict.reload", role: .cancel) { Task { await reload() } }
            Button("conflict.overwrite") { Task { await overwrite() } }
        } message: {
            Text(String(format: String(localized: "conflict.message"), Int(conflictRevision ?? 0)))
        }
    }

    private func setupForm() {
        guard templateJSON == nil, let entry = model.catalog.first(where: { $0.info?.templateId == record.templateId }),
              let info = entry.info else { return }
        templateJSON = entry.json
        params = info.parameters
        let preset = (try? JSONSerialization.jsonObject(with: Data(record.valuesJson.utf8))) as? [String: Any]
        let fresh = FormState(params: info.parameters, preset: preset)
        form.text = fresh.text; form.choice = fresh.choice; form.multi = fresh.multi
        form.number = fresh.number; form.color = fresh.color
    }

    private func buildInput() throws -> InstallationInput {
        var input = installationInputFromRecord(r: record)
        input.name = name
        if let json = templateJSON {
            let values = form.valuesJSON(params: params)
            let r = try renderPromptTemplate(templateJson: json, valuesJson: values, now: UInt64(Date().timeIntervalSince1970))
            input.valuesJson = values
            input.valuesDigest = r.valuesDigest
        }
        return input
    }

    private func save() async { await write(ifMatch: record.revision) }

    private func overwrite() async {
        // Keep my edits, base them on the server's current revision.
        guard let api = model.api else { return }
        await model.prepareRequest()
        if let cur = try? await api.get(id: record.id) { await write(ifMatch: cur.revision) }
    }

    private func write(ifMatch: Int64) async {
        guard let api = model.api else { return }
        await model.prepareRequest()
        do {
            record = try await api.update(id: record.id, ifMatch: ifMatch, try buildInput())
            message = String(localized: "save.done"); onChange()
        } catch MobileError.Conflict(let cur) {
            conflictRevision = cur ?? record.revision + 1
        } catch let e as MobileError {
            message = e.userMessage
        } catch { message = String(localized: "err.generic") }
    }

    private func reload() async {
        guard let api = model.api else { return }
        await model.prepareRequest()
        if let r = try? await api.get(id: record.id) {
            record = r; name = r.name; templateJSON = nil; setupForm(); message = String(localized: "conflict.reloaded")
        }
    }

    private func duplicate() async {
        guard let api = model.api else { return }
        await model.prepareRequest()
        do { _ = try await api.duplicate(id: record.id); onChange(); message = String(localized: "inst.duplicated") }
        catch let e as MobileError { message = e.userMessage } catch { message = String(localized: "err.generic") }
    }

    private func delete() async {
        guard let api = model.api else { return }
        await model.prepareRequest()
        do { try await api.delete(id: record.id, ifMatch: record.revision); onChange(); dismiss() }
        catch MobileError.Conflict(let cur) { conflictRevision = cur ?? record.revision + 1 }
        catch let e as MobileError { message = e.userMessage } catch { message = String(localized: "err.generic") }
    }
}
