"use strict";
// "Anmelden / Registrieren" under My style, in real Chrome against a small server that keeps the contract of
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
  const db = new Map(), log = [];
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
      if (rec && rec.gone && !b.fresh) return json(410, { error: "gone", rev });
      if (b.rev !== rev) return json(409, { error: "stale", rev });
      if (b.via === "account" && (!rec || rec.gone) && b.age16 !== true) return json(403, { error: "age16" });
      db.set(key, { rev: rev + 1, p: { v: 1, ...b.profile }, c: b.via === "account" ? (rec && rec.c) || "2026-11-03" : undefined });
      json(200, { rev: rev + 1, via: b.via });
    });
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ db, log, base: "http://127.0.0.1:" + srv.address().port, close: () => { srv.close(); srv.closeAllConnections(); } })));
}

let browser, srv;
test.before(async () => { browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); srv = await fakeServer(); });
test.after(async () => { await browser.close(); srv.close(); });

async function phone({ seed, host } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, locale: "de-DE" }), p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await ctx.addInitScript(([api, seed, host]) => {
    window.DUELL_API = api;
    if (seed && !localStorage.getItem("daily.v1")) localStorage.setItem("daily.v1", JSON.stringify(seed));
    if (host === "ios") window.DuellHost = { ai: function () { return Promise.resolve({ status: 503, body: "{}" }); } };
    if (host === "android") window.DuellHost = { haptic: function () {} };
  }, [srv.base + "/api/duell/config", seed || null, host || null]);
  await p.goto(srv.base + "/duell");
  return { ctx, p, errs, store: () => p.evaluate(() => JSON.parse(localStorage.getItem("daily.v1") || "{}")), style: () => p.locator("#me").click() };
}

test("Sync-Code: zwei Geraete, Stil und Wand kommen an, Fotowerke nie, Loeschen wirkt auf beiden", async () => {
  const a = await phone({ seed: SEED });
  await a.style();
  await a.p.getByText("Ohne Anmeldung bleibt alles nur auf diesem Gerät.").waitFor();
  assert.equal(srv.log.length, 0, "nothing leaves the device before a tap");
  await a.p.getByRole("button", { name: "Sync-Code anlegen" }).click();
  await a.p.getByText("Verbunden per Sync-Code:").waitFor();
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
  await b.p.getByText("Verbunden per Sync-Code:").waitFor();
  let s = await b.store();
  assert.equal(s.me.nick, "Mira"); assert.equal(s.me.emoji, "🦖");
  assert.deepEqual(s.wall.map((e) => e.k), ["card"]);
  assert.equal(s.aiDev, saved.p.ai.dev, "one allowance for both devices");
  assert.equal(await b.p.locator("#me").textContent(), "🦖", "the page shows the arrived style at once");

  await b.p.getByRole("button", { name: "Profil löschen" }).click();
  await b.p.getByRole("button", { name: "Wirklich löschen? Nochmal tippen." }).click();
  await b.p.getByText("Sync-Code anlegen").waitFor();
  assert.equal(srv.db.get("code:" + code).gone, true);
  assert.equal((await b.store()).me.nick, "Mira", "everything stays on the device");

  await a.p.getByRole("button", { name: "Jetzt abgleichen" }).click();
  await a.p.getByText("Sync-Code anlegen").waitFor();
  assert.equal(srv.db.get("code:" + code).gone, true, "the other device does not upload it again");
  s = await a.store();
  assert.equal(s.profile, undefined); assert.equal(s.me.nick, "Mira"); assert.equal(s.wall.length, 2, "photo work and card still here");
  assert.deepEqual([...a.errs, ...b.errs], []);
  await a.ctx.close(); await b.ctx.close();
});

test("Sync-Code: Aenderung auf einem Geraet kommt beim anderen an", async () => {
  const a = await phone({ seed: SEED }), b = await phone();
  await a.style(); await a.p.getByRole("button", { name: "Sync-Code anlegen" }).click(); await a.p.getByText("Verbunden per Sync-Code:").waitFor();
  const code = await a.p.locator(".accode").textContent();
  await b.style(); await b.p.getByPlaceholder("Code von deinem anderen Gerät").fill(code); await b.p.getByRole("button", { name: "Mit Code verbinden" }).click(); await b.p.getByText("Verbunden per Sync-Code:").waitFor();
  await b.p.getByLabel("Spitzname").fill("Kiwi");
  for (let i = 0; i < 60 && srv.db.get("code:" + code.replace(/-/g, "")).p.me.nick !== "Kiwi"; i++) await b.p.waitForTimeout(100);
  assert.equal(srv.db.get("code:" + code.replace(/-/g, "")).p.me.nick, "Kiwi", "a change syncs by itself a moment later");
  await a.p.getByRole("button", { name: "Jetzt abgleichen" }).click();
  await a.p.getByText(/^Abgeglichen um /).waitFor();
  assert.equal((await a.store()).me.nick, "Kiwi");
  await a.ctx.close(); await b.ctx.close();
});

test("Konto: erst nach 16+, Anmelden ueber /auth/login, danach liegt das Profil am Konto", async () => {
  const c = await phone({ seed: SEED });
  await c.style();
  const go = c.p.getByRole("button", { name: "Mit bunsenbrenner-Konto anmelden oder registrieren" });
  assert.equal(await go.isDisabled(), true, "no login before the 16+ statement");
  await c.p.getByText("Unter 16? Nimm den Sync-Code.", { exact: false }).waitFor();
  await c.p.getByLabel("Ich bin 16 oder älter.").check();
  await Promise.all([c.p.waitForURL(srv.base + "/duell"), go.click()]);
  for (let i = 0; i < 50 && !srv.db.get("acc"); i++) await c.p.waitForTimeout(100);
  const acc = srv.db.get("acc");
  assert.equal(acc.p.me.nick, "Mira"); assert.equal(acc.p.ai, undefined, "an account keeps its allowance on the server");
  assert.ok(srv.log.some((r) => r.op === "put" && r.body.via === "account" && r.body.age16 === true && r.cookie), "first write carries the 16+ statement, with the cookie");
  await c.style();
  await c.p.getByText("Verbunden mit deinem bunsenbrenner-Konto.").waitFor();
  assert.deepEqual(c.errs, []);
  await c.ctx.close();
});

test("App-Huellen: iOS ohne Netz zeigt nur Hinweise und fragt nichts, Android hat den Code, aber kein Konto", async () => {
  const before = srv.log.length;
  const ios = await phone({ seed: SEED, host: "ios" });
  await ios.style();
  await ios.p.getByText("Der Sync-Code geht in dieser App noch nicht, im Browser schon.").waitFor();
  await ios.p.getByText("Anmelden mit Konto geht im Browser auf bunsenbrenner.org.").waitFor();
  assert.equal(await ios.p.getByRole("button", { name: "Sync-Code anlegen" }).count(), 0);
  assert.equal(await ios.p.getByRole("button", { name: /bunsenbrenner-Konto/ }).count(), 0);
  const android = await phone({ seed: SEED, host: "android" });
  await android.style();
  await android.p.getByRole("button", { name: "Sync-Code anlegen" }).waitFor();
  assert.equal(await android.p.getByRole("button", { name: /bunsenbrenner-Konto/ }).count(), 0, "the shells send no cookie");
  assert.equal(srv.log.length, before, "no request from merely opening My style");
  assert.deepEqual([...ios.errs, ...android.errs], []);
  await ios.ctx.close(); await android.ctx.close();
});

// The live path: the page as on the demos host (served here, everything else of that host answered locally), a tap on the
// frog, "Anmelden / Registrieren" in view, the 16+ statement, the button. From /auth/login on the real chain runs:
// gate/start -> Keycloak (realm ct-demo, client ct-portal). Only the target URL is checked; nothing is typed there.
const DEMOS = "https://demos-34a13a96.bunsenbrenner.org";
test("Frosch -> Anmelden / Registrieren -> Keycloak, mit dem Look-Cookie in meinen Farben", async (t) => {
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
  const title = p.getByRole("heading", { name: "Anmelden / Registrieren" });
  await title.scrollIntoViewIfNeeded();
  assert.equal(await title.isVisible(), true, "the frog leads to Anmelden / Registrieren");
  const go = p.getByRole("button", { name: "Mit bunsenbrenner-Konto anmelden oder registrieren" });
  assert.equal(await go.isDisabled(), true);
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
