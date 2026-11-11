"use strict";
// Preview pictures (src/start-ui.js "Vorschaubilder", scripts/shots.js): every card's picture in "Alle Karten" and the
// day's picture on its sheet; no strip on the start page (11 Nov). Real screenshots, lazily loaded part by part, with alt
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

// 11 Nov (user decision): the strip "So sieht es aus" under the tiles is gone, the free card's block is the start's lead.
// The start page shows no preview tiles and, on a day whose card is drawn (not a picture: 10 Nov, a running game), loads no
// picture part at all, not even when scrolled to its end.
test("Startseite: keine Leiste \"So sieht es aus\", kein Bild-Teil geladen, auch nicht nach dem Scrollen", async () => {
  const { b, p } = await start();
  try {
    await shot(p, "vorschau-1-oben.png");
    assert.equal(await p.locator(".stlook, .strail, #stlookh").count(), 0, "keine Leiste");
    assert.equal(await p.locator("#startbox .stshot").count(), 0, "keine Vorschaukachel auf der Startseite");
    assert.ok(!(await p.locator("#startbox").textContent()).includes("So sieht es aus"));
    await p.evaluate(() => { const h = document.getElementById("home"); h.scrollTo(0, h.scrollHeight); });
    await p.waitForTimeout(800);
    assert.deepEqual(await ready(p), [], "kein Bild-Teil auf der Startseite");
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

test("Save-Data: kein Bild-Teil wird geladen, die Kacheln in Alle Karten bleiben mit Titel; Englisch mit englischem Alt-Text", async () => {
  let { b, p } = await start({ saveData: true });
  try {
    await p.locator("#allcards").click(); await p.locator("#allshots .stshot").first().waitFor();
    await p.locator("#allshots").scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
    assert.deepEqual(await ready(p), []);
    assert.equal(await p.locator("#allshots .stpic.on").count(), 0);
    assert.equal((await p.locator("#allshots .stshot b").allTextContents()).filter(Boolean).length, SHELF.length);
    assert.deepEqual(p.errs, []);
  } finally { await b.close(); }
  ({ b, p } = await start({ lang: "en" }));
  try {
    await p.locator("#allcards").click(); await p.locator("#allshots .stshot").first().waitFor();
    assert.match(await p.locator("#allshots img").first().getAttribute("alt"), /^Screenshot from the game: \S/);
    assert.deepEqual(p.errs, []);
  } finally { await b.close(); }
});

// Where the sheet draws its card (a laptop, a tablet; a phone at 390x844 gives that room to the tiles, review #185), the
// day's card shows its picture on that canvas instead of the drawing.
test("Tageskarte: ihr Spielbild gross auf dem Blatt, nicht bei einem laufenden Spiel; Save-Data ohne Bild", async () => {
  for (const [day, id, big] of [["2026-11-11T10:00:00Z", "foto-alien", true], ["2026-11-12T10:00:00Z", "arcade-panzer", false]]) {
    const { b, p } = await start({ time: day, view: "desk1280" });
    try {
      assert.equal(await p.evaluate(() => window.DailyDebug.home().idea.id), id);
      if (big) {
        await p.locator("#pvcard[data-shot]").waitFor();
        const r = await p.evaluate(() => { const c = document.getElementById("pvcard"), x = c.getBoundingClientRect(), g = document.getElementById("go").getBoundingClientRect(); return { id: c.dataset.shot, label: c.getAttribute("aria-label"), h: x.height, go: g.bottom <= innerHeight }; });
        assert.equal(r.id, id); assert.match(r.label, /^Bildschirmfoto aus dem Spiel: /);
        assert.ok(r.h >= 150, "gross: " + JSON.stringify(r)); assert.ok(r.go, "Hauptknopf bleibt auf dem ersten Bildschirm");
        // the canvas shows the screenshot: its middle pixel is the picture's, not the drawn card's
        const same = await p.evaluate(async (sid) => {
          const c = document.getElementById("pvcard"), im = new Image(); im.src = window.DailyShots[sid]; await im.decode();
          const t = document.createElement("canvas"); t.width = im.width; t.height = im.height; t.getContext("2d").drawImage(im, 0, 0);
          // 25 points in the middle, the picture scaled up to the card (cover, so its middle is the card's middle)
          let d = 0; const k = c.width / im.width;
          for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
            const x = im.width / 2 + i * 20, y = im.height / 2 + j * 20;
            const a = c.getContext("2d").getImageData(c.width / 2 + (x - im.width / 2) * k, c.height / 2 + (y - im.height / 2) * k, 1, 1).data, b = t.getContext("2d").getImageData(x, y, 1, 1).data;
            d += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
          }
          return d / 25 < 40;
        }, id);
        assert.ok(same, "das Spielbild steht auf der Karte");
        await shot(p, "vorschau-4-tageskarte.png");
      } else { await p.waitForTimeout(800); assert.equal(await p.locator("#pvcard[data-shot]").count(), 0, "das laufende Spiel bleibt"); }
      assert.deepEqual(p.errs, []);
    } finally { await b.close(); }
  }
  const { b, p } = await start({ time: "2026-11-11T10:00:00Z", view: "desk1280", saveData: true });
  try { await p.waitForTimeout(800); assert.equal(await p.locator("#pvcard[data-shot]").count(), 0); } finally { await b.close(); }
});

// The pictures must show the games as they look now: three cards are taken again the way scripts/shots.js takes them
// and compared with the stored picture (mean difference per colour channel). A card whose look changed fails here until
// `npm run shots -- <id>` has taken its picture again.
test("Screenshot-Vergleich: gespeicherte Vorschaubilder entsprechen dem Spiel, wie es jetzt aussieht", { timeout: 120000 }, async () => {
  ensureBuilt("");
  const b = await G.launch();
  try {
    const ctx = await S.context(b), p = await ctx.newPage(), bad = [];
    let k = 0;
    for (const id of ["zug-auktion", "zug-steine", "spiel-dart"]) {
      const now = await S.shoot(ctx, id, k++), was = fs.readFileSync(path.join(S.OUT, id + ".webp"));
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
