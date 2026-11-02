// Ballduell live end to end on two pages. The network part (live.js) is replaced by a direct pipe between the pages,
// so screens, rules, points and the end run for real; the real edge path is checked separately against the server.
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path");
const { chromium, devices } = require("playwright-core");
const page = "file://" + path.join(__dirname, "../../dist/index.html");
const TOKEN = "T".repeat(22), CH = "c0ffee".padEnd(64, "0");
const FAKE = (side) => `(() => {
  window.__liveOn = true;
  const conn = { channel: "${CH}", caller: ${side === "a"}, send: (o) => window.__liveOut(JSON.stringify(o)), on: (h) => { window.__liveH = h; }, onClose: (h) => { window.__liveClose = h; }, close: () => {} };
  window.__liveIn = (s) => window.__liveH && window.__liveH(JSON.parse(s));
  window.Live = {
    invite: async () => ({ token: "${TOKEN}", expires: Date.now() + 900000, ready: new Promise((ok) => { window.__liveReady = () => ok(conn); }) }),
    accept: async (t) => { if (t !== "${TOKEN}") throw new Error("gone"); window.__liveJoined(); return conn; }
  };
})();`;
test("Ballduell live: einladen, ankommen, gleiche Erkennungsbilder, ein ganzes Spiel bis 5", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const mk = async (side) => { const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }); ctx.setDefaultTimeout(20000); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e))); await p.addInitScript(FAKE(side)); return { p, errs }; };
  const A = await mk("a"), B = await mk("b");
  await A.p.exposeFunction("__liveOut", (s) => B.p.evaluate((m) => window.__liveIn(m), s).catch(() => {}));
  await B.p.exposeFunction("__liveOut", (s) => A.p.evaluate((m) => window.__liveIn(m), s).catch(() => {}));
  await B.p.exposeFunction("__liveJoined", () => A.p.evaluate(() => window.__liveReady()).catch(() => {}));
  await A.p.goto(page); await A.p.getByRole("button", { name: /^\S+ \d+ Spiele$/ }).click();
  await A.p.getByRole("button", { name: /Ballduell live/ }).click();
  await A.p.getByText("Warte auf deinen Freund").waitFor(); await A.p.getByText(/noch \d+:\d\d/).waitFor();
  await B.p.goto(page + "#live=" + TOKEN);
  await B.p.getByText("Du wirst herausgefordert!").first().waitFor();
  await A.p.getByText("Dein Freund ist da!").waitFor();
  const badgeA = await A.p.locator(".livebadge").textContent(), badgeB = await B.p.locator(".livebadge").textContent();
  assert.equal(badgeA, badgeB); assert.equal(badgeA.split(" ").length, 3);
  await A.p.getByRole("button", { name: "Starten" }).click();
  await A.p.locator(".livecv").waitFor(); await B.p.locator(".livecv").waitFor();
  // both paddles to the far left: almost every serve gets through, so the game ends quickly and for real
  for (const x of [A, B]) { const r = await x.p.locator(".livecv").boundingBox(); await x.p.mouse.move(r.x + 2, r.y + r.height - 20); await x.p.mouse.down(); await x.p.mouse.move(r.x + 1, r.y + r.height - 20); await x.p.mouse.up(); }
  if (process.env.LIVE_DEBUG) { await A.p.waitForTimeout(9000); console.log("DBG", await A.p.locator(".livebody").innerText(), "|", await B.p.locator(".livebody").innerText()); await A.p.screenshot({ path: process.env.LIVE_DEBUG + "/a.png" }); await B.p.screenshot({ path: process.env.LIVE_DEBUG + "/b.png" }); }
  await A.p.getByText(/Gewonnen|Knapp!/).waitFor({ timeout: 90000 }); await B.p.getByText(/Gewonnen|Knapp!/).waitFor({ timeout: 20000 });
  const endA = await A.p.locator(".livebig").textContent(), endB = await B.p.locator(".livebig").textContent();
  const sa = endA.match(/(\d):(\d)/).slice(1).map(Number), sb = endB.match(/(\d):(\d)/).slice(1).map(Number);
  assert.deepEqual(sa, [sb[1], sb[0]], "beide Seiten zaehlen gleich, nur gespiegelt");
  assert.ok(Math.max(...sa) === 5, endA);
  assert.ok(/Gewonnen/.test(endA) !== /Gewonnen/.test(endB), "genau einer gewinnt");
  assert.deepEqual(A.errs, []); assert.deepEqual(B.errs, []); await b.close();
});
test("Ballduell live: abgelaufene Einladung zeigt, was zu tun ist", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }); ctx.setDefaultTimeout(15000); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.addInitScript(FAKE("b")); await p.exposeFunction("__liveOut", () => {}); await p.exposeFunction("__liveJoined", () => {});
  await p.goto(page + "#live=" + "U".repeat(22));
  await p.getByText(/Einladung ist vorbei/).waitFor(); await p.getByRole("button", { name: "Neu einladen" }).waitFor();
  assert.deepEqual(errs, []); await b.close();
});
