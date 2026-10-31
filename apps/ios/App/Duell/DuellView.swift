import SwiftUI
import UIKit
import WebKit

/// Holds a challenge fragment that arrived via Universal Link (or the DEBUG launch argument).
@MainActor
final class DuellState: ObservableObject {
    @Published var pendingFragment: String?
}

/// Full-screen web view that loads only the bundled `duell/index.html`.
struct DuellView: View {
    @EnvironmentObject var state: DuellState

    var body: some View {
        DuellWebView(pendingFragment: $state.pendingFragment)
            .ignoresSafeArea(.container, edges: [.top, .horizontal])
            .background(Color(red: 0.063, green: 0.082, blue: 0.122).ignoresSafeArea())
    }
}

private struct DuellWebView: UIViewRepresentable {
    @Binding var pendingFragment: String?

    func makeCoordinator() -> DuellCoordinator { DuellCoordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let c = context.coordinator
        let config = WKWebViewConfiguration()
        let ucc = config.userContentController
        // Only these two handlers exist: share sheet and haptics.
        ucc.add(WeakHandler(c), name: "share")
        ucc.add(WeakHandler(c), name: "haptic")
        ucc.addUserScript(WKUserScript(source: DuellCoordinator.hostScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.websiteDataStore = .nonPersistent()

        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = c
        web.uiDelegate = c
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.bounces = false
        web.allowsLinkPreview = false
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.backgroundColor = .clear
        c.web = web
        c.start(initialFragment: pendingFragment)
        DispatchQueue.main.async { pendingFragment = nil }
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        if let f = pendingFragment {
            context.coordinator.apply(fragment: f)
            DispatchQueue.main.async { pendingFragment = nil }
        }
    }
}

private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ t: WKScriptMessageHandler) { target = t }
    func userContentController(_ u: WKUserContentController, didReceive m: WKScriptMessage) {
        target?.userContentController(u, didReceive: m)
    }
}

final class DuellCoordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    weak var web: WKWebView?
    private var pageURL: URL?
    private var loaded = false
    private var queuedFragment: String?
    private var reported = false

    /// Exposes `window.DuellHost.share(url, text)` and `.haptic(style)` to the page.
    static let hostScript = """
    window.DuellHost = Object.freeze({
      share: function (url, text) { window.webkit.messageHandlers.share.postMessage({ url: String(url), text: String(text || "") }); },
      haptic: function (style) { window.webkit.messageHandlers.haptic.postMessage({ style: String(style || "light") }); }
    });
    """

    static var bundledPage: URL? { Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "duell") }

    func start(initialFragment: String?) {
        guard web != nil, let page = Self.bundledPage else { return }
        pageURL = page
        var fragment = initialFragment
        #if DEBUG
        if fragment == nil { fragment = DuellDebug.launchFragment }
        #endif
        // Block every network load (http/https) inside the page, then load the bundled file.
        let rules = #"[{"trigger":{"url-filter":"^https?://"},"action":{"type":"block"}}]"#
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "duell-no-network", encodedContentRuleList: rules) { [weak self] list, _ in
            DispatchQueue.main.async {
                guard let self, let web = self.web else { return }
                if let list { web.configuration.userContentController.add(list) }
                var url = page
                if let f = fragment, let u = URL(string: page.absoluteString + "#" + f) { url = u }
                web.loadFileURL(url, allowingReadAccessTo: page.deletingLastPathComponent())
            }
        }
    }

    /// Apply a challenge while the game is already running.
    func apply(fragment: String) {
        guard let web, let f = DuellLink.validFragment(fragment) else { return }
        guard web.url != nil else { queuedFragment = f; return }
        web.evaluateJavaScript("location.hash = '\(f)';", completionHandler: nil)
    }

    // MARK: Navigation: only the bundled file stays in the web view, everything else goes to Safari.

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        if url.isFileURL, let page = pageURL, url.path == page.path, action.targetFrame?.isMainFrame ?? false {
            return decisionHandler(.allow)
        }
        decisionHandler(.cancel)
        openExternally(url)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { openExternally(url) }
        return nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if let f = queuedFragment { queuedFragment = nil; apply(fragment: f) }
        #if DEBUG
        if !reported { reported = true; DuellDebug.scheduleReport(web: webView) }
        #endif
    }

    private func openExternally(_ url: URL) {
        guard let scheme = url.scheme?.lowercased(), ["http", "https", "mailto"].contains(scheme) else { return }
        UIApplication.shared.open(url)
    }

    // MARK: Script messages

    func userContentController(_ u: WKUserContentController, didReceive m: WKScriptMessage) {
        guard m.frameInfo.isMainFrame, let body = m.body as? [String: Any] else { return }
        switch m.name {
        case "share":
            guard let text = body["text"] as? String, let s = body["url"] as? String,
                  let url = URL(string: s), url.scheme == "https", url.host?.lowercased() == DuellLink.host else { return }
            presentShare(url: url, text: String(text.prefix(280)))
        case "haptic":
            let style: UIImpactFeedbackGenerator.FeedbackStyle
            switch body["style"] as? String {
            case "medium": style = .medium
            case "heavy": style = .heavy
            case "soft": style = .soft
            case "rigid": style = .rigid
            default: style = .light
            }
            UIImpactFeedbackGenerator(style: style).impactOccurred()
        default: break
        }
    }

    private func presentShare(url: URL, text: String) {
        guard let web, let root = web.window?.rootViewController else { return }
        var top = root
        while let p = top.presentedViewController { top = p }
        let vc = UIActivityViewController(activityItems: [text, url], applicationActivities: nil)
        vc.popoverPresentationController?.sourceView = web
        vc.popoverPresentationController?.sourceRect = CGRect(x: web.bounds.midX, y: web.bounds.maxY - 1, width: 1, height: 1)
        top.present(vc, animated: true)
    }
}

#if DEBUG
/// CI helpers (DEBUG builds only):
///  `-DuellChallenge <fragment>`  open with a challenge fragment, like a Universal Link would
///  `-DuellReport`               after load, tap the game (or click the first button) and write Documents/duell-report.json
enum DuellDebug {
    static var launchFragment: String? {
        let a = ProcessInfo.processInfo.arguments
        guard let i = a.firstIndex(of: "-DuellChallenge"), i + 1 < a.count else { return nil }
        return DuellLink.validFragment(a[i + 1])
    }

    static func scheduleReport(web: WKWebView) {
        guard ProcessInfo.processInfo.arguments.contains("-DuellReport") else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            let snap = "JSON.stringify({hash: location.hash, text: document.body.innerText, href: location.href})"
            web.evaluateJavaScript(snap) { before, _ in
                let act = "var a=document.getElementById('app'),l='';if(a){a.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));l='tap on #app'}else{var b=document.querySelector('button');if(b){l=b.innerText;b.click()}}l"
                web.evaluateJavaScript(act) { label, _ in
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                        web.evaluateJavaScript(snap) { after, _ in
                            let report: [String: Any] = [
                                "before": (before as? String) ?? "", "clicked": (label as? String) ?? "",
                                "after": (after as? String) ?? "", "bundledPage": DuellCoordinator.bundledPage != nil,
                            ]
                            if let d = try? JSONSerialization.data(withJSONObject: report, options: [.sortedKeys]),
                               let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
                                try? d.write(to: dir.appendingPathComponent("duell-report.json"))
                            }
                        }
                    }
                }
            }
        }
    }
}
#endif
