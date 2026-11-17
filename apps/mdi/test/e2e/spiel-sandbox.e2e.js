// Freie Karte 2, P2: Sandbox + Bot-Runner im echten Browser. Host (http://app.test) bettet den Spielrahmen
// (http://spiel.test, sandbox ohne allow-same-origin, CSP ohne Netz) ein; der Spielcode laeuft im Worker des Rahmens.
// 1) alle Referenzspiele bestehen den Bot-Runner, 2) kaputte Module werden sauber abgefangen, 3) Spielmodus: Abschottung,
// Eingabe, Pause bei Sichtbarkeitsverlust, Neustart, Touch-Ziele.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/grund.mjs";
import { buildSpiel, frameCsp } from "../../scripts/spiel/build.mjs";
import { runGame, openSandbox, waitReport, launchBrowser, FRAME, HOST, VIEW } from "../../scripts/spiel/runner.mjs";
import { V } from "../../src/spiel/protokoll.js";

const BEISPIELE = path.join(ROOT, "src/spiel/beispiele"), NEG = path.join(ROOT, "test/fixtures/spiel");
const src = (dir, n) => fs.readFileSync(path.join(dir, n + ".js"), "utf8");
let b, built;
test.before(async () => { b = await launchBrowser(); built = await buildSpiel(); });
test.after(async () => { await b.close(); });

const failedOf = (r) => Object.entries(r.checks).filter(([, c]) => !c.ok).map(([k]) => k);

test("Bot-Runner: alle sechs Referenzspiele bestehen in der Sandbox (60 s simulierte Zeit je Bot)", async (t) => {
  for (const name of ["invaders", "breakout", "snake", "rennen", "asteroids", "plattformer"]) {
    const r = await runGame(b, built, { name, code: src(BEISPIELE, name), seed: "e2e", seconds: 60 });
    t.diagnostic(name + ": ok=" + r.ok + " best(idle/random/greedy)=" + ["idle", "random", "greedy"].map((k) => r.bots[k] && r.bots[k].bestScore).join("/") + " overs=" + JSON.stringify(r.checks.gameOverReachable && r.checks.gameOverReachable.overs) + " wall=" + r.sandbox.wallMs + "ms");
    assert.equal(r.ok, true, name + ": " + JSON.stringify(r.error) + " verletzt " + failedOf(r).join(", "));
    assert.equal(r.checks.noNetwork.attempts.length, 0);
    assert.deepEqual(r.sandbox.pageErrors, []);
  }
});

const NEGATIVE = {
  endlos: (r) => { assert.equal(r.error.code, "watchdog"); assert.match(r.error.message, /Endlosschleife/); },
  fetch: (r) => { assert.equal(r.checks.noNetwork.ok, false); assert.ok(r.checks.noNetwork.attempts.includes("fetch")); },
  exception: (r) => { assert.equal(r.error.code, "exception"); assert.match(r.error.message, /reading 'x'/); },
  parent: (r) => { assert.equal(r.error.code, "exception"); assert.match(r.error.message, /parent is not defined/); },
  speicher: (r) => { assert.equal(r.error.code, "speicher"); },
  zufall: (r) => { assert.match(r.error.message, /g\.random\(\)/); },
  syntax: (r) => { assert.equal(r.error.code, "syntax"); },
  leck: (r) => { assert.ok(!r.checks.deterministic.ok || !r.checks.restartWorks.ok); },
  faelscher: (r) => { assert.equal(r.checks.gameOverReachable.ok, false, "echter Bericht, nicht der gefaelschte"); assert.equal(r.checks.static.ok, false); },
  // Befund 8: verschachtelter Worker / BroadcastChannel gesperrt und gezaehlt, obwohl das Spiel die Fehler verschluckt
  worker: (r) => { assert.equal(r.error, null); assert.equal(r.checks.noNetwork.ok, false); for (const n of ["Worker", "BroadcastChannel"]) assert.ok(r.checks.noNetwork.attempts.includes(n), n); assert.equal(r.checks.static.ok, false); },
  // Befund 8: import("https://…") blockt die CSP, der Verstoss wird gezaehlt, die statische Pruefung meldet ihn
  import: (r) => { assert.equal(r.checks.noNetwork.ok, false); assert.ok(r.checks.noNetwork.attempts.some((a) => /script-src.*example\.org/.test(a)), r.checks.noNetwork.attempts); assert.equal(r.checks.static.ok, false); },
  // Befund 11: Speicherbombe in einem Tick
  "bombe-array": (r) => { assert.equal(r.error.code, "speicher"); assert.match(r.error.message, /Array\.fill/); },
  "bombe-text": (r) => { assert.equal(r.error.code, "speicher"); assert.match(r.error.message, /String\.repeat/); }
};
test("Negativfaelle: kaputte und boesartige Module werden sauber abgefangen, nichts verlaesst den Rahmen", async (t) => {
  for (const [name, expect] of Object.entries(NEGATIVE)) {
    const r = await runGame(b, built, { name, code: src(NEG, name), seed: "neg", seconds: 10 });
    t.diagnostic(name + ": ok=" + r.ok + " fehler=" + (r.error ? r.error.code + " " + r.error.message.slice(0, 70) : "-") + " verletzt=" + failedOf(r).join(","));
    assert.equal(r.ok, false, name);
    expect(r);
    assert.ok(r.checks.noNetwork.attempts.every((a) => !/^(GET|POST) /.test(a)), name + ": keine Anfrage hat das Netz erreicht " + r.checks.noNetwork.attempts);
    assert.deepEqual(r.sandbox.pageErrors, [], name + ": Host-Seite ohne Fehler");
  }
});

test("Spielmodus: opaker Rahmen ohne Netz und ohne Zugriff auf die App; Tastatur wirkt; Pause bei Sichtbarkeitsverlust; Neustart", async () => {
  const { ctx, page, netz, errs } = await openSandbox(b, built, { mode: "play", code: src(BEISPIELE, "invaders"), seed: "spiel" });
  const status = async () => JSON.parse((await page.locator("#status").textContent()) || "null");
  await page.waitForFunction(() => document.getElementById("status").textContent.length > 0);
  assert.deepEqual(JSON.parse(await page.locator("#meta").textContent()), { title: "Segel-Invaders", controls: ["left", "right", "fire"], lives: 3 });
  const fr = page.frames().find((f) => f.url().startsWith(FRAME));
  assert.equal(await fr.evaluate(() => self.origin), "null", "opaker Ursprung");
  assert.equal(await fr.evaluate(() => { try { return typeof parent.document; } catch (e) { return "gesperrt"; } }), "gesperrt", "kein Zugriff auf die App");
  assert.equal(await fr.evaluate(() => fetch("https://example.org/x").then(() => "durch", () => "blockiert")), "blockiert", "CSP connect-src 'none'");
  assert.equal(await fr.evaluate(() => { try { localStorage.setItem("a", "1"); return "frei"; } catch (e) { return "gesperrt"; } }), "gesperrt", "kein Speicher des Ursprungs");

  // Touch-Ziele: nur deklarierte Knoepfe, alle >= 44 px
  const boxes = await fr.evaluate(() => [...document.querySelectorAll("button")].map((x) => { const r = x.getBoundingClientRect(); return [x.getAttribute("aria-label"), Math.round(r.width), Math.round(r.height)]; }));
  assert.deepEqual(boxes.map((x) => x[0]), ["Links", "Rechts", "Ton", "Feuer"]);
  for (const [l, w, h] of boxes) assert.ok(w >= 44 && h >= 44, l + " " + w + "x" + h);

  // Tastatur: Feuer haemmern, bis Punkte kommen
  await fr.locator("canvas").click({ position: { x: 20, y: 300 } });
  const f0 = (await status()).frame;
  for (let i = 0; i < 40 && (await status()).score === 0; i++) { await page.keyboard.press("Space"); await page.keyboard.down("ArrowLeft"); await page.waitForTimeout(60); await page.keyboard.up("ArrowLeft"); }
  const s1 = await status();
  assert.ok(s1.frame > f0, "Frames laufen");
  assert.ok(s1.score > 0, "Eingaben wirken: Punkte " + JSON.stringify(s1));

  // Sichtbarkeitsverlust => Pause, Frames stehen; Tippen => weiter
  await fr.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForFunction(() => JSON.parse(document.getElementById("status").textContent).paused === true);
  const p1 = (await status()).frame; await page.waitForTimeout(700); const p2 = (await status()).frame;
  assert.equal(p2, p1, "pausiert: keine Frames");
  await fr.evaluate(() => { Object.defineProperty(document, "hidden", { value: false, configurable: true }); });
  await fr.locator("canvas").click({ position: { x: 20, y: 300 } });
  await page.waitForFunction((p) => { const s = JSON.parse(document.getElementById("status").textContent); return !s.paused && s.frame > p; }, p2);
  // Host-Befehl Pause
  await page.click("#pause");
  await page.waitForFunction(() => JSON.parse(document.getElementById("status").textContent).paused === true);
  await page.click("#weiter");
  await page.waitForFunction(() => JSON.parse(document.getElementById("status").textContent).paused === false);

  // Spielende abwarten (nichts tun), dann Neustart per Feuer
  await page.waitForFunction(() => JSON.parse(document.getElementById("status").textContent).over === true, null, { timeout: 120000, polling: 250 });
  await fr.locator("canvas").click({ position: { x: 20, y: 300 } });
  await page.waitForFunction(() => { const s = JSON.parse(document.getElementById("status").textContent); return !s.over && s.lives === 3 && s.score === 0; });
  assert.deepEqual(netz, [], "keine Anfrage ausserhalb von Host und Rahmen");
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("Protokoll: ungueltige Nachricht an den Rahmen wird mit Grund abgelehnt; Host nimmt nur Nachrichten seines Rahmens", async () => {
  const { ctx, page } = await openSandbox(b, built, { mode: "play", code: src(BEISPIELE, "snake"), seed: "proto" });
  await page.waitForFunction(() => document.getElementById("status").textContent.length > 0);
  // fremder Absender (das Fenster selbst) wird ignoriert
  await page.evaluate(() => window.postMessage({ v: 1, t: "result", report: { ok: true, checks: {}, bots: {} } }, "*"));
  await page.waitForTimeout(300);
  assert.equal(await page.locator("#bericht").textContent(), "", "gefaelschtes Ergebnis von fremdem Absender ignoriert");
  await page.evaluate(() => document.querySelector("iframe").contentWindow.postMessage({ v: 1, t: "eval", code: "1" }, "*"));
  const r = await waitReport(page, 5000);
  assert.equal(r.error.code, "protokoll");
  assert.match(r.error.message, /unbekannter Typ "eval"/);
  await ctx.close();
});

test("Haertung im echten Worker: Iterator-Prototypen, Date, RegExp, typisierte Arrays und Bindungen lassen sich nicht umbiegen", async () => {
  const r = await runGame(b, built, { name: "weich", code: src(NEG, "weich"), seed: "hart", seconds: 2 });
  assert.equal(r.title, "weich 0", "jeder Versuch scheiterte");
  assert.equal(r.error, null);
});

test("Speicher-Wachstum in einer Schleife: Heap-Grenze, Absturz wird als \"absturz\" gemeldet; der Runner prueft danach weiter", async () => {
  const t0 = Date.now();
  const r = await runGame(b, built, { name: "bombe-wachstum", code: src(NEG, "bombe-wachstum"), seed: "neg", seconds: 10 });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "absturz", JSON.stringify(r.error));
  assert.ok(Date.now() - t0 < 30000, "Absturz sofort erkannt, nicht erst nach der Frist");
  const ok = await runGame(b, built, { name: "snake", code: src(BEISPIELE, "snake"), seed: "e2e", seconds: 60 });
  assert.equal(ok.ok, true, "naechstes Spiel laeuft normal");
});

test("Langsam, aber im Budget: Phasen ohne Bot-Frames (Eingaben, Determinismus, Neustart) loesen keinen Watchdog aus", async (t) => {
  const r = await runGame(b, built, { name: "langsam", code: src(NEG, "langsam"), seed: "lahm", seconds: 2 });
  t.diagnostic("langsam: p95=" + r.checks.performance?.p95Ms + "ms wall=" + r.sandbox.wallMs + "ms verletzt=" + failedOf(r).join(","));
  assert.equal(r.error, null, JSON.stringify(r.error));
  assert.deepEqual(failedOf(r).filter((k) => k !== "performance"), [], "hoechstens das Leistungsbudget darf scheitern");
});

test("Gesamtfrist: Fortschritt verlaengert sie nicht – im Rahmen und im Host", async () => {
  const kurz = await buildSpiel({ fristen: { faktor: 0 } }); // Rahmen-Frist = Ladefenster (3 s)
  const r1 = await runGame(b, kurz, { name: "zaeh", code: src(NEG, "zaeh"), seed: "zaeh", seconds: 60, szenarien: [] });
  assert.equal(r1.error.code, "watchdog"); assert.match(r1.error.message, /Gesamtfrist der Pruefung ueberschritten/);
  const { ctx, page } = await openSandbox(b, built, { mode: "test", code: src(NEG, "zaeh"), seed: "zaeh", seconds: 60, szenarien: [] }, { hostFristen: { faktor: 0, hostZugabeMs: 0 } });
  const r2 = await waitReport(page, 20000);
  assert.equal(r2.error.code, "watchdog"); assert.match(r2.error.message, /Gesamtfrist der Pruefung im Host/);
  await ctx.close();
});

test("CSP: ausgelieferte Kopfzeile des Rahmens == frameCsp() == iframe.csp des Hosts", async () => {
  const { ctx, page, served } = await openSandbox(b, built, { mode: "play", code: src(BEISPIELE, "snake"), seed: "csp" });
  await page.waitForFunction(() => document.getElementById("status").textContent.length > 0);
  const want = frameCsp(FRAME, HOST);
  assert.ok(want.includes("sandbox allow-scripts"));
  const html = served.find((x) => x.path === "frame.html");
  assert.equal(html.headers["Content-Security-Policy"], want);
  assert.equal(await page.locator("iframe").getAttribute("csp"), want);
  await ctx.close();
});

test("Fail closed: ohne oder mit schwaecherer CSP-Kopfzeile laedt der Rahmen nicht und kein Spielcode laeuft", async () => {
  for (const [label, headers] of [["ohne", {}], ["schwaecher", { "Content-Security-Policy": frameCsp(FRAME, HOST).replace("connect-src 'none'", "connect-src *") }]]) {
    const { ctx, page, served, netz } = await openSandbox(b, built, { mode: "test", code: src(BEISPIELE, "snake"), seed: "zu", seconds: 5, szenarien: [] }, { frameHeaders: headers, hostFristen: { faktor: 0, hostZugabeMs: 0 } });
    const r = await waitReport(page, 20000);
    assert.equal(r.ok, false, label);
    assert.equal(r.error.code, "watchdog", label);
    assert.deepEqual(served.map((x) => x.path), ["frame.html"], label + ": frame.js (und damit der Worker) wurde nie geladen");
    assert.deepEqual(netz, [], label);
    await ctx.close();
  }
});

test("Fail closed im Rahmen selbst: ohne Kopfzeile oder nur mit sandbox (direkt geoeffnet) verweigert er mit \"sandbox\", mit Kopfzeile meldet er bereit", async () => {
  const cases = [["ohne", {}, /opaken Ursprung/], ["nur sandbox", { "Content-Security-Policy": "sandbox allow-scripts" }, /CSP des Rahmens fehlt/], ["mit", { "Content-Security-Policy": frameCsp(FRAME, HOST) }, "ready"]];
  for (const [label, headers, want] of cases) {
    const ctx = await b.newContext(VIEW);
    await ctx.route("**/*", (r) => {
      const u = new URL(r.request().url()), f = built.frame[u.pathname.slice(1)];
      return u.origin === FRAME && f ? r.fulfill({ body: f.body, contentType: f.type, headers }) : r.abort("blockedbyclient");
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => { const seen = []; Object.defineProperty(self, "gesehen", { value: seen }); self.addEventListener("message", (e) => seen.push(e.data)); });
    await page.goto(FRAME + "/frame.html");
    await page.waitForFunction(() => self.gesehen.length > 0, null, { timeout: 5000 });
    const [m] = await page.evaluate(() => self.gesehen);
    assert.equal(m.v, V);
    if (want === "ready") assert.equal(m.t, "ready", label + ": " + JSON.stringify(m));
    else { assert.equal(m.t, "error", label); assert.equal(m.code, "sandbox"); assert.match(m.message, want, label); }
    await ctx.close();
  }
});
