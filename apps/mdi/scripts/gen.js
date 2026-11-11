// Erzeugt zur Build-Zeit: Ajv-Standalone-Validatoren (kein new Function zur Laufzeit, CSP ohne unsafe-eval) und
// Code-Hashes der Kartenmodule. Ausgabe in src/gen/ (eingecheckt; build.test prueft Aktualitaet).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import standaloneCode from "ajv/dist/standalone/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
export const CARDS = ["gruss", "bluff"];

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

export function generate() {
  const ajv = new Ajv({ code: { source: true, esm: true, lines: false }, strict: true, unicodeRegExp: true, unicode: false, allErrors: false, logger: false });
  ajv.addVocabulary(["x-field", "x-label", "x-model"]);
  ajv.addSchema(readJson(path.join(SRC, "schema/link.schema.json")));
  ajv.addSchema(readJson(path.join(SRC, "schema/live.schema.json")));
  ajv.addSchema(readJson(path.join(SRC, "schema/manifest.schema.json")));
  const map = { linkCard: "link#/$defs/card", linkChallenge: "link#/$defs/challenge", linkLive: "link#/$defs/live", liveMsg: "live", manifest: "manifest" };
  const hashes = {};
  for (const id of CARDS) {
    const dir = path.join(SRC, "cards", id);
    const man = readJson(path.join(dir, "manifest.json"));
    ajv.addSchema({ ...man.params, $id: "params-" + id });
    map["params_" + id.replace(/-/g, "_")] = "params-" + id;
    const h = crypto.createHash("sha256");
    h.update(fs.readFileSync(path.join(dir, "manifest.json"))); h.update(fs.readFileSync(path.join(dir, "card.js")));
    hashes[id] = h.digest("hex").slice(0, 32);
  }
  const head = "// ERZEUGT von scripts/gen.js – nicht von Hand aendern.\n/* eslint-disable */\n";
  const validators = head + standaloneCode(ajv, map);
  const codehash = head + "export const CODE_HASH = " + JSON.stringify(hashes, null, 2) + ";\n";
  return { "validators.js": validators, "codehash.js": codehash };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = generate();
  fs.mkdirSync(path.join(SRC, "gen"), { recursive: true });
  for (const [f, s] of Object.entries(out)) fs.writeFileSync(path.join(SRC, "gen", f), s);
  console.log("gen: " + Object.keys(out).join(", "));
}
