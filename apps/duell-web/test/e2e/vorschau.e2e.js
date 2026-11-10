"use strict";
// Preview pictures on the start page (src/start-ui.js "Vorschaubilder", scripts/shots.js): the rail "So sieht es aus" under
// the intention tiles and every card's picture in "Alle Karten". Real screenshots, lazily loaded part by part, with alt
// text, nothing loaded with Save-Data, and the pictures still look like the games do now (screenshot comparison).
// SHOT_DIR=<folder> keeps the screenshots of the start page for a look by eye.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const G = require("./lib/grund.js");
const S = require("../../scripts/shots.js");
const { ensureBuilt } = require("../../scripts/ensure-build.js");

const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RULES = { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } };
const DAY = "2026-11-10T10:00:00Z";   // Tuesday 10 Nov: the day's card is "Stangen Kick" (arcade-kick)
const SHELF = require("../../src/ideas.json").ideas;
const out = process.env.SHOT_DIR;
const shot = (p, f) => (out ? p.screenshot({ path: path.join(out, f) }) : null);
const ready = (p) => p.evaluate(() => window.Parts.names().filter((n) => /^bild[a-z]$/.test(n) && window.Parts.ready(n)));

async function start(o) {
  ensureBuilt("");
  const b = await G.launch(), ctx = await G.person(b, Object.assign({ lang: "de", view: "phone390", time: DAY, web: true }, o));
  await ctx.route(/^https?:/, (r) => (G.isLocal(r.request().url()) ? r.continue() : r.abort()));
  if (o && o.saveData) await ctx.addInitScript(() => { Object.defineProperty(navigator, "connection", { value: { saveData: true } }); });
  const p = await G.open(ctx, ""); await p.locator("#startbox").waitFor();
  return { b, ctx, p };
}

test("Vorschau: acht echte Spielbilder unter den Kacheln, mit Alt-Text, nur die sichtbaren Teile geladen", async () => {
  const { b, p } = await start();
  try {
    await shot(p, "vorschau-1-oben.png");
    assert.equal(await p.locator("#stlookh").textContent(), "So sieht es aus");
    const tiles = p.locator(".strail .stshot");
    assert.equal(await tiles.count(), 8);
    const titles = await p.locator(".strail .stshot b").allTextContents();
    assert.ok(!titles.includes("Stangen Kick"), "die Karte des Tages steht schon oben: " + titles);
    // every picture says what it shows; the facts under it come from the catalog (how it is played, how long)
    for (const a of await p.locator(".strail img").evaluateAll((x) => x.map((i) => i.alt))) assert.match(a, /^Bildschirmfoto aus dem Spiel: \S/);
    assert.deepEqual(await ready(p), [], "vor dem Hinsehen kein Bild-Teil");
    await p.locator("#stlookh").scrollIntoViewIfNeeded();
    await G.poll(() => p.locator(".strail .stpic.on").count(), (n) => n >= 2, { what: "Bilder in der Leiste" });
    await p.waitForTimeout(400); await shot(p, "vorschau-2-leiste.png");   // after the pictures' fade-in
    // the first tile's picture is that card's screenshot, at its own size
    const first = await p.locator(".strail img").first().evaluate((i) => ({ w: i.naturalWidth, h: i.naturalHeight, src: i.src.slice(0, 22) }));
    assert.deepEqual(first, { w: S.W, h: S.H, src: "data:image/webp;base64" });
    const all = await p.evaluate(() => window.Parts.names().filter((n) => /^bild[a-z]$/.test(n)).length), got = await ready(p);
    assert.ok(got.length >= 1 && got.length < all, "nur die Teile der sichtbaren Bilder: " + got.join(",") + " von " + all);
    (await G.smallTargets(p, "#startbox")).forEach((v) => assert.fail("zu klein: " + v));
    assert.ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 0.5)), "kein Querscrollen der Seite");
    // a tap opens the card, as its tile on the shelf does
    const t3 = (await p.locator(".strail .stshot b").nth(2).textContent()).trim();
    await tiles.nth(2).click();
    await G.poll(() => p.evaluate(() => { const h = window.DailyDebug.home(), d = window.DailyDebug.doc(); return (h && h.idea && h.idea.id) + "|" + !document.getElementById("editor").hidden + "|" + (d && d.i); }), (v) => /\|true\|/.test(v), { what: "Karte offen" });
    const id = await p.evaluate(() => window.DailyDebug.home().idea.id), idea = SHELF.find((i) => i.id === id);
    assert.equal(idea.de.t.replace("|", " "), t3);
    assert.deepEqual(p.errs, []);
  } finally { await b.close(); }
});

test("Alle Karten: jede Karte des Regals mit ihrem Bild; axe 0; Bilder kommen beim Scrollen", async () => {
  const { b, p } = await start();
  try {
    await p.locator("#allcards").click();
    await p.locator("#allshots .stshot").first().waitFor();
    assert.equal(await p.locator("#allshots .stshot").count(), SHELF.length, "jede Karte");
    await p.locator("#allshots").scrollIntoViewIfNeeded();
    await G.poll(() => p.locator("#allshots .stpic.on").count(), (n) => n >= 4, { what: "Bilder im Raster" });
    await p.waitForTimeout(400); await shot(p, "vorschau-3-alle-karten.png");   // after the pictures' fade-in
    const before = (await ready(p)).length;
    await p.locator("#allshots .stshot").last().scrollIntoViewIfNeeded();
    await G.poll(() => p.locator("#allshots .stshot").last().locator(".stpic.on").count(), (n) => n === 1, { what: "letztes Bild" });
    assert.ok((await ready(p)).length > before, "weitere Teile erst beim Scrollen");
    if (!(await p.evaluate(() => !!window.axe))) await p.addScriptTag({ content: AXE });
    const v = await p.evaluate((o) => window.axe.run(document.querySelector("#startbox"), o).then((r) => r.violations.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | "))), RULES);
    assert.deepEqual(v, []);
    assert.deepEqual(p.errs, []);
  } finally { await b.close(); }
});

test("Save-Data: kein Bild-Teil wird geladen, die Kacheln bleiben mit Titel; Englisch mit englischem Alt-Text", async () => {
  let { b, p } = await start({ saveData: true });
  try {
    await p.locator("#stlookh").scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
    assert.deepEqual(await ready(p), []);
    assert.equal(await p.locator(".strail .stpic.on").count(), 0);
    assert.equal((await p.locator(".strail .stshot b").allTextContents()).filter(Boolean).length, 8);
    assert.deepEqual(p.errs, []);
  } finally { await b.close(); }
  ({ b, p } = await start({ lang: "en" }));
  try {
    assert.equal(await p.locator("#stlookh").textContent(), "See how it looks");
    assert.match(await p.locator(".strail img").first().getAttribute("alt"), /^Screenshot from the game: \S/);
    assert.deepEqual(p.errs, []);
  } finally { await b.close(); }
});

// The pictures must show the games as they look now: three cards are taken again the way scripts/shots.js takes them
// and compared with the stored picture (mean difference per colour channel). A card whose look changed fails here until
// `npm run shots -- <id>` has taken its picture again.
test("Screenshot-Vergleich: gespeicherte Vorschaubilder entsprechen dem Spiel, wie es jetzt aussieht", { timeout: 120000 }, async () => {
  ensureBuilt("");
  const b = await G.launch();
  try {
    const p = await (await S.context(b)).newPage(), bad = [];
    let k = 0;
    for (const id of ["zug-auktion", "zug-steine", "spiel-dart"]) {
      const now = (await S.shoot(p, id, k++)).buf, was = fs.readFileSync(path.join(S.OUT, id + ".webp"));
      const d = await p.evaluate(async ([a, c]) => {
        const px = async (s) => { const im = new Image(); im.src = "data:image/webp;base64," + s; await im.decode(); const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height; const x = cv.getContext("2d"); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height).data; };
        const u = await px(a), v = await px(c);
        if (u.length !== v.length) return 999;
        let s = 0; for (let i = 0; i < u.length; i += 4) s += Math.abs(u[i] - v[i]) + Math.abs(u[i + 1] - v[i + 1]) + Math.abs(u[i + 2] - v[i + 2]);
        return s / (u.length / 4 * 3);
      }, [now.toString("base64"), was.toString("base64")]);
      if (out) fs.writeFileSync(path.join(out, "vergleich-" + id + ".webp"), now);
      if (!(d < 6)) bad.push(id + ": mittlere Abweichung " + d.toFixed(2));
    }
    assert.deepEqual(bad, [], "Bild veraltet, neu aufnehmen: npm run shots -- <id>");
  } finally { await b.close(); }
});
