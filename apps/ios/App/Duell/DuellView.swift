import SwiftUI
import UIKit
import WebKit

/// State shared between the page and the SwiftUI shell: a link that arrived via Universal Link (or the
/// DEBUG launch argument) and whether the native "More" sheet is open.
@MainActor
final class DuellState: ObservableObject {
    @Published var pendingFragment: String?
    @Published var showMore = false
}

/// Full-screen web view that loads only the bundled `duell/index.html` (My Daily Idea).
struct DuellView: View {
    @EnvironmentObject var state: DuellState

    var body: some View {
        DuellWebView(pendingFragment: $state.pendingFragment, onMore: { state.showMore = true })
            .ignoresSafeArea()   // the page pads itself with env(safe-area-inset-*)
            .background(Color(red: 1.0, green: 0.831, blue: 0.0).ignoresSafeArea())   // brand yellow #FFD400
    }
}

private struct DuellWebView: UIViewRepresentable {
    @Binding var pendingFragment: String?
    let onMore: () -> Void

    func makeCoordinator() -> DuellCoordinator { DuellCoordinator(onMore: onMore) }

    func makeUIView(context: Context) -> WKWebView {
        let c = context.coordinator
        let config = WKWebViewConfiguration()
        let ucc = config.userContentController
        // Only these handlers exist: share sheet (link / file), save, haptics and the quiet "more".
        for name in DuellCoordinator.handlerNames { ucc.add(WeakHandler(c), name: name) }
        ucc.addUserScript(WKUserScript(source: DuellCoordinator.hostScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        // The page keeps its wall and profile in localStorage; that has to survive a restart.
        config.websiteDataStore = .default()

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

final class DuellCoordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UIDocumentPickerDelegate {
    weak var web: WKWebView?
    private let onMore: () -> Void
    private var pageURL: URL?
    private var queuedFragment: String?
    private var reported = false
    private var exportDir: URL?
    private lazy var peer = PeerBridge(
        port: PeerCoreAdapter.fromBuild(),
        token: { AuthService.currentAccessToken() },
        emit: { [weak self] json in DispatchQueue.main.async { self?.web?.evaluateJavaScript(PeerJson.call(json), completionHandler: nil) } },
        spawn: { work in DispatchQueue.global(qos: .userInitiated).async(execute: work) }
    )

    init(onMore: @escaping () -> Void) {
        self.onMore = onMore
        super.init()
        // Everything left in the share cache from an earlier run is not needed any more.
        let n = DuellFiles.sweep(DuellFiles.cacheDir, maxAge: 0)
        #if DEBUG
        DuellDebug.note("sweptAtStart", n)
        #endif
    }

    #if DEBUG
    static let handlerNames = ["share", "shareFile", "saveFile", "haptic", "more", "peerInvite", "peerAccept", "peerSend", "peerLeave", "dbgResult"]
    #else
    static let handlerNames = ["share", "shareFile", "saveFile", "haptic", "more", "peerInvite", "peerAccept", "peerSend", "peerLeave"]
    #endif

    /// Exposes `window.DuellHost` to the page. `navigator.share` is removed on purpose: the page then
    /// always goes through `shareFile` / `share`, where type, size, name and link are checked and the
    /// cache file is cleaned up afterwards.
    static var hostScript: String { """
    try { delete Navigator.prototype.share; delete Navigator.prototype.canShare; } catch (e) {}
    (function () {
      var h = window.webkit.messageHandlers;
      window.DuellHost = Object.freeze({
        share: function (url, text) { h.share.postMessage({ url: String(url), text: String(text || "") }); },
        shareFile: function (b64, typ, name, url, text) { h.shareFile.postMessage({ b64: String(b64), typ: String(typ), name: String(name || ""), url: String(url || ""), text: String(text || "") }); },
        saveFile: function (b64, typ, name) { h.saveFile.postMessage({ b64: String(b64), typ: String(typ), name: String(name || "") }); },
        haptic: function (style) { h.haptic.postMessage({ style: String(style || "light") }); },
        more: function () { h.more.postMessage({}); },
        peerReady: function () { return \(PeerCoreAdapter.fromBuild() != nil); },
        peerInvite: function () { h.peerInvite.postMessage({}); },
        peerAccept: function (link) { h.peerAccept.postMessage({ link: String(link) }); },
        peerSend: function (frame) { h.peerSend.postMessage({ frame: String(frame) }); },
        peerLeave: function () { h.peerLeave.postMessage({}); }
      });
    })();
    """ }

    static var bundledPage: URL? { Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "duell") }

    func start(initialFragment: String?) {
        guard web != nil, let page = Self.bundledPage else { return }
        pageURL = page
        var fragment = initialFragment
        #if DEBUG
        if fragment == nil { fragment = DuellDebug.launchFragment }
        #endif
        // Block every network load (http/https) inside the page, then load the bundled page.
        let rules = #"[{"trigger":{"url-filter":"^https?://"},"action":{"type":"block"}}]"#
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "duell-no-network", encodedContentRuleList: rules) { [weak self] list, _ in
            DispatchQueue.main.async {
                guard let self, let web = self.web, let base = self.pageURL else { return }
                if let list { web.configuration.userContentController.add(list) }
                var url = base
                if let f = fragment, let u = URL(string: base.absoluteString + "#" + f) { url = u }
                web.loadFileURL(url, allowingReadAccessTo: base.deletingLastPathComponent())
            }
        }
    }

    /// Apply a link while the page is already running; the page listens to `hashchange`.
    func apply(fragment: String) {
        guard let web, let f = DuellLink.validFragment(fragment) else { return }
        guard web.url != nil else { queuedFragment = f; return }
        web.evaluateJavaScript("location.hash = '\(f)';", completionHandler: nil)
    }

    // MARK: Navigation: only the bundled page stays in the web view, everything else goes to Safari.

    private func isOwnPage(_ url: URL) -> Bool {
        guard let page = pageURL else { return false }
        return url.isFileURL && url.path == page.path
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        if isOwnPage(url), action.targetFrame?.isMainFrame ?? false { return decisionHandler(.allow) }
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
        if !reported { reported = true; DuellDebug.runScenarioIfRequested(web: webView) }
        #endif
    }

    private func openExternally(_ url: URL) {
        guard let scheme = url.scheme?.lowercased(), ["http", "https", "mailto"].contains(scheme) else { return }
        UIApplication.shared.open(url)
    }

    // MARK: Microphone: only the page's own origin, only audio, only when the page asks (after the tap on record).

    private func isOwnOrigin(_ origin: WKSecurityOrigin) -> Bool {
        // getUserMedia works for the bundled file:// page (checked in the simulator), so no custom scheme is needed.
        return origin.protocol == "file"
    }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        #if DEBUG
        DuellDebug.note("mediaCaptureRequest", ["type": type.rawValue, "protocol": origin.protocol, "host": origin.host, "main": frame.isMainFrame])
        if ProcessInfo.processInfo.arguments.contains("-DuellMicDeny") { return decisionHandler(.deny) }
        #endif
        guard type == .microphone, frame.isMainFrame, isOwnOrigin(origin) else { return decisionHandler(.deny) }
        // The system asks the person once (NSMicrophoneUsageDescription); a refusal makes getUserMedia fail
        // and the page falls back to the silly voice.
        decisionHandler(.grant)
    }

    // MARK: Script messages

    func userContentController(_ u: WKUserContentController, didReceive m: WKScriptMessage) {
        #if DEBUG
        if m.name == "dbgResult" { DuellDebug.finish(m.body); return }
        #endif
        guard m.frameInfo.isMainFrame, let body = m.body as? [String: Any] else { return }
        switch m.name {
        case "share":
            guard let s = body["url"] as? String, DuellLink.isShareable(s), let url = URL(string: s) else { return }
            presentShare(items: [Self.caption(text: body["text"] as? String, link: url.absoluteString)], cleanup: nil)
        case "shareFile":
            guard let (file, link) = stage(body, sharing: true) else { return }
            var items: [Any] = [file]
            let caption = Self.caption(text: body["text"] as? String, link: link)
            if !caption.isEmpty { items.append(caption) }
            presentShare(items: items, cleanup: file.deletingLastPathComponent())
        case "saveFile":
            guard let (file, _) = stage(body, sharing: false) else { return }
            presentExport(file)
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
        case "more":
            onMore()
        case "peerInvite": peer.invite()
        case "peerAccept": peer.accept(body["link"] as? String)
        case "peerSend": peer.send(body["frame"] as? String)
        case "peerLeave": peer.leave()
        default: break
        }
    }

    /// Validates the payload from the page (type, magic number, size, name, link) and writes it into the
    /// cache folder. Anything wrong: nothing happens.
    private func stage(_ body: [String: Any], sharing: Bool) -> (URL, String?)? {
        guard let kind = DuellFiles.kind(of: body["typ"] as? String), let data = DuellFiles.decode(body["b64"] as? String, as: kind) else { return nil }
        DuellFiles.sweep(DuellFiles.cacheDir, maxAge: DuellFiles.staleSeconds)
        let name = DuellFiles.safeName(body["name"] as? String, kind: kind)
        guard let file = try? DuellFiles.stage(data, name: name) else { return nil }
        let link = (body["url"] as? String).flatMap { DuellLink.isShareable($0) ? $0 : nil }
        #if DEBUG
        DuellDebug.noteFile(sharing ? "shareFile" : "saveFile", file)
        #endif
        return (file, link)
    }

    private static func caption(text: String?, link: String?) -> String {
        [text.map { String($0.prefix(500)) }.flatMap { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : $0 }, link]
            .compactMap { $0 }.joined(separator: "\n")
    }

    private func topViewController() -> UIViewController? {
        var window = web?.window
        if window == nil {
            let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
            window = scene?.windows.first(where: { $0.isKeyWindow })
        }
        var top = window?.rootViewController
        while let p = top?.presentedViewController { top = p }
        return top
    }

    private func presentShare(items: [Any], cleanup: URL?) {
        guard let web, let top = topViewController() else { if let cleanup { try? FileManager.default.removeItem(at: cleanup) }; return }
        let vc = UIActivityViewController(activityItems: items, applicationActivities: nil)
        vc.popoverPresentationController?.sourceView = web
        vc.popoverPresentationController?.sourceRect = CGRect(x: web.bounds.midX, y: web.bounds.maxY - 1, width: 1, height: 1)
        // The receiving app is done when the sheet reports back; the cache copy goes then (and at the next start).
        vc.completionWithItemsHandler = { _, _, _, _ in if let cleanup { try? FileManager.default.removeItem(at: cleanup) } }
        top.present(vc, animated: true)
        #if DEBUG
        DuellDebug.note("shareSheetPresented", true)
        #endif
    }

    /// "Save" = export through the Files picker (no photo-library or storage permission needed).
    private func presentExport(_ file: URL) {
        guard let top = topViewController() else { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()); return }
        exportDir = file.deletingLastPathComponent()
        let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
        picker.delegate = self
        top.present(picker, animated: true)
        #if DEBUG
        DuellDebug.note("exportPickerPresented", true)
        #endif
    }

    private func finishExport() {
        if let d = exportDir { try? FileManager.default.removeItem(at: d) }
        exportDir = nil
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { finishExport() }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { finishExport() }
}

#if DEBUG
/// CI helpers (DEBUG builds only; the simulator offers no tap injection, so the page is driven through its DOM):
///  `-DuellChallenge <fragment>`  open with a link fragment, like a Universal Link would
///  `-DuellMicDeny`               refuse microphone requests (exercises the fallback without a system dialog)
///  `-DuellScenario <name>`       after load, run a scripted flow in the page and write Documents/duell-scenario.json.
///                                names: probe, more, share, save, mic
enum DuellDebug {
    private static var notes: [String: Any] = [:]

    static var launchFragment: String? {
        let a = ProcessInfo.processInfo.arguments
        guard let i = a.firstIndex(of: "-DuellChallenge"), i + 1 < a.count else { return nil }
        return DuellLink.validFragment(a[i + 1])
    }

    static var scenario: String? {
        let a = ProcessInfo.processInfo.arguments
        guard let i = a.firstIndex(of: "-DuellScenario"), i + 1 < a.count else { return nil }
        return a[i + 1]
    }

    static func note(_ key: String, _ value: Any) {
        notes[key] = value
        if scenario != nil { write(["native": notes]) }
    }

    /// What the page handed over arrived in the cache folder with real content (size and first bytes).
    static func noteFile(_ key: String, _ file: URL) {
        let data = (try? Data(contentsOf: file)) ?? Data()
        note(key, ["name": file.lastPathComponent, "bytes": data.count, "magic": data.prefix(12).map { String(format: "%02x", $0) }.joined(),
                   "inCache": file.path.hasPrefix(DuellFiles.cacheDir.path)])
    }

    private static var lastScript: [String: Any] = [:]

    private static func write(_ extra: [String: Any]) {
        for (k, v) in extra where k != "native" { lastScript[k] = v }
        var report = lastScript
        report["native"] = notes
        if let d = try? JSONSerialization.data(withJSONObject: report, options: [.sortedKeys]),
           let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
            try? d.write(to: dir.appendingPathComponent("duell-scenario.json"))
        }
    }

    private static let prelude = """
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const $ = s => document.querySelector(s);
    const out = { log: [] };
    const log = (k, v) => out.log.push([k, v]);
    const clickEl = async (el, wait) => { if (!el) throw new Error('missing element'); el.click(); await sleep(wait || 350); };
    const btn = re => [...document.querySelectorAll('button')].find(b => re.test(b.textContent.trim()) && b.offsetParent !== null);
    const openIdea = async id => { location.hash = 'i=' + id; await sleep(1200); await clickEl($('#go'), 800); };
    const visits = Number(localStorage.getItem('dbg.visits') || 0); localStorage.setItem('dbg.visits', String(visits + 1));
    log('env', { href: location.href, origin: location.origin, secure: window.isSecureContext, mediaDevices: typeof navigator.mediaDevices,
                 getUserMedia: typeof (navigator.mediaDevices && navigator.mediaDevices.getUserMedia), mediaRecorder: typeof MediaRecorder,
                 navigatorShare: typeof navigator.share, host: typeof window.DuellHost, hostMore: typeof (window.DuellHost && window.DuellHost.more),
                 visitsBefore: visits, lang: navigator.language, brand: ($('#brand') || {}).textContent, hostButtonHidden: ($('#host') || {}).hidden });
    """

    private static let flows: [String: String] = [
        "probe": "",
        "more": "await clickEl($('#host'), 1200); log('moreTapped', true);",
        "share": """
            await openIdea('quiz-chaos');
            await clickEl(btn(/^(Stickers|Sticker)$/)); await clickEl($('#panel .chip.em'));
            log('footer', $('#edmain').textContent); await clickEl($('#edmain'), 1500);
            log('doneImg', !!$('#doneimg').src); await clickEl($('#share'), 1500);
            """,
        "save": """
            await openIdea('quiz-chaos');
            await clickEl(btn(/^(Stickers|Sticker)$/)); await clickEl($('#panel .chip.em'));
            await clickEl($('#edmain'), 1500); log('saveHidden', $('#save').hidden); await clickEl($('#save'), 1500);
            """,
        "mic": """
            await openIdea('stimme-monster');
            await clickEl(btn(/Record|Aufnehmen/), 1500);
            log('toast', $('#toast').textContent);
            await clickEl(btn(/Silly voice|Quatschstimme/)); await clickEl(btn(/^Echo$/));
            log('footer', $('#edmain').textContent); await clickEl($('#edmain'), 1500); await clickEl($('#save'), 1500);
            """,
    ]

    /// The flow runs as an async function in the page and reports through the `dbgResult` message handler
    /// (callAsyncJavaScript's Result-based variant lives in the Swift WebKit overlay, which the simulator runtime lacks).
    static func runScenarioIfRequested(web: WKWebView) {
        guard let name = scenario, let flow = flows[name] else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            let script = "(async () => {" + prelude + "try {" + flow + "} catch (e) { log('error', String(e && e.message || e)); }\n"
                + "log('text', document.body.innerText.slice(0, 600)); window.webkit.messageHandlers.dbgResult.postMessage(JSON.stringify(out)); })();"
            web.evaluateJavaScript(script, completionHandler: nil)
        }
    }

    static func finish(_ body: Any) {
        var page: Any = "no result"
        if let s = body as? String, let d = s.data(using: .utf8), let j = try? JSONSerialization.jsonObject(with: d) { page = j }
        write(["page": page, "scenario": scenario ?? ""])
        note("done", true)
    }
}
#endif
