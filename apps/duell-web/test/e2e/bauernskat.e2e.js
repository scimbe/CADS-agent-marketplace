// Bauernskat end to end: one game against the bot on this device, and one between two browsers seated through the
// group link (one pair link; only live.js's two-player links are replaced by a small broker piping messages between the
// pages). Phone sizes: no horizontal scroll, tap targets of 44 px, screenshots when BS_SHOTS names a folder.
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path");
const { chromium, devices } = require("playwright-core");
const page = "file://" + path.join(__dirname, "../../dist/index.html");
const SHOTS = process.env.BS_SHOTS;

const FAKE = `(() => {
  window.__liveOn = true;
  // what the page would hand to the share sheet (the group chat): kept for the test
  window.__shared = [];
  Object.defineProperty(navigator, "share", { configurable: true, value: async (o) => { window.__shared.push(o.url); } });
  const conns = {}, pend = {};
  function mk(id, ch) {
    const c = { channel: ch, h: null, cl: [], dead: false,
      send: (o) => { if (!c.dead) window.__tbOut(id, JSON.stringify(o)); },
      on: (h) => { c.h = h; }, onClose: (h) => { c.cl.push(h); },
      close: () => { if (c.dead) return; c.dead = true; window.__tbClose(id); c.cl.forEach((f) => f()); } };
    return (conns[id] = c);
  }
  window.__tbIn = (id, s) => { const c = conns[id]; if (c && !c.dead && c.h) c.h(JSON.parse(s)); };
  window.__tbClosed = (id) => { const c = conns[id]; if (c && !c.dead) { c.dead = true; c.cl.forEach((f) => f()); } };
  window.__tbReady = (token, id, ch) => { if (pend[token]) pend[token](mk(id, ch)); };
  window.Live = {
    invite: async () => { const token = await window.__tbInvite(); return { token, expires: Date.now() + 900000, ready: new Promise((ok) => { pend[token] = ok; }) }; },
    accept: async (token) => { const r = await window.__tbAccept(token); if (!r) throw new Error("gone"); return mk(r.id, r.ch); }
  };
})();`;

function broker() {
  const tokens = new Map(), route = new Map(), chain = new Map(), made = []; let n = 0;
  // one queue per link end: messages arrive in the order sent, as on an ordered data channel
  const later = (id, f) => { const c = (chain.get(id) || Promise.resolve()).then(f).catch(() => {}); chain.set(id, c); };
  async function wire(p) {
    await p.exposeFunction("__tbInvite", () => { const tk = ("K" + (++n)).padEnd(22, "x"); tokens.set(tk, p); made.push({ tk, p }); return tk; });
    await p.exposeFunction("__tbAccept", (tk) => {
      const inv = tokens.get(tk); if (!inv) return null; tokens.delete(tk);
      const k = ++n, a = "c" + k + "a", b = "c" + k + "b", ch = k.toString(16).padStart(64, "c");
      route.set(a, { page: p, peer: b }); route.set(b, { page: inv, peer: a });
      later(a, () => inv.evaluate(([t, i, c]) => window.__tbReady(t, i, c), [tk, a, ch]));
      return { id: b, ch };
    });
    await p.exposeFunction("__tbOut", (id, s) => { const r = route.get(id); if (r) later(id, () => r.page.evaluate(([i, m]) => window.__tbIn(i, m), [r.peer, s])); });
    await p.exposeFunction("__tbClose", (id) => { const r = route.get(id); if (r) later(id, () => r.page.evaluate((i) => window.__tbClosed(i), r.peer)); });
  }
  return { wire, lastToken: (p) => [...made].reverse().find((x) => x.p === p).tk };
}

async function setup(b, br, nick, ctxOpt) {
  const ctx = await b.newContext(Object.assign({ ...devices["Pixel 7"], locale: "de-DE" }, ctxOpt || {})); ctx.setDefaultTimeout(30000);
  const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.addInitScript(FAKE); if (br) await br.wire(p);
  return { p, errs, nick };
}
async function openBs(x) {
  await x.p.goto(page);
  await x.p.getByRole("button", { name: /^\S+ \d+ Spiele$/ }).click();
  await x.p.getByRole("button", { name: "🃏 Bauernskat (2)" }).click();
  await x.p.getByRole("button", { name: "🤖 Gegen den Bot" }).waitFor();
}
// One move on this page if it has one: Kreuz when naming the game, else the first card it may play.
async function step(x) {
  const p = x.p;
  try {
    const kreuz = p.locator(".tbacts .btn", { hasText: /^Kreuz$/ });
    if (await kreuz.count()) { await kreuz.first().click({ timeout: 2000 }); return true; }
    const ok = p.locator(".bsplay .tbcard.ok");
    if (await p.locator(".tbturn.hot").count() && await ok.count()) { await ok.first().click({ timeout: 2000 }); return true; }
  } catch (e) { /* redrawn under the click */ }
  return false;
}
async function playHand(all) {
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    let ended = 0;
    for (const x of all) { if (await x.p.locator(".tbcheck").count()) ended++; else await step(x); }
    if (ended === all.length) return;
    await all[0].p.waitForTimeout(50);
  }
  throw new Error("hand did not end: " + (await Promise.all(all.map((x) => x.p.locator(".tbbody").innerText()))).join("\n---\n"));
}
// The phone layout: nothing wider than the screen, my cards at least 44 px, rank and suit legible.
async function fits(p) {
  const r = await p.evaluate(() => {
    const W = document.documentElement.clientWidth, over = [...document.querySelectorAll(".tbov *")].filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.right > W + 1 || b.left < -1); }).map((e) => e.className);
    const mine = [...document.querySelectorAll(".bsstacks.mine .tbcard:not(.bsback)")].map((e) => e.getBoundingClientRect()).map((b) => [Math.round(b.width), Math.round(b.height)]);
    const ov = document.querySelector(".tbov");
    return { W, sw: ov.scrollWidth, cw: ov.clientWidth, over, mine };
  });
  assert.ok(r.sw <= r.cw, "no horizontal scroll: " + r.sw + " > " + r.cw);
  assert.deepEqual(r.over, [], "inside the screen");
  assert.ok(r.mine.length >= 1, "my cards: " + r.mine.length);
  r.mine.forEach(([w, h]) => { assert.ok(w >= 44 && h >= 44, "tap target " + w + "x" + h); });
  return r;
}
async function dealt(x) { await x.p.locator(".bsstacks.mine .tbcard").first().waitFor({ timeout: 60000 }); }

test("Bauernskat gegen den Bot: drei Taps bis zum Spiel, Handy hochkant passt, ganze Partie bis zur Pruefung", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  for (const size of [{ w: 412, h: 915, name: "412x915" }, { w: 360, h: 740, name: "360x740" }]) {
    const x = await setup(b, null, "Ada", { viewport: { width: size.w, height: size.h }, screen: { width: size.w, height: size.h } });
    await openBs(x);                                                  // tap 1: games, tap 2: Bauernskat
    if (SHOTS) await x.p.screenshot({ path: SHOTS + "/bauernskat-start-" + size.name + ".png" });
    await x.p.getByRole("button", { name: "🤖 Gegen den Bot" }).click();   // tap 3: dealt
    await dealt(x);
    assert.equal(await x.p.locator(".bshand").count(), 0, "no hand");
    assert.equal(await x.p.locator(".bsstacks.mine .tbcard:not(.bsback)").count(), 8, "8 face up on my side");
    assert.ok(await x.p.locator(".bsstacks.theirs .tbcard:not(.bsback)").count() >= 7, "8 face up on the bot's side (one may already lie in the trick)");
    assert.equal(await x.p.locator(".bsstacks .bsback").count(), 16, "16 face down");
    assert.equal((await fits(x.p)).mine.length, 8);
    // everything on one screen at this size: my last row and the Auto button are visible without scrolling
    const low = await x.p.evaluate(() => Math.max(...[...document.querySelectorAll(".bsstacks.mine .bsstack, .bsfoot")].map((e) => e.getBoundingClientRect().bottom)));
    assert.ok(low <= size.h, "no scrolling: " + low + " > " + size.h);
    if (SHOTS) await x.p.screenshot({ path: SHOTS + "/bauernskat-ansage-" + size.name + ".png" });
    // a few tricks, then the picture mid-game
    for (let i = 0; i < 400 && (await x.p.locator(".bsstacks .bsback").count()) > 12; i++) { await step(x); await x.p.waitForTimeout(40); }
    await fits(x.p);
    if (SHOTS) await x.p.screenshot({ path: SHOTS + "/bauernskat-" + size.name + ".png" });
    // "Why?" at the trick explains it from the Skat rules
    await x.p.getByRole("button", { name: "❓ Warum?" }).click();
    assert.match(await x.p.locator(".tbexplain").innerText(), /gewinnt: /);
    await x.p.getByRole("button", { name: "❓ Warum?" }).click();
    if (size.w === 412) {
      await x.p.setViewportSize({ width: 915, height: 412 });
      await x.p.waitForTimeout(300);
      const sw = await x.p.evaluate(() => { const o = document.querySelector(".tbov"); return [o.scrollWidth, o.clientWidth]; });
      assert.ok(sw[0] <= sw[1], "landscape: no horizontal scroll");
      if (SHOTS) await x.p.screenshot({ path: SHOTS + "/bauernskat-quer-915x412.png" });
      await x.p.setViewportSize({ width: 412, height: 915 });
    }
    await playHand([x]);
    assert.equal(await x.p.locator(".tbcheck").count(), 1, "every card checked");
    const pts = (await x.p.locator(".tbresult b").allInnerTexts()).map(Number);
    assert.equal(pts.length, 2); assert.equal(pts.filter((n) => n !== 0).length, 1, "only the declarer scores: " + pts);
    if (SHOTS) await x.p.screenshot({ path: SHOTS + "/bauernskat-ende-" + size.name + ".png" });
    // the bot is ready for the next game at once
    await x.p.getByRole("button", { name: "Nächstes Spiel" }).click();
    await dealt(x);
    assert.deepEqual(x.errs, []);
    await x.p.context().close();
  }
  await b.close();
});

test("Bauernskat zu zweit ueber den Link: zwei Browser, ein Paar-Link, ganze Partie, beide zaehlen gleich, verdeckte Karten bleiben verdeckt", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }), br = broker();
  const [A, B] = [await setup(b, br, "Ada"), await setup(b, br, "Ben")];
  await openBs(A);
  await A.p.getByRole("button", { name: "🔗 Freund per Link" }).click();
  await A.p.locator(".tbseats").waitFor();
  await A.p.waitForFunction(() => window.__shared.length === 1);
  const shared = await A.p.evaluate(() => window.__shared[0]);
  assert.match(shared, /#tisch=bauernskat\.[A-Za-z0-9_-]{22}$/);
  await B.p.goto(page + shared.slice(shared.indexOf("#")));
  await dealt(A); await dealt(B);
  assert.equal(await A.p.locator(".tbbadge").textContent(), await B.p.locator(".tbbadge").textContent());
  // both see the same 16 face-up cards and 16 backs; no card that lies face down is anywhere on either screen
  const shown = async (x) => (await x.p.locator("[data-card]").evaluateAll((els) => els.map((e) => e.dataset.card))).sort();
  const upA = await shown(A), upB = await shown(B);
  assert.deepEqual(upA, upB); assert.equal(upA.length, 16); assert.equal(new Set(upA).size, 16);
  for (const x of [A, B]) { assert.equal(await x.p.locator(".bsstacks .bsback").count(), 16); assert.equal(await x.p.locator(".bshand").count(), 0); }
  await playHand([A, B]);
  const pa = (await A.p.locator(".tbresult b").allInnerTexts()).map(Number), pb = (await B.p.locator(".tbresult b").allInnerTexts()).map(Number);
  assert.deepEqual(pa, pb);
  for (const x of [A, B]) assert.equal(await x.p.locator(".tbcheck").count(), 1);
  if (SHOTS) await A.p.screenshot({ path: SHOTS + "/bauernskat-link-ende.png" });
  for (const x of [A, B]) assert.deepEqual(x.errs, [], x.nick);
  await b.close();
});
