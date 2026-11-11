"use strict";
// No E2E run reaches the live short-link service or the card numbers: loaded with `node --require` (package.json
// test:e2e), it gives every new browser context two routes before the test's own. POST /api/s answers with a made-up
// short link {id,url,token,exp}, the other /api/s calls (picture, delete, resolve) answer like the service would,
// /api/duell/stat answers 204, a vote without cookie "X-Stat: login". Routes a test sets itself win anyway (page before context, newer before older).
// Every answer carries "x-nolive: 1", so a test can show it never came from the live host.
const pw = require("playwright-core");
const C = require("../../../src/core.js");

const ORIGIN = new URL(C.DEFAULT_API).origin;
const ABC = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const fakeId = () => Array.from({ length: 8 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join("");
// CORS as the server's corsFor gives it: no Allow-Credentials, the origin never echoed. A request that carries cookies
// cross-origin (e.g. a beacon) then fails here as it would there.
const head = () => ({ "Access-Control-Allow-Origin": "*", "x-nolive": "1" });

function short(r) {
  const m = r.request().method(), h = head();
  if (m === "POST") {
    const id = fakeId();
    return r.fulfill({ status: 201, headers: h, contentType: "application/json", body: JSON.stringify({ id, url: C.SHORT_BASE + id, token: "nolive-" + id, exp: Date.now() + 90 * 86400000 }) });
  }
  if (m === "GET") return r.fulfill({ status: 404, headers: h, contentType: "application/json", body: "{}" });
  return r.fulfill({ status: 204, headers: h });
}
async function guard(ctx) {
  if (!ctx || ctx._nolive) return ctx;
  ctx._nolive = true;
  // The editor's bubbles (src/blasen-ebene.js) hide the tab bar and the panel; the E2E runs written for the tab bar run in
  // the mode "bubbles hidden" (the brush in the header, remembered per device), which stays a mode of the app. The bubble
  // tests (blasen*.e2e.js) switch them on with an init script of their own, which runs after this one.
  await ctx.addInitScript(() => { try { if (localStorage.getItem("daily.blasen") === null) localStorage.setItem("daily.blasen", "aus"); } catch (e) {} });
  await ctx.route(ORIGIN + "/api/s", short);
  await ctx.route(ORIGIN + "/api/s/**", short);
  // As the server (CADS-DEMO-wrapper #99): a vote without the gate cookie does not count and says so; everything else 204.
  await ctx.route(ORIGIN + "/api/duell/stat", (r) => {
    let e = ""; try { e = JSON.parse(r.request().postData()).e; } catch (x) {}
    if (e === "vote" && !r.request().headers().cookie) return r.fulfill({ status: 202, headers: { ...head(), "Access-Control-Expose-Headers": "X-Stat", "X-Stat": "login" } });
    return r.fulfill({ status: 204, headers: head() });
  });
  return ctx;
}
// Browser.newContext (newPage goes through it) and BrowserType.launchPersistentContext; the Browser class is reached from
// the first browser launched or connected, since playwright-core does not export it.
function wrapBrowser(b) {
  const P = Object.getPrototypeOf(b);
  if (!P._nolive) {
    const nc = P.newContext;
    P.newContext = async function (...a) { return guard(await nc.apply(this, a)); };
    P._nolive = true;
  }
  return b;
}
const BT = Object.getPrototypeOf(pw.chromium);
if (!BT._nolive) {
  BT._nolive = true;
  for (const k of ["launch", "connect", "connectOverCDP"]) {
    const f = BT[k];
    BT[k] = async function (...a) { return wrapBrowser(await f.apply(this, a)); };
  }
  const lp = BT.launchPersistentContext;
  BT.launchPersistentContext = async function (...a) { return guard(await lp.apply(this, a)); };
}
globalThis.__nolive = true;
module.exports = { ORIGIN, guard };
