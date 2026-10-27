import SwiftUI

struct TemplatesView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        List(model.catalog) { entry in
            if let info = entry.info {
                NavigationLink {
                    TemplateDetailView(entry: entry, info: info)
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(info.name).font(.headline)
                        Label(info.expired ? "trust.expired" : "trust.verified_short",
                              systemImage: info.expired ? "exclamationmark.triangle" : "checkmark.seal")
                            .font(.subheadline)
                            .foregroundStyle(info.expired ? Color.orange : Color.green)
                        Text("v\(info.version)").font(.caption).foregroundStyle(.secondary)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityHint(Text("templates.open.hint"))
            } else {
                Label(entry.failure ?? "?", systemImage: "xmark.octagon").foregroundStyle(.red)
                    .accessibilityLabel(Text("trust.unverifiable"))
            }
        }
        .navigationTitle("templates.title")
        .overlay { if model.catalog.isEmpty { ContentUnavailableView("templates.empty", systemImage: "doc") } }
    }
}
