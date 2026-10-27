import SwiftUI

@main
struct CadsApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .environmentObject(model.auth)
        }
    }
}

struct RootView: View {
    @State private var tab: Int = {
        #if DEBUG
        if let i = ProcessInfo.processInfo.arguments.firstIndex(of: "-UITab"), i + 1 < ProcessInfo.processInfo.arguments.count {
            return Int(ProcessInfo.processInfo.arguments[i + 1]) ?? 0
        }
        #endif
        return 0
    }()

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack { TemplatesView() }
                .tabItem { Label("tab.templates", systemImage: "doc.text.magnifyingglass") }
                .tag(0)
            NavigationStack { InstallationsView() }
                .tabItem { Label("tab.installations", systemImage: "tray.full") }
                .tag(1)
        }
    }
}
