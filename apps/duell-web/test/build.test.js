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
  assert.ok(Buffer.byteLength(html) < 800 * 1024, "dist ueber 800 KB: " + Buffer.byteLength(html));
  assert.match(html, /<title>My Daily Idea<\/title>/);
  assert.match(html, /Content-Security-Policy[^>]*default-src 'none'/);
  assert.match(html, /connect-src https:\/\/demos-34a13a96\.bunsenbrenner\.org https:\/\/webconference\.bunsenbrenner\.org wss:\/\/webconference\.bunsenbrenner\.org;/, "der eigene Host und fuer Live-Spiele nur die Webconference");
});
test("Datenschutz: Kurzlink nur ueber shortlink.js, nur nach einem Tipp auf Teilen; p= bleibt draussen", () => {
  assert.ok(src("shortlink.js").includes("(fetchFn || fetch)(API + path"));
  assert.ok(!/ShortLink\.shorten/.test(src("app.js").replace(/async function shortLink\(\)[\s\S]*?\n\}/, "")), "app.js: nur shortLink() kuerzt");
  for (const m of src("app.js").matchAll(/shortLink\(\)/g)) assert.ok(/await shortLink\(\)|function shortLink\(\)/.test(src("app.js").slice(m.index - 15, m.index + 11)));
  const game = src("game.js"), at = game.indexOf("ShortLink.shorten");
  assert.ok(at > game.indexOf('$("challenge").addEventListener("click"'), "game.js: nur im Klick");
});
test("Datenschutz: nur die erlaubten fetch-Stellen (Spielsatz, KI-Text, Kurzlink), nur getippter Text; kein anderer Weg nach draussen", () => {
  const html = noComments(fs.readFileSync(dist, "utf8"));
  // Every call site by name; a new one fails here until it is argued for and listed.
  // protokoll-page.js is its own page (dist/protokoll.html, connect-src 'self'): one GET for the speech model from this
  // domain, one POST with the redacted text after the explicit yes. Neither is in the app build below.
  const allowed = { "game.js": 1, "ai.js": 1, "live.js": 1, "protokoll-page.js": 2 }, short = /\(fetchFn \|\| fetch\)\(/g;
  assert.match(src("protokoll-page.js"), /fetch\(url, \{ signal: ctl\.signal, credentials: "same-origin", cache: "no-store" \}\)/, "Modell nur per GET");
  assert.match(src("protokoll-page.js"), /input: P\.aiInput\(rec\.segs, rec\.names\)/, "an die KI nur der geschwaerzte Text");
  assert.ok(!/deviceMemory|hardwareConcurrency|userAgent/.test(src("protokoll-page.js").match(/JSON\.stringify\(\{ kind: "protokoll"[^\n]*/)[0]), "Geraetedaten bleiben auf dem Geraet");
  for (const f of fs.readdirSync(path.join(__dirname, "../src")).filter((n) => n.endsWith(".js"))) {
    assert.equal((noComments(src(f)).match(/\bfetch\(/g) || []).length, allowed[f] || 0, "direktes fetch( in " + f);
    assert.equal((noComments(src(f)).match(short) || []).length, f === "shortlink.js" ? 1 : 0, "Kurzlink-fetch in " + f);
  }
  assert.equal((html.match(/\bfetch\(/g) || []).length, allowed["game.js"] + allowed["ai.js"] + allowed["live.js"], "direkte fetch( im Build");
  const ph = noComments(fs.readFileSync(path.join(path.dirname(dist), "protokoll.html"), "utf8"));
  assert.equal((ph.match(/\bfetch\(/g) || []).length, 2, "Protokoll-Seite: Modell + KI-Text");
  assert.ok(!/XMLHttpRequest|sendBeacon|EventSource|WebSocket|RTCPeerConnection|analytics|serviceWorker/.test(ph), "Protokoll-Seite: kein weiterer Ausgang");
  assert.match(ph, /connect-src 'self' blob:;/, "Protokoll-Seite spricht nur mit der eigenen Domain");
  assert.equal((html.match(short) || []).length, 1, "eine Stelle fuer Kurzlinks im Build");
  assert.match(src("ai.js").match(/await fetch\([^\n]*/)[0], /body: text/, "nur der gepruefte Text");
  assert.ok(!/toDataURL|toBlob|drawImage|getImageData/.test(src("ai.js")), "KI fasst kein Bild an");
  assert.ok(src("game.js").includes("await fetch("), "fetch gehoert ins Spiel");
  const body = src("game.js").match(/fetch\([^\n]*/)[0];
  assert.match(body, /JSON\.stringify\(\{ prompt: prompt, lang: lang \}\)/, "nur Satz + Sprache");
  assert.ok(!/XMLHttpRequest|sendBeacon|EventSource|importScripts|new Worker/.test(html), "weiterer Ausgang");
  // Live games: one WebSocket to the edge and one peer connection, both only in live.js, and its one fetch goes to the play API.
  for (const f of fs.readdirSync(path.join(__dirname, "../src")).filter((n) => n.endsWith(".js") && n !== "live.js")) assert.ok(!/WebSocket|RTCPeerConnection/.test(noComments(src(f))), "Live-Ausgang in " + f);
  assert.equal((html.match(/new WebSocket\(/g) || []).length, 1, "ein WebSocket"); assert.equal((html.match(/new RTCPeerConnection\(/g) || []).length, 1, "eine Peer-Verbindung");
  assert.match(src("live.js"), /API = WC \+ "\/api\/play"/, "Live spricht nur mit /api/play"); assert.ok(!/"turns?:|stun:|iceTransportPolicy: "relay"/.test(src("live.js")), "ICE-Server kommen nur vom Server, kein erzwungenes Relay"); assert.match(src("texts.json"), /IP-Adresse des anderen/, "Hinweis auf die sichtbare IP");
  assert.ok(!/analytics|\bgtag\b|tracker|Notification\.|serviceWorker/i.test(html), "Tracker/Push");
});
test("XSS: kein HTML-Sink im Seitencode", () => {
  const html = noComments(fs.readFileSync(dist, "utf8"));
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/.test(html), "HTML-Sink");
});
test("Schrift: Anton als data:-URL eingebettet, Lizenzhinweis im Build, Volltext im Repo, deutsche Glyphen im Subset", () => {
  const html = fs.readFileSync(dist, "utf8");
  assert.match(html, /@font-face\{font-family:"Anton"[^}]*src:url\(data:font\/woff2;base64,/);
  assert.match(html, /font-src data:;/);
  assert.match(html, /Anton Project Authors[^*]*SIL Open Font License 1\.1/);
  assert.match(fs.readFileSync(path.join(__dirname, "../licenses/Anton-OFL.txt"), "utf8"), /SIL OPEN FONT LICENSE Version 1\.1/);
  // latin subset: its unicode-range (checked once against the font's cmap with fontTools) must contain U+00C4 U+00D6 U+00DC U+00DF U+00E4 U+00F6 U+00FC and U+201E U+201C
  const css = fs.readFileSync(path.join(__dirname, "../node_modules/@fontsource/anton/index.css"), "utf8");
  const range = css.match(/anton-latin-400-normal \*\/[^}]*unicode-range:([^;]+);/)[1];
  const has = (cp) => range.split(",").some((r) => { const [a, b] = r.trim().replace("U+", "").split("-").map((x) => parseInt(x, 16)); return cp >= a && cp <= (b || a); });
  for (const cp of [0xc4, 0xd6, 0xdc, 0xdf, 0xe4, 0xf6, 0xfc, 0x201e, 0x201c, 0x2013]) assert.ok(has(cp), "Glyph U+" + cp.toString(16));
});
test("Lizenzen: Volltexte von Anton und qrcode-generator stecken in der Seite", () => {
  const html = fs.readFileSync(path.join(__dirname, "../dist/index.html"), "utf8");
  assert.match(html, /SIL OPEN FONT LICENSE Version 1\.1/); assert.match(html, /Permission is hereby granted, free of charge/);
});
