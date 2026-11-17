// Die Manifeste der Karten flug und lauf entstehen aus den Engine-Daten (Varianten, Bereiche, Texte); sie muessen aktuell sein.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const ROOT = new URL("..", import.meta.url).pathname;
for (const n of ["flug", "lauf"]) test("Manifest " + n + " ist aktuell (node test/fixtures/mk-" + n + "-manifest.mjs)", () => {
  const out = execFileSync(process.execPath, [ROOT + "test/fixtures/mk-" + n + "-manifest.mjs", ROOT.replace(/\/$/, "")]).toString();
  assert.equal(fs.readFileSync(ROOT + "src/cards/" + n + "/manifest.json", "utf8"), out);
});
