"use strict";
// No E2E run reaches the live short-link service or the card numbers: loaded with `node --require` (package.json
// test:e2e), it gives every new browser context two routes before the test's own. POST /api/s answers with a made-up
// short link {id,url,token,exp}, the other /api/s calls (picture, delete, resolve) answer like the service would,
// /api/duell/stat answers 204. Routes a test sets itself win anyway (page before context, newer before older).
// Every answer carries "x-nolive: 1", so a test can show it never came from the live host.
const pw = require("playwright-core");
const C = require("../../../src/core.js");

const ORIGIN = new URL(C.DEFAULT_API).origin;
const ABC = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const fakeId = () => Array.from({ length: 8 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join("");
// Beacons go with credentials: the origin is echoed, not "*".
const head = (r) => ({ "Access-Control-Allow-Origin": r.request().headers().origin || "*", "Access-Control-Allow-Credentials": "true", "x-nolive": "1" });

function short(r) {
  const m = r.request().method(), h = head(r);
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
  await ctx.route(ORIGIN + "/api/s", short);
  await ctx.route(ORIGIN + "/api/s/**", short);
  await ctx.route(ORIGIN + "/api/duell/stat", (r) => r.fulfill({ status: 204, headers: head(r) }));
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
