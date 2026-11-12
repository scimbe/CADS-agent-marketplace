// Nachladen der Karten (ADR 0001 Nachtrag 2) ueber http: Kaltstart unter 3G-Drosselung (gemessen), Karte aus dem
// Teil, Cache fuer offline, fehlender und manipulierter Teil -> ehrliche Meldung mit Wiederholen, keine CSP-Verstoesse.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browser, axe } from "./lib/grund.mjs";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json" };
let b, server, base;
test.before(async () => {
  b = await browser();
  server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/favicon.ico") { res.writeHead(204); res.end(); return; } // Browser fragt es von selbst an
    // wie in Produktion: App unter /duell (mit und ohne Schraegstrich); /parts/… an der Wurzel gibt es dort nicht
    const rel = u.pathname === "/" || u.pathname === "/duell" || u.pathname === "/duell/" ? "index.html" : u.pathname.startsWith("/duell/") ? u.pathname.slice(7) : u.pathname.slice(1);
    const f = path.join(DIST, rel);
    if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port + "/";
});
test.after(async () => { await b.close(); server.close(); });

async function page({ throttle = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: "de-DE" });
  // lokaler Testserver ausdruecklich erlaubt (nolive.js sperrt sonst jedes http); spaetere Routen gehen vor
  await ctx.route(base + "**", (r) => r.continue());
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e));
  // Der Testserver hat kein Konto-Backend (/api/duell/* -> 404, ehrlich als Konto-Fehler angezeigt); nur das wird
  // ausgenommen, jede andere fehlende Ressource (z. B. ein Teil) bleibt ein Fehler
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console " + m.text()); });
  p.on("response", (r) => { if (r.status() >= 400 && !/\/api\/duell\//.test(r.url())) errs.push("http " + r.status() + " " + r.url()); });
  await p.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error("CSP " + e.violatedDirective + " " + e.blockedURI)));
  if (throttle) {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Network.enable");
    // DevTools-Profil "Fast 3G": 1,6 Mbit/s runter, 750 kbit/s hoch, 150 ms RTT (x 3,75 Paketfaktor = 562,5 ms)
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 562.5, downloadThroughput: (1.6 * 1024 * 1024 / 8) * 0.9, uploadThroughput: (750 * 1024 / 8) * 0.9 });
  }
  return { ctx, p, errs };
}

test("Kaltstart unter 3G-Drosselung: Kern, dann Karte aus dem Teil (Messung)", async () => {
  const { p, errs } = await page({ throttle: true });
  const t0 = Date.now();
  await p.goto(base);
  await p.locator("header.bar").waitFor({ timeout: 30000 });
  const tCore = Date.now() - t0;
  const t1 = Date.now();
  await p.locator('[data-act="open-bluff"]').first().click();
  await p.locator("main.s-card-view").waitFor({ timeout: 30000 });
  const tCard = Date.now() - t1;
  console.log("# 3G-Kaltstart: Kern " + tCore + " ms, erste Karte (bluff) " + tCard + " ms");
  assert.ok(tCore < 15000, "Kern " + tCore);
  assert.ok(tCard < 10000, "Karte " + tCard);
  assert.deepEqual(errs, []);
});

// Staging-Befund L2: unter "/duell" ohne Schraegstrich loeste der Browser "parts/…" zu "/parts/…" auf (404, keine Karte
// oeffnete). Beide Schreibweisen muessen dieselbe Teile-URL /duell/parts/… ergeben; ein 404 waere in errs.
for (const at of ["duell", "duell/"]) {
  test("App unter /" + at + ": Karte oeffnet, Teile kommen aus /duell/parts/ (kein /parts/ an der Wurzel)", async () => {
    const { p, errs } = await page();
    const asked = []; p.on("request", (r) => { if (/\/parts\//.test(r.url())) asked.push(new URL(r.url()).pathname); });
    await p.goto(base + at);
    await p.locator("header.bar").waitFor();
    await p.locator('[data-act="open-gruss"]').first().click();
    await p.locator("main.s-card-view").waitFor();
    assert.ok(asked.length > 0 && asked.every((x) => x.startsWith("/duell/parts/")), JSON.stringify(asked));
    assert.deepEqual(errs, []);
  });
}

// Feature-Teile (ADR 0001 Nachtrag 4): der gebaute Teil laedt unter /duell/parts/ mit SRI und meldet sich mit "mdi:feat"
// (Name + Modul); ein falscher SRI-Wert wird vom Browser abgewiesen. Der Weg ueber den Kern (parts.feat, strict-dynamic)
// ist derselbe wie bei Kartenteilen; hier wird der Teil selbst geprueft (Kontext ohne CSP, Skript von aussen eingefuegt).
test("Feature-Teil klang-rap: laedt mit SRI unter /duell/parts/, meldet Name und Modul; falscher SRI wird abgewiesen", async () => {
  const ctx = await b.newContext({ bypassCSP: true });
  await ctx.route(base + "**", (r) => r.continue());
  const p = await ctx.newPage();
  await p.goto(base + "duell");
  const bj = JSON.parse(fs.readFileSync(path.join(DIST, "build.json"), "utf8")), f = bj.feats["klang-rap"];
  assert.ok(f && /^parts\/feat-klang-rap\.[0-9a-f]{12}\.js$/.test(f.file), JSON.stringify(f));
  const run = (sri) => p.evaluate(([file, sri]) => new Promise((ok) => {
    let got = null; const on = (e) => { got = e.detail; };
    document.addEventListener("mdi:feat", on);
    const s = document.createElement("script"); s.src = new URL(file, location.origin + "/duell/").href; s.integrity = sri; s.crossOrigin = "anonymous";
    s.onload = () => { document.removeEventListener("mdi:feat", on); ok(got ? { name: got.name, keys: Object.keys(got.mod).sort(), frozen: Object.isFrozen(got.mod) } : "kein-ereignis"); };
    s.onerror = () => { document.removeEventListener("mdi:feat", on); ok("abgewiesen"); };
    document.head.appendChild(s);
  }), [f.file, sri]);
  const good = await run(f.sri);
  assert.equal(good.name, "klang-rap"); assert.ok(good.keys.includes("render") && good.keys.includes("wav"), JSON.stringify(good.keys)); assert.equal(good.frozen, true);
  assert.equal(await run("sha384-" + "A".repeat(64)), "abgewiesen");
  await ctx.close();
});

test("Teil kommt nach dem ersten Laden aus dem Cache (offline fuer Teile)", async () => {
  const { ctx, p, errs } = await page();
  await p.goto(base); await p.locator('[data-act="open-gruss"]').first().click(); await p.locator("main.s-card-view").waitFor();
  const cached = await p.evaluate(async () => (await (await caches.open("mdi-parts-v1")).keys()).map((r) => new URL(r.url).pathname));
  assert.ok(cached.some((x) => /\/parts\/card-gruss\./.test(x)), JSON.stringify(cached));
  let hits = 0;
  await ctx.route("**/parts/card-*", (r) => { hits++; return r.abort(); }); // Netz fuer Teile weg
  const p2 = await ctx.newPage();
  await p2.goto(base); await p2.locator('[data-act="open-gruss"]').first().click();
  await p2.locator("main.s-card-view").waitFor();
  assert.equal(hits, 0, "aus dem Cache, ohne Netz");
  assert.deepEqual(errs, []);
});

test("Fehlender Teil: ehrliche Meldung, Wiederholen laedt nach, sobald er wieder da ist; axe ohne Verstoesse", async () => {
  const { ctx, p } = await page();
  let block = true;
  await ctx.route("**/parts/card-bluff*", (r) => (block ? r.fulfill({ status: 404, body: "" }) : r.continue()));
  await p.goto(base); await p.locator('[data-act="open-bluff"]').first().click();
  await p.locator("main.s-partfail").waitFor();
  assert.equal(await p.locator('[role="alert"][data-reason="teil-fehlt"]').count(), 1);
  assert.deepEqual(await axe(p, "partfail"), []);
  block = false;
  await p.locator('[data-act="retry"]').click();
  await p.locator("main.s-card-view").waitFor();
});

test("Manipulierter Teil wird nicht ausgefuehrt (SRI), Meldung teil-manipuliert", async () => {
  const { ctx, p } = await page();
  await ctx.route("**/parts/card-gruss*", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "document.title='boese';" }));
  await p.goto(base); await p.locator('[data-act="open-gruss"]').first().click();
  await p.locator("main.s-partfail").waitFor();
  assert.equal(await p.locator('[role="alert"][data-reason="teil-manipuliert"]').count(), 1);
  assert.notEqual(await p.title(), "boese");
});
