"use strict";
// Two real editors in two browser contexts. Only the channel is faked: the test plays the app shell, so this proves
// the page and the protocol, not the phones. Everything asserted is what a person would see or the document holds.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");
const jsQR = require("jsqr");
const D = require("../../src/daily.js");

const PAGE = "file://" + path.join(__dirname, "../../dist/index.html");
const shots = process.env.COLLAB_SHOTS;
const FRAG = "A".repeat(20) + "bC1_".repeat(90);    // length of a real invite (364 characters)
const LINK = "https://bunsenbrenner.org/duell#p=" + FRAG;
const CARD = D.IDEAS.find((i) => i.kind === "card" && i.de.lines.length > 0).id;
const SOUND = D.IDEAS.find((i) => i.kind === "sound" && i.sound.mode === "beat").id;

const hostScript = (ready) => `window.DuellHost = {
  peerReady: function () { return ${ready}; },
  peerInvite: function () { window.__host("invite", ""); }, peerAccept: function (l) { window.__host("accept", l); },
  peerSend: function (f) { window.__host("send", f); }, peerLeave: function () { window.__host("leave", ""); },
  share: function (u, t) { window.__host("share", u); }, more: function () { window.__host("more", ""); }
};`;

async function phone(browser, name, wire, ready = true) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, locale: "de-DE" });
  await ctx.addInitScript(hostScript(ready));
  await ctx.addInitScript("try{localStorage.setItem('daily.v1',JSON.stringify({muted:true,me:{nick:" + JSON.stringify(name) + "}}))}catch(e){}");
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  const p = { name, ctx, page, errors, calls: [], push: (m) => page.evaluate((j) => window.DuellPeer.onPeerMessage(j), JSON.stringify(m)) };
  await page.exposeFunction("__host", (k, v) => wire(p, k, v));
  return p;
}
// The test's stand-in for the shells and the channel, with a little latency.
function channel(opt = {}) {
  const net = { a: null, b: null, cut: false, frames: 0, code: "4821 0937" };
  net.wire = async (p, k, v) => {
    p.calls.push([k, k === "send" ? "" : v]);
    if (k === "invite") { await p.push(opt.inviteError ? { t: "error", e: opt.inviteError } : { t: "invite", link: LINK }); return; }
    if (k === "accept") {
      assert.equal(v, LINK, "die Seite gibt genau den Link weiter");
      if (opt.acceptError) { await p.push({ t: "error", e: opt.acceptError }); return; }
      await Promise.all([net.a.push({ t: "connected", code: net.code }), net.b.push({ t: "connected", code: net.code })]);
      return;
    }
    if (k === "send") {
      if (net.cut) return;
      net.frames += 1;
      const to = p === net.a ? net.b : net.a;
      setTimeout(() => { if (!net.cut) to.push({ t: "msg", body: v }).catch(() => {}); }, 40);
    }
    if (k === "leave") { const to = p === net.a ? net.b : net.a; if (to) await to.push({ t: "peer-left" }).catch(() => {}); }
  };
  return net;
}
const doc = (p) => p.page.evaluate(() => { const d = window.DailyDebug.doc(); return d && JSON.parse(JSON.stringify(d)); });
const waitDoc = (p, fn, arg, ms = 1000) => p.page.waitForFunction(fn, arg, { timeout: ms, polling: 20 });
const stage = (p) => p.page.evaluate(() => document.getElementById("stage").toDataURL());
const snap = async (p, n) => { if (shots) await p.page.screenshot({ path: path.join(shots, n + ".png") }); };

async function session(browser, net, idea = CARD) {
  const a = await phone(browser, "Ada", net.wire), b = await phone(browser, "Ben", net.wire);
  net.a = a; net.b = b;
  await a.page.goto(PAGE + "#i=" + idea); await a.page.click("#go");
  await a.page.click("#cogo");
  await a.page.waitForSelector("#coqr:not([hidden])");
  await snap(a, "1-einladen");
  // The link B opens is the one read back from the QR code on A's screen.
  const px = await a.page.evaluate(() => { const c = document.getElementById("coqr"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height); return { w: c.width, h: c.height, d: Array.from(d.data) }; });
  const code = jsQR(Uint8ClampedArray.from(px.d), px.w, px.h);
  assert.ok(code, "QR-Code ist lesbar"); assert.equal(code.data, LINK);
  await b.page.goto(PAGE + "#p=" + code.data.split("#p=")[1]);
  await b.page.waitForSelector("#cosheet:not([hidden])");
  assert.match(await b.page.textContent("#cotext"), /nicht geprüft/);
  assert.equal(await b.page.evaluate(() => location.hash), "", "der geheime Teil steht nicht mehr in der Adresse");
  await snap(b, "2-annehmen");
  await b.page.click("#coacts button.hot");
  await b.page.waitForFunction(() => window.DailyDebug.doc() && !document.getElementById("editor").hidden, null, { timeout: 3000 });
  return { a, b };
}

let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: process.env.COLLAB_CHROME || undefined }); });
test.after(async () => { await browser.close(); });

test("Einladen per QR, Annehmen, Arbeit erscheint, Status zeigt die andere Person", async () => {
  const net = channel(), { a, b } = await session(browser, net);
  await b.page.waitForFunction(() => document.getElementById("costatus").textContent.includes("Ada"), null, { timeout: 5000 });
  await a.page.waitForFunction(() => document.getElementById("costatus").textContent.includes("Ben"), null, { timeout: 5000 });
  assert.match(await b.page.textContent("#costatus"), /4821 0937/);
  const fromA = (await doc(a)).x;
  assert.ok(fromA.length > 5); assert.equal((await doc(b)).x, fromA, "B sieht sofort A's Text, nie Standardwerte");
  assert.equal(await b.page.inputValue("#panel textarea"), fromA);
  assert.deepEqual(D.sanitizeDoc(await doc(b)), D.sanitizeDoc(await doc(a)));
  await snap(b, "3-verbunden");
  assert.deepEqual([a.errors, b.errors], [[], []]);
  await a.ctx.close(); await b.ctx.close();
});

test("Text auf A: in unter 1 s auf B im Dokument, im Eingabefeld und im Bild; Sticker hin und weg; Beat-Schritte", async () => {
  const net = channel(), { a, b } = await session(browser, net);
  await a.page.waitForSelector("#panel textarea"); await b.page.waitForSelector("#panel textarea");
  await a.page.waitForTimeout(3500);
  const before = await stage(b);
  const started = Date.now();
  await a.page.fill("#panel textarea", "Mein Hund kann rechnen");
  await b.page.waitForFunction(() => document.querySelector("#panel textarea").value === "Mein Hund kann rechnen", null, { timeout: 1000, polling: 20 });
  const ms = Date.now() - started; console.log("Latenz A nach B:", ms, "ms");
  assert.ok(ms < 1000, ms + " ms");
  await b.page.waitForTimeout(100);
  assert.notEqual(await stage(b), before, "das Bild auf B hat sich geaendert");
  assert.deepEqual(D.sanitizeDoc(await doc(b)), D.sanitizeDoc(await doc(a)));

  // B adds a sticker with its own hands, A sees it; A deletes it, it stays gone on both.
  await b.page.click('#tabs button[data-k="Sticker"]'); await b.page.click("#panel .chips button");
  await waitDoc(a, () => window.DailyDebug.doc().sk.length === 1);
  await a.page.click('#tabs button[data-k="Sticker"]');
  await a.page.locator("#panel .chips").nth(1).locator("button").first().click();
  await a.page.locator("#panel .chips").last().locator("button").last().click();
  await waitDoc(b, () => window.DailyDebug.doc().sk.length === 0);
  await b.page.waitForTimeout(3500);
  assert.equal((await doc(a)).sk.length, 0); assert.equal((await doc(b)).sk.length, 0, "taucht nicht wieder auf");
  await snap(a, "4-zusammen");
  assert.deepEqual([a.errors, b.errors], [[], []]);
  await a.ctx.close(); await b.ctx.close();
});

test("Beat: beide tippen verschiedene Schritte, beide behalten beide", async () => {
  const net = channel(), { a, b } = await session(browser, net, SOUND);
  await a.page.waitForSelector(".step"); await b.page.waitForSelector(".step");
  const base = (await doc(a)).p.h;
  const stepOf = (p, i) => p.page.locator('.step[aria-label="h ' + (i + 1) + '"]').click();
  await Promise.all([stepOf(a, 1), stepOf(b, 3)]);
  const want = base.split(""); want[1] = want[1] === "x" ? "-" : "x"; want[3] = want[3] === "x" ? "-" : "x";
  for (const p of [a, b]) await waitDoc(p, (w) => window.DailyDebug.doc().p.h === w, want.join(""), 2000);
  await a.ctx.close(); await b.ctx.close();
});

test("Abbruch: beide aendern getrennt, nach dem Wiederverbinden sind beide gleich", async () => {
  const net = channel(), { a, b } = await session(browser, net);
  await a.page.waitForSelector("#panel textarea"); await a.page.waitForTimeout(1500);
  net.cut = true;
  await Promise.all([a.push({ t: "reconnecting" }), b.push({ t: "reconnecting" })]);
  assert.match(await a.page.textContent("#costatus"), /Verbindung weg/);
  await a.page.fill("#panel textarea", "Offline von Ada");
  await b.page.click('#tabs button[data-k="Style"]'); await b.page.locator("#panel .chip").nth(2).click();
  await a.page.waitForTimeout(400);
  net.cut = false;
  await Promise.all([a.push({ t: "connected", code: net.code }), b.push({ t: "connected", code: net.code })]);
  await waitDoc(b, () => window.DailyDebug.doc().x === "Offline von Ada", null, 6000);
  const st = (await doc(b)).st;
  await waitDoc(a, (s) => window.DailyDebug.doc().st === s, st, 6000);
  await a.ctx.close(); await b.ctx.close();
});

test("Fremde Nachrichten: Markup im Namen und Text wird nie Markup, die Seite laeuft weiter", async () => {
  const net = channel(), { a, b } = await session(browser, net);
  await b.page.waitForTimeout(500);
  const meta = await a.page.evaluate(() => window.DailyDebug.collab().meta());
  const evil = [
    { v: 1, t: "dig", d: meta, h: 1, id: "evil0001", n: "<img src=x onerror=window.__pwned=1>", e: "<b>" },
    { v: 1, t: "ops", d: meta, o: [["f", "x", "<img src=x onerror=window.__pwned=1>", 5000, "evil0001"]] },
    { v: 1, t: "ops", d: meta, o: [["f", "__proto__", "x", 5000, "evil0001"]] }
  ];
  for (const f of evil) await b.push({ t: "msg", body: JSON.stringify(f) });
  await b.push({ t: "msg", body: "not json" }); await b.push({ t: "msg", body: "x".repeat(70000) }); await b.push({ t: "text", text: "Freitext" });
  assert.equal(await b.page.evaluate(() => window.__pwned), undefined);
  assert.equal(await b.page.evaluate(() => document.querySelectorAll("#editor img, #cobar img, #cobar b").length), 0);
  assert.ok(!(await doc(b)).x.includes("<"));
  assert.ok(!(await b.page.textContent("body")).includes("Freitext"));
  assert.deepEqual(b.errors, []);
  await a.ctx.close(); await b.ctx.close();
});

test("Verlassen: die andere Seite sieht es und behaelt ihre Arbeit", async () => {
  const net = channel(), { a, b } = await session(browser, net);
  await a.page.waitForSelector("#panel textarea"); await b.page.waitForTimeout(800);
  await b.page.click("#coleave");
  assert.ok(await b.page.locator("#cobar").isHidden());
  await a.page.waitForFunction(() => document.getElementById("costatus").textContent.includes("ist weg"), null, { timeout: 2000 });
  const x = (await doc(a)).x;
  await a.page.fill("#panel textarea", x + " weiter");
  assert.equal((await doc(a)).x, x + " weiter");
  await a.page.click("#coleave"); assert.ok(await a.page.locator("#cobar").isHidden());
  await a.ctx.close(); await b.ctx.close();
});

test("Zurueck aus dem Editor beendet die Sitzung und sagt es der Huelle", async () => {
  const net = channel(), { a, b } = await session(browser, net);
  await a.page.waitForSelector("#panel textarea");
  await b.page.click("#edback");
  assert.ok(b.calls.some((c) => c[0] === "leave"));
  await a.ctx.close(); await b.ctx.close();
});

test("Reine Web-Fassung: sagt ehrlich, dass es nur in der App geht, und sendet nichts", async () => {
  const ctx = await browser.newContext({ locale: "de-DE", viewport: { width: 390, height: 780 } }), page = await ctx.newPage(), out = [];
  page.on("request", (r) => { if (!r.url().startsWith("file:") && !r.url().startsWith("data:")) out.push(r.url()); });
  await page.goto(PAGE + "#i=" + CARD); await page.click("#go"); await page.click("#cogo");
  assert.equal(await page.textContent("#cotext"), "Zusammen bauen geht in der App.");
  assert.ok(await page.locator("#coqr").isHidden());
  const p = PAGE + "#p=" + FRAG;
  await page.goto("about:blank"); await page.goto(p); await page.waitForSelector("#cosheet:not([hidden])");
  assert.equal(await page.textContent("#cotext"), "Zusammen bauen geht in der App.");
  assert.equal(await page.evaluate(() => location.hash), "");
  if (shots) await page.screenshot({ path: path.join(shots, "5-web.png") });
  assert.deepEqual(out, []);
  await ctx.close();
});

test("App ohne Produktionswerte: noch nicht freigeschaltet, keine Einladung", async () => {
  const net = channel(), p = await phone(browser, "Ada", net.wire, false);
  await p.page.goto(PAGE + "#i=" + CARD); await p.page.click("#go"); await p.page.click("#cogo");
  assert.match(await p.page.textContent("#cotext"), /noch nicht freigeschaltet/);
  assert.deepEqual(p.calls, []);
  await p.ctx.close();
});

test("Fehlerfaelle: ohne Konto, Link benutzt, Link abgelaufen", async () => {
  const net = channel({ inviteError: "login" }), p = await phone(browser, "Ada", net.wire); net.a = p;
  await p.page.goto(PAGE + "#i=" + CARD); await p.page.click("#go"); await p.page.click("#cogo");
  await p.page.waitForFunction(() => document.getElementById("cotext").textContent.includes("Konto"));
  await p.page.click("#coacts button.hot");
  assert.ok(p.calls.some((c) => c[0] === "more")); await p.ctx.close();
  for (const [e, text] of [["used", /schon benutzt/], ["expired", /abgelaufen/]]) {
    const n = channel({ acceptError: e }), q = await phone(browser, "Ben", n.wire); n.b = q;
    await q.page.goto(PAGE + "#p=" + FRAG); await q.page.click("#coacts button.hot");
    await q.page.waitForFunction(() => document.getElementById("cotext").textContent.length > 12 && !document.getElementById("cotext").textContent.includes("Verbinde"));
    assert.match(await q.page.textContent("#cotext"), text);
    await q.ctx.close();
  }
});
