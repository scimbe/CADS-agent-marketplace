package org.bunsenbrenner.cads.duell

import java.io.File
import java.util.Base64

/**
 * Pure rules for the files the page hands to the shell (`DuellHost.shareFile` / `saveFile`):
 * which types, how big, what the name may look like. No Android types, so it is unit-tested on the JVM.
 * The page only ever produces a PNG or JPEG picture or a WAV sound; everything else is dropped.
 */
object DuellFiles {
    /** Largest file after decoding. A 1080x1350 PNG is a few hundred KB; this is a hard ceiling. */
    const val MAX_BYTES = 8 * 1024 * 1024
    const val MAX_NAME = 64
    const val DEFAULT_BASE = "my-daily-idea"

    enum class Kind(val mime: String, val ext: String, val isImage: Boolean) {
        PNG("image/png", "png", true),
        JPEG("image/jpeg", "jpg", true),
        WAV("audio/wav", "wav", false),
    }

    /** The accepted type for a MIME string from the page (case and parameters ignored), else null. */
    fun kindOf(typ: String?): Kind? {
        val t = typ?.substringBefore(';')?.trim()?.lowercase() ?: return null
        return when (t) {
            "image/png" -> Kind.PNG
            "image/jpeg", "image/jpg" -> Kind.JPEG
            "audio/wav", "audio/x-wav", "audio/wave" -> Kind.WAV
            else -> null
        }
    }

    /**
     * Decodes the standard-alphabet base64 payload. Null when it is too big, not base64, empty, or
     * when the bytes are not what [kind] says (magic number), so a declared type cannot hide other content.
     */
    fun decode(b64: String?, kind: Kind): ByteArray? {
        if (b64 == null || b64.isEmpty() || b64.length > MAX_BYTES / 3 * 4 + 8) return null
        val bytes = try { Base64.getDecoder().decode(b64) } catch (_: IllegalArgumentException) { return null }
        if (bytes.isEmpty() || bytes.size > MAX_BYTES) return null
        return bytes.takeIf { matchesMagic(it, kind) }
    }

    fun matchesMagic(b: ByteArray, kind: Kind): Boolean = when (kind) {
        Kind.PNG -> b.size >= 8 && b[0] == 0x89.toByte() && b[1] == 'P'.code.toByte() && b[2] == 'N'.code.toByte() &&
            b[3] == 'G'.code.toByte() && b[4] == 0x0D.toByte() && b[5] == 0x0A.toByte() && b[6] == 0x1A.toByte() && b[7] == 0x0A.toByte()
        Kind.JPEG -> b.size >= 3 && b[0] == 0xFF.toByte() && b[1] == 0xD8.toByte() && b[2] == 0xFF.toByte()
        Kind.WAV -> b.size >= 12 && String(b, 0, 4, Charsets.ISO_8859_1) == "RIFF" && String(b, 8, 4, Charsets.ISO_8859_1) == "WAVE"
    }

    /**
     * A file name that is safe as a single path segment: no directories, only [A-Za-z0-9._-], no
     * leading dots, at most [MAX_NAME] characters, and the extension always the one of [kind]
     * (the name from the page does not decide it).
     */
    fun safeName(name: String?, kind: Kind): String {
        var base = (name ?: "").substringAfterLast('/').substringAfterLast('\\')
        base = base.substringBeforeLast('.', base) // drop whatever extension was given
        base = base.map { if (it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it == '-' || it == '_' || it == '.') it else '-' }
            .joinToString("")
            .replace(Regex("\\.{2,}"), ".")
            .replace(Regex("-{2,}"), "-")
            .trim('.', '-')
        base = base.take(MAX_NAME - 1 - kind.ext.length).trim('.', '-')
        if (base.isEmpty()) base = DEFAULT_BASE
        return "$base.${kind.ext}"
    }

    /**
     * Removes everything under [dir] last modified more than [maxAgeMs] before [now] (all of it with
     * `maxAgeMs = 0`). Returns the number of removed entries. The share cache is cleaned this way
     * because the receiving app may still be reading when the share sheet closes.
     */
    fun sweep(dir: File, now: Long, maxAgeMs: Long): Int {
        val entries = dir.listFiles() ?: return 0
        var removed = 0
        for (e in entries) {
            if (now - e.lastModified() >= maxAgeMs && e.deleteRecursively()) removed++
        }
        return removed
    }
}
