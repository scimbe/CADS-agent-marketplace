// Parts (src/parts.js): the core page loads arcade/live, card table, QR code and licence texts on first use.
// file:// is how the apps and the other tests open the page (nothing preloaded, the part comes when it is needed);
// http is the web route /duell of the gallery (every part preloaded once idle, with SRI, then usable offline).
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs"), http = require("node:http");
const { chromium, devices } = require("playwright-core");
const dist = path.join(__dirname, "../../dist");
const launch = () => chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const loaded = (p) => p.evaluate(() => [...document.querySelectorAll("script[src]")].map((s) => ({ src: s.getAttribute("src").replace(/^.*\/parts\//, ""), sri: s.integrity })));

// Like lib/duell.mjs in the gallery: /duell and /duell/ give the page, /duell/parts/<name>.<hash>.js the parts.
function serve(tamper) {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x"), m = u.pathname.match(/^\/duell\/parts\/([a-z]+\.[0-9a-f]{12}\.js)$/);
    if (u.pathname === "/duell" || u.pathname === "/duell/") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return void res.end(fs.readFileSync(path.join(dist, "index.html"))); }
    if (m && fs.existsSync(path.join(dist, "parts", m[1]))) {
      let body = fs.readFileSync(path.join(dist, "parts", m[1]));
      if (tamper && m[1].startsWith(tamper + ".")) body = Buffer.concat([body, Buffer.from("\nwindow.__tampered=1;\n")]);
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" }); return void res.end(body);
    }
    res.writeHead(404).end();
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv)));
}

test("file:// (Apps, Tests): Start ohne Teile; Spiele-Regal holt Arcade+Live, Lizenzen ihren Teil", async () => {
  const b = await launch(), ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }); ctx.setDefaultTimeout(20000);
  const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.clock.setFixedTime(new Date("2026-03-03T09:00:00Z"));   // a day whose sheet is no arcade duel
  await p.goto("file://" + path.join(dist, "index.html"));
  await p.locator("#go").waitFor();
  assert.deepEqual(await loaded(p), [], "der Start laedt keinen Teil");
  assert.equal(await p.evaluate(() => typeof window.Arcade + typeof window.StatusCard + typeof window.DailyLicenses), "undefinedundefinedundefined");
  await p.getByRole("button", { name: /^\S+ \d+ Spiele$/ }).click();
  await p.locator(".arctile").first().waitFor();
  assert.equal(await p.locator(".arctile").count(), 10);
  assert.deepEqual((await loaded(p)).map((s) => s.src.split(".")[0]), ["play"]);
  assert.equal((await loaded(p))[0].sri, "", "file:// ohne SRI (kein CORS-Ursprung)");
  await p.locator("#shback").click();
  await p.locator("#me").click();
  await p.getByRole("button", { name: "Lizenzen" }).click();
  await p.getByText(/SIL OPEN FONT LICENSE Version 1\.1/).waitFor();
  assert.deepEqual((await loaded(p)).map((s) => s.src.split(".")[0]), ["play", "licenses"]);
  assert.deepEqual(errs, []); await b.close();
});

test("file://: der Knopf Status-Bild holt den QR-Teil und teilt ein Bild 1080x1920", async () => {
  const b = await launch(); try {   // closed also when a step fails, so the file does not hang
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }); ctx.setDefaultTimeout(20000);
  const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.addInitScript(() => {   // the phone's share sheet: keep the file it gets
    window.__shared = [];
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", { configurable: true, value: async (o) => { window.__shared.push(...(o.files || [])); } });
  });
  await p.goto("file://" + path.join(dist, "index.html") + "#i=quiz-chaos");
  await p.locator("#go").click(); await p.locator("#edmain").click(); await p.locator("#share").waitFor();
  assert.equal(await p.evaluate(() => typeof window.StatusCard), "undefined", "vor dem Knopf kein QR-Teil");
  await p.locator("#tostatus").evaluate((e) => e.click());
  await p.waitForFunction(() => window.__shared.length > 0);
  // the card editor's text tab has loaded "texte" (Worte finden, card text) on the way; the button only adds "qr"
  assert.deepEqual((await loaded(p)).map((s) => s.src.split(".")[0]), ["texte", "qr"]);
  const f = await p.evaluate(async () => { const f = window.__shared[0], i = await createImageBitmap(f); return { type: f.type, name: f.name, w: i.width, h: i.height }; });
  assert.deepEqual(f, { type: "image/jpeg", name: "my-daily-idea-status.jpg", w: 1080, h: 1920 });
  assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test("Web /duell: nach dem Laden alle Teile mit SRI vorab; danach offline Arcade-Menue und Lizenzen", async () => {
  const srv = await serve(), base = "http://127.0.0.1:" + srv.address().port;
  const b = await launch(), ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }); ctx.setDefaultTimeout(20000);
  const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(base + "/duell");   // without the slash: the parts still come from /duell/parts/
  await p.waitForFunction(() => window.Parts.names().every((n) => window.Parts.ready(n)));
  const got = await loaded(p);
  assert.deepEqual(got.map((s) => s.src.split(".")[0]).sort(), ["licenses", "play", "qr", "quiz", "satz", "table", "texte", "welt"]);
  for (const s of got) assert.match(s.sri, /^sha384-[A-Za-z0-9+/]{64}$/, s.src);
  assert.equal(await p.evaluate(() => typeof window.TableUI.preview + typeof window.StatusCard.draw), "functionfunction", "echte Module statt Platzhalter");
  await ctx.setOffline(true);
  await p.locator("#me").click(); await p.getByRole("button", { name: "Lizenzen" }).click();
  await p.getByText(/Permission is hereby granted, free of charge/).first().waitFor();
  await p.evaluate(() => window.ArcadeUI.menu("puck"));
  await p.getByRole("button", { name: /Gegen den Bot/ }).waitFor();
  assert.deepEqual(errs, []); await b.close(); srv.close();
});

test("Web: eine veraenderte Teildatei wird abgelehnt (SRI), die Seite sagt es und laeuft weiter", async () => {
  const srv = await serve("licenses"), base = "http://127.0.0.1:" + srv.address().port;
  const b = await launch(), ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }); ctx.setDefaultTimeout(20000);
  const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(base + "/duell/");
  await p.waitForFunction(() => ["play", "qr", "table"].every((n) => window.Parts.ready(n)));
  await p.locator("#me").click(); await p.getByRole("button", { name: "Lizenzen" }).click();
  await p.getByText("Dieser Teil fehlt gerade. Bitte die Seite neu laden.").waitFor();
  assert.equal(await p.evaluate(() => window.__tampered === undefined && window.DailyLicenses === undefined && !window.Parts.ready("licenses")), true);
  assert.deepEqual(errs, []); await b.close(); srv.close();
});
