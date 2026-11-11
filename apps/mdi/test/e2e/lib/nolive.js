"use strict";
// Mit `node --require` geladen (tools/remote/labor-test.sh, npm run test:e2e): jeder neue Browser-Kontext bekommt
// zuerst eine Route, die jede Anfrage ausser file:/data:/blob: abbricht und mitschreibt. Routen, die ein Test selbst
// setzt (z. B. der falsche Live-Server), gewinnen, weil neuere Routen vorgehen. So belegt jeder Lauf: ohne Live
// verlaesst nichts das Geraet.
const pw = require("playwright-core");

async function guard(ctx) {
  if (!ctx || ctx._nolive) return ctx;
  ctx._nolive = true;
  ctx._blocked = [];
  await ctx.route(/^https?:|^wss?:/, (r) => { ctx._blocked.push(r.request().method() + " " + r.request().url()); return r.abort("blockedbyclient"); });
  return ctx;
}
function wrapBrowser(b) {
  const P = Object.getPrototypeOf(b);
  if (!P._nolive) { const nc = P.newContext; P.newContext = async function (...a) { return guard(await nc.apply(this, a)); }; P._nolive = true; }
  return b;
}
for (const bt of [pw.chromium, pw.webkit, pw.firefox]) {
  const BT = Object.getPrototypeOf(bt);
  if (BT._nolive) continue;
  BT._nolive = true;
  for (const k of ["launch", "connect", "connectOverCDP"]) { const f = BT[k]; if (f) BT[k] = async function (...a) { return wrapBrowser(await f.apply(this, a)); }; }
}
globalThis.__nolive = true;
module.exports = { guard };
