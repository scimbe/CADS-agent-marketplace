"use strict";
// P-B: a phone at 200 % zoom (WCAG 1.4.4, 1.4.10) leaves 180 CSS pixels (360x780) or 206 (412x915). Every control on
// the start page, a received card and the editor lies whole inside the window, in German and English: rows wrap instead
// of being cut off by overflow-x:hidden. Measured where a person sees it, WITHOUT scrollIntoView (that also moves boxes
// with overflow:hidden, which no finger can do). A strip that scrolls sideways on purpose (#feat) is its own window.
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("./lib/grund.js");
const C = require("../../src/core.js");
const { ensureBuilt } = require("../../scripts/ensure-build.js");

const ORIGIN = new URL(C.DEFAULT_API).origin;
const DAY = "2026-11-08T10:00:00Z";

// Visible controls of the screen sel whose box leaves [0, innerWidth] (1 px tolerance for rounding) or whose visible
// part is cut by an ancestor that clips sideways (overflow hidden/clip) without letting one scroll there.
function outside(p, sel) {
  return p.evaluate((s) => {
    const W = innerWidth, bad = [], root = document.querySelector(s);
    const name = (e) => e.id ? "#" + e.id : e.tagName.toLowerCase() + "." + String(e.className).split(" ")[0] + "(" + (e.getAttribute("aria-label") || e.textContent).trim().slice(0, 14) + ")";
    for (const e of root.querySelectorAll("button, a[href], input, textarea, select, [role=button], [tabindex='0']")) {
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      if (!r.width || !r.height || cs.visibility === "hidden" || e.closest("[hidden],[aria-hidden=true]")) continue;
      let strip = null;
      for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
        const o = getComputedStyle(a).overflowX;
        if ((o === "auto" || o === "scroll") && a.scrollWidth > a.clientWidth + 1) { strip = a; break; }
      }
      const lo = strip ? Math.max(0, strip.getBoundingClientRect().left) : 0, hi = strip ? Math.min(W, strip.getBoundingClientRect().right) : W;
      // inside a strip that scrolls sideways: reachable by scrolling it, so only its own window counts for the strip itself
      if (strip) { const sr = strip.getBoundingClientRect(); if (sr.left < -1 || sr.right > W + 1) bad.push(name(strip) + " Leiste " + Math.round(sr.left) + ".." + Math.round(sr.right) + " / " + W); continue; }
      if (r.left < lo - 1 || r.right > hi + 1) bad.push(name(e) + " " + Math.round(r.left) + ".." + Math.round(r.right) + " / " + W);
    }
    return Array.from(new Set(bad));
  }, sel);
}
async function phone(b, view, lang) {
  const ctx = await G.person(b, { lang, view, time: DAY });
  await ctx.route(ORIGIN + "/**", (r) => r.abort());
  return ctx;
}

test("200 % auf dem Handy (180 und 206 CSS-px): Start, Empfang und Editor ohne abgeschnittene Knoepfe, de und en", async () => {
  ensureBuilt("");
  const b = await G.launch(), bad = [];
  try {
    for (const view of ["zoom360", "zoom412"]) for (const lang of G.LANGS) {
      const tag = view + " " + lang + " ";
      let ctx = await phone(b, view, lang), p = await G.open(ctx, "");
      assert.equal(await p.evaluate(() => innerWidth), view === "zoom360" ? 180 : 206, tag + "CSS-Breite");
      await p.waitForTimeout(300);
      (await outside(p, "#home")).forEach((x) => bad.push(tag + "Start: " + x));
      // a received card (the long link, as a friend sends it)
      const url = await p.evaluate(() => { const D = window.Daily; return D.docUrl(window.Warm.cardFor(D.byId("warm-toll"), "Lea", D.sanitizeProfile({ nick: "Ana" }), document.documentElement.lang)); });
      await ctx.close();
      ctx = await phone(b, view, lang); p = await G.open(ctx, url.slice(url.indexOf("#")));
      await p.locator("#recvhead").waitFor();
      await p.waitForFunction(() => !document.getElementById("leaf").getAnimations({ subtree: true }).some((x) => x.playState === "running"), null, { polling: 50 });
      (await outside(p, "#home")).forEach((x) => bad.push(tag + "Empfang: " + x));
      await ctx.close();
      // the editor of a card
      ctx = await phone(b, view, lang); p = await G.open(ctx, "");
      await p.evaluate(() => { const D = window.Daily, A = window.DailyApp, i = D.byId("warm-toll"); A.openEditor(D.docFromIdea(i, A.me(), document.documentElement.lang), { idea: i }); });
      await p.locator("#editor:not([hidden])").waitFor(); await p.waitForTimeout(300);
      (await outside(p, "#editor")).forEach((x) => bad.push(tag + "Editor: " + x));
      assert.deepEqual(p.errs, [], tag); await ctx.close();
    }
  } finally { await b.close(); }
  assert.deepEqual(bad, []);
});
