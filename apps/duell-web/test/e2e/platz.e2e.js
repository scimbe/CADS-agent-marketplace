"use strict";
// Room (editor concept E1.5 "Platz"): the tool in use gets the room, the live card stays as large as it can, the AI
// picture gives way to a thumbnail. On 390x844, 360x800, 328x568 and 512x384 (200 %): in every state of every kind the
// tool of the tab and "Fertig" are on screen without scrolling, the preview is at least 40 % of the height or 220 px,
// and on the start sheet #go is never covered. Moves are short (<= 200 ms) and none at all with reduced motion.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");
const DIST = path.join(__dirname, "../../dist/index.html");
const IMG = /^https:\/\/demos-34a13a96\.bunsenbrenner\.org\/duell\/img\/([a-z0-9-]+)\.jpg$/;
const VIEWS = { "390x844": { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, "360x800": { viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  "328x568": { viewport: { width: 328, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, "512x384": { viewport: { width: 512, height: 384 }, deviceScaleFactor: 2, hasTouch: true } };
// the tool of each tab: what has to be in sight once the tab is open
const TOOL = { Idea: "#panel input", Text: "#panel textarea, #panel input:not([type=range]):not([type=color])", Sticker: '#panel [data-dk="add0"], #panel .chip.em', Style: "#panel .chip", Color: "#panel .sw",
  Photo: "#panel .chip", Sound: "#panel .step", Rules: "#panel input[type=range]", Figure: "#panel .chip", World: "#panel .chip", Agent: "#panel button, #panel input", Rival: "#panel .chip", Arena: "#panel .chip, #panel input",
  Riddle: "#panel .chip, #panel input", End: "#panel textarea, #panel input", Dice: "#panel .chip", Wish: "#panel textarea, #panel .chip" };
const KINDS = ["card", "photo", "sound", "game", "duel", "quest"];
let jpg = null;
async function ctxFor(b, v, o) {
  const ctx = await b.newContext(Object.assign({}, VIEWS[v], { locale: "de-DE" }, o || {}));
  await ctx.addInitScript(() => { try { localStorage.setItem("daily.v1", JSON.stringify({ lang: "de" })); } catch (e) {} });
  if (!jpg) { const q = await ctx.newPage(); await q.setContent('<body style="margin:0;background:linear-gradient(90deg,#ffd400,#2b4bff)">'); await q.setViewportSize({ width: 320, height: 180 }); jpg = await q.screenshot({ type: "jpeg" }); await q.close(); }
  await ctx.route("**/*", (r) => { const u = r.request().url(); if (/^(file|data|blob):/.test(u)) return r.continue(); if (IMG.test(u)) return r.fulfill({ status: 200, headers: { "Content-Type": "image/jpeg", "Access-Control-Allow-Origin": "*" }, body: jpg }); return r.abort(); });
  const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(String(e)));
  return { ctx, p };
}
async function goto(p, hash, day) {
  await p.clock.install({ time: new Date(Date.UTC(2026, day[0], day[1], 10)) });
  await p.goto("file://" + DIST + (hash || "")); await p.waitForFunction(() => document.body.getAttribute("data-state") !== "boot"); await p.waitForTimeout(900);
}
// the state of the editor now: preview height, is the main button and the tab's tool fully on screen
const look = (p, sel) => p.evaluate((sel) => {
  const H = innerHeight, inV = (e) => { if (!e || !e.getClientRects().length) return false; const q = e.getBoundingClientRect(); return q.top >= -0.5 && q.bottom <= H + 0.5 && q.left >= -0.5 && q.right <= innerWidth + 0.5; };
  const st = document.getElementById("stage"), pv = st.hidden ? document.getElementById("gamestage") : st, q = pv.getBoundingClientRect();
  const pr = document.getElementById("panel").getBoundingClientRect(), tool = sel ? [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length)[0] : null;
  const toolIn = !tool || (inV(tool) && tool.getBoundingClientRect().bottom <= pr.bottom + 0.5 && tool.getBoundingClientRect().top >= pr.top - 0.5);
  return { h: Math.round(q.height), H, platz: document.getElementById("editor").dataset.platz, main: inV(document.getElementById("edmain")), tool: toolIn, tabs: inV(document.querySelector("#tabs [aria-selected=true]")) };
}, sel);

test("Editor: in Ruhe und in jedem Werkzeug jeder Art: Werkzeug und Fertig ohne Scrollen, Vorschau >= 40 % oder 220 px (4 Bildschirme)", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  try {
    const bad = [];
    for (const v of Object.keys(VIEWS)) {
      const { ctx, p } = await ctxFor(b, v);
      await goto(p, "", [11, 9]);
      for (const k of KINDS) {
        await p.evaluate("window.DailyApp.openEditor(window.Daily.blankDoc('" + k + "', window.DailyApp.me(), 'de'), {own:true})"); await p.waitForTimeout(300);
        const check = (s, tab) => { const ok = s.main && s.tool && s.tabs && (s.h >= 0.4 * s.H - 0.5 || s.h >= 220); if (!ok) bad.push(v + " " + k + "/" + tab + " " + JSON.stringify(s)); };
        const r = await look(p, null); assert.equal(r.platz, "ruhe", "geoeffnet in Ruhe"); check(r, "Ruhe");
        for (const tab of await p.$$eval("#tabs [role=tab]", (xs) => xs.map((x) => x.dataset.k))) {
          await p.locator('#tabs [data-k="' + tab + '"]').click(); await p.waitForTimeout(260);
          const s = await look(p, TOOL[tab] || "#panel button, #panel input"); assert.notEqual(s.platz, "ruhe", "ein Reiter gibt seinem Werkzeug den Platz");
          check(s, tab);
        }
        // the open tab tapped again: back to the large card
        await p.locator("#tabs [aria-selected=true]").click(); await p.waitForTimeout(260);
        const z = await look(p, null); assert.equal(z.platz, "ruhe"); check(z, "Ruhe2");
        await p.evaluate("window.DailyApp.goHome()");
      }
      assert.deepEqual(p.errs, [], v);
      await ctx.close();
    }
    assert.deepEqual(bad, []);
  } finally { await b.close(); }
});

test("Werkzeug bekommt Platz: Text verkleinert die Karte, Ruhe vergroessert sie; erste Beruehrung im Panel verlaesst die Ruhe; Uebergang <= 200 ms, bei reduzierter Bewegung keiner", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  try {
    const { ctx, p } = await ctxFor(b, "390x844"); await goto(p, "", [11, 9]);
    await p.evaluate("window.DailyApp.openEditor(window.Daily.blankDoc('card', window.DailyApp.me(), 'de'), {own:true})"); await p.waitForTimeout(400);
    const big = (await look(p, null)).h, field = p.locator("#panel input").first(), at = await field.boundingBox();
    await field.click(); await p.waitForTimeout(260);
    assert.notEqual((await look(p, null)).platz, "ruhe", "Tipp im Panel");
    assert.equal(await p.evaluate(() => document.activeElement.tagName), "INPUT", "der Tipp traf sein Ziel"); assert.ok(at, "Feld");
    const small = (await look(p, null)).h; assert.ok(small < big, big + " -> " + small);
    const tr = await p.evaluate(() => getComputedStyle(document.getElementById("stagewrap")).transitionDuration);
    assert.ok(parseFloat(tr) > 0 && parseFloat(tr) <= 0.2, tr);
    await ctx.close();
    const r = await ctxFor(b, "390x844", { reducedMotion: "reduce" }); await goto(r.p, "", [11, 9]);
    await r.p.evaluate("window.DailyApp.openEditor(window.Daily.blankDoc('card', window.DailyApp.me(), 'de'), {own:true})");
    assert.equal(await r.p.evaluate(() => getComputedStyle(document.getElementById("stagewrap")).transitionDuration), "0s");
    await r.ctx.close();
  } finally { await b.close(); }
});

test("Bild weicht im Editor: empfangene Karte mit KI-Bild, die Live-Karte bleibt gross, das Bild ist ein Vorschaubild-Knopf und tauscht per Tipp", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  try {
    for (const v of Object.keys(VIEWS)) {
      const { ctx, p } = await ctxFor(b, v); await goto(p, "", [11, 7]);
      await p.evaluate(() => { const D = window.Daily, d = D.docFromIdea(D.byId("karte-lob"), D.sanitizeProfile({ nick: "Ben" }), "de"); location.hash = D.docUrl(D.withTrail(d, "Ben", ["text"])).split("#")[1]; }); await p.waitForTimeout(1200);
      await p.locator("#go").click(); await p.locator("#editor").waitFor(); await p.waitForSelector("#editor.dk #stagewrap.pic", { timeout: 10000 }); await p.waitForTimeout(300);   // the thumbnail look comes with the part direkt; the room moves in 180 ms
      const f = p.locator("#edpic");
      assert.equal(await f.getAttribute("role"), "button"); assert.equal(await f.getAttribute("aria-pressed"), "false");
      const s = await look(p, null), fb = await f.boundingBox();
      assert.ok(s.h >= 0.4 * s.H - 0.5 || s.h >= 220, v + " Karte " + s.h); assert.ok(fb.height <= 60, v + " Vorschaubild " + fb.height);
      await p.mouse.click(fb.x + fb.width / 2, fb.y + fb.height / 2); assert.equal(await f.getAttribute("aria-pressed"), "true");   // a real tap where the thumbnail is
      assert.ok((await f.boundingBox()).width > fb.width * 2, "gross"); assert.equal(await p.evaluate(() => getComputedStyle(document.getElementById("stage")).visibility), "hidden");
      await f.press("Enter"); assert.equal(await f.getAttribute("aria-pressed"), "false"); assert.equal(await p.evaluate(() => getComputedStyle(document.getElementById("stage")).visibility), "visible");
      assert.deepEqual(p.errs, [], v); await ctx.close();
    }
  } finally { await b.close(); }
});

test("Startblatt: mit Namensfeld oder Sprachwahl zeigt das Blatt die Live-Karte, das KI-Bild weicht ins Vorschaubild und tauscht per Tipp; #go nie verdeckt", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  try {
    const home = (p) => p.evaluate(() => {
      const g = document.getElementById("go"), q = g.getBoundingClientRect(), hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2), c = document.getElementById("pvcard"), f = document.querySelector("#leaf .pvimg");
      const pk = document.getElementById("pvpeek"), pr = pk && !pk.hidden ? pk.getBoundingClientRect() : null;
      return { go: q.bottom <= innerHeight + 0.5 && !!hit && (hit === g || g.contains(hit)), card: c.getClientRects().length ? Math.round(c.getBoundingClientRect().height) : 0, peek: !!pr && pr.height >= 44 && pr.width >= 44, img: f.getClientRects().length ? Math.round(f.getBoundingClientRect().height) : 0, role: f.getAttribute("role"), pressed: f.getAttribute("aria-pressed") };
    });
    for (const v of Object.keys(VIEWS)) {
      const { ctx, p } = await ctxFor(b, v);
      await goto(p, "#i=warm-toll", [11, 6]);   // warm-toll (by link since the shelf clean-up, 2026-11): AI picture and the name field under the sheet
      let h = await home(p);
      assert.ok(h.go, v + " #go frei"); // the live card has a useful height (60 px) or steps aside whole for "Vorschau"; never a squeezed strip
      assert.ok((h.card >= 60 && !h.peek) || (h.card === 0 && h.peek), v + " Live-Karte " + JSON.stringify(h));
      if (h.card) {
      assert.ok(h.img > 0 && h.img < h.card, v + " Bild nur Vorschaubild " + JSON.stringify(h)); assert.equal(h.role, "button");
      const box = await p.locator("#leaf .pvimg").boundingBox();
      await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await p.waitForTimeout(200);
      h = await home(p); assert.equal(h.pressed, "true", v + " getauscht"); assert.ok(await p.locator("#home").isVisible(), "der Tipp oeffnet nicht den Editor"); assert.equal(h.card, 0);
      await p.locator("#leaf .pvimg").press("Enter"); assert.equal((await home(p)).pressed, "false");
      }
      await goto(p, "#i=zug-termin", [11, 8]); h = await home(p); assert.ok(h.go, v + " Einladung #go"); assert.ok((h.card >= 60 && !h.peek) || (h.card === 0 && h.peek), v + " Einladung Karte " + JSON.stringify(h));
      await goto(p, "", [11, 7]); assert.ok((await home(p)).go, v + " Spieltag #go");
      assert.deepEqual(p.errs, [], v); await ctx.close();
    }
  } finally { await b.close(); }
});

test("Kurzes Blatt (328 px, Sprachwahl und Daumen): die Live-Karte weicht ganz, der Text bleibt; „Vorschau“ ist per Tastatur erreichbar, 44 px, zeigt die Karte gross und schliesst wieder", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  try {
    const { ctx, p } = await ctxFor(b, "328x568"); await goto(p, "#i=karte-lob", [11, 7]);
    const s = await p.evaluate(() => { const l = document.getElementById("leaf"), c = document.getElementById("pvcard"), v = document.querySelector(".votes");
      return { over: l.scrollHeight > l.clientHeight + 1, card: c.getClientRects().length ? c.getBoundingClientRect().height : 0, lang: !document.getElementById("langpick").hidden, votes: !!v && !v.hidden }; });
    assert.ok(s.lang && s.votes, "Sprachwahl und Daumen stehen da " + JSON.stringify(s));
    assert.equal(s.card, 0, "keine gestauchte Karte"); assert.ok(!s.over, "der Text bleibt auf dem Blatt");
    const peek = p.locator("#pvpeek"), r = await peek.boundingBox();
    assert.ok(r.width >= 44 && r.height >= 44, JSON.stringify(r)); assert.equal(await peek.getAttribute("aria-expanded"), "false");
    for (let i = 0; i < 30 && !(await p.evaluate(() => document.activeElement.id === "pvpeek")); i++) await p.keyboard.press("Tab");
    assert.equal(await p.evaluate(() => document.activeElement.id), "pvpeek", "per Tab erreichbar");
    await p.keyboard.press("Enter");
    assert.equal(await peek.getAttribute("aria-expanded"), "true");
    assert.ok(await p.evaluate(() => document.getElementById("pvcard").getBoundingClientRect().height >= 60), "die Vorschau zeigt die Karte gross");
    await p.keyboard.press("Enter");   // the same button closes it again, the focus stays on it
    assert.equal(await peek.getAttribute("aria-expanded"), "false"); assert.equal(await p.evaluate(() => document.activeElement.id), "pvpeek");
    await p.keyboard.press("Enter"); assert.equal(await peek.getAttribute("aria-expanded"), "true");
    // open: what lies under it (thumbs, title) is inert, Tab never lands on the thumbs; the button stays usable
    assert.equal(await p.evaluate(() => document.querySelector(".votes").inert), true, "Daumen inert");
    for (let i = 0; i < 12; i++) { await p.keyboard.press("Tab"); assert.ok(!(await p.evaluate(() => !!document.activeElement.closest(".votes, #hero"))), "Tab springt nicht auf die Daumen"); }
    await peek.focus(); await p.keyboard.press("Enter"); assert.equal(await peek.getAttribute("aria-expanded"), "false");
    assert.equal(await p.evaluate(() => document.querySelector(".votes").inert), false, "beim Schliessen wieder frei");
    await p.keyboard.press("Enter"); assert.equal(await peek.getAttribute("aria-expanded"), "true");
    await p.locator("#langpick button").first().focus(); await p.keyboard.press("Escape");   // Escape from elsewhere on the sheet
    assert.equal(await peek.getAttribute("aria-expanded"), "false", "Escape schliesst die Vorschau"); assert.equal(await p.evaluate(() => document.activeElement.id), "pvpeek", "Fokus zurueck auf Vorschau");
    assert.ok(await p.locator("#home").isVisible(), "nur die Vorschau zu, kein Editor");
    await p.locator("#go").click(); await p.locator("#editor").waitFor();   // another screen: Escape there is the editor's own (closes it)
    await p.keyboard.press("Escape"); await p.locator("#home").waitFor();
    assert.deepEqual(p.errs, []); await ctx.close();
  } finally { await b.close(); }
});

// B1: the 60 px rule measures the layout (offsetHeight), not the sheet's landing animation (transform scale 1.25); both
// directions: a card shown is >= 60 px once the sheet has landed, and a card left out would really be under 60 px.
test("60-px-Regel nach der Landeanimation: sichtbare Live-Karte >= 60 px, ausgeblendete waere < 60 px (640x400 en Einladung und weitere)", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  try {
    const bad = [];
    const VIEW = Object.assign({}, VIEWS, { "640x400": { viewport: { width: 640, height: 400 }, deviceScaleFactor: 2, hasTouch: true } });
    for (const [v, lang, hash, day] of [["640x400", "en", "#i=zug-termin", [11, 8]], ["640x400", "de", "#i=karte-lob", [11, 7]], ["640x400", "en", "", [11, 6]], ["328x568", "de", "#i=karte-lob", [11, 7]],
      ["360x800", "en", "#i=zug-termin", [11, 8]], ["390x844", "de", "", [11, 6]], ["512x384", "de", "#i=zug-termin", [11, 8]]]) {
      VIEWS[v] = VIEW[v];
      const { ctx, p } = await ctxFor(b, v, { locale: lang === "en" ? "en-GB" : "de-DE" });
      await ctx.addInitScript((l) => { try { localStorage.setItem("daily.v1", JSON.stringify({ lang: l })); } catch (e) {} }, lang);
      await goto(p, hash, day);
      await p.waitForFunction(() => !document.getElementById("leaf").getAnimations().some((a) => a.playState === "running"));   // the sheet has landed await p.waitForTimeout(200);
      const r = await p.evaluate(() => {
        const pv = document.getElementById("pv"), c = document.getElementById("pvcard"), tight = pv.classList.contains("tight");
        const shown = c.getClientRects().length ? c.getBoundingClientRect().height : 0;
        pv.classList.remove("tight"); const would = c.getClientRects().length ? c.offsetHeight : 0; if (tight) pv.classList.add("tight");
        return { tight, shown: Math.round(shown), would, live: pv.classList.contains("live") || !document.getElementById("langpick").hidden };
      });
      if (r.live && !r.tight && r.shown < 60) bad.push(v + " " + lang + " " + hash + ": Karte nur " + r.shown + " px");
      if (r.tight && r.would >= 60) bad.push(v + " " + lang + " " + hash + ": faelschlich ausgeblendet, waere " + r.would + " px");
      assert.deepEqual(p.errs, [], v); await ctx.close();
    }
    assert.deepEqual(bad, []);
  } finally { await b.close(); }
});

// Zoom (personas P6/P7): phones (412x839 at 100/150/200 %, 320x568 at 100 %, CSS widths 206 to 412); the rules in lib/zoom.js.
const Z = require("./lib/zoom.js");
for (const [base, z] of [[{ width: 412, height: 839 }, 1], [{ width: 412, height: 839 }, 1.5], [{ width: 412, height: 839 }, 2], [{ width: 320, height: 568 }, 1]])
  test("Zoom-Matrix " + base.width + "x" + base.height + " bei " + z * 100 + " % (de/en; empfangen, Tageskarte, Einladungen): empfangene Karte >= 140 px, keine Ueberlappung, Titel ganz, Feld im Fokus frei, axe sauber", async () => {
    const r = await Z.matrix(base, z, true);
    assert.ok(r.got === 4 && r.n >= 6, "Matrix zu klein: " + JSON.stringify(r));
    assert.deepEqual(r.bad, []);
  });
