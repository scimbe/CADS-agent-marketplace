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
// Eltern, die den Live-Rahmen der Webkonferenz einbetten duerfen (= PLAY_ALLOWED_ORIGINS der Bruecke); per Umgebung aenderbar
export const PLAY_PARENTS = String(process.env.MDI_PLAY_PARENTS || "https://demos-34a13a96.bunsenbrenner.org,https://bunsenbrenner.org").split(",").map((x) => x.trim()).filter(Boolean);

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

  // 2) Live-Rahmen in zwei Varianten (Review M4 + Realnetz-Pruefung):
  //    remote: play-frame.html fuer den Ursprung der Webkonferenz (gleicher Ursprung wie /api/play -> kein CORS noetig,
  //            fremder Ursprung zur App -> getrennt). Eltern nur laut Allowlist (wie PLAY_ALLOWED_ORIGINS der Bruecke).
  //            frame-ancestors setzt der Webkonferenz-Caddy per Header (Meta-CSP kann das nicht).
  //    local:  Rueckfall fuer file:// und Tests, opaker Ursprung.
  async function frame(parents, scriptSrc, connectSrc) {
    const r = await esbuild.build({ ...common, entryPoints: [path.join(SRC, "broker/live-frame.js")], define: { __FRAME_PARENTS__: JSON.stringify(parents) } });
    const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
    const csp = ["default-src 'none'", "script-src 'sha256-" + b64(sha("sha256", js)) + "' " + scriptSrc + " 'wasm-unsafe-eval'", "connect-src " + connectSrc, "base-uri 'none'", "form-action 'none'"].join("; ");
    return { js, html: '<!doctype html>\n<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + csp + '"><meta name="referrer" content="no-referrer"><title>live</title></head><body><script>' + js + "</script></body></html>\n" };
  }
  const local = await frame(["null"], WC + "/pkg/", WC + " wss://webconference.bunsenbrenner.org");
  const liveName = "parts/live-frame." + sha("sha256", local.html).toString("hex").slice(0, 10) + ".html";
  fs.writeFileSync(path.join(DIST, liveName), local.html);
  const parts = { live: { file: liveName } };
  const remote = await frame(PLAY_PARENTS, "'self'", "'self'");
  fs.mkdirSync(path.join(DIST, "remote"), { recursive: true });
  const remoteHeaders = { "Content-Security-Policy": "frame-ancestors " + PLAY_PARENTS.join(" ") + "; base-uri 'none'", "X-Frame-Options": null, "Cache-Control": "no-cache" };
  fs.writeFileSync(path.join(DIST, "remote/play-frame.html"), remote.html);
  fs.writeFileSync(path.join(DIST, "remote/play-frame.headers.json"), JSON.stringify(remoteHeaders, null, 2) + "\n");
  const liveRemote = { src: WC + "/play-frame.html", origin: WC };

  // 3) Kern
  const core = await esbuild.build({ ...common, entryPoints: [path.join(SRC, "main.js")], define: { __PARTS__: JSON.stringify(parts), __LIVE_REMOTE__: JSON.stringify(liveRemote) } });
  const js = core.outputFiles[0].text.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
  const anton = fs.readFileSync(path.join(ROOT, "node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2"));
  const cssSrc = fs.readFileSync(path.join(SRC, "ui/tokens.css"), "utf8").replace("__ANTON__", "data:font/woff2;base64," + b64(anton));
  const css = (await esbuild.transform(cssSrc, { loader: "css", minify: true, target: ["safari16", "chrome110"] })).code.trim();
  const csp = [
    "default-src 'none'",
    "script-src 'sha256-" + b64(sha("sha256", js)) + "'",
    "style-src 'sha256-" + b64(sha("sha256", css)) + "'",
    "font-src data:", "img-src data:",
    "connect-src 'none'", "frame-src 'self' " + liveRemote.src,
    "base-uri 'none'", "form-action 'none'", "object-src 'none'"
  ].join("; ");
  const tpl = fs.readFileSync(path.join(SRC, "index.template.html"), "utf8");
  const html = tpl.replace("__CSP__", csp).replace("__CSS__", () => css).replace("__JS__", () => js);
  fs.writeFileSync(path.join(DIST, "index.html"), html);
  const report = { core: Buffer.byteLength(html), parts: { [liveName]: Buffer.byteLength(local.html), "remote/play-frame.html": Buffer.byteLength(remote.html) } };
  fs.writeFileSync(path.join(DIST, "build.json"), JSON.stringify({ parts, report }, null, 2));
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await build();
  console.log("build: dist/index.html " + r.core + " B; " + Object.entries(r.parts).map(([k, v]) => k + " " + v + " B").join(", "));
}
