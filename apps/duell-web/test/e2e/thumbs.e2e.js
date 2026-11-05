"use strict";
// KI-Bilder auf dem Kalenderblatt: eine Karte mit Bild zeigt es (mit "KI-Bild"), ein Spiel behaelt seine Vorschau, ohne
// Server, mit Datensparmodus oder beim Tippen eines Namens bleibt das gezeichnete Blatt. Der Server wird hier gespielt:
// THUMB_DIR (echte Bilder, fuer Screenshots) oder ein kleines erzeugtes JPEG.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium, devices } = require("playwright");
const root = path.resolve(__dirname, "../..");
const MAIN = "file://" + path.join(root, "dist/index.html"), BIZ = "file://" + path.join(root, "dist/business/index.html");
const IMG = /^https:\/\/demos-34a13a96\.bunsenbrenner\.org\/duell\/img\/([a-z0-9-]+)\.jpg$/;
const shot = process.env.SHOT_DIR, dir = process.env.THUMB_DIR;
const GAMES = ["turn", "arcade", "game", "table", "duel"];
execFileSync(process.execPath, [path.join(root, "scripts/build.js"), "--flavor", "business"]);

let fixture = null;
async function setup(server) {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], ...(shot ? { viewport: { width: 412, height: 915 } } : {}), locale: "de-DE" }), errs = [], asked = [];
  if (!fixture) { const p = await ctx.newPage(); await p.setContent('<body style="margin:0;background:linear-gradient(90deg,#ffd400,#ff3b1d)">'); await p.setViewportSize({ width: 320, height: 180 }); fixture = await p.screenshot({ type: "jpeg", quality: 70 }); await p.close(); }
  await ctx.route("**/*", (r) => {
    const u = r.request().url(), m = u.match(IMG);
    if (u.startsWith("file:") || u.startsWith("data:") || u.startsWith("blob:")) return r.continue();
    if (!m) return r.abort();
    asked.push({ id: m[1], cookie: r.request().headers().cookie || "" });
    if (server === "off") return r.abort("internetdisconnected");
    const real = dir && path.join(dir, m[1] + ".jpg");
    return r.fulfill({ status: 200, headers: { "Content-Type": "image/jpeg", "Access-Control-Allow-Origin": "*" }, body: real && fs.existsSync(real) ? fs.readFileSync(real) : fixture });
  });
  const open = async (url, day, init) => {
    const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(String(e)));
    if (init) await p.addInitScript(init);
    await p.clock.install({ time: new Date(Date.UTC(2026, day[0], day[1], 10)) });
    await p.goto(url); await p.clock.runFor(1200); await p.clock.resume(); await p.waitForTimeout(700);
    return p;
  };
  return { b, open, errs, asked };
}
const state = (p) => p.evaluate(() => {
  const box = document.querySelector("#leaf .pv"), img = box.querySelector(".pvimg img"), tag = box.querySelector(".kitag"), h = window.DailyApp.home();
  const cs = getComputedStyle(tag), r = img.getBoundingClientRect();
  return { id: h.idea.id, kind: h.idea.kind, pic: box.classList.contains("pic"), shown: r.width > 0 && r.height > 0, w: img.naturalWidth, ratio: r.width / Math.max(1, r.height),
    card: document.getElementById("pvcard").getBoundingClientRect().width > 0, tag: tag.textContent, fg: cs.color, bg: cs.backgroundColor, over: document.documentElement.scrollWidth > innerWidth };
});
// WCAG relative luminance contrast of two rgb() strings
function contrast(a, b) {
  const L = (s) => { const [r, g, bl] = s.match(/\d+/g).slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test("KI-Bild: Karte mit Bild zeigt es statt der Zeichnung, mit lesbarem 'KI-Bild'; ohne Cookies", async () => {
  const { b, open, errs, asked } = await setup("on");
  const p = await open(MAIN, [11, 6]);   // 6.12.: warm-toll
  await p.locator("#leaf .pv.pic").waitFor();
  const s = await state(p);
  assert.equal(s.id, "warm-toll");
  assert.ok(s.pic && s.shown && s.w > 0, JSON.stringify(s));
  assert.ok(!s.card, "die Zeichnung macht Platz");
  assert.ok(Math.abs(s.ratio - 16 / 9) < 0.05, "16:9 " + s.ratio);
  assert.equal(s.tag, "KI-Bild");
  assert.ok(contrast(s.fg, s.bg) >= 4.5, "Kontrast " + contrast(s.fg, s.bg));
  assert.ok(!s.over, "kein Querscrollen");
  assert.deepEqual(asked.map((a) => a.id), ["warm-toll"], "nur das eine Bild");
  assert.ok(asked.every((a) => !a.cookie));
  if (shot) await p.screenshot({ path: shot + "/thumb-warm-toll.png" });
  // a name typed for the card brings the drawn card back, which shows the name
  await p.locator("#warmname").fill("Mira");
  assert.equal(await p.locator("#leaf .pv.pic").count(), 0);
  assert.ok(await p.locator("#pvcard").isVisible());
  // without the name and in English the picture is back, its tag in English
  await p.locator("#warmname").fill("");
  await p.locator("#lang").click();
  await p.locator("#leaf .pv.pic").waitFor();
  assert.equal(await p.locator(".pvimg .kitag").textContent(), "AI image");
  for (const [m, d, n] of shot ? [[10, 25, "plan-24"], [11, 18, "warm-freunde"]] : []) {
    const q = await open(MAIN, [m, d]); await q.locator("#leaf .pv.pic").waitFor(); await q.screenshot({ path: shot + "/thumb-" + n + ".png" }); await q.close();
  }
  assert.deepEqual(errs, []);
  await b.close();
});

test("KI-Bild: ein Spiel behaelt seine Vorschau und fragt kein Bild an", async () => {
  const { b, open, errs, asked } = await setup("on");
  for (const day of [[11, 7], [10, 6], [11, 30]]) {
    const p = await open(MAIN, day), s = await state(p);
    assert.ok(GAMES.includes(s.kind), s.id + " " + s.kind);
    assert.ok(!s.pic, s.id);
    await p.close();
  }
  assert.deepEqual(asked, []);
  assert.deepEqual(errs, []);
  await b.close();
});

test("KI-Bild: ohne Server und mit Datensparmodus bleibt das Blatt wie es ist", async () => {
  const off = await setup("off");
  const p = await off.open(MAIN, [11, 6]); await p.waitForTimeout(500);
  const s = await state(p);
  assert.ok(!s.pic && s.card, JSON.stringify(s));
  assert.deepEqual(off.asked.map((a) => a.id), ["warm-toll"]);
  assert.deepEqual(off.errs, []);
  await off.b.close();
  const on = await setup("on");
  const q = await on.open(MAIN, [11, 6], () => Object.defineProperty(navigator, "connection", { value: { saveData: true } }));
  const t = await state(q);
  assert.ok(!t.pic && t.card);
  assert.deepEqual(on.asked, [], "Save-Data: keine Anfrage");
  await on.b.close();
});

test("KI-Bild: Business zeigt Bilder aus dem eigenen Satz", async () => {
  const { b, open, errs, asked } = await setup("on");
  let done = false;
  for (let d = 2; d < 20 && !done; d++) {
    const p = await open(BIZ, [10, d]), id = (await state(p)).id, has = await p.evaluate((x) => window.DailyThumbs.includes(x), id);
    if (has) {
      await p.locator("#leaf .pv.pic").waitFor();
      const s = await state(p);
      assert.ok(/^biz-/.test(s.id) && s.shown && !s.card && s.tag === "KI-Bild", JSON.stringify(s));
      assert.ok(contrast(s.fg, s.bg) >= 4.5);
      if (shot) await p.screenshot({ path: shot + "/thumb-business-" + s.id + ".png" });
      done = true;
    }
    await p.close();
  }
  assert.ok(done, "ein Business-Tag mit Bild");
  assert.ok(asked.every((a) => /^biz-/.test(a.id)), "nur Bilder des Business-Satzes");
  assert.deepEqual(errs, []);
  await b.close();
});
