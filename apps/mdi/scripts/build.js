// Build: eine Offline-HTML-Datei (Kern) + Teile mit Inhalts-Hash. Strikte CSP ohne unsafe-inline/unsafe-eval:
// Skript und Stil sind per SHA-256 erlaubt, Teile per 'self' (+ SRI auf http(s)). Validatoren kommen aus scripts/gen.js.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { generate } from "./gen.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src"), DIST = path.join(ROOT, "dist");
export const WC = "https://webconference.bunsenbrenner.org";

if (process.argv.includes("--flavor")) console.log("build: --flavor wird in D0 ignoriert (Business-Sicht ist Slice S14b)");

const b64 = (buf) => Buffer.from(buf).toString("base64");
const sha = (alg, s) => crypto.createHash(alg).update(s).digest();

export async function build() {
  // 1) erzeugte Dateien aktualisieren
  const gen = generate();
  fs.mkdirSync(path.join(SRC, "gen"), { recursive: true });
  for (const [f, s] of Object.entries(gen)) { const p = path.join(SRC, "gen", f); if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== s) fs.writeFileSync(p, s); }

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST, "parts"), { recursive: true });
  const common = { bundle: true, minify: true, format: "iife", target: ["es2022", "safari16"], legalComments: "none", write: false, logLevel: "error", charset: "utf8" };

  // 2) Teil "live": eigenes Dokument fuer den abgeschotteten Rahmen (sandbox ohne same-origin) mit eigener CSP.
  //    Nur dort darf das ct-agent-Modul der Webkonferenz laden; der App-Realm hat connect-src 'none' (Review M4).
  const livePart = await esbuild.build({ ...common, entryPoints: [path.join(SRC, "broker/live-frame.js")] });
  const liveJs = livePart.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const frameCsp = [
    "default-src 'none'",
    "script-src 'sha256-" + b64(sha("sha256", liveJs)) + "' " + WC + "/pkg/ 'wasm-unsafe-eval'",
    "connect-src " + WC + " wss://webconference.bunsenbrenner.org",
    "base-uri 'none'", "form-action 'none'"
  ].join("; ");
  const frameHtml = '<!doctype html>\n<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + frameCsp + '"><meta name="referrer" content="no-referrer"></head><body><script>' + liveJs + "</script></body></html>\n";
  const liveName = "parts/live-frame." + sha("sha256", frameHtml).toString("hex").slice(0, 10) + ".html";
  fs.writeFileSync(path.join(DIST, liveName), frameHtml);
  const parts = { live: { file: liveName } };

  // 3) Kern
  const core = await esbuild.build({ ...common, entryPoints: [path.join(SRC, "main.js")], define: { __PARTS__: JSON.stringify(parts) } });
  const js = core.outputFiles[0].text.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
  const anton = fs.readFileSync(path.join(ROOT, "node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2"));
  const cssSrc = fs.readFileSync(path.join(SRC, "ui/tokens.css"), "utf8").replace("__ANTON__", "data:font/woff2;base64," + b64(anton));
  const css = (await esbuild.transform(cssSrc, { loader: "css", minify: true, target: ["safari16", "chrome110"] })).code.trim();
  const csp = [
    "default-src 'none'",
    "script-src 'sha256-" + b64(sha("sha256", js)) + "'",
    "style-src 'sha256-" + b64(sha("sha256", css)) + "'",
    "font-src data:", "img-src data:",
    "connect-src 'none'", "frame-src 'self'",
    "base-uri 'none'", "form-action 'none'", "object-src 'none'"
  ].join("; ");
  const tpl = fs.readFileSync(path.join(SRC, "index.template.html"), "utf8");
  const html = tpl.replace("__CSP__", csp).replace("__CSS__", () => css).replace("__JS__", () => js);
  fs.writeFileSync(path.join(DIST, "index.html"), html);
  const report = { core: Buffer.byteLength(html), parts: { [liveName]: Buffer.byteLength(frameHtml) } };
  fs.writeFileSync(path.join(DIST, "build.json"), JSON.stringify({ parts, report }, null, 2));
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await build();
  console.log("build: dist/index.html " + r.core + " B; " + Object.entries(r.parts).map(([k, v]) => k + " " + v + " B").join(", "));
}
