// Bot-Runner (Node + Playwright, headless): laedt ein Spielmodul ueber die echte Sandbox (Host-Seite -> opaker Rahmen
// mit CSP -> Worker), laesst die generischen Bots spielen (src/spiel/pruefung.js im Worker) und liefert einen
// JSON-Bericht je Spiel. Ursprung von Host und Rahmen sind erfundene Hosts, die nur per Route existieren; jede andere
// Anfrage wird abgebrochen und als Netzversuch gezaehlt. Dazu die statische Vorpruefung (scripts/harness.js).
import { buildSpiel, frameCsp, hostCsp } from "./build.mjs";
import { checkSpielSource } from "../harness.js";
import { finish } from "../../src/spiel/pruefung.js";
import { API_VERSION } from "../../src/spiel/api.js";

export const HOST = "http://app.test", FRAME = "http://spiel.test";
export const VIEW = { viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, hasTouch: true };

/**
 * Oeffnet Host-Seite und Rahmen mit einem Auftrag.
 * @param {import("playwright").Browser} browser
 * @param {Awaited<ReturnType<typeof buildSpiel>>} built
 * @param {{mode:"play"|"test", code:string, seed:string, lang?:"de"|"en", seconds?:number}} job
 */
export async function openSandbox(browser, built, job) {
  const ctx = await browser.newContext(VIEW);
  const netz = [], errs = [];
  const body = JSON.stringify({ frameUrl: FRAME + "/frame.html", lang: "de", ...job });
  await ctx.route("**/*", (r) => {
    const u = new URL(r.request().url()), file = u.pathname.slice(1);
    if (u.origin === HOST && file === "job.json") return r.fulfill({ body, contentType: "application/json", headers: { "Content-Security-Policy": "default-src 'none'" } });
    if (u.origin === HOST && built.host[file]) return r.fulfill({ body: built.host[file].body, contentType: built.host[file].type, headers: { "Content-Security-Policy": hostCsp(HOST, FRAME) } });
    if (u.origin === FRAME && built.frame[file]) return r.fulfill({ body: built.frame[file].body, contentType: built.frame[file].type, headers: { "Content-Security-Policy": frameCsp(FRAME, HOST), "X-Content-Type-Options": "nosniff" } });
    netz.push(r.request().method() + " " + r.request().url().slice(0, 160));
    return r.abort("blockedbyclient");
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(HOST + "/host.html");
  return { ctx, page, netz, errs };
}

/** Wartet auf den Bericht in #bericht. */
export async function waitReport(page, timeout) {
  await page.waitForFunction(() => document.getElementById("bericht").textContent.length > 0, null, { timeout, polling: 100 });
  return JSON.parse(await page.locator("#bericht").textContent());
}

/**
 * Spielt ein Modul durch die Sandbox und liefert den Bericht.
 * @param {{name:string, code:string, seed?:string, seconds?:number}} g
 */
export async function runGame(browser, built, g) {
  const seed = g.seed || "fk2", seconds = g.seconds || 60;
  const findings = checkSpielSource(g.code);
  const t0 = Date.now();
  const { ctx, page, netz, errs } = await openSandbox(browser, built, { mode: "test", code: g.code, seed, seconds });
  let report;
  try { report = await waitReport(page, 60000 + seconds * 3000); }
  catch (e) { report = { ok: false, error: { code: "watchdog", message: "kein Bericht: " + String(e.message).split("\n")[0] } }; }
  await ctx.close();
  if (!report.checks) report = { api: API_VERSION, title: null, controls: null, seed, seconds, ok: false, error: report.error, checks: {}, bots: {} };
  report.name = g.name;
  const prev = report.checks.noNetwork || { ok: true, attempts: [] };
  report.checks.noNetwork = { ok: prev.ok && netz.length === 0, attempts: [...prev.attempts, ...netz] };
  report.checks.static = { ok: findings.length === 0, findings };
  report.sandbox = { host: HOST, frame: FRAME, pageErrors: errs, wallMs: Date.now() - t0 };
  return finish(report);
}
