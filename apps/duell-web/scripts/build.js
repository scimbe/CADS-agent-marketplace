"use strict";
// Inlines data, styles and code into the template -> one self-contained dist/index.html (no external requests).
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const safe = (s) => s.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
const data = "window.DuellIdeas=" + JSON.stringify(JSON.parse(read("src/ideas.json"))) + ";window.DailyTexts=" + JSON.stringify(JSON.parse(read("src/texts.json"))) + ";";
const parts = { DATA: data, QRCODE: read("node_modules/qrcode-generator/qrcode.js"), CORE: read("src/core.js"), ENGINE: read("src/engine.js"), DAILY: read("src/daily.js"), STUDIO: read("src/studio.js"), KIT: read("src/kit.js"), COLLAB: read("src/collab.js"), COLLABUI: read("src/collab-ui.js"), CALLCARD: read("src/callcard.js"), CALLCARDUI: read("src/callcard-ui.js"), STICKERS: read("src/stickers.js"), RENDER: read("src/render.js"), GAME: read("src/game.js"), APP: read("src/app.js") };
// QR code for invites: qrcode-generator (MIT, Kazuhiko Arase), licenses/qrcode-generator-MIT.txt.
// Display font: Anton (SIL OFL 1.1), latin subset (covers ä ö ü ß and German quotes) from @fontsource, embedded as data: URL.
const fontFile = path.join(root, "node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2");
if (!fs.existsSync(fontFile)) throw new Error("Schrift fehlt: im Ordner apps/duell-web zuerst `npm ci` ausfuehren");
const fontCss = "/* Anton, Copyright 2020 The Anton Project Authors (https://github.com/googlefonts/AntonFont.git), SIL Open Font License 1.1 (licenses/Anton-OFL.txt) */\n" +
  '@font-face{font-family:"Anton";font-style:normal;font-weight:400 900;font-display:block;src:url(data:font/woff2;base64,' + fs.readFileSync(fontFile).toString("base64") + ") format(\"woff2\")}\n";
let html = read("src/index.template.html").replace("/*@CSS@*/", () => fontCss + read("src/style.css"));
for (const k of Object.keys(parts)) html = html.replace("/*@" + k + "@*/", () => safe(parts[k]));
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/index.html"), html);
console.log("dist/index.html", Buffer.byteLength(html), "bytes");
