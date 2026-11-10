"use strict";
// Preview pictures of the shelf's cards (npm run shots): every card of src/ideas.json is opened in the built page as a
// person would open it (its link #i=<id>, then the main button), and what the screen shows then is the picture: a real
// screenshot of the game, no drawing made for it. Pixel 7, German, a fixed day (so a daily game shows the same round).
// A game played on one phone in turns (its button "LOS") is started, so the picture shows the round, not the start
// button. The part below the top bar is cut to 3:4 and saved as a small WebP (src/shots/<id>.webp, 216x288, quality
// 0.5); the build packs them into the image parts (scripts/build.js, bilda, bildb …), never into the core.
// Run again after a card's look changed: `npm run shots` (all) or `npm run shots -- zug-bluff arcade-kick` (some);
// test/e2e/vorschau.e2e.js compares a few pictures with the game as it looks now.
// Needs the Playwright browser (npx playwright install chromium); nothing is sent anywhere, the page comes from 127.0.0.1.
const fs = require("fs");
const path = require("path");
const { chromium, devices } = require("playwright");
const { ensureBuilt } = require("./ensure-build.js");
const G = require("../test/e2e/lib/grund.js");

const root = path.join(__dirname, "..");
const OUT = path.join(root, "src/shots");
const DAY = "2026-11-10T10:00:00Z";
const W = 216, H = 288, Q = 0.5, TOP = 44;   // TOP: the top bar (title, language, close) in CSS px, not part of the picture

// The browser context the pictures are taken in (also for the comparison in the E2E test).
async function context(b) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE", reducedMotion: "reduce" });
  await ctx.addInitScript((t) => {
    try { localStorage.setItem("daily.v1", JSON.stringify({ lang: "de" })); } catch (e) {}
    const T = Date.parse(t), D = Date; window.Date = class extends D { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } };
  }, DAY);
  return ctx;
}
// One card's picture as WebP bytes; n makes each load a fresh document (an open game from the card before is gone).
async function shoot(p, id, n) {
  await p.goto((await G.webUrl("index.html")) + "?n=" + n + "#i=" + id);
  const at = await p.waitForFunction((x) => {
    const h = window.DailyDebug && window.DailyDebug.home();
    if (h && h.idea && h.idea.id === x && h.note) return "sheet";
    return document.getElementById("toast").classList.contains("show") ? "toast" : false;
  }, id, { timeout: 15000 }).then((h) => h.jsonValue());
  // the game itself; a card that only opens its sheet here (a call it needs) keeps the sheet as its picture
  if (at === "sheet") {
    await p.locator("#go").tap({ timeout: 10000 });
    await p.waitForFunction(() => window.Parts.names().every((n) => !document.querySelector('script[src$="' + window.DailyParts[n].f + '"]') || window.Parts.ready(n)), null, { timeout: 15000 });
  }
  const los = p.locator("#editor button:visible", { hasText: /^\W*los$/i });
  if (await los.count()) { await los.first().tap(); await p.waitForTimeout(3500); }   // past the countdown, into the round
  await p.waitForTimeout(1200);   // drawn, the first frames of a running demo
  await p.evaluate(() => { const t = document.getElementById("toast"); if (t) t.classList.remove("show"); });
  const vw = p.viewportSize().width, png = await p.screenshot({ clip: { x: 0, y: TOP, width: vw, height: Math.round(vw * H / W) } });
  const webp = await p.evaluate(async ([src, w, h, q]) => {
    const im = new Image(); im.src = src; await im.decode();
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(im, 0, 0, w, h);
    return c.toDataURL("image/webp", q).split(",")[1];
  }, ["data:image/png;base64," + png.toString("base64"), W, H, Q]);
  return { at, buf: Buffer.from(webp, "base64") };
}

async function main() {
  ensureBuilt("");
  const all = require("../src/ideas.json").ideas.map((i) => i.id), want = process.argv.slice(2);
  const ids = want.length ? all.filter((i) => want.indexOf(i) >= 0) : all;
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const p = await (await context(b)).newPage();
  let k = 0;
  for (const id of ids) {
    const r = await shoot(p, id, k++);
    fs.writeFileSync(path.join(OUT, id + ".webp"), r.buf);
    console.log(id, r.at, r.buf.length, "bytes");
  }
  await b.close();
  const left = fs.readdirSync(OUT).filter((f) => /\.webp$/.test(f) && all.indexOf(f.slice(0, -5)) < 0);
  left.forEach((f) => fs.rmSync(path.join(OUT, f)));   // a card that left the shelf takes its picture along
  console.log(ids.length, "Bilder,", left.length, "entfernt");
}
module.exports = { context, shoot, W, H, DAY, OUT };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
