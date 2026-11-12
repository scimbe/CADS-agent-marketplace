// Realnetz-Befund 2026-11-11: die echte Bruecke beantwortet Preflights mit Origin "null" ohne CORS-Kopfzeilen; ein
// opaker Rahmen kann /api/play also nicht erreichen. Loesung: der Live-Rahmen liegt auf dem Ursprung der Webkonferenz
// (play-frame.html). Achtung: Playwright-Routing erzwingt kein CORS (abgefangene Anfragen loesen keinen Preflight aus) –
// deshalb hat der fruehere E2E das Problem nicht gesehen. Geprueft wird hier, was der Browser wirklich festlegt:
// Ursprung des Rahmens und der Origin-Kopf jeder /api/play-Anfrage. Das CORS-Verhalten der echten Bruecke prueft
// scripts/probe-bridge.sh (nur lesend, curl).
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { browser, VIEWS, ROOT, act, waitScreen, screen, playVisible } from "./lib/grund.mjs";
import { fakeLive } from "./lib/fakelive.mjs";
import { pickMode } from "./lib/scenarios.mjs";

const WC = "https://webconference.bunsenbrenner.org";
const APP = "https://demos-34a13a96.bunsenbrenner.org/mdi/";   // erlaubter Eltern-Ursprung (Allowlist), im Test geroutet
let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

async function openApp(net, side, hash = "") {
  const ctx = await b.newContext({ ...VIEWS.phone390, locale: "de-DE" });
  ctx.setDefaultTimeout(20000);
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await net.attach(ctx, p, side);
  // Seite und ihre nachladbaren Teile (ADR 0001 Nachtrag 2) wie vom Wrapper
  await ctx.route(APP + "**", (r) => { const m = /\/parts\/([A-Za-z0-9._-]+\.js)$/.exec(new URL(r.request().url()).pathname); return m ? r.fulfill({ path: path.join(ROOT, "dist/parts", m[1]), contentType: "text/javascript" }) : r.fulfill({ path: path.join(ROOT, "dist/index.html"), contentType: "text/html" }); });
  await p.goto(APP + "index.html" + hash);
  await p.locator("header.bar").waitFor();
  return { ctx, p, errs };
}
const linkOf = (p) => p.locator("#linkfield").inputValue().then((u) => u.slice(u.indexOf("#")));

test("https: Live-Rahmen hat den Ursprung der Bruecke, alle /api/play-Anfragen kommen von dort, Partie laeuft durch", async () => {
  const net = fakeLive({ strict: true });
  const A = await openApp(net, "a");
  await act(A.p, "open-bluff"); await pickMode(A.p, "de", "live"); await act(A.p, "go");
  await A.p.locator("#linkfield").waitFor({ state: "attached" });
  const B = await openApp(net, "b", await linkOf(A.p));
  await waitScreen(B.p, "receive-live"); await act(B.p, "accept");
  for (let i = 0; i < 60 && !((await screen(A.p)) === "card-play-over" && (await screen(B.p)) === "card-play-over"); i++) { await playVisible(A.p, 2); await playVisible(B.p, 2); await A.p.waitForTimeout(80); }
  await waitScreen(A.p, "card-play-over"); await waitScreen(B.p, "card-play-over");
  for (const P of [A.p, B.p]) {
    const fr = P.frames().filter((f) => f !== P.mainFrame());
    assert.equal(fr.length, 1);
    assert.equal(await fr[0].evaluate(() => self.origin), WC, "Rahmen-Ursprung = Ursprung der Bruecke");
    assert.equal(fr[0].url(), WC + "/play-frame.html");
    assert.equal(await fr[0].evaluate(() => { try { return typeof parent.document; } catch (e) { return "gesperrt"; } }), "gesperrt", "kein Zugriff auf die App");
    assert.equal(await P.evaluate(() => typeof globalThis.__fakeWs), "undefined", "kein Socket im App-Realm");
  }
  assert.ok(net.wire.origins.length > 5);
  assert.ok(net.wire.origins.every((o) => o === null || o === WC), "Anfragen kommen vom Ursprung der Webkonferenz: " + [...new Set(net.wire.origins)]);
  assert.deepEqual([...A.errs, ...B.errs], []);
});

test("Gegenprobe: der opake Rueckfall-Rahmen (file://) sendet Origin null – an der echten Bruecke ohne CORS (siehe probe-bridge.sh)", async () => {
  const net = fakeLive({ strict: true });
  const { open } = await import("./lib/grund.mjs");
  const A = await open(b, { before: (ctx, p) => net.attach(ctx, p, "a") });
  await act(A.p, "open-bluff"); await pickMode(A.p, "de", "live"); await act(A.p, "go");
  for (let i = 0; i < 100 && !net.wire.origins.length; i++) await A.p.waitForTimeout(50);
  assert.ok(net.wire.origins.length > 0 && net.wire.origins.every((o) => o === "null"), "Rueckfall: Origin null: " + net.wire.origins);
});
