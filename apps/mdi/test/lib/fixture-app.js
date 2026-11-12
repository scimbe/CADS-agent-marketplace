// Testhilfe: dieselbe Laufzeit (src/app/*) mit dem Register der Testkarten (test/fixtures/cards) statt der Produktkarten.
// Der Generator erzeugt Register und Validatoren fuer die Testkarten; esbuild buendelt die Laufzeit und lenkt nur
// src/cards/index.js und src/gen/* auf diese Dateien um. So laufen Statechart, Laufzeit und Netz echt, ohne dass
// Testkarten je ins Produkt gelangen.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { generate } from "../../scripts/gen.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(ROOT, "src"), FIX = path.join(ROOT, "test/fixtures/cards");
let cached = null;

export async function fixtureApp() {
  if (cached) return cached;
  const out = generate({ cardsDir: FIX });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdi-fixapp-"));
  const abs = (p) => JSON.stringify(p.replace(/\\/g, "/"));
  const index = out.index
    .replace(/from "\.\/(\.\.\/\.\.\/test\/fixtures\/cards\/[^"]+)"/g, (m, rel) => "from " + abs(path.join(SRC, "cards", rel)))
    .replace('from "../gen/validators.js"', "from " + abs(path.join(dir, "validators.js")))
    .replace('from "../gen/codehash.js"', "from " + abs(path.join(dir, "codehash.js")))
    .replace('from "../contract/modes.js"', "from " + abs(path.join(SRC, "contract/modes.js")));
  fs.writeFileSync(path.join(dir, "index.js"), index);
  fs.writeFileSync(path.join(dir, "validators.js"), out["gen/validators.js"].replace('from "../contract/equal.js"', "from " + abs(path.join(SRC, "contract/equal.js"))));
  fs.writeFileSync(path.join(dir, "codehash.js"), out["gen/codehash.js"]);
  fs.writeFileSync(path.join(dir, "entry.js"), "export { createRuntime } from " + abs(path.join(SRC, "app/runtime.js")) + ";\nexport { machine, initialContext } from " + abs(path.join(SRC, "app/machine.js")) + ";\nexport * as G from " + abs(path.join(SRC, "app/game.js")) + ";\n");
  const redirect = { [path.join(SRC, "cards/index.js")]: path.join(dir, "index.js"), [path.join(SRC, "gen/validators.js")]: path.join(dir, "validators.js"), [path.join(SRC, "gen/codehash.js")]: path.join(dir, "codehash.js") };
  await esbuild.build({
    entryPoints: [path.join(dir, "entry.js")], bundle: true, format: "esm", platform: "node", outfile: path.join(dir, "app.mjs"), logLevel: "error",
    plugins: [{ name: "fixture-register", setup(b) { b.onResolve({ filter: /\.js$/ }, (a) => { const p = path.resolve(a.resolveDir, a.path); return redirect[p] ? { path: redirect[p] } : undefined; }); } }]
  });
  cached = await import(pathToFileURL(path.join(dir, "app.mjs")).href);
  return cached;
}
