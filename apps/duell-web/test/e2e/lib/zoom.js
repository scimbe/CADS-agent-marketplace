"use strict";
// Zoom matrix (personas P6/P7, 2026-11), used by platz.e2e.js (phones) and thumbs.e2e.js (iPad, laptop): one screen at
// 100/150/200 % page zoom (G.zoom: half the CSS pixels at 200 %), in German and English, on a received card, the card of
// the day, an invitation and an appointment invitation. What has to hold:
// - the received card is never hidden ("Wo ist denn die Karte?"), it is at least 140 px high and no "Vorschau" stands in;
// - no two controls (buttons, fields, role=button) lie over each other (boxes clipped by their scrolling ancestors);
// - the title on the sheet is never cut; an opened preview's button says how to close it;
// - every field in focus is not covered, on the sheet and in every tab of the editor behind it (P5-P8: FERTIG/WEITER
//   over the field). Focus without the browser's own scrolling (preventScroll), so the app's own code is what is tested;
// - axe finds no violation on the sheet.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const G = require("./grund.js");

const DIST = path.join(__dirname, "../../../dist/index.html");
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RULES = { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } };
const SCEN = { empfangen: [[10, 8], ""], stimme: [[10, 8], ""], tageskarte: [[11, 6], ""], einladung: [[11, 7], "#i=karte-lob"], termin: [[11, 8], "#i=zug-termin"] };

// what the screen shows now: controls that overlap, the card, the title, the preview button
const look = (p) => p.evaluate(() => {
  const s = document.querySelector(".scr:not([hidden])"), box = (e) => {
    if (!e.getClientRects().length || e.closest("[hidden],[inert]") || getComputedStyle(e).visibility === "hidden") return null;
    const r = e.getBoundingClientRect(), b = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    for (let a = e.parentElement; a; a = a.parentElement) { const c = getComputedStyle(a); if (c.overflowX !== "visible" || c.overflowY !== "visible") { const q = a.getBoundingClientRect(); b.l = Math.max(b.l, q.left); b.t = Math.max(b.t, q.top); b.r = Math.min(b.r, q.right); b.b = Math.min(b.b, q.bottom); } }
    return b.r - b.l > 1 && b.b - b.t > 1 ? b : null;
  };
  const n = (e) => e.id || (e.textContent || e.tagName).trim().slice(0, 14), over = [];
  const els = [...s.querySelectorAll("button, input, textarea, select, [role=button]")].map((e) => [e, box(e)]).filter((x) => x[1]);
  // the bubbles of the free card (src/blasen-start.js) sit on the ends of its own button on purpose: both open the same sheet
  const own = (x, y) => x.closest && x.closest("#hblasenfree") && y.id === "create";
  els.forEach(([a, A], i) => els.slice(i + 1).forEach(([b, B]) => { if (!a.contains(b) && !b.contains(a) && !own(a, b) && !own(b, a) && Math.min(A.r, B.r) - Math.max(A.l, B.l) > 1 && Math.min(A.b, B.b) - Math.max(A.t, B.t) > 1) over.push(n(a) + " ueber " + n(b)); }));
  const c = document.getElementById("pvcard"), hero = document.getElementById("hero"), H = hero.getBoundingClientRect();
  const cut = !!hero.getClientRects().length && [...hero.children].some((x) => { const r = x.getBoundingClientRect(); return r.top < H.top - 1 || r.bottom > H.bottom + 1 || r.left < H.left - 1 || r.right > H.right + 1; });
  return { over, cut, got: document.getElementById("leaf").classList.contains("got"), peek: !document.getElementById("pvpeek").hidden };
});
// how much of the received card one sees: its box clipped by the window and its scrolling boxes, once scrolled into
// sight where the sheet scrolls (the page may scroll for it; the card itself must never be hidden)
const seen = (p) => p.evaluate(async () => {
  const c = document.getElementById("pvcard"), h = () => { if (!c.getClientRects().length || getComputedStyle(c).visibility === "hidden") return 0;
    const r = c.getBoundingClientRect(); let t = Math.max(r.top, 0), b = Math.min(r.bottom, innerHeight);
    for (let a = c.parentElement; a; a = a.parentElement) if (getComputedStyle(a).overflowY !== "visible") { const q = a.getBoundingClientRect(); t = Math.max(t, q.top); b = Math.min(b, q.bottom); }
    return Math.max(0, Math.round(b - t)); };
  if (h() < 140 && c.getClientRects().length) { c.scrollIntoView({ block: "nearest" }); await new Promise((r) => setTimeout(r, 100)); }
  return h();
});
// every field matching sel in focus: fully inside its scrolling boxes and the window, nothing over it
const fields = (p, sel) => p.evaluate(async (sel) => {
  const bad = [], fs = [...document.querySelectorAll(sel)].filter((f) => f.getClientRects().length && !f.closest("[hidden],[inert]"));
  for (const f of fs) {
    f.focus({ preventScroll: true }); await new Promise((r) => setTimeout(r, 400));
    const r = f.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, Math.min(r.bottom - 4, r.top + r.height / 2));
    let ok = r.top >= -0.5 && r.bottom <= innerHeight + 0.5 && !!hit && (hit === f || f.contains(hit));
    for (let a = f.parentElement; a && ok; a = a.parentElement) { const c = getComputedStyle(a); if (c.overflowY !== "visible") { const q = a.getBoundingClientRect(); ok = r.top >= q.top - 0.5 && r.bottom <= q.bottom + 0.5; } }
    if (!ok) bad.push((f.id || f.placeholder || f.type) + " " + Math.round(r.top) + "-" + Math.round(r.bottom) + " unter " + (hit ? hit.id || hit.className || hit.tagName : "-"));
    f.blur();
  }
  return { bad, n: fs.length };
}, sel);

async function one(b, base, z, phone, lang, sn) {
  const [day, hash] = SCEN[sn], bad = [], at = base.width + "x" + base.height + "@" + z * 100 + "% " + lang + " " + sn;
  const v = Object.assign(G.zoom(base, z), phone ? { isMobile: true } : {}, { hasTouch: true, locale: G.LOCALE[lang] });
  delete v.zoom; v.deviceScaleFactor *= phone ? 2 : 1;
  const ctx = await b.newContext(v); ctx.setDefaultTimeout(30000);
  try {
    await ctx.addInitScript((l) => { try { localStorage.setItem("daily.v1", JSON.stringify({ lang: l })); } catch (e) {} }, lang);
    await ctx.route("**/*", (r) => (/^(file|data|blob):/.test(r.request().url()) ? r.continue() : r.abort()));
    const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(String(e)));
    await p.clock.install({ time: new Date(Date.UTC(2026, day[0], day[1], 10)) });
    await p.goto("file://" + DIST + hash); await p.waitForFunction(() => document.body.getAttribute("data-state") !== "boot"); await p.waitForTimeout(900);
    // received (P7): Lena's feel-good card to her grandmother with her own text, or her distorted voice (Stimme verzerren)
    const RECV = { empfangen: ["warm-denke", "Ich denk an dich, Oma! Kuss, Lena", "text", ""], stimme: ["stimme-verzerren", "Hör mal, Oma!", "stimme", "robot"] }, recv = RECV[sn];
    if (recv) {
      await p.evaluate(([l, r]) => { const D = window.Daily, d = D.docFromIdea(D.byId(r[0]), D.sanitizeProfile({ nick: "Lena" }), l, r[3] || undefined); d.x = r[1]; location.hash = D.docUrl(D.withTrail(d, "Lena", [r[2]])).split("#")[1]; }, [lang, recv]);
      await p.waitForFunction(() => document.getElementById("leaf").classList.contains("got")); await p.waitForTimeout(900);
    }
    const s = await look(p);
    if (recv && (!s.got || s.peek || (s.card = await seen(p)) < 140)) bad.push(at + ": empfangene Karte " + JSON.stringify(s));
    // the answer to a voice is one line with its microphone ("🎙 Antworten"), not a four-line block
    if (sn === "stimme") { const g = await p.evaluate(() => { const e = document.getElementById("go"), r = e.getBoundingClientRect(), lh = parseFloat(getComputedStyle(e).lineHeight) || 30; return { h: Math.round(r.height), lines: Math.round((e.scrollHeight - 8) / lh), t: e.textContent }; }); if (!/^🎙/.test(g.t) || g.h > 80) bad.push(at + ": Antwortknopf " + JSON.stringify(g)); }
    if (s.over.length) bad.push(at + ": Ueberlappung " + s.over.join(", "));
    if (s.cut) bad.push(at + ": Titel abgeschnitten");
    if (s.peek) {   // the last resort on a tiny sheet: opened, its button says how to close it
      const pk = p.locator("#pvpeek"); await pk.click();
      if (!/Schließen|Close/.test(await pk.textContent()) || (await pk.getAttribute("aria-expanded")) !== "true") bad.push(at + ": Vorschau offen heisst " + (await pk.textContent()));
      await pk.click(); if (!/Vorschau|Preview/.test(await pk.textContent())) bad.push(at + ": Vorschau zu heisst " + (await pk.textContent()));
    }
    let f = await fields(p, "#home input, #home textarea"), n = f.n; f.bad.forEach((x) => bad.push(at + " Blatt: " + x));
    await p.addScriptTag({ content: AXE });
    (await p.evaluate((o) => window.axe.run(document.getElementById("home"), o).then((r) => r.violations.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((m) => m.target.join(" ")).join(" | "))), RULES)).forEach((x) => bad.push(at + " axe: " + x));
    if (!recv) {   // the editor behind the main button
      await p.locator("#go").click(); await p.locator("#editor:not([hidden]), #done:not([hidden])").first().waitFor();
      if (await p.locator("#done").isVisible()) { await p.locator("#keep").click(); await p.locator("#editor").waitFor(); }
      await p.waitForTimeout(400);
      for (const tab of await p.$$eval("#tabs [role=tab]", (xs) => xs.map((x) => x.dataset.k))) {
        await p.locator('#tabs [data-k="' + tab + '"]').click(); await p.waitForTimeout(260);
        f = await fields(p, "#panel input:not([type=range]):not([type=color]):not([type=file]), #panel textarea"); n += f.n; f.bad.forEach((x) => bad.push(at + " Editor " + tab + ": " + x));
      }
    }
    if (errs.length) bad.push(at + ": " + errs.join(" | "));
    return { bad, got: recv ? 1 : 0, n };
  } finally { await ctx.close(); }
}
// all languages and cases of one screen at one zoom, four at a time in one browser
async function matrix(base, z, phone) {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }), jobs = [];
  for (const lang of G.LANGS) for (const sn of Object.keys(SCEN)) jobs.push([lang, sn]);
  const out = { bad: [], got: 0, n: 0 };
  try {
    const work = async () => { for (let j; (j = jobs.shift());) { const r = await one(b, base, z, phone, j[0], j[1]); out.bad.push(...r.bad); out.got += r.got; out.n += r.n; } };
    await Promise.all([work(), work(), work(), work()]);
  } finally { await b.close(); }
  return out;
}
module.exports = { matrix, SCEN };
