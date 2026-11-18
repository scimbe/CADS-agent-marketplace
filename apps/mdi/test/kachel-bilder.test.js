// Freie Karte 2, Klaerungsdialog: Bild und Text der Kacheln passen zusammen (Befund B5: "Ein Baer" zeigte einen Pinguin,
// "Ein Eichhoernchen" einen Hasen). Prueft die Bildliste (src/features/frei/kachel-bilder.js) und passendeBilder im Vertrag,
// das der Server nach jeder Antwort des Modells anwendet. Kostenlos, ohne Netz.
import test from "node:test";
import assert from "node:assert/strict";
import * as K from "../src/features/frei/klaerung.js";
import { BILDER, EMOJI, NEUTRAL, bildFuer, bilderIn, norm } from "../src/features/frei/kachel-bilder.js";

test("Bildliste: jedes Bild einmal, mit Hauptwort de/en und Woertern; NEUTRAL waehlt nur der Server", () => {
  assert.equal(new Set(EMOJI).size, EMOJI.length, "kein Bild doppelt");
  assert.ok(!EMOJI.includes(NEUTRAL), "NEUTRAL steht nicht im Enum des Modells");
  assert.deepEqual(K.FRAGEN_SCHEMA.properties.fragen.items.properties.kacheln.items.properties.emoji.enum, EMOJI);
  for (const e of EMOJI) {
    const b = BILDER[e];
    assert.ok(b && b.de && b.en && b.woerter.length, "Eintrag fuer " + e);
    for (const w of b.woerter) assert.deepEqual(norm(w), [w], "Wort normalisiert: " + w);
  }
  assert.ok(!EMOJI.some((e) => ["🔫", "💣", "🔪", "🩸", "🗡️", "🏹", "⚔️"].includes(e)), "keine Waffen, kein Blut");
});

test("Hauptwort -> genau sein Bild (de und en): das Bild traegt eine eindeutige Bedeutung", () => {
  for (const e of EMOJI) for (const lang of ["de", "en"]) {
    const m = bilderIn(BILDER[e][lang]), best = Math.max(0, ...m.values());
    const top = [...m].filter(([, s]) => s === best).map(([x]) => x);
    assert.deepEqual(top, [e], `${e} ${lang} "${BILDER[e][lang]}" trifft ${top.join(" ")}`);
    assert.deepEqual(bildFuer(BILDER[e][lang], "", NEUTRAL), { emoji: e, grund: "getauscht" });
  }
});

test("B5: falsches Bild wird durch das Bild des Labels ersetzt; Unbekanntes wird neutral, nie falsch", () => {
  assert.deepEqual(bildFuer("Ein Bär", "", "🐧"), { emoji: "🐻", grund: "getauscht" });
  assert.deepEqual(bildFuer("Ein Eichhörnchen", "", "🐇"), { emoji: "🐿️", grund: "getauscht" });
  assert.deepEqual(bildFuer("Ein Pinguin", "", "🐧"), { emoji: "🐧", grund: "passt" });
  assert.deepEqual(bildFuer("Eisbären", "", "🐧"), { emoji: "🐻", grund: "getauscht" }, "Kompositum mit Endung");
  assert.deepEqual(bildFuer("Mit dem Schlitten", "", "⛄"), { emoji: "🛷", grund: "getauscht" });
  assert.deepEqual(bildFuer("A squirrel", "", "🐇"), { emoji: "🐿️", grund: "getauscht" });
  // kein Bild fuer das Wort: neutral statt des naechstbesten Tiers
  assert.deepEqual(bildFuer("Ein Gürteltier", "", "🐧"), { emoji: NEUTRAL, grund: "neutral" });
  assert.deepEqual(bildFuer("Ein Faultier", "klettert langsam", "🐢"), { emoji: "🐢", grund: "unter" }, "Unterzeile bestaetigt");
  assert.deepEqual(bildFuer("Ein Faultier", "hängt im Baum", "🐢"), { emoji: NEUTRAL, grund: "neutral" }, "Unterzeile tauscht nie");
  assert.deepEqual(bildFuer("Normal", "wird schneller", "🌊"), { emoji: NEUTRAL, grund: "neutral" });
  // Teilwoerter, die nichts zeigen
  assert.equal(bildFuer("Hundert Punkte", "", "🐶").emoji, NEUTRAL, "hundert ist kein Hund");
  assert.equal(bildFuer("Eine Reise", "", "🍦").emoji, NEUTRAL, "Reise ist kein Eis");
  assert.equal(bildFuer("Tigerente", "", "🐯").emoji, "🦆", "das Grundwort steht hinten");
  // mehrere passende Bilder: das des Modells bleibt
  assert.deepEqual(bildFuer("Du und ein Bär", "", "🙂"), { emoji: "🙂", grund: "passt" });
  assert.deepEqual(bildFuer("Boot", "", "🚤"), { emoji: "🚤", grund: "passt" });
});

test("passendeBilder aendert nur emoji, meldet jeden Wechsel und bleibt im Vertrag", () => {
  const f = { ok: true, verstehe: "ein Spiel. Du rodelst den Berg hinunter.", fragen: [
    { frage: "Wer fährt mit dir?", hinweis: "", kacheln: [{ label: "Ein Bär", sub: "", emoji: "🐧" }, { label: "Ein Eichhörnchen", sub: "klein und flink", emoji: "🐇" }, { label: "Ein Pinguin", sub: "", emoji: "🐧" }] },
    { frage: "Wie schwer?", hinweis: "", kacheln: [{ label: "Gemütlich", sub: "", emoji: "🐌" }, { label: "Ein Gürteltier", sub: "", emoji: "🦔" }] }] };
  const c = K.checkFragen(f);
  assert.equal(c.ok, true);
  const { fragen, wechsel } = K.passendeBilder(c.value.fragen);
  assert.deepEqual(fragen.map((q) => q.kacheln.map((k) => k.emoji)), [["🐻", "🐿️", "🐧"], ["🐌", NEUTRAL]]);
  assert.deepEqual(wechsel, [
    { frage: 0, kachel: 0, von: "🐧", zu: "🐻", grund: "getauscht" },
    { frage: 0, kachel: 1, von: "🐇", zu: "🐿️", grund: "getauscht" },
    { frage: 1, kachel: 1, von: "🦔", zu: NEUTRAL, grund: "neutral" }]);
  assert.deepEqual(fragen.map((q) => q.kacheln.map((k) => k.label)), c.value.fragen.map((q) => q.kacheln.map((k) => k.label)), "Labels unveraendert");
  assert.equal(K.checkFragen({ ok: true, verstehe: c.value.verstehe, fragen }).ok, true, "die App nimmt das Ergebnis an (NEUTRAL erlaubt)");
  assert.equal(c.value.fragen[0].kacheln[0].emoji, "🐧", "Eingabe nicht veraendert");
});
