"use strict";
// Code-Modus (part code, src/code-player.js): a game the model wrote inside the server's harness is played here only when
// its code, fetched from our server, matches the link's hash and the server's Ed25519 signature. The server is a stub that
// serves the reference games (fixtures/code-games.json, the wrapper's checked and instrumented code) signed with a key made
// for this test; the app trusts that key through window.CodeKeys (set before the page, as the build sets the real one).
//   - 390x844: Verdopplung (Zahlen schieben) solo by swipes; Farbfeld against the bot to the end
//   - refused: changed signature, changed code (same hash), an id with another hash (409), a pulled game (410), no key
//   - duel by link: the ghost's inputs are replayed, the claimed score must be what they give; a changed score is refused
//   - live: two browser contexts over an in-memory channel play Farbfeld and Funkenfang to the end with the same state hash
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { chromium } = require("playwright");
const SDK = require("../../src/code-sdk.js");
const FIX = require("./fixtures/code-games.json");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const API = "https://demos-34a13a96.bunsenbrenner.org/api/duell/";
const SHOTS = process.env.CODE_SHOTS || "";
const CREATE = { size: 5, remaining: 5, pot: "create", period: "ever", refundsLeft: 2, age16: true };
const SEAL = "s2.karte.mw3abcde.AnlRQb9jJYrLILMRBtJj7yR1qlhJF0ER";

const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
const PUB = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64url");
const other = crypto.generateKeyPairSync("ed25519").privateKey;
const hashOf = (code) => crypto.createHash("sha256").update(code, "utf8").digest("base64url");
const signed = (r) => "mdi-code-v1\n" + SDK.canonical({ v: r.v, id: r.id, h: r.h, meta: r.meta, params: r.params, title: r.title, genre: r.genre, at: r.at });
function record(name, key = privateKey, id) {
  const g = FIX.games[name];
  const r = { v: 1, id: id || crypto.randomBytes(12).toString("base64url"), h: hashOf(g.code), meta: g.meta, params: {}, title: g.meta.title, genre: name === "farbfeld" ? "strategie" : "zahlen", at: 1794300000000, code: g.code };
  r.sig = crypto.sign(null, Buffer.from(signed(r)), key).toString("base64url");
  return r;
}
const linkOf = (r) => `${r.id}.${r.h}.${r.sig}`;
const REC = { verdopplung: record("verdopplung"), farbfeld: record("farbfeld"), funkenfang: record("funkenfang") };

let b;
test.before(async () => { b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); });
test.after(async () => { await b.close(); });

/** a phone; serve: id -> { status, body } (default: the records above, 404 else) */
async function phone(opt = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "de-DE" });
  const p = await ctx.newPage(), errs = [], fetched = [], sent = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await ctx.addInitScript((k) => { window.CodeKeys = k; }, opt.keys || [PUB]);
  await ctx.route(/^https?:/, async (r) => {
    const u = new URL(r.request().url());
    if (u.href.startsWith(API + "code/")) {
      const id = u.pathname.split("/").pop(); fetched.push(id + "?" + u.search);
      const own = opt.serve && opt.serve(id, u.searchParams.get("h"));
      if (own) return r.fulfill({ status: own.status, contentType: "application/json", headers: { "x-content-type-options": "nosniff" }, body: JSON.stringify(own.body) });
      const rec = Object.values(REC).find((x) => x.id === id);
      if (!rec) return r.fulfill({ status: 404, contentType: "application/json", body: '{"error":"unknown"}' });
      if (u.searchParams.get("h") !== rec.h) return r.fulfill({ status: 409, contentType: "application/json", body: '{"error":"hash"}' });
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rec) });
    }
    if (u.href.startsWith(API)) {
      const p0 = u.href.slice(API.length).split("?")[0], body = JSON.parse(r.request().postData() || "null"); sent.push({ path: p0, body });
      const a = opt.ai && opt.ai(p0, body);
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(a || { meter: {}, create: CREATE }) });
    }
    return r.abort();
  });
  await p.goto(page + (opt.hash || ""));
  await p.waitForFunction(() => window.CodeUI && window.Parts);
  return { ctx, p, errs, fetched, sent };
}
const note = (p) => p.locator(".cgov .cgnote").textContent();
const open = (p, rec, title) => p.evaluate((d) => { window.CodeUI.open(d).catch(() => {}); }, { k: "code", c: linkOf(rec), t: title || rec.title });
const press = (p, text) => p.locator(".cgov .cgbtns button", { hasText: text }).click();
async function shot(p, name) { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + ".png") }); } }

test("Zahlen schieben: geprüftes Spiel startet, Wischen verschiebt Kacheln, Punkte steigen (390x844)", async () => {
  const { ctx, p, errs } = await phone();
  await open(p, REC.verdopplung);
  await p.locator(".cgov .cgbtns button", { hasText: "Allein" }).waitFor();
  await shot(p, "code-menu");
  await press(p, "Allein");
  await p.waitForFunction(() => window.CodeUI.current() && window.CodeUI.current().status());
  const cv = await p.locator(".cgov canvas").boundingBox();
  assert.ok(cv.width >= 360 && cv.height > 500, "Spielfeld füllt den Bildschirm: " + JSON.stringify(cv));
  const swipe = async (dx, dy) => { const x = cv.x + cv.width / 2, y = cv.y + cv.height / 2; await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + dx, y + dy, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(120); };
  for (let i = 0; i < 24; i++) await swipe([120, -120, 0, 0][i % 4], [0, 0, 120, -120][i % 4]);
  await p.keyboard.press("ArrowLeft"); await p.keyboard.press("ArrowDown");
  await p.waitForTimeout(300);
  const st = await p.evaluate(() => window.CodeUI.current().status());
  assert.ok(st.score[0] > 0, "Punkte nach dem Wischen: " + JSON.stringify(st));
  // the sandbox: an opaque-origin iframe with only allow-scripts and its own CSP
  const fr = await p.locator("iframe[sandbox]").evaluate((f) => ({ sb: f.getAttribute("sandbox"), csp: /default-src 'none'/.test(f.srcdoc), src: f.src }));
  assert.equal(fr.sb, "allow-scripts"); assert.ok(fr.csp);
  await shot(p, "code-verdopplung");
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("Strategie gegen den Bot bis zum Ende: Farbfeld (Tippen, der Bot zieht, Ergebnis)", async () => {
  const { ctx, p, errs } = await phone();
  await open(p, REC.farbfeld);
  await press(p, "Gegen Bot");
  await p.waitForFunction(() => window.CodeUI.current() && window.CodeUI.current().status());
  const cv = await p.locator(".cgov canvas").boundingBox();
  for (let n = 0; n < 60; n++) {
    const st = await p.evaluate(() => window.CodeUI.current().status());
    if (st.over) break;
    if (st.turn !== 0) { await p.waitForTimeout(150); continue; }
    const mv = await p.evaluate(() => window.CodeUI.current().sandbox.call("moves", 0));
    const [x, y] = mv[n % mv.length].m;
    const s = Math.min(cv.width / 360, cv.height / 640), ox = cv.x + (cv.width - 360 * s) / 2, oy = cv.y + (cv.height - 640 * s) / 2;
    await p.mouse.click(ox + (18 + x * 54 + 27) * s, oy + (150 + y * 54 + 27) * s);
    await p.waitForTimeout(500);
  }
  await p.waitForFunction(() => window.CodeUI.current().status().over, null, { timeout: 15000 });
  await p.locator(".cgov .cgbtns button", { hasText: "Nochmal" }).waitFor();
  assert.match(await note(p), /Gewonnen|Verloren|Unentschieden/);
  await shot(p, "code-farbfeld-ende");
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("freie Karte -> Code-Spiel: Vorschau, Übernehmen öffnet den Spieler; ein nicht bestandenes Spiel ist ehrlich und kostenlos", async () => {
  const doc = { k: "code", c: linkOf(REC.verdopplung), t: "Verdopplung", g: "zahlen", pl: [1, 2], m: "realtime" };
  let fail = false;
  const { ctx, p, errs, sent } = await phone({ ai: (p0) => p0 === "ai/status" ? { meter: {}, create: CREATE }
    : p0 === "ai" ? (fail ? { kind: "karte", options: [], notyet: { what: "code-failed", name: "Zahlen schieben" }, catalog: [], meter: {}, create: CREATE } : { kind: "karte", options: [{ art: "code", doc }], seals: [SEAL], hashes: ["h".repeat(43)], cost: 1, receipt: "rc-code", meter: {}, create: CREATE, note: ["code"] })
    : p0 === "ai/accept" ? { final: true, meter: {}, create: CREATE } : null });
  await p.evaluate(() => { window.DailyApp.me().pref = { age: "a18" }; });
  await p.locator("#create").tap();
  await p.getByRole("button", { name: "🕹 Spiel" }).tap();
  await p.getByLabel("Deine Beschreibung").fill("so ein Zahlen-Schiebe-Ding");
  await p.getByRole("button", { name: "✨ Erschaffen" }).tap();
  await p.locator(".createpv").waitFor();
  const ai = sent.find((x) => x.path === "ai");
  assert.ok(ai && !JSON.stringify(ai.body).includes("GAME"), "nur Satz und Kategorie gehen an den Server");
  await shot(p, "code-karte-vorschau");
  await p.getByRole("button", { name: "Übernehmen" }).tap();
  await p.locator(".cgov .cgbtns button", { hasText: "Allein" }).waitFor({ timeout: 15000 });
  await shot(p, "code-karte-spieler");
  await p.locator(".cgov .cgx").tap();
  assert.equal(await p.locator(".cgov").count(), 0);
  assert.deepEqual(errs, []);
  await ctx.close();
  // the same wish once more, and this time the game does not pass: said honestly, nothing charged, no game shown
  fail = true;
  const two = await phone({ ai: (p0) => p0 === "ai/status" ? { meter: {}, create: CREATE } : p0 === "ai" ? { kind: "karte", options: [], notyet: { what: "code-failed", name: "Zahlen schieben" }, catalog: [], meter: {}, create: CREATE } : null });
  await two.p.evaluate(() => { window.DailyApp.me().pref = { age: "a18" }; });
  await two.p.locator("#create").tap();
  await two.p.getByRole("button", { name: "🕹 Spiel" }).tap();
  await two.p.getByLabel("Deine Beschreibung").fill("zahlen schieben lol");
  await two.p.getByRole("button", { name: "✨ Erschaffen" }).tap();
  await two.p.getByText("hat diesmal nicht alle unsere Prüfungen bestanden").waitFor({ timeout: 10000 });
  assert.match(await two.p.locator(".aistate").last().textContent(), /nichts abgebucht/);
  assert.equal(await two.p.locator(".createpv").count(), 0);
  assert.deepEqual(two.errs, []);
  await two.ctx.close();
});

test("Nur signierter Code vom Server läuft: verändert, falscher Hash, zurückgezogen, fremder Schlüssel, kein Schlüssel", async () => {
  const cases = [
    ["Signatur im Link verändert", { link: (r) => `${r.id}.${r.h}.${r.sig.slice(0, -2)}${r.sig.endsWith("AA") ? "BA" : "AA"}` }, /verändert/],
    ["Code im Antwortkörper verändert (gleicher Hash behauptet)", { serve: (id) => id === REC.verdopplung.id ? { status: 200, body: { ...REC.verdopplung, code: REC.verdopplung.code.replace("Ziel ", "Hallo ") } } : null }, /verändert/],
    ["alte id mit anderem Hash (Server 409)", { link: (r) => `${r.id}.${REC.farbfeld.h}.${r.sig}` }, /gibt es nicht/],
    ["andere Aufnahme unter dieser id ausgeliefert", { serve: (id) => id === REC.verdopplung.id ? { status: 200, body: REC.farbfeld } : null }, /verändert/],
    ["zurückgezogen (410)", { serve: () => ({ status: 410, body: { error: "pulled" } }) }, /entfernt/],
    ["mit fremdem Schlüssel signiert", { rec: record("verdopplung", other) }, /verändert/],
    ["App ohne Schlüssel (fail closed)", { keys: [] }, /verändert/],
  ];
  for (const [name, c, want] of cases) {
    const rec = c.rec || REC.verdopplung;
    const { ctx, p, errs } = await phone({ keys: c.keys, serve: c.serve || (c.rec ? (id) => (id === rec.id ? { status: 200, body: rec } : null) : undefined) });
    const link = c.link ? c.link(rec) : linkOf(rec);
    await p.evaluate((d) => { window.CodeUI.open(d).catch(() => {}); }, { k: "code", c: link, t: "X" });
    await p.waitForFunction(() => { const n = document.querySelector(".cgov .cgnote"); return n && !/geprüft …/.test(n.textContent) && n.textContent; }, null, { timeout: 10000 });
    assert.match(await note(p), want, name);
    assert.equal(await p.locator("iframe[sandbox]").count(), 0, name + ": kein Sandbox-Rahmen, nichts ausgeführt");
    assert.equal(await p.locator(".cgov .cgbtns button", { hasText: "Allein" }).count(), 0, name);
    assert.deepEqual(errs, [], name);
    await ctx.close();
  }
});

// the ghost of a solo game, computed here with the same SDK and code (like the server's runtime): seed, inputs, score
function ghost(name, seed, n) {
  const ctx = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(SDK.selfSource() + "\n" + SDK.wrapGame(FIX.games[name].code), ctx);
  const call = (s) => JSON.parse(vm.runInContext("JSON.stringify(" + s + ")", ctx));
  call(`__H.start(${seed}, {}, 1)`);
  const r = SDK.rngOf(SDK.seedState(seed), seed), log = [];
  let tick = 0;
  for (let i = 0; i < n; i++) {
    if (r.chance(0.3)) { const inp = { seat: 0, t: "swipe", d: "lrud"[r.int(4)] }; log.push([tick, SDK.packInput(inp)]); call(`__H.apply(${JSON.stringify(inp)})`); }
    call('__H.apply({ seat: -1, t: "tick" })'); tick++;
  }
  log.push([tick, "."]);
  let last = 0; const packed = Buffer.from(log.map((e) => { const s = (e[0] - last).toString(36) + ":" + e[1]; last = e[0]; return s; }).join("|")).toString("base64url");
  return { score: call("__H.status()").score[0], packed };
}

test("Duell per Link: Geist wird nachgespielt; nur die echte Punktzahl gilt", async () => {
  const seed = 4242, g = ghost("verdopplung", seed, 400);
  assert.ok(g.score > 0);
  const base = `#cg=${linkOf(REC.verdopplung)}~${seed.toString(36)}~`;
  {
    const { ctx, p, errs } = await phone({ hash: base + g.score + "~" + g.packed });
    await p.waitForFunction(() => { const n = document.querySelector(".cgov .cgnote"); return n && /Schlage|verändert/.test(n.textContent); }, null, { timeout: 15000 });
    assert.match(await note(p), new RegExp("Schlage " + g.score + " Punkte"));
    await shot(p, "code-ghost");
    await press(p, "Los geht");
    await p.waitForFunction(() => window.CodeUI.current() && window.CodeUI.current().status());
    assert.deepEqual(errs, []);
    await ctx.close();
  }
  {
    const { ctx, p } = await phone({ hash: base + (g.score + 100) + "~" + g.packed });
    await p.waitForFunction(() => { const n = document.querySelector(".cgov .cgnote"); return n && /Schlage|verändert/.test(n.textContent); }, null, { timeout: 15000 });
    assert.match(await note(p), /verändert/, "eine erfundene Punktzahl wird nicht geglaubt");
    await ctx.close();
  }
});

// two phones, one in-memory channel (the stand-in for window.Live's WebRTC data channel), messages delayed and shuffled
async function liveMatch(name, until) {
  const A = await phone(), B = await phone();
  const pages = [A.p, B.p];
  let delivered = 0;
  for (const [i, pg] of pages.entries()) {
    await pg.exposeBinding("__relay", async (_src, m) => {
      const to = pages[1 - i];
      setTimeout(() => { delivered++; to.evaluate((x) => window.__onmsg && window.__onmsg(JSON.parse(x)), m).catch(() => {}); }, 15 + Math.floor(Math.random() * 60));
    });
    await pg.evaluate(() => { window.__conn = { send: (m) => window.__relay(JSON.stringify(m)), on: (h) => { window.__onmsg = h; }, onClose: () => {}, close: () => {} }; });
  }
  const link = linkOf(REC[name]);
  await Promise.all(pages.map((pg) => pg.evaluate(() => new Promise((ok) => window.Parts.use("code", ok)))));
  await Promise.all(pages.map((pg, seat) => pg.evaluate(({ link, seat }) => window.CodeUI.playLive(link, window.__conn, seat).then(() => true), { link, seat })));
  await Promise.all(pages.map((pg) => pg.waitForFunction(() => window.CodeUI.current() && window.CodeUI.current().status(), null, { timeout: 15000 })));
  await until(pages);
  const st = await Promise.all(pages.map((pg) => pg.evaluate(() => window.CodeUI.current().status())));
  const h = await Promise.all(pages.map((pg) => pg.evaluate(() => window.CodeUI.current().hash())));
  return { A, B, st, h, delivered };
}

test("Live zu zweit (Zug um Zug): Farbfeld über den Kanal bis zum Ende, beide Seiten gleicher Zustand", async () => {
  const r = await liveMatch("farbfeld", async (pages) => {
    for (let n = 0; n < 200; n++) {
      const st = await pages[0].evaluate(() => window.CodeUI.current().status());
      if (st.over) break;
      const seat = st.turn, pg = pages[seat];
      const mine = await pg.evaluate(() => window.CodeUI.current().status());
      if (mine.turn === seat) {
        const mv = await pg.evaluate((s) => window.CodeUI.current().sandbox.call("moves", s), seat);
        if (mv.length) { const [x, y] = mv[(n * 7) % mv.length].m; await pg.evaluate(({ x, y }) => window.CodeUI.current().input({ t: "tap", x: 18 + x * 54 + 27, y: 150 + y * 54 + 27 }), { x, y }); }
      }
      await pages[0].waitForTimeout(250);
    }
    await Promise.all(pages.map((pg) => pg.waitForFunction(() => window.CodeUI.current().status().over, null, { timeout: 20000 })));
  });
  assert.ok(r.st[0].over && r.st[1].over);
  assert.deepEqual(r.st[0].score, r.st[1].score);
  assert.equal(r.h[0], r.h[1], "gleicher Zustands-Hash auf beiden Geräten");
  assert.ok(r.delivered > 20);
  await shot(r.A.p, "code-live-farbfeld-a"); await shot(r.B.p, "code-live-farbfeld-b");
  assert.deepEqual([...r.A.errs, ...r.B.errs], []);
  await r.A.ctx.close(); await r.B.ctx.close();
});

test("Live zu zweit in Echtzeit (Lockstep): Funkenfang 45 s bis zum Ende, gleicher Hash, kein Auseinanderlaufen", async () => {
  const r = await liveMatch("funkenfang", async (pages) => {
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      const st = await Promise.all(pages.map((pg) => pg.evaluate(() => window.CodeUI.current().status())));
      if (st[0].over && st[1].over) break;
      for (const [seat, pg] of pages.entries()) await pg.evaluate((x) => window.CodeUI.current().input({ t: "tap", x, y: 560 }), 40 + Math.floor(Math.random() * 280));
      await pages[0].waitForTimeout(300);
    }
    await Promise.all(pages.map((pg) => pg.waitForFunction(() => window.CodeUI.current().status().over, null, { timeout: 30000 })));
  });
  assert.deepEqual(r.st[0].score, r.st[1].score);
  assert.equal(r.h[0], r.h[1], "gleicher Zustands-Hash nach 900 Ticks");
  assert.doesNotMatch(await note(r.A.p), /auseinander/);
  await shot(r.A.p, "code-live-funkenfang-a");
  assert.deepEqual([...r.A.errs, ...r.B.errs], []);
  await r.A.ctx.close(); await r.B.ctx.close();
});
