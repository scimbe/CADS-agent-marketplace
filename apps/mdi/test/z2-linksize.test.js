// Jede Z2-Linkkarte passt mit ihrem laengsten Altverlauf (Golden-Partien) samt laengstem Titel in einen Link:
// Drahtformat wie toWire + Partie-id + Hash, eine Eingabe je Frage ({t:"ans", seat, a}), b64url, Praefix.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_FRAGMENT } from "../src/app/link.js";

const G = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/z2-golden.json"), "utf8"));
const ROOM = new Set(["tuer", "uhr", "streichen", "erklaeren", "damals", "maschine", "werbung", "suche", "disco", "tier", "maus", "papagei", "bluff"]);

test(`Z2-Linkkarten: laengster Verlauf <= MAX_FRAGMENT (${MAX_FRAGMENT})`, () => {
  const over = [];
  for (const [g, cases] of Object.entries(G.spiele)) {
    if (ROOM.has(g)) continue;
    for (const c of cases) {
      const m = []; c.turns.forEach((t, ti) => t.answers.forEach((a) => m.push({ t: "ans", seat: ti % 2, a })));
      const wire = { c: "zug-schmuggel", v: "1.0.0", p: { spiel: "fallpreis", title: "W".repeat(40), w: "W".repeat(14), accent: "yellow" }, s: "f".repeat(32), k: [null, null], m, g: "f".repeat(16), h: "f".repeat(64) };
      const len = "#v2.challenge.".length + Math.ceil(Buffer.byteLength(JSON.stringify(wire)) * 4 / 3);
      if (len > MAX_FRAGMENT) over.push(`${g} seed ${c.seed}: ${len}`);
    }
  }
  assert.deepEqual(over, []);
});
