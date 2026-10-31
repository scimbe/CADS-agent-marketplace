import SwiftUI

@main
struct CadsApp: App {
    @StateObject private var model = AppModel()
    @StateObject private var duell = DuellState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .environmentObject(model.auth)
                .environmentObject(duell)
                .onOpenURL { url in handle(url) }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { handle(url) }
                }
        }
    }
}

extension CadsApp {
    /// Universal Link https://bunsenbrenner.org/duell#c=... opens the Duell tab with that challenge.
    private func handle(_ url: URL) {
        if let fragment = DuellLink.challengeFragment(from: url) { duell.pendingFragment = fragment }
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
    @EnvironmentObject var duell: DuellState

    var body: some View {
        #if DEBUG
        // `-UITab 3`: show the first template's detail screen directly (CI screenshot).
        if tab == 3, let e = model.catalog.first, let info = e.info {
            return AnyView(NavigationStack { TemplateDetailView(entry: e, info: info) })
        }
        #endif
        return AnyView(tabs)
    }

    private var tabs: some View {
        TabView(selection: $tab) {
            DuellView()
                .tabItem { Label("tab.duell", systemImage: "bolt.fill") }
                .tag(0)
            NavigationStack { TemplatesView() }
                .tabItem { Label("tab.templates", systemImage: "doc.text.magnifyingglass") }
                .tag(1)
            NavigationStack { InstallationsView() }
                .tabItem { Label("tab.installations", systemImage: "tray.full") }
                .tag(2)
        }
        .onChange(of: duell.pendingFragment) { _, f in if f != nil { tab = 0 } }
    }
}
