// Build: eine Offline-HTML-Datei (Kern) + Teile mit Inhalts-Hash. Strikte CSP ohne unsafe-inline/unsafe-eval:
// Skript und Stil sind per SHA-256 erlaubt, Teile per 'self' (+ SRI auf http(s)). Validatoren kommen aus scripts/gen.js.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { generate, writeGenerated, discover } from "./gen.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src"), DIST = path.join(ROOT, "dist");
export const WC = "https://webconference.bunsenbrenner.org";
// Eltern, die den Live-Rahmen der Webkonferenz einbetten duerfen (= PLAY_ALLOWED_ORIGINS der Bruecke); per Umgebung aenderbar
export const PLAY_PARENTS = String(process.env.MDI_PLAY_PARENTS || "https://demos-34a13a96.bunsenbrenner.org,https://bunsenbrenner.org").split(",").map((x) => x.trim()).filter(Boolean);

if (process.argv.includes("--flavor")) console.log("build: --flavor wird in D0 ignoriert (Business-Sicht ist Slice S14b)");

const b64 = (buf) => Buffer.from(buf).toString("base64");
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".json": "application/json" };
export const THUMB_CHUNK = 80 * 1024;

/** Karten als Teile (ADR 0001 Nachtrag 2): Modul + Validatoren + Assets; Faehigkeiten (eigener Bot) aus dem Modul. */
async function cardParts(common) {
  const ids = discover(path.join(SRC, "cards")), out = {}, caps = {}, sizes = {};
  const hashes = (await import(pathToFileURL(path.join(SRC, "gen/codehash.js")).href + "?t=" + Date.now())).CODE_HASH;
  for (const id of ids) {
    const dir = path.join(SRC, "cards", id), man = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    const mod = (await import(pathToFileURL(path.join(dir, "card.js")).href)).default;
    caps[id] = { bot: typeof mod.bot === "function" };
    const assets = {};
    for (const a of man.assets || []) {
      const f = path.join(dir, a.file), buf = fs.readFileSync(f);
      assets[a.id] = a.type === "json" ? JSON.parse(buf.toString("utf8")) : { type: a.type, url: "data:" + (MIME[path.extname(f)] || "application/octet-stream") + ";base64," + b64(buf), tile: a.tile, keys: a.keys };
    }
    const entry = "import card from " + JSON.stringify(path.join(dir, "card.js")) + ";\nimport * as V from " + JSON.stringify(path.join(SRC, "gen/cards", id + ".js")) + ";\n" +
      "document.dispatchEvent(new CustomEvent(\"mdi:part\", { detail: { id: " + JSON.stringify(id) + ", hash: " + JSON.stringify(hashes[id]) + ", card, params: V.params, inputs: V.inputs, assets: " + JSON.stringify(assets) + " } }));\n";
    const r = await esbuild.build({ ...common, stdin: { contents: entry, resolveDir: dir, sourcefile: "part-" + id + ".js", loader: "js" } });
    const js = r.outputFiles[0].text;
    const file = "parts/card-" + id + "." + sha("sha256", js).toString("hex").slice(0, 12) + ".js";
    fs.writeFileSync(path.join(DIST, file), js);
    out[id] = { file, sri: "sha384-" + b64(sha("sha384", js)) };
    sizes[file] = Buffer.byteLength(js);
  }
  return { parts: out, caps, sizes };
}

/** Thumbnails als Teile (je bis 80 KB), Index Schluessel (id oder id/variante) -> Teil. */
function thumbParts() {
  const items = [];
  for (const id of discover(path.join(SRC, "cards"))) {
    const dir = path.join(SRC, "cards", id), man = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    const add = (key, t) => { if (t) items.push([key, "data:image/webp;base64," + b64(fs.readFileSync(path.join(dir, t.file)))]); };
    add(id, man.thumb);
    for (const v of man.variants || []) add(id + "/" + v.id, v.thumb);
  }
  const files = {}, index = {}, sizes = {};
  let chunk = [], n = 0, bytes = 0;
  const flush = () => {
    if (!chunk.length) return;
    const map = Object.fromEntries(chunk), js = "document.dispatchEvent(new CustomEvent(\"mdi:thumbs\",{detail:{chunk:" + n + ",map:" + JSON.stringify(map) + "}}));\n";
    const file = "parts/thumbs-" + n + "." + sha("sha256", js).toString("hex").slice(0, 12) + ".js";
    fs.writeFileSync(path.join(DIST, file), js);
    files[n] = { file, sri: "sha384-" + b64(sha("sha384", js)) }; sizes[file] = Buffer.byteLength(js);
    for (const [k] of chunk) index[k] = n;
    n++; chunk = []; bytes = 0;
  };
  for (const it of items) { if (bytes + it[1].length > THUMB_CHUNK) flush(); chunk.push(it); bytes += it[1].length; }
  flush();
  return { thumbs: { index, files }, sizes };
}
const sha = (alg, s) => crypto.createHash(alg).update(s).digest();

export async function build() {
  // 1) erzeugte Dateien aktualisieren
  writeGenerated(generate());

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

  // 3) Karten- und Thumbnail-Teile
  const cp = await cardParts(common), tp = thumbParts();

  // 4) Kern: das Register ist im Browser src/cards/lazy.js (nur Metadaten), Karten kommen als Teile
  const lazyRegister = { name: "lazy-register", setup(b) { b.onResolve({ filter: /cards\/index\.js$/ }, (a) => { const p = path.resolve(a.resolveDir, a.path); return p === path.join(SRC, "cards/index.js") ? { path: path.join(SRC, "cards/lazy.js") } : undefined; }); } };
  const core = await esbuild.build({ ...common, entryPoints: [path.join(SRC, "main.js")], plugins: [lazyRegister], define: { __PARTS__: JSON.stringify(parts), __LIVE_REMOTE__: JSON.stringify(liveRemote), __CARD_PARTS__: JSON.stringify(cp.parts), __CARD_CAPS__: JSON.stringify(cp.caps), __THUMB_PARTS__: JSON.stringify(tp.thumbs) } });
  const js = core.outputFiles[0].text.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
  const anton = fs.readFileSync(path.join(ROOT, "node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2"));
  // tokens.css (Strang H) + Widget-/Buehnen-Stile (Strang F, src/render/widgets.css)
  const cssSrc = (fs.readFileSync(path.join(SRC, "ui/tokens.css"), "utf8") + "\n" + fs.readFileSync(path.join(SRC, "render/widgets.css"), "utf8")).replace("__ANTON__", "data:font/woff2;base64," + b64(anton));
  const css = (await esbuild.transform(cssSrc, { loader: "css", minify: true, target: ["safari16", "chrome110"] })).code.trim();
  const csp = [
    "default-src 'none'",
    // Teile fuegt nur der Kern ein ('strict-dynamic'); jeder Teil traegt SRI (SHA-384), Hash im Dateinamen
    "script-src 'sha256-" + b64(sha("sha256", js)) + "' 'strict-dynamic'",
    "style-src 'sha256-" + b64(sha("sha256", css)) + "'",
    "font-src data:", "img-src data: blob:",
    // Konto/Profil/Guthaben: nur der eigene Server (/api/duell, /auth/me, gleiche Herkunft). Live braucht im Kern nichts:
    // dessen Netz laeuft im abgeschotteten Rahmen mit eigener CSP.
    "connect-src 'self'", "frame-src 'self' " + liveRemote.src,
    "base-uri 'none'", "form-action 'none'", "object-src 'none'"
  ].join("; ");
  const tpl = fs.readFileSync(path.join(SRC, "index.template.html"), "utf8");
  const html = tpl.replace("__CSP__", csp).replace("__CSS__", () => css).replace("__JS__", () => js);
  fs.writeFileSync(path.join(DIST, "index.html"), html);
  const report = { core: Buffer.byteLength(html), parts: { [liveName]: Buffer.byteLength(local.html), "remote/play-frame.html": Buffer.byteLength(remote.html), ...cp.sizes, ...tp.sizes } };
  fs.writeFileSync(path.join(DIST, "build.json"), JSON.stringify({ parts, cards: cp.parts, thumbs: tp.thumbs, caps: cp.caps, report }, null, 2));
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await build();
  const cards = Object.entries(r.parts).filter(([k]) => k.startsWith("parts/card-")), thumbs = Object.entries(r.parts).filter(([k]) => k.startsWith("parts/thumbs-"));
  console.log("build: dist/index.html " + r.core + " B; " + cards.length + " Kartenteile (" + cards.reduce((a, [, v]) => a + v, 0) + " B, groesster " + Math.max(0, ...cards.map(([, v]) => v)) + " B), " + thumbs.length + " Thumbnail-Teile (" + thumbs.reduce((a, [, v]) => a + v, 0) + " B)");
}
