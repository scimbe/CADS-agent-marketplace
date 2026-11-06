"use strict";
// Start page layout by bounding box (user report from an Android phone, 6 Dec "Du bist toll"): the name field of the
// feel-good card lies under the sheet and below its red edge, with the same gap as #go on a card without it; the feature
// strip shows its first button whole (the fade is on the right only), the pause switch has its own place and covers no
// button, and #go stays free. Pixel 7, two common phones and 200 % zoom, in de and en.
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("./lib/grund.js");
const SHOTS = process.env.LAYOUT_SHOTS;

const VIEWS = {
  pixel7: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
  phone360: { viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phone390: G.VIEWS.phone390,
  zoom200: Object.assign({}, G.VIEWS.zoom200, { zoom: undefined })
};
// 6 Dec is the feel-good card "Du bist toll" (with the name field), 5 Nov a day card without it.
const CARDS = { warm: "2026-12-06T10:00:00Z", tag: "2026-11-05T10:00:00Z" };

async function home(b, view, lang, day) {
  const opt = Object.assign({}, VIEWS[view], { locale: G.LOCALE[lang] });
  delete opt.zoom;
  const ctx = await b.newContext(opt);
  await ctx.addInitScript((l) => { localStorage.setItem("daily.v1", JSON.stringify({ lang: l })); }, lang);
  const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(String(e)));
  await p.clock.install({ time: new Date(day) });
  await p.goto("file://" + G.DIST + "/index.html");
  await p.waitForFunction(() => document.body.getAttribute("data-state") !== "boot");
  await until(p, () => !document.getElementById("leaf").getAnimations({ subtree: true }).some((a) => a.playState === "running"));   // the sheet has landed
  return { ctx, p };
}
// p.clock owns the page's timers and frames, so wait from here in real time
async function until(p, fn) {
  for (let i = 0; i < 50; i++) { if (await p.evaluate(fn)) return; await p.waitForTimeout(100); }
  throw new Error("wartet vergeblich: " + fn);
}
// Boxes of what the start page is made of; for the sheet the lowest edge of the sheet stack (the red one hangs lowest)
// and of the sheet's own shadow (5px 6px).
const boxes = (p) => p.evaluate(() => {
  const r = (e) => { if (!e || !e.getClientRects().length) return null; const x = e.getBoundingClientRect(); return { l: x.left, t: x.top, r: x.right, b: x.bottom }; };
  const leaf = document.getElementById("leaf"), sh = parseFloat((getComputedStyle(leaf).boxShadow.match(/(-?[\d.]+)px (-?[\d.]+)px/) || [0, 0, 0])[2]);
  const sheet = Math.max(r(leaf).b + sh, ...[...document.querySelectorAll("#pad .under")].map((e) => r(e).b));
  const lane = document.querySelector("#feat .lane");
  return { sheet, pad: r(document.getElementById("pad")), warm: r(document.getElementById("warmto")), go: r(document.getElementById("go")),
    row: r(document.getElementById("homerow")), lane: r(lane), pause: r(document.getElementById("tickpause")),
    chips: lane ? [...lane.querySelectorAll("button")].map(r).filter(Boolean) : [],
    // every button of the strip, as far as it shows (clipped to the strip): what lies over the middle of that part
    hidden: lane ? [...lane.querySelectorAll("button")].filter((e) => e.getClientRects().length).map((e) => {
      const c = e.getBoundingClientRect(), L = lane.getBoundingClientRect(), l = Math.max(c.left, L.left), rr = Math.min(c.right, L.right);
      if (rr - l < 1) return null;
      const hit = document.elementFromPoint((l + rr) / 2, (c.top + c.bottom) / 2);
      return hit && (hit === e || e.contains(hit)) ? null : e.textContent.trim() + ": " + (hit ? hit.id || hit.className || hit.tagName : "-");
    }).filter(Boolean) : [], mask: lane ? getComputedStyle(lane).maskImage : "",
    hscroll: document.documentElement.scrollWidth > innerWidth };
});
// The first button whose right edge lies inside the strip: its left edge must not lie left of the strip (cut off).
const firstCut = (x) => { const c = x.chips.find((c) => c.r > x.lane.l + 1); return c ? x.lane.l - c.l : 0; };

test("Startseite: Namensfeld unter dem Blatt, gleicher Abstand wie ohne, Leiste ganz, Pause-Knopf mit eigenem Platz, #go frei", async () => {
  const b = await G.launch(); let n = 0;
  try {
    for (const view of Object.keys(VIEWS)) for (const lang of G.LANGS) {
      const got = {};
      for (const [card, day] of Object.entries(CARDS)) {
        const { ctx, p } = await home(b, view, lang, day), at = view + " " + lang + " " + card, x = await boxes(p);
        if (SHOTS) await p.screenshot({ path: SHOTS + "/" + view + "-" + lang + "-" + card + ".png" });
        got[card] = x;
        if (card === "warm") {
          assert.ok(x.warm, at + ": Namensfeld sichtbar");
          assert.ok(x.warm.t >= x.sheet, at + ": Namensfeld unter der roten Unterkante: " + x.warm.t + " < " + x.sheet);
          assert.ok(x.go.t >= x.warm.b, at + ": Hauptknopf unter dem Namensfeld");
          assert.ok(Math.abs(x.warm.l - x.go.l) < 1 && Math.abs(x.warm.r - x.go.r) < 1, at + ": Namensfeld buendig mit #go " + JSON.stringify([x.warm, x.go]));
          assert.equal(await p.locator("#warmname").isVisible(), true);
        } else {
          assert.equal(x.warm, null, at + ": kein Namensfeld");
          assert.ok(x.go.t >= x.sheet, at + ": Hauptknopf unter der roten Unterkante: " + x.go.t + " < " + x.sheet);
        }
        assert.deepEqual(await G.covered(p), [], at + ": #go und die Knoepfe darunter frei");
        assert.ok(x.row.t >= x.go.b, at + ": Look wuerfeln unter #go");
        assert.equal(x.hscroll, false, at + ": kein Querscrollen");
        if (x.lane) {   // the strip (left out on short screens)
          assert.ok(firstCut(x) <= 0.5, at + ": erster Knopf der Leiste ganz: " + firstCut(x));
          assert.match(x.mask, /^linear-gradient\(90deg, rgb\(0, 0, 0\) /, at + ": links keine Ueberblendung");
          assert.ok(x.pause && x.lane.r <= x.pause.l, at + ": Pause-Knopf rechts neben der Leiste, nicht darueber");
          assert.deepEqual(x.hidden, [], at + ": kein Knopf der Leiste verdeckt (Pause-Knopf)");
          assert.ok(Math.abs(x.pause.r - x.go.r) < 1, at + ": Pause-Knopf buendig mit #go");
        }
        assert.deepEqual(p.errs, [], at);
        await ctx.close(); n++;
      }
      // the same gap under the sheet with and without the name field
      const gw = got.warm.warm.t - got.warm.pad.b, gt = got.tag.go.t - got.tag.pad.b;
      assert.ok(Math.abs(gw - gt) < 1, view + " " + lang + ": Abstand unter dem Blatt " + gw + " / " + gt);
    }
  } finally { await b.close(); }
  assert.equal(n, 16);
});

test("Leiste: nach dem Anhalten im Lauf ruht sie mit einem ganzen Knopf am linken Rand", async () => {
  const b = await G.launch();
  try {
    for (const view of ["pixel7", "phone360", "phone390"]) for (const lang of G.LANGS) {
      const { ctx, p } = await home(b, view, lang, CARDS.warm), at = view + " " + lang;
      await p.clock.runFor(3500);
      assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector("#feat .track")).animationName), "ticker", at + ": laeuft");
      await p.waitForTimeout(2600);   // the CSS animation runs in real time: somewhere inside a button
      await p.evaluate(() => document.querySelector("#feat .lane").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
      await until(p, () => !document.getElementById("feat").classList.contains("hold"));
      await p.waitForTimeout(300);   // the glide ends with scrollend (p.clock holds the 700 ms fallback back)
      const x = await boxes(p);
      assert.ok(Math.abs(firstCut(x)) <= 1, at + ": ganzer Knopf links nach dem Anhalten: " + firstCut(x));
      assert.deepEqual(x.hidden, [], at + ": kein Knopf der Leiste verdeckt (Pause-Knopf)");
      assert.deepEqual(await G.covered(p), [], at);
      assert.deepEqual(p.errs, [], at);
      await ctx.close();
    }
  } finally { await b.close(); }
});
