"use strict";
// The account (card and "Konto & Daten") under My style, in real Chrome against a small server that keeps the contract of
// CADS-DEMO-wrapper lib/duell-profile.mjs (revision, delete marker, login cookie, 16+ on the first account write).
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const DIST = path.join(__dirname, "../../dist/index.html");
const PARTS = path.join(__dirname, "../../dist/parts");
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQ==";
const SEED = { me: { nick: "Mira", emoji: "🦖", colors: ["#2b4bff", "#ffe600"], set: "weltall" },
  wall: [{ id: "own", ts: 3, k: "photo", th: JPEG }, { id: "own", ts: 2, k: "card", th: JPEG }], saved: [{ id: "quiz-chaos", ts: 1 }], aiDev: "5e".repeat(16) };

function fakeServer() {
  const db = new Map(), log = [], conf = { full: false };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x"), json = (s, b, h = {}) => res.writeHead(s, { "Content-Type": "application/json", ...h }).end(JSON.stringify(b));
    // The page allows only the demos host in connect-src; served from here, this test server stands in for it.
    if (u.pathname === "/duell") return res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(fs.readFileSync(DIST, "utf8").replace("connect-src ", "connect-src 'self' "));
    if (u.pathname.startsWith("/duell/parts/")) return res.writeHead(200, { "Content-Type": "text/javascript" }).end(fs.readFileSync(path.join(PARTS, path.basename(u.pathname))));
    if (u.pathname === "/auth/login") return res.writeHead(302, { "Set-Cookie": "ct_gate_session=t1; Path=/; HttpOnly; SameSite=Lax", Location: u.searchParams.get("return") || "/" }).end();
    const m = u.pathname.match(/^\/api\/duell\/profile\/(get|put|delete)$/);
    if (!m) return json(503, { error: "off" });
    let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
      const b = JSON.parse(raw), cookie = /ct_gate_session=t1/.test(req.headers.cookie || "");
      log.push({ op: m[1], body: b, cookie });
      if (b.via === "account" && !cookie) return json(401, { error: "login-required" });
      const key = b.via === "account" ? "acc" : "code:" + b.code, rec = db.get(key);
      if (m[1] === "get") return json(200, rec && !rec.gone ? { profile: rec.p, rev: rec.rev, via: b.via } : { profile: null, rev: rec ? rec.rev : 0, via: b.via, gone: !!(rec && rec.gone) || undefined });
      if (m[1] === "delete") { if (rec) db.set(key, { rev: rec.rev + 1, gone: true }); return json(200, { deleted: true }); }
      const rev = rec ? rec.rev : 0;
      if (conf.full) return json(429, { error: "full" });   // store full (CADS-DEMO-wrapper #82, fail-closed)
      if (rec && rec.gone && !b.fresh) return json(410, { error: "gone", rev });
      if (b.rev !== rev) return json(409, { error: "stale", rev });
      if (b.via === "account" && (!rec || rec.gone) && b.age16 !== true) return json(403, { error: "age16" });
      if (b.via === "code" && (!rec || rec.gone) && !cookie) return json(403, { error: "code-needs-login" });   // a new code needs an account
      db.set(key, { rev: rev + 1, p: { v: 1, ...b.profile }, c: b.via === "account" ? (rec && rec.c) || "2026-11-03" : undefined });
      json(200, { rev: rev + 1, via: b.via });
    });
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ db, log, conf, base: "http://127.0.0.1:" + srv.address().port, close: () => { srv.close(); srv.closeAllConnections(); } })));
}

let browser, srv;
test.before(async () => { browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); srv = await fakeServer(); });
test.after(async () => { await browser.close(); srv.close(); });

async function phone({ seed, host, login } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, locale: "de-DE" }), p = await ctx.newPage();
  if (login) await ctx.addCookies([{ name: "ct_gate_session", value: "t1", url: srv.base }]);
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await ctx.addInitScript(([api, seed, host]) => {
    window.DUELL_API = api;
    if (seed && !localStorage.getItem("daily.v1")) localStorage.setItem("daily.v1", JSON.stringify(seed));
    if (host === "ios") window.DuellHost = { ai: function () { return Promise.resolve({ status: 503, body: "{}" }); } };
    if (host === "android") window.DuellHost = { haptic: function () {} };
  }, [srv.base + "/api/duell/config", seed || null, host || null]);
  await p.goto(srv.base + "/duell");
  return { ctx, p, errs, store: () => p.evaluate(() => JSON.parse(localStorage.getItem("daily.v1") || "{}")), style: async () => { await p.locator("#me").click(); await p.locator("#stdata summary").click(); } };   // the details live under "Konto & Daten"
}

test("Geraete-Code: zwei Geraete, Stil und Wand kommen an, Fotowerke nie, Loeschen wirkt auf beiden", async () => {
  const a = await phone({ seed: SEED, login: true });
  await a.style();
  await a.p.getByText("Geht auch ohne. Dann bleibt alles nur auf diesem Gerät.").waitFor();
  assert.equal(srv.log.length, 0, "nothing leaves the device before a tap");
  assert.equal(await a.p.getByRole("button", { name: "Geräte-Code anlegen" }).isDisabled(), true, "a new code only after the 16+ statement");
  await a.p.getByLabel("Ich bin 16 oder älter.").check();
  await a.p.getByRole("button", { name: "Geräte-Code anlegen" }).click();
  await a.p.getByText("Verbunden per Geräte-Code:").waitFor();
  const shown = await a.p.locator(".accode").textContent();
  assert.match(shown, /^([0-9a-f]{4}-){7}[0-9a-f]{4}$/);
  const code = shown.replace(/-/g, ""), saved = srv.db.get("code:" + code);
  assert.equal(saved.p.me.nick, "Mira");
  assert.deepEqual(saved.p.wall.map((e) => e.k), ["card"], "the photo work stayed on the device");
  assert.deepEqual(saved.p.saved, [{ id: "quiz-chaos", ts: 1 }]);
  assert.equal(saved.p.ai.dev, "5e".repeat(16), "AI allowance travels with the code");
  assert.ok(srv.log.every((r) => !JSON.stringify(r.body).includes('"photo"')), "no request ever carried a photo work");

  const b = await phone();
  await b.style();
  await b.p.getByPlaceholder("Code von deinem anderen Gerät").fill(shown.toUpperCase());
  await b.p.getByRole("button", { name: "Mit Code verbinden" }).click();
  await b.p.getByText("Verbunden per Geräte-Code:").waitFor();
  let s = await b.store();
  assert.equal(s.me.nick, "Mira"); assert.equal(s.me.emoji, "🦖");
  assert.deepEqual(s.wall.map((e) => e.k), ["card"]);
  assert.equal(s.aiDev, saved.p.ai.dev, "one allowance for both devices");
  assert.equal(await b.p.locator("#me").textContent(), "🦖", "the page shows the arrived style at once");

  await b.p.getByRole("button", { name: "Profil löschen" }).click();
  await b.p.getByRole("button", { name: "Wirklich löschen? Nochmal tippen." }).click();
  await b.p.getByText("Geräte-Code anlegen").waitFor();
  assert.equal(srv.db.get("code:" + code).gone, true);
  assert.equal((await b.store()).me.nick, "Mira", "everything stays on the device");

  await a.p.getByRole("button", { name: "Jetzt sichern" }).click();
  await a.p.getByText("Geräte-Code anlegen").waitFor();
  assert.equal(srv.db.get("code:" + code).gone, true, "the other device does not upload it again");
  s = await a.store();
  assert.equal(s.profile, undefined); assert.equal(s.me.nick, "Mira"); assert.equal(s.wall.length, 2, "photo work and card still here");
  assert.deepEqual([...a.errs, ...b.errs], []);
  await a.ctx.close(); await b.ctx.close();
});

test("Geraete-Code: Aenderung auf einem Geraet kommt beim anderen an", async () => {
  const a = await phone({ seed: SEED, login: true }), b = await phone();
  await a.style(); await a.p.getByLabel("Ich bin 16 oder älter.").check(); await a.p.getByRole("button", { name: "Geräte-Code anlegen" }).click(); await a.p.getByText("Verbunden per Geräte-Code:").waitFor();
  const code = await a.p.locator(".accode").textContent();
  await b.style(); await b.p.getByPlaceholder("Code von deinem anderen Gerät").fill(code); await b.p.getByRole("button", { name: "Mit Code verbinden" }).click(); await b.p.getByText("Verbunden per Geräte-Code:").waitFor();
  await b.p.getByLabel("Spitzname").fill("Kiwi");
  for (let i = 0; i < 60 && srv.db.get("code:" + code.replace(/-/g, "")).p.me.nick !== "Kiwi"; i++) await b.p.waitForTimeout(100);
  assert.equal(srv.db.get("code:" + code.replace(/-/g, "")).p.me.nick, "Kiwi", "a change syncs by itself a moment later");
  await a.p.getByRole("button", { name: "Jetzt sichern" }).click();
  await a.p.getByText(/^Gesichert um /).waitFor();
  assert.equal((await a.store()).me.nick, "Kiwi");
  await a.ctx.close(); await b.ctx.close();
});

test("Konto: erst nach 16+, Anmelden ueber /auth/login, danach liegt das Profil am Konto", async () => {
  const c = await phone({ seed: SEED });
  await c.style();
  const go = c.p.getByRole("button", { name: "Anmelden oder Konto anlegen" });
  await go.click();   // without the 16+ statement: no login, the reason and the focus on the tick
  await c.p.getByRole("alert").filter({ hasText: "Bitte zuerst bestätigen: Ich bin 16 oder älter." }).waitFor();
  assert.equal(await c.p.evaluate(() => document.activeElement.id), "ac16"); assert.equal(c.p.url(), srv.base + "/duell", "no login before the 16+ statement");
  await c.p.getByText("Unter 16? Jemand ab 16, zum Beispiel deine Eltern, legt mit Konto einen Geräte-Code an.", { exact: false }).waitFor();
  await c.p.getByLabel("Ich bin 16 oder älter.").check();
  await Promise.all([c.p.waitForURL(srv.base + "/duell"), go.click()]);
  for (let i = 0; i < 50 && !srv.db.get("acc"); i++) await c.p.waitForTimeout(100);
  const acc = srv.db.get("acc");
  assert.equal(acc.p.me.nick, "Mira"); assert.equal(acc.p.ai, undefined, "an account keeps its allowance on the server");
  assert.ok(srv.log.some((r) => r.op === "put" && r.body.via === "account" && r.body.age16 === true && r.cookie), "first write carries the 16+ statement, with the cookie");
  await c.style();
  await c.p.getByText("Angemeldet mit deinem Konto bei bunsenbrenner.org.").waitFor();
  assert.deepEqual(c.errs, []);
  await c.ctx.close();
});

test("Neuer Geraete-Code ohne Anmeldung: erst zum Login, zurueck wird der Code angelegt; Verbinden mit einem unbekannten Code legt nie an", async () => {
  const d = await phone({ seed: SEED }), e = await phone(), f = await phone({ login: true });
  try {
    await d.style();
    await d.p.getByText("Einen neuen Code legt man mit Konto an", { exact: false }).waitFor();
    await d.p.getByLabel("Ich bin 16 oder älter.").check();
    // 403 code-needs-login -> /auth/login -> 302 back to /duell: wait for the login request and the new page, not the URL (it is /duell already)
    const login = d.p.waitForRequest((r) => new URL(r.url()).pathname === "/auth/login");
    await d.p.getByRole("button", { name: "Geräte-Code anlegen" }).click();
    await login;
    await d.p.waitForResponse((r) => r.url() === srv.base + "/duell" && r.request().resourceType() === "document");
    await d.p.locator("#go").waitFor();
    let s = {};
    for (let i = 0; i < 80; i++) { s = await d.store(); if (s.profile && s.profile.code && srv.db.get("code:" + s.profile.code)) break; await d.p.waitForTimeout(100); }
    assert.equal(s.profile.via, "code"); assert.match(s.profile.code, /^[0-9a-f]{32}$/);
    assert.equal(srv.db.get("code:" + s.profile.code).p.me.nick, "Mira", "made after the login, once");
    await d.style(); await d.p.getByText("Verbunden per Geräte-Code:").waitFor();
    // joining with a code nobody has: never creates, also not with a login cookie in the browser
    for (const [x, code] of [[e, "ab".repeat(16)], [f, "cd".repeat(16)]]) {
      const n = srv.log.length;
      await x.style();
      await x.p.getByPlaceholder("Code von deinem anderen Gerät").fill(code);
      await x.p.getByRole("button", { name: "Mit Code verbinden" }).click();
      await x.p.getByText("Zu diesem Code gibt es kein Profil.", { exact: false }).waitFor();
      assert.equal(srv.db.get("code:" + code), undefined, "a typo creates nothing");
      assert.deepEqual(srv.log.slice(n).map((r) => r.op), ["get"], "only the look-up went out");
      assert.equal((await x.store()).profile, undefined);
    }
    // store full (429): its own note, not "Gleiche ab ..."
    srv.conf.full = true;
    await d.p.getByLabel("Spitzname").fill("Kiwi");
    await d.p.getByRole("button", { name: "Jetzt sichern" }).click();
    await d.p.getByText("Sichern geht gerade nur begrenzt.", { exact: false }).waitFor();
    assert.equal(await d.p.getByText("Wird gesichert …").count(), 0);
    assert.deepEqual([...d.errs, ...e.errs, ...f.errs], []);
  } finally { srv.conf.full = false; await d.ctx.close(); await e.ctx.close(); await f.ctx.close(); }
});

test("App-Huellen: iOS ohne Netz zeigt nur Hinweise und fragt nichts, Android hat den Code, aber kein Konto", async () => {
  const before = srv.log.length;
  const ios = await phone({ seed: SEED, host: "ios" });
  await ios.style();
  await ios.p.getByText("Der Geräte-Code geht in dieser App noch nicht, im Browser schon.").waitFor();
  await ios.p.getByText("Anmelden mit Konto geht im Browser auf bunsenbrenner.org.").waitFor();
  assert.equal(await ios.p.getByRole("button", { name: "Geräte-Code anlegen" }).count(), 0);
  assert.equal(await ios.p.getByRole("button", { name: "Anmelden oder Konto anlegen" }).count(), 0);
  const android = await phone({ seed: SEED, host: "android" });
  await android.style();
  await android.p.getByRole("button", { name: "Mit Code verbinden" }).waitFor();
  assert.equal(await android.p.getByRole("button", { name: "Geräte-Code anlegen" }).count(), 0, "a new code needs the login cookie, the shells send none");
  assert.equal(await android.p.getByRole("button", { name: "Anmelden oder Konto anlegen" }).count(), 0, "the shells send no cookie");
  assert.equal(srv.log.length, before, "no request from merely opening My style");
  assert.deepEqual([...ios.errs, ...android.errs], []);
  await ios.ctx.close(); await android.ctx.close();
});

// The live path: the page as on the demos host (served here, everything else of that host answered locally), a tap on the
// frog, the account card ("Konto (freiwillig)") in view, the 16+ statement, the button. From /auth/login on the real chain runs:
// gate/start -> Keycloak (realm ct-demo, client ct-portal). Only the target URL is checked; nothing is typed there.
const DEMOS = "https://demos-34a13a96.bunsenbrenner.org";
test("Frosch -> Konto-Karte -> Keycloak, mit dem Look-Cookie in meinen Farben", async (t) => {
  try { await require("node:dns").promises.lookup("auth.bunsenbrenner.org"); } catch (e) { return t.skip("kein Netz zu bunsenbrenner.org"); }
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, locale: "de-DE" }), p = await ctx.newPage();
  const errs = [], toLogin = [], toAuth = []; p.on("pageerror", (e) => errs.push(e.message));
  await ctx.route((u) => u.origin === DEMOS, (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === "/duell") return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: fs.readFileSync(DIST, "utf8") });
    if (u.pathname.startsWith("/duell/parts/")) return route.fulfill({ status: 200, contentType: "text/javascript", body: fs.readFileSync(path.join(PARTS, path.basename(u.pathname))) });
    if (u.pathname === "/auth/login") { toLogin.push({ url: u.href, cookie: route.request().headers().cookie || "" }); return route.continue(); }
    return route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"off"}' });
  });
  p.on("request", async (r) => { if (r.url().startsWith("https://auth.bunsenbrenner.org/")) toAuth.push({ url: r.url(), cookie: (await r.allHeaders()).cookie || "" }); });
  await ctx.addInitScript((seed) => { if (!localStorage.getItem("daily.v1")) localStorage.setItem("daily.v1", JSON.stringify(seed)); }, SEED);
  await p.goto(DEMOS + "/duell");
  await p.locator("#me").click();
  const title = p.getByRole("heading", { name: "Konto (freiwillig)" });
  await title.scrollIntoViewIfNeeded();
  assert.equal(await title.isVisible(), true, "the frog leads to the account card");
  const go = p.getByRole("button", { name: "Anmelden oder Konto anlegen" });
  await go.click(); await p.getByRole("alert").filter({ hasText: "Bitte zuerst bestätigen" }).waitFor();
  assert.equal(toLogin.length, 0, "no login before the 16+ statement");
  assert.equal((await ctx.cookies("https://bunsenbrenner.org")).filter((c) => c.name === "ct_look").length, 0, "no cookie before the tap");
  await p.getByLabel("Ich bin 16 oder älter.").check();
  await Promise.all([p.waitForURL(/^https:\/\/auth\.bunsenbrenner\.org\//, { timeout: 30000, waitUntil: "commit" }), go.click()]);
  assert.equal(toLogin.length, 1); assert.equal(toLogin[0].url, DEMOS + "/auth/login?return=%2Fduell");
  const k = new URL(p.url());
  assert.equal(k.origin + k.pathname, "https://auth.bunsenbrenner.org/realms/ct-demo/protocol/openid-connect/auth");
  assert.equal(k.searchParams.get("client_id"), "ct-portal");
  assert.equal(k.searchParams.get("redirect_uri"), "https://bunsenbrenner.org/gate/callback");
  assert.equal(k.searchParams.get("response_type"), "code");
  const look = (await ctx.cookies("https://auth.bunsenbrenner.org")).find((c) => c.name === "ct_look");
  assert.ok(look, "ct_look is set");
  assert.equal(look.value, "daily.2b4bff.ffe600", "my colours: a = background, b = accent");
  assert.equal(look.domain, ".bunsenbrenner.org"); assert.equal(look.path, "/"); assert.equal(look.secure, true); assert.equal(look.sameSite, "Lax");
  assert.ok(look.expires > Date.now() / 1000 + 86000 && look.expires < Date.now() / 1000 + 86500, "short life, one day");
  assert.match(toLogin[0].cookie, /ct_look=daily\.2b4bff\.ffe600/, "already there on the way to the login");
  assert.ok(toAuth.some((r) => /ct_look=daily\.2b4bff\.ffe600/.test(r.cookie)), "Keycloak gets the look");
  assert.deepEqual(errs, []);
  await ctx.close();
});

// The AI's login link (ai.js): the look cookie lives in the part konto, so the tap loads it, sets the cookie, then goes.
test("KI-Login: der Teil konto kommt vor dem Sprung, das Look-Cookie ist schon beim /auth/login da", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, locale: "de-DE" }), p = await ctx.newPage();
  const errs = [], toLogin = []; let kontoOk = false;   // the idle preload of the web is refused until the tap: the tap itself must load it p.on("pageerror", (e) => errs.push(e.message));
  await ctx.route((u) => u.origin === DEMOS, (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === "/duell") return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: fs.readFileSync(DIST, "utf8") });
    if (u.pathname.startsWith("/duell/parts/konto.") && !kontoOk) return route.fulfill({ status: 503, body: "" });
    if (u.pathname.startsWith("/duell/parts/")) return route.fulfill({ status: 200, contentType: "text/javascript", body: fs.readFileSync(path.join(PARTS, path.basename(u.pathname))) });
    if (u.pathname === "/auth/login") { toLogin.push({ url: u.href, cookie: route.request().headers().cookie || "" }); return route.fulfill({ status: 200, contentType: "text/html", body: "<p>login</p>" }); }
    return route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"off"}' });
  });
  await ctx.addInitScript((seed) => { if (!localStorage.getItem("daily.v1")) localStorage.setItem("daily.v1", JSON.stringify(seed)); }, { ...SEED, aiMeter: { free: 3, canLogin: true } });
  await p.goto(DEMOS + "/duell");
  await p.locator("#go").waitFor();
  // the idle preload: every part but konto (blocked here), noto, dart and klang (never preloaded: a sticker, a dart card or a voice sheet asks)
  await p.waitForFunction(() => window.Parts.names().filter((n) => n !== "konto" && n !== "noto" && n !== "dart" && n !== "klang").every((n) => window.Parts.ready(n)));
  assert.equal(await p.evaluate(() => window.Parts.ready("konto")), false, "no konto part before");
  await p.evaluate(() => {   // the AI wall as the page shows it (app.js openAiWall), here in a plain box
    const el = (tag, cls, text, on) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; if (on) e.addEventListener("click", on); return e; };
    const b = el("div"); b.id = "aiwalltest"; document.body.prepend(b); window.Ai.wall(b, el);
  });
  kontoOk = true;
  await Promise.all([p.waitForURL(DEMOS + "/auth/login?return=%2Fduell", { waitUntil: "commit" }), p.locator("#aiwalltest").getByRole("link", { name: "Mit Konto anmelden" }).evaluate((a) => a.click())]);   // the box sits under the page's screens
  assert.equal(toLogin.length, 1);
  assert.match(toLogin[0].cookie, /ct_look=daily\.2b4bff\.ffe600/, "cookie set before the jump");
  assert.deepEqual(errs, []);
  await ctx.close();
});
