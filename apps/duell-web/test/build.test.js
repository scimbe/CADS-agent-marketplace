"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const dist = path.join(__dirname, "../dist/index.html");
const src = (f) => fs.readFileSync(path.join(__dirname, "../src", f), "utf8");
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

test("Build: eine Datei, voll offline, alle Welten da, Platzhalter ersetzt, Groesse unter 1 MB", () => {
  execFileSync(process.execPath, [path.join(__dirname, "../scripts/build.js")]);
  const html = fs.readFileSync(dist, "utf8");
  assert.ok(!/\/\*@[A-Z]+@\*\//.test(html), "Platzhalter uebrig");
  assert.ok(!/<script[^>]+src=|<link[^>]+href=|@import|url\(\s*["']?https?:/i.test(html), "externe Ressource");
  assert.ok(!/<(img|audio|video|iframe)[^>]+src=["']https?:/i.test(html));
  const core = require("../src/core.js");
  for (const t of core.THEME_NAMES) assert.match(html, new RegExp("\\b" + t + ":\\s*\\{"), "Welt " + t);
  assert.ok(Buffer.byteLength(html) < 1024 * 1024);
  assert.match(html, /<title>My Daily Idea<\/title>/);
  assert.match(html, /Content-Security-Policy[^>]*default-src 'none'/);
  assert.match(html, /connect-src https:\/\/demos-34a13a96\.bunsenbrenner\.org;/, "nur der eine Host");
});
test("Datenschutz: genau eine fetch-Stelle, nur im Spiel, nur mit dem getippten Satz; kein anderer Weg nach draussen", () => {
  const html = fs.readFileSync(dist, "utf8");
  assert.equal((html.match(/fetch\(/g) || []).length, 1, "genau ein fetch");
  assert.ok(src("game.js").includes("await fetch("), "fetch gehoert ins Spiel");
  const body = src("game.js").match(/fetch\([^\n]*/)[0];
  assert.match(body, /JSON\.stringify\(\{ prompt: prompt, lang: lang \}\)/, "nur Satz + Sprache");
  assert.ok(!/XMLHttpRequest|sendBeacon|WebSocket|EventSource|RTCPeerConnection|importScripts|new Worker/.test(html), "weiterer Ausgang");
  assert.ok(!/analytics|gtag|tracker|Notification\.|serviceWorker/i.test(html), "Tracker/Push");
});
test("XSS: kein HTML-Sink im Seitencode", () => {
  const html = noComments(fs.readFileSync(dist, "utf8"));
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/.test(html), "HTML-Sink");
});
