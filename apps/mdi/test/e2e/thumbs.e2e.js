// Thumbnails (ADR 0001 d): Screenshot im Startzustand ist deterministisch (zweimal gerendert = bytegleich), bleibt im
// Budget (<= 60 KB WebP) und enthaelt keine unbekannten Knoten/Ops. Gleichheit mit den eingecheckten Dateien prueft
// "node scripts/thumbs.js --check" auf demselben Rechner (Schriften unterscheiden sich zwischen Betriebssystemen).
import test from "node:test";
import assert from "node:assert/strict";
import { renderThumbs, MAX_BYTES } from "../../scripts/thumbs.js";

test("Thumbnails: deterministisch, im Budget, ohne unbekannte Ops", async () => {
  const a = await renderThumbs(), b = await renderThumbs();
  assert.ok(a.length >= 2);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].id, b[i].id);
    assert.ok(a[i].bytes.equals(b[i].bytes), a[i].id + ": zweimal gerendert, verschiedene Bytes");
    assert.ok(a[i].bytes.length <= MAX_BYTES, a[i].id + ": " + a[i].bytes.length + " B");
    assert.deepEqual(a[i].unknown, [], a[i].id);
  }
});
