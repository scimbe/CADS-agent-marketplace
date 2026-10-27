package org.bunsenbrenner.cads

import org.bunsenbrenner.cads.auth.Revocation
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class RevocationTest {
    @Test
    fun bodyIsFormEncodedWithRefreshHint() {
        assertEquals(
            "token=a%2Bb%3D%3D&token_type_hint=refresh_token&client_id=cads-mobile",
            Revocation.formBody("a+b==", "cads-mobile"),
        )
    }

    @Test
    fun refusesPlainHttpEndpoints() {
        assertFalse(Revocation.revoke("http://example.org/revoke", "t", "c"))
    }
}
