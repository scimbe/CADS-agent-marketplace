// Erzeugt src/ui/home/font-atkinson.js aus @fontsource/atkinson-hyperlegible-next (OFL-1.1, gepinnt in package.json):
// Latin 400 und 700 als base64. Das Modul ist der Feature-Teil "home-font" (nicht im Kern); die Heimseite laedt ihn nach dem
// ersten Bild und registriert die Schrift ueber die FontFace-API (Puffer statt URL, CSP bleibt font-src data:).
// Aufruf: node test/golden/gen-font.cjs
"use strict";
const fs = require("node:fs"), path = require("node:path");
const ROOT = path.resolve(__dirname, "../.."), PKG = path.join(ROOT, "node_modules/@fontsource/atkinson-hyperlegible-next");
const ver = JSON.parse(fs.readFileSync(path.join(PKG, "package.json"), "utf8")).version;
const b64 = (w) => fs.readFileSync(path.join(PKG, "files/atkinson-hyperlegible-next-latin-" + w + "-normal.woff2")).toString("base64");
const out = "// ERZEUGT von test/golden/gen-font.cjs aus @fontsource/atkinson-hyperlegible-next@" + ver + " (OFL-1.1). Nicht von Hand aendern.\n" +
  "export const FONT_FAMILY = \"Atkinson Hyperlegible Next\";\n" +
  "export const FONT_FACES = [{ weight: \"400\", b64: \"" + b64(400) + "\" }, { weight: \"700\", b64: \"" + b64(700) + "\" }];\n";
fs.writeFileSync(path.join(ROOT, "src/ui/home/font-atkinson.js"), out);
console.log("ok: font-atkinson.js " + out.length + " B");
