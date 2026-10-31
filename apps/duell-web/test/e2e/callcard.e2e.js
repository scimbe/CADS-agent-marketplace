"use strict";
// The card from both sides in two browser contexts. The test plays the shell and the channel, as in collab.e2e.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const PAGE = "file://" + path.join(__dirname, "../../dist/index.html");
const shots = process.env.COLLAB_SHOTS;
const FRAG = "A".repeat(20) + "bC1_".repeat(90), LINK = "https://bunsenbrenner.org/duell#p=" + FRAG;
const QA = [["Mein Lieblingsessen?", "Käsespätzle"], ["Wie heißt mein Kater?", "Mütze"], ["Wo war ich im Urlaub?", "Am Meer"]];
const host = `window.DuellHost = { peerReady: function () { return true; }, peerInvite: function () { window.__host("invite", ""); }, peerAccept: function (l) { window.__host("accept", l); },
  peerSend: function (f) { window.__host("send", f); }, peerLeave: function () { window.__host("leave", ""); }, share: function (u) { window.__host("share", u); }, more: function () {} };`;
const COPY = (p) => p.page.textContent("#cotext");
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: process.env.COLLAB_CHROME || undefined }); });
test.after(async () => { await browser.close(); });

async function phone(name, net) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, locale: "de-DE" });
  await ctx.addInitScript(host);
  await ctx.addInitScript("try{if(!localStorage.getItem('daily.v1'))localStorage.setItem('daily.v1',JSON.stringify({muted:true,me:{nick:" + JSON.stringify(name) + "}}))}catch(e){}");
  const page = await ctx.newPage(), p = { ctx, page, calls: [], errors: [], push: (m) => page.evaluate((j) => window.DuellPeer.onPeerMessage(j), JSON.stringify(m)) };
  page.on("pageerror", (e) => p.errors.push(String(e)));
  await page.exposeFunction("__host", (k, v) => net(p, k, v));
  return p;
}
function channel() {
  const n = { shared: "", a: null, b: null, sent: [] };
  n.net = async (p, k, v) => {
    p.calls.push(k);
    if (k === "invite") await p.push({ t: "invite", link: LINK });
    if (k === "share") n.shared = v;
    if (k === "accept") { assert.equal(v, LINK); await n.a.push({ t: "connected", code: "4821 0937" }); await n.b.push({ t: "connected", code: "4821 0937" }); }
    if (k === "send") { n.sent.push(v); const to = p === n.a ? n.b : n.a; setTimeout(() => to.push({ t: "msg", body: v }).catch(() => {}), 30); }
    if (k === "leave") { const to = p === n.a ? n.b : n.a; if (to) await to.push({ t: "peer-left" }).catch(() => {}); }
  };
  return n;
}
async function makeCard(n) {
  n.a = await phone("Ada", n.net); n.b = await phone("Ben", n.net);
  const { page } = n.a;
  await page.goto(PAGE); await page.click("#own"); await page.click("#cctile");
  const f = page.locator("#shbody input.field");
  for (let i = 0; i < 3; i++) { await f.nth(i * 2).fill(QA[i][0]); await f.nth(i * 2 + 1).fill(QA[i][1]); }
  if (shots) await page.screenshot({ path: path.join(shots, "c1-bauen.png") });
  await page.click("#ccsend"); await page.waitForFunction(() => document.getElementById("cotext").textContent.includes("genau eine Person"));
  await page.click("#coacts button.hot");
  await page.waitForTimeout(50);
  assert.ok(n.shared.startsWith(LINK + "&k="), "Direktversand mit Einladung und Karte");
  return n.shared.split("#")[1];
}
const quiz = async (p, frag) => { await p.page.goto("about:blank"); await p.page.goto(PAGE + "#" + frag); await p.page.waitForSelector("#cccheck"); };
const answer = async (p, list) => { const f = p.page.locator("#shbody input.field"); for (let i = 0; i < 3; i++) await f.nth(i).fill(list[i]); await p.page.click("#cccheck"); };
const right = ["kasespatzle", "mütze", "am meer"];
async function toAsked(n, frag) {
  await quiz(n.b, frag); await answer(n.b, right);
  await n.b.page.waitForFunction(() => document.getElementById("cotext").textContent.includes("Geschafft"));
  assert.deepEqual(n.b.calls.filter((c) => c === "accept"), [], "bestehen allein loest nichts aus");
  await n.b.page.click("#coacts button.hot");
  await n.a.page.waitForFunction(() => document.getElementById("cotext").textContent.includes("geschafft"));
}

test("Bestanden fuehrt nur zur Frage, angenommen wird nur durch Tippen, Blockieren steht immer da", async () => {
  const n = channel(), frag = await makeCard(n);
  assert.ok(!Buffer.from(frag.split("&k=")[1], "base64url").toString().match(/sespätzle|Mütze|Meer/), "keine Antwort im Link");
  await toAsked(n, frag);
  const text = await COPY(n.a); assert.match(text, /Ben/); assert.match(text, /kein Beweis/); assert.match(text, /4821 0937/);
  if (shots) { await n.a.page.screenshot({ path: path.join(shots, "c2-frage.png") }); await n.b.page.screenshot({ path: path.join(shots, "c3-wartet.png") }); }
  assert.deepEqual(await n.a.page.locator("#coacts button").allTextContents(), ["Annehmen", "Ablehnen", "Blockieren"]);
  await n.a.page.waitForTimeout(400);
  assert.ok(!n.sent.some((f) => f.includes('"ok"')), "ohne Tippen keine Zusage");
  await n.a.page.click("#coacts button.hot");
  await n.b.page.waitForFunction(() => document.getElementById("cotext").textContent.includes("Der Kanal steht"));
  assert.match(await COPY(n.a), /nur Ton zum Start/);
  assert.ok((await n.b.page.locator("#coacts button").allTextContents()).includes("Blockieren"));
  assert.deepEqual([n.a.errors, n.b.errors], [[], []]);
  await n.a.ctx.close(); await n.b.ctx.close();
});
test("Abgelehnt: die andere Seite erfaehrt es, nichts bleibt offen", async () => {
  const n = channel(), frag = await makeCard(n); await toAsked(n, frag);
  await n.a.page.locator("#coacts button").nth(1).click();
  await n.b.page.waitForFunction(() => /nicht reden|beendet/.test(document.getElementById("cotext").textContent));
  assert.ok(n.a.calls.includes("leave")); assert.ok(n.b.calls.includes("leave"));
  await n.a.ctx.close(); await n.b.ctx.close();
});
test("Blockieren: Verbindung weg, auch ohne auf die Anfrage zu antworten", async () => {
  const n = channel(), frag = await makeCard(n); await toAsked(n, frag);
  await n.a.page.locator("#coacts button").nth(2).click();
  assert.match(await COPY(n.a), /Blockiert/); assert.ok(n.a.calls.includes("leave"));
  assert.ok(!n.sent.some((f) => f.includes('"ok"')));
  await n.a.ctx.close(); await n.b.ctx.close();
});
test("Mehrfachversuche: nach drei falschen gibt es keine Anfrage, auch nicht nach Neuladen", async () => {
  const n = channel(), frag = await makeCard(n); await quiz(n.b, frag);
  await answer(n.b, ["a", "b", "c"]); assert.match(await n.b.page.textContent("#ccres"), /0 von 3 richtig. Noch 2 Versuche/);
  await answer(n.b, [right[0], "b", "c"]); assert.match(await n.b.page.textContent("#ccres"), /1 von 3/);
  await answer(n.b, ["a", "b", "c"]);
  await n.b.page.waitForFunction(() => document.getElementById("cotext").textContent.includes("Keine Versuche"));
  await quiz(n.b, frag); await answer(n.b, right);
  await n.b.page.waitForFunction(() => document.getElementById("cotext").textContent.includes("Keine Versuche"));
  assert.ok(!n.b.calls.includes("accept"));
  await n.a.ctx.close(); await n.b.ctx.close();
});
test("Abgelaufen: die Karte oeffnet kein Quiz und keine Verbindung", async () => {
  const n = channel(), frag = await makeCard(n), k = frag.split("&k=")[1];
  const o = JSON.parse(Buffer.from(k, "base64url").toString()); o.x = Date.now() - 1000;
  await n.b.page.goto(PAGE + "#p=" + FRAG + "&k=" + Buffer.from(JSON.stringify(o)).toString("base64url"));
  await n.b.page.waitForSelector("#cosheet:not([hidden])");
  assert.match(await COPY(n.b), /abgelaufen/); assert.deepEqual(n.b.calls, []);
  await n.a.ctx.close(); await n.b.ctx.close();
});
test("Karte ohne Telefonnummer, und ohne App kein Quiz", async () => {
  const n = channel(); n.a = await phone("Ada", n.net);
  await n.a.page.goto(PAGE); await n.a.page.click("#own"); await n.a.page.click("#cctile");
  const f = n.a.page.locator("#shbody input.field");
  for (let i = 0; i < 3; i++) { await f.nth(i * 2).fill(i ? QA[i][0] : "Ruf 0171 2345678 an"); await f.nth(i * 2 + 1).fill(QA[i][1]); }
  await n.a.page.click("#ccsend");
  assert.ok(!n.a.calls.includes("invite")); await n.a.ctx.close();
  const ctx = await browser.newContext({ locale: "de-DE" }), page = await ctx.newPage();
  const b64 = Buffer.from(JSON.stringify({ v: 1, id: "abcd1234", s: "abcd1234", x: Date.now() + 60000, n: "Ada", e: "🐙", col: ["#ffd400", "#ff3b1d"], q: [{ t: "Eins?", h: 1 }, { t: "Zwei?", h: 2 }, { t: "Drei?", h: 3 }] })).toString("base64url");
  await page.goto(PAGE + "#p=" + FRAG + "&k=" + b64); await page.waitForSelector("#cosheet:not([hidden])");
  assert.equal(await page.textContent("#cotext"), "Zusammen bauen geht in der App.");
  assert.equal(await page.locator("#cccheck").count(), 0);
  await ctx.close();
});
