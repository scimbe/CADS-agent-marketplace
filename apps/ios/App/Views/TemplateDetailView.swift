import SwiftUI

struct TemplateDetailView: View {
    @EnvironmentObject var model: AppModel
    let entry: CatalogEntry
    let info: TemplateInfo
    @StateObject private var form: FormState
    @State private var saveName = ""
    @State private var banner: String?
    @State private var saved = false

    init(entry: CatalogEntry, info: TemplateInfo) {
        self.entry = entry
        self.info = info
        _form = StateObject(wrappedValue: FormState(params: info.parameters))
    }

    private var valuesJSON: String { form.valuesJSON(params: info.parameters) }

    private var rendered: Result<RenderedPrompt, MobileError> {
        do {
            return .success(try renderPromptTemplate(templateJson: entry.json, valuesJson: valuesJSON, now: UInt64(Date().timeIntervalSince1970)))
        } catch let e as MobileError { return .failure(e) } catch { return .failure(.InvalidInput(message: "")) }
    }

    var body: some View {
        Form {
            Section("trust.title") { TrustPanel(info: info) }
            Section("form.title") { TemplateFormView(params: info.parameters, state: form) }
            Section("preview.title") {
                switch rendered {
                case .success(let r):
                    Text(r.text).font(.callout.monospaced()).textSelection(.enabled)
                        .accessibilityLabel(Text("preview.title"))
                    Button { UIPasteboard.general.string = r.text } label: { Label("preview.copy", systemImage: "doc.on.doc") }
                case .failure(let e):
                    Label(e.userMessage, systemImage: "exclamationmark.triangle").foregroundStyle(.orange)
                }
            }
            Section("save.title") {
                if model.canUseAccount {
                    TextField("save.name", text: $saveName)
                    Button("save.button") { Task { await save() } }
                        .disabled(saveName.trimmingCharacters(in: .whitespaces).isEmpty || (try? rendered.get()) == nil || info.expired)
                } else {
                    SignInPrompt()
                }
                if let banner { Text(banner).foregroundStyle(saved ? .green : .red).accessibilityAddTraits(.updatesFrequently) }
            }
        }
        .navigationTitle(info.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func save() async {
        guard let api = model.api, case .success(let r) = rendered else { return }
        await model.prepareRequest()
        let input = installationInputFromRender(name: saveName, rendered: r, valuesJson: valuesJSON, target: model.target)
        do {
            _ = try await api.create(input)
            saved = true; banner = String(localized: "save.done")
        } catch let e as MobileError {
            saved = false; banner = e.userMessage
        } catch { saved = false; banner = String(localized: "err.generic") }
    }
}

/// Everything the user needs to decide whether to trust the template, verified on this device.
struct TrustPanel: View {
    let info: TemplateInfo

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(info.signatureValid ? "trust.sig_ok" : "trust.sig_bad",
                  systemImage: info.signatureValid ? "checkmark.seal.fill" : "xmark.octagon.fill")
                .foregroundStyle(info.signatureValid ? Color.green : Color.red)
            row("trust.publisher", info.publisher)
            row("trust.valid_until", Date(timeIntervalSince1970: TimeInterval(info.validUntil)).formatted(date: .abbreviated, time: .omitted))
            if info.expired { Label("trust.expired", systemImage: "exclamationmark.triangle").foregroundStyle(.orange) }
            Text("trust.components").font(.subheadline.bold()).padding(.top, 4)
            ForEach(info.components, id: \.name) { c in
                VStack(alignment: .leading, spacing: 2) {
                    Text(c.name).font(.body.bold())
                    Text("sha256 " + c.sha256).font(.caption.monospaced()).lineLimit(2)
                    Text(c.usage).font(.caption).foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text("\(c.name). SHA-256 \(c.sha256.prefix(8)). \(c.usage)"))
            }
        }
    }

    private func row(_ key: LocalizedStringKey, _ value: String) -> some View {
        VStack(alignment: .leading) {
            Text(key).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.footnote.monospaced()).lineLimit(2).minimumScaleFactor(0.8)
        }
        .accessibilityElement(children: .combine)
    }
}

struct SignInPrompt: View {
    @EnvironmentObject var auth: AuthService
    @State private var failed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("signin.hint")
            Button("signin.button") {
                Task { do { try await auth.signIn(); failed = false } catch { failed = !(error is CancellationError) } }
            }
            if failed { Text("signin.failed").foregroundStyle(.red) }
        }
    }
}
