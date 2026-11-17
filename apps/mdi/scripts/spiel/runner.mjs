// Bot-Runner (Node + Playwright, headless): laedt ein Spielmodul ueber die echte Sandbox (Host-Seite -> opaker Rahmen
// mit CSP -> Worker), laesst die generischen Bots spielen (src/spiel/pruefung.js im Worker) und liefert einen
// JSON-Bericht je Spiel. Ursprung von Host und Rahmen sind erfundene Hosts, die nur per Route existieren; jede andere
// Anfrage wird abgebrochen und als Netzversuch gezaehlt. Dazu die statische Vorpruefung (scripts/harness.js).
//
// Entscheidung: runGame ist die einzige Stelle, deren Ergebnis ueber Abnahme (und spaeter Guthaben) entscheidet. Der
// Bericht aus Rahmen/Worker ist eine Eingabe, kein Urteil: runGame traegt Netzversuche aus der Route, die statische
// Pruefung und Abstuerze selbst nach, und ohne Bericht (Frist, Absturz) ist das Ergebnis immer ok=false (fail closed).
// Ein Bericht, den ein Browser-Host in der App sieht, entscheidet nie etwas.
import { chromium } from "playwright";
import { buildSpiel, frameCsp, hostCsp } from "./build.mjs";
import { checkSpielSource } from "../harness.js";
import { finish } from "../../src/spiel/pruefung.js";
import { API_VERSION } from "../../src/spiel/api.js";
import { hostFristMs } from "../../src/spiel/fristen.js";

export const HOST = "http://app.test", FRAME = "http://spiel.test";
export const VIEW = { viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, hasTouch: true };
/** Heap-Grenze je JS-Isolat im Sandbox-Browser: eine Speicherbombe ohne Massen-Operation (Wachstum in einer Schleife)
 * sprengt den Renderer schnell, statt den Server zu fuellen; runGame erkennt den Absturz und meldet "absturz". */
export const HEAP_MB = 256;
/** Zeit nach der Host-Frist, bis der Runner selbst aufgibt (Host und Rahmen melden vorher mit Grund). */
export const RUNNER_ZUGABE_MS = 5000;

/** Startet den Browser fuer die Sandbox (Heap-Grenze, optional PW_CHROME). */
export function launchBrowser() {
  return chromium.launch({ executablePath: process.env.PW_CHROME || undefined, args: ["--js-flags=--max-old-space-size=" + HEAP_MB] });
}

/**
 * Oeffnet Host-Seite und Rahmen mit einem Auftrag.
 * @param {import("playwright").Browser} browser
 * @param {Awaited<ReturnType<typeof buildSpiel>>} built
 * @param {{mode:"play"|"test", code:string, seed:string, lang?:"de"|"en", seconds?:number, szenarien?:object[]}} job
 * @param {{frameHeaders?: Record<string, string>, hostFristen?: object, view?: object}} [opt] nur fuer Tests: andere Kopfzeilen des
 *   Rahmens (fail-closed-Pruefung) und kuerzere Host-Fristen; view: Playwright-Kontext (Standard VIEW; P3-Fotos mit deviceScaleFactor 1)
 * @returns {Promise<{ctx: any, page: any, netz: string[], errs: string[], served: Array<{path: string, headers: Record<string, string>}>, crashed: Promise<string>}>}
 */
export async function openSandbox(browser, built, job, opt = {}) {
  const ctx = await browser.newContext(opt.view || VIEW);
  const netz = [], errs = [], served = [];
  const frameHeaders = opt.frameHeaders || { "Content-Security-Policy": frameCsp(FRAME, HOST), "X-Content-Type-Options": "nosniff" };
  const body = JSON.stringify({ frameUrl: FRAME + "/frame.html", lang: "de", fristen: opt.hostFristen || {}, ...job });
  await ctx.route("**/*", (r) => {
    const u = new URL(r.request().url()), file = u.pathname.slice(1);
    if (u.origin === HOST && file === "job.json") return r.fulfill({ body, contentType: "application/json", headers: { "Content-Security-Policy": "default-src 'none'" } });
    if (u.origin === HOST && built.host[file]) return r.fulfill({ body: built.host[file].body, contentType: built.host[file].type, headers: { "Content-Security-Policy": hostCsp(HOST, FRAME) } });
    if (u.origin === FRAME && built.frame[file]) { served.push({ path: file, headers: frameHeaders }); return r.fulfill({ body: built.frame[file].body, contentType: built.frame[file].type, headers: frameHeaders }); }
    netz.push(r.request().method() + " " + r.request().url().slice(0, 160));
    return r.abort("blockedbyclient");
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  // Rahmen und Host teilen sich hier einen Renderer-Prozess: stuerzt er ab (Heap-Grenze), gibt es keinen Bericht mehr
  const crashed = new Promise((res) => page.once("crash", () => res("Sandbox-Prozess abgestuerzt – vermutlich Speicher ueber der Heap-Grenze von " + HEAP_MB + " MB")));
  await page.goto(HOST + "/host.html");
  return { ctx, page, netz, errs, served, crashed };
}

/** Wartet auf den Bericht in #bericht. */
export async function waitReport(page, timeout) {
  await page.waitForFunction(() => document.getElementById("bericht").textContent.length > 0, null, { timeout, polling: 100 });
  return JSON.parse(await page.locator("#bericht").textContent());
}

/**
 * Spielt ein Modul durch die Sandbox und liefert den Bericht.
 * @param {{name:string, code:string, seed?:string, seconds?:number, szenarien?:object[]}} g  szenarien: Szenario-Bots je
 *   Haekchen-Punkt (src/spiel/szenario.js); ohne Angabe keine (der Bericht hat dann szenarien: [])
 */
export async function runGame(browser, built, g) {
  const seed = g.seed || "fk2", seconds = g.seconds || 60, szenarien = g.szenarien || [];
  const findings = checkSpielSource(g.code);
  const t0 = Date.now();
  const { ctx, page, netz, errs, crashed } = await openSandbox(browser, built, { mode: "test", code: g.code, seed, seconds, szenarien });
  const crash = crashed.then((message) => ({ ok: false, error: { code: "absturz", message } }));
  // Bleibt der Bericht aus, ist das Ergebnis immer ok=false: Absturz, sonst Frist. (Ein Absturz laesst waitReport erst
  // spaeter scheitern; darum kurz auf das crash-Ereignis warten, bevor "watchdog" gemeldet wird.)
  const noReport = (e) => Promise.race([crash, new Promise((res) => setTimeout(res, 1000)).then(() => ({ ok: false, error: { code: "watchdog", message: "kein Bericht: " + String(e.message).split("\n")[0] } }))]);
  const waiting = waitReport(page, hostFristMs(seconds) + RUNNER_ZUGABE_MS).catch(noReport);
  let report = await Promise.race([waiting, crash]);
  await ctx.close();
  await waiting;
  if (!report.checks) report = { api: API_VERSION, title: null, controls: null, seed, seconds, ok: false, error: report.error, checks: {}, bots: {}, szenarien: [] };
  report.name = g.name;
  const prev = report.checks.noNetwork || { ok: true, attempts: [] };
  report.checks.noNetwork = { ok: prev.ok && netz.length === 0, attempts: [...prev.attempts, ...netz] };
  report.checks.static = { ok: findings.length === 0, findings };
  report.sandbox = { host: HOST, frame: FRAME, pageErrors: errs, wallMs: Date.now() - t0 };
  return finish(report);
}
