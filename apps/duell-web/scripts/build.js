"use strict";
// Inlines data, styles and code into the template -> one self-contained dist/index.html (no external requests).
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const safe = (s) => s.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
const data = "window.DuellIdeas=" + JSON.stringify(JSON.parse(read("src/ideas.json"))) + ";window.DailyTexts=" + JSON.stringify(JSON.parse(read("src/texts.json"))) + ";";
const parts = { DATA: data, CORE: read("src/core.js"), ENGINE: read("src/engine.js"), DAILY: read("src/daily.js"), STUDIO: read("src/studio.js"), KIT: read("src/kit.js"), RENDER: read("src/render.js"), GAME: read("src/game.js"), APP: read("src/app.js") };
let html = read("src/index.template.html").replace("/*@CSS@*/", () => read("src/style.css"));
for (const k of Object.keys(parts)) html = html.replace("/*@" + k + "@*/", () => safe(parts[k]));
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/index.html"), html);
console.log("dist/index.html", Buffer.byteLength(html), "bytes");
