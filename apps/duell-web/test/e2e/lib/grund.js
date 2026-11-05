"use strict";
// E2E groundwork (Katalog v2, W0 point 5): the screens and languages every new card is checked on, and 2-3 browser
// contexts for cards that travel as links from person to person. Used by test/e2e/w0.e2e.js and by the cards to come:
//   const G = require("./lib/grund.js");
//   const b = await G.launch(); const [ana, ben] = await G.people(b, 2, { lang: ["de", "en"], view: "phone390" });
//   const p = await G.open(ana, "#i=biz-feedback-workshop");   // waits until the first sheet is there (catalog part loaded)
// The page loads its catalog as a part (src/parts.js) before the first sheet: open() waits for that, not only for "load".
const path = require("node:path");
const { chromium } = require("playwright-core");

const DIST = path.join(__dirname, "../../../dist");
// The screens from the rules (Katalog v2 A1, A4, A9): smallest phone 328x568, a common phone 390x844, a tablet or laptop
// across 1024x768, and 200 % zoom (WCAG 1.4.4). A browser at 200 % lays out half as many CSS pixels at twice the device
// pixels, which is what zoom() builds; the default is the 1024x768 screen at 200 %, i.e. 512x384 CSS pixels.
function zoom(base, factor) { return { viewport: { width: Math.round(base.width / factor), height: Math.round(base.height / factor) }, deviceScaleFactor: factor, zoom: factor }; }
const VIEWS = {
  phone328: { viewport: { width: 328, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phone390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  quer: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, hasTouch: true },
  zoom200: zoom({ width: 1024, height: 768 }, 2)
};
const LANGS = ["de", "en"];
const LOCALE = { de: "de-DE", en: "en-GB" };

const launch = () => chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
// One browser context = one person on their own device (own storage, own language). Each page collects its page errors
// in page.errs, so a test can assert none happened.
async function person(browser, o) {
  o = o || {};
  const v = VIEWS[o.view || "phone390"];
  if (!v) throw new Error("unknown view " + o.view);
  const lang = o.lang || "de", opt = Object.assign({}, v, { locale: LOCALE[lang] || lang });
  delete opt.zoom;
  const ctx = await browser.newContext(opt);
  ctx.setDefaultTimeout(o.timeout || 20000);
  ctx.lang = lang; ctx.view = o.view || "phone390";
  // The language as a person would have set it in the app (Kit reads it from storage before the system language).
  await ctx.addInitScript((l) => { try { const s = JSON.parse(localStorage.getItem("daily.v1") || "{}"); if (!s.lang) { s.lang = l; localStorage.setItem("daily.v1", JSON.stringify(s)); } } catch (e) {} }, lang);
  if (o.time) await ctx.addInitScript((t) => { const T = Date.parse(t), D = Date; window.Date = class extends D { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } }; }, o.time);
  return ctx;
}
// n people at once (2-3 for a link that goes round); lang and view may be one value or one per person.
async function people(browser, n, o) {
  o = o || {};
  const pick = (x, i) => (Array.isArray(x) ? x[i % x.length] : x);
  const out = [];
  for (let i = 0; i < n; i++) out.push(await person(browser, Object.assign({}, o, { lang: pick(o.lang, i), view: pick(o.view, i) })));
  return out;
}
// The page of a flavor ("" daily, "business"), with an optional #hash; waits for the first sheet (boot after the catalog).
async function open(ctx, hash, o) {
  o = o || {};
  const p = await ctx.newPage();
  p.errs = []; p.on("pageerror", (e) => p.errs.push(String(e)));
  await p.goto("file://" + path.join(DIST, o.flavor || "", "index.html") + (hash || ""));
  if (o.wait !== false) await p.waitForFunction(() => document.body.getAttribute("data-state") !== "boot");
  return p;
}
// Is the element fully inside the viewport (no scrolling needed)? For "the main action is always visible" (rule A4).
async function inView(p, sel) {
  return p.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5; }, sel);
}
// Every visible button smaller than the rule's 44x44 px (rule A6), as "text WxH" lines.
async function smallTargets(p, root, min) {
  return p.evaluate(([r, m]) => [...document.querySelectorAll((r || "body") + " button")].filter((b) => b.offsetParent && !b.closest("[hidden]"))
    .map((b) => [b, b.getBoundingClientRect()]).filter(([, x]) => x.width > 0 && (x.width < m - 0.5 || x.height < m - 0.5))
    .map(([b, x]) => (b.getAttribute("aria-label") || b.textContent).trim().slice(0, 30) + " " + Math.round(x.width) + "x" + Math.round(x.height)), [root, min || 44]);
}
module.exports = { DIST, VIEWS, LANGS, LOCALE, zoom, launch, person, people, open, inView, smallTargets };
