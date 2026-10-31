import XCTest

final class DuellLinkTests: XCTestCase {
    private func frag(_ s: String) -> String? { URL(string: s).flatMap(DuellLink.challengeFragment(from:)) }

    func testShortLinkBecomesFragmentForThePage() {
        XCTAssertEqual(frag("https://bunsenbrenner.org/s/aB3dE5gH"), "s=aB3dE5gH")
        XCTAssertEqual(DuellLink.validFragment("s=aB3dE5gH"), "s=aB3dE5gH")
        XCTAssertTrue(DuellLink.isShareable("https://bunsenbrenner.org/s/aB3dE5gH"))
    }

    func testForeignShortLinksAreRejected() {
        for bad in ["https://evil.example/s/aB3dE5gH", "http://bunsenbrenner.org/s/aB3dE5gH", "https://bunsenbrenner.org:8443/s/aB3dE5gH",
                    "https://bunsenbrenner.org/s/aB3dE5g", "https://bunsenbrenner.org/s/aB3dE5gHi", "https://bunsenbrenner.org/s/aB3dE5g0",
                    "https://bunsenbrenner.org/s/aB3dE5gO", "https://bunsenbrenner.org/s/../duell", "https://bunsenbrenner.org/s/aB3dE5gH/x",
                    "https://bunsenbrenner.org/s/aB3dE5gH?x=1", "https://bunsenbrenner.org/s/"] {
            XCTAssertNil(frag(bad), bad)
            XCTAssertFalse(DuellLink.isShareable(bad), bad)
        }
        for bad in ["s=", "s=short", "s=aB3dE5g0", "s=aB3dE5gHi", "s=aB3dE5g\""] { XCTAssertNil(DuellLink.validFragment(bad), bad) }
    }

    func testChallengeFragmentIsAccepted() {
        XCTAssertEqual(frag("https://bunsenbrenner.org/duell#c=eyJ2IjoxfQ"), "c=eyJ2IjoxfQ")
        XCTAssertEqual(frag("https://bunsenbrenner.org/duell/#c=eyJ2IjoxfQ=="), "c=eyJ2IjoxfQ==")
        XCTAssertEqual(DuellLink.validFragment("c=a-b_c"), "c=a-b_c")
    }

    func testInviteFragmentIsAcceptedNextToChallenge() {
        XCTAssertEqual(frag("https://bunsenbrenner.org/duell#i=quiz-chaos"), "i=quiz-chaos")
        XCTAssertEqual(frag("https://bunsenbrenner.org/duell/#i=quiz-chaos"), "i=quiz-chaos")
        XCTAssertEqual(DuellLink.validFragment("i=" + String(repeating: "a", count: 32)), "i=" + String(repeating: "a", count: 32))
        XCTAssertEqual(DuellLink.validFragment("i=a"), "i=a")
    }

    func testMalformedFragmentsAreRejected() {
        for bad in ["", "c=", "i=", "x=abc", "I=quiz", "C=abc", "c=a b", "c=a\"+alert(1)+\"", "c=<script>",
                    "i=Quiz-Chaos", "i=a_b", "i=../x", "i=a&c=b", "i=a b", "i=a\"+alert(1)+\"", "i=\u{e4}b", "i=a\u{301}",
                    "i=" + String(repeating: "a", count: 33), "c=" + String(repeating: "A", count: 9000), "c=a&i=b"] {
            XCTAssertNil(DuellLink.validFragment(bad), "should reject \(bad.prefix(40))")
        }
    }

    func testForeignLinksAreRejectedForBothFragments() {
        for f in ["c=abc", "i=quiz-chaos"] {
            XCTAssertNil(frag("https://evil.example/duell#\(f)"))
            XCTAssertNil(frag("http://bunsenbrenner.org/duell#\(f)"))
            XCTAssertNil(frag("https://bunsenbrenner.org/app/oauth2redirect#\(f)"))
            XCTAssertNil(frag("https://bunsenbrenner.org/duellx#\(f)"))
            XCTAssertNil(frag("https://bunsenbrenner.org.evil.example/duell#\(f)"))
        }
        XCTAssertNil(frag("https://bunsenbrenner.org/duell"))
    }

    func testOnlyThePublicDuellLinkIsShareable() {
        XCTAssertTrue(DuellLink.isShareable("https://bunsenbrenner.org/duell"))
        XCTAssertTrue(DuellLink.isShareable("https://bunsenbrenner.org/duell#c=abc"))
        XCTAssertTrue(DuellLink.isShareable("https://bunsenbrenner.org/duell#i=quiz-chaos"))
        for bad in ["https://evil.example/duell#c=abc", "http://bunsenbrenner.org/duell", "https://bunsenbrenner.org/other",
                    "https://bunsenbrenner.org/duell#i=QUIZ", "https://bunsenbrenner.org/duell#x=1", "https://bunsenbrenner.org:8443/duell",
                    "https://bunsenbrenner.org/duell?a=1", "https://user@bunsenbrenner.org/duell", "javascript:alert(1)", "", "not a url"] {
            XCTAssertFalse(DuellLink.isShareable(bad), bad)
        }
    }
}
