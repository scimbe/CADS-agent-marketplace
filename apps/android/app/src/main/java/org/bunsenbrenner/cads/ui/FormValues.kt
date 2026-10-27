package org.bunsenbrenner.cads.ui

import org.json.JSONArray
import org.json.JSONObject

/** Pure helpers for the template form (unit-tested without the native library). */
object FormValues {
    /** `render_prompt_template` expects a JSON object of parameter name to value. */
    fun toJson(values: Map<String, Any>): String {
        val o = JSONObject()
        for ((k, v) in values.toSortedMap()) {
            when (v) {
                is Collection<*> -> o.put(k, JSONArray(v.toList()))
                else -> o.put(k, v)
            }
        }
        return o.toString()
    }

    fun parse(json: String): Map<String, Any> {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return emptyMap()
        val out = mutableMapOf<String, Any>()
        for (k in o.keys()) {
            val v = o.get(k)
            out[k] = if (v is JSONArray) List(v.length()) { v.getString(it) } else v
        }
        return out
    }

    private val HEX = Regex("^#[0-9a-fA-F]{6}$")

    fun isHexColor(s: String): Boolean = HEX.matches(s)

    fun hexToArgb(s: String): Int? = if (isHexColor(s)) (0xFF000000L or s.substring(1).toLong(16)).toInt() else null
}
