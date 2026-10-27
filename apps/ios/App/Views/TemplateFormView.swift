import SwiftUI

/// Form generated from the signed parameter bounds; limits are shown, not just enforced.
struct TemplateFormView: View {
    let params: [ParamInfo]
    @ObservedObject var state: FormState

    var body: some View {
        ForEach(params, id: \.name) { p in
            switch p.kind {
            case .text:
                VStack(alignment: .leading) {
                    Text(p.name).font(.subheadline.bold())
                    if p.multiline {
                        TextEditor(text: binding(\.text, p.name))
                            .frame(minHeight: 100)
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.secondary.opacity(0.4)))
                    } else {
                        TextField(p.name, text: binding(\.text, p.name))
                            .textFieldStyle(.roundedBorder)
                    }
                    Text(String(format: String(localized: "form.chars"), (state.text[p.name] ?? "").count, Int(p.maxLen ?? 0)))
                        .font(.caption).foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel(Text(p.name))
            case .enum:
                Picker(p.name, selection: binding(\.choice, p.name)) {
                    ForEach(p.options, id: \.self) { Text($0).tag($0) }
                }
            case .multiselect:
                VStack(alignment: .leading) {
                    Text(p.name).font(.subheadline.bold())
                    ForEach(p.options, id: \.self) { o in
                        Toggle(o, isOn: Binding(
                            get: { state.multi[p.name]?.contains(o) == true },
                            set: { on in
                                if on { state.multi[p.name, default: []].insert(o) } else { state.multi[p.name]?.remove(o) }
                            }))
                    }
                    if let n = p.note { Text(n).font(.caption).foregroundStyle(.secondary) }
                }
            case .int:
                Stepper(value: Binding(get: { state.number[p.name] ?? 0 }, set: { state.number[p.name] = $0 }),
                        in: Int(p.min ?? 0)...Int(p.max ?? 0)) {
                    Text("\(p.name): \(state.number[p.name] ?? 0)")
                    + Text("  (\(p.min ?? 0)–\(p.max ?? 0))").foregroundStyle(.secondary)
                }
                .accessibilityValue(Text("\(state.number[p.name] ?? 0)"))
            case .color:
                ColorPicker(p.name, selection: Binding(get: { state.color[p.name] ?? .black }, set: { state.color[p.name] = $0 }),
                            supportsOpacity: false)
            }
        }
    }

    private func binding<T>(_ kp: ReferenceWritableKeyPath<FormState, [String: T]>, _ key: String) -> Binding<T> where T: DefaultInit {
        Binding(get: { state[keyPath: kp][key] ?? T() }, set: { state[keyPath: kp][key] = $0 })
    }
}

protocol DefaultInit { init() }
extension String: DefaultInit {}
