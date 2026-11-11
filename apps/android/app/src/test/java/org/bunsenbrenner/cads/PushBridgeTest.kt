package org.bunsenbrenner.cads

import org.bunsenbrenner.cads.push.NoPush
import org.bunsenbrenner.cads.push.PushBridge
import org.bunsenbrenner.cads.push.PushMessage
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/** The bridge contract shared with iOS (DuellPushTests): src/test/resources/bridge-push-v1.json. */
class PushBridgeTest {
    private val fixture = JSONObject(File("src/test/resources/bridge-push-v1.json").readText())

    @Test fun capabilityMatchesTheSharedContract() {
        val cases = fixture.getJSONArray("capability")
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            assertEquals(c.toString(), c.getString("json"), PushBridge.capability(c.getString("kind"), c.getString("state")))
        }
    }

    @Test fun thisBuildSaysNoneHonestly() {
        assertEquals("{\"v\":1,\"kind\":\"none\",\"state\":\"unsupported\"}", PushBridge.capability(NoPush))
        var got = ""
        NoPush.enable { got = it }
        assertEquals("none", got)
    }

    @Test fun aWakeUpCarriesOnlyItsKind() {
        val cases = fixture.getJSONArray("payload")
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val want = if (c.isNull("kind")) null else c.getString("kind")
            assertEquals(c.getString("in"), want, PushMessage.kindOf(c.getString("in")))
        }
        assertEquals(null, PushMessage.kindOf(null))
        assertEquals(null, PushMessage.kindOf("{\"r\":\"reply\"," + "\"x\":\"" + "a".repeat(5000) + "\"}"))
    }
}
