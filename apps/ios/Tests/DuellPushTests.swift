import XCTest

/// Same cases as apps/android/app/src/test/resources/bridge-push-v1.json (Android reads the file in PushBridgeTest).
final class DuellPushTests: XCTestCase {
    func testCapabilityFollowsTheSharedContract() {
        XCTAssertEqual(DuellPush.capability(kind: "none", state: "unsupported"), "{\"v\":1,\"kind\":\"none\",\"state\":\"unsupported\"}")
        XCTAssertEqual(DuellPush.capability(kind: "fcm", state: "default"), "{\"v\":1,\"kind\":\"fcm\",\"state\":\"default\"}")
        XCTAssertEqual(DuellPush.capability(kind: "unifiedpush", state: "granted"), "{\"v\":1,\"kind\":\"unifiedpush\",\"state\":\"granted\"}")
        XCTAssertEqual(DuellPush.capability(kind: "apns", state: "denied"), "{\"v\":1,\"kind\":\"apns\",\"state\":\"denied\"}")
        XCTAssertEqual(DuellPush.capability(kind: "evil\",\"x\":\"1", state: "granted"), DuellPush.none)
        XCTAssertEqual(DuellPush.capability(kind: "fcm", state: "maybe"), DuellPush.none)
        XCTAssertEqual(DuellPush.current, DuellPush.none, "this build has no APNs yet")
        XCTAssertFalse(DuellPush.current.contains("'"), "safe inside the single-quoted literal of the host script")
    }

    func testWakeUpCarriesOnlyItsKind() {
        XCTAssertEqual(DuellPush.kindOf("{\"r\":\"reply\"}"), "reply")
        XCTAssertEqual(DuellPush.kindOf("{\"r\":\"live\"}"), "live")
        XCTAssertEqual(DuellPush.kindOf("{\"r\":\"reply\",\"name\":\"Mira\",\"text\":\"geheim\"}"), "reply")
        for bad in ["{\"r\":\"streak\"}", "{\"r\":\"REPLY\"}", "{\"r\":1}", "kaputt", ""] { XCTAssertNil(DuellPush.kindOf(bad), bad) }
        XCTAssertNil(DuellPush.kindOf(nil))
    }
}
