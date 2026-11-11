// Sicherheitsaudit der Abhaengigkeiten (00-hygiene.md "Audit im CI"): jede Meldung ab "high" bricht ab, ausser sie
// steht mit Begruendung in ERLAUBT. Eintraege brauchen Paket, Grund und Pruefdatum; sie werden je Slice neu geprueft.
import { execFileSync } from "node:child_process";

const ERLAUBT = {
  "fast-uri": {
    grund: "nur zur Build-Zeit: Ajv loest damit die $id/$ref unserer eigenen, statischen Schemata auf; keine fremden URIs, " +
      "nicht im ausgelieferten Bundle (Ajv standalone). Kein gepatchtes Release (3.x bis 3.1.5 und 4.0.0 betroffen).",
    geprueft: "2026-11-11"
  }
};
let out;
try { out = execFileSync("npm", ["audit", "--json", "--omit=optional"], { encoding: "utf8" }); }
catch (e) { out = e.stdout; }
const r = JSON.parse(out), bad = [];
for (const [name, v] of Object.entries(r.vulnerabilities || {})) {
  if (!["high", "critical"].includes(v.severity)) continue;
  const via = v.via.map((x) => (typeof x === "string" ? x : x.name));
  if (ERLAUBT[name] || via.every((x) => ERLAUBT[x])) { console.log("audit: erlaubt " + name + " – " + (ERLAUBT[name] || ERLAUBT[via[0]]).grund); continue; }
  bad.push(name + " (" + v.severity + ")");
}
if (bad.length) { console.error("audit: nicht erlaubt: " + bad.join(", ")); process.exit(1); }
console.log("audit: ok");
