"use strict";
// AI Act Art. 50: the picture of a sheet that carries an AI seal (free card, wish, AI picture) shows "Mit KI erstellt" /
// "Made with AI" in the picture itself. Checked on the real export canvas (finish -> result.canvas), pixel by pixel:
// a black box with white text bottom left, and nothing of it on a sheet without AI.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const CARD = { k: "card", col: ["#ffd400", "#ff3b1d"], by: [], x: "Alles Gute zum Geburtstag!", st: "herz", sk: [] };
const KI = { k: "karte", s: "s2.karte.mw3abcde.AnlRQb9jJYrLILMRBtJj7yR1qlhJF0ER", h: "h".repeat(43) };

async function exportOf(p, doc) {
  return p.evaluate(async (d) => {
    await window.DailyApp.finish(d);
    const c = window.DailyDebug.result().canvas, x = c.getContext("2d"), H = c.height;
    const px = (a, b) => Array.from(x.getImageData(a, b, 1, 1).data.slice(0, 3));
    // the label box (40..~360, H-112..H-48): its dark frame and how many near-white pixels its text has
    const box = x.getImageData(40, H - 112, 300, 64).data;
    let white = 0, dark = 0;
    for (let i = 0; i < box.length; i += 4) { const v = box[i] + box[i + 1] + box[i + 2]; if (v > 700) white++; else if (v < 80) dark++; }
    return { corner: px(44, H - 108), white, dark, n: box.length / 4, w: c.width, h: H };
  }, doc);
}

test("Exportbild: KI-Siegel -> sichtbare Kennzeichnung unten links (de und en); ohne KI nichts davon", async () => {
  const b = await chromium.launch();
  try {
    for (const locale of ["de-DE", "en-US"]) {
      const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, locale }), p = await ctx.newPage(), errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      await ctx.route(/^https?:/, (r) => r.abort());
      await p.goto(page); await p.waitForFunction(() => window.DailyApp && window.DailyDebug);
      const label = await p.evaluate(() => window.Kit.t("kiBadgeL"));
      assert.equal(label, locale === "de-DE" ? "Mit KI erstellt" : "Made with AI");
      for (const ki of [KI, { k: "wish", s: KI.s, h: KI.h }]) {
        const m = await exportOf(p, { ...CARD, ki });
        assert.deepEqual(m.corner, [17, 17, 17], ki.k + ": black label box");
        assert.ok(m.dark > m.n * 0.4, ki.k + ": the box is mostly black " + m.dark + "/" + m.n);
        assert.ok(m.white > 400, ki.k + ": white text in it " + m.white);
      }
      const none = await exportOf(p, CARD);
      assert.notDeepEqual(none.corner, [17, 17, 17], "no AI, no label");
      assert.ok(none.white < 50 || none.dark < none.n * 0.4, "no label box without AI");
      assert.deepEqual(errs, []);
      await ctx.close();
    }
  } finally { await b.close(); }
});
