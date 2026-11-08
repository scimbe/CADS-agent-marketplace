"use strict";
// Release gate for the legal pages: exits 1 while legal/operator.json (or the file given) still holds a ⟦…⟧ placeholder
// or an unconfirmed fact, and while a built page still contains one. Run before copying dist/ to the server.
const fs = require("fs");
const path = require("path");
const Legal = require("../src/legal.js");
const root = path.join(__dirname, "..");
const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "legal/operator.json");
const open = Legal.missing(JSON.parse(fs.readFileSync(file, "utf8")));
const dist = path.join(root, "dist");
const built = [];
(function walk(d) { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.html$/.test(f) && fs.readFileSync(p, "utf8").includes(Legal.MARK)) built.push(path.relative(root, p)); } })(dist);
if (process.argv[2]) built.length = 0;   // checking another operator file: the build is not about it
if (open.length || built.length) {
  console.error("Nicht live-faehig. Offen in " + path.relative(process.cwd(), file) + ": " + (open.join(", ") || "-") + (built.length ? "\nPlatzhalter in: " + built.join(", ") : ""));
  process.exit(1);
}
console.log("Rechtsseiten vollstaendig.");
