import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    let auth = AuthService()
    let catalog = Catalog.bundled()
    let api: InstallationsAPI?
    let isMock: Bool

    init() {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-UIMockInstallations") {
            api = MockInstallationsAPI(templateJSON: catalog.first?.json)
            isMock = true
            return
        }
        #endif
        api = try? RustInstallationsAPI()
        isMock = false
    }

    var canUseAccount: Bool { isMock || auth.isSignedIn }

    func prepareRequest() async { if !isMock { await auth.ensureFresh() } }

    var target: TargetRecord {
        TargetRecord(os: "ios", deviceLabel: UIDevice.current.model, agentHolderPubkey: nil)
    }
}
