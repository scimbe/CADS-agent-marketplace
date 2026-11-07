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

// file:// on purpose: how the app shells load their parts; one page, never reloaded (lib/grund.js).
test("file:// (Apps, Tests): Start nur mit dem Katalog-Teil; Spiele-Regal holt Arcade+Live, Lizenzen ihren Teil", async () => {
  const b = await launch(), ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }); ctx.setDefaultTimeout(20000);
  const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.clock.setFixedTime(new Date("2026-03-03T09:00:00Z"));   // a day whose sheet is no arcade duel
  await p.goto("file://" + path.join(dist, "index.html"));
  await p.locator("#go").waitFor();
  assert.deepEqual((await loaded(p)).map((s) => s.src.split(".")[0]), ["katalog", "stimme"], "der Start laedt nur den Katalog und, fuer das erste Blatt, die Daumen (Katalog v2, W0)");
  assert.equal(await p.evaluate(() => typeof window.Arcade + typeof window.StatusCard + typeof window.DailyLicenses), "undefinedundefinedundefined");
  await p.getByRole("button", { name: /^\S+ \d+ Spiele$/ }).click();
  await p.locator(".arctile").first().waitFor();
  assert.equal(await p.locator(".arctile").count(), 10);
  assert.deepEqual((await loaded(p)).map((s) => s.src.split(".")[0]), ["katalog", "stimme", "play"]);
  assert.equal((await loaded(p))[1].sri, "", "file:// ohne SRI (kein CORS-Ursprung)");
  await p.locator("#shback").click();
  await p.locator("#me").click();
  await p.getByRole("button", { name: "Lizenzen" }).click();
  await p.getByText(/SIL OPEN FONT LICENSE Version 1\.1/).waitFor();
  // My style comes as the part stil, which brings "Anmelden / Registrieren" (konto) first; the button its licence texts
  assert.deepEqual((await loaded(p)).map((s) => s.src.split(".")[0]), ["katalog", "stimme", "play", "konto", "stil", "direkt", "licenses"], "Mein Stil holt auch direkt (Schalter Einfache Sprache)");
  assert.deepEqual(errs, []); await b.close();
});

// file:// on purpose: the app shells' parts; one page, never reloaded (lib/grund.js).
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
  // the card editor's text tab has loaded "texte" (Worte finden, card text) and "wetter" on the way; the button only adds "qr"
  assert.deepEqual((await loaded(p)).map((s) => s.src.split(".")[0]), ["katalog", "stimme", "texte", "wetter", "direkt", "qr"], "der Editor holt direkt");
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
  assert.deepEqual(got.map((s) => s.src.split(".")[0]).sort(), ["daten", "direkt", "katalog", "konto", "licenses", "logik", "malen", "melden", "play", "qr", "quiz", "regler", "satz", "stil", "stimme", "table", "texte", "turnzwei", "welt", "wetter"]);
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

// My style (stil) and the report dialog (melden) are parts: when one does not come (offline, a blocked file), the tap
// says so on screen and nothing throws; the next tap after the file is back loads it.
test("Web: Mein Stil und KI melden bei blockiertem Teil: Hinweis statt Fehler, danach laedt der naechste Tipp", async () => {
  const srv = await serve(), base = "http://127.0.0.1:" + srv.address().port;
  const b = await launch(); try {
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }); ctx.setDefaultTimeout(20000);
  const p = await ctx.newPage(), errs = [], asked = []; p.on("pageerror", (e) => errs.push(String(e)));
  const block = (r) => { asked.push(r.request().url().replace(/^.*\/parts\//, "").split(".")[0]); return r.abort(); };
  await ctx.route(/\/duell\/parts\/(stil|melden)\./, block);
  await p.goto(base + "/duell/");
  await p.locator("#go").waitFor();
  const FAIL = "Dieser Teil fehlt gerade. Bitte die Seite neu laden.";
  await p.locator("#me").click();
  await p.locator("#shbody").getByText(FAIL).waitFor();
  assert.equal(await p.locator("#shtitle").textContent(), "Mein Stil");
  assert.equal(await p.locator("#shbody .field").count(), 0, "kein halbes Mein Stil");
  await p.locator("#shback").click(); await p.locator("#home").waitFor();
  const h = await p.evaluate(() => { const D = window.Daily, d = D.docFromIdea(D.IDEAS.find((x) => x.kind === "game"), D.sanitizeProfile({ nick: "Ada" }), "de"); return D.docUrl(D.withTrail(d, "Ada", ["welt"])).split("#")[1]; });
  await p.evaluate((x) => { location.hash = x; }, h);
  await p.locator("#kireport").waitFor();
  await p.locator("#kireport").click();
  await p.locator("#toast.show", { hasText: FAIL }).waitFor();
  assert.equal(await p.locator("dialog.kidlg").count(), 0, "kein Dialog ohne Teil");
  assert.ok(asked.includes("stil") && asked.includes("melden"), asked.join(" "));
  // the file is back: the next tap loads the part (Parts.need forgets a failed try)
  await ctx.unroute(/\/duell\/parts\/(stil|melden)\./, block);
  await p.locator("#kireport").click();
  await p.getByRole("dialog", { name: "Blatt melden?" }).waitFor();
  await p.getByRole("dialog").getByRole("button", { name: "Abbrechen" }).click();
  await p.locator("#me").click();
  await p.locator("#shbody").getByRole("textbox", { name: "Spitzname" }).waitFor();
  assert.deepEqual(errs, []);
  } finally { await b.close(); srv.close(); }
});

// konto hangs (no answer, no abort), stil comes after 1.5 s: My style opens anyway, konto's script still before stil's.
// The weather part missing alone: one word on screen per session, the card's text tab works on.
test("Web: konto haengt, stil kommt nach 1,5 s: Mein Stil oeffnet; fehlt nur wetter, ein Hinweis je Sitzung", async () => {
  const srv = await serve(), base = "http://127.0.0.1:" + srv.address().port;
  const b = await launch(); try {
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }); ctx.setDefaultTimeout(20000);
  const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await ctx.route(/\/duell\/parts\/konto\./, () => {});   // never answered
  await ctx.route(/\/duell\/parts\/stil\./, async (r) => { await new Promise((ok) => setTimeout(ok, 1500)); return r.fallback(); });
  await ctx.route(/\/duell\/parts\/wetter\./, (r) => r.abort());
  await p.goto(base + "/duell/");
  await p.locator("#go").waitFor();
  const t0 = Date.now();
  await p.locator("#me").click();
  await p.locator("#shbody").getByRole("textbox", { name: "Spitzname" }).waitFor({ timeout: 8000 });
  assert.ok(Date.now() - t0 < 8000, "Mein Stil wartet nicht auf konto");
  assert.equal(await p.evaluate(() => window.Parts.ready("konto")), false, "konto haengt noch");
  const order = (await loaded(p)).map((s) => s.src.split(".")[0]);
  assert.ok(order.indexOf("konto") >= 0 && order.indexOf("konto") < order.indexOf("stil"), order.join(" "));
  await p.locator("#shback").click(); await p.locator("#home").waitFor();
  await p.evaluate(() => { const D = window.Daily, i = D.IDEAS.find((x) => x.kind === "card"); window.DailyApp.openEditor(D.docFromIdea(i, window.DailyApp.me(), "de"), { idea: i, tab: "Text" }); });
  await p.locator("#toast.show", { hasText: "Dieser Teil fehlt gerade" }).waitFor();
  const toasts = await p.evaluate(async () => { let n = 0; const tt = document.getElementById("toast"); new MutationObserver(() => n++).observe(tt, { childList: true, characterData: true, subtree: true });
    for (let i = 0; i < 3; i++) { window.DailyDebug.tab("Text"); await new Promise((ok) => setTimeout(ok, 300)); } return n; });
  assert.equal(toasts, 0, "kein zweiter Hinweis beim Tab-Wechsel");
  assert.equal(await p.locator("#panel input[aria-label=\"Ort\"]").count(), 0, "kein Wetter-Block ohne Teil"); assert.ok(await p.locator("#panel .field").count() > 0, "der Text-Tab steht");
  assert.deepEqual(errs, []);
  } finally { await b.close(); srv.close(); }
});
