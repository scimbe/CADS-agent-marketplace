// Thumbnails 16:9 je Karte (ADR 0001 d): echter Screenshot im Startzustand, deterministisch.
//   node scripts/thumbs.js            erzeugt src/cards/<id>/thumb.webp (und thumb-<variante>.webp mit --variants),
//                                     traegt thumb {src:"shot", file, alt} ins Manifest ein, wo es fehlt
//   node scripts/thumbs.js --check    rendert neu und vergleicht mit den Dateien (Exit 1 bei Abweichung)
//   node scripts/thumbs.js --only id1,id2
// Ablauf: Vorschau ueber G.previewNode (dieselbe Regel wie in der App: Zug/statisch ueber observe, Echtzeit Bot gegen
// Bot nach rt.preview.ticks), gerendert mit dem echten Renderer in einer Testseite (Chromium, 960x540, Locale de,
// prefers-reduced-motion, feste Uhr 2026-11-10T10:00Z), als PNG abgegriffen und im Browser zu WebP (q 0,7) kodiert.
// Karten mit src:"ki" werden nicht ueberschrieben (KI-Bild ersetzt den Screenshot nach Pruefung).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
export const W = 960, H = 540, QUALITY = 0.7, MAX_BYTES = 60 * 1024;
const FIXED_TIME = Date.parse("2026-11-10T10:00:00Z");

async function page() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdi-thumbs-"));
  const r = await esbuild.build({ entryPoints: [path.join(ROOT, "scripts/thumbs-page.js")], bundle: true, format: "iife", write: false, logLevel: "error", define: { __ROOT__: JSON.stringify(ROOT) } });
  const tokens = fs.readFileSync(path.join(SRC, "ui/tokens.css"), "utf8").replace(/url\(__ANTON__\)/g, "local('Anton')") + "\n" + fs.readFileSync(path.join(SRC, "render/widgets.css"), "utf8");
  const anton = fs.readFileSync(path.join(ROOT, "node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2")).toString("base64");
  const html = '<!doctype html><html lang="de"><head><meta charset="utf-8"><style>@font-face{font-family:Anton;src:url(data:font/woff2;base64,' + anton + ") format('woff2')}" + tokens +
    "html,body{margin:0;width:" + W + "px;height:" + H + "px;overflow:hidden;background:var(--bg)}#t{width:" + W + "px;height:" + H + "px;display:grid;place-items:center;overflow:hidden}#t>*{max-width:" + W + "px;max-height:" + H + "px}" +
    "#t .frame{height:" + H + "px;width:auto;max-width:" + W + "px}#t .w-canvas,#t canvas{height:" + H + "px;width:auto;max-width:" + W + "px}</style></head><body><div id=\"t\"></div><script>" + r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script") + "</script></body></html>";
  const file = path.join(dir, "thumbs.html");
  fs.writeFileSync(file, html);
  return { file, dir };
}

export async function renderThumbs({ only = null, variants = false } = {}) {
  const { chromium } = await import("playwright");
  const { file, dir } = await page();
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  try {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: "de-DE", reducedMotion: "reduce", colorScheme: "light" });
    await ctx.addInitScript(`{ const T = ${FIXED_TIME}; const D = Date; globalThis.Date = class extends D { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } }; }`);
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
    await p.goto("file://" + file);
    await p.waitForFunction(() => window.__thumbs && window.__thumbs.ready);
    const list = await p.evaluate(() => window.__thumbs.list());
    const out = [];
    for (const it of list) {
      if (only && !only.includes(it.id)) continue;
      const jobs = [{ id: it.id, variant: null }].concat(variants ? it.variants.map((v) => ({ id: it.id, variant: v })) : []);
      for (const j of jobs) {
        await p.evaluate((x) => window.__thumbs.show(x.id, x.variant), j);
        await p.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
        const png = await p.screenshot({ type: "png", clip: { x: 0, y: 0, width: W, height: H } });
        const webp = await p.evaluate(async ({ b64, q }) => {
          const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
          const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; c.getContext("2d").drawImage(img, 0, 0);
          return c.toDataURL("image/webp", q).split(",")[1];
        }, { b64: png.toString("base64"), q: QUALITY });
        out.push({ ...j, bytes: Buffer.from(webp, "base64"), unknown: await p.evaluate(() => window.__thumbs.unknown.splice(0)) });
      }
    }
    if (errs.length) throw new Error("thumbs: Seitenfehler: " + errs.join("; "));
    return out;
  } finally { await b.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}

function fileFor(t) { return t.variant ? "thumb-" + t.variant + ".webp" : "thumb.webp"; }
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex").slice(0, 16);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
  const check = args.includes("--check"), variants = args.includes("--variants");
  const res = await renderThumbs({ only, variants });
  let bad = 0;
  for (const t of res) {
    const dir = path.join(SRC, "cards", t.id), mf = path.join(dir, "manifest.json"), man = JSON.parse(fs.readFileSync(mf, "utf8"));
    const cur = t.variant ? (man.variants || []).find((v) => v.id === t.variant) : man;
    if (cur && cur.thumb && cur.thumb.src === "ki") { console.log("thumbs: " + t.id + (t.variant ? "/" + t.variant : "") + " hat ein KI-Bild, bleibt"); continue; }
    if (t.unknown.length) { console.error("thumbs: " + t.id + ": unbekannte Knoten/Ops " + t.unknown.join(",")); bad++; }
    if (t.bytes.length > MAX_BYTES) { console.error("thumbs: " + t.id + ": " + t.bytes.length + " B > " + MAX_BYTES + " B"); bad++; continue; }
    const p = path.join(dir, fileFor(t));
    if (check) { const old = fs.existsSync(p) ? fs.readFileSync(p) : null; if (!old || sha(old) !== sha(t.bytes)) { console.error("thumbs: " + t.id + " weicht ab (" + fileFor(t) + ")"); bad++; } continue; }
    fs.writeFileSync(p, t.bytes);
    if (!cur.thumb) {
      cur.thumb = { src: "shot", file: fileFor(t), alt: { de: (t.variant ? cur.title.de : man.title.de), en: (t.variant ? cur.title.en : man.title.en) } };
      fs.writeFileSync(mf, JSON.stringify(man, null, 2) + "\n");
    }
    console.log("thumbs: " + t.id + (t.variant ? "/" + t.variant : "") + " " + t.bytes.length + " B");
  }
  if (bad) process.exit(1);
}
