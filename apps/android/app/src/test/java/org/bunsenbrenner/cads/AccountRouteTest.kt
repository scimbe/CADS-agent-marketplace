package org.bunsenbrenner.cads

import org.bunsenbrenner.cads.duell.AccountRoute
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

/** The account bridge's path rule, shared with iOS (AccountRouteTests): src/test/resources/bridge-account-v1.json. */
class AccountRouteTest {
    private val fixture = JSONObject(File("src/test/resources/bridge-account-v1.json").readText())

    @Test fun sharedRouteCases() {
        val cases = fixture.getJSONArray("route")
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            assertEquals(c.toString(), c.getBoolean("ok"), AccountRoute.allowed(c.getString("method"), c.getString("path")))
        }
    }

    @Test fun bodyIsASmallJsonObjectForPostAndNothingForGet() {
        assertNotNull(AccountRoute.body("POST", "{\"device\":\"x\"}"))
        assertNull(AccountRoute.body("POST", null))
        assertNull(AccountRoute.body("POST", "kein json"))
        assertNull(AccountRoute.body("POST", "[1]"))
        assertNull(AccountRoute.body("POST", "{\"a\":\"" + "x".repeat(AccountRoute.MAX_BODY) + "\"}"))
        assertEquals(0, AccountRoute.body("GET", null)!!.size)
        assertNull(AccountRoute.body("GET", "{}"))
    }

    @Test fun onlyHttpsBase() {
        assertNull(AccountRoute.call("http://demos.example.org", "GET", "/auth/me", ByteArray(0), null))
    }
}
