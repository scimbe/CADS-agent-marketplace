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
        assertFalse(DuellLink.mayLoad("https://tracker.example/p.gif", api))
        assertFalse(DuellLink.mayLoad("http://$api/api/duell/config", api))
        assertFalse(DuellLink.mayLoad("file:///etc/hosts", api))
    }
}
