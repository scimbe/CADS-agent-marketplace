// Smoke test of the staging stack in a real browser (Chromium of the Playwright image), against STAGING_URL – the same
// address a person sees through the SSH tunnel. Runs in the container started by host.sh smoke; /app is the built app
// checkout (playwright from its node_modules, manifests for the card kinds). Prints one line per check and a summary;
// screenshots of failures go to $OUT. Exit code 1 if anything failed.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire("/app/package.json");
const { chromium } = require("playwright");
const BASE = process.env.STAGING_URL || "http://127.0.0.1:18794";
const OUT = process.env.OUT || "/tmp";
const PAGE = BASE + (process.env.STAGING_PATH || "/duell");   // /duell = like production; /duell/ resolves the relative parts/ paths under /duell/
const COOKIE = { name: "ct_gate_session", value: "staging-lea", domain: new URL(BASE).hostname, path: "/" };
const res = [];
const t0 = Date.now();
const log = (ok, name, info = "") => { res.push({ ok, name, info }); console.log((ok === null ? "SKIP " : ok ? "PASS " : "FAIL ") + name + (info ? " – " + info : "")); };
const act = (p, id) => p.locator('[data-act="' + id + '"]').first().click();
const screen = (p) => p.locator("main").getAttribute("class").then((c) => (c || "").split(" ").find((x) => x.startsWith("s-"))?.slice(2) || "");
const shot = async (p, name) => { try { await p.screenshot({ path: path.join(OUT, name.replace(/[^a-z0-9-]+/gi, "_") + ".png") }); } catch { /* page gone */ } };

const b = await chromium.launch();
async function open({ hash = "", login = false, view = { width: 390, height: 844 } } = {}) {
  const ctx = await b.newContext({ viewport: view, deviceScaleFactor: 1, locale: "de-DE", serviceWorkers: "block" });
  ctx.setDefaultTimeout(20000);
  if (login) await ctx.addCookies([COOKIE]);
  const p = await ctx.newPage(), errs = [], net = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/status of (401|403|404|409|422|429)/.test(m.text())) errs.push("console " + m.text().slice(0, 200)); });
  p.on("response", (r) => { const u = new URL(r.url()); if (u.origin === BASE) net.push(r.status() + " " + r.request().method() + " " + u.pathname); else net.push("EXT " + u.origin); });
  await p.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error("CSP " + e.violatedDirective + " " + e.blockedURI)));
  await p.goto(PAGE + hash);
  return { ctx, p, errs, net };
}
const backHome = async (p) => { for (let i = 0; i < 5 && (await p.locator('[data-act="back"]').count()); i++) await act(p, "back"); await p.locator("main.h-at-day").waitFor(); };

// ---- 1. start page with the daily leaf
{
  const { ctx, p, errs } = await open();
  try {
    await p.locator(".h-leaf").waitFor(); await p.locator(".h-go").waitFor();
    const day = (await p.locator(".h-dnum").textContent()).trim();
    log(errs.length === 0, "Startseite mit Tagesblatt", "Tag " + day + (errs.length ? " | " + errs.join("; ") : ""));
  } catch (e) { log(false, "Startseite mit Tagesblatt", e.message.split("\n")[0]); await shot(p, "start"); }
  await ctx.close();
}

// ---- 2. every card on the shelf opens (its part loads and passes SRI; otherwise the app shows teil-fehlt/teil-manipuliert)
let shelf = [];
{
  const { ctx, p, errs, net } = await open();
  await p.locator(".h-leaf").waitFor();
  await act(p, "intent-alle"); await p.locator("main.h-at-regal").waitFor();
  shelf = [...new Set(await p.locator('main.h-at-regal [data-act^="open-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-act").slice(5))))];
  console.log("Regal: " + shelf.length + " Karten");
  let ok = 0; const bad = [];
  for (const id of shelf) {
    try {
      if (!(await p.locator("main.h-at-regal").count())) { await backHome(p); await act(p, "intent-alle"); await p.locator("main.h-at-regal").waitFor(); }
      const el = p.locator('main.h-at-regal [data-act="open-' + id + '"]').first();
      await el.scrollIntoViewIfNeeded(); await el.click();
      await p.locator("main.s-card-view, main.s-partfail, main[class*='partfail']").first().waitFor();
      const s = await screen(p);
      const stage = await p.locator("#stage .frame, #stage canvas, #stage .stack").count();
      if (s === "card-view" && stage > 0) ok++; else { bad.push(id + ":" + s + (stage ? "" : ":ohne-vorschau")); await shot(p, "regal-" + id); }
    } catch (e) { bad.push(id + ":" + e.message.split("\n")[0].slice(0, 80)); await shot(p, "regal-" + id); }
    try { await backHome(p); } catch { await p.goto(PAGE); await p.locator(".h-leaf").waitFor(); }
  }
  const parts = net.filter((x) => x.includes("/parts/"));
  const partsBad = parts.filter((x) => !x.startsWith("200 ") && !x.startsWith("304 "));
  log(ok === shelf.length && shelf.length > 0, "Regalkarten oeffnen (" + ok + "/" + shelf.length + ")", bad.join(", "));
  log(partsBad.length === 0, "Teile geladen (" + parts.length + " Anfragen, " + partsBad.length + " Fehler)", partsBad.slice(0, 5).join(", "));
  log(errs.length === 0, "Regal ohne Seitenfehler", errs.slice(0, 5).join("; "));
  log(!net.some((x) => x.startsWith("EXT")), "Regal ohne fremden Host", [...new Set(net.filter((x) => x.startsWith("EXT")))].join(", "));
  await ctx.close();
}

// ---- 3. one link per card kind as a round trip: sender makes the link, a second browser opens it and accepts
const man = (id) => { try { return JSON.parse(fs.readFileSync("/app/src/cards/" + id + "/manifest.json", "utf8")); } catch { return null; } };
const kinds = {};
for (const id of shelf) { const m = man(id); if (m) (kinds[m.kind] = kinds[m.kind] || []).push(id); }
const PREFER = { card: "gruss", turn: "bluff", realtime: "flug", sound: "strassenrap-beat", photo: "foto-alien", quest: "kanal-geheim" };
for (const kind of Object.keys(kinds).sort()) {
  const id = kinds[kind].includes(PREFER[kind]) ? PREFER[kind] : kinds[kind][0];
  const A = await open(); let B = null;
  try {
    await act(A.p, "open-" + id); await A.p.locator("main.s-card-view").waitFor();
    const radio = A.p.getByRole("radio", { name: "Abwechselnd per Link", exact: true });
    if (await radio.count()) await radio.click();
    await act(A.p, "go");
    let link = "";
    for (let i = 0; i < 120 && !link; i++) {
      if (await A.p.locator("#linkfield").count()) { const u = await A.p.locator("#linkfield").inputValue(); link = u.slice(u.indexOf("#")); break; }
      const s = await screen(A.p);
      if (s === "card-play-cover") await act(A.p, "cover-ok");
      else if (s === "card-play-turn") {
        // like playVisible of the app tests, plus the steps of p-karten.e2e.js (Strang P): empty answer fields are filled
        // like a person (250 ms each, the draft is taken after 150 ms), then the card's own "go" step (data-act=go-step,
        // kanal-geheim "weiter", strassenrap-beat "Beat-Link teilen") moves on; otherwise the last option of the choice
        const empty = A.p.locator("main input[type=text]:not([readonly]):visible, main textarea:not([readonly]):visible");
        for (let k = 0; k < (await empty.count()); k++) if (!(await empty.nth(k).inputValue())) { await empty.nth(k).fill("staging"); await A.p.waitForTimeout(250); }
        if (await A.p.locator("[data-act=go-step]").count()) await A.p.locator("[data-act=go-step]").first().click();
        else if (await A.p.locator(".choice .opt").count()) await A.p.locator(".choice .opt").last().click();
        else await A.p.waitForTimeout(500);
      } else await A.p.waitForTimeout(500);
    }
    if (!link) throw new Error("kein Link (Bildschirm " + (await screen(A.p)) + ")");
    B = await open({ hash: link });
    await B.p.locator("main.s-receive-show, main.s-receive-reject, main.s-receive-live").first().waitFor();
    const rs = await screen(B.p);
    if (rs !== "receive-show") throw new Error("Empfang: " + rs + " " + ((await B.p.locator("[data-reason]").getAttribute("data-reason").catch(() => "")) || ""));
    await act(B.p, "accept");
    await B.p.waitForFunction(() => /\bs-(card-view|card-play-[a-z-]+|card-rt[a-z-]*)\b/.test(document.querySelector("main").className), null, { timeout: 20000 });
    log(A.errs.length + B.errs.length === 0, "Link-Rundreise " + kind + " (" + id + ")", link.slice(0, 18) + "… -> " + (await screen(B.p)) + ([...A.errs, ...B.errs].length ? " | " + [...A.errs, ...B.errs].join("; ") : ""));
  } catch (e) { log(false, "Link-Rundreise " + kind + " (" + id + ")", e.message.split("\n")[0].slice(0, 160)); await shot(A.p, "link-" + kind + "-a"); if (B) await shot(B.p, "link-" + kind + "-b"); }
  await A.ctx.close(); if (B) await B.ctx.close();
}

// ---- 4. short link: sharing a card archives it under Meins, the app asks the server for a short link; opening it leads back
let shortUrl = "";
{
  const { ctx, p, errs } = await open();
  try {
    const created = p.waitForResponse((r) => new URL(r.url()).pathname === "/api/s" && r.request().method() === "POST", { timeout: 20000 }); created.catch(() => {});
    await act(p, "open-gruss"); await p.locator("main.s-card-view").waitFor();
    const radio = p.getByRole("radio", { name: "Abwechselnd per Link", exact: true }); if (await radio.count()) await radio.click();
    await act(p, "go"); await p.locator("main.s-card-share").waitFor();
    const r = await created, j = await r.json().catch(() => ({}));
    shortUrl = j.url || "";
    log(r.status() === 201 && /\/s\/[2-9a-km-np-zA-HJ-NP-Z]{8}$/.test(shortUrl), "Kurzlink angelegt", r.status() + " " + shortUrl);
    // Profil "Meins": the sent card is on the wall, the invite carries the short link
    await backHome(p);
    await act(p, "meins"); await p.locator(".h-work .frame").first().waitFor();
    await act(p, "tab-einladungen"); await p.locator(".h-inv").first().waitFor();
    const st = (await p.locator(".h-inv-st").first().innerText()).replace(/\s+/g, " ");
    const html = await p.locator(".h-inv").first().innerText();
    log(errs.length === 0, "Meins: Wand und Einladungen", "Status: " + st + (html.includes(shortUrl.split("/s/")[1] || "@@") ? " | Kurzlink sichtbar" : "") + (errs.length ? " | " + errs.join("; ") : ""));
  } catch (e) { log(false, "Kurzlink anlegen / Meins", e.message.split("\n")[0].slice(0, 160)); await shot(p, "kurzlink"); }
  await ctx.close();
}
if (shortUrl) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: "de-DE" }), p = await ctx.newPage();
  try {
    await p.goto(shortUrl.replace(/^https?:\/\/[^/]+/, BASE));
    await p.waitForURL(/\/duell#v2\.card\./, { timeout: 20000 }).catch(async () => { const a = p.locator('a[href*="/duell#v2."]').first(); if (await a.count()) await a.click(); await p.waitForURL(/\/duell/); });
    await p.locator("main.s-receive-show").waitFor();
    log(true, "Kurzlink oeffnen", "-> " + (await screen(p)));
  } catch (e) { log(false, "Kurzlink oeffnen", e.message.split("\n")[0].slice(0, 160) + " @ " + p.url()); await shot(p, "kurzlink-oeffnen"); }
  await ctx.close();
}

// ---- 5. account (gate double cookie): profile with 16+ saved on the server and read back
{
  const { ctx, p, errs, net } = await open({ login: true });
  try {
    await p.locator("header.bar").waitFor();
    await act(p, "stil"); await p.locator("main.s-stil-start").waitFor();
    await p.locator('section.konto[data-konto="angemeldet"]').waitFor();
    // signed in without a profile: nothing is created silently; 16+ (own statement) and "create" make it
    await p.locator('[data-sync="need16"], [data-sync="ok"]').first().waitFor();
    if (await p.locator('[data-sync="need16"]').count()) { await p.locator("#k-age16").check(); await act(p, "create"); }
    await p.locator('[data-sync="ok"]').waitFor();
    await p.locator("#k-nick").fill("Staging Lea");
    await act(p, "done"); await p.locator("main.s-shelf, main.h-at-day").first().waitFor();
    await p.waitForTimeout(1500);
    const puts = net.filter((x) => x.includes("/api/duell/profile/put"));
    await p.evaluate(() => localStorage.clear()); await p.reload(); await p.locator("header.bar").waitFor();
    await act(p, "stil"); await p.locator('[data-sync="ok"]').waitFor();
    const nick = await p.locator("#k-nick").inputValue();
    log(nick === "Staging Lea" && errs.length === 0, "Profil mit Konto (Gate-Attrappe) gespeichert und vom Server gelesen", "puts: " + puts.join(",") + " | nick: " + nick + (errs.length ? " | " + errs.join("; ") : ""));
  } catch (e) { log(false, "Profil mit Konto", e.message.split("\n")[0].slice(0, 160)); await shot(p, "profil"); }
  await ctx.close();
}

// ---- 6. free card with the model double (logged in, 16+ from step 5)
{
  const { ctx, p, errs, net } = await open({ login: true });
  try {
    await p.locator("header.bar").waitFor();
    await act(p, "frei"); await p.locator("main.s-frei-start").waitFor();
    await p.locator('[aria-labelledby="lbl-art"] [data-v="card"]').click();
    await p.locator("#frei-text").fill("Geburtstagskarte für meine Freundin, sie liebt Sonnenblumen");
    await act(p, "send");
    await p.locator("main.s-frei-vorschau").waitFor({ timeout: 60000 });
    await act(p, "take"); await p.locator("main.s-card-view").waitFor();
    const txt = await p.locator(".frame").first().innerText();
    log(/Staging-Karte/i.test(txt) && errs.length === 0, "Freie Karte mit Modell-Double", "Karte: " + txt.replace(/\s+/g, " ").slice(0, 60) + " | " + net.filter((x) => /\/api\/duell\/(ai|queue)/.test(x)).join(","));
  } catch (e) { log(false, "Freie Karte mit Modell-Double", e.message.split("\n")[0].slice(0, 160) + " | " + net.filter((x) => /\/api\/duell\//.test(x)).slice(-6).join(",")); await shot(p, "frei"); }
  await ctx.close();
}

// ---- 7. live between two pages: the broker is the web conference (webconference.bunsenbrenner.org), not part of the
// wrapper. Over http://127.0.0.1 the app uses its local frame (parts/live-frame.*.html, served by no route of the wrapper),
// over https the production frame, whose frame-ancestors only allow the production origins. Not run against production.
log(null, "Live zwischen zwei Seiten", "nicht ausgefuehrt: Broker nicht im Wrapper, siehe Protokoll");

await b.close();
const fail = res.filter((r) => r.ok === false), skip = res.filter((r) => r.ok === null);
console.log(`\nSUMMARY pass=${res.length - fail.length - skip.length} fail=${fail.length} skip=${skip.length} dauer=${Math.round((Date.now() - t0) / 1000)}s regal=${shelf.length}`);
fs.writeFileSync(path.join(OUT, "smoke.json"), JSON.stringify({ at: new Date().toISOString(), base: BASE, res }, null, 2));
process.exit(fail.length ? 1 : 0);
