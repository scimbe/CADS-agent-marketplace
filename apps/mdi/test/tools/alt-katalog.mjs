// Erzeugt test/fixtures/alt-katalog.json: nur die ids des alten Katalogs (ideas, retired, gone) aus ideas.json des
// Altbaums @ pre-legacy-removal, mit Herkunft und Commit. Aufruf: ALT_DIR=<ausgepackte Altdateien> node test/tools/alt-katalog.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ALT = process.env.ALT_DIR;
if (!ALT || !fs.existsSync(path.join(ALT, "ideas.json"))) { console.error("ALT_DIR fehlt oder enthaelt kein ideas.json"); process.exit(2); }
const commit = execFileSync("git", ["rev-list", "-n1", "pre-legacy-removal"], { cwd: HERE }).toString().trim();
const I = JSON.parse(fs.readFileSync(path.join(ALT, "ideas.json"), "utf8"));
const ids = (l) => l.map((x) => (typeof x === "string" ? x : x && x.id)).filter((x) => typeof x === "string"); // gone ist eine Liste von ids
const out = {
  herkunft: `Altbaum @ pre-legacy-removal (${commit}), ideas.json: Felder ideas (Regal), retired (eingeklappte Varianten, Feld to), gone (schon im Altcode ohne Code); erzeugt mit test/tools/alt-katalog.mjs`,
  ideas: ids(I.ideas), retired: ids(I.retired), gone: ids(I.gone)
};
fs.writeFileSync(path.join(HERE, "../fixtures/alt-katalog.json"), JSON.stringify(out, null, 1) + "\n");
console.log("alt-katalog:", out.ideas.length, "ideas,", out.retired.length, "retired,", out.gone.length, "gone");
