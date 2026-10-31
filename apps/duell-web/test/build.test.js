"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const dist = path.join(__dirname, "../dist/index.html");

test("Build: eine Datei, voll offline (keine externen Ressourcen), alle Themes + Platzhalter ersetzt", () => {
  execFileSync(process.execPath, [path.join(__dirname, "../scripts/build.js")]);
  const html = fs.readFileSync(dist, "utf8");
  assert.ok(!html.includes("/*@CORE@*/") && !html.includes("/*@ENGINE@*/"));
  assert.ok(!/<script[^>]+src=|<link[^>]+href=|@import|url\(\s*["']?https?:/i.test(html), "externe Ressource");
  assert.ok(!/<img[^>]+src=["']https?:/i.test(html));
  const core = require("../src/core.js");
  for (const t of core.THEME_NAMES) assert.match(html, new RegExp("\\b" + t + ":\\s*\\{"), "Theme " + t);
  assert.equal((html.match(/fetch\(/g) || []).length, 1, "genau ein fetch (Spielidee)");
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write|eval\(/.test(html.replace(/\/\*[\s\S]*?\*\//g, "")), "kein HTML-Sink");
});
