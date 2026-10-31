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
    /// Universal Link https://bunsenbrenner.org/duell#c=... or #i=... opens My Daily Idea with that link.
    private func handle(_ url: URL) {
        if let fragment = DuellLink.challengeFragment(from: url) { duell.pendingFragment = fragment }
    }
}

/// Where the "More" sheet opens (the page's quiet "more" button; the CI screenshots open a route directly).
enum MoreRoute: Hashable { case templates, installations }

struct RootView: View {
    @EnvironmentObject var model: AppModel
    @EnvironmentObject var duell: DuellState

    var body: some View {
        #if DEBUG
        // `-UITab 3`: show the first template's detail screen directly (CI screenshot).
        if DebugRoute.tab == 3, let e = model.catalog.first, let info = e.info {
            return AnyView(NavigationStack { TemplateDetailView(entry: e, info: info) })
        }
        #endif
        return AnyView(page)
    }

    /// My Daily Idea fills the screen. Templates and installations are not tabs of equal rank: they sit
    /// behind the page's quiet "more" and come back with "Done".
    private var page: some View {
        DuellView()
            .sheet(isPresented: $duell.showMore) { MoreView(path: DebugRoute.initialPath) }
            .onChange(of: duell.pendingFragment) { _, f in if f != nil { duell.showMore = false } }
            .onAppear {
                #if DEBUG
                if DebugRoute.tab >= 1 && DebugRoute.tab != 3 { duell.showMore = true }
                #endif
            }
    }
}

/// Native extras behind "More": the signed templates and the person's installations.
struct MoreView: View {
    @Environment(\.dismiss) private var dismiss
    @State var path: [MoreRoute]

    var body: some View {
        NavigationStack(path: $path) {
            List {
                NavigationLink(value: MoreRoute.templates) { Label("more.templates", systemImage: "doc.text.magnifyingglass") }
                NavigationLink(value: MoreRoute.installations) { Label("more.installations", systemImage: "tray.full") }
            }
            .navigationTitle("more.title")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("more.done") { dismiss() } } }
            .navigationDestination(for: MoreRoute.self) { route in
                switch route {
                case .templates: TemplatesView()
                case .installations: InstallationsView()
                }
            }
        }
    }
}

/// CI launch arguments (DEBUG only): `-UITab <0..4>` 0 page, 1 templates, 2 installations, 3 template detail, 4 More menu.
enum DebugRoute {
    static var tab: Int {
        #if DEBUG
        let a = ProcessInfo.processInfo.arguments
        if let i = a.firstIndex(of: "-UITab"), i + 1 < a.count { return Int(a[i + 1]) ?? 0 }
        #endif
        return 0
    }
    static var initialPath: [MoreRoute] {
        switch tab {
        case 1: return [.templates]
        case 2: return [.installations]
        default: return []
        }
    }
}
