"use strict";
// Stickers in the finished picture come from Noto Emoji (part noto, src/noto.js), never from the system's emoji font.
// Checked on the real export canvas (finish -> result.canvas), pixel by pixel against the same card without stickers:
// with the part each sticker sits where the view puts it (position, size, turn), an emoji the sheet lacks stays out,
// the AI label stays on top; without the part (missing file, or a load that never ends) the picture is made as before,
// without stickers, with no error and no hang. The normal view does not load the part.
// file:// as in the app shells; every case on a page of its own, none reloaded (lib/grund.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const CARD = { k: "card", col: ["#1d4ed8", "#ffd400"], by: [], x: "Alles Gute zum Geburtstag!", st: "druck", sk: [] };
const FROG = { e: "🐸", x: 0.3, y: 0.35, r: 0.6, z: 1.4 }, ODD = { e: "😀", x: 0.72, y: 0.6, r: 0, z: 1 };
const KI = { k: "karte", s: "s2.karte.mw3abcde.AnlRQb9jJYrLILMRBtJj7yR1qlhJF0ER", h: "h".repeat(43) };

async function open(b, locale, before) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, locale }), p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await ctx.route(/^https?:/, (r) => r.abort());
  await p.goto(page); await p.waitForFunction(() => window.DailyApp && window.DailyDebug && window.Parts);
  if (before) await p.evaluate(before);
  return { ctx, p, errs };
}
// The export of doc next to the export of the same card without stickers; per sticker: how many pixels of its square
// differ from the plain card, the colour on its ring (outside the emoji, inside the circle), and how far the picture
// is from the sticker drawn by hand (circle + Noto tile, same centre, radius and turn) on the plain card.
function measure(p, doc) {
  return p.evaluate(async (d) => {
    const shot = async (x) => { await window.DailyApp.finish(x); const c = window.DailyDebug.result().canvas; return c.getContext("2d").getImageData(0, 0, c.width, c.height); };
    const base = await shot({ ...d, sk: [] }), t0 = performance.now(), got = await shot(d), ms = performance.now() - t0, W = got.width, H = got.height;
    const N = window.NotoStickers, want = document.createElement("canvas"); want.width = W; want.height = H;
    const w = want.getContext("2d"); w.putImageData(base, 0, 0);
    if (N) for (const s of d.sk) {
      if (!N.has(s.e)) continue;
      const r = W * 0.1 * s.z; w.save(); w.translate(s.x * W, s.y * H); w.rotate(s.r);
      w.fillStyle = "#fff"; w.strokeStyle = "#111"; w.lineWidth = W * 0.006; w.beginPath(); w.arc(0, 0, r, 0, 6.3); w.fill(); w.stroke();
      N.draw(w, s.e, 0, 0, r * 1.25); w.restore();
    }
    const exp = w.getImageData(0, 0, W, H).data, px = (im, x, y) => Array.from(im.data.slice((y * W + x) * 4, (y * W + x) * 4 + 3));
    const sk = d.sk.map((s) => {
      const r = W * 0.1 * s.z, cx = Math.round(s.x * W), cy = Math.round(s.y * H), h = Math.round(r * 0.62);
      let diff = 0, off = 0, n = 0, green = 0;
      for (let y = cy - h; y <= cy + h; y++) for (let x = cx - h; x <= cx + h; x++) {
        const i = (y * W + x) * 4, g = got.data, a = base.data;
        if (Math.abs(g[i] - a[i]) + Math.abs(g[i + 1] - a[i + 1]) + Math.abs(g[i + 2] - a[i + 2]) > 30) diff++;
        if (Math.max(Math.abs(g[i] - exp[i]), Math.abs(g[i + 1] - exp[i + 1]), Math.abs(g[i + 2] - exp[i + 2])) > 8) off++;
        if (g[i + 1] > 120 && g[i + 1] > g[i] + 20 && g[i + 1] > g[i + 2] + 40) green++;
        n++;
      }
      return { diff, off, n, green, ring: px(got, Math.round(cx + Math.cos(s.r) * r * 0.93), Math.round(cy + Math.sin(s.r) * r * 0.93)) };
    });
    let same = true; for (let i = 0; i < got.data.length && same; i += 97) same = got.data[i] === base.data[i];
    return { sk, same, ms, w: W, h: H };
  }, doc);
}

test("Exportbild mit Teil noto: Sticker aus Noto Emoji an Position, Groesse und Drehung der Ansicht (de und en)", async () => {
  const b = await chromium.launch();
  try {
    for (const locale of ["de-DE", "en-US"]) {
      const { ctx, p, errs } = await open(b, locale);
      // the normal view: the sticker on the preview, drawn as before (system font), the part not even asked for
      const view = await p.evaluate((s) => {
        const cv = document.createElement("canvas"); cv.width = 540; cv.height = 675;
        window.Render.draw(cv, { k: "card", col: ["#1d4ed8", "#ffd400"], by: [], x: "Hallo", st: "druck", sk: [s] }, { me: window.DailyApp.me() });
        const r = 54 * s.z, d = cv.getContext("2d").getImageData(Math.round(s.x * 540 + Math.cos(s.r) * r * 0.93), Math.round(s.y * 675 + Math.sin(s.r) * r * 0.93), 1, 1).data;
        return { ring: Array.from(d.slice(0, 3)), part: window.Parts.ready("noto"), mod: typeof window.NotoStickers };
      }, FROG);
      assert.deepEqual(view, { ring: [255, 255, 255], part: false, mod: "undefined" }, "Ansicht unveraendert, ohne Teil");
      const m = await measure(p, { ...CARD, sk: [FROG, ODD] });
      assert.equal(await p.evaluate(() => window.Parts.ready("noto")), true, "Export holt den Teil");
      const [f, o] = m.sk;
      assert.deepEqual(f.ring, [255, 255, 255], "weisser Kreis um den Frosch");
      assert.ok(f.diff > f.n * 0.6, "Frosch-Quadrat gezeichnet: " + f.diff + "/" + f.n);
      assert.ok(f.green > f.n * 0.15, "Noto-Frosch ist gruen: " + f.green + "/" + f.n);
      assert.ok(f.off < f.n * 0.01, "wie von Hand gezeichnet (Mitte, Radius, Drehung): " + f.off + "/" + f.n);
      assert.equal(o.diff, 0, "ein Emoji ohne Noto-Kachel bleibt draussen, samt Kreis");
      assert.deepEqual([m.w, m.h], [1080, 1350]);
      assert.deepEqual(errs, []);
      await ctx.close();
    }
  } finally { await b.close(); }
});

test("Exportbild: die KI-Kennzeichnung bleibt ueber einem Sticker, der auf ihr liegt", async () => {
  const b = await chromium.launch();
  try {
    const { ctx, p, errs } = await open(b, "de-DE");
    const s = { e: "🔥", x: 0.15, y: 0.93, r: 0, z: 1.5 };
    const m = await measure(p, { ...CARD, ki: KI, sk: [s] });
    assert.ok(m.sk[0].diff > m.sk[0].n * 0.3, "Sticker gezeichnet: " + m.sk[0].diff);
    const label = await p.evaluate(() => {
      const c = window.DailyDebug.result().canvas, x = c.getContext("2d"), H = c.height, box = x.getImageData(40, H - 112, 300, 64).data;
      let white = 0, dark = 0;
      for (let i = 0; i < box.length; i += 4) { const v = box[i] + box[i + 1] + box[i + 2]; if (v > 700) white++; else if (v < 80) dark++; }
      return { corner: Array.from(x.getImageData(44, H - 108, 1, 1).data.slice(0, 3)), white, dark, n: box.length / 4 };
    });
    assert.deepEqual(label.corner, [17, 17, 17], "schwarzes Feld obenauf");
    assert.ok(label.dark > label.n * 0.4 && label.white > 400, "Feld mit weisser Schrift: " + JSON.stringify(label));
    assert.deepEqual(errs, []);
    await ctx.close();
  } finally { await b.close(); }
});

test("Exportbild ohne Teil noto (Datei fehlt): Bild wie bisher ohne Sticker, kein Fehler (de und en)", async () => {
  const b = await chromium.launch();
  try {
    for (const locale of ["de-DE", "en-US"]) {
      const { ctx, p, errs } = await open(b, locale, () => { window.DailyParts.noto.f = "parts/noto.fehlt.js"; });
      const m = await measure(p, { ...CARD, sk: [FROG] });
      assert.equal(m.sk[0].diff, 0, "kein Sticker, auch kein Kreis");
      assert.equal(m.same, true, "Bild gleich dem ohne Sticker");
      assert.equal(await p.evaluate(() => window.Parts.ready("noto") || typeof window.NotoStickers), "undefined");
      assert.equal(await p.locator("#doneimg").isVisible(), true, "Bild fertig");
      assert.deepEqual(errs, []);
      await ctx.close();
    }
  } finally { await b.close(); }
});

test("Exportbild: Teil noto laedt nie fertig -> nach 3 s Bild ohne Sticker, kein Haengen", async () => {
  const b = await chromium.launch();
  try {
    const { ctx, p, errs } = await open(b, "de-DE", () => {
      const need = window.Parts.need;
      window.Parts.need = (n) => (n === "noto" ? new Promise(() => {}) : need(n));
    });
    const m = await measure(p, { ...CARD, sk: [FROG] });
    assert.equal(m.sk[0].diff, 0); assert.equal(m.same, true);
    assert.ok(m.ms > 2900 && m.ms < 8000, "wartet hoechstens 3 s: " + Math.round(m.ms) + " ms");
    assert.deepEqual(errs, []);
    await ctx.close();
  } finally { await b.close(); }
});
