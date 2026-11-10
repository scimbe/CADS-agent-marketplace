// Arcade duels end to end. Live: two pages, the network part (live.js) replaced by a direct pipe between the pages as in
// live.e2e.js, so invite, link with the game, badge, rules, points and the end run for real. Bot: shelf, tile, a whole
// game against the bot. Calendar: the day of a duel opens it.
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path");
const { chromium, devices } = require("playwright-core");
const G = require("./lib/grund.js");
const page = "file://" + path.join(__dirname, "../../dist/index.html");
const TOKEN = "A".repeat(22), CH = "beef".padEnd(64, "0");
const FAKE = (side) => `(() => {
  window.__liveOn = true;
  const conn = { channel: "${CH}", caller: ${side === "a"}, send: (o) => window.__liveOut(JSON.stringify(o)), on: (h) => { window.__liveH = h; }, onClose: (h) => { window.__liveClose = h; }, close: () => {} };
  window.__liveIn = (s) => window.__liveH && window.__liveH(JSON.parse(s));
  window.Live = {
    invite: async () => ({ token: "${TOKEN}", expires: Date.now() + 900000, ready: new Promise((ok) => { window.__liveReady = () => ok(conn); }) }),
    accept: async (t) => { if (t !== "${TOKEN}") throw new Error("gone"); window.__liveJoined(); return conn; }
  };
})();`;
const launch = () => chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
async function pair(b) {
  const mk = async (side) => { const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }); ctx.setDefaultTimeout(20000); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e))); await p.addInitScript(FAKE(side)); await p.addInitScript(() => { window.__buzz = []; navigator.vibrate = (x) => { window.__buzz.push(x); return true; }; }); return { p, errs }; };
  const A = await mk("a"), B = await mk("b");
  await A.p.exposeFunction("__liveOut", (s) => B.p.evaluate((m) => window.__liveIn(m), s).catch(() => {}));
  await B.p.exposeFunction("__liveOut", (s) => A.p.evaluate((m) => window.__liveIn(m), s).catch(() => {}));
  await B.p.exposeFunction("__liveJoined", () => A.p.evaluate(() => window.__liveReady()).catch(() => {}));
  return { A, B };
}
// Inviter opens the shelf, picks the duel, invites; the friend comes in by the link that names the game.
async function invite(A, B, g) {
  await A.p.goto(page); await G.alle(A.p); await A.p.getByRole("button", { name: /^\S+ \d+ Spiele$/ }).click();
  await A.p.locator(".arctile[data-g=" + g + "]").click();
  await A.p.getByRole("button", { name: /Live gegen Freund/ }).click();
  await A.p.getByText("Warte auf deinen Freund").waitFor();
  await B.p.goto(page + "#live=" + TOKEN + "&g=" + g);
  await B.p.getByText("Du wirst herausgefordert!").first().waitFor();
  await A.p.getByText("Dein Freund ist da!").waitFor();
  assert.ok((await A.p.evaluate(() => window.__buzz)).some((x) => JSON.stringify(x) === "[200,100,200]"), "das Handy des Einladenden vibriert, wenn der Freund annimmt");
  const ba = await A.p.locator(".livebadge").textContent(), bb = await B.p.locator(".livebadge").textContent();
  assert.equal(ba, bb); assert.equal(ba.split(" ").length, 3);
  await A.p.getByRole("button", { name: "Starten" }).click();
  await A.p.locator(".arccv").waitFor(); await B.p.locator(".arccv").waitFor();
  assert.equal(await A.p.locator(".livemini").textContent(), ba, "die drei Bilder bleiben im Spiel sichtbar");
  assert.equal(await B.p.locator(".livemini").textContent(), bb);
}

test("Ziegel-Duell live: Einladung mit Spiel im Link, gleiche Bilder, ein ganzes Spiel bis 5, beide zaehlen gleich", async () => {
  const b = await launch(), { A, B } = await pair(b);
  await invite(A, B, "ziegel");
  // Both paddles to the far left: most serves get through, the walls break, the game ends quickly and for real.
  for (const x of [A, B]) { const r = await x.p.locator(".arccv").boundingBox(); await x.p.mouse.move(r.x + 2, r.y + r.height - 30); await x.p.mouse.down(); await x.p.mouse.move(r.x + 1, r.y + r.height - 30); await x.p.mouse.up(); }
  await A.p.getByText(/Gewonnen|Knapp!/).waitFor({ timeout: 240000 }); await B.p.getByText(/Gewonnen|Knapp!/).waitFor({ timeout: 20000 });
  const sa = (await A.p.locator(".livebig").textContent()).match(/(\d):(\d)/).slice(1).map(Number), sb = (await B.p.locator(".livebig").textContent()).match(/(\d):(\d)/).slice(1).map(Number);
  assert.deepEqual(sa, [sb[1], sb[0]], "beide Seiten zaehlen gleich, nur gespiegelt"); assert.equal(Math.max(...sa), 5);
  // a rematch on the same connection
  await A.p.getByRole("button", { name: "Nochmal" }).click(); await B.p.getByRole("button", { name: "Nochmal" }).click();
  await A.p.locator(".arccv").waitFor(); await B.p.locator(".arccv").waitFor();
  assert.deepEqual(A.errs, []); assert.deepEqual(B.errs, []); await b.close();
});

test("Eis-Stock live: Rundenspiel, wer dran ist wechselt, nachdem der Wurf bei beiden angekommen ist", async () => {
  const b = await launch(), { A, B } = await pair(b);
  await invite(A, B, "stock");
  await A.p.getByText("Du bist dran.").waitFor({ timeout: 8000 }); await B.p.getByText("Gegner ist dran …").waitFor();
  const r = await A.p.locator(".arccv").boundingBox();   // pull back like a slingshot and let go
  await A.p.mouse.move(r.x + r.width / 2, r.y + r.height * 0.8); await A.p.mouse.down(); await A.p.mouse.move(r.x + r.width / 2, r.y + r.height * 0.8 + 110, { steps: 6 }); await A.p.mouse.up();
  await B.p.getByText("Du bist dran.").waitFor({ timeout: 15000 }); await A.p.getByText("Gegner ist dran …").waitFor();
  assert.deepEqual(A.errs, []); assert.deepEqual(B.errs, []); await b.close();
});

test("Gegen den Bot: Regal zeigt die fuenf Arcade-Duelle (Regal-Bereinigung 2026-11), kein Ballduell-Knopf mehr, Insel-Panzer bis zum Ende", async () => {
  const b = await launch(), ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }); ctx.setDefaultTimeout(20000);
  const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  // Fixed seed and fixed steps: the bot game is the same every run and ends after 11 s of game time (about 3 s here).
  await p.addInitScript(() => { window.__liveOn = true; window.__arcadeSeed = "e2e-28"; window.__arcadeSpeed = 4; });
  await p.goto(page); await G.alle(p); await p.getByRole("button", { name: /^\S+ \d+ Spiele$/ }).click();
  await p.locator(".arctile").nth(4).waitFor();   // the tiles come with the lazy play part, after the shelf itself
  assert.deepEqual(await p.locator(".arctile").evaluateAll((l) => l.map((e) => e.dataset.g)), ["ziegel", "panzer", "kick", "elfer", "stock"]);
  assert.equal(await p.getByRole("button", { name: /Ballduell live|Doppelkopf live/ }).count(), 0, "Ballduell und Doppelkopf sind in Stangen-Kick und Skat aufgegangen");
  await p.locator(".arctile[data-g=panzer]").click();
  await p.locator(".arcdemo").waitFor();
  await p.getByRole("button", { name: /Gegen den Bot/ }).click();
  await p.locator(".arccv").waitFor();
  await p.getByText(/Gewonnen|Knapp!/).waitFor({ timeout: 30000 });   // standing still, the bot wins 3:0
  assert.match(await p.locator(".livebig").textContent(), /Knapp! 0:3/);
  await p.getByRole("button", { name: "Nochmal" }).waitFor();
  // The way back is plain: "‹ Zurück" in the banner and "Zurück" under "Nochmal".
  assert.equal(await p.locator(".arcov .arcbar").count(), 1);
  assert.equal(await p.locator(".arcov .arcbar .arcx").textContent(), "‹ Zurück");
  assert.equal(await p.locator(".arcov .arcleave").textContent(), "Zurück");
  // The phone's back closes the game layer and stays in the app on the shelf, it does not leave the site.
  const url = p.url();
  await p.evaluate(() => history.back());
  await p.locator(".arcov").waitFor({ state: "detached" });
  assert.equal(p.url(), url); await p.locator(".arctile[data-g=panzer]").waitFor();
  // and the button below the result goes back the same way, leaving no stale entry on the history
  await p.locator(".arctile[data-g=panzer]").click(); await p.getByRole("button", { name: /Gegen den Bot/ }).click();
  await p.locator(".arcov .arcleave").click({ timeout: 30000 });
  await p.locator(".arcov").waitFor({ state: "detached" }); await p.locator(".arctile[data-g=panzer]").waitFor();
  assert.equal(await p.evaluate(() => (history.state && history.state.arc) || null), null, "kein Eintrag der Spielebene bleibt im Verlauf");
  assert.deepEqual(errs, []); await b.close();
});

test("Kalender: an einem seiner Tage ist Stangen-Kick das Blatt des Tages und oeffnet Bot oder Freund (heute, 10.11., der Volley-Tag)", async () => {
  const b = await launch(), ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }); ctx.setDefaultTimeout(20000);
  const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  // the shelf clean-up (2026-11) gave Stangen-Kick the days of Puck, Volley and Flipper, which went into it
  const on = require("../../src/ideas.json").ideas.find((i) => i.id === "arcade-kick").on;
  assert.deepEqual(on, ["11-06", "11-10", "11-14", "11-16"]);
  await p.clock.setFixedTime(new Date("2026-11-10T09:00:00Z"));
  await p.goto(page);
  await p.locator("#leaf").getByText("Kick", { exact: true }).waitFor();
  await p.locator("#go").click();
  await p.getByRole("button", { name: /Gegen den Bot/ }).waitFor();
  // The menu wears the home page's brand as a banner in the user's colour, with a labelled way back.
  const bar = p.locator(".arcov .arcbar");
  assert.equal(await bar.locator(".arcbrand").textContent(), "My Daily Idea");
  const look = await bar.evaluate((e) => { const a = getComputedStyle(e), h = getComputedStyle(document.querySelector("#home .bar h1")); return { bg: a.backgroundColor, home: getComputedStyle(document.body).backgroundColor, font: getComputedStyle(e.querySelector(".arcbrand")).fontFamily === h.fontFamily }; });
  assert.equal(look.bg, look.home, "Banner in der Farbe der Startseite"); assert.ok(look.font, "Schrift der Marke wie auf der Startseite");
  const x = bar.getByRole("button", { name: "Zurück" });
  assert.equal(await x.textContent(), "‹ Zurück"); assert.equal(await x.getAttribute("class"), "ico arcx");
  await x.click();
  assert.equal(await p.locator(".arcov").count(), 0); await p.locator("#go").waitFor();
  // the phone's back from the menu: back on the day's sheet, still in the app
  await p.locator("#go").click(); await p.getByRole("button", { name: /Gegen den Bot/ }).waitFor();
  await p.evaluate(() => history.back());
  await p.locator(".arcov").waitFor({ state: "detached" }); await p.locator("#go").waitFor();
  assert.ok(p.url().startsWith("file:"), "die Seite wurde nicht verlassen");
  assert.deepEqual(errs, []); await b.close();
});
