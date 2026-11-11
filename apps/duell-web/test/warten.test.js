"use strict";
// The waiting screen of the free card (src/warten.js): its motion comes from a seed of the sentence, never from Math.random,
// it shows no percentage, and all its words are in both languages.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "../src/warten.js"), "utf8");
const T = require("../src/texts.json");

test("Warten: Zufall nur aus dem Seed, kein Prozentbalken, kein Countdown", () => {
  assert.doesNotMatch(src, /Math\.random\s*\(/);
  assert.doesNotMatch(src, /<progress|progressbar|aria-valuenow|\+ ?"%"/);
  global.window = undefined;
  const W = {}; new Function("globalThis", src)(W);
  const a = W.Warten.rng(W.Warten.seedOf("Ich möchte 2048 spielen")), b = W.Warten.rng(W.Warten.seedOf("Ich möchte 2048 spielen"));
  const xs = Array.from({ length: 8 }, () => a()), ys = Array.from({ length: 8 }, () => b());
  assert.deepEqual(xs, ys, "derselbe Satz, dieselbe Bewegung");
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(xs, Array.from({ length: 8 }, W.Warten.rng(W.Warten.seedOf("ein anderer Satz"))));
});

test("Warten: jeder Text des Schirms auf Deutsch und Englisch", () => {
  const keys = [...new Set(src.match(/create_wait_[a-z_]+/g))].flatMap((k) => (k === "create_wait_s_" ? ["send", "make", "check", "ready"].map((s) => k + s) : [k]));
  assert.ok(keys.length >= 10, keys.join());
  for (const k of keys.concat(["create_wait_cancelled"])) { assert.ok(T.de[k], "de " + k); assert.ok(T.en[k], "en " + k); }
});
