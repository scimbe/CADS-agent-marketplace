"use strict";
// Preview pictures of the shelf's cards (npm run shots): every card of src/ideas.json is played in the built page up to a
// real moment of its game, and only the game is photographed (an element of the page, no top bar, no tabs, no field to
// fill in). Pixel 7, German, a fixed day and the page's clock driven by Playwright (each step a fixed tick), so a picture
// comes out the same each time. Saved as WebP 216x288 (3:4, quality 0.5) in src/shots/<id>.webp; the build packs them
// into the image parts (scripts/build.js, bilda, bildb …), never into the core.
//   - turn cards: a whole game is played (the moves of test/fixtures/turn-lines.js, through a real link), the picture is
//     the end with both sides' moves, in that card's own colours (the app's colour pairs, one per card in shelf order)
//   - arcade duels and the flight game: the live game on the sheet, 3 s at a fixed tick
//   - Bauernskat: a hand against the bot, the bot's card on the table; Mal & Rat: a star drawn on its board
//   - every other card: the card as the sheet draws it (a meme, a beat, the dartboard, the card table)
// Run again after a card's look changed: `npm run shots` (all) or `npm run shots -- zug-bluff arcade-kick` (some);
// test/e2e/vorschau.e2e.js compares a few pictures with the game as it looks now.
// Needs the Playwright browser (npx playwright install chromium); nothing is sent anywhere, the page comes from 127.0.0.1.
const fs = require("fs");
const path = require("path");
const { chromium, devices } = require("playwright");
const { ensureBuilt } = require("./ensure-build.js");
const G = require("../test/e2e/lib/grund.js");
const D = require("../src/daily.js"), Tn = require("../src/turns.js");
require("../src/quizspiele.js");   // Was kostet das? joins the turn games
const QP = require("../src/quizpack.js"), PACKS = require("../src/quiz-packs.json").packs;
const LINES = require("../test/fixtures/turn-lines.js");

const root = path.join(__dirname, "..");
const OUT = path.join(root, "src/shots");
const DAY = "2026-11-10T10:00:00Z";
const W = 216, H = 288, Q = 0.5;
// The colour pairs a person picks in the app (src/app.js PAIRS): each card its own, neighbours on the shelf differ.
const PAIRS = JSON.parse(fs.readFileSync(path.join(root, "src/app.js"), "utf8").match(/var PAIRS = (\[.*?\]\]);/)[1]);

async function context(b) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" });
  await ctx.addInitScript(() => { try { if (!localStorage.getItem("daily.v1")) localStorage.setItem("daily.v1", JSON.stringify({ lang: "de" })); } catch (e) {} });
  return ctx;
}
// The link a card is opened with: a turn card as a finished game, every other card as itself.
function link(idea) {
  const g = idea.kind === "turn" && idea.turn.g, line = g && LINES[g];
  if (!line) return "#i=" + idea.id;
  const n = D.IDEAS.indexOf(idea), me = { emoji: "🐙", nick: "Mia", colors: PAIRS[(n * 3) % PAIRS.length], set: "tiere" };
  let d = D.docFromIdea(idea, me, "de");
  if (Tn.GAMES[g].needs) { d.pk = PACKS.map((x) => QP.sanitize(x.pk)).find((p) => QP.fits(g, p)); d.pk.q = d.pk.q.slice(0, 3); }
  const today = Tn.today(new Date(DAY));
  for (const a of line[0]) { const x = Tn.play(d, a, today); if (!x) throw new Error(idea.id + ": Zug passt nicht"); d = x; }
  if (Tn.GAMES[g].close) d = Tn.close(d) || d;
  return "#" + D.docUrl(d).split("#")[1];
}
// The pixels of the biggest canvas on screen (the card or the game as drawn, nothing of the sheet around or over it).
async function canvasImage(p) {
  const u = await p.evaluate(() => {
    let best = null, a = 0;
    for (const c of document.querySelectorAll("canvas")) {
      const x = c.getBoundingClientRect();
      if (x.width < 40 || c.closest("[hidden]") || x.width * x.height <= a) continue;
      best = c; a = x.width * x.height;
    }
    return best && best.toDataURL("image/png");
  });
  if (!u) throw new Error("keine Zeichenflaeche");
  return u;
}
const ticks = async (p, ms) => { for (let t = 0; t < ms; t += 100) await p.clock.runFor(100); };
async function sheet(p, id) {
  for (let i = 0; i < 150; i++) {
    await p.clock.runFor(100);
    const ok = await p.evaluate((x) => { const h = window.DailyDebug && window.DailyDebug.home(), d = h && (h.idea || (h.doc && { id: h.doc.i })); return !!(d && d.id === x && document.body.getAttribute("data-state") !== "boot"); }, id);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error(id + ": Blatt kommt nicht");
}
// One card's picture as WebP bytes; n makes each load a fresh document.
async function shoot(ctx, id, n) {
  const idea = D.IDEAS.find((i) => i.id === id), p = await ctx.newPage();
  try {
    await p.clock.install({ time: new Date(DAY) });
    await p.goto((await G.webUrl("index.html")) + "?n=" + n + link(idea));
    await sheet(p, id);
    let clip, src;
    if (id === "tisch-bauernskat") {
      await p.clock.resume();
      await p.locator("#go").tap(); await p.getByRole("button", { name: /Gegen den Bot/ }).first().tap();
      await p.locator(".bsov").waitFor(); await p.waitForTimeout(2500);   // the bot, who leads, has played its card
      const t = await p.locator(".bsov").boundingBox(), vw = p.viewportSize().width;
      clip = { x: 0, y: t.y + 70, width: vw, height: vw * H / W };
    } else if (idea.kind === "turn" && idea.turn.g === "malrat") {
      await p.clock.resume();
      await p.locator("#go").tap(); await p.getByRole("button", { name: /Malen/i }).first().tap();
      const cv = p.locator("canvas.mrcv"); await cv.waitFor(); const r = await cv.boundingBox();
      await p.getByRole("button", { name: /Rot/i }).first().tap().catch(() => {});
      // the word is "Stern": a five-pointed star in one stroke, as a finger would draw it
      const pt = (k) => { const a = -Math.PI / 2 + k * 4 * Math.PI / 5; return [r.x + r.width / 2 + Math.cos(a) * r.width * 0.36, r.y + r.height / 2 + Math.sin(a) * r.height * 0.36]; };
      await p.mouse.move(...pt(0)); await p.mouse.down();
      for (let k = 1; k <= 5; k++) { const [a, b] = pt(k - 1), [c, d] = pt(k); for (let s = 1; s <= 8; s++) await p.mouse.move(a + (c - a) * s / 8, b + (d - b) * s / 8); }
      await p.mouse.up(); await p.waitForTimeout(300);
      clip = { x: r.x, y: r.y, width: r.width, height: r.width * H / W };   // the board and the colours under it
    } else {
      if (idea.kind === "table") { await p.evaluate(() => window.Parts.need("table")); await p.evaluate(() => window.DailyApp.sheet(window.DailyDebug.home())); }
      await ticks(p, idea.kind === "arcade" || idea.kind === "game" ? 3000 : 600);   // a running game: 3 s of play
      src = await canvasImage(p);
    }
    if (!src) src = "data:image/png;base64," + (await p.screenshot({ clip })).toString("base64");
    const webp = await p.evaluate(async ([src, w, h, q]) => {
      const im = new Image(); im.src = src; await im.decode();
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      let sw = im.width, sh = im.height; if (sh / sw > h / w) sh = sw * h / w; else sw = sh * w / h;   // 3:4 from the middle
      const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, 0, 0, w, h);
      return c.toDataURL("image/webp", q).split(",")[1];
    }, [src, W, H, Q]);
    return Buffer.from(webp, "base64");
  } finally { await p.close(); }
}

async function main() {
  ensureBuilt("");
  const all = D.IDEAS.map((i) => i.id), want = process.argv.slice(2);
  const ids = want.length ? all.filter((i) => want.indexOf(i) >= 0) : all;
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }), ctx = await context(b);
  let k = 0;
  for (const id of ids) {
    const buf = await shoot(ctx, id, k++);
    fs.writeFileSync(path.join(OUT, id + ".webp"), buf);
    console.log(id, buf.length, "bytes");
  }
  await b.close();
  const left = fs.readdirSync(OUT).filter((f) => /\.webp$/.test(f) && all.indexOf(f.slice(0, -5)) < 0);
  left.forEach((f) => fs.rmSync(path.join(OUT, f)));   // a card that left the shelf takes its picture along
  console.log(ids.length, "Bilder,", left.length, "entfernt");
}
module.exports = { context, shoot, W, H, DAY, OUT };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
