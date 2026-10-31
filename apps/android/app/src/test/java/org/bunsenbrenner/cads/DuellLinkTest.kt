package org.bunsenbrenner.cads

import org.bunsenbrenner.cads.duell.DuellLink
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DuellLinkTest {
    private val api = "demos-34a13a96.bunsenbrenner.org"

    @Test fun challengeLinkYieldsFragment() {
        assertEquals("c=eyJ2IjoxfQ", DuellLink.fragmentOf("https://bunsenbrenner.org/duell#c=eyJ2IjoxfQ"))
        assertEquals("c=eyJ2IjoxfQ", DuellLink.fragmentOf("https://bunsenbrenner.org/duell/#c=eyJ2IjoxfQ"))
    }

    @Test fun foreignOrMalformedLinksAreRejected() {
        assertNull(DuellLink.fragmentOf(null))
        assertNull(DuellLink.fragmentOf("https://evil.example/duell#c=abc"))
        assertNull(DuellLink.fragmentOf("http://bunsenbrenner.org/duell#c=abc"))
        assertNull(DuellLink.fragmentOf("https://bunsenbrenner.org/app/oauth2redirect#c=abc"))
        assertNull(DuellLink.fragmentOf("https://bunsenbrenner.org/duell"))
        assertNull(DuellLink.fragmentOf("https://bunsenbrenner.org/duell#x=abc"))
        assertNull(DuellLink.fragmentOf("https://bunsenbrenner.org/duell#c=a\"+alert(1)+\""))
        assertNull(DuellLink.fragmentOf("https://bunsenbrenner.org/duell#c=" + "A".repeat(9000)))
        assertNull(DuellLink.fragmentOf("https://bunsenbrenner.org:8443/duell#c=abc"))
    }

    @Test fun pageUrlCarriesFragmentAndReloadMarker() {
        assertEquals("https://appassets.androidplatform.net/assets/duell/index.html", DuellLink.pageUrl(null))
        assertEquals("https://appassets.androidplatform.net/assets/duell/index.html?r=2#c=ab", DuellLink.pageUrl("c=ab", 2))
    }

    @Test fun shareOnlyPublicDuellLink() {
        assertTrue(DuellLink.isShareable("https://bunsenbrenner.org/duell#c=abc"))
        assertTrue(DuellLink.isShareable("https://bunsenbrenner.org/duell"))
        assertFalse(DuellLink.isShareable("https://evil.example/duell#c=abc"))
        assertFalse(DuellLink.isShareable("javascript:alert(1)"))
        assertFalse(DuellLink.isShareable(null))
    }

    @Test fun navigationRules() {
        assertTrue(DuellLink.isInternal("https://appassets.androidplatform.net/assets/duell/index.html#c=a"))
        assertFalse(DuellLink.isInternal("https://example.org/"))
        assertTrue(DuellLink.opensExternally("https://example.org/"))
        assertTrue(DuellLink.opensExternally("http://example.org/"))
        assertFalse(DuellLink.opensExternally("intent://x#Intent;end"))
        assertFalse(DuellLink.opensExternally("file:///data/x"))
        assertFalse(DuellLink.opensExternally("https://appassets.androidplatform.net/assets/duell/index.html"))
    }

    @Test fun onlyAssetsAndConfigApiMayLoad() {
        assertTrue(DuellLink.mayLoad("https://appassets.androidplatform.net/assets/duell/index.html", api))
        assertTrue(DuellLink.mayLoad("https://$api/api/duell/config", api))
        assertTrue(DuellLink.mayLoad("https://$api/api/duell/ai", api))
        assertTrue(DuellLink.mayLoad("https://$api/api/duell/ai/status", api))
        assertFalse(DuellLink.mayLoad("https://tracker.example/p.gif", api))
        assertFalse(DuellLink.mayLoad("http://$api/api/duell/config", api))
        assertFalse(DuellLink.mayLoad("file:///etc/hosts", api))
    }

    @Test fun inviteFragmentIsAllowedNextToChallenge() {
        assertEquals("i=quiz-chaos", DuellLink.fragmentOf("https://bunsenbrenner.org/duell#i=quiz-chaos"))
        assertEquals("i=quiz-chaos", DuellLink.fragmentOf("https://bunsenbrenner.org/duell/#i=quiz-chaos"))
        assertEquals("i=" + "a".repeat(32), DuellLink.fragmentOf("https://bunsenbrenner.org/duell#i=" + "a".repeat(32)))
        assertEquals("c=eyJ2IjoxfQ", DuellLink.fragmentOf("https://bunsenbrenner.org/duell#c=eyJ2IjoxfQ"))
    }

    @Test fun malformedInviteFragmentsAreRejected() {
        assertNull(DuellLink.fragmentOf("https://bunsenbrenner.org/duell#i="))
        assertNull(DuellLink.fragmentOf("https://bunsenbrenner.org/duell#i=" + "a".repeat(33)))
        assertNull(DuellLink.fragmentOf("https://bunsenbrenner.org/duell#i=Quiz-Chaos"))   // ids are lower case
        assertNull(DuellLink.fragmentOf("https://bunsenbrenner.org/duell#i=a_b"))
        assertNull(DuellLink.fragmentOf("https://bunsenbrenner.org/duell#i=../x"))
        assertNull(DuellLink.fragmentOf("https://bunsenbrenner.org/duell#i=a&c=b"))
        assertNull(DuellLink.fragmentOf("https://bunsenbrenner.org/duell#i=a\"+alert(1)+\""))
        assertNull(DuellLink.fragmentOf("https://bunsenbrenner.org/duell#I=quiz-chaos"))
        assertNull(DuellLink.fragmentOf("https://evil.example/duell#i=quiz-chaos"))
        assertNull(DuellLink.fragmentOf("http://bunsenbrenner.org/duell#i=quiz-chaos"))
        assertNull(DuellLink.fragmentOf("https://bunsenbrenner.org/app/oauth2redirect#i=quiz-chaos"))
    }

    @Test fun shortLinkBecomesFragmentForThePage() {
        assertEquals("s=aB3dE5gH", DuellLink.fragmentOf("https://bunsenbrenner.org/s/aB3dE5gH"))
        assertEquals("https://appassets.androidplatform.net/assets/duell/index.html#s=aB3dE5gH", DuellLink.pageUrl("s=aB3dE5gH"))
        assertTrue(DuellLink.isShareable("https://bunsenbrenner.org/s/aB3dE5gH"))
    }

    @Test fun foreignShortLinksAreRejected() {
        for (bad in listOf(
            "https://evil.example/s/aB3dE5gH", "http://bunsenbrenner.org/s/aB3dE5gH", "https://bunsenbrenner.org:8443/s/aB3dE5gH",
            "https://bunsenbrenner.org/s/aB3dE5g", "https://bunsenbrenner.org/s/aB3dE5gHi", "https://bunsenbrenner.org/s/aB3dE5g0",
            "https://bunsenbrenner.org/s/aB3dE5gO", "https://bunsenbrenner.org/s/../duell", "https://bunsenbrenner.org/s/aB3dE5gH/x",
            "https://bunsenbrenner.org/s/aB3dE5gH?x=1", "https://bunsenbrenner.org/s/",
        )) {
            assertNull(bad, DuellLink.fragmentOf(bad))
            assertFalse(bad, DuellLink.isShareable(bad))
        }
    }

    @Test fun pageUrlCarriesInviteFragment() {
        assertEquals("https://appassets.androidplatform.net/assets/duell/index.html#i=quiz-chaos", DuellLink.pageUrl("i=quiz-chaos"))
    }

    @Test fun shareableLinkMayCarryInvite() {
        assertTrue(DuellLink.isShareable("https://bunsenbrenner.org/duell#i=quiz-chaos"))
        assertFalse(DuellLink.isShareable("https://bunsenbrenner.org/duell#i=QUIZ"))
    }

    @Test fun microphoneOnlyForOwnOriginAndOnlyAudio() {
        val audio = arrayOf(DuellLink.AUDIO_CAPTURE)
        assertTrue(DuellLink.micAllowed("https://appassets.androidplatform.net/", audio))
        assertTrue(DuellLink.micAllowed("https://appassets.androidplatform.net", audio))
        assertFalse(DuellLink.micAllowed("https://$api/", audio))
        assertFalse(DuellLink.micAllowed("https://bunsenbrenner.org/", audio))
        assertFalse(DuellLink.micAllowed("http://appassets.androidplatform.net/", audio))
        assertFalse(DuellLink.micAllowed("https://appassets.androidplatform.net:8443/", audio))
        assertFalse(DuellLink.micAllowed(null, audio))
        assertFalse(DuellLink.micAllowed("https://appassets.androidplatform.net/", arrayOf("android.webkit.resource.VIDEO_CAPTURE")))
        assertFalse(DuellLink.micAllowed("https://appassets.androidplatform.net/", arrayOf(DuellLink.AUDIO_CAPTURE, "android.webkit.resource.VIDEO_CAPTURE")))
        assertFalse(DuellLink.micAllowed("https://appassets.androidplatform.net/", emptyArray()))
    }
}
