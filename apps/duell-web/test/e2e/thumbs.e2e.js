"use strict";
const { ensureBuilt } = require("../../scripts/ensure-build.js");
// KI-Bilder auf dem Kalenderblatt: eine Karte mit Bild zeigt es (mit "KI-Bild"), ein Spiel behaelt seine Vorschau, ohne
// Server, mit Datensparmodus oder beim Tippen eines Namens bleibt das gezeichnete Blatt. Der Server wird hier gespielt:
// THUMB_DIR (echte Bilder, fuer Screenshots) oder ein kleines erzeugtes JPEG.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const G = require("./lib/grund.js");
const root = path.resolve(__dirname, "../..");
// Web route (lib/grund.js): a device here opens several pages; under file:// such a page now and then starts with an empty storage of its own.
let MAIN, BIZ;
test.before(async () => { MAIN = await G.webUrl("index.html"); BIZ = await G.webUrl("business/index.html"); });
const IMG = /^https:\/\/demos-34a13a96\.bunsenbrenner\.org\/duell\/img\/([a-z0-9-]+)\.jpg$/;
const shot = process.env.SHOT_DIR, dir = process.env.THUMB_DIR;
const GAMES = ["turn", "arcade", "game", "table", "duel"];
ensureBuilt(""); ensureBuilt("business");   // dist as npm run test:e2e built it; a build only after an edit

let fixture = null;
async function setup(server) {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], ...(shot ? { viewport: { width: 412, height: 915 } } : {}), locale: "de-DE" }), errs = [], asked = [];
  if (!fixture) { const p = await ctx.newPage(); await p.setContent('<body style="margin:0;background:linear-gradient(90deg,#ffd400,#ff3b1d)">'); await p.setViewportSize({ width: 320, height: 180 }); fixture = await p.screenshot({ type: "jpeg", quality: 70 }); await p.close(); }
  await ctx.route("**/*", (r) => {
    const u = r.request().url(), m = u.match(IMG);
    if (u.startsWith("file:") || u.startsWith("data:") || u.startsWith("blob:") || G.isLocal(u)) return r.continue();
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
  // E1.5 "the picture gives way": the name field stands under the sheet, so the live card has the sheet, the picture is a thumbnail (16:9) that swaps
  assert.ok(s.card, "mit Namensfeld: die Live-Karte bleibt"); assert.ok(await p.evaluate(() => { const f = document.querySelector("#leaf .pvimg"), i = f.getBoundingClientRect(), c = document.getElementById("pvcard").getBoundingClientRect();
    const ov = Math.max(0, Math.min(i.right, c.right) - Math.max(i.left, c.left)) * Math.max(0, Math.min(i.bottom, c.bottom) - Math.max(i.top, c.top)) / (c.width * c.height);
    return f.getAttribute("role") === "button" && i.height < c.height && ov <= 0.1; }), "Bild als Vorschaubild, deckt hoechstens 10 % der Karte");
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
  assert.equal(await p.locator("#leaf .kitag").textContent(), "AI image");
  for (const [m, d, n] of shot ? [[10, 25, "plan-24"], [11, 18, "warm-freunde"]] : []) {
    const q = await open(MAIN, [m, d]); await q.locator("#leaf .pv.pic").waitFor(); await q.screenshot({ path: shot + "/thumb-" + n + ".png" }); await q.close();
  }
  assert.deepEqual(errs, []);
  await b.close();
});

test("KI-Bild: ein Spiel behaelt seine Vorschau und fragt kein Bild an", async () => {
  const { b, open, errs, asked } = await setup("on");
  // calendar days with a fixed game (on), not a day of the rotation: a new card in the pool moves the rotation
  for (const day of [[11, 7], [10, 6], [11, 15]]) {
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

// ---- the picture stays: greyed next sheet, editor, received card, export; a tap opens the card ----
const edState = (p) => p.evaluate(() => {
  const w = document.getElementById("stagewrap"), f = document.getElementById("edpic"), r = f.getBoundingClientRect(), s = document.getElementById("stage").getBoundingClientRect();
  return { open: !document.getElementById("editor").hidden, pic: w.classList.contains("pic"), shown: r.width > 0 && r.height > 0, ratio: r.width / Math.max(1, r.height),
    tag: f.querySelector(".kitag").textContent, stage: s.width > 0 && s.height > 0, above: r.bottom <= s.top + 1, over: document.documentElement.scrollWidth > innerWidth,
    thumb: f.getAttribute("role") === "button" && r.height <= 60 && s.height > r.height * 3,   // E1.5: the live card has the stage, the picture is a thumbnail
    overlap: Math.max(0, Math.min(r.right, s.right) - Math.max(r.left, s.left)) * Math.max(0, Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top)) / Math.max(1, s.width * s.height) };
});
// share picture: does the finished picture differ from the card drawn alone (= picture composed in)?
const exported = (p) => p.evaluate(() => {
  const res = window.DailyDebug.result(), c = res.canvas, a = document.createElement("canvas"); a.width = c.width; a.height = c.height;
  window.Render.draw(a, window.DailyDebug.doc(), { me: window.DailyDebug.me(), photo: null, peaks: null });
  const x = c.getContext("2d").getImageData(0, 0, c.width, 400).data, y = a.getContext("2d").getImageData(0, 0, c.width, 400).data;
  let diff = 0; for (let i = 0; i < x.length; i += 40) if (Math.abs(x[i] - y[i]) > 24) diff++;
  return diff / (x.length / 40);
});

test("KI-Bild: das graue Folgeblatt zeigt sein Bild, erst wenn es sichtbar wird; ein Tap oeffnet die Karte mit Bild im Editor", async () => {
  const { b, open, errs, asked } = await setup("on");
  // a day with a picture whose next day has one too (the plan moves when ideas are added or merged, so it is looked up,
  // over four years: since the three voice cards became one the first such day is in 2028); not a
  // feel-good card, whose main action finishes the card at once instead of opening the editor
  const q = await open(MAIN, [10, 1]);
  const day = await q.evaluate(() => { const D = window.Daily, T = window.DailyThumbs; for (let k = 0; k < 1500; k++) { const x = new Date(Date.UTC(2026, 9, 1 + k, 10)), a = D.ideaForDay(x), n = D.ideaForDay(D.dayDate(x, -1)); if (a && n && !a.warm && T.includes(a.id) && T.includes(n.id)) return [x.getUTCMonth() + 12 * (x.getUTCFullYear() - 2026), x.getUTCDate(), n.id]; } return null; });
  await q.close();
  assert.ok(day, "ein Tag mit Bild, dessen Folgetag ein Bild hat");
  const p = await open(MAIN, day.slice(0, 2)), next = { next: day[2] };
  await p.locator("#leaf .pv.pic").waitFor();
  const box = await p.locator("#leaf").boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  asked.length = 0;
  await p.mouse.move(cx, cy); await p.mouse.down(); await p.waitForTimeout(150);
  assert.deepEqual(asked, [], "nur Anfassen: noch keine Anfrage fuers Folgeblatt");
  await p.mouse.move(cx - 30, cy, { steps: 3 }); await p.mouse.move(cx - 60, cy, { steps: 3 });
  await p.locator("#pad .ghost .pv.pic").waitFor();
  const g = await p.evaluate(() => { const v = document.querySelector("#pad .ghost .pv"), i = v.querySelector(".pvimg img"), r = i.getBoundingClientRect(), gs = getComputedStyle(document.querySelector("#pad .ghost"));
    return { src: i.getAttribute("src"), w: r.width, ratio: r.width / r.height, card: v.querySelector(".pvcard").getBoundingClientRect().width, filter: gs.filter, tag: v.querySelector(".kitag").textContent }; });
  assert.ok(g.src.endsWith("/" + next.next + ".jpg") && g.w > 0 && Math.abs(g.ratio - 16 / 9) < 0.05 && g.card === 0, JSON.stringify(g));
  assert.match(g.filter, /grayscale/); assert.equal(g.tag, "KI-Bild");
  assert.deepEqual(asked.map((a) => a.id), [next.next], "genau das eine Bild des Folgeblatts");
  if (shot) await p.screenshot({ path: shot + "/pic-ghost.png" });
  await p.mouse.move(cx, cy, { steps: 3 }); await p.mouse.up(); await p.waitForTimeout(400);
  assert.ok(await p.locator("#home").isVisible(), "zurueckgelegt, kein Tap");
  // tap without moving: the card opens; the picture is a thumbnail beside the live card (E1.5), a tap lays it over in 16:9
  await p.locator("#leaf").click({ position: { x: box.width / 2, y: box.height * 0.6 } });
  await p.locator("#editor.dk #stagewrap.pic").waitFor();   // the thumbnail look comes with the part direkt
  const e = await edState(p);
  assert.ok(e.open && e.pic && e.shown && e.stage && e.thumb && !e.over, JSON.stringify(e));
  assert.ok(e.overlap <= 0.1, "das Vorschaubild deckt hoechstens 10 % der Karte: " + e.overlap);
  await p.locator("#edpic").press("Enter"); const e2 = await edState(p);
  assert.ok(Math.abs(e2.ratio - 16 / 9) < 0.05, "16:9 " + e2.ratio); assert.equal(e2.tag, "KI-Bild"); await p.locator("#edpic").press("Enter");
  if (shot) await p.screenshot({ path: shot + "/pic-editor.png" });
  // the finished picture of a card carries it too (CORS image: the canvas stays clean)
  await p.evaluate(() => { const D = window.Daily, i = D.byId("karte-lob"); window.DailyApp.openEditor(D.docFromIdea(i, window.DailyApp.me(), "de"), { idea: i }); });
  await p.locator("#stagewrap.pic").waitFor();
  await p.locator("#edmain").click(); await p.locator("#done").waitFor({ state: "visible" });
  assert.ok(await exported(p) > 0.2, "Bild im fertigen Bild");
  if (shot) { await p.waitForTimeout(300); await p.screenshot({ path: shot + "/pic-done.png" }); }
  assert.deepEqual(errs, []);
  await b.close();
});

test("Tap auf das Blatt: Tap oeffnet, Swipe blaettert ohne zu oeffnen, Tap waehrend des Abreissens zaehlt nicht", async () => {
  const { b, open, errs } = await setup("on");
  const p = await open(MAIN, [11, 6]);
  const day = () => p.evaluate(() => window.DailyApp.home().date.toISOString().slice(0, 10));
  const box = await p.locator("#leaf").boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2, d0 = await day();
  // The app ignores a tap that starts within 760 ms of the tear (src/app.js tear(), measured with Date.now): the old sheet
  // flies off for 300 ms, then the next one lands under the finger. Each mouse step of the test reaches the page with a
  // delay that grows under load, so the "tap in flight" sent right after the swipe met nothing (the sheet still away),
  // the landed sheet (what the guard is for) or, more than 760 ms later, a sheet that rightly opened. Now the page's
  // clock stands still from the swipe to the tap, and the tap goes onto the landed sheet: it starts, for the app, at
  // the instant of the tear, like a quick finger, and only the guard keeps the card closed.
  // A second tap at t+800 ms on the same stopped clock checks the other end: by then the guard is over and the card opens.
  await p.evaluate(() => { window.__t = Date.now(); window.__dt = 0; window.__realNow = Date.now; Date.now = () => window.__t + window.__dt; });
  await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx - 80, cy, { steps: 5 }); await p.mouse.move(cx - 150, cy, { steps: 5 }); await p.mouse.up();
  await p.waitForFunction((d) => window.DailyApp.home().date.toISOString().slice(0, 10) !== d && !document.getElementById("leaf").classList.contains("gone"), d0);
  await p.mouse.click(cx, cy);   // onto the landed sheet, at t: within the 760 ms
  await p.waitForTimeout(900);   // nothing may open: give a wrongly counted tap the time to show
  assert.ok(await p.locator("#home").isVisible(), "Swipe + Tap im Flug: kein Editor");
  assert.notEqual(await day(), d0, "geblaettert");
  await p.evaluate(() => { window.__dt = 800; });
  await p.mouse.click(cx, cy); await p.locator("#editor").waitFor({ state: "visible" });   // at t+800 ms: the guard is over
  await p.evaluate(() => { Date.now = window.__realNow; });
  await p.locator("#edback").click(); await p.locator("#home").waitFor({ state: "visible" });
  // the button inside the sheet area is no tap on the sheet; a plain tap opens like #go
  await p.mouse.click(cx, cy); await p.locator("#editor").waitFor({ state: "visible" });
  await p.locator("#edback").click(); await p.locator("#home").waitFor({ state: "visible" });
  // a press held long is no tap either
  await p.mouse.move(cx, cy); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up(); await p.waitForTimeout(300);
  assert.ok(await p.locator("#home").isVisible(), "langes Druecken: kein Editor");
  assert.deepEqual(errs, []);
  await b.close();
});

test("KI-Bild: empfangene Karte zeigt Karte und Bild, auch im Editor; mit Foto des Absenders keins; Spiel keins; eigenes Foto ersetzt es", async () => {
  const { b, open, errs, asked } = await setup("on");
  const p = await open(MAIN, [11, 7]);   // a game day: the home sheet asks for nothing
  assert.deepEqual(asked, []);
  await p.evaluate(() => { const D = window.Daily, d = D.docFromIdea(D.byId("karte-lob"), D.sanitizeProfile({ nick: "Ben" }), "de"); location.hash = D.docUrl(D.withTrail(d, "Ben", ["text"])).split("#")[1]; });
  await p.locator("#leaf .pv.pic.with").waitFor(); await p.waitForTimeout(600);   // the sheet's landing animation
  const r = await p.evaluate(() => { const v = document.querySelector("#leaf .pv"), i = v.querySelector(".pvimg").getBoundingClientRect(), c = v.querySelector(".pvcard").getBoundingClientRect();
    const ov = Math.max(0, Math.min(i.right, c.right) - Math.max(i.left, c.left)) * Math.max(0, Math.min(i.bottom, c.bottom) - Math.max(i.top, c.top)) / Math.max(1, c.width * c.height);
    return { img: i.width > 0, card: c.width > 0 && c.height > 0, small: i.height < c.height / 2, ov: ov <= 0.1, ratio: i.width / i.height, note: !document.getElementById("from").hidden, over: document.documentElement.scrollWidth > innerWidth }; });
  // E1.5: the received card keeps the sheet, its picture is a 16:9 thumbnail in the corner
  assert.ok(r.img && r.card && r.small && r.ov && r.note && !r.over && Math.abs(r.ratio - 16 / 9) < 0.05, JSON.stringify(r));
  assert.deepEqual(asked.map((a) => a.id), ["karte-lob"]);
  if (shot) await p.screenshot({ path: shot + "/pic-received.png" });
  await p.locator("#go").click(); await p.locator("#stagewrap.pic").waitFor();
  assert.ok((await edState(p)).shown);
  if (shot) await p.screenshot({ path: shot + "/pic-received-editor.png" });
  // the sender used an own photo: no AI picture stands in for it
  await p.evaluate(() => { const D = window.Daily, d = D.docFromIdea(D.byId("foto-haustier"), D.sanitizeProfile({ nick: "Ben" }), "de"); location.hash = D.docUrl(D.withTrail(d, "Ben", ["foto"])).split("#")[1]; });
  await p.waitForTimeout(900);
  assert.ok(await p.evaluate(() => !document.querySelector("#leaf .pv").classList.contains("pic") && window.DailyApp.home().doc.i === "foto-haustier"));
  assert.ok(!asked.some((a) => a.id === "foto-haustier"), "kein Bild fuer ein Foto");
  // a game in the editor: no picture
  await p.evaluate(() => { const D = window.Daily; window.DailyApp.openEditor(D.docFromIdea(D.IDEAS.find((x) => x.kind === "game"), window.DailyApp.me(), "de"), {}); });
  await p.waitForTimeout(300);
  assert.ok(!(await edState(p)).pic, "Spiel ohne Bild");
  // meme: the AI picture until the own photo is taken, then the photo alone (also in the finished picture)
  await p.evaluate(() => { const D = window.Daily, i = D.byId("foto-haustier"); window.DailyApp.openEditor(D.docFromIdea(i, window.DailyApp.me(), "de"), { idea: i }); });
  await p.locator("#stagewrap.pic").waitFor();
  const png = await p.evaluate(() => { const c = document.createElement("canvas"); c.width = 64; c.height = 64; const x = c.getContext("2d"); x.fillStyle = "#08f"; x.fillRect(0, 0, 64, 64); return c.toDataURL("image/png").split(",")[1]; });
  await p.locator("#file").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await p.waitForFunction(() => !document.getElementById("stagewrap").classList.contains("pic"));
  assert.ok((await edState(p)).stage);
  await p.locator("#edmain").click(); await p.locator("#done").waitFor({ state: "visible" });
  assert.ok(await p.evaluate(() => window.DailyDebug.result().canvas.height === 1350));
  assert.deepEqual(errs, []);
  await b.close();
});

// Zoom (personas P6/P7): iPad (810x1080) and laptop (1024x768) at 100/150/200 % (CSS widths 405 to 1024); rules in lib/zoom.js.
const Z = require("./lib/zoom.js");
for (const [base, z] of [[{ width: 810, height: 1080 }, 1], [{ width: 810, height: 1080 }, 1.5], [{ width: 810, height: 1080 }, 2], [{ width: 1024, height: 768 }, 1], [{ width: 1024, height: 768 }, 1.5], [{ width: 1024, height: 768 }, 2]])
  test("Zoom-Matrix " + base.width + "x" + base.height + " bei " + z * 100 + " % (de/en; empfangen, Tageskarte, Einladungen): empfangene Karte >= 120 px, keine Ueberlappung, Titel ganz, Feld im Fokus frei, axe sauber", async () => {
    const r = await Z.matrix(base, z, false);
    assert.ok(r.got === 4 && r.n >= 6, "Matrix zu klein: " + JSON.stringify(r));
    assert.deepEqual(r.bad, []);
  });
