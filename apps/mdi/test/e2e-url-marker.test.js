// URL-Modus der e2e-Suiten (test/e2e/lib/ziel.mjs): Ein Test, dessen Gegenstelle eine Attrappe ist (falscher Wrapper,
// falsche freie Karte, falsche Huelle, falscher Live-Server), gilt gegen einen echten Server nicht und muss dort
// uebersprungen werden – ganze Datei per fakeOnly(test) oder der einzelne Test mit { skip: NEEDS_FAKE }. Sonst laeuft er
// im URL-Modus gegen Staging und scheitert an der fehlenden Attrappe (Staging-Lauf 20e9a9b8: media-travel, p-foto).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "e2e");
const FAKE = /\b(fakeWrapper|fakeFrei|fakeShell|fakeLive|liveInvite|turnLive)\(/;

test("e2e: jeder Test mit Attrappe als Gegenstelle ist fuer den URL-Modus markiert", () => {
  const missing = [];
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".e2e.js")).sort()) {
    const src = fs.readFileSync(path.join(DIR, f), "utf8");
    if (/\bfakeOnly\(/.test(src)) continue;             // ganze Datei markiert
    // Testbloecke: vom Aufruf test( bis zum naechsten; der Kopf (bis "async") muss den Grund tragen
    const starts = [...src.matchAll(/^\s*test\(/gm)].map((m) => m.index);
    starts.forEach((s, i) => {
      const block = src.slice(s, starts[i + 1] ?? src.length);
      if (!FAKE.test(block)) return;
      const head = block.slice(0, block.indexOf("async") + 1);
      if (!/NEEDS_FAKE|skip:/.test(head)) missing.push(f + ": " + head.trim().slice(0, 90));
    });
  }
  assert.deepEqual(missing, []);
});
