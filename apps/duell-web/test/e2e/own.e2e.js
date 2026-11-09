// The inviter taps their own link (in the chat after sharing it): same browser, same storage. It must never use up the
// one-time token: with the game still open in the tab they land on it, in a fresh tab they read that the link stays
// free. Then a friend in another browser joins with the very same link. Live duel and card table group link.
// Only live.js is replaced, by a broker that burns a token on first use like the bridge does.
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path");
const { chromium, devices } = require("playwright-core");
const G = require("./lib/grund.js");
let page;
// Web route (lib/grund.js): pages here are reloaded or a device opens several pages; under file:// such a page now and then starts with an empty storage of its own.
test.before(async () => { page = await G.webUrl("index.html"); });

const FAKE = `(() => {
  window.__liveOn = true;
  window.__shared = [];
  Object.defineProperty(navigator, "share", { configurable: true, value: async (o) => { window.__shared.push(o.url); } });
  const conns = {}, pend = {};
  function mk(id, ch) {
    const c = { channel: ch, h: null, cl: [], dead: false,
      send: (o) => { if (!c.dead) window.__tbOut(id, JSON.stringify(o)); },
      on: (h) => { c.h = h; }, onClose: (h) => { c.cl.push(h); },
      close: () => { if (c.dead) return; c.dead = true; window.__tbClose(id); c.cl.forEach((f) => f()); } };
    return (conns[id] = c);
  }
  window.__tbIn = (id, s) => { const c = conns[id]; if (c && !c.dead && c.h) c.h(JSON.parse(s)); };
  window.__tbClosed = (id) => { const c = conns[id]; if (c && !c.dead) { c.dead = true; c.cl.forEach((f) => f()); } };
  window.__tbReady = (token, id, ch) => { if (pend[token]) pend[token](mk(id, ch)); };
  window.Live = {
    invite: async () => { const token = await window.__tbInvite(); return { token, expires: Date.now() + 900000, ready: new Promise((ok) => { pend[token] = ok; }) }; },
    accept: async (token) => { const r = await window.__tbAccept(token); if (!r) throw new Error("gone"); return mk(r.id, r.ch); }
  };
})();`;

function broker() {
  const tokens = new Map(), route = new Map(), chain = new Map(), accepts = []; let n = 0;
  const later = (id, f) => { const c = (chain.get(id) || Promise.resolve()).then(f).catch(() => {}); chain.set(id, c); };
  async function wire(p, who) {
    await p.exposeFunction("__tbInvite", () => { const tk = ("K" + (++n)).padEnd(22, "x"); tokens.set(tk, p); return tk; });
    await p.exposeFunction("__tbAccept", (tk) => {
      accepts.push({ who, tk });
      const inv = tokens.get(tk); if (!inv) return null; tokens.delete(tk);   // one-time: the first accept burns it
      const k = ++n, a = "c" + k + "a", b = "c" + k + "b", ch = k.toString(16).padStart(64, "c");
      route.set(a, { page: p, peer: b }); route.set(b, { page: inv, peer: a });
      later(a, () => inv.evaluate(([t, i, c]) => window.__tbReady(t, i, c), [tk, a, ch]));
      return { id: b, ch };
    });
    await p.exposeFunction("__tbOut", (id, s) => { const r = route.get(id); if (r) later(id, () => r.page.evaluate(([i, m]) => window.__tbIn(i, m), [r.peer, s])); });
    await p.exposeFunction("__tbClose", (id) => { const r = route.get(id); if (r) later(id, () => r.page.evaluate((i) => window.__tbClosed(i), r.peer)); });
  }
  return { wire, accepts, free: (tk) => tokens.has(tk) };
}
async function context(b) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }); ctx.setDefaultTimeout(30000);
  await ctx.addInitScript(FAKE); return ctx;
}
async function tab(ctx, br, who) {
  const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await br.wire(p, who); return { p, errs };
}
async function sharedHash(p) {
  await p.waitForFunction(() => window.__shared.length > 0);
  const u = (await p.evaluate(() => window.__shared.slice())).pop();
  return u.slice(u.indexOf("#"));
}

test("eigene Einladung (Live-Duell): der Einladende landet im eigenen Spiel, der Token bleibt frei, der Freund kommt rein", async (t) => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }), br = broker(); t.after(() => b.close());
  const ctxA = await context(b), ctxB = await context(b);
  const A = await tab(ctxA, br, "A");
  await A.p.goto(page); await G.alle(A.p); await A.p.getByRole("button", { name: /^\S+ \d+ Spiele$/ }).click();
  await A.p.getByRole("button", { name: /Ballduell live/ }).click();
  await A.p.getByText("Warte auf deinen Freund").waitFor();
  const hash = await sharedHash(A.p), token = hash.match(/^#live=([A-Za-z0-9_-]{22})/)[1];
  // back from the chat in the same tab: the waiting screen was closed, the own link opens it again
  await A.p.getByRole("button", { name: "Zurück" }).click();
  await A.p.evaluate((h) => { location.hash = h; }, hash);
  await A.p.getByText("Warte auf deinen Freund").waitFor(); await A.p.getByText(/noch \d+:\d\d/).waitFor();
  // the chat opened the link in a new tab of the same browser: no game there, the link stays free
  const A2 = await tab(ctxA, br, "A2");
  await A2.p.goto(page + hash);
  await A2.p.getByText("Das ist deine eigene Einladung – sie bleibt frei für deine Freunde.").waitFor();
  await A2.p.getByRole("button", { name: "Nochmal teilen" }).waitFor(); await A2.p.getByRole("button", { name: "Neu einladen" }).waitFor();
  assert.deepEqual(br.accepts, [], "kein Beitritt vom eigenen Geraet");
  assert.ok(br.free(token), "der Token ist noch frei");
  // a friend on another device with the very same link joins normally
  const B = await tab(ctxB, br, "B");
  await B.p.goto(page + hash);
  await B.p.getByText("Du wirst herausgefordert!").first().waitFor();
  await A.p.getByText("Dein Freund ist da!").waitFor();
  assert.deepEqual(br.accepts.map((x) => x.who), ["B"]);
  assert.equal(await A.p.locator(".livebadge").textContent(), await B.p.locator(".livebadge").textContent());
  // the friend taps the link again during the game: stays in the game, nothing burnt
  await B.p.evaluate((h) => { location.hash = h; }, hash);
  await B.p.waitForTimeout(300);
  assert.equal(await B.p.getByText("Du wirst herausgefordert!").count() > 0, true);
  assert.equal(br.accepts.length, 1);
  for (const x of [A, A2, B]) assert.deepEqual(x.errs, []);
});

test("eigene Einladung (Kartentisch, Gruppenlink): der Einladende bleibt am eigenen Tisch, kein Platz geht verloren, ein Freund setzt sich", async (t) => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }), br = broker(); t.after(() => b.close());
  const ctxA = await context(b), ctxB = await context(b);
  const A = await tab(ctxA, br, "A");
  await A.p.goto(page); await G.alle(A.p); await A.p.getByRole("button", { name: /^\S+ \d+ Spiele$/ }).click();
  await A.p.getByRole("button", { name: /Doppelkopf live/ }).click();
  await A.p.waitForFunction(() => [...document.querySelectorAll(".tbseat")].filter((e) => /eingeladen/.test(e.textContent)).length === 3 && window.__shared.length);
  const hash = await sharedHash(A.p), tokens = hash.split(".").slice(1);
  assert.match(hash, /^#tisch=doko(\.[A-Za-z0-9_-]{22}){3}$/);
  // same tab: the own group link shows the own table, still three seats held
  await A.p.evaluate((h) => { location.hash = h; }, hash);
  await A.p.locator(".tbseat.me").waitFor();
  assert.equal(await A.p.locator(".tbseat", { hasText: "eingeladen" }).count(), 3);
  // a new tab of the same browser: the link stays free
  const A2 = await tab(ctxA, br, "A2");
  await A2.p.goto(page + hash);
  await A2.p.getByText("Das ist deine eigene Einladung – sie bleibt frei für deine Freunde.").waitFor();
  await A2.p.getByRole("button", { name: "Gruppenlink nochmal teilen" }).waitFor(); await A2.p.getByRole("button", { name: "Neuen Tisch decken" }).waitFor();
  assert.deepEqual(br.accepts, [], "kein Platz vom eigenen Geraet genommen");
  assert.ok(tokens.every(br.free), "alle drei Tokens frei");
  // the friend with the same link takes a seat at A's table
  const B = await tab(ctxB, br, "B");
  await B.p.goto(page + hash);
  await B.p.locator(".tbseat.me").waitFor();
  await A.p.waitForFunction(() => [...document.querySelectorAll(".tbseat")].filter((e) => /eingeladen/.test(e.textContent)).length === 2);
  assert.deepEqual(br.accepts.map((x) => x.who), ["B"]);
  // B taps the group link again: back to the table, no second seat
  await B.p.evaluate((h) => { location.hash = h; }, hash);
  await B.p.waitForTimeout(300); await B.p.locator(".tbseat.me").waitFor();
  assert.equal(br.accepts.length, 1);
  for (const x of [A, A2, B]) assert.deepEqual(x.errs, []);
});
