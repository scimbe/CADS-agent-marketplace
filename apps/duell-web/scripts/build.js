"use strict";
// Inlines core + engine into the template -> one self-contained dist/index.html (no external requests).
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const safe = (s) => s.replace(/<\/script/gi, "<\\/script");
let html = read("src/index.template.html");
html = html.replace("/*@CORE@*/", () => safe(read("src/core.js"))).replace("/*@ENGINE@*/", () => safe(read("src/engine.js")));
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/index.html"), html);
console.log("dist/index.html", Buffer.byteLength(html), "bytes");
