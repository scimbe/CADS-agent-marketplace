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

    @EnvironmentObject var model: AppModel

    var body: some View {
        #if DEBUG
        // `-UITab 2`: show the first template's detail screen directly (CI screenshot).
        if tab == 2, let e = model.catalog.first, let info = e.info {
            return AnyView(NavigationStack { TemplateDetailView(entry: e, info: info) })
        }
        #endif
        return AnyView(tabs)
    }

    private var tabs: some View {
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
