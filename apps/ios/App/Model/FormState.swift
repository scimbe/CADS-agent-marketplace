import SwiftUI

/// Editable values for one template, mirrors the web prompt builder's form.
@MainActor
final class FormState: ObservableObject {
    @Published var text: [String: String] = [:]
    @Published var choice: [String: String] = [:]
    @Published var multi: [String: Set<String>] = [:]
    @Published var number: [String: Int] = [:]
    @Published var color: [String: Color] = [:]

    init(params: [ParamInfo], preset: [String: Any]? = nil) {
        for p in params {
            switch p.kind {
            case .text: text[p.name] = (preset?[p.name] as? String) ?? ""
            case .enum: choice[p.name] = (preset?[p.name] as? String) ?? p.options.first ?? ""
            case .multiselect: multi[p.name] = Set((preset?[p.name] as? [String]) ?? [])
            case .int: number[p.name] = (preset?[p.name] as? Int) ?? Int(p.min ?? 0)
            case .color: color[p.name] = Color(hex: preset?[p.name] as? String) ?? Color(red: 0.2, green: 0.4, blue: 0.6)
            }
        }
    }

    /// JSON object string of the current values, in the shape `render_prompt_template` expects.
    func valuesJSON(params: [ParamInfo]) -> String {
        var o: [String: Any] = [:]
        for p in params {
            switch p.kind {
            case .text: o[p.name] = text[p.name] ?? ""
            case .enum: o[p.name] = choice[p.name] ?? ""
            case .multiselect: o[p.name] = p.options.filter { multi[p.name]?.contains($0) == true }
            case .int: o[p.name] = number[p.name] ?? 0
            case .color: o[p.name] = (color[p.name] ?? .black).hexString
            }
        }
        let d = try? JSONSerialization.data(withJSONObject: o, options: [.sortedKeys])
        return d.flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }
}

extension Color {
    init?(hex: String?) {
        guard let h = hex, h.count == 7, h.hasPrefix("#"), let v = UInt32(h.dropFirst(), radix: 16) else { return nil }
        self.init(red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255)
    }
    var hexString: String {
        let c = UIColor(self)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "#%02x%02x%02x", Int((r * 255).rounded()), Int((g * 255).rounded()), Int((b * 255).rounded()))
    }
}
