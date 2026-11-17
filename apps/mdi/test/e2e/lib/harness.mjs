// Baut eine Testseite aus einem Einstieg (esbuild) mit den echten Stilen (tokens.css + widgets.css) und strikter CSP.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export async function harnessPage(entry) {
  const r = await esbuild.build({ entryPoints: [path.join(ROOT, entry)], bundle: true, format: "iife", write: false, logLevel: "error" });
  const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const anton = fs.readFileSync(path.join(ROOT, "node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2")).toString("base64");
  const css = fs.readFileSync(path.join(ROOT, "src/ui/tokens.css"), "utf8").replace("__ANTON__", "data:font/woff2;base64," + anton) + "\n" + fs.readFileSync(path.join(ROOT, "src/render/widgets.css"), "utf8") + "\nbody{background:var(--bg);color:var(--text);font-family:var(--font-body);margin:0;padding:16px}";
  const b64 = (s) => crypto.createHash("sha256").update(s).digest("base64");
  const csp = "default-src 'none'; script-src 'sha256-" + b64(js) + "'; style-src 'sha256-" + b64(css) + "'; img-src data: blob:; font-src data:";
  const html = '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="' + csp + '"><title>Test</title><style>' + css + '</style></head><body><main id="app"></main><script>' + js + "</script></body></html>";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdi-harness-"));
  const file = path.join(dir, "page.html"); fs.writeFileSync(file, html);
  return "file://" + file;
}
