// Freie Karte 2, P2: Sandbox + Bot-Runner im echten Browser. Host (http://app.test) bettet den Spielrahmen
// (http://spiel.test, sandbox ohne allow-same-origin, CSP ohne Netz) ein; der Spielcode laeuft im Worker des Rahmens.
// 1) alle Referenzspiele bestehen den Bot-Runner, 2) kaputte Module werden sauber abgefangen, 3) Spielmodus: Abschottung,
// Eingabe, Pause bei Sichtbarkeitsverlust, Neustart, Touch-Ziele.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { browser, ROOT } from "./lib/grund.mjs";
import { buildSpiel } from "../../scripts/spiel/build.mjs";
import { runGame, openSandbox, waitReport, FRAME } from "../../scripts/spiel/runner.mjs";

const BEISPIELE = path.join(ROOT, "src/spiel/beispiele"), NEG = path.join(ROOT, "test/fixtures/spiel");
const src = (dir, n) => fs.readFileSync(path.join(dir, n + ".js"), "utf8");
let b, built;
test.before(async () => { b = await browser(); built = await buildSpiel(); });
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
  faelscher: (r) => { assert.equal(r.checks.gameOverReachable.ok, false, "echter Bericht, nicht der gefaelschte"); assert.equal(r.checks.static.ok, false); }
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
