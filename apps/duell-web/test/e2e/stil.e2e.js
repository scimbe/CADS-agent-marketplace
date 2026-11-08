"use strict";
// "Mein Stil" (src/stil.js, part stil; the account card from src/profile.js, part konto): the live preview follows every
// choice, the choices are radio groups (keyboard, names, 44 px), the account card in both states against a small gate
// stub (cookie after /auth/login, as test/e2e/profile.e2e.js), the shelf uses the width without a strip of the page
// behind it from 320 to 1280 px and at 150/200 % zoom, and axe finds nothing in either state.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const DIST = path.join(__dirname, "../../dist/index.html"), BIZ = path.join(__dirname, "../../dist/business");
const PARTS = path.join(__dirname, "../../dist/parts");
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const SEED = { me: { nick: "Mira", emoji: "🦖", colors: ["#ffd400", "#ff3b1d"], set: "tiere" } };

function gate() {
  const db = new Map(), log = [], bodies = [], conf = { cancel: false };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x"), json = (s, b) => res.writeHead(s, { "Content-Type": "application/json" }).end(JSON.stringify(b));
    if (u.pathname === "/duell") return res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(fs.readFileSync(DIST, "utf8").replace("connect-src ", "connect-src 'self' "));
    if (u.pathname.startsWith("/duell/parts/")) return res.writeHead(200, { "Content-Type": "text/javascript" }).end(fs.readFileSync(path.join(PARTS, path.basename(u.pathname))));
    if (u.pathname === "/duell/business/") return res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(fs.readFileSync(path.join(BIZ, "index.html"), "utf8").replace("connect-src ", "connect-src 'self' "));
    if (u.pathname.startsWith("/duell/business/parts/")) return res.writeHead(200, { "Content-Type": "text/javascript" }).end(fs.readFileSync(path.join(BIZ, "parts", path.basename(u.pathname))));
    // cancel: the sign-in page that is never finished (no cookie, no way back but the browser's)
    if (u.pathname === "/auth/login" && conf.cancel) { log.push("login"); return res.writeHead(200, { "Content-Type": "text/html" }).end("<h1>Anmeldung</h1>"); }
    if (u.pathname === "/auth/login") return res.writeHead(302, { "Set-Cookie": "ct_gate_session=t1; Path=/; HttpOnly; SameSite=Lax", Location: u.searchParams.get("return") || "/" }).end();
    const m = u.pathname.match(/^\/api\/duell\/profile\/(get|put|delete)$/);
    if (!m) return json(503, { error: "off" });
    let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
      const b = JSON.parse(raw), rec = db.get("acc"); log.push(m[1]); bodies.push(b);
      if (!/ct_gate_session=t1/.test(req.headers.cookie || "")) return json(401, { error: "login-required" });
      if (m[1] === "get") return json(200, rec ? { profile: rec.p, rev: rec.rev } : { profile: null, rev: 0 });
      if (m[1] === "delete") { db.delete("acc"); return json(200, { deleted: true }); }
      if (b.rev !== (rec ? rec.rev : 0)) return json(409, { error: "stale" });
      if (!rec && b.age16 !== true) return json(403, { error: "age16" });
      db.set("acc", { rev: b.rev + 1, p: { v: 1, ...b.profile } }); json(200, { rev: b.rev + 1 });
    });
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ db, log, bodies, conf, base: "http://127.0.0.1:" + srv.address().port, close: () => { srv.close(); srv.closeAllConnections(); } })));
}

let browser, srv;
test.before(async () => { browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); srv = await gate(); });
test.after(async () => { await browser.close(); srv.close(); });

// zoom: CSS px shrink by the factor, the device pixels stay (what the browser's zoom does to a page)
async function open({ w = 390, h = 844, zoom = 1, lang = "de", seed = SEED, login = false, fs: size, dark = false, page = "/duell" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: Math.round(w / zoom), height: Math.round(h / zoom) }, deviceScaleFactor: zoom, locale: lang === "de" ? "de-DE" : "en-GB", colorScheme: dark ? "dark" : "light" });
  if (login) await ctx.addCookies([{ name: "ct_gate_session", value: "t1", url: srv.base }]);
  await ctx.addInitScript(([api, seed]) => { window.DUELL_API = api; if (!localStorage.getItem("daily.v1")) localStorage.setItem("daily.v1", JSON.stringify(seed)); }, [srv.base + "/api/duell/config", { ...seed, ...(size ? { fs: size } : {}) }]);
  const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(srv.base + page); await p.locator("#go").waitFor();
  if (lang === "en" && (await p.evaluate(() => window.Kit.lang)) !== "en") await p.locator("#lang").click();
  await p.locator("#me").click(); await p.locator("#acbox").waitFor();
  return { ctx, p, errs, store: () => p.evaluate(() => JSON.parse(localStorage.getItem("daily.v1") || "{}")) };
}
const pv = (p) => p.evaluate(() => { const v = document.querySelector(".stpv"), s = getComputedStyle(v);
  return { bg: s.backgroundColor, bar: getComputedStyle(v.querySelector(".stbar")).backgroundColor, em: v.querySelector(".stem").textContent, nm: v.querySelector(".stnm").textContent, sk: Array.from(v.querySelectorAll(".stsk")).map((x) => x.textContent).join(""), label: v.getAttribute("aria-label") }; });
const group = (p, name) => p.getByRole("radiogroup", { name });

test("Vorschau: Name, Emoji, Farben, eigene Farbe, Sticker und Ueberrasch mich aendern sie sofort; Radiogruppen mit Tastatur, Namen und 48 px", async () => {
  const { ctx, p, errs, store } = await open();
  await p.getByRole("heading", { name: "So sehen deine Karten aus" }).waitFor();
  let v = await pv(p);
  assert.deepEqual([v.em, v.nm, v.bg, v.bar, v.sk], ["🦖", "Mira", "rgb(255, 212, 0)", "rgb(255, 59, 29)", "🐸🦆🐙🦝"]);
  assert.match(v.label, /^Vorschau: Mira, 🦖, Farben (Gelb und Rot|Farbpaar 1), Sticker Tiere$/);
  // name: a placeholder and a note on where it shows; the preview follows while typing
  const f = p.getByRole("textbox", { name: "Spitzname" });
  assert.equal(await f.getAttribute("placeholder"), "z. B. Oma Gisela");
  assert.match(await p.locator("#" + (await f.getAttribute("aria-describedby"))).textContent(), /^Steht nur auf deinen Karten und in Links/);
  await f.fill("Oma Gisela"); assert.equal((await pv(p)).nm, "Oma Gisela");
  await f.fill(""); assert.equal((await pv(p)).nm, "Dein Name", "leer: ein Platzhalter, keine leere Karte");
  await f.fill("Gisela");
  // emoji: six at first plus "Mehr", one tab stop, arrows choose
  const emo = group(p, "Dein Emoji");
  assert.equal(await emo.getByRole("radio").count(), 6);
  assert.equal(await emo.getByRole("radio", { checked: true }).textContent(), "🦖");
  assert.equal(await emo.locator("[tabindex='0']").count(), 1, "eine Tabulator-Station je Gruppe");
  await emo.getByRole("radio", { checked: true }).focus(); await p.keyboard.press("ArrowRight");
  const now = await emo.getByRole("radio", { checked: true }).textContent();
  assert.notEqual(now, "🦖"); assert.equal(await p.evaluate(() => document.activeElement.textContent), now, "der Fokus geht mit");
  assert.equal((await pv(p)).em, now); assert.equal(await p.locator("#me").textContent(), now);
  const more = p.getByRole("button", { name: "Mehr" });
  assert.equal(await more.getAttribute("aria-expanded"), "false");
  await more.click(); assert.equal(await emo.getByRole("radio").count(), 12); assert.equal(await p.getByRole("button", { name: "Zuklappen" }).getAttribute("aria-expanded"), "true");
  await emo.getByRole("radio", { name: "🐝" }).click(); assert.equal((await pv(p)).em, "🐝");
  await p.getByRole("button", { name: "Zuklappen" }).click(); assert.equal(await emo.getByRole("radio").count(), 7, "der gewaehlte bleibt sichtbar");
  // colours: names instead of codes (the part direkt brings them), 48 px
  const col = group(p, "Deine Farben");
  await p.waitForFunction(() => !!window.EditModel);
  const names = await col.getByRole("radio").evaluateAll((xs) => xs.map((x) => x.getAttribute("aria-label")));
  assert.equal(names.length, 8); assert.ok(names.every((n) => / und /.test(n) && !/#/.test(n)), names.join("; "));
  await col.getByRole("radio").nth(1).click();
  v = await pv(p); assert.deepEqual([v.bg, v.bar], ["rgb(43, 75, 255)", "rgb(255, 230, 0)"]);
  assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--a").trim()), "#2b4bff");
  // own colour: behind "Eigene Farbe …", labelled fields
  await p.getByText("Eigene Farbe …").click();
  await p.getByLabel("Hintergrund").evaluate((e) => { e.value = "#0f766e"; e.dispatchEvent(new Event("input", { bubbles: true })); });
  assert.equal((await pv(p)).bg, "rgb(15, 118, 110)"); assert.equal(await col.getByRole("radio", { checked: true }).count(), 0, "kein Paar mehr gewaehlt");
  // stickers: each set with three of its stickers
  const sets = group(p, "Deine Sticker");
  assert.equal(await sets.getByRole("radio").count(), 7);
  await sets.getByRole("radio", { name: "Weltall" }).click(); assert.equal((await pv(p)).sk, "🚀🛸👽🪐");
  // "Überrasch mich" belongs to the preview and says what it did
  const before = JSON.stringify((await store()).me);
  await p.getByRole("button", { name: "Überrasch mich" }).click();
  const s = (await store()).me; v = await pv(p);
  assert.notEqual(JSON.stringify(s), before); assert.equal(s.nick, "Gisela", "der Name bleibt");
  assert.equal(v.em, s.emoji); assert.equal(await emo.getByRole("radio", { checked: true }).textContent(), s.emoji);
  assert.equal(await sets.getByRole("radio", { checked: true }).getAttribute("aria-label"), { tiere: "Tiere", essen: "Essen", weltall: "Weltall", chaos: "Chaos", grusel: "Grusel", herz: "Herz", advent: "Advent" }[s.set]);
  assert.match(await p.locator("#stlive").textContent(), new RegExp("^Neu: " + s.emoji + ", Farben .+ und .+, Sticker "));
  // every choice at least 48 px, the dice and the account button too
  const small = await p.locator("#shbody [role=radio], #stdice, .stmore, .acgo, #ac16").evaluateAll((xs) => xs.filter((x) => x.offsetParent).map((x) => { const r = x.getBoundingClientRect(); return [x.textContent || x.getAttribute("aria-label") || x.id, Math.round(r.width), Math.round(r.height)]; }).filter((r) => r[0] !== "ac16" ? r[1] < 44 || r[2] < 44 : false));
  assert.deepEqual(small, []);
  const box = await p.locator("label.accheck").boundingBox(); assert.ok(box.height >= 44, "16+ als 44-px-Zeile");
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("Konto-Karte abgemeldet (de/en): drei Vorteile, 16+ vor dem Knopf, ohne Druck; Unter 16 fuehrt zum Geraete-Code; nichts geht vor einem Tipp raus", async () => {
  for (const lang of ["de", "en"]) {
    const n = srv.log.length, { ctx, p, errs } = await open({ lang });
    const card = p.locator("#acbox");
    const T = lang === "de"
      ? { h: "Konto (freiwillig)", b: ["Deine Karten auf allen Geräten (ohne Fotos)", "Deine KI-Versuche gelten auf jedem Gerät", "Über Karten abstimmen"], need: "Bitte zuerst bestätigen: Ich bin 16 oder älter.", go: "Anmelden oder Konto anlegen", ok: "Geht auch ohne. Dann bleibt alles nur auf diesem Gerät.", u16: "Unter 16? Mit einem Geräte-Code geht es ohne Konto.", code: "Code von deinem anderen Gerät", age: "Ich bin 16 oder älter." }
      : { h: "Account (optional)", b: ["Your cards on every device (no photos)", "Your AI tries count on every device", "Vote on cards"], need: "Please confirm first: I am 16 or older.", go: "Sign in or create an account", ok: "Works without, too. Then everything stays on this device only.", u16: "Under 16? A device code works without an account.", code: "Code from your other device", age: "I am 16 or older." };
    assert.equal(await p.getByRole("region", { name: T.h }).count(), 1, "die Karte ist eine benannte Region");
    assert.deepEqual(await card.locator(".acwhy li").allTextContents(), T.b);
    assert.equal(await card.locator(".acwhy svg[aria-hidden=true]").count(), 3, "Strich-Icons statt Emoji");
    assert.doesNotMatch(await card.innerText(), /[\u{1F300}-\u{1FAFF}]/u, "kein Emoji in der Karte");
    const go = card.getByRole("button", { name: T.go });
    // the main button never looks locked: a tap without the tick says why (alert) and puts the focus on the tick; nothing goes out
    assert.equal(await go.isDisabled(), false);
    // outlined as in the canvas (Share): clearly there, not louder than "Überrasch mich"
    const st = (sel) => p.locator(sel).evaluate((b) => { const s = getComputedStyle(b), r = b.getBoundingClientRect(); return { bg: s.backgroundColor, fg: s.color, border: s.borderTopWidth + " " + s.borderTopStyle, size: parseFloat(s.fontSize), weight: +s.fontWeight, h: Math.round(r.height), shadow: s.boxShadow }; });
    const g = await st("#acbox .acgo"), d = await st("#stdice");
    assert.deepEqual([g.bg, g.fg, g.border, g.shadow], ["rgb(255, 255, 255)", "rgb(23, 20, 15)", "2px solid", "none"], "umrandet, kein voller Tintenknopf");
    assert.ok(g.size <= d.size && g.weight <= d.weight && g.h <= d.h && g.bg === d.bg, "nicht lauter als Ueberrasch mich: " + JSON.stringify([g, d]));
    const url = p.url(); await go.click();
    await card.getByRole("alert").filter({ hasText: T.need }).waitFor();
    // a second tap says it again (the text is emptied and set anew, so screen readers announce it)
    const again = await p.evaluate(() => new Promise((ok) => { const a = document.querySelector("#acbox .acneed"), seen = [];
      new MutationObserver(() => seen.push(a.textContent)).observe(a, { childList: true, characterData: true, subtree: true });
      document.querySelector("#acbox .acgo").click(); setTimeout(() => ok(seen), 400); }));
    assert.deepEqual([again[0], again[again.length - 1]], ["", T.need], "erneut angesagt: " + JSON.stringify(again));
    assert.equal(await p.evaluate(() => document.activeElement.id), "ac16", "Fokus auf dem Haken");
    assert.equal(p.url(), url, "ohne Haken kein Sprung zur Anmeldung");
    assert.equal(await p.locator("#" + (await go.getAttribute("aria-describedby"))).textContent(), lang === "de" ? "Anmeldung über unseren Anmeldedienst (bunsenbrenner.org)." : "Sign-in via our sign-in service (bunsenbrenner.org).", "sagt, wohin es geht und was das ist");
    await card.getByText(T.ok).waitFor();
    // no pressure: nothing counts down, nothing is pre-ticked, the card sits below the preview
    assert.equal(await p.getByLabel(T.age).isChecked(), false);
    assert.doesNotMatch(await card.innerText(), /nur noch|jetzt sofort|letzte Chance|only today|last chance|!/i);
    const y = await p.evaluate(() => [document.querySelector(".stpvw").getBoundingClientRect().bottom, document.getElementById("acbox").getBoundingClientRect().top]);
    assert.ok(y[0] <= y[1], "Vorschau zuerst, dann das Konto");
    // under 16: the link opens "Konto & Daten" and puts the cursor into the code field
    assert.equal(await p.locator("#stdata").evaluate((d) => d.open), false);
    await card.getByRole("button", { name: T.u16 }).click();
    assert.equal(await p.locator("#stdata").evaluate((d) => d.open), true);
    assert.equal(await p.evaluate(() => document.activeElement.getAttribute("aria-label")), T.code);
    await p.getByLabel(T.age).check(); assert.equal(await card.locator(".acneed[role=alert]").textContent(), "", "der Hinweis geht mit dem Haken");
    assert.equal(srv.log.length, n, "Oeffnen und Lesen schickt nichts");
    assert.deepEqual(errs, [], lang); await ctx.close();
  }
});

test("Konto-Karte angemeldet: Anmelden ueber das Gate, zurueck steht kompakt ✓ Angemeldet mit Name und Uhrzeit; Details und Abmelden unter Konto & Daten", async () => {
  const { ctx, p, errs, store } = await open();
  await p.getByLabel("Ich bin 16 oder älter.").check();
  await Promise.all([p.waitForURL(srv.base + "/duell"), p.locator("#acbox").getByRole("button", { name: "Anmelden oder Konto anlegen" }).click()]);
  await p.locator("#go").waitFor();
  for (let i = 0; i < 80 && !srv.db.get("acc"); i++) await p.waitForTimeout(100);
  assert.equal(srv.db.get("acc").p.me.nick, "Mira");
  await p.locator("#me").click();
  const card = p.locator("#acbox");
  await card.getByText("Angemeldet als 🦖 Mira").waitFor();
  await card.getByText(/^Gesichert um \d\d:\d\d\.$/).waitFor();
  assert.equal(await card.getByRole("status").count(), 1, "der Stand wird angesagt");
  assert.equal(await card.getByRole("button").count(), 0, "kompakt: keine Knoepfe in der Karte");
  // details only in "Konto & Daten", no "abgleichen"/"Trennen" anywhere
  assert.doesNotMatch(await p.locator("#shbody").innerText(), /abgleich|Trennen|Sync/i);
  const data = p.locator("#stdata"); await data.locator("summary").click();
  await data.getByText("Angemeldet mit deinem Konto bei bunsenbrenner.org.").waitFor();
  await data.getByRole("button", { name: "Jetzt sichern" }).click();
  await card.getByText(/^Gesichert um /).waitFor();
  // a change saves by itself
  await p.getByRole("textbox", { name: "Spitzname" }).fill("Kiwi");
  for (let i = 0; i < 60 && srv.db.get("acc").p.me.nick !== "Kiwi"; i++) await p.waitForTimeout(100);
  assert.equal(srv.db.get("acc").p.me.nick, "Kiwi", "gesichert ohne Knopf");
  // honest: the button says what it does; the gate's sign-in stays (no logout link off bunsenbrenner.org)
  assert.doesNotMatch(await p.locator("#shbody").innerText(), /Abmelden \(|Sichern, Abmelden/);
  await data.getByText("Bei bunsenbrenner.org bleibst du dabei angemeldet.").waitFor();
  assert.equal(await data.getByRole("link", { name: "Auch bei bunsenbrenner.org abmelden" }).count(), 0, "kein Gate-Link ausserhalb von bunsenbrenner.org");
  await data.getByRole("button", { name: "Auf diesem Gerät nicht mehr sichern" }).click();
  await card.getByRole("button", { name: "Anmelden oder Konto anlegen" }).waitFor();
  const s = await store(); assert.equal(s.profile, undefined); assert.equal(s.me.nick, "Kiwi", "alles bleibt auf dem Geraet");
  assert.ok((await ctx.cookies(srv.base)).some((c) => c.name === "ct_gate_session"), "das Gate-Cookie bleibt, wie der Text sagt");
  assert.deepEqual(errs, []);
  srv.db.delete("acc"); await ctx.close();
});

test("Layout: Mein Stil nutzt die Breite ohne Streifen dahinter, 320–1280 px und Zoom 150/200 %, auch mit sehr grosser Schrift", async () => {
  const cases = [[320, 640, 1], [390, 844, 1], [820, 1180, 1], [1024, 768, 1], [1280, 800, 1], [1280, 800, 1.5], [1280, 800, 2], [820, 1180, 2], [390, 844, 1.5], [390, 844, 1, "sg"]];
  for (const [w, h, zoom, size] of cases) {
    const { ctx, p, errs } = await open({ w, h, zoom, fs: size }), tag = w + "@" + zoom * 100 + "%" + (size ? " " + size : "");
    const r = await p.evaluate(() => {
      const vw = document.documentElement.clientWidth, sh = document.getElementById("shelf").getBoundingClientRect(), b = document.getElementById("shbody"), s = document.querySelector(".stil").getBoundingClientRect();
      const out = Array.from(b.querySelectorAll("*")).filter((x) => x.offsetParent && !x.closest("details:not([open])")).filter((x) => { const q = x.getBoundingClientRect(); return q.right > vw + 1 || q.left < -1; }).map((x) => x.className || x.tagName).slice(0, 3);
      const pv = document.querySelector(".stpvw").getBoundingClientRect(), nick = document.getElementById("stnick").getBoundingClientRect();
      return { vw, shL: sh.left, shR: sh.right, scroll: b.scrollWidth - b.clientWidth, out, l: s.left, r: vw - s.right, two: pv.right <= nick.left && pv.top < nick.bottom };
    });
    assert.equal(r.shL, 0, tag + ": links kein Streifen"); assert.equal(Math.round(r.shR), r.vw, tag + ": rechts kein Streifen");
    assert.ok(r.scroll <= 0, tag + ": kein seitliches Scrollen " + r.scroll); assert.deepEqual(r.out, [], tag + ": nichts ragt hinaus");
    assert.ok(Math.abs(r.l - r.r) <= 2, tag + ": Spalte mittig " + r.l + "/" + r.r);
    assert.equal(r.two, r.vw >= 900, tag + ": zwei Spalten erst ab 900 CSS-px");
    assert.deepEqual(errs, [], tag); await ctx.close();
  }
});

test("axe: Mein Stil ohne Verstoesse, abgemeldet und angemeldet, mit offenen Abschnitten (de/en)", async () => {
  const RULES = { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } };
  for (const [lang, login] of [["de", false], ["en", false], ["de", true]]) {
    const seed = login ? { ...SEED, profile: { via: "account", rev: 0, base: null, age16: true, t0: Date.now() } } : SEED;
    const { ctx, p, errs } = await open({ lang, login, seed });
    if (login) await p.locator("#acbox .acstate").filter({ hasText: /\d\d:\d\d/ }).waitFor();
    await p.locator(".stmore").click();
    await p.evaluate(() => document.querySelectorAll("#shbody details").forEach((d) => { d.open = true; }));
    await p.addScriptTag({ content: AXE });
    const v = await p.evaluate((o) => window.axe.run(document.getElementById("shelf"), o).then((r) => ({ n: r.passes.length, bad: r.violations.map((x) => x.id + ": " + x.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")) })), RULES);
    assert.ok(v.n > 20, "axe hat wirklich geprueft: " + v.n); assert.deepEqual(v.bad, [], lang + (login ? " angemeldet" : ""));
    assert.deepEqual(errs, []); await ctx.close();
  }
  for (const k of [...srv.db.keys()]) srv.db.delete(k);
});

// P7 (Gisela, iPad at 200 %): the font size stands right under the preview, before the account, and is in view without scrolling.
test("Schrift direkt unter der Vorschau: bei 200 % ohne Scrollen sichtbar, vor der Konto-Karte, und sie wirkt sofort", async () => {
  for (const [w, h, lang] of [[810, 1080, "de"], [1280, 800, "de"], [810, 1080, "en"]]) {
    const { ctx, p, errs } = await open({ w, h, zoom: 2, lang }), tag = w + "@200% " + lang;
    const g = group(p, lang === "de" ? "Schrift" : "Text size");
    assert.deepEqual(await g.getByRole("radio").allTextContents(), lang === "de" ? ["Normal", "Groß", "Sehr groß"] : ["Normal", "Large", "Extra large"], tag);
    const r = await p.evaluate(() => {
      const b = document.getElementById("shbody"), fs = document.querySelector(".stfs").getBoundingClientRect(), pv = document.querySelector(".stpvw").getBoundingClientRect(), ac = document.getElementById("acbox").getBoundingClientRect();
      return { top: b.scrollTop, bottom: fs.bottom, vh: innerHeight, after: fs.top >= pv.bottom - 1, before: fs.bottom <= ac.top + 1 };
    });
    assert.equal(r.top, 0, tag + ": nicht gescrollt");
    assert.ok(r.bottom <= r.vh, tag + ": ganz im Bild " + r.bottom + " > " + r.vh);
    assert.ok(r.after && r.before, tag + ": zwischen Vorschau und Konto");
    if (lang === "de" && w === 810) {
      const f0 = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector("#acbox .note")).fontSize));
      await g.getByRole("radio", { name: "Sehr groß" }).click();
      assert.ok(await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector("#acbox .note")).fontSize)) > f0, "die Schrift wird groesser");
      assert.equal(await g.getByRole("radio", { checked: true }).textContent(), "Sehr groß");
      assert.equal(await p.locator(".stread").getByRole("radiogroup").count(), 0, "unter Lesen & Bedienen nur noch Einfache Sprache");
    }
    assert.deepEqual(errs, [], tag); await ctx.close();
  }
});

test("Abgebrochene Anmeldung: kein ✓ Angemeldet, sondern Weiter/Abbrechen; der 16+-Haken muss neu gesetzt werden; ein alter Versuch geht nie mit", async () => {
  srv.conf.cancel = true; const b0 = srv.bodies.length;
  try {
    const { ctx, p, errs, store } = await open();
    await p.getByLabel("Ich bin 16 oder älter.").check();
    await Promise.all([p.waitForURL(/\/auth\/login/), p.locator("#acbox .acgo").click()]);
    await p.goBack(); await p.locator("#go").waitFor(); await p.waitForTimeout(1500);   // the start sync runs (and gets 401)
    await p.locator("#me").click();
    const card = p.locator("#acbox");
    await card.getByText("Anmeldung nicht abgeschlossen. Du bist noch nicht angemeldet.").waitFor();
    assert.doesNotMatch(await card.innerText(), /Angemeldet als|Gesichert um/);
    assert.equal(await p.getByLabel("Ich bin 16 oder älter.").isChecked(), false, "der Haken von vorhin gilt nicht");
    const weiter = card.getByRole("button", { name: "Weiter" });
    await weiter.click(); await card.getByRole("alert").filter({ hasText: "Bitte zuerst bestätigen" }).waitFor();
    assert.ok(!srv.bodies.slice(b0).some((b) => b.age16), "nichts mit 16+ geschrieben");
    await card.getByRole("button", { name: "Abbrechen" }).click();
    await card.getByRole("button", { name: "Anmelden oder Konto anlegen" }).waitFor();
    assert.equal((await store()).profile, undefined, "Abbrechen raeumt den Versuch weg");
    assert.deepEqual(errs, []); await ctx.close();
    // an attempt older than 30 minutes: dropped at start, its 16+ statement never travels, also not with a cookie
    const n = srv.log.length, old = await open({ login: true, seed: { ...SEED, profile: { via: "account", rev: 0, base: null, age16: true, t0: Date.now() - 31 * 60000 } } });
    await old.p.locator("#acbox .acgo").waitFor(); await old.p.waitForTimeout(1200);
    assert.equal((await old.store()).profile, undefined);
    assert.deepEqual(srv.log.slice(n), [], "kein Request aus einem alten Versuch");
    assert.equal(srv.db.get("acc"), undefined);
    await old.ctx.close();
  } finally { srv.conf.cancel = false; }
});

test("Business: nur Vorteile und Zeilen, die es dort gibt (keine Abstimmung, keine Statistik)", async () => {
  const { ctx, p, errs } = await open({ page: "/duell/business/" });
  const card = p.locator("#acbox");
  assert.deepEqual(await card.locator(".acwhy li").allTextContents(), ["Deine Karten auf allen Geräten (ohne Fotos)", "Deine KI-Versuche gelten auf jedem Gerät"]);
  const all = await p.locator("#shbody").innerText();
  assert.doesNotMatch(all, /abstimm|Statistik/i);
  assert.equal(await p.locator("#stdata summary small").textContent(), "Sichern, Lizenzen");
  assert.equal(await p.locator("button.statoff").count(), 0);
  assert.deepEqual(errs, []); await ctx.close();
});

test("Business im Dark Mode: axe ohne Verstoesse, Kartenueberschrift in Tinte (Kontrast >= 4,5:1)", async () => {
  const { ctx, p, errs } = await open({ page: "/duell/business/", dark: true });
  const c = await p.locator("#achead").evaluate((e) => { const L = (s) => { const v = s.match(/\d+/g).slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const a = L(getComputedStyle(e).color), b = L(getComputedStyle(document.getElementById("acbox")).backgroundColor); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); });
  assert.ok(c >= 4.5, "Kontrast #achead " + c);
  await p.locator("#stdata summary").click(); await p.locator(".stmore").click();
  await p.addScriptTag({ content: AXE });
  const v = await p.evaluate(() => window.axe.run(document.getElementById("shelf"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }).then((r) => r.violations.map((x) => x.id + ": " + x.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | "))));
  assert.deepEqual(v, []); assert.deepEqual(errs, []); await ctx.close();
});

test("Dark Mode: das leere 16+-Kaestchen sieht leer aus, angehakt dunkel; axe ohne Verstoesse", async () => {
  const { ctx, p, errs } = await open({ dark: true });
  const cb = p.locator("#ac16");
  const centre = async () => { const png = (await cb.screenshot()).toString("base64");
    return p.evaluate((src) => new Promise((ok) => { const i = new Image(); i.onload = () => { const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const x = c.getContext("2d"); x.drawImage(i, 0, 0);
      const d = x.getImageData(0, 0, i.width, i.height).data; let t = 0; for (let k = 0; k < d.length; k += 4) t += (d[k] + d[k + 1] + d[k + 2]) / 3; ok(t / (d.length / 4)); }; i.src = "data:image/png;base64," + src; }), png); };
  assert.equal(await cb.evaluate((e) => getComputedStyle(e).colorScheme), "light");
  const off = await centre(); assert.ok(off > 190, "leer = hell (Mittel aller Pixel): " + off);
  await cb.check(); const on = await centre(); assert.ok(on < 120 && off - on > 90, "angehakt = dunkel: " + on);
  await p.addScriptTag({ content: AXE });
  const v = await p.evaluate(() => window.axe.run(document.getElementById("shelf"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }).then((r) => r.violations.map((x) => x.id)));
  assert.deepEqual(v, []); assert.deepEqual(errs, []); await ctx.close();
});

test("Bewegung reduziert: die Vorschau springt nicht", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "de-DE", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript(([api, seed]) => { window.DUELL_API = api; localStorage.setItem("daily.v1", JSON.stringify(seed)); }, [srv.base + "/api/duell/config", SEED]);
  await p.goto(srv.base + "/duell"); await p.locator("#me").click(); await p.locator("#acbox").waitFor();
  await p.getByRole("button", { name: "Überrasch mich" }).click();
  assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector(".stpv .stem")).animationName), "none");
  await ctx.close();
});
