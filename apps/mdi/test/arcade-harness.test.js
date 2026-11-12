// Die Arcade-Engine haelt die AST-Allowlist der Kartenlogik ein (scripts/harness.js): keine approximierten Math-Funktionen,
// kein **, keine Uhr, kein DOM, keine Globalen. Importe nur Geschwister (./x.js) und das SDK (ADR 0001 a, Engine-Regel).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkCardSource } from "../scripts/harness.js";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/engines/arcade");
test("Arcade-Engine: jede Datei besteht die Harness-Pruefung (Importe: Geschwister und SDK)", () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".js"));
  assert.ok(files.length >= 13, files.join());
  for (const f of files) {
    const src = fs.readFileSync(path.join(DIR, f), "utf8");
    const found = checkCardSource(src).filter((x) => !/^Import nicht erlaubt: \.\/[a-z0-9-]+\.js( |$)/.test(x));
    assert.deepEqual(found, [], f);
    for (const m of src.matchAll(/^import .* from "([^"]+)";$/gm)) assert.match(m[1], /^(\.\/[a-z0-9-]+\.js|\.\.\/\.\.\/contract\/sdk\.js)$/, f + ": " + m[1]);
  }
});
