// Nur im URL-Modus (MDI_BASE_URL, lib/ziel.mjs): die Ablaeufe, fuer die die anderen Suiten Attrappen nutzen, gegen die
// echten Dienste des Servers (Staging: Wrapper mit Gate-Attrappe und Modell-Double, mdi-greenfield tools/staging).
// Angemeldet ueber MDI_TEST_SESSION (Cookie ct_gate_session). Ohne URL-Modus wird die Datei uebersprungen.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, waitScreen, URL_MODE, BASE, PAGE } from "./lib/grund.mjs";
import { loginCookie } from "./lib/ziel.mjs";
import { pickMode } from "./lib/scenarios.mjs";

const ONLY_URL = URL_MODE ? false : "nur im URL-Modus (MDI_BASE_URL)";
const SESSION = URL_MODE && !process.env.MDI_TEST_SESSION ? "MDI_TEST_SESSION fehlt" : false;
let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });
const backHome = async (p) => { for (let i = 0; i < 5 && (await p.locator('[data-act="back"]').count()); i++) await act(p, "back"); await p.locator("main.h-at-day").waitFor(); };

test("Regal: jede Karte laedt ihren Teil vom Server (SRI im Browser), kein Teil-fehlt, kein fremder Host", { skip: ONLY_URL }, async () => {
  const { ctx, p, errs } = await open(b, {});
  const bad = [];
  p.on("response", (r) => { if (r.url().includes("/parts/") && r.status() >= 400) bad.push(r.status() + " " + new URL(r.url()).pathname); });
  await act(p, "intent-alle"); await p.locator("main.h-at-regal").waitFor();
  const ids = [...new Set(await p.locator('main.h-at-regal [data-act^="open-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-act").slice(5))))];
  assert.ok(ids.length > 0);
  const failed = [];
  for (const id of ids) {
    if (!(await p.locator("main.h-at-regal").count())) { await backHome(p); await act(p, "intent-alle"); await p.locator("main.h-at-regal").waitFor(); }
    const el = p.locator('main.h-at-regal [data-act="open-' + id + '"]').first();
    await el.scrollIntoViewIfNeeded(); await el.click();
    await p.locator("main.s-card-view, main[class*='partfail']").first().waitFor();
    if (!(await p.locator("main.s-card-view").count())) failed.push(id);
    await backHome(p);
  }
  assert.deepEqual(failed, [], failed.length + " von " + ids.length + " Karten ohne Teil; " + bad.slice(0, 3).join(", "));
  assert.deepEqual(errs, []); assert.deepEqual(ctx._blocked || [], []);
  await ctx.close();
});

test("Kurzlink: Teilen legt ihn beim Server an (201), Meins zeigt ihn, Oeffnen fuehrt ueber /s/<id> zur Karte", { skip: ONLY_URL }, async () => {
  const { ctx, p, errs } = await open(b, {});
  const created = p.waitForResponse((r) => new URL(r.url()).pathname === "/api/s" && r.request().method() === "POST"); created.catch(() => {});
  await act(p, "open-gruss"); await pickMode(p, "de", "link"); await act(p, "go"); await waitScreen(p, "card-share");
  const r = await created, j = await r.json();
  assert.equal(r.status(), 201); assert.match(j.url, /\/s\/[2-9a-km-np-zA-HJ-NP-Z]{8}$/);
  await backHome(p); await act(p, "meins"); await act(p, "tab-einladungen");
  assert.match(await p.locator(".h-inv-st").first().innerText(), /Kurzlink/);
  const B = await open(b, {});
  await B.p.goto(BASE + "/s/" + j.id);
  await B.p.waitForURL((u) => u.hash.startsWith("#v2.card."));
  await waitScreen(B.p, "receive-show"); await act(B.p, "accept"); await waitScreen(B.p, "card-view");
  assert.deepEqual([...errs, ...B.errs], []);
  await ctx.close(); await B.ctx.close();
});

test("Konto: Profil mit 16+ wird beim Server angelegt, gespeichert und nach Neuladen ohne Geraetespeicher gelesen", { skip: ONLY_URL || SESSION }, async () => {
  const { ctx, p, errs } = await open(b, { before: (c) => loginCookie(c) });
  await act(p, "stil"); await p.locator('section.konto[data-konto="angemeldet"]').waitFor();
  await p.locator('[data-sync="need16"], [data-sync="ok"]').first().waitFor();
  if (await p.locator('[data-sync="need16"]').count()) { await p.locator("#k-age16").check(); await act(p, "create"); }
  await p.locator('[data-sync="ok"]').waitFor();
  const nick = "Test " + Date.now().toString(36).slice(-4);
  await p.locator("#k-nick").fill(nick);
  const put = p.waitForResponse((r) => new URL(r.url()).pathname === "/api/duell/profile/put"); put.catch(() => {});
  await act(p, "done");
  assert.equal((await put).status(), 200);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.locator("header.bar").waitFor();
  await act(p, "stil"); await p.locator('[data-sync="ok"]').waitFor();
  assert.equal(await p.locator("#k-nick").inputValue(), nick);
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("Freie Karte ueber den echten KI-Weg des Servers: Satz, Vorschau, Uebernehmen, eigene Karte", { skip: ONLY_URL || SESSION }, async () => {
  const { ctx, p, errs } = await open(b, { before: (c) => loginCookie(c) });
  const paths = []; p.on("response", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/duell/")) paths.push(r.status() + " " + u.pathname); });
  await act(p, "frei"); await waitScreen(p, "frei-start");
  await p.locator('[aria-labelledby="lbl-art"] [data-v="card"]').click();
  await p.locator("#frei-text").fill("Geburtstagskarte für meine Freundin, sie liebt Sonnenblumen");
  await act(p, "send");
  await waitScreen(p, "frei-vorschau", 60000);
  await act(p, "take"); await waitScreen(p, "card-view");
  assert.ok(paths.includes("200 /api/duell/ai/accept"), paths.join(", "));
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("Ziel ist der Server, nicht die Datei", { skip: ONLY_URL }, () => { assert.ok(PAGE.startsWith(BASE + "/")); });
