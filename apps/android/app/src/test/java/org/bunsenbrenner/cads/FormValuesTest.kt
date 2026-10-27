package org.bunsenbrenner.cads

import org.bunsenbrenner.cads.ui.FormValues
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FormValuesTest {
    @Test
    fun valuesRoundTripThroughJson() {
        val json = FormValues.toJson(
            mapOf("topic" to "Quartalszahlen", "max_items" to 5L, "sections" to listOf("Risiken", "Kennzahlen"), "accent_color" to "#336699"),
        )
        val back = FormValues.parse(json)
        assertEquals("Quartalszahlen", back["topic"])
        assertEquals(5, (back["max_items"] as Number).toInt())
        assertEquals(listOf("Risiken", "Kennzahlen"), back["sections"])
    }

    @Test
    fun malformedJsonParsesToEmpty() {
        assertTrue(FormValues.parse("{nope").isEmpty())
    }

    @Test
    fun hexColorValidation() {
        assertTrue(FormValues.isHexColor("#a1B2c3"))
        assertFalse(FormValues.isHexColor("a1b2c3"))
        assertFalse(FormValues.isHexColor("#12345"))
        assertEquals(0xFF336699.toInt(), FormValues.hexToArgb("#336699"))
        assertNull(FormValues.hexToArgb("red"))
    }
}
