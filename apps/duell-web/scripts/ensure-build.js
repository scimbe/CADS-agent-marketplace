"use strict";
// Build only when dist is older than the sources. Each E2E file used to run scripts/build.js when it was loaded, and
// node --test loads the files in parallel: while one file's pages were loading dist, another file rebuilt it. Now a file
// calls ensureBuilt(): the build writes dist/[flavor/].stamp, a hash over everything it reads, and a matching stamp means
// there is nothing to do (npm run test:e2e has just built both flavors). After an edit the stamp no longer matches and the
// file builds itself, so running a single E2E file keeps working.
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
// Everything scripts/build.js reads: own sources, licences, the build itself, the embedded font and the QR code library.
const INPUTS = ["src", "licenses", "legal", "scripts/build.js", "node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2", "node_modules/qrcode-generator/qrcode.js"];
function files(p) {
  const abs = path.join(root, p);
  if (!fs.existsSync(abs)) return [];
  if (!fs.statSync(abs).isDirectory()) return [p];
  return fs.readdirSync(abs).sort().flatMap((f) => files(path.join(p, f)));
}
function stamp(flavor) {
  const h = crypto.createHash("sha256").update("flavor=" + (flavor || "") + "\n");
  for (const f of INPUTS.flatMap(files)) h.update(f + "\n").update(fs.readFileSync(path.join(root, f)));
  return h.digest("hex");
}
const stampFile = (flavor) => path.join(root, "dist", flavor || "", ".stamp");
function upToDate(flavor) { try { return fs.readFileSync(stampFile(flavor), "utf8") === stamp(flavor); } catch (e) { return false; } }
// true when it built, false when dist was already current.
function ensureBuilt(flavor) {
  if (upToDate(flavor)) return false;
  execFileSync(process.execPath, [path.join(__dirname, "build.js")].concat(flavor ? ["--flavor", flavor] : []), { stdio: "pipe" });
  return true;
}
module.exports = { stamp, upToDate, ensureBuilt, stampFile };
if (require.main === module) for (const f of process.argv.slice(2).concat(process.argv.length > 2 ? [] : [""])) console.log((f || "daily") + ":", ensureBuilt(f) ? "built" : "up to date");
