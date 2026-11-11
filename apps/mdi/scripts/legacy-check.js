// Sperre gegen Vermischung (06-plan/slices-detail.md S16, Review M3): sucht das blosse Token des Altbaums in JEDER
// Datei (Importe jeder Form, relative Pfade, Template-Literale, readFileSync-URLs, Shell-Skripte, Workflow).
// Einzige Ausnahme: das Feld "herkunft" in test/fixtures/*.json (dokumentierte Herkunft kopierter Erwartungen).
// Das Token wird zusammengesetzt, damit diese Datei sich nicht selbst meldet.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TOKEN = "duell" + "-web";
const SKIP = new Set(["node_modules", "dist", ".git"]);

function walk(p, out) {
  const st = fs.statSync(p);
  if (st.isDirectory()) { for (const e of fs.readdirSync(p)) if (!SKIP.has(e)) walk(path.join(p, e), out); }
  else out.push(p);
  return out;
}
/** @returns {string[]} Fundstellen "datei:zeile" */
export function findLegacyRefs(...roots) {
  const hits = [], re = new RegExp(TOKEN.replace("-", "[-_ ]?"), "i");
  for (const root of roots) for (const f of walk(path.resolve(root), [])) {
    let text = fs.readFileSync(f, "utf8");
    if (/[\\/]test[\\/]fixtures[\\/][^\\/]+\.json$/.test(f)) {
      try { const j = JSON.parse(text); delete j.herkunft; text = JSON.stringify(j, null, 1); } catch (e) { /* kein JSON: ganz pruefen */ }
    }
    text.split("\n").forEach((line, i) => { if (re.test(line)) hits.push(f + ":" + (i + 1)); });
  }
  return hits;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const roots = process.argv.slice(2);
  const hits = findLegacyRefs(...(roots.length ? roots : [path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")]));
  if (hits.length) { console.error("Verweise auf den Altbaum:\n" + hits.join("\n")); process.exit(1); }
  console.log("legacy-check: ok");
}
