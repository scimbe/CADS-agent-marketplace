package org.bunsenbrenner.cads

import org.bunsenbrenner.cads.duell.DuellFiles
import org.bunsenbrenner.cads.duell.DuellFiles.Kind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.util.Base64

class DuellFilesTest {
    @get:Rule val tmp = TemporaryFolder()

    private val png = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3)
    private val jpg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte(), 1, 2)
    private val wav = "RIFF".toByteArray() + byteArrayOf(36, 0, 0, 0) + "WAVEfmt ".toByteArray()
    private fun b64(b: ByteArray) = Base64.getEncoder().encodeToString(b)

    @Test fun onlyPictureAndWavTypesAreAccepted() {
        assertEquals(Kind.PNG, DuellFiles.kindOf("image/png"))
        assertEquals(Kind.PNG, DuellFiles.kindOf(" IMAGE/PNG "))
        assertEquals(Kind.JPEG, DuellFiles.kindOf("image/jpeg"))
        assertEquals(Kind.WAV, DuellFiles.kindOf("audio/wav"))
        assertEquals(Kind.WAV, DuellFiles.kindOf("audio/wav; codecs=1"))
        for (bad in listOf(null, "", "text/html", "image/svg+xml", "application/pdf", "application/vnd.android.package-archive", "audio/mpeg", "video/mp4", "image/gif", "text/plain")) {
            assertNull("type $bad", DuellFiles.kindOf(bad))
        }
    }

    @Test fun decodeChecksMagicNumbersAgainstTheDeclaredType() {
        assertNotNull(DuellFiles.decode(b64(png), Kind.PNG))
        assertNotNull(DuellFiles.decode(b64(jpg), Kind.JPEG))
        assertNotNull(DuellFiles.decode(b64(wav), Kind.WAV))
        assertNull("png bytes declared as wav", DuellFiles.decode(b64(png), Kind.WAV))
        assertNull("html declared as png", DuellFiles.decode(b64("<html></html>".toByteArray()), Kind.PNG))
        assertNull("riff but not wave", DuellFiles.decode(b64("RIFF1234AVI LIST".toByteArray()), Kind.WAV))
    }

    @Test fun decodeRejectsBrokenOrOversizeInput() {
        assertNull(DuellFiles.decode(null, Kind.PNG))
        assertNull(DuellFiles.decode("", Kind.PNG))
        assertNull(DuellFiles.decode("not base64!!", Kind.PNG))
        assertNull(DuellFiles.decode("data:image/png;base64," + b64(png), Kind.PNG))
        val big = png + ByteArray(DuellFiles.MAX_BYTES)
        assertNull(DuellFiles.decode(b64(big), Kind.PNG))
        assertNull("string longer than any allowed payload", DuellFiles.decode("A".repeat(DuellFiles.MAX_BYTES * 2), Kind.PNG))
        val atLimit = png + ByteArray(DuellFiles.MAX_BYTES - png.size)
        assertEquals(DuellFiles.MAX_BYTES, DuellFiles.decode(b64(atLimit), Kind.PNG)?.size)
    }

    @Test fun namesAreReducedToOneSafeSegmentWithTheExtensionOfTheType() {
        assertEquals("my-daily-idea.png", DuellFiles.safeName("my-daily-idea.png", Kind.PNG))
        assertEquals("my-daily-idea.wav", DuellFiles.safeName("my-daily-idea.wav", Kind.WAV))
        assertEquals("passwd.png", DuellFiles.safeName("../../etc/passwd", Kind.PNG))
        assertEquals("evil.png", DuellFiles.safeName("C:\\Windows\\evil.exe", Kind.PNG))
        assertEquals("a-b-c.jpg", DuellFiles.safeName("a b/c\u0000.sh/a b c.html", Kind.JPEG))
        assertEquals("my-daily-idea.png", DuellFiles.safeName(null, Kind.PNG))
        assertEquals("my-daily-idea.png", DuellFiles.safeName("", Kind.PNG))
        assertEquals("my-daily-idea.png", DuellFiles.safeName("...", Kind.PNG))
        assertEquals("my-daily-idea.wav", DuellFiles.safeName(".wav", Kind.WAV))
        assertEquals("Idee-mit-ml-uten.png", DuellFiles.safeName("Idee mit \u00dcml\u00e4uten.png", Kind.PNG))
        val long = DuellFiles.safeName("x".repeat(500) + ".png", Kind.PNG)
        assertTrue(long.length <= DuellFiles.MAX_NAME)
        assertTrue(long.endsWith(".png"))
        for (n in listOf("../x", "a/b", "..", "x.png.exe", "\n.png", "a\u202egnp.exe")) {
            val s = DuellFiles.safeName(n, Kind.PNG)
            assertTrue("$n -> $s", Regex("^[A-Za-z0-9][A-Za-z0-9._-]*\\.png$").matches(s))
            assertFalse(s.contains(".."))
        }
    }

    @Test fun sweepRemovesOldEntriesAndKeepsFreshOnes() {
        val dir = tmp.newFolder("share")
        val old = File(dir, "old").apply { mkdirs(); File(this, "a.png").writeBytes(png); setLastModified(1_000) }
        val fresh = File(dir, "fresh").apply { mkdirs(); File(this, "b.png").writeBytes(png); setLastModified(9_500) }
        assertEquals(1, DuellFiles.sweep(dir, now = 10_000, maxAgeMs = 5_000))
        assertFalse(old.exists())
        assertTrue(fresh.exists())
        assertEquals(1, DuellFiles.sweep(dir, now = 10_000, maxAgeMs = 0))
        assertEquals(0, dir.listFiles()!!.size)
        assertEquals(0, DuellFiles.sweep(File(tmp.root, "missing"), 0, 0))
    }
}
