package org.bunsenbrenner.cads

import org.bunsenbrenner.cads.duell.DuellRelay
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DuellRelayTest {
    private val ch = "ab".repeat(32)

    @Test fun fixedHostAndPath() {
        assertEquals("https://demos-34a13a96.bunsenbrenner.org/api/duell/relay-grant", DuellRelay.url("https://demos-34a13a96.bunsenbrenner.org/"))
    }

    @Test fun bearerOnlyWhenSignedIn() {
        assertEquals("Bearer tok", DuellRelay.headers("tok")["Authorization"])
        assertNull(DuellRelay.headers(null)["Authorization"])
        assertNull(DuellRelay.headers("")["Authorization"])
        assertEquals("application/json", DuellRelay.headers(null)["Content-Type"])
    }

    @Test fun onlyChannelLeavesTheDevice() {
        assertEquals("{}", DuellRelay.body("{}"))
        assertEquals("{\"channel\":\"$ch\"}", DuellRelay.body("{\"channel\":\"$ch\"}"))
        for (b in listOf(null, "", "[]", "kein json", "{\"channel\":\"xyz\"}", "{\"channel\":1}", "{\"name\":\"urlaub.jpg\"}",
            "{\"channel\":\"$ch\",\"x\":1}", "{\"channel\":\"" + "a".repeat(600) + "\"}")) {
            assertNull(b, DuellRelay.body(b))
        }
    }

    @Test fun idsAndReplyAreSafe() {
        assertTrue(DuellRelay.validId("r12"))
        for (id in listOf(null, "", "r", "x1", "r1;alert(1)", "r" + "1".repeat(12))) assertFalse(id ?: "null", DuellRelay.validId(id))
        val js = DuellRelay.reply("r1", 200, "\"});alert(1);// ")
        assertTrue(js.startsWith("window.DuellHostReply&&window.DuellHostReply(\"r1\",200,\""))
        assertFalse("server text never closes the string", js.contains("\"});alert"))
        assertTrue(DuellRelay.reply("r1", 200, "x".repeat(10000)).length < 4200)
    }
}
